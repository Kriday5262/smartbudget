import { createRequire } from "node:module";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import {
  encryptValue,
  decryptValue,
  hashPasswordScrypt,
  verifyPasswordScrypt,
  generateSessionToken,
  tokensEqual,
  SESSION_LIFETIME_MS,
} from "./security";

const require = createRequire(import.meta.url);
// @ts-ignore
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR =
  process.env.DATA_DIR ||
  (process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/home/kriday/KamkaziBudget/data");
const DEFAULT_DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "budget.db");
const HOUSE_DIR = path.join(DATA_DIR, "houses");

const ENC_PREFIX = "enc1:";

/** True if a stored hash is a legacy SHA-256 hex (pre-scrypt). */
function isLegacySha256Hash(hash: string | undefined): boolean {
  return typeof hash === "string" && /^[0-9a-f]{64}$/i.test(hash);
}

/** Verify a password against a stored hash, transparently upgrading legacy SHA-256 hashes to scrypt. */
function verifyUserPassword(password: string, storedHash: string | undefined): boolean {
  if (!storedHash) return false;
  if (isLegacySha256Hash(storedHash)) {
    const legacy =
      crypto.createHash("sha256").update(`smartbudget::${password}`, "utf8").digest("hex") ===
      storedHash;
    if (!legacy) return false;
    return true;
  }
  return verifyPasswordScrypt(password, storedHash);
}

/** Hash for a new password (always scrypt). */
function hashUserPassword(password: string): string {
  return hashPasswordScrypt(password);
}

/** Restrict a home's SQLite file to owner-only (0600) at first connection. */
function hardenFilePerms(dbPath: string) {
  try {
    if (fs.existsSync(dbPath)) fs.chmodSync(dbPath, 0o600);
    else fs.writeFileSync(dbPath, "", { mode: 0o600 });
  } catch {}
}


const _dbConnections: Record<string, any> = {};

function getHomeDBPath(homeId = "default"): string {
  const cleanId = (homeId || "default").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanId || cleanId === "default" || cleanId === "home-default") {
    return DEFAULT_DB_PATH;
  }
  return path.join(HOUSE_DIR, `home_${cleanId}.db`);
}

function getDB(homeId = "default"): any {
  const dbPath = getHomeDBPath(homeId);
  if (_dbConnections[dbPath]) return _dbConnections[dbPath];

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  hardenFilePerms(dbPath);
  const conn = new DatabaseSync(dbPath);
  conn.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  _dbConnections[dbPath] = conn;
  return conn;
}

/**
 * Read a kv entry. Values written after encryption ship in as "enc1:<cipher>"
 * but legacy values are stored as plaintext JSON. We transparently upgrade
 * plaintext to ciphertext on write so no existing data is lost.
 */
function kvGet(conn: any, key: string): string | null {
  const row = conn.prepare("SELECT value FROM kv WHERE key = ?").get(key);
  if (!row) return null;
  const raw = row.value;
  if (typeof raw !== "string") return null;
  if (raw.startsWith(ENC_PREFIX)) {
    return decryptValue(raw.slice(ENC_PREFIX.length));
  }
  return raw; // legacy plaintext
}

function kvSet(conn: any, key: string, value: string): void {
  const cipher = ENC_PREFIX + encryptValue(value);
  conn.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run(key, cipher);
}

export function loadDBValue(homeId = "default"): string | null {
  return kvGet(getDB(homeId), "db");
}

/**
 * The DB snapshot exactly as the app serves it to clients: the raw stored JSON,
 * but with its `households` list backfilled from the homes registry when a home
 * was provisioned outside the usual in-app flow (so every client sees a
 * household entry for the home they are requesting).
 */
