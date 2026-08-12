import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Pencil,
  Check,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CardBrandMark } from "@/components/CardBrandMark";
import { BankMark } from "@/components/BankMark";

import {
  useDB,
  accountBalance,
  accountsOfType,
  typeTotal,
  netWorth,
  updateAccount,
  deleteAccount,
  moveAccount,
  ACCOUNT_TYPES,
  type AccountType,
} from "@/lib/store";
import { money, prettyDate } from "@/lib/format";
import { useHydrated } from "@/hooks/use-hydrated";
import { uiActions } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accounts/")({
  head: () => ({
    meta: [
      { title: "Accounts — Balances at a glance | SmartBudget" },
      {
        name: "description",
        content:
          "See every family account — bank accounts, credit cards, fixed deposits and recurring deposits — with live rupee balances.",
      },
      { property: "og:title", content: "Accounts — Balances at a glance | SmartBudget" },
      {
        property: "og:description",
        content: "Every family account with live rupee balances, grouped by type.",
      },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const db = useDB();
  const hydrated = useHydrated();
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!hydrated) return <div className="shimmer h-96 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">Accounts</h1>
          <p className="num text-sm text-muted-foreground">Net worth {money(netWorth(db))}</p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          aria-label={editing ? "Done editing" : "Edit accounts"}
          className={cn(
            "tap shrink-0 rounded-full border p-2.5",
            editing ? "border-primary bg-primary text-primary-foreground" : "border-border",
          )}
        >
          {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </button>
      </header>

      {ACCOUNT_TYPES.map((t) => (
        <TypeSection
          key={t.id}
          type={t.id}
          title={t.plural}
          editing={editing}
          collapsed={!!collapsed[t.id]}
          onToggle={() => setCollapsed((c) => ({ ...c, [t.id]: !c[t.id] }))}
        />
      ))}
    </div>
  );
}

function TypeSection({
  type,
  title,
  editing,
  collapsed,
  onToggle,
}: {
  type: AccountType;
  title: string;
  editing: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const db = useDB();
  const navigate = useNavigate();
  const list = accountsOfType(db, type);
  const total = typeTotal(db, type);

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
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {title}
          </span>
        </button>
        <span
          className={cn(
            "num shrink-0 text-[11px] font-bold",
            total < 0 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {money(total)}
        </span>
      </div>

      {!collapsed && (
        <ul className="space-y-1.5">
          {list.length === 0 && !editing && (
            <li className="surface px-3.5 py-3 text-xs text-muted-foreground">Nothing here yet.</li>
          )}

          {list.map((a, i) => {
            const bal = accountBalance(db, a.id).total;
            const mark =
              a.type === "credit" && a.brand ? (
                <CardBrandMark brand={a.brand} className="h-5 w-8 shrink-0" />
              ) : (
                <BankMark bank={a.bank} className="h-6 w-6 shrink-0" />
              );
            return (
              <li key={a.id} className="surface px-3.5 py-2.5">
                {editing ? (
                  <div className="flex items-center gap-1.5">
                    {mark}
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{a.name}</span>
                    <IconBtn label={`Edit ${a.name}`} onClick={() => uiActions.editAccount(a.id)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      label={`Move ${a.name} up`}
                      disabled={i === 0}
                      onClick={() => moveAccount(a.id, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      label={`Move ${a.name} down`}
                      disabled={i === list.length - 1}
                      onClick={() => moveAccount(a.id, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      label={`Delete ${a.name}`}
                      danger
                      onClick={() => {
                        deleteAccount(a.id);
                        toast.success(`Removed ${a.name}`);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ to: "/accounts/$accountId", params: { accountId: a.id } })
                    }
                    className="tap flex w-full items-center gap-3 text-left"
                  >
                    {mark}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{a.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[
                          a.bank,
                          a.type === "credit" && a.creditLimit
                            ? `Limit ${money(a.creditLimit)}`
                            : null,
                          (a.type === "fd" || a.type === "rd") && a.maturityDate
                            ? `Maturity ${prettyDate(a.maturityDate)}`
                            : null,
                          (a.type === "fd" || a.type === "rd") && a.rateOfInterest
                            ? `${a.rateOfInterest}% p.a.`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "num shrink-0 text-sm font-bold",
                        bal < 0 ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {money(bal)}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                )}
              </li>
            );
          })}

          {editing && (
            <li>
              <button
                onClick={() => uiActions.openAdd(type === "credit" ? "card" : "account")}
                className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-[11px] font-bold text-muted-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Add {type === "credit" ? "card" : "account"}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "tap rounded-lg p-2 text-muted-foreground disabled:opacity-30",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
