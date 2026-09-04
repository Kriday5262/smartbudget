import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  RotateCcw,
  Keyboard,
  Plus,
  Trash2,
  Lock as LockIcon,
  Fingerprint,
  Share2,
  Copy,
  Users,
  Home,
  Palette,
  Shield,
  CreditCard,
  Database,
  Check,
  Smartphone,
  ChevronRight,
  ChevronLeft,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Info,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useDB,
  getDB,
  addPayee,
  setSetting,
  replaceDB,
  resetDB,
  mutate,
  netWorth,
  getHouseholds,
  getActiveHousehold,
  createHousehold,
  switchHousehold,
  addHomeMember,
  type DB,
} from "@/lib/store";
import { money } from "@/lib/format";
import { useTheme, THEME_PRESETS } from "@/lib/theme";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import {
  changePassword,
  lock,
  getActiveUser,
  isBiometricEnabled,
  enableBiometrics,
  disableBiometrics,
  isRemembered,
  setRememberCookie,
  clearRememberCookie,
} from "@/lib/lock";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings — Payees, Security, Themes & Sync | SmartBudget" },
      {
        name: "description",
        content: "Manage SmartBudget themes, multi-home sync, security, and payees.",
      },
    ],
  }),
});

type IOSScreen = "main" | "appearance" | "security" | "homes" | "payees" | "data" | "shortcuts";

const SHORTCUTS = [
  ["⌥ + ⇧ + K", "Toggle keyboard spreadsheet mode"],
  ["⌥ + ← / →", "Previous / next day in keyboard mode"],
  ["Arrow keys", "Move through keyboard-mode cells"],
  ["Enter", "Edit selected keyboard-mode row"],
  ["N", "Add transaction on selected day"],
  ["⇧ + L or ⌘ / Ctrl + L", "Add transaction"],
  ["⌘ / Ctrl + Z", "Undo last change"],
  ["⌘ / Ctrl + ⇧ + Z", "Redo change"],
  ["⌘ / Ctrl + ⇧ + A", "Add account"],
  ["⌘ / Ctrl + ⇧ + C", "Add credit card"],
  ["⌘ / Ctrl + ⇧ + G", "Add goal"],
  ["Esc", "Close any popup"],
];

/** Reusable iOS Inset Group Container */
function IOSGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {title && (
        <p className="px-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      )}
      <div className="overflow-hidden rounded-[22px] border border-border/60 bg-card shadow-sm">
        {children}
      </div>
    </div>
  );
}

/** Reusable iOS Row Cell */
function IOSRow({
  icon: Icon,
  iconBg = "gradient-primary text-primary-foreground",
  title,
  subtitle,
  value,
  onClick,
  trailing,
  isLast = false,
}: {
  icon: any;
  iconBg?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  isLast?: boolean;
}) {
  const content = (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex items-center justify-between gap-3 px-4 py-3.5 transition-colors no-select",
        onClick && "tap cursor-pointer hover:bg-muted/40 active:bg-muted/70",
      )}
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] shadow-sm text-white font-bold transition-transform group-hover:scale-105",
            iconBg,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground leading-snug">{title}</p>
          {subtitle && (
            <p className="truncate text-[11px] font-medium text-muted-foreground mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {value && <span className="text-xs font-semibold text-muted-foreground">{value}</span>}
        {trailing}
        {onClick && !trailing && (
          <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
        )}
      </div>

      {!isLast && <div className="absolute bottom-0 right-0 left-14 h-[1px] bg-border/40" />}
    </div>
  );

  return content;
}

