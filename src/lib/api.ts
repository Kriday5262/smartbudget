import { createServerFn } from "@tanstack/react-start";

export const fetchDB = createServerFn({ method: "POST" })
  .validator((data: { homeId?: string } | undefined) => data ?? {})
  .handler(async (ctx) => {
    const { loadDBValue, loadHomesRegistry } = await import("./server-db");
    const homeId = (ctx.data as { homeId?: string }).homeId ?? "default";
    const raw = loadDBValue(homeId);
    if (!raw) return raw;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.households) && parsed.households.length > 0) {
        return raw;
      }
      const entry = loadHomesRegistry().find((h) => h.id === homeId);
      if (entry) {
        parsed.households = [
          {
            id: entry.id,
            name: entry.name,
            code: entry.code,
            createdAt: new Date().toISOString().slice(0, 10),
            members: [
              {
                id: "mem-" + entry.owner,
                name: entry.owner,
                role: "owner",
                joinedAt: new Date().toISOString().slice(0, 10),
              },
            ],
          },
        ];
        return JSON.stringify(parsed);
      }
    } catch {}
    return raw;
  });

export const saveDB = createServerFn({ method: "POST" })
  .validator((data: { json: any; homeId?: string }) => data)
  .handler(async (ctx) => {
    const { saveDBValue } = await import("./server-db");
    const data = ctx.data as { json: any; homeId?: string };
    const json = typeof data.json === "string" ? data.json : JSON.stringify(data.json);
    saveDBValue(json, data.homeId ?? "default");
    return { ok: true };
  });

export const verifyPassword = createServerFn({ method: "POST" })
  .validator((data: { password: string }) => data)
  .handler(async (ctx) => {
    const { verifyPasswordServer } = await import("./server-db");
    const input = ctx.data as { password: string };
    return { ok: verifyPasswordServer(input.password) };
  });

export const changePasswordApi = createServerFn({ method: "POST" })
  .validator((data: { current: string; next: string }) => data)
  .handler(async (ctx) => {
    const { changePasswordServer } = await import("./server-db");
    const input = ctx.data as { current: string; next: string };
    return { ok: changePasswordServer(input.current, input.next) };
  });

export const fetchUsers = createServerFn({ method: "GET" }).handler(async () => {
  const { loadUsersServer } = await import("./server-db");
  return loadUsersServer("default");
});

export const registerUserApi = createServerFn({ method: "POST" })
  .validator((data: { name: string; username: string; password?: string }) => data)
  .handler(async (ctx) => {
    const { registerUserServer } = await import("./server-db");
    return registerUserServer(ctx.data as { name: string; username: string; password?: string });
  });

export const verifyUserApi = createServerFn({ method: "POST" })
  .validator((data: { username: string; password: string }) => data)
  .handler(async (ctx) => {
    const { verifyUserServer } = await import("./server-db");
    const input = ctx.data as { username: string; password: string };
    return verifyUserServer(input.username, input.password);
  });

export const changeUserPasswordApi = createServerFn({ method: "POST" })
  .validator((data: { username: string; current: string; next: string }) => data)
  .handler(async (ctx) => {
    const { changeUserPasswordServer } = await import("./server-db");
    const input = ctx.data as { username: string; current: string; next: string };
    return changeUserPasswordServer(input.username, input.current, input.next);
  });

export const updateUserApi = createServerFn({ method: "POST" })
  .validator((data: {
    username: string;
    passkeyEnabled?: boolean;
    themeMode?: "light" | "dark" | "system";
    themePreset?: string;
    themeCustomHex?: string;
  }) => data)
  .handler(async (ctx) => {
    const { updateUserServer } = await import("./server-db");
    const input = ctx.data as {
      username: string;
      passkeyEnabled?: boolean;
      themeMode?: "light" | "dark" | "system";
      themePreset?: string;
      themeCustomHex?: string;
    };
    return updateUserServer(input.username, input);
  });

export const joinHomeApi = createServerFn({ method: "POST" })
  .validator((data: { code: string; username: string }) => data)
  .handler(async (ctx) => {
    const { joinHomeServer } = await import("./server-db");
    const input = ctx.data as { code: string; username: string };
    return joinHomeServer(input.code, input.username);
  });

export const createHomeApi = createServerFn({ method: "POST" })
  .validator((data: { name: string; username: string }) => data)
  .handler(async (ctx) => {
    const { createHomeServer } = await import("./server-db");
    const input = ctx.data as { name: string; username: string };
    return createHomeServer(input.name, input.username);
  });
