import { useSyncExternalStore } from "react";

const OPEN_KEY = "smartbudget.lock.open";
export const DEFAULT_PASSWORD = "SmartHome@2012";

let unlocked = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function hydrateLock() {
  unlocked = localStorage.getItem(OPEN_KEY) === "1";
  emit();
}

export async function unlock(password: string) {
  try {
    const { verifyPassword } = await import("./api");
    const result = await verifyPassword({ data: { password } });
    if (result.ok) {
      unlocked = true;
      localStorage.setItem(OPEN_KEY, "1");
      emit();
    }
    return result.ok;
  } catch {
    return false;
  }
}

export function lock() {
  unlocked = false;
  localStorage.removeItem(OPEN_KEY);
  emit();
}

export async function changePassword(current: string, next: string) {
  try {
    const { changePasswordApi } = await import("./api");
    const result = await changePasswordApi({ data: { current, next } });
    return result.ok;
  } catch {
    return false;
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