export function loadDBForClient(homeId = "default"): string | null {
  const raw = loadDBValue(homeId);
  if (!raw) return raw;
  try {
    const parsed = JSON.parse(raw);
    const registry = loadHomesRegistry();
    const entry = registry.find((h) => h.id === homeId);
    if (!entry) return raw;

    // The full set of shared homes the owner of `homeId` belongs to. Without
    // this, clients down to a single-home list whenever a home is created or
    // switched. We always resolve from the owner's membership so the home
    // picker stays complete.
    let homeIds = [homeId];
    const users = loadUsersServer("default");
    const owner = users.find((u) => u.username === entry.owner);
    if (owner && Array.isArray(owner.homes) && owner.homes.length > 0) {
      homeIds = owner.homes;
    }

    // Keep any per-home metadata/members that were already saved for a home,
    // and synthesize entries for homes the owner belongs to but which aren't
    // present in this home's stored list.
    const storedList = Array.isArray(parsed.households) ? parsed.households : [];
    const storedById = new Map<string, any>(storedList.map((h: any) => [h.id, h]));
    const now = new Date().toISOString().slice(0, 10);

    const households = homeIds
      .map((id) => {
        const stored = storedById.get(id);
        if (stored) return stored;
        const h = registry.find((r) => r.id === id);
        if (!h) return null;
        return {
          id: h.id,
          name: h.name,
          code: h.code,
          createdAt: now,
          members: [
            {
              id: "mem-" + h.owner,
              name: h.owner,
              role: "owner",
              joinedAt: now,
            },
          ],
        };
      })
      .filter((h): h is NonNullable<typeof h> => h != null);

    parsed.households = households.length > 0 ? households : storedList;
    return JSON.stringify(parsed);
  } catch {}
  return raw;
}

export function saveDBValue(json: string, homeId = "default"): void {
  kvSet(getDB(homeId), "db", json);
}

export function getPasswordHash(homeId = "default"): string | null {
  return kvGet(getDB(homeId), "password_hash");
}

export function verifyPasswordServer(password: string, homeId = "default"): boolean {
  const stored = getPasswordHash(homeId);
  if (!stored) return false;
  return verifyPasswordScrypt(password, stored);
}

export function changePasswordServer(current: string, next: string, homeId = "default"): boolean {
  const stored = getPasswordHash(homeId);
  if (!stored || !verifyPasswordScrypt(current, stored)) return false;
  kvSet(getDB(homeId), "password_hash", hashPasswordScrypt(next));
  return true;
}

export type ServerUser = {
  id: string;
  name: string;
  avatarDataUrl?: string;
  username: string;
  passwordHash: string;
  themeMode?: "light" | "dark" | "system";
  themePreset?: string;
  themeCustomHex?: string;
  createdAt: string;
  homeId: string;
  homes: string[];
};

export type HomeEntry = {
  id: string;
  name: string;
  code: string;
  owner: string;
};

const USERS_KEY = "users";
const HOMES_KEY = "homes";

function uidServer(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function homeCode(): string {
  return "HOME-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function freshHomeJSON(homeId: string, name: string, ownerName: string): string {
  const home: any = {
    id: homeId,
    name,
    code: homeCode(),
    createdAt: today(),
    members: [
      {
        id: "mem-" + uidServer(),
        name: ownerName || "Owner",
        role: "owner",
        joinedAt: today(),
      },
    ],
  };
  return JSON.stringify({
    accounts: [],
    categoryGroups: [],
    categories: [],
    payees: [],
    transactions: [],
    monthlyBudgets: [],
    goals: [],
    splits: [],
    loans: [],
    settings: {},
    households: [home],
    activeHomeId: homeId,
  });
}

export function loadHomesRegistry(): HomeEntry[] {
  const db = getDB("default");
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(HOMES_KEY);
  let raw: string | null = null;
  if (row) {
    raw = kvGet(db, HOMES_KEY);
    if (raw == null) {
      // Stored registry exists but could not be decrypted with the configured
      // key — never clobber it with a freshly bootstrapped default.
      throw new Error("homes registry could not be decrypted with the configured key");
    }
  }
  let entries: HomeEntry[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) entries = parsed;
    } catch {}
    if (row && typeof row.value === "string" && !row.value.startsWith("enc1:")) {
      // Legacy plaintext row: rewrite it encrypted now that we've read it.
      saveHomesRegistry(entries);
    }
  }
  if (!entries.some((h) => h.id === "home-default")) {
    const existing = loadDBValue("default");
    let name = "Shantanu's Home";
    let code = homeCode();
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        const first = parsed.households?.[0];
        if (first) {
          if (first.name) name = first.name;
          if (first.code) code = first.code;
        }
      } catch {}
    }
    entries.unshift({ id: "home-default", name, code, owner: "shantanu" });
    saveHomesRegistry(entries);
  }
  return entries;
}

