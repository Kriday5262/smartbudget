import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Landmark, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDB, addLoan, updateLoan, deleteLoan, type Loan } from "@/lib/store";
import { money } from "@/lib/format";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/loans")({
  head: () => ({
    meta: [
      { title: "Loans — Track what you owe | SmartBudget" },
      {
        name: "description",
        content:
          "Track home, car and personal loans in rupees with borrowed amounts, outstanding balances and interest rates.",
      },
      { property: "og:title", content: "Loans — Track what you owe | SmartBudget" },
      {
        property: "og:description",
        content: "Track loans with borrowed amounts, outstanding balances and interest rates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoansPage,
});

function LoansPage() {
  const db = useDB();
  const hydrated = useHydrated();
  const [editing, setEditing] = useState<Loan | undefined>();
  const [creating, setCreating] = useState(false);

  if (!hydrated) return <div className="shimmer h-96 rounded-2xl" />;

  const outstanding = (db.loans ?? []).reduce((s, l) => s + l.outstanding, 0);
  const borrowed = (db.loans ?? []).reduce((s, l) => s + l.principal, 0);

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Loans</h1>
          <p className="text-sm text-muted-foreground">
            {money(outstanding)} outstanding across {(db.loans ?? []).length} loan
            {(db.loans ?? []).length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="tap flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> New
        </button>
      </header>

      {(db.loans ?? []).length === 0 && (
        <p className="surface px-4 py-10 text-center text-sm text-muted-foreground">
          No loans yet. Tap “New” to track a home, car or personal loan.
        </p>
      )}

      <ul className="space-y-2.5">
        {(db.loans ?? []).map((l) => {
          const pct = l.principal > 0 ? Math.min(1, l.outstanding / l.principal) : 0;
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => setEditing(l)}
                className="tap surface relative w-full overflow-hidden px-4 py-3.5 text-left"
                style={{
                  backgroundImage: `linear-gradient(90deg, color-mix(in oklab, var(--destructive) 12%, transparent) ${pct * 100}%, transparent ${pct * 100}%)`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-destructive">
                    <Landmark className="h-4 w-4" strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{l.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[
                        l.lender,
                        l.rateOfInterest ? `${l.rateOfInterest}% p.a.` : null,
                        `Borrowed ${money(l.principal)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  <span className="num shrink-0 text-sm font-bold text-destructive">
                    {money(l.outstanding)}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {borrowed > 0 && (
        <div className="surface flex items-center justify-between px-4 py-3 text-xs">
          <span className="font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Paid off
          </span>
          <span className="num font-bold text-primary">{money(borrowed - outstanding)}</span>
        </div>
      )}

      <Dialog open={creating || !!editing} onOpenChange={(o) => !o && (setCreating(false), setEditing(undefined))}>
        <DialogContent
          className={cn(
            "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
            "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
            "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          )}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Edit loan" : "New loan"}</DialogTitle>
          </DialogHeader>
          <LoanForm
            key={editing?.id ?? "new"}
            loan={editing}
            onClose={() => {
              setCreating(false);
              setEditing(undefined);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LoanForm({ loan, onClose }: { loan?: Loan; onClose: () => void }) {
  const [name, setName] = useState(loan?.name ?? "");
  const [lender, setLender] = useState(loan?.lender ?? "");
  const [principal, setPrincipal] = useState(loan ? String(loan.principal) : "");
  const [outstanding, setOutstanding] = useState(loan ? String(loan.outstanding) : "");
  const [rate, setRate] = useState(loan?.rateOfInterest ? String(loan.rateOfInterest) : "");

  const save = () => {
    if (!name.trim()) return toast.error("Give the loan a name");
    const principalV = Number(principal);
    if (!principalV) return toast.error("Enter the amount borrowed");
    const outstandingV = Number(outstanding);
    if (outstandingV === undefined || Number.isNaN(outstandingV) || outstandingV < 0)
      return toast.error("Enter the outstanding balance");
    const rateV = rate ? Number(rate) : undefined;

    const data = {
      name: name.trim(),
      lender: lender.trim() || undefined,
      principal: principalV,
      outstanding: outstandingV,
      rateOfInterest: rateV && rateV > 0 ? rateV : undefined,
    };

    if (loan) {
      updateLoan(loan.id, data);
      toast.success("Loan updated");
    } else {
      addLoan(data);
      toast.success("Loan added");
    }
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Name</Label>
          <Input
            value={name}
            placeholder="Home loan"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Lender</Label>
          <Input
            value={lender}
            placeholder="HDFC"
            onChange={(e) => setLender(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Borrowed (₹)</Label>
          <Input
            className="num"
            inputMode="decimal"
            placeholder="0"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Outstanding (₹)</Label>
          <Input
            className="num"
            inputMode="decimal"
            placeholder="0"
            value={outstanding}
            onChange={(e) => setOutstanding(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Interest rate (% p.a.)</Label>
        <Input
          className="num"
          inputMode="decimal"
          placeholder="Optional"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button className="h-11 flex-1 rounded-xl font-bold" onClick={save}>
          {loan ? "Save changes" : "Add loan"}
        </Button>
        {loan && (
          <button
            type="button"
            aria-label="Delete loan"
            onClick={() => {
              deleteLoan(loan.id);
              toast.success("Loan deleted");
              onClose();
            }}
            className="tap rounded-xl border border-border p-3 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
