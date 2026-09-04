import { createFileRoute } from "@tanstack/react-router";
import { Scale } from "lucide-react";

import {
  useDB,
  accountBalance,
  categoryAvailable,
  type Account,
  type CategoryGroup,
  type DB,
} from "@/lib/store";
import { money, monthKey } from "@/lib/format";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reconciliation")({
  head: () => ({
    meta: [
      { title: "Reconciliation — accounts vs budget | SmartBudget" },
      {
        name: "description",
        content:
          "Verify that account balances match their allocated budget envelopes, group by group.",
      },
      { property: "og:title", content: "Reconciliation — accounts vs budget | SmartBudget" },
      {
        property: "og:description",
        content: "Match every account balance to its budget envelope and flag any variance.",
      },
    ],
  }),
  component: ReconciliationPage,
});

/** Case-insensitive substring match on an account name. */
function accountName(a: Account, needle: string): boolean {
  return a.name.toLowerCase().includes(needle.toLowerCase());
}

/** Case-insensitive substring match on a budget group name. */
function groupName(g: CategoryGroup, needle: string): boolean {
  return g.name.toLowerCase().includes(needle.toLowerCase());
}

/** One of the six fixed mappings in the reconciliation spec. */
type ReconGroup = {
  key: string;
  label: string;
  accountMatchers: string[];
  /** Matched against all non-closed accounts regardless of `onBudget`, for
   *  off-budget accounts we intentionally include (e.g. a credit card). */
  extraAccountMatchers?: string[];
  groupMatchers: string[];
};

const RECON_GROUPS: ReconGroup[] = [
  {
    key: "household",
    label: "Household Expenses",
    accountMatchers: ["Household", "Cash: SC", "Cash: KN"],
    extraAccountMatchers: ["Tata Neu"],
    groupMatchers: ["Groceries & Vegetables", "Ongoing Expenses", "Bills & Subscriptions"],
  },
  {
    key: "shantanu",
    label: "Shantanu",
    accountMatchers: ["Shantanu"],
    groupMatchers: ["Shantanu"],
  },
  { key: "raghav", label: "Raghav", accountMatchers: ["Raghav"], groupMatchers: ["Raghav"] },
  { key: "kriday", label: "Kriday", accountMatchers: ["Kriday"], groupMatchers: ["Kriday"] },
  { key: "kanika", label: "Kanika", accountMatchers: ["Kanika"], groupMatchers: ["Kanika"] },
  {
    key: "savings",
    label: "Savings",
    accountMatchers: ["Family Savings"],
    groupMatchers: ["House Funds"],
  },
];