export function saveHomesRegistry(entries: HomeEntry[]): void {
  kvSet(getDB("default"), HOMES_KEY, JSON.stringify(entries));
}

export function provisionHomeServer(
  homeId: string,
  name: string,
  ownerName: string,
  ownerUsername: string,
): { ok: boolean; id: string; name: string; code: string; error?: string } {
  const cleanId = (homeId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanId || cleanId === "default" || cleanId === "home-default") {
    return { ok: false, id: "", name: "", code: "", error: "Invalid home id." };
  }
  const code = homeCode();
  saveDBValue(freshHomeJSON(cleanId, name, ownerName), cleanId);
  const entries = loadHomesRegistry();
  if (!entries.some((h) => h.id === cleanId)) {
    entries.push({ id: cleanId, name, code, owner: ownerUsername });
    saveHomesRegistry(entries);
  }
  return { ok: true, id: cleanId, name, code };
}

export function createHomeServer(
  name: string,
  username: string,
): { ok: boolean; home?: HomeEntry; error?: string } {
  const cleanName = (name || "").trim() || "Family Home";
  const users = loadUsersServer("default");
  const me = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!me) return { ok: false, error: "User not found." };
  const prov = provisionHomeServer("home-" + uidServer(), cleanName, me.name, me.username);
  if (!prov.ok) return { ok: false, error: prov.error };
  if (!me.homes) me.homes = [];
  if (!me.homes.includes(prov.id)) me.homes.push(prov.id);
  me.homeId = me.homeId || prov.id;
  saveUsersServer(users, "default");
  return { ok: true, home: { id: prov.id, name: prov.name, code: prov.code, owner: me.username } };
}

export function joinHomeServer(
  code: string,
  username: string,
): { ok: boolean; homeId?: string; name?: string; error?: string } {
  const cleanCode = (code || "").trim().toUpperCase();
  if (!cleanCode) return { ok: false, error: "Please enter an invite code." };
  const entry = loadHomesRegistry().find((h) => h.code.toUpperCase() === cleanCode);
  if (!entry) return { ok: false, error: "Invite code not found." };

  const users = loadUsersServer("default");
  const me = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!me) return { ok: false, error: "User not found." };

  if (!me.homes) me.homes = [];
  if (!me.homes.includes(entry.id)) {
    me.homes.push(entry.id);
    saveUsersServer(users, "default");
    try {
      const raw = loadDBValue(entry.id);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        const home = parsed.households?.find((h: any) => h.id === entry.id);
        if (home && !home.members.some((m: any) => m.name === me.name)) {
          home.members.push({
            id: "mem-" + uidServer(),
            name: me.name,
            role: "editor",
            joinedAt: today(),
          });
          saveDBValue(JSON.stringify(parsed), entry.id);
        }
      }
    } catch {}
  }
  return { ok: true, homeId: entry.id, name: entry.name };
}

function ensureUserHome(user: ServerUser): boolean {
  if (user.homeId && Array.isArray(user.homes)) return false;
  if (!user.homeId) {
    if (user.username.toLowerCase() === "shantanu") {
      user.homeId = "home-default";
      user.homes = ["home-default"];
    } else {
      const prov = provisionHomeServer(
        "home-" + uidServer(),
        user.name + "'s Home",
        user.name,
        user.username,
      );
      if (prov.ok) {
        user.homeId = prov.id;
        user.homes = [prov.id];
      }
    }
    return true;
  }
  if (!Array.isArray(user.homes)) {
    user.homes = [user.homeId];
    return true;
  }
  return false;
}

export function saveUsersServer(users: ServerUser[], homeId = "default"): void {
  kvSet(getDB(homeId), USERS_KEY, JSON.stringify(users));
}

export function loadUsersServer(homeId = "default"): ServerUser[] {
  const db = getDB(homeId);
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(USERS_KEY);
  if (row) {
    // A stored users row exists but could not be read (e.g. wrong encryption
    // key). Refuse to silently replace real data with a fresh default user.
    const raw = kvGet(db, USERS_KEY);
    if (raw == null) {
      throw new Error("users row could not be decrypted with the configured key");
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let changed = false;
        for (const u of parsed) {
          if (ensureUserHome(u)) changed = true;
        }
        if (changed) saveUsersServer(parsed, homeId);
        return parsed;
      }
    } catch {}
  }
  const masterHash = getPasswordHash("default") ?? hashUserPassword("SmartHome@2012");
  const defaultUser: ServerUser = {
    id: "usr-shantanu",
    name: "Shantanu",
    username: "shantanu",
    passwordHash: masterHash,
    createdAt: today(),
    homeId: "home-default",
    homes: ["home-default"],
  };
  saveUsersServer([defaultUser], homeId);
  return [defaultUser];
}

