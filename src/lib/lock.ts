import { useSyncExternalStore } from "react";

const SESSION_KEY = "smartbudget.lock.session_open";
const PERSIST_KEY = "smartbudget.lock.open";
const USERS_KEY = "smartbudget.users.v1";
const ACTIVE_USER_KEY = "smartbudget.users.active";
const ACTIVE_HOME_KEY = "smartbudget.homes.active";
const REMEMBER_COOKIE = "smartbudget_remember";
const REMEMBER_LOCAL = "smartbudget.lock.remember";

export const MIN_PASSWORD_LENGTH = 8;

export type UserAccount = {
  id: string;
  name: string;
  avatarDataUrl?: string;
  username: string;
  themeMode?: "light" | "dark" | "system";
  themePreset?: string;
  themeCustomHex?: string;
  createdAt: string;
  homeId?: string;
  homes?: string[];
};

let unlocked = false;
let _usersCache: UserAccount[] | null = null;
let _activeHomeId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function emitUserChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("smartbudget:user-changed"));
}

export function isRemembered(): boolean {
  if (typeof document === "undefined") return false;
  const hasCookie = document.cookie.includes(`${REMEMBER_COOKIE}=1`);
  const hasLocal = localStorage.getItem(REMEMBER_LOCAL) === "1";
  return hasCookie || hasLocal;
}

export function setRememberCookie(remember = true, infinite = true) {
  if (typeof document === "undefined") return;
  if (remember) {
    const maxAge = infinite ? 315360000 : 30 * 86400; // 10 years (infinite) or 30 days
    document.cookie = `${REMEMBER_COOKIE}=1; path=/; max-age=${maxAge}; SameSite=Lax`;
    localStorage.setItem(REMEMBER_LOCAL, "1");
  } else {
    clearRememberCookie();
  }
}

export function clearRememberCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${REMEMBER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  localStorage.removeItem(REMEMBER_LOCAL);
}

