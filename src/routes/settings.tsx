import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
  type DB,
} from "@/lib/store";
import { money } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { changePassword, lock } from "@/lib/lock";

function PasswordRows() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (next.length < 4) return toast.error("Use at least 4 characters");
    if (next !== confirm) return toast.error("New passwords don't match");
    setBusy(true);
    const ok = await changePassword(current, next);
    setBusy(false);
    if (!ok) return toast.error("Current password is incorrect");
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Password updated");
  }

  return (
    <>
      <Row className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Change password</Label>
        <Input
          type="password"
          autoComplete="current-password"
          placeholder="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Input
          type="password"
          autoComplete="new-password"
          placeholder="New password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Input
          type="password"
          autoComplete="new-password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button disabled={busy} className="w-full rounded-xl font-bold" onClick={save}>
          Update password
        </Button>
      </Row>
      <Row>
        <button
          onClick={() => lock()}
          className="tap flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-bold"
        >
          <LockIcon className="h-3.5 w-3.5" /> Lock app now
        </button>
      </Row>
      <Row>
        <p className="text-[11px] text-muted-foreground">
          The default password is admin123. The lock is a device passcode for this browser — your
          data never leaves it.
        </p>
      </Row>
    </>
  );
}


export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Payees, data & guide | SmartBudget" },
      {
        name: "description",
        content:
          "Choose your theme, manage payees and UPI ids, back up or restore your budget data, and read the SmartBudget guide.",
      },
      { property: "og:title", content: "Settings — Payees, data & guide | SmartBudget" },
      {
        property: "og:description",
        content: "Theme, payees, UPI settings, backup and restore, and the SmartBudget guide.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h2>
      <div className="surface divide-y divide-border overflow-hidden">{children}</div>
    </section>
  );
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-4 py-3", className)}>{children}</div>;
}

const SHORTCUTS: [string, string][] = [
  ["⌘ / Ctrl + L", "Add transaction"],
  ["⌘ / Ctrl + ⇧ + A", "Add account"],
  ["⌘ / Ctrl + ⇧ + C", "Add credit card"],
  ["⌘ / Ctrl + ⇧ + G", "Add goal"],
  ["Esc", "Close any popup"],
];

