import { useState } from "react";
import { Lock, UserPlus, LogIn } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { unlock, changePassword, registerUser } from "@/lib/lock";

type AuthMode = "login" | "register" | "reset";

export function LockScreen() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetUser, setResetUser] = useState<{ username: string; current: string } | null>(null);

  const [remember, setRemember] = useState(true);

  async function completeUnlock(
    user: { username: string; current: string },
    rememberMe: boolean,
    newPassword?: string,
  ) {
    if (newPassword) {
      const changed = await changePassword(user.current, newPassword);
      if (!changed) {
        setError("Could not update the password. Try again.");
        setBusy(false);
        return;
      }
    }
    const res = await unlock(newPassword ?? user.current, user.username, rememberMe);
    if (!res.ok) {
      setError("Could not complete sign-in. Try again.");
      setBusy(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return setError("Please enter username");
    setBusy(true);
    const res = await unlock(password, username.trim(), remember);
    setBusy(false);
    if (!res.ok) {
      setError("Incorrect username or password");
      setPassword("");
      return;
    }
    if (res.needsReset) {
      setResetUser({ username: username.trim(), current: password });
      setPassword("");
      setConfirm("");
      setMode("reset");
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Please enter your name");
    if (!username.trim()) return setError("Please enter a username");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    const res = await registerUser(name.trim(), username.trim(), password, remember);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Registration failed");
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!resetUser) return;
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    await completeUnlock(resetUser, remember, password);
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-6">
      <div className="animate-fade-up w-full max-w-xs space-y-5 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="num flex h-14 w-14 items-center justify-center rounded-3xl gradient-primary text-xl text-primary-foreground shadow-lg">
            ₹
          </span>
          <div>
            <h1 className="text-xl font-bold">SmartBudget</h1>
            <p className="text-xs text-muted-foreground">Authentication required every session</p>
          </div>
        </div>

        {/* Auth Mode Tabs */}
        {mode !== "reset" && (
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className={`tap flex items-center justify-center gap-1 rounded-xl py-2 transition-all ${
              mode === "login" ? "bg-card text-foreground shadow" : "text-muted-foreground"
            }`}
          >
            <LogIn className="h-3.5 w-3.5" /> Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError("");
            }}
            className={`tap flex items-center justify-center gap-1 rounded-xl py-2 transition-all ${
              mode === "register" ? "bg-card text-foreground shadow" : "text-muted-foreground"
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" /> Create
          </button>
          </div>
        )}

        {mode === "login" && (
          <form onSubmit={handleLogin} className="space-y-3 pt-1 text-left">
            <div>
              <Input
                type="text"
                autoFocus
                placeholder="Username (e.g. admin)"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                className="h-11 rounded-2xl"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                className="h-11 rounded-2xl"
              />
            </div>
            <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span>Remember me (Infinite browser cookie)</span>
            </label>
            <Button type="submit" disabled={busy} className="h-11 w-full rounded-2xl font-bold">
              {busy ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        )}

        {mode === "register" && (
          <form onSubmit={handleRegister} className="space-y-3 pt-1 text-left">
            <div>
              <Input
                type="text"
                autoFocus
                placeholder="Full Name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                className="h-11 rounded-2xl"
              />
            </div>
            <div>
              <Input
                type="text"
                placeholder="Choose Username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                className="h-11 rounded-2xl"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Choose Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                className="h-11 rounded-2xl"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Confirm Password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError("");
                }}
                className="h-11 rounded-2xl"
              />
            </div>
            <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span>Remember me (Infinite browser cookie)</span>
            </label>
            <Button type="submit" disabled={busy} className="h-11 w-full rounded-2xl font-bold">
              {busy ? "Creating Account…" : "Create Account"}
            </Button>
          </form>
        )}

        {mode === "reset" && (
          <form onSubmit={handleReset} className="space-y-3 pt-1 text-left">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{resetUser?.username}</strong> still uses the old
              shared password. Set a new personal password to continue.
            </p>
            <div>
              <Input
                type="password"
                autoFocus
                placeholder="New Password (min 8 chars)"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                className="h-11 rounded-2xl"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Confirm New Password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError("");
                }}
                className="h-11 rounded-2xl"
              />
            </div>
            <Button type="submit" disabled={busy} className="h-11 w-full rounded-2xl font-bold">
              {busy ? "Updating password…" : "Set New Password & Continue"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setResetUser(null);
                setError("");
              }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </form>
        )}

        {error && <p className="text-center text-xs font-semibold text-destructive">{error}</p>}

        <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Authentication required on every visit
        </p>
      </div>
    </main>
  );
}
