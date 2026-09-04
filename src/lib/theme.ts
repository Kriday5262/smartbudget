import { useEffect, useState } from "react";
import { getActiveUser } from "./lock";

const KEY = "smartbudget.theme";
const PRESET_KEY = "smartbudget.theme.preset";
const CUSTOM_KEY = "smartbudget.theme.custom";

export type Mode = "light" | "dark" | "system";
export type ThemePreset =
  | "emerald"
  | "ocean"
  | "sunset"
  | "cyber"
  | "obsidian"
  | "crimson"
  | "sage"
  | "amber"
  | "lavender"
  | "nordic"
  | "custom";

export const THEME_PRESETS: {
  id: ThemePreset;
  label: string;
  primaryColor: string;
  accentColor: string;
}[] = [
  { id: "emerald", label: "SmartBudget Emerald", primaryColor: "#0f766e", accentColor: "#d97706" },
  { id: "ocean", label: "Ocean Blue", primaryColor: "#0284c7", accentColor: "#06b6d4" },
  { id: "sunset", label: "Sunset Rose", primaryColor: "#e11d48", accentColor: "#fb7185" },
  { id: "cyber", label: "Cyber Neon", primaryColor: "#7c3aed", accentColor: "#06b6d4" },
  { id: "obsidian", label: "Midnight Obsidian", primaryColor: "#d97706", accentColor: "#f59e0b" },
  { id: "crimson", label: "Crimson Velvet", primaryColor: "#b91c1c", accentColor: "#ef4444" },
  { id: "sage", label: "Forest Sage", primaryColor: "#15803d", accentColor: "#22c55e" },
  { id: "amber", label: "Solar Amber", primaryColor: "#ea580c", accentColor: "#f97316" },
  { id: "lavender", label: "Lavender Mist", primaryColor: "#6d28d9", accentColor: "#8b5cf6" },
  { id: "nordic", label: "Nordic Frost", primaryColor: "#0f766e", accentColor: "#38bdf8" },
];

function apply(mode: Mode, preset: ThemePreset, customHex?: string) {
  if (typeof window === "undefined") return;
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.setAttribute("data-theme-preset", preset);
  if (preset === "custom") {
    const hex = (customHex ?? window.localStorage.getItem(CUSTOM_KEY) ?? "#0f766e").trim();
    applyCustom(hex, dark);
  } else {
    clearCustom();
  }
}

function readTheme() {
  const user = getActiveUser();
  const mode = (user?.themeMode ?? window.localStorage.getItem(KEY) ?? "system") as Mode;
  const preset = (user?.themePreset ?? window.localStorage.getItem(PRESET_KEY) ?? "emerald") as ThemePreset;
  const customHex = user?.themeCustomHex ?? window.localStorage.getItem(CUSTOM_KEY) ?? "#0f766e";
  return { mode, preset, customHex };
}

function saveTheme(next: Partial<{ mode: Mode; preset: ThemePreset; customHex: string }>) {
  const user = getActiveUser();
  if (!user) return;
  import("./api").then(({ updateUserApi }) =>
    updateUserApi({ data: { username: user.username, themeMode: next.mode, themePreset: next.preset, themeCustomHex: next.customHex } }).catch(() => {}),
  );
}

const CUSTOM_STYLE_KEYS = [
  "--background", "--foreground", "--card", "--card-foreground", "--popover",
  "--popover-foreground", "--secondary", "--secondary-foreground", "--muted",
  "--muted-foreground", "--accent", "--accent-foreground", "--primary",
  "--primary-foreground", "--border", "--input", "--ring", "--chart-1",
  "--sidebar", "--sidebar-foreground", "--sidebar-primary",
  "--sidebar-primary-foreground", "--sidebar-accent", "--sidebar-accent-foreground",
  "--sidebar-border", "--gradient-primary", "--shadow-3d",
];

function clearCustom() {
  const el = document.documentElement;
  CUSTOM_STYLE_KEYS.forEach((k) => el.style.removeProperty(k));
}