function SettingsPage() {
  const db = useDB();
  const hydrated = useHydrated();
  const { mode, setMode } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [payee, setPayee] = useState({ name: "", vpa: "" });
  const [confirmReset, setConfirmReset] = useState(false);

  if (!hydrated) return <div className="shimmer h-96 rounded-2xl" />;

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

  return (
    <div className="space-y-6 pb-4">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          {db.accounts.length} accounts · {db.transactions.length} transactions ·{" "}
          {money(netWorth(db))} net worth
        </p>
      </header>

      <Section title="Appearance">
        <Row>
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
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
                  "tap flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold",
                  mode === o.k
                    ? "bg-card text-foreground shadow-[var(--shadow-card)]"
                    : "text-muted-foreground",
                )}
              >
                <o.icon className="h-3.5 w-3.5" />
                {o.label}
              </button>
            ))}
          </div>
        </Row>
        <Row className="flex items-center justify-between">
          <span className="text-sm font-semibold">Currency</span>
          <span className="num text-sm text-muted-foreground">₹ Indian Rupee</span>
        </Row>
      </Section>

      <Section title="Payees & UPI">
        {db.payees.length === 0 && (
          <Row>
            <p className="text-sm text-muted-foreground">No payees saved yet.</p>
          </Row>
        )}
        {db.payees.map((p) => (
          <Row key={p.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.name}</p>
              {p.upiVpa && (
                <p className="truncate text-[11px] text-muted-foreground">{p.upiVpa}</p>
              )}
            </div>
            <button
              aria-label={`Delete ${p.name}`}
              onClick={() => {
                mutate((d) => (d.payees = d.payees.filter((x) => x.id !== p.id)));
                toast.success("Payee removed");
              }}
              className="tap rounded-lg p-2 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Row>
        ))}
        <Row className="flex items-center gap-2">
          <Input
            placeholder="Name"
            value={payee.name}
            onChange={(e) => setPayee({ ...payee, name: e.target.value })}
          />
          <Input
            placeholder="UPI id"
            value={payee.vpa}
            onChange={(e) => setPayee({ ...payee, vpa: e.target.value })}
          />
          <button
            aria-label="Add payee"
            onClick={() => {
              if (!payee.name.trim()) return;
              addPayee(payee.name.trim(), payee.vpa.trim() || undefined);
              setPayee({ name: "", vpa: "" });
              toast.success("Payee added");
            }}
            className="tap shrink-0 rounded-xl bg-primary p-2.5 text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </Row>
        <Row className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Pay link base URL</Label>
          <Input
            value={db.settings.payLinkBase ?? ""}
            onChange={(e) => setSetting("payLinkBase", e.target.value)}
          />
        </Row>
      </Section>

      <Section title="Budget structure">
        <Row className="flex items-center justify-between">
          <span className="text-sm font-semibold">Category groups</span>
          <span className="num text-sm text-muted-foreground">{db.categoryGroups.length}</span>
        </Row>
        <Row className="flex items-center justify-between">
          <span className="text-sm font-semibold">Categories</span>
          <span className="num text-sm text-muted-foreground">{db.categories.length}</span>
        </Row>
        <Row>
          <p className="text-[11px] text-muted-foreground">
            Add, rename, reorder or delete categories from the Budget tab using the pencil icon.
          </p>
        </Row>
      </Section>

      <Section title="Data">
        <Row className="flex items-center gap-2">
          <Button variant="secondary" className="flex-1 rounded-xl font-bold" onClick={exportData}>
            <Download className="mr-1.5 h-4 w-4" /> Back up
          </Button>
          <Button
            variant="secondary"
            className="flex-1 rounded-xl font-bold"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-1.5 h-4 w-4" /> Restore
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importData(f);
              e.target.value = "";
            }}
          />
        </Row>
        <Row>
          <button
            onClick={() => setConfirmReset(true)}
            className="tap flex w-full items-center justify-center gap-1.5 rounded-xl border border-destructive/30 py-2.5 text-xs font-bold text-destructive"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to sample data
          </button>
        </Row>
        <Row>
          <p className="text-[11px] text-muted-foreground">
            Everything is stored privately in this browser. Back up before clearing site data.
          </p>
        </Row>
      </Section>

      <Section title="Security">
        <PasswordRows />
      </Section>

      <Section title="Keyboard shortcuts">

        {SHORTCUTS.map(([keys, what]) => (
          <Row key={keys} className="flex items-center justify-between">
            <span className="text-sm font-semibold">{what}</span>
            <kbd className="num rounded-lg bg-muted px-2 py-1 text-[11px] font-bold text-muted-foreground">
              {keys}
            </kbd>
          </Row>
        ))}
        <Row className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Keyboard className="h-3.5 w-3.5" /> On mobile, swipe up on the + button for more.
        </Row>
      </Section>

      <Section title="Guide">
        <Row>
          <p className="text-sm leading-relaxed text-muted-foreground">
            SmartBudget uses zero-based budgeting: every rupee sitting in your on-budget accounts
            gets assigned to a category until <strong className="text-foreground">Ready to
            Assign</strong> reaches zero. Spend from those envelopes, and top them up next month.
            Transfers between your own accounts never count as income or expense. Use SmartPay when
            you front a bill for others and want it settled over UPI.
          </p>
        </Row>
      </Section>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent
          className={cn(
            "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
            "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
            "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          )}>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset everything?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces your accounts, transactions and budget with the sample family data. It
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground"
              onClick={() => {
                resetDB();
                toast.success("Sample data restored");
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
