import { createServerFn } from "@tanstack/react-start";

export const fetchDB = createServerFn({ method: "GET" }).handler(async () => {
  const { loadDBValue } = await import("./server-db");
  return loadDBValue();
});

export const saveDB = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async (ctx) => {
  const { saveDBValue } = await import("./server-db");
  const raw = ctx.data as any;
  const json = typeof raw === "string" ? raw : JSON.stringify(raw);
  saveDBValue(json);
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

