import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowLeftRight,
  Pencil,
  Check,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Landmark,
  Target,
  QrCode,
  AtSign,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UpiPicker, CategoryPicker } from "@/components/pickers";
import { toast } from "sonner";
import {
  useDB,
  budgetedFor,
  categorySpent,
  categoryTransferredOut,
  categoryAvailable,
  readyToAssign,
  setBudget,
  setCategoryIcon,
  setCategoryUpi,
  categoryTransfer,
  addCategory,
  addCategoryGroup,
  renameCategory,
  renameCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
  moveCategory,
  moveCategoryGroup,
  sortedCategories,
  type CategoryGroup,
} from "@/lib/store";
import { CategoryGlyph, categoryIconKey } from "@/lib/category-icons";
import { IconPicker } from "@/components/IconPicker";
import { money, monthKey, monthLabel, shiftMonth, categoryTransferDate } from "@/lib/format";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/budget")({
  head: () => ({
    meta: [
      { title: "Budget — Assign every rupee | SmartBudget" },
      {
        name: "description",
        content:
          "Zero-based monthly budget: assign every rupee to a category, track activity and see what's still available.",
      },
      { property: "og:title", content: "Budget — Assign every rupee | SmartBudget" },
      {
        property: "og:description",
        content: "Assign every rupee to a category and track what's left this month.",
      },
    ],
  }),
  component: BudgetPage,
});