/** Derive a full theme from a single hex seed color. */
function applyCustom(hex: string, dark: boolean) {
  const el = document.documentElement;
  const seed = hexToRgb(hex);
  const white = [255, 255, 255] as const;
  const black = [0, 0, 0] as const;
  const l = (0.299 * seed[0] + 0.587 * seed[1] + 0.114 * seed[2]) / 255;

  const primary = dark ? lighten(seed, 0.35) : darken(seed, 0.08);
  const bg = dark ? mix(seed, black, 0.82) : mix(seed, white, 0.91);
  const card = dark ? mix(seed, black, 0.68) : mix(seed, white, 0.975);
  const muted = dark ? mix(seed, black, 0.58) : mix(seed, white, 0.84);
  const sidebar = dark ? mix(seed, black, 0.74) : mix(seed, white, 0.94);
  const fg = dark ? mix(seed, white, 0.92) : darken(seed, 0.75);
  const mutedFg = dark ? mix(seed, white, 0.55) : darken(seed, 0.45);
  const onPrimary = l > 0.62 ? "#1a1a1a" : "#ffffff";
  const gradient = dark
    ? `linear-gradient(150deg, ${rgb(lighten(primary, 0.25))} 0%, ${rgb(darken(primary, 0.12))} 100%)`
    : `linear-gradient(150deg, ${rgb(lighten(primary, 0.12))} 0%, ${rgb(darken(primary, 0.18))} 100%)`;
  const border = withAlpha(fg, dark ? 0.14 : 0.1);

  el.style.setProperty("--background", rgb(bg));
  el.style.setProperty("--foreground", rgb(fg));
  el.style.setProperty("--card", rgb(card));
  el.style.setProperty("--card-foreground", rgb(fg));
  el.style.setProperty("--popover", rgb(card));
  el.style.setProperty("--popover-foreground", rgb(fg));
  el.style.setProperty("--secondary", rgb(muted));
  el.style.setProperty("--secondary-foreground", rgb(fg));
  el.style.setProperty("--muted", rgb(muted));
  el.style.setProperty("--muted-foreground", rgb(mutedFg));
  el.style.setProperty("--accent", rgb(primary));
  el.style.setProperty("--accent-foreground", onPrimary);
  el.style.setProperty("--primary", rgb(primary));
  el.style.setProperty("--primary-foreground", onPrimary);
  el.style.setProperty("--border", border);
  el.style.setProperty("--input", withAlpha(fg, dark ? 0.18 : 0.14));
  el.style.setProperty("--ring", rgb(primary));
  el.style.setProperty("--chart-1", rgb(primary));
  el.style.setProperty("--sidebar", rgb(sidebar));
  el.style.setProperty("--sidebar-foreground", rgb(fg));
  el.style.setProperty("--sidebar-primary", rgb(primary));
  el.style.setProperty("--sidebar-primary-foreground", onPrimary);
  el.style.setProperty("--sidebar-accent", rgb(muted));
  el.style.setProperty("--sidebar-accent-foreground", rgb(fg));
  el.style.setProperty("--sidebar-border", border);
  el.style.setProperty("--gradient-primary", gradient);
  el.style.setProperty("--shadow-3d", withAlpha(primary, 0.22));
}

type RGB = [number, number, number];
function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: RGB, b: readonly [number, number, number], t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
function lighten(c: RGB, t: number): RGB {
  return mix(c, [255, 255, 255], t);
}
function darken(c: RGB, t: number): RGB {
  return mix(c, [0, 0, 0], t);
}
function rgb(c: RGB): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
function withAlpha(c: RGB, a: number): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
}

export function useTheme() {
  const [mode, setModeState] = useState<Mode>("system");
  const [preset, setPresetState] = useState<ThemePreset>("emerald");
  const [customHex, setCustomHexState] = useState<string>("#0f766e");

  useEffect(() => {
    const loadTheme = () => {
      const next = readTheme();
      setModeState(next.mode);
      setPresetState(next.preset);
      setCustomHexState(next.customHex);
      window.localStorage.setItem(KEY, next.mode);
      window.localStorage.setItem(PRESET_KEY, next.preset);
      window.localStorage.setItem(CUSTOM_KEY, next.customHex);
      apply(next.mode, next.preset, next.customHex);
    };
    loadTheme();

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = readTheme();
      apply(next.mode, next.preset, next.customHex);
    };
    window.addEventListener("smartbudget:user-changed", loadTheme);
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("smartbudget:user-changed", loadTheme);
    };
  }, []);

  const setMode = (next: Mode) => {
    setModeState(next);
    window.localStorage.setItem(KEY, next);
    apply(next, preset);
    saveTheme({ mode: next });
  };

  const setPreset = (next: ThemePreset) => {
    setPresetState(next);
    window.localStorage.setItem(PRESET_KEY, next);
    apply(mode, next);
    saveTheme({ preset: next });
  };

  const setCustomHex = (next: string) => {
    const clean = next.trim().replace(/^#/, "");
    const hex = /^[0-9a-fA-F]{6}$/.test(clean) ? `#${clean}` : next;
    setCustomHexState(hex);
    window.localStorage.setItem(CUSTOM_KEY, hex);
    saveTheme({ customHex: hex });
    const selected = window.localStorage.getItem(PRESET_KEY) as ThemePreset | null;
    if (selected === "custom" && /^#[0-9a-fA-F]{6}$/.test(hex)) apply(mode, "custom");
  };

  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return {
    mode,
    preset,
    customHex,
    setMode,
    setPreset,
    setCustomHex,
    toggle: () => setMode(isDark ? "light" : "dark"),
  };
}
