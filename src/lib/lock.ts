import { useSyncExternalStore } from "react";

const SESSION_KEY = "smartbudget.lock.session_open";
const PERSIST_KEY = "smartbudget.lock.open";
const BIOMETRIC_KEY = "smartbudget.lock.biometric_enabled";
const BIOMETRIC_CRED_ID = "smartbudget.lock.biometric_cred_id";
const USERS_KEY = "smartbudget.users.v1";
const ACTIVE_USER_KEY = "smartbudget.users.active";
const ACTIVE_HOME_KEY = "smartbudget.homes.active";
const REMEMBER_COOKIE = "smartbudget_remember";
const REMEMBER_LOCAL = "smartbudget.lock.remember";

export const DEFAULT_PASSWORD = "SmartHome@2012";

export type UserAccount = {
  id: string;
  name: string;
  username: string;
  passkeyEnabled?: boolean;
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
): Promise<boolean> {
  const { verifyUserApi } = await import("./api");
  const res = await verifyUserApi({ data: { username, password } });
  if (!res.ok || !res.user) return false;

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
  return true;
}

export async function registerUser(
  name: string,
  username: string,
  password?: string,
  remember = true,
): Promise<{ ok: boolean; error?: string }> {
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

export function isBiometricAvailable(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

export function isBiometricEnabled(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(BIOMETRIC_KEY) === "1";
}

export async function enableBiometrics(): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return { ok: false, error: "Biometrics / Passkey not supported on this browser." };
  }
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const activeUser = getActiveUser();

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "SmartBudget" },
        user: {
          id: userId,
          name: activeUser?.username ?? "user@smartbudget",
          displayName: activeUser?.name ?? "SmartBudget User",
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" },
        ],
        timeout: 60000,
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
      },
    })) as PublicKeyCredential | null;

    if (credential) {
      localStorage.setItem(BIOMETRIC_KEY, "1");
      localStorage.setItem(BIOMETRIC_CRED_ID, credential.id);
      if (activeUser) {
        try {
          const { updateUserApi } = await import("./api");
          const res = await updateUserApi({
            data: { username: activeUser.username, passkeyEnabled: true },
          });
          if (res.ok && res.user) {
            const users = getRegisteredUsers();
            saveUsers(users.map((u) => (u.username === res.user!.username ? res.user! : u)));
          }
        } catch {}
      }
      return { ok: true };
    }
    return { ok: false, error: "No passkey credential created." };
  } catch (err: any) {
    const msg = err?.message || "Passkey setup failed or was cancelled.";
    return { ok: false, error: msg };
  }
}

export async function disableBiometrics() {
  localStorage.removeItem(BIOMETRIC_KEY);
  localStorage.removeItem(BIOMETRIC_CRED_ID);
  const activeUser = getActiveUser();
  if (!activeUser) return;
  try {
    const { updateUserApi } = await import("./api");
    const res = await updateUserApi({
      data: { username: activeUser.username, passkeyEnabled: false },
    });
    if (res.ok && res.user) {
      const users = getRegisteredUsers();
      saveUsers(users.map((u) => (u.username === res.user!.username ? res.user! : u)));
    }
  } catch {}
}

export async function unlockWithBiometrics(): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return { ok: false, error: "Biometrics / Passkeys not supported on this device." };
  }

  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: "required",
      },
    });

    if (credential) {
      unlocked = true;
      sessionStorage.setItem(SESSION_KEY, "1");
      setRememberCookie(true, true);
      emit();
      return { ok: true };
    }
    return { ok: false, error: "Passkey authentication failed." };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Passkey verification failed." };
  }
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