/** iOS Style Toggle Switch */
function IOSToggle({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
        checked ? "bg-emerald-500" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

export function SettingsPage() {
  const db = useDB();
  const hydrated = useHydrated();
  const { mode, setMode, preset, setPreset, customHex, setCustomHex } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [screen, setScreen] = useState<IOSScreen>("main");

  const [currentPass, setCurrentPass] = useState("");
  const [nextPass, setNextPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [busyPass, setBusyPass] = useState(false);

  const [biometricsEnabled, setBiometricsEnabled] = useState(() => isBiometricEnabled());
  const [cookieRemembered, setCookieRemembered] = useState(() => isRemembered());

  const [payee, setPayee] = useState({ name: "", vpa: "" });
  const [confirmReset, setConfirmReset] = useState(false);
  const [newHomeName, setNewHomeName] = useState("");
  const [memberName, setMemberName] = useState("");

  const activeUser = getActiveUser();
  const activeHome = getActiveHousehold(db);
  const households = getHouseholds(db);
  const activePresetInfo = THEME_PRESETS.find((p) => p.id === preset) ?? THEME_PRESETS[0];

  if (!hydrated) return <div className="shimmer h-96 rounded-[22px]" />;

  async function handlePasswordSave() {
    if (nextPass.length < 4) return toast.error("Password must be at least 4 characters");
    if (nextPass !== confirmPass) return toast.error("New passwords do not match");
    setBusyPass(true);
    const ok = await changePassword(currentPass, nextPass);
    setBusyPass(false);
    if (!ok) return toast.error("Current password is incorrect");
    setCurrentPass("");
    setNextPass("");
    setConfirmPass("");
    toast.success("Password updated successfully!");
  }

  async function handleBiometricToggle(val: boolean) {
    if (!val) {
      disableBiometrics();
      setBiometricsEnabled(false);
      toast.success("Biometric unlock disabled");
    } else {
      const res = await enableBiometrics();
      if (res.ok) {
        setBiometricsEnabled(true);
        toast.success("Face ID / Touch ID enabled!");
      } else {
        toast.error(res.error ?? "Could not enable biometrics");
      }
    }
  }

  function handleCookieToggle(val: boolean) {
    if (!val) {
      clearRememberCookie();
      setCookieRemembered(false);
      toast.success("Remember cookie removed. Auth required next visit.");
    } else {
      setRememberCookie(true, true);
      setCookieRemembered(true);
      toast.success("Infinite browser cookie enabled!");
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(getDB(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartbudget-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  }

  function importData(file: File) {
    file
      .text()
      .then((txt) => {
        const next = JSON.parse(txt) as DB;
        if (!next.accounts || !next.transactions) throw new Error("bad file");
        replaceDB(next);
        toast.success("Data restored");
      })
      .catch(() => toast.error("That file isn't a SmartBudget backup"));
  }

  function copyCode() {
    navigator.clipboard.writeText(activeHome.code);
    toast.success("Share code copied: " + activeHome.code);
  }

  function copyLink() {
    const origin =
      typeof window !== "undefined" && window.location.hostname === "budget.smarthomeskc.me"
        ? window.location.origin
        : "https://budget.smarthomeskc.me";
    const url = `${origin}/?join=${activeHome.code}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied: " + url);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      {/* iOS Top Navigation Bar */}
      <div className="flex items-center justify-between pt-1">
        {screen !== "main" ? (
          <button
            onClick={() => setScreen("main")}
            className="tap -ml-2 inline-flex items-center text-sm font-bold text-primary hover:opacity-80"
          >
            <ChevronLeft className="h-5 w-5" /> Settings
          </button>
        ) : (
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Settings</h1>
        )}

        {screen === "main" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => lock()}
            className="rounded-full border-border text-xs font-bold shadow-xs"
          >
            <LockIcon className="mr-1.5 h-3.5 w-3.5 text-primary" /> Lock
          </Button>
        )}
      </div>

      {/* Main Settings Screen */}
      {screen === "main" && (
        <div className="space-y-6 animate-native-slide">
          {/* iOS Profile Header Card */}
          <IOSGroup>
            <div className="flex items-center gap-4 p-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full gradient-primary text-2xl font-black text-primary-foreground shadow-md select-none">
                {activeUser?.name?.[0] ?? "S"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-extrabold text-foreground">
                  {activeUser?.name ?? "Guest"}
                </p>
                <p className="truncate text-xs font-medium text-muted-foreground mt-0.5">
                  {activeHome.name} · {db.accounts.length} Accounts · {money(netWorth(db))}
                </p>
              </div>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary shrink-0">
                Primary
              </span>
            </div>
          </IOSGroup>

          {/* Group 1: Appearance & Security */}
          <IOSGroup title="Preferences & Security">
            <IOSRow
              icon={Palette}
              iconBg="bg-teal-500"
              title="Appearance & Themes"
              subtitle={`Mode: ${mode.toUpperCase()} · Theme: ${activePresetInfo.label}`}
              onClick={() => setScreen("appearance")}
            />
            <IOSRow
              icon={ShieldCheck}
              iconBg="bg-emerald-500"
              title="Security & Lock"
              subtitle={biometricsEnabled ? "Face ID Enabled" : "Passkey / Password"}
              onClick={() => setScreen("security")}
              isLast
            />
          </IOSGroup>

          {/* Group 2: Shared Homes & Sync */}
          <IOSGroup title="Smart Home & Network">
            <IOSRow
              icon={Home}
              iconBg="bg-indigo-500"
              title="Shared Homes & SQLite Sync"
              subtitle={`Active: ${activeHome.name} (${households.length} Homes)`}
              onClick={() => setScreen("homes")}
              isLast
            />
          </IOSGroup>

          {/* Group 3: Payees & UPI */}
          <IOSGroup title="Payments & Payees">
            <IOSRow
              icon={CreditCard}
              iconBg="bg-amber-500"
              title="Payees & UPI VPA"
              subtitle={`${db.payees.length} Saved Payees`}
              onClick={() => setScreen("payees")}
              isLast
            />
          </IOSGroup>

          {/* Group 4: Data & Backup */}
          <IOSGroup title="System & Data">
            <IOSRow
              icon={Database}
              iconBg="bg-slate-600"
              title="Data & Backup"
              subtitle="Export JSON, Import restore, Reset data"
              onClick={() => setScreen("data")}
            />
            <IOSRow
              icon={Keyboard}
              iconBg="bg-purple-600"
              title="Keyboard Shortcuts"
              subtitle="Cheatsheet for power users"
              onClick={() => setScreen("shortcuts")}
              isLast
            />
          </IOSGroup>
        </div>
      )}

      {/* Sub-Screen: Appearance & Themes */}
      {screen === "appearance" && (
        <div className="space-y-6 animate-native-slide">
          <IOSGroup title="Display Mode">
            <div className="p-3">
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-muted p-1.5">
                {(
                  [
                    { k: "light", label: "Light", icon: Sun },
                    { k: "dark", label: "Dark", icon: Moon },
                    { k: "system", label: "System", icon: Monitor },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.k}
                    onClick={() => setMode(o.k)}
                    className={cn(
                      "tap flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all",
                      mode === o.k
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <o.icon className="h-3.5 w-3.5" />
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </IOSGroup>

          <IOSGroup title="10 Color Palette Themes">
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tap any theme preset to instantly change the entire app's accent and visual theme.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                {THEME_PRESETS.map((p) => {
                  const active = preset === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPreset(p.id);
                        toast.success(`Theme set to ${p.label}`);
                      }}
                      className={cn(
                        "tap relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all",
                        active
                          ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20"
                          : "border-border bg-card hover:bg-muted/50",
                      )}
                    >
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full shadow-inner"
                        style={{ background: p.primaryColor }}
                      >
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ background: p.accentColor }}
                        />
                      </div>
                      <span className="text-xs font-bold truncate w-full text-foreground">
                        {p.label}
                      </span>
                      {active && (
                        <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full gradient-primary text-[9px] text-primary-foreground font-black">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </IOSGroup>

          {/* Custom Theme */}
          <IOSGroup title="Custom Theme">
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pick any color and the whole palette — background, cards, sidebar, gradients —
                is generated automatically from it.
              </p>
              <div className="flex items-center gap-3">
                <label
                  className={cn(
                    "tap relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 transition-all",
                    preset === "custom"
                      ? "border-primary shadow-sm ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(customHex) ? customHex : "#0f766e"}
                    onChange={(e) => {
                      setPreset("custom");
                      setCustomHex(e.target.value);
                      toast.success("Custom theme applied");
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Custom theme color"
                  />
                  <span
                    className="h-6 w-6 rounded-full shadow-inner"
                    style={{ background: customHex }}
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={customHex}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomHex(v);
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                        setPreset("custom");
                        toast.success("Custom theme applied");
                      }
                    }}
                    placeholder="#0f766e"
                    className="h-11 w-full rounded-2xl border border-input bg-card px-3 font-mono text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </div>
                {preset === "custom" && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                    Active
                  </span>
                )}
              </div>
            </div>
          </IOSGroup>
        </div>
      )}

      {/* Sub-Screen: Security & Lock */}
      {screen === "security" && (
        <div className="space-y-6 animate-native-slide">
          <IOSGroup title="Biometrics & Device Unlock">
            <IOSRow
              icon={Fingerprint}
              iconBg="bg-emerald-500"
              title="Face ID / Touch ID"
              subtitle="Unlock SmartBudget with device biometrics"
              trailing={<IOSToggle checked={biometricsEnabled} onChange={handleBiometricToggle} />}
            />
            <IOSRow
              icon={Smartphone}
              iconBg="bg-blue-500"
              title="Remember Device Cookie"
              subtitle="Keep session logged in infinitely on this browser"
              trailing={<IOSToggle checked={cookieRemembered} onChange={handleCookieToggle} />}
              isLast
            />
          </IOSGroup>

          <IOSGroup title="Password Management">
            <div className="p-4 space-y-3">
              <Input
                type="password"
                placeholder="Current password"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                className="h-11 rounded-2xl"
              />
              <Input
                type="password"
                placeholder="New password"
                value={nextPass}
                onChange={(e) => setNextPass(e.target.value)}
                className="h-11 rounded-2xl"
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                className="h-11 rounded-2xl"
              />
              <Button
                onClick={handlePasswordSave}
                disabled={busyPass || !currentPass || !nextPass}
                className="h-11 w-full rounded-2xl font-bold gradient-primary text-primary-foreground shadow"
              >
                {busyPass ? "Updating…" : "Update Password"}
              </Button>
            </div>
          </IOSGroup>
        </div>
      )}

      {/* Sub-Screen: Shared Homes & Sync */}
      {screen === "homes" && (
        <div className="space-y-6 animate-native-slide">
          <IOSGroup title="Active Home Share & Invite">
            <IOSRow
              icon={Home}
              iconBg="bg-indigo-500"
              title={activeHome.name}
              subtitle={`Code: ${activeHome.code} · ${activeHome.members.length} Members`}
              value="Active"
            />
            <div className="flex gap-2 p-3 bg-muted/20 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="flex-1 rounded-xl font-bold text-xs border-border"
              >
                <Share2 className="mr-1.5 h-3.5 w-3.5 text-primary" /> Copy Invite Link
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={copyCode}
                className="flex-1 rounded-xl font-bold text-xs border-border"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> Copy Code
              </Button>
            </div>
          </IOSGroup>

          <IOSGroup title="Switch Household Database">
            {households.map((h, i) => (
              <IOSRow
                key={h.id}
                icon={Home}
                iconBg={
                  h.id === activeHome.id
                    ? "gradient-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }
                title={h.name}
                subtitle={`Code: ${h.code}`}
                onClick={() => {
                  switchHousehold(h.id);
                  toast.success(`Switched to ${h.name}`);
                }}
                trailing={
                  h.id === activeHome.id ? <Check className="h-5 w-5 text-primary" /> : null
                }
                isLast={i === households.length - 1}
              />
            ))}
          </IOSGroup>

          <IOSGroup title="Create New Shared Home">
            <div className="p-4 space-y-3">
              <Input
                placeholder="Home Name (e.g. Vacation Home)"
                value={newHomeName}
                onChange={(e) => setNewHomeName(e.target.value)}
                className="h-11 rounded-2xl"
              />
              <Button
                onClick={() => {
                  if (!newHomeName.trim()) return toast.error("Enter home name");
                  createHousehold(newHomeName.trim());
                  setNewHomeName("");
                  toast.success("Home created!");
                }}
                className="h-11 w-full rounded-2xl font-bold gradient-primary text-primary-foreground shadow"
              >
                <Plus className="mr-1.5 h-4 w-4" /> Create Home
              </Button>
            </div>
          </IOSGroup>

          <IOSGroup title={`Home Members (${activeHome.members.length})`}>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {activeHome.members.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold text-foreground"
                  >
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {m.name} {m.role === "owner" && "(Owner)"}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="Member Name (e.g. Spouse)"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  className="h-11 rounded-2xl"
                />
                <Button
                  onClick={() => {
                    if (!memberName.trim()) return toast.error("Enter member name");
                    addHomeMember(memberName.trim());
                    setMemberName("");
                    toast.success("Member added!");
                  }}
                  variant="secondary"
                  className="h-11 rounded-2xl font-bold shrink-0"
                >
                  Add Member
                </Button>
              </div>
            </div>
          </IOSGroup>
        </div>
      )}

      {/* Sub-Screen: Payees & UPI */}
      {screen === "payees" && (
        <div className="space-y-6 animate-native-slide">
          <IOSGroup title={`Saved Payees (${db.payees.length})`}>
            {db.payees.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground italic">No saved payees yet.</div>
            ) : (
              db.payees.map((p, i) => (
                <IOSRow
                  key={p.id}
                  icon={CreditCard}
                  iconBg="bg-amber-500"
                  title={p.name}
                  subtitle={p.upiVpa || "No UPI ID set"}
                  trailing={
                    <button
                      aria-label={`Delete ${p.name}`}
                      onClick={() => {
                        mutate((d) => (d.payees = d.payees.filter((x) => x.id !== p.id)));
                        toast.success("Payee removed");
                      }}
                      className="tap rounded-xl p-2 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  }
                  isLast={i === db.payees.length - 1}
                />
              ))
            )}
          </IOSGroup>

          <IOSGroup title="Add New Payee">
            <div className="p-4 space-y-3">
              <Input
                placeholder="Payee Name"
                value={payee.name}
                onChange={(e) => setPayee({ ...payee, name: e.target.value })}
                className="h-11 rounded-2xl"
              />
              <Input
                placeholder="UPI ID (e.g. name@upi)"
                value={payee.vpa}
                onChange={(e) => setPayee({ ...payee, vpa: e.target.value })}
                className="h-11 rounded-2xl"
              />
              <Button
                onClick={() => {
                  if (!payee.name.trim()) return toast.error("Enter payee name");
                  addPayee(payee.name.trim(), payee.vpa.trim() || undefined);
                  setPayee({ name: "", vpa: "" });
                  toast.success("Payee added");
                }}
                className="h-11 w-full rounded-2xl font-bold gradient-primary text-primary-foreground shadow"
              >
                <Plus className="mr-1.5 h-4 w-4" /> Save Payee
              </Button>
            </div>
          </IOSGroup>

          <IOSGroup title="Pay Link Base URL">
            <div className="p-4 space-y-2">
              <Input
                placeholder="https://budget.smarthomeskc.me"
                value={db.settings.payLinkBase ?? ""}
                onChange={(e) => setSetting("payLinkBase", e.target.value)}
                className="h-11 rounded-2xl"
              />
            </div>
          </IOSGroup>
        </div>
      )}

      {/* Sub-Screen: Data & Backup */}
      {screen === "data" && (
        <div className="space-y-6 animate-native-slide">
          <IOSGroup title="Backup & Restore">
            <IOSRow
              icon={Download}
              iconBg="bg-blue-500"
              title="Export JSON Backup"
              subtitle="Download a complete copy of all your accounts and transactions"
              onClick={exportData}
            />
            <IOSRow
              icon={Upload}
              iconBg="bg-emerald-500"
              title="Import JSON Backup"
              subtitle="Restore data from a previously downloaded JSON file"
              onClick={() => fileRef.current?.click()}
              isLast
            />
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importData(f);
              }}
            />
          </IOSGroup>

          <IOSGroup title="Emergency Reset">
            <div className="p-4">
              <Button
                variant="destructive"
                className="w-full h-11 rounded-2xl font-bold shadow-sm"
                onClick={() => setConfirmReset(true)}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Reset Local Data & Reload
              </Button>
            </div>
          </IOSGroup>
        </div>
      )}

      {/* Sub-Screen: Shortcuts */}
      {screen === "shortcuts" && (
        <div className="space-y-6 animate-native-slide">
          <IOSGroup title="Keyboard Cheatsheet">
            {SHORTCUTS.map(([keys, what], i) => (
              <IOSRow
                key={keys}
                icon={Keyboard}
                iconBg="bg-purple-600"
                title={what}
                trailing={
                  <span className="num rounded-xl border border-border bg-card px-2.5 py-1 text-xs font-bold text-primary shadow-2xs">
                    {keys}
                  </span>
                }
                isLast={i === SHORTCUTS.length - 1}
              />
            ))}
          </IOSGroup>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="rounded-[24px] border-border bg-card p-6 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-destructive">
              Reset local data?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
              This resets your in-browser state. Make sure you have exported a JSON backup first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11 rounded-2xl font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-2xl font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                resetDB();
                toast.success("Database reset to defaults");
              }}
            >
              Reset Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
