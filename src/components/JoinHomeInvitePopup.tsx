import { useState, useEffect } from "react";
import { Home, ScanFace, Check, X, ShieldCheck, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { joinHousehold, getActiveHousehold, useDB } from "@/lib/store";
import { unlock, getActiveUser, isBiometricEnabled, unlockWithBiometrics } from "@/lib/lock";
import { cn } from "@/lib/utils";

export function JoinHomeInvitePopup() {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [step, setStep] = useState<"ask" | "auth">("ask");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const biometric = isBiometricEnabled();
  const db = useDB();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const joinParam = urlParams.get("join") || urlParams.get("invite");
    if (joinParam) {
      setInviteCode(joinParam.trim().toUpperCase());
    }
  }, []);

  if (!inviteCode) return null;

  function closePopup() {
    setInviteCode(null);
    setStep("ask");
    setPassword("");
    setError("");
    // Clean URL parameter
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("join");
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.pathname);
    }
  }

  function handleAcceptClick() {
    setStep("auth");
  }

  async function handleBiometricAuth() {
    setError("");
    setBusy(true);
    const res = await unlockWithBiometrics();
    setBusy(false);
    if (res.ok) {
      completeJoin();
    } else {
      setError(res.error ?? "Biometric verification failed. Use password below.");
    }
  }

  async function handlePasswordAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return setError("Please enter password");
    setBusy(true);
    const ok = await unlock(password, getActiveUser()?.username ?? "");
    setBusy(false);
    if (ok) {
      completeJoin();
    } else {
      setError("Incorrect password");
    }
  }

  async function completeJoin() {
    if (!inviteCode) return;
    setBusy(true);
    const ok = await joinHousehold(inviteCode);
    setBusy(false);
    if (ok) {
      toast.success(`Joined Home (${inviteCode})!`);
      closePopup();
    } else {
      setError("Could not join home. Invalid share code.");
    }
  }

  return (
    <Dialog open={!!inviteCode} onOpenChange={(o) => !o && closePopup()}>
      <DialogContent
        className={cn(
          "max-w-md overflow-hidden rounded-3xl border-border bg-card p-6 shadow-2xl no-select",
          "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[32px]",
        )}
      >
        <DialogHeader className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl gradient-primary text-primary-foreground shadow-lg">
            <Home className="h-8 w-8" />
          </div>
          <DialogTitle className="text-xl font-bold">
            {step === "ask" ? "Home Invitation" : "Confirm Identity"}
          </DialogTitle>
          <span className="num mx-auto mt-1 inline-block rounded-xl border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            Code: {inviteCode}
          </span>
        </DialogHeader>

        {step === "ask" && (
          <div className="space-y-6 pt-2 text-center">
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-foreground">
                Do you want to join this Shared Home?
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed px-4">
                Joining gives you shared access to add, edit, and view this home’s accounts,
                budgets, and transactions in its isolated database.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closePopup}
                className="h-12 rounded-2xl font-bold border-border hover:bg-muted"
              >
                <X className="mr-1.5 h-4 w-4" /> No (Decline)
              </Button>

              <Button
                type="button"
                onClick={handleAcceptClick}
                className="h-12 rounded-2xl font-bold gradient-primary text-primary-foreground shadow"
              >
                <Check className="mr-1.5 h-4 w-4" /> Yes (Join Home)
              </Button>
            </div>
          </div>
        )}

        {step === "auth" && (
          <div className="space-y-4 pt-2">
            <p className="text-center text-xs text-muted-foreground">
              Please verify your identity using Face ID or Password to complete joining.
            </p>

            {biometric && (
              <button
                type="button"
                onClick={handleBiometricAuth}
                disabled={busy}
                className="tap flex w-full items-center justify-center gap-2.5 rounded-2xl border border-primary/30 bg-primary/10 py-3.5 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
              >
                <ScanFace className="h-5 w-5" />
                {busy ? "Scanning Face ID…" : "Confirm with Face ID / Touch ID"}
              </button>
            )}

            <form onSubmit={handlePasswordAuth} className="space-y-3 pt-1">
              <Input
                type="password"
                autoFocus={!biometric}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                className="h-12 rounded-2xl text-center"
              />
              {error && (
                <p className="text-center text-xs font-semibold text-destructive">{error}</p>
              )}
              <Button type="submit" disabled={busy} className="h-12 w-full rounded-2xl font-bold">
                {busy ? "Verifying…" : "Confirm & Join"}
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