export function registerUserServer(
  input: { name: string; username: string; password?: string },
  homeId = "default",
): { ok: boolean; error?: string; user?: Omit<ServerUser, "passwordHash"> } {
  const cleanUsername = (input.username || "").trim().toLowerCase();
  const cleanName = (input.name || "").trim();
  const password = input.password ?? "";
  if (!cleanName || !cleanUsername) {
    return { ok: false, error: "Please enter name and username." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  const users = loadUsersServer(homeId);
  if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
    return { ok: false, error: "Username is already taken." };
  }
  const homeId2 = "home-" + uidServer();
  const prov = provisionHomeServer(homeId2, cleanName + "'s Home", cleanName, cleanUsername);
  if (!prov.ok) return { ok: false, error: prov.error };
  const newUser: ServerUser = {
    id: "usr-" + Math.random().toString(36).slice(2, 9),
    name: cleanName,
    username: cleanUsername,
    passwordHash: hashUserPassword(password),
    createdAt: today(),
    homeId: homeId2,
    homes: [homeId2],
  };
  users.push(newUser);
  saveUsersServer(users, homeId);
  const { passwordHash: _omit, ...safeUser } = newUser;
  return { ok: true, user: safeUser };
}

export function verifyUserServer(
  username: string,
  password: string,
  homeId = "default",
): { ok: boolean; user?: Omit<ServerUser, "passwordHash">; needsPasswordReset?: boolean } {
  const users = loadUsersServer(homeId);
  const target = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!target) return { ok: false };
  if (!verifyUserPassword(password, target.passwordHash)) return { ok: false };
  const wasLegacy = isLegacySha256Hash(target.passwordHash);
  // Transparently upgrade a legacy SHA-256 hash to scrypt on successful login.
  if (wasLegacy) {
    target.passwordHash = hashUserPassword(password);
    if (target.homes) saveUsersServer(users, homeId);
  }
  const { passwordHash: _omit, ...safeUser } = target;
  return { ok: true, user: safeUser, needsPasswordReset: wasLegacy };
}

export function changeUserPasswordServer(
  username: string,
  current: string,
  next: string,
  homeId = "default",
): { ok: boolean } {
  const users = loadUsersServer(homeId);
  const target = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!target || !verifyUserPassword(current, target.passwordHash)) return { ok: false };
  if (next.length < 8) return { ok: false };
  target.passwordHash = hashUserPassword(next);
  saveUsersServer(users, homeId);
  return { ok: true };
}

export function updateUserServer(
  username: string,
  patch: {
    name?: string;
    avatarDataUrl?: string;
    themeMode?: "light" | "dark" | "system";
    themePreset?: string;
    themeCustomHex?: string;
  },
  homeId = "default",
): { ok: boolean; user?: Omit<ServerUser, "passwordHash"> } {
  const users = loadUsersServer(homeId);
  const target = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!target) return { ok: false };
  if (typeof patch.name === "string" && patch.name.trim()) target.name = patch.name.trim();
  if (typeof patch.avatarDataUrl === "string" && (patch.avatarDataUrl === "" || /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(patch.avatarDataUrl))) target.avatarDataUrl = patch.avatarDataUrl;
  if (patch.themeMode && ["light", "dark", "system"].includes(patch.themeMode)) {
    target.themeMode = patch.themeMode;
  }
  if (typeof patch.themePreset === "string") target.themePreset = patch.themePreset;
  if (typeof patch.themeCustomHex === "string") target.themeCustomHex = patch.themeCustomHex;
  saveUsersServer(users, homeId);
  const { passwordHash: _omit, ...safeUser } = target;
  return { ok: true, user: safeUser };
}

/* ------------------------------------------------------------------ */
/* Sessions — opaque tokens, hashed at rest, with home access scope    */
/* ------------------------------------------------------------------ */