export function getRegisteredUsers(): UserAccount[] {
  if (_usersCache) return _usersCache;
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      const parsed: UserAccount[] = JSON.parse(raw);
      if (parsed && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

function readLegacyLocalUsers(): Array<UserAccount & { password?: string }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

export async function hydrateUsers(): Promise<void> {
  try {
    const { fetchUsers, registerUserApi } = await import("./api");
    let server: UserAccount[] = await fetchUsers();
    const legacy = readLegacyLocalUsers();
    for (const lu of legacy) {
      if (!server.some((u) => u.username.toLowerCase() === lu.username.toLowerCase())) {
        const res = await registerUserApi({
          data: { name: lu.name, username: lu.username, password: lu.password },
        });
        if (res.ok && res.user) server.push(res.user);
      }
    }
    if (server.length) {
      _usersCache = server;
      localStorage.setItem(USERS_KEY, JSON.stringify(server));
      emitUserChanged();
    }
  } catch {
    _usersCache = getRegisteredUsers();
  }
  emit();
}

export function saveUsers(users: UserAccount[]) {
  _usersCache = users;
  if (typeof window !== "undefined") localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getActiveUser(): UserAccount | null {
  if (typeof window === "undefined") return null;
  const username = localStorage.getItem(ACTIVE_USER_KEY);
  if (!username) return null;
  const users = getRegisteredUsers();
  return users.find((u) => u.username === username) ?? null;
}

export function getCurrentHomeId(): string {
  if (typeof window === "undefined") return "home-default";
  const persisted = _activeHomeId ?? localStorage.getItem(ACTIVE_HOME_KEY);
  const active = getActiveUser();
  if (persisted && active?.homes?.includes(persisted)) return persisted;
  if (active?.homeId) return active.homeId;
  return "home-default";
}

export function setActiveHomeId(id: string) {
  _activeHomeId = id;
  if (typeof window !== "undefined") localStorage.setItem(ACTIVE_HOME_KEY, id);
  emit();
}

export async function joinUserToHome(
  code: string,
): Promise<{ ok: boolean; homeId?: string; name?: string; error?: string }> {
  const active = getActiveUser();
  if (!active) return { ok: false, error: "You are not logged in." };
  const { joinHomeApi } = await import("./api");
  const res = await joinHomeApi({ data: { code, username: active.username } });
  if (!res.ok) return { ok: false, error: res.error };
  if (res.homeId) {
    const users = getRegisteredUsers();
    saveUsers(
      users.map((u) =>
        u.username === active.username && !(u.homes ?? []).includes(res.homeId!)
          ? { ...u, homes: [...(u.homes ?? []), res.homeId!] }
          : u,
      ),
    );
    setActiveHomeId(res.homeId);
  }
  return { ok: true, homeId: res.homeId, name: res.name };
}

export function hydrateLock() {
  if (typeof window === "undefined") return;
  const remembered = isRemembered();
  const sessionOpen = sessionStorage.getItem(SESSION_KEY) === "1";
  unlocked = remembered || sessionOpen;
  emit();
}

export async function unlock(
  password: string,
  username = "shantanu",
  remember = false,
): Promise<{ ok: boolean; needsReset?: boolean }> {
  const { verifyUserApi } = await import("./api");
  const res = await verifyUserApi({ data: { username, password } });
  if (!res.ok || !res.user) return { ok: false };

  const serverUser = res.user;
  const users = getRegisteredUsers();
  const known = users.find((u) => u.username.toLowerCase() === serverUser.username.toLowerCase());
  if (known) {
    saveUsers(users.map((u) => (u.username === serverUser.username ? serverUser : u)));
  } else {
    saveUsers([...users, serverUser]);
  }
  localStorage.setItem(ACTIVE_USER_KEY, serverUser.username);
  emitUserChanged();

  const needsReset = !!res.needsPasswordReset;
  if (needsReset) return { ok: true, needsReset };

  const active = getActiveUser();
  setActiveHomeId(active?.homeId ?? "home-default");

  unlocked = true;
  sessionStorage.setItem(SESSION_KEY, "1");
  if (remember) setRememberCookie(true, true);
  emit();
  try {
    const { initDB } = await import("./store");
    await initDB(true);
  } catch {}
  return { ok: true };
}

export async function registerUser(
  name: string,
  username: string,
  password?: string,
  remember = true,
): Promise<{ ok: boolean; error?: string }> {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const { registerUserApi } = await import("./api");
  const res = await registerUserApi({ data: { name, username, password } });
  if (!res.ok) return { ok: false, error: res.error ?? "Registration failed" };

  if (res.user) {
    const users = getRegisteredUsers();
    saveUsers([...users, res.user]);
    localStorage.setItem(ACTIVE_USER_KEY, res.user.username);
    emitUserChanged();
  }

  const active = getActiveUser();
  setActiveHomeId(active?.homeId ?? "home-default");

  unlocked = true;
  sessionStorage.setItem(SESSION_KEY, "1");
  if (remember) setRememberCookie(true, true);
  emit();

  try {
    const { initDB } = await import("./store");
    await initDB(true);
  } catch {}

  return { ok: true };
}

export function lock() {
  unlocked = false;
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PERSIST_KEY);
  clearRememberCookie();
  emit();
}

export async function changePassword(current: string, next: string) {
  const activeUser = getActiveUser();
  if (!activeUser) return false;

  const { changeUserPasswordApi } = await import("./api");
  const res = await changeUserPasswordApi({
    data: { username: activeUser.username, current, next },
  });
  if (res.ok) {
    await hydrateUsers();
    return true;
  }

  const legacy = readLegacyLocalUsers();
  const idx = legacy.findIndex((u) => u.id === activeUser.id);
  if (idx >= 0 && legacy[idx].password === current) {
    legacy[idx].password = next;
    localStorage.setItem(USERS_KEY, JSON.stringify(legacy));
    return true;
  }

  return false;
}

export function useUnlocked() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => unlocked,
    () => false,
  );
}