function ReconciliationPage() {
  const db = useDB();
  const hydrated = useHydrated();
  const month = monthKey();

  if (!hydrated) return <div className="shimmer h-96 rounded-2xl" />;

  // Group matching is scoped to on-budget operating accounts (the current
  // savings/current accounts and cash) — this keeps person-name substrings
  // like "Shantanu" from also grabbing off-budget RDs/FDs (e.g. "Shantanu's
  // Savings (RD)"), so each group aligns with its intended envelope account.
  const matchAccounts = (rg: ReconGroup) => {
    const included: Account[] = [];
    // On-budget operating accounts (current/savings + cash) — keeps person-name
    // substrings like "Shantanu" from grabbing off-budget RDs/FDs by name.
    const budgetSet = db.accounts.filter(
      (a) => a.onBudget && !a.closed && rg.accountMatchers.some((m) => accountName(a, m)),
    );
    included.push(...budgetSet);
    // Off-budget accounts we explicitly want (e.g. the Tata Neu credit card).
    if (rg.extraAccountMatchers?.length) {
      const extraSet = db.accounts.filter(
        (a) => !a.closed && rg.extraAccountMatchers!.some((m) => accountName(a, m)),
      );
      for (const extra of extraSet) {
        if (!included.some((a) => a.id === extra.id)) included.push(extra);
      }
    }
    return included;
  };
  const matchGroups = (matchers: string[]) =>
    db.categoryGroups.filter((g) => matchers.some((m) => groupName(g, m)));

  const rows = RECON_GROUPS.map((rg) => {
    const usedAccounts = matchAccounts(rg);
    const usedGroups = matchGroups(rg.groupMatchers);

    const accountTotal = usedAccounts.reduce((s, a) => s + accountBalance(db, a.id).total, 0);
    const groupTotal = usedGroups.reduce(
      (s, g) =>
        s +
        db.categories
          .filter((c) => c.groupId === g.id)
          .reduce((t, c) => t + categoryAvailable(db, c.id, month), 0),
      0,
    );
    const difference = Math.round((accountTotal - groupTotal) * 100) / 100;
    const unbalanced = difference !== 0;

    return {
      ...rg,
      usedAccounts,
      usedGroups,
      accountTotal,
      groupTotal,
      difference,
      unbalanced,
    };
  });

  // Net totals include only the accounts and budget groups involved on this page.
  const involvedAccountIds = new Set(rows.flatMap((r) => r.usedAccounts.map((a) => a.id)));
  const involvedGroupIds = new Set(rows.flatMap((r) => r.usedGroups.map((g) => g.id)));

  const allAccountTotal = db.accounts
    .filter((a) => involvedAccountIds.has(a.id))
    .reduce((s, a) => s + accountBalance(db, a.id).total, 0);
  const allGroupTotal = db.categoryGroups
    .filter((g) => involvedGroupIds.has(g.id))
    .reduce(
      (s, g) =>
        s +
        db.categories
          .filter((c) => c.groupId === g.id)
          .reduce((t, c) => t + categoryAvailable(db, c.id, month), 0),
      0,
    );
  const netDifference = Math.round((allAccountTotal - allGroupTotal) * 100) / 100;
  const netUnbalanced = netDifference !== 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Scale className="h-6 w-6 text-primary" /> Reconciliation
        </h1>
        <p className="text-sm text-muted-foreground">
          {month} · Accounts vs budget envelopes — every group should net to ₹0.00.
        </p>
      </header>

      <section className="surface overflow-hidden">
        <div className="grid grid-cols-[2fr_2fr_1fr] gap-x-6 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <span>Accounts</span>
          <span>Budget Groups</span>
          <span className="text-right">Difference</span>
        </div>

        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="px-4 pt-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {row.label}
                </p>
              </div>

              <div className="grid grid-cols-[2fr_2fr_1fr] items-start gap-x-6 px-4 py-2.5">
                <div className="min-w-0">
                  <ul className="space-y-0.5">
                    {row.usedAccounts.map((a) => (
                      <li key={a.id} className="flex items-baseline justify-between gap-4">
                        <span className="truncate text-sm font-medium">{a.name}</span>
                        <span className="num shrink-0 text-right text-sm text-muted-foreground">
                          {money(accountBalance(db, a.id).total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 border-t border-dashed border-border pt-1 text-right text-sm font-bold">
                    {money(row.accountTotal)}
                  </p>
                </div>

                <div className="min-w-0">
                  <ul className="space-y-0.5">
                    {row.usedGroups.map((g) => (
                      <li key={g.id} className="flex items-baseline justify-between gap-4">
                        <span className="truncate text-sm font-medium">{g.name}</span>
                        <span className="num shrink-0 text-right text-sm text-muted-foreground">
                          {money(groupAllocation(db, g, month))}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 border-t border-dashed border-border pt-1 text-right text-sm font-bold">
                    {money(row.groupTotal)}
                  </p>
                </div>

                <div className="self-end text-right">
                  <span
                    className={cn(
                      "num text-sm font-bold",
                      row.unbalanced ? "text-destructive" : "text-emerald-600",
                    )}
                  >
                    {money(row.difference)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <footer className="grid grid-cols-[2fr_2fr_1fr] items-end gap-x-6 border-t-2 border-border px-4 py-3">
          <div />
          <div />
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Net difference
            </p>
            <span
              className={cn(
                "num text-sm font-bold",
                netUnbalanced ? "text-destructive" : "text-emerald-600",
              )}
            >
              {money(netDifference)}
            </span>
          </div>
        </footer>
      </section>
    </div>
  );
}

function groupAllocation(db: DB, g: CategoryGroup, month: string): number {
  return db.categories
    .filter((c) => c.groupId === g.id)
    .reduce((s, c) => s + categoryAvailable(db, c.id, month), 0);
}
