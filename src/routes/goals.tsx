import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Target, Trash2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDB, contributeToGoal, deleteGoal, updateGoal, type Goal } from "@/lib/store";
import { money, prettyDate } from "@/lib/format";
import { useHydrated } from "@/hooks/use-hydrated";
import { uiActions } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Goals — Save for what matters | SmartBudget" },
      {
        name: "description",
        content:
          "Track family savings goals in rupees with progress bars, funded percentages and quick top-ups.",
      },
      { property: "og:title", content: "Goals — Save for what matters | SmartBudget" },
      {
        property: "og:description",
        content: "Track savings goals with progress bars and funded percentages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GoalsPage,
});

function GoalsPage() {
  const db = useDB();
  const hydrated = useHydrated();
  const [editing, setEditing] = useState<Goal | undefined>();

  if (!hydrated) return <div className="shimmer h-96 rounded-2xl" />;

  const totalTarget = db.goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = db.goals.reduce((s, g) => s + g.saved, 0);

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="text-sm text-muted-foreground">
            {money(totalSaved)} of {money(totalTarget)} saved
          </p>
        </div>
        <button
          onClick={() => uiActions.openAdd("goal")}
          className="tap flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> New
        </button>
      </header>

      {db.goals.length === 0 && (
        <p className="surface px-4 py-10 text-center text-sm text-muted-foreground">
          No goals yet. Tap “New” to start saving for something.
        </p>
      )}

      <ul className="space-y-2.5">
        {db.goals.map((g) => {
          const pct = g.targetAmount > 0 ? Math.min(1, g.saved / g.targetAmount) : 0;
          const done = pct >= 1;
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setEditing(g)}
                className="tap surface relative w-full overflow-hidden px-4 py-3.5 text-left"
                style={{
                  backgroundImage: `linear-gradient(90deg, color-mix(in oklab, var(--primary) ${done ? 18 : 12}%, transparent) ${pct * 100}%, transparent ${pct * 100}%)`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      done ? "bg-primary text-primary-foreground" : "bg-muted text-primary",
                    )}
                  >
                    {done ? (
                      <Check className="h-4 w-4" strokeWidth={2.6} />
                    ) : (
                      <Target className="h-4 w-4" strokeWidth={2.2} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{g.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {money(g.saved)} of {money(g.targetAmount)}
                      {g.targetDate ? ` · by ${prettyDate(g.targetDate)}` : ""}
                    </p>
                  </div>
                  <span className="num shrink-0 text-sm font-bold text-primary">
                    {Math.round(pct * 100)}%
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(undefined)}>
        <DialogContent
          className={cn(
            "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
            "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
            "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          )}
        >
          <DialogHeader>
            <DialogTitle>Edit goal</DialogTitle>
          </DialogHeader>
          {editing && (
            <GoalForm key={editing.id} goal={editing} onClose={() => setEditing(undefined)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GoalForm({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(String(goal.targetAmount));
  const [saved, setSaved] = useState(String(goal.saved));
  const [date, setDate] = useState(goal.targetDate ?? "");
  const [top, setTop] = useState("");

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Target (₹)</Label>
          <Input
            className="num"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Saved (₹)</Label>
          <Input
            className="num"
            inputMode="decimal"
            value={saved}
            onChange={(e) => setSaved(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Target date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="space-y-1.5 rounded-2xl bg-muted p-3">
        <Label className="text-xs font-medium text-muted-foreground">Quick top-up (₹)</Label>
        <div className="flex gap-2">
          <Input
            className="num bg-card"
            inputMode="decimal"
            placeholder="0"
            value={top}
            onChange={(e) => setTop(e.target.value)}
          />
          <Button
            variant="secondary"
            className="rounded-xl bg-card font-bold"
            onClick={() => {
              const v = Number(top);
              if (!v) return;
              contributeToGoal(goal.id, v);
              setSaved(String(goal.saved + v));
              setTop("");
              toast.success(`Added ${money(v)} to ${goal.name}`);
            }}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          className="h-11 flex-1 rounded-xl font-bold"
          onClick={() => {
            updateGoal(goal.id, {
              name: name.trim() || goal.name,
              targetAmount: Number(target) || 0,
              saved: Number(saved) || 0,
              targetDate: date || undefined,
            });
            toast.success("Goal updated");
            onClose();
          }}
        >
          Save changes
        </Button>
        <button
          type="button"
          aria-label="Delete goal"
          onClick={() => {
            deleteGoal(goal.id);
            toast.success("Goal deleted");
            onClose();
          }}
          className="tap rounded-xl border border-border p-3 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
