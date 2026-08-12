import { useEffect, useState } from "react";

const KEY = "smartbudget.theme";
type Mode = "light" | "dark" | "system";

function apply(mode: Mode) {
  if (typeof window === "undefined") return;
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const stored = (window.localStorage.getItem(KEY) as Mode | null) ?? "system";
    setMode(stored);
    apply(stored);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((window.localStorage.getItem(KEY) as Mode | null) ?? "system") apply(stored);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const set = (next: Mode) => {
    setMode(next);
    window.localStorage.setItem(KEY, next);
    apply(next);
  };

  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return { mode, setMode: set, toggle: () => set(isDark ? "light" : "dark") };
}
