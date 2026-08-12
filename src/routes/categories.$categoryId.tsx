import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useDB, amountForCategory, categoryTransferInfo, transactionLabel } from "@/lib/store";
import { money, prettyDate } from "@/lib/format";
import { CategoryGlyph, categoryIconKey } from "@/lib/category-icons";
import { useHydrated } from "@/hooks/use-hydrated";
import { uiActions } from "@/lib/ui-store";
import { UpiActions } from "@/components/UpiActions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/categories/$categoryId")({
  head: () => ({
    meta: [
      { title: "Category — transactions | SmartBudget" },
      {
        name: "description",
        content: "Every transaction assigned to this category, including split shares.",
      },
      { property: "og:title", content: "Category — transactions | SmartBudget" },
      {
        property: "og:description",
        content: "Spending and income for this category across all accounts.",
      },
    ],
  }),
  component: CategoryDetail,
});

function CategoryDetail() {
  const { categoryId } = Route.useParams();
  const db = useDB();
  const hydrated = useHydrated();

  if (!hydrated) return <div className="shimmer h-96 rounded-2xl" />;

  const cat = db.categories.find((c) => c.id === categoryId);
  if (!cat) {
    return (
      <div className="surface p-8 text-center">
        <p className="text-sm text-muted-foreground">That category no longer exists.</p>
        <Link to="/budget" className="mt-3 inline-block text-sm font-medium text-primary">
          Back to budget
        </Link>
      </div>
    );
  }

  const group = db.categoryGroups.find((g) => g.id === cat.groupId);
  const rows = db.transactions
    .map((t) => ({ t, share: amountForCategory(t, cat.id) }))
    .filter(({ share }) => share !== 0)
    .sort((a, b) => b.t.date.localeCompare(a.t.date));

  const spent = rows.filter((r) => r.share < 0).reduce((s, r) => s + r.share, 0);
  const income = rows.filter((r) => r.share > 0).reduce((s, r) => s + r.share, 0);
  const net = income + spent;

  return (
    <div className="space-y-6">
      <Link
        to="/budget"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Budget
      </Link>

      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CategoryGlyph icon={categoryIconKey(cat)} className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold">{cat.name}</h1>
          </div>
          {group && <p className="mt-0.5 text-xs text-muted-foreground">{group.name}</p>}
          {cat.upiVpa && <UpiActions upiVpa={cat.upiVpa} name={cat.name} />}

          <p
            className={cn(
              "num mt-1 text-[clamp(2rem,10vw,2.5rem)] font-bold leading-none",
              net < 0 && "text-destructive",
            )}
          >
            {money(net)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {rows.length} transaction{rows.length === 1 ? "" : "s"}
            {spent !== 0 && <> · Spent {money(spent)}</>}
            {income !== 0 && <> · Income {money(income)}</>}
          </p>
        </div>
        <Button
          className="h-11 w-full rounded-xl font-bold sm:w-auto"
          onClick={() => uiActions.openAdd("transaction", undefined, cat.id)}
        >
          <Plus className="h-4 w-4" /> New transaction
        </Button>
      </div>

      <section className="surface overflow-hidden">
        <ul className="divide-y divide-border">
          {rows.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              No transactions in this category yet.
            </li>
          )}
          {rows.map(({ t, share }, i) => {
            const account = db.accounts.find((a) => a.id === t.accountId)?.name ?? "—";
            const isSplit = !!t.splits?.length;
            const info = categoryTransferInfo(db, t);
            const label = transactionLabel(db, t);
            return (
              <li
                key={t.id}
                className="animate-fade-up flex items-center gap-3 px-4 py-3"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <button
                  type="button"
                  onClick={() => uiActions.editTxn(t.id)}
                  className="tap min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium">
                    {label}
                    {isSplit && (
                      <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        Split
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {info ? (
                      prettyDate(t.date)
                    ) : (
                      <>
                        {account}
                        {" · "}
                        {prettyDate(t.date)}
                        {isSplit && t.amount !== share
                          ? ` · ${money(share)} of ${money(t.amount)}`
                          : ""}
                      </>
                    )}
                  </p>
                  {t.memo && t.memo !== label && (
                    <p className="truncate text-[11px] italic text-muted-foreground/75">{t.memo}</p>
                  )}
                </button>

                <span
                  className={cn(
                    "num shrink-0 text-sm font-semibold",
                    t.transferId || info
                      ? "text-muted-foreground"
                      : share > 0
                        ? "text-primary"
                        : "text-foreground",
                  )}
                >
                  {money(share)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
