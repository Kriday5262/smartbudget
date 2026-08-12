import { useState } from "react";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { unlock } from "@/lib/lock";

export function LockScreen() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await unlock(password);
    setBusy(false);
    if (!ok) {
      setError("That password doesn't match");
      setPassword("");
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-6">
      <form onSubmit={submit} className="animate-fade-up w-full max-w-xs space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="num flex h-14 w-14 items-center justify-center rounded-3xl gradient-primary text-xl text-primary-foreground">
            ₹
          </span>
          <div>
            <h1 className="text-xl font-bold">SmartBudget</h1>
            <p className="text-sm text-muted-foreground">Enter your password to continue</p>
          </div>
        </div>

        <div className="space-y-2 text-left">
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            className="h-12 rounded-2xl text-center"
          />
          {error && <p className="text-center text-xs text-destructive">{error}</p>}
        </div>

        <Button type="submit" disabled={busy} className="h-12 w-full rounded-2xl font-bold">
          {busy ? "Checking…" : "Unlock"}
        </Button>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" /> Everything stays on this device
        </p>
      </form>
    </main>
  );
}
