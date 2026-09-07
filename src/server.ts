import "./lib/error-capture";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/* ------------------------------------------------------------------ */
/* Self-hosted REST API — the server's IP *is* the API (Jellyfin-style). */
/* Reachable at http://<server-ip>:9119/api/v1/... over the local network.  */
/* ------------------------------------------------------------------ */

const API_PREFIX = "/api/v1";
/** The allowed browser/app origin for cross-origin (CORS) requests. */
const APP_ORIGIN =
  process.env.SMARTBUDGET_APP_ORIGIN || "https://budget.smarthomeskc.me";

const SESSION_COOKIE = "smartbudget_session";

function cookieHeaderValue(token: string, maxAgeSec: number): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    `Path=/`,
    `Max-Age=${maxAgeSec}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  // Secure only when serving over https (behind the tunnel / production).
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;
}

function readSessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin / non-browser clients
  const allowed = new Set([APP_ORIGIN, APP_ORIGIN.replace(/\/$/, "")]);
  const url = new URL(APP_ORIGIN);
  if (url.hostname === "budget.smarthomeskc.me") {
    allowed.add(url.origin);
  }
  return allowed.has(origin);
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowed = originAllowed(request);
  return {
    "access-control-allow-origin": allowed && origin ? origin : "",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
  };
}

function apiJson(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

/** Client IP, best-effort (for rate limiting). */
function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0]?.trim() || request.headers.get("cf-connecting-ip") || "unknown";
}

/** Authenticate via the session cookie (payload carries { username, homes }). */
async function apiAuthenticateSession(
  request: Request,
): Promise<{ username: string; homes: string[] } | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  try {
    const { resolveSessionServer } = await import("./lib/server-db");
    return resolveSessionServer(token);
  } catch {
    return null;
  }
}

/** Authenticate via an `Authorization: Basic` header (NOT URL params). */
async function apiAuthenticateBasic(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("basic ")) return null;
  let username = "";
  let password = "";
  try {
    const decoded = atob(auth.slice(6).trim());
    const i = decoded.indexOf(":");
    if (i < 0) return null;
    username = decoded.slice(0, i);
    password = decoded.slice(i + 1);
  } catch {
    return null;
  }
  if (!username || !password) return null;
  try {
    const { verifyUserServer } = await import("./lib/server-db");
    const res = verifyUserServer(username, password);
    return res.ok && res.user ? res.user.username : null;
  } catch {
    return null;
  }
}

/** Reject requests that smuggle credentials in the URL query string. */
function urlCarriesCredentials(url: URL): boolean {
  const p = url.searchParams;
  return p.has("username") || p.has("password") || p.has("passwd");
}

async function handleApi(request: Request, url: URL): Promise<Response> {
  const path = url.pathname === API_PREFIX ? "/" : url.pathname.slice(API_PREFIX.length);
  const cors = corsHeaders(request);

  if (!originAllowed(request)) {
    return apiJson({ ok: false, error: "Origin not allowed." }, 403, cors);
  }

  // CORS preflight.
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // Global per-IP rate limit (simple, in-process).
  try {
    const { ipRateLimited } = await import("./lib/server-db");
    if (ipRateLimited(clientIp(request), 300, 60_000)) {
      return apiJson({ ok: false, error: "Too many requests." }, 429, cors);
    }
  } catch {}

  // POST /api/v1/auth — verify username+password, issue a session cookie.
  if (path === "/auth" && request.method === "POST") {
    let body: any = {};
    try {
      body = await request.json();
    } catch {}
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const { verifyUserServer, isAccountLocked, recordLoginFailure, clearLoginFailures } =
      await import("./lib/server-db");

    if (isAccountLocked(username)) {
      return apiJson(
        { ok: false, error: "Account temporarily locked. Try again later.", locked: true },
        429,
        cors,
      );
    }

    const res = verifyUserServer(username, password);
    if (!res.ok || !res.user) {
      recordLoginFailure(username);
      return apiJson({ ok: false, error: "Invalid username or password." }, 401, cors);
    }
    clearLoginFailures(username);

    const homes = res.user.homes ?? [res.user.homeId ?? "home-default"];
    const { createSessionServer } = await import("./lib/server-db");
    const session = createSessionServer(res.user.username, homes);
    const headers = {
      ...cors,
      "set-cookie": cookieHeaderValue(session.token, Math.round(session.expiresAt / 1000) - Math.round(Date.now() / 1000)),
    };
    return apiJson({ ok: true, user: res.user, expiresAt: session.expiresAt }, 200, headers);
  }

  // POST /api/v1/logout — revoke the session cookie.
  if (path === "/logout" && request.method === "POST") {
    const token = readSessionToken(request);
    if (token) {
      const { revokeSessionServer } = await import("./lib/server-db");
      revokeSessionServer(token);
    }
    return apiJson({ ok: true }, 200, { ...cors, "set-cookie": clearCookieHeader() });
  }

  // Unauthenticated service endpoints.
  if (path === "/health" && request.method === "GET") {
    return apiJson(
      {
        ok: true,
        app: "smartbudget",
        service: "self-hosted-api",
        time: new Date().toISOString(),
      },
      200,
      cors,
    );
  }

  if (path === "/" && request.method === "GET") {
    return apiJson(
      {
        ok: true,
        app: "smartbudget",
        endpoints: [
          { method: "GET", path: "/api/v1/health", auth: false, desc: "Liveness check" },
          { method: "POST", path: "/api/v1/auth", auth: false, desc: "Log in with { username, password } — sets an HttpOnly session cookie" },
          { method: "POST", path: "/api/v1/logout", auth: true, desc: "Revoke the current session cookie" },
          { method: "GET", path: "/api/v1/data?homeId=...", auth: true, desc: "Full budget snapshot (home must be in your homes)" },
          { method: "POST", path: "/api/v1/data", auth: true, desc: "Save a budget snapshot: { homeId, db }" },
          { method: "GET", path: "/api/v1/homes", auth: true, desc: "List homes you belong to" },
          { method: "GET", path: "/api/v1/users", auth: true, desc: "List registered users" },
        ],
        auth: "Session cookie (set by POST /auth) or `Authorization: Basic` header. Passwords are NEVER accepted in the URL.",
      },
      200,
      cors,
    );
  }

  // Everything below requires an authenticated user.
  if (urlCarriesCredentials(url)) {
    return apiJson(
      { ok: false, error: "Credentials in the URL are not allowed. Use a session or Basic auth header." },
      400,
      cors,
    );
  }

  const session = await apiAuthenticateSession(request);
  const basicUsername = session ? null : await apiAuthenticateBasic(request);
  const username = session?.username ?? basicUsername;
  const homes = session?.homes ?? null;
  if (!username) {
    return apiJson(
      { ok: false, error: "Unauthorized. Log in via POST /auth, or use a Basic auth header." },
      401,
      cors,
    );
  }
  const authenticatedUsername: string = username;

  const { loadDBForClient, saveDBValue, loadHomesRegistry, loadUsersServer } = await import(
    "./lib/server-db"
  );

  /** Resolve the target home and enforce membership (never trust request alone). */
  async function authorizedHome(): Promise<string | null> {
    const sanitized = (url.searchParams.get("homeId") || "home-default")
      .replace(/[^a-zA-Z0-9_-]/g, "");
    const homeId = sanitized || "home-default";
    if (!homes) {
      // Basic-auth caller: fetch the user, authorize against their homes list.
      const { verifyUserServer } = await import("./lib/server-db");
      // Username comes from the Basic header, already verified.
      const users = loadUsersServer("default");
      const me = users.find((u) => u.username.toLowerCase() === authenticatedUsername.toLowerCase());
      const userHomes = me?.homes || [me?.homeId || "home-default"];
      if (!userHomes.includes(homeId) && homeId !== "home-default") {
        return null;
      }
      if (homeId === "home-default" && !userHomes.includes("home-default")) return null;
      return homeId;
    }
    if (!homes.includes(homeId)) return null;
    return homeId;
  }

  // GET /api/v1/data?homeId=... — full budget DB for a home you belong to.
  if (path === "/data" && request.method === "GET") {
    const homeId = await authorizedHome();
    if (!homeId) {
      return apiJson({ ok: false, error: "You do not have access to this household.", homeId: url.searchParams.get("homeId") }, 403, cors);
    }
    const raw = loadDBForClient(homeId);
    if (raw == null) {
      return apiJson({ ok: false, error: "No budget data for this home yet.", homeId }, 404, cors);
    }
    try {
      return apiJson({ ok: true, homeId, db: JSON.parse(raw) }, 200, cors);
    } catch {
      return apiJson({ ok: false, error: "Stored budget data is corrupted.", homeId }, 500, cors);
    }
  }

  // POST /api/v1/data — save a full budget snapshot { homeId?, db }.
  if (path === "/data" && request.method === "POST") {
    let body: any = {};
    try {
      body = await request.json();
    } catch {}
    const db = body.db ?? body.json;
    if (db == null) {
      return apiJson({ ok: false, error: "Body must contain { db } (budget JSON)." }, 400, cors);
    }
    const requestedHome = (body.homeId ?? "home-default") as string;
    // Authorize against the requested homeId from the body.
    const sanitizedRequested = requestedHome.replace(/[^a-zA-Z0-9_-]/g, "") || "home-default";
    const isAllowed = homes
      ? homes.includes(sanitizedRequested)
      : await (async () => {
          if (!basicUsername) return false;
          const users = loadUsersServer("default");
          const me = users.find((u) => u.username.toLowerCase() === authenticatedUsername.toLowerCase());
          const userHomes = me?.homes || [me?.homeId || "home-default"];
          if (sanitizedRequested === "home-default") return userHomes.includes("home-default");
          return userHomes.includes(sanitizedRequested);
        })();
    if (!isAllowed) {
      return apiJson({ ok: false, error: "You do not have access to this household.", homeId: sanitizedRequested }, 403, cors);
    }
    try {
      saveDBValue(typeof db === "string" ? db : JSON.stringify(db), sanitizedRequested);
    } catch {
      return apiJson({ ok: false, error: "Failed to save budget data.", homeId: sanitizedRequested }, 500, cors);
    }
    return apiJson({ ok: true, homeId: sanitizedRequested, user: authenticatedUsername, savedAt: new Date().toISOString() }, 200, cors);
  }

  // GET /api/v1/homes — only the homes this user belongs to.
  if (path === "/homes" && request.method === "GET") {
    const users = loadUsersServer("default");
    const me = users.find((u) => u.username.toLowerCase() === authenticatedUsername.toLowerCase());
    const userHomes = new Set(me?.homes || [me?.homeId || "home-default"]);
    const all = loadHomesRegistry();
    return apiJson({ ok: true, homes: all.filter((h) => userHomes.has(h.id)) }, 200, cors);
  }

  // GET /api/v1/users — users without password hashes.
  if (path === "/users" && request.method === "GET") {
    const users = loadUsersServer("default").map((u) => {
      const { passwordHash: _omit, ...safe } = u;
      return safe;
    });
    return apiJson({ ok: true, users }, 200, cors);
  }

  return apiJson({ ok: false, error: "Not found." }, 404, cors);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // Self-hosted JSON API (Jellyfin-style): http://<ip>:9119/api/v1/...
      if (url.pathname === API_PREFIX || url.pathname.startsWith(API_PREFIX + "/")) {
        try {
          return await handleApi(request, url);
        } catch (error) {
          console.error("[API_ERROR]", error);
          return apiJson({ ok: false, error: "Internal server error." }, 500);
        }
      }

      // /upi?... — short https wrapper for UPI payments so links are tappable in
      // WhatsApp/chat apps: forwards all query params to the native upi:// scheme.
      if (url.pathname === "/upi") {
        return new Response(null, {
          status: 302,
          headers: { location: `upi://pay?${url.searchParams.toString()}` },
        });
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return response;
    } catch (error) {
      console.error("[SERVER_ERROR]", error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};