function BudgetPage() {
  const db = useDB();
  const hydrated = useHydrated();
  const [month, setMonth] = useState(monthKey());
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loansOpen, setLoansOpen] = useState(true);
  const [goalsOpen, setGoalsOpen] = useState(true);
  const toAssign = readyToAssign(db, month);

  if (!hydrated) return <div className="shimmer h-96 rounded-3xl" />;

  const healthy = toAssign >= 0;
  const groups = [...db.categoryGroups].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h1 className="truncate text-2xl font-bold">Budget</h1>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="tap rounded-full border border-border p-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-[6.5rem] text-center text-xs font-bold">{monthLabel(month)}</span>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Next month"
            className="tap rounded-full border border-border p-2"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setEditing((v) => !v)}
            aria-label={editing ? "Done editing" : "Edit budget"}
            className={cn(
              "tap ml-1 rounded-full border p-2",
              editing ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
          >
            {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Single-focus hero */}
      <section className="animate-bounce-in flex flex-col items-center py-1 text-center">
        <p className="text-sm text-muted-foreground">Ready to Assign</p>
        <p
          className={cn(
            "num mt-1 text-[clamp(2.25rem,12vw,3rem)] font-bold leading-none",
            healthy ? "text-foreground" : "text-destructive",
          )}
        >
          <span className={healthy ? "text-primary" : "text-destructive"}>₹</span>{" "}
          {Math.abs(toAssign).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
        <p className="mt-3 max-w-xs text-xs text-muted-foreground">
          {editing
            ? "Editing — tap amounts to reassign, or add, rename, reorder and remove categories."
            : healthy
              ? "Give every rupee a job to keep the plan honest."
              : "You've over-assigned. Move money back from a category."}
        </p>
      </section>

      {groups.map((g, gi) => (
        <GroupSection
          key={g.id}
          group={g}
          groupIndex={gi}
          groupCount={groups.length}
          month={month}
          editing={editing}
          collapsed={!!collapsed[g.id]}
          onToggle={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
        />
      ))}

      {editing && (
        <button
          onClick={() => {
            addCategoryGroup("New group");
            toast.success("Group added");
          }}
          className="tap flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-xs font-bold text-muted-foreground"
        >
          <Plus className="h-4 w-4" /> Add category group
        </button>
      )}

      {!editing && <LoansSection open={loansOpen} onToggle={() => setLoansOpen((v) => !v)} />}
      {!editing && <GoalsSection open={goalsOpen} onToggle={() => setGoalsOpen((v) => !v)} />}

      {!editing && <MoveMoneyCard month={month} />}
    </div>
  );
}

function GroupSection({
  group,
  groupIndex,
  groupCount,
  month,
  editing,
  collapsed,
  onToggle,
}: {
  group: CategoryGroup;
  groupIndex: number;
  groupCount: number;
  month: string;
  editing: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const db = useDB();
  const [iconTarget, setIconTarget] = useState<string | null>(null);
  const [upiTarget, setUpiTarget] = useState<string | null>(null);
  const cats = db.categories
    .filter((c) => c.groupId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const groupAvailable = cats.reduce((s, c) => s + categoryAvailable(db, c.id, month), 0);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <button
          onClick={onToggle}
          className="tap flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
          aria-expanded={!collapsed}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              collapsed && "-rotate-90",
            )}
          />
          {editing ? (
            <Input
              className="h-8 rounded-lg text-xs font-bold"
              defaultValue={group.name}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== group.name) renameCategoryGroup(group.id, v);
              }}
            />
          ) : (
            <span className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {group.name}
            </span>
          )}
        </button>

        {editing ? (
          <div className="flex shrink-0 items-center">
            <IconBtn
              label="Move group up"
              disabled={groupIndex === 0}
              onClick={() => moveCategoryGroup(group.id, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label="Move group down"
              disabled={groupIndex === groupCount - 1}
              onClick={() => moveCategoryGroup(group.id, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label="Delete group"
              danger
              onClick={() => {
                deleteCategoryGroup(group.id);
                toast.success(`Removed ${group.name}`);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        ) : (
          <span className="num shrink-0 text-[11px] font-bold text-muted-foreground">
            {money(groupAvailable)}
          </span>
        )}
      </div>

      {!collapsed && (
        <ul className="space-y-1.5">
          {cats.map((c, i) => {
            const budgeted = budgetedFor(db, c.id, month);
            const available = categoryAvailable(db, c.id, month);
            const spent = Math.abs(categorySpent(db, c.id, month));
            const moved = categoryTransferredOut(db, c.id, month);
            const consumed = spent + moved;
            const pct = budgeted > 0 ? Math.min(100, (consumed / budgeted) * 100) : 0;
            const over = available < 0;

            return (
              <li
                key={c.id}
                className="surface relative overflow-hidden px-3.5 py-2.5"
                style={
                  editing
                    ? undefined
                    : {
                        backgroundImage: `linear-gradient(to right, color-mix(in oklab, var(--${
                          over ? "destructive" : "primary"
                        }) 10%, transparent) ${pct}%, transparent ${pct}%)`,
                      }
                }
              >
                {editing ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Choose icon for ${c.name}`}
                      onClick={() => setIconTarget(c.id)}
                      className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                    >
                      <CategoryGlyph icon={categoryIconKey(c)} className="h-4 w-4" />
                    </button>
                    <Input
                      className="h-9 flex-1 rounded-lg text-sm font-semibold"
                      defaultValue={c.name}
                      aria-label={`Rename ${c.name}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== c.name) renameCategory(c.id, v);
                      }}
                    />
                    <Input
                      className="num h-9 w-24 rounded-lg text-right text-sm font-bold"
                      inputMode="decimal"
                      defaultValue={budgeted || ""}
                      placeholder="0"
                      aria-label={`Assigned to ${c.name}`}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 0;
                        if (v !== budgeted) setBudget(c.id, month, v);
                      }}
                    />
                    <IconBtn
                      label={`UPI id for ${c.name}`}
                      onClick={() => setUpiTarget(c.id)}
                      active={!!c.upiVpa}
                    >
                      {c.upiVpa ? (
                        <QrCode className="h-3.5 w-3.5" />
                      ) : (
                        <AtSign className="h-3.5 w-3.5" />
                      )}
                    </IconBtn>
                    <IconBtn
                      label={`Move ${c.name} up`}
                      disabled={i === 0}
                      onClick={() => moveCategory(c.id, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      label={`Move ${c.name} down`}
                      disabled={i === cats.length - 1}
                      onClick={() => moveCategory(c.id, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      label={`Delete ${c.name}`}
                      danger
                      onClick={() => {
                        deleteCategory(c.id);
                        toast.success(`Removed ${c.name}`);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <CategoryGlyph
                          icon={categoryIconKey(c)}
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                        />
                        <Link
                          to="/categories/$categoryId"
                          params={{ categoryId: c.id }}
                          className="tap truncate text-sm font-bold hover:text-primary"
                        >
                          {c.name}
                        </Link>
                      </span>
                      <span
                        className={cn(
                          "num shrink-0 text-sm font-bold",
                          over
                            ? "text-destructive"
                            : available === 0
                              ? "text-muted-foreground"
                              : "text-primary",
                        )}
                      >
                        {money(available)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                      <span className="num">
                        Spent {money(spent)}
                        {moved > 0 ? ` · Moved ${money(moved)}` : ""}
                      </span>
                      <span className="num">Assigned {money(budgeted)}</span>
                    </div>
                  </>
                )}
              </li>
            );
          })}

          {editing && (
            <li>
              <button
                onClick={() => {
                  addCategory(group.id, "New category");
                  toast.success("Category added");
                }}
                className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-[11px] font-bold text-muted-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Add category
              </button>
            </li>
          )}
        </ul>
      )}

      <IconPicker
        open={iconTarget !== null}
        onOpenChange={(o) => !o && setIconTarget(null)}
        value={categoryIconKey(db.categories.find((c) => c.id === iconTarget))}
        onSelect={(key) => {
          if (iconTarget) setCategoryIcon(iconTarget, key);
          setIconTarget(null);
        }}
      />

      {upiTarget !== null && (
        <Dialog open onOpenChange={(o) => !o && setUpiTarget(null)}>
          <DialogContent
            className={cn(
              "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
              "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
              "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
            )}>
            <DialogHeader>
              <DialogTitle>UPI id</DialogTitle>
            </DialogHeader>
            <UpiEditor categoryId={upiTarget} onClose={() => setUpiTarget(null)} />
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

function UpiEditor({ categoryId, onClose }: { categoryId: string; onClose: () => void }) {
  const db = useDB();
  const cat = db.categories.find((c) => c.id === categoryId);
  const [vpa, setVpa] = useState(cat?.upiVpa ?? "");

  return (
    <div className="space-y-3">
      <UpiPicker value={vpa} onChange={setVpa} />
      <Button
        type="button"
        className="h-10 w-full rounded-xl font-bold"
        onClick={() => {
          setCategoryUpi(categoryId, vpa.trim() || undefined);
          toast.success(vpa.trim() ? "UPI id saved" : "UPI id removed");
          onClose();
        }}
      >
        Save
      </Button>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "tap rounded-lg p-2 text-muted-foreground disabled:opacity-30",
        active && "bg-primary/10 text-primary",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function LoansSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const db = useDB();
  const loans = db.loans ?? [];
  const outstanding = loans.reduce((s, l) => s + l.outstanding, 0);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <button
          onClick={onToggle}
          className="tap flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Loans
          </span>
        </button>
        <Link to="/loans" className="tap shrink-0 text-[11px] font-bold text-primary">
          View all
        </Link>
        <span className="num shrink-0 text-[11px] font-bold text-destructive">
          {money(outstanding)}
        </span>
      </div>

      {open && (
        <ul className="space-y-1.5">
          {loans.length === 0 && (
            <li className="surface px-3.5 py-3 text-xs text-muted-foreground">
              No loans tracked yet.
            </li>
          )}
          {loans.map((l) => {
            const pct = l.principal > 0 ? Math.min(1, l.outstanding / l.principal) : 0;
            return (
              <li
                key={l.id}
                className="surface relative overflow-hidden px-3.5 py-2.5"
                style={{
                  backgroundImage: `linear-gradient(to right, color-mix(in oklab, var(--destructive) 8%, transparent) ${pct * 100}%, transparent ${pct * 100}%)`,
                }}
              >
                <Link to="/loans" className="tap flex w-full items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-destructive">
                    <Landmark className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{l.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[
                        l.lender,
                        l.rateOfInterest ? `${l.rateOfInterest}% p.a.` : null,
                        `Borrowed ${money(l.principal)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </span>
                  <span className="num shrink-0 text-sm font-bold text-destructive">
                    {money(l.outstanding)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function GoalsSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const db = useDB();
  const totalTarget = db.goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = db.goals.reduce((s, g) => s + g.saved, 0);
  const overall = totalTarget > 0 ? Math.min(1, totalSaved / totalTarget) : 0;

  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <button
          onClick={onToggle}
          className="tap flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Goals
          </span>
        </button>
        <Link to="/goals" className="tap shrink-0 text-[11px] font-bold text-primary">
          View all
        </Link>
        <span className="num shrink-0 text-[11px] font-bold text-muted-foreground">
          {money(totalSaved)} of {money(totalTarget)}
        </span>
      </div>

      {open && (
        <ul className="space-y-1.5">
          {db.goals.length === 0 && (
            <li className="surface px-3.5 py-3 text-xs text-muted-foreground">No goals yet.</li>
          )}
          {db.goals.map((g) => {
            const pct = g.targetAmount > 0 ? Math.min(1, g.saved / g.targetAmount) : 0;
            const done = pct >= 1;
            return (
              <li
                key={g.id}
                className="surface relative overflow-hidden px-3.5 py-2.5"
                style={{
                  backgroundImage: `linear-gradient(to right, color-mix(in oklab, var(--primary) 10%, transparent) ${pct * 100}%, transparent ${pct * 100}%)`,
                }}
              >
                <Link to="/goals" className="tap flex w-full items-center gap-2.5">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      done ? "bg-primary text-primary-foreground" : "bg-muted text-primary",
                    )}
                  >
                    <Target className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{g.name}</span>
                    <span className="num block truncate text-[11px] text-muted-foreground">
                      {money(g.saved)} of {money(g.targetAmount)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-sm font-bold text-primary">
                    {Math.round(pct * 100)}%
                  </span>
                </Link>
              </li>
            );
          })}
          {db.goals.length > 0 && (
            <li className="surface flex items-center justify-between px-3.5 py-2.5 text-xs">
              <span className="font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Overall
              </span>
              <span className="num font-bold text-primary">{Math.round(overall * 100)}%</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function MoveMoneyCard({ month }: { month: string }) {
  const db = useDB();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  function submit() {
    const value = Number(amount);
    if (!from || !to || from === to || !value || value <= 0) {
      toast.error("Pick two different categories and an amount");
      return;
    }
    categoryTransfer(from, to, value, categoryTransferDate(month));
    const fromName = db.categories.find((c) => c.id === from)?.name;
    const toName = db.categories.find((c) => c.id === to)?.name;
    toast.success(`Moved ${money(value)}: ${fromName} → ${toName}`);
    setAmount("");
  }

  return (
    <section className="surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <ArrowLeftRight className="h-4 w-4 text-primary" strokeWidth={2.5} />
        <h2 className="text-sm font-bold">Move money</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <CategoryPicker value={from} onChange={setFrom} placeholder="From" />
        <CategoryPicker value={to} onChange={setTo} placeholder="To" />
        <Input
          className="num h-11 rounded-xl"
          inputMode="decimal"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button className="h-11 rounded-xl font-bold" onClick={submit}>
          Move
        </Button>
      </div>
    </section>
  );
}