const SESSIONS_KEY = "sessions";

type StoredSession = {
  username: string;
  homes: string[];
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
};

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function loadSessions(): StoredSession[] {
  const raw = kvGet(getDB("default"), SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: StoredSession[]): void {
  kvSet(getDB("default"), SESSIONS_KEY, JSON.stringify(sessions));
}

function pruneExpired(sessions: StoredSession[]): StoredSession[] {
  const now = Date.now();
  const live = sessions.filter((s) => s.expiresAt > now);
  if (live.length !== sessions.length) saveSessions(live);
  return live;
}

/** Create a session bound to the user's current home access list. */
export function createSessionServer(
  username: string,
  homes: string[],
): { token: string; expiresAt: number } {
  const token = generateSessionToken();
  const now = Date.now();
  const expiresAt = now + SESSION_LIFETIME_MS;
  const sessions = pruneExpired(loadSessions());
  sessions.push({
    username,
    homes: Array.from(new Set(homes || [])).filter(Boolean),
    tokenHash: sha256(token),
    expiresAt,
    createdAt: now,
  });
  saveSessions(sessions);
  return { token, expiresAt };
}

/** Resolve a session token to its user (only if valid + not expired). */
export function resolveSessionServer(
  token: string,
): { username: string; homes: string[] } | null {
  if (!token) return null;
  const tokenHash = sha256(token);
  const sessions = pruneExpired(loadSessions());
  const match = sessions.find((s) => tokensEqual(s.tokenHash, tokenHash));
  if (!match) return null;
  return { username: match.username, homes: match.homes };
}

/** Revoke a session token (logout). */
export function revokeSessionServer(token: string): void {
  if (!token) return;
  const tokenHash = sha256(token);
  const sessions = pruneExpired(loadSessions()).filter((s) => !tokensEqual(s.tokenHash, tokenHash));
  saveSessions(sessions);
}

/** Delete all sessions for a user (used by "force lock all sessions"). */
export function revokeAllUserSessionsServer(username: string): void {
  const sessions = pruneExpired(loadSessions()).filter((s) => s.username !== username);
  saveSessions(sessions);
}

/* ------------------------------------------------------------------ */
/* Login rate limiting + lockout                                       */
/* ------------------------------------------------------------------ */

const RATE_LIMIT_KEY = "login_failures";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

type FailureState = { count: number; firstAt: number; lockedUntil: number };

function loadFailures(): Record<string, FailureState> {
  const raw = kvGet(getDB("default"), RATE_LIMIT_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveFailures(f: Record<string, FailureState>): void {
  kvSet(getDB("default"), RATE_LIMIT_KEY, JSON.stringify(f));
}

/** True while this username is locked out. */
export function isAccountLocked(username: string): boolean {
  const f = loadFailures()[username.toLowerCase()];
  return !!f && f.lockedUntil > Date.now();
}

/** Test whether a login attempt should be allowed; call record after failures. */
export function loginRateLimited(): boolean {
  return false; // global IP-style limiting reserved for the proxy layer
}

/** Record a failed login for a username (5 fails → 15 min lockout). */
export function recordLoginFailure(username: string): void {
  const key = username.toLowerCase();
  const all = loadFailures();
  const now = Date.now();
  const state = all[key] ?? { count: 0, firstAt: now, lockedUntil: 0 };
  if (state.lockedUntil > now) return;
  state.count += 1;
  if (state.firstAt === 0) state.firstAt = now;
  // Reset the attempt window if it's been more than 10 minutes since the first failure.
  if (now - state.firstAt > 10 * 60 * 1000) {
    state.count = 1;
    state.firstAt = now;
  }
  if (state.count >= MAX_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_MS;
    state.count = 0;
  }
  all[key] = state;
  saveFailures(all);
}

/** Clear login failures after a successful login. */
export function clearLoginFailures(username: string): void {
  const all = loadFailures();
  delete all[username.toLowerCase()];
  saveFailures(all);
}

/** Reject an ip that has too many rapid requests (simple in-process limiter). */
const ipHits = new Map<string, number[]>();

export function ipRateLimited(ip: string, max = 120, windowMs = 60_000): boolean {
  if (!ip) return false;
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    ipHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return false;
}
