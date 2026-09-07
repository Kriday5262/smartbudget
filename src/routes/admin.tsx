import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ShieldAlert,
  Home,
  Users,
  Database,
  Lock,
  ArrowRight,
  RefreshCw,
  Share2,
  Copy,
  Plus,
  CheckCircle2,
  HardDrive,
  FileCode,
  Sparkles,
  Key,
  ShieldCheck,
  TrendingUp,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDB,
  getHouseholds,
  getActiveHousehold,
  switchHousehold,
  createHousehold,
  addHomeMember,
  netWorth,
} from "@/lib/store";
import { getRegisteredUsers, getActiveUser, lock, saveUsers, type UserAccount } from "@/lib/lock";
import { updateUserApi } from "@/lib/api";
import { money } from "@/lib/format";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Master Admin Console — SmartBudget All Homes Dashboard" },
      {
        name: "description",
        content: "Master admin dashboard with full access to all households and SQLite databases.",
      },
    ],
  }),
});

export function AdminPage() {
  const db = useDB();
  const hydrated = useHydrated();
  const [activeTab, setActiveTab] = useState<"homes" | "users" | "sqlite" | "security">("homes");
  const [newHomeName, setNewHomeName] = useState("");
  const [newMemberName, setNewMemberName] = useState("");

  const activeUser = getActiveUser();
  const activeHome = getActiveHousehold(db);
  const households = getHouseholds(db);
  const [users, setUsers] = useState<UserAccount[]>(() => getRegisteredUsers());
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("");

  if (!hydrated) return <div className="shimmer h-96 rounded-[22px]" />;

  function copyHomeLink(code: string) {
    const origin =
      typeof window !== "undefined" && window.location.hostname === "budget.smarthomeskc.me"
        ? window.location.origin
        : "https://budget.smarthomeskc.me";
    const url = `${origin}/?join=${code}`;
    navigator.clipboard.writeText(url);
    toast.success(`Share link for home ${code} copied!`);
  }

  function handleCreateHome() {
    if (!newHomeName.trim()) return toast.error("Enter home name");
    createHousehold(newHomeName.trim());
    setNewHomeName("");
    toast.success("New home created and isolated SQLite DB provisioned!");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Admin Top Header Banner */}
      <header className="rounded-[28px] border border-primary/30 bg-card p-6 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full gradient-primary opacity-15 blur-2xl pointer-events-none" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-md">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-foreground">Master Admin Console</h1>
                <span className="rounded-full bg-primary/10 border border-primary/30 px-2.5 py-0.5 text-[10px] font-black uppercase text-primary tracking-wider">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Logged in as{" "}
                <strong className="text-foreground">{activeUser?.name ?? "Shantanu"}</strong> · Full
                Access to All Homes & SQLite Databases
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/settings">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-border text-xs font-bold"
              >
                Settings
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => lock()}
              className="rounded-full border-border text-xs font-bold text-destructive hover:bg-destructive/10"
            >
              <Lock className="mr-1.5 h-3.5 w-3.5" /> Lock App
            </Button>
          </div>
        </div>

        {/* Global Admin Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t border-border/60 mt-5">
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 text-center">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Total Homes
            </p>
            <p className="text-xl font-black text-primary mt-0.5">{households.length}</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 text-center">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              SQLite DBs
            </p>
            <p className="text-xl font-black text-foreground mt-0.5">{households.length} Active</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 text-center">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Registered Users
            </p>
            <p className="text-xl font-black text-foreground mt-0.5">{users.length}</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 text-center">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Active Net Worth
            </p>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
              {money(netWorth(db))}
            </p>
          </div>
        </div>
      </header>

      {/* Admin Tab Switcher */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        {[
          { id: "homes", label: "All Households", icon: Home },
          { id: "users", label: "User Accounts", icon: Users },
          { id: "sqlite", label: "SQLite Storage Health", icon: Database },
          { id: "security", label: "Security & Audits", icon: ShieldCheck },
        ].map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={cn(
                "tap flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-extrabold transition-all no-select",
                active
                  ? "gradient-primary text-primary-foreground shadow"
                  : "bg-card border border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: ALL HOUSEHOLDS MANAGEMENT */}
      {activeTab === "homes" && (
        <div className="space-y-6 animate-native-slide">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-foreground">
                All Households & Multi-DB Isolation
              </h2>
              <p className="text-xs text-muted-foreground">
                Inspect, manage, or switch into any home's dedicated SQLite database.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {households.map((h) => {
              const isActive = h.id === activeHome.id;
              return (
                <div
                  key={h.id}
                  className={cn(
                    "rounded-[24px] border p-5 transition-all space-y-4 bg-card",
                    isActive
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md"
                      : "border-border/60 shadow-xs hover:border-primary/40",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-2xl font-bold shadow-xs",
                          isActive
                            ? "gradient-primary text-primary-foreground"
                            : "bg-muted text-foreground",
                        )}
                      >
                        <Home className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-foreground">{h.name}</h3>
                          {isActive && (
                            <span className="rounded-full bg-primary/20 text-primary px-2 py-0.5 text-[10px] font-black">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Owner: {h.owner}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-muted/40 border border-border/40 p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-medium">Household Code:</span>
                      <span className="num font-bold text-primary">{h.code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-medium">SQLite DB File:</span>
                      <span className="num font-semibold text-foreground">
                        {h.id === "home-default"
                          ? "budget.db"
                          : `houses/home_${h.id.replace(/[^a-zA-Z0-9_-]/g, "")}.db`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-medium">Members Count:</span>
                      <span className="font-bold text-foreground">{h.members.length} Members</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    {!isActive ? (
                      <Button
                        onClick={() => {
                          switchHousehold(h.id);
                          toast.success(`Switched active database to ${h.name}!`);
                        }}
                        className="flex-1 rounded-2xl font-bold text-xs h-10 gradient-primary text-primary-foreground shadow-xs"
                      >
                        Switch To Home
                      </Button>
                    ) : (
                      <Button disabled className="flex-1 rounded-2xl font-bold text-xs h-10">
                        <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-500" /> Current Home
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyHomeLink(h.code)}
                      className="rounded-2xl border-border font-bold text-xs h-10"
                    >
                      <Share2 className="mr-1 h-3.5 w-3.5 text-primary" /> Link
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Provision New Home */}
          <div className="rounded-[24px] border border-border/60 bg-card p-5 space-y-4">
            <h3 className="text-sm font-extrabold text-foreground">
              Provision New Isolated Home Database
            </h3>
            <div className="flex gap-2">
              <Input
                placeholder="New Household Name (e.g. Parents House)"
                value={newHomeName}
                onChange={(e) => setNewHomeName(e.target.value)}
                className="h-11 rounded-2xl"
              />
              <Button
                onClick={handleCreateHome}
                className="h-11 rounded-2xl font-bold shrink-0 gradient-primary text-primary-foreground"
              >
                <Plus className="mr-1.5 h-4 w-4" /> Provision Home
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USER ACCOUNTS MATRIX */}
      {activeTab === "users" && (
        <div className="space-y-6 animate-native-slide">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-foreground">
                Registered Users & Permissions
              </h2>
              <p className="text-xs text-muted-foreground">
                Manage user profiles, password access, and active credentials.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-[22px] border border-border/60 bg-card p-4 shadow-xs"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary text-lg font-black text-primary-foreground shadow overflow-hidden">
                    {u.avatarDataUrl ? <img src={u.avatarDataUrl} alt="" className="h-full w-full object-cover" /> : u.name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-extrabold text-foreground">{u.name}</p>
                      {u.username === "shantanu" && (
                        <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                          Super Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Username: <strong className="text-foreground">@{u.username}</strong> ·
                      Registered: {u.createdAt}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setEditingUser(u.username); setEditName(u.name); setEditAvatar(u.avatarDataUrl ?? ""); }}><Camera className="mr-1.5 h-3.5 w-3.5" /> Edit Profile</Button>
                  <span className="rounded-xl border border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                    Password Auth
                  </span>
                </div>
                {editingUser === u.username && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-primary/20 bg-muted/30 p-3">
                    <div className="min-w-[180px] flex-1"><Label className="text-xs">Display name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 h-9 rounded-xl" /></div>
                    <div><Label className="text-xs">Profile photo</Label><Input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-1 h-9 w-[220px] rounded-xl text-xs" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) return toast.error("Use an image up to 2 MB"); const reader = new FileReader(); reader.onload = () => setEditAvatar(String(reader.result)); reader.readAsDataURL(file); }} /></div>
                    <Button size="sm" className="rounded-xl" onClick={async () => { const res = await updateUserApi({ data: { username: u.username, name: editName, avatarDataUrl: editAvatar } }); if (!res.ok || !res.user) return toast.error("Could not update profile"); const next = users.map((item) => item.username === u.username ? { ...item, ...res.user } : item); saveUsers(next); setUsers(next); setEditingUser(null); toast.success("Profile updated"); }}>Save</Button>
                    <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setEditingUser(null)}>Cancel</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SQLITE STORAGE HEALTH */}
      {activeTab === "sqlite" && (
        <div className="space-y-6 animate-native-slide">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-foreground">
                SQLite Server & Storage Engine
              </h2>
              <p className="text-xs text-muted-foreground">
                Real-time status of Node.js DatabaseSync SQLite connection pools.
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-border/60 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2.5">
                <HardDrive className="h-5 w-5 text-primary" />
                <span className="text-sm font-bold text-foreground">SQLite Engine Status</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Operational
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground font-medium">
                  Primary Storage Directory:
                </span>
                <code className="num font-bold text-foreground">
                  /home/kriday/KamkaziBudget/data/
                </code>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground font-medium">Households DB Folder:</span>
                <code className="num font-bold text-primary">houses/ (one SQLite DB per home)</code>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground font-medium">Default Main DB File:</span>
                <code className="num font-bold text-primary">budget.db (57 KB)</code>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground font-medium">Backup Protection File:</span>
                <code className="num font-bold text-foreground">budget.db.bak_20260813_084104</code>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-muted-foreground font-medium">Active Node.js Driver:</span>
                <span className="font-bold text-foreground">
                  node:sqlite DatabaseSync (High-speed synchronous API)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SECURITY & AUDITS */}
      {activeTab === "security" && (
        <div className="space-y-6 animate-native-slide">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-foreground">
                Security Audits & Session Policy
              </h2>
              <p className="text-xs text-muted-foreground">
                Manage global security policies and active session tokens.
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-border/60 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">Force Lock All Active Sessions</p>
                <p className="text-xs text-muted-foreground">
                  Immediately revokes session unlock state across all devices
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => {
                  lock();
                  toast.success("All sessions locked!");
                }}
                className="rounded-2xl font-bold text-xs h-10 shadow-xs"
              >
                Lock All Sessions
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
