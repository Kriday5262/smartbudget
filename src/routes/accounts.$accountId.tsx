import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardBrandMark } from "@/components/CardBrandMark";
import { BankMark } from "@/components/BankMark";
import { UpiActions } from "@/components/UpiActions";

import { useDB, accountBalance, transactionLabel } from "@/lib/store";
import { money, prettyDate } from "@/lib/format";
import { CategoryInline, CategoryList } from "@/lib/category-icons";
import { useHydrated } from "@/hooks/use-hydrated";
import { uiActions } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accounts/$accountId")({
  head: () => ({
    meta: [
      { title: "Account details — transactions | SmartBudget" },
      {
        name: "description",
        content: "Account balance and the full transaction history for this account.",
      },
      { property: "og:title", content: "Account details — transactions | SmartBudget" },
      {
        property: "og:description",
        content: "Balance and every transaction recorded on this account.",
      },
    ],
  }),
  component: AccountDetail,
});

function AccountDetail() {
  const { accountId } = Route.useParams();
  const db = useDB();
  const hydrated = useHydrated();

  if (!hydrated) return <div className="shimmer h-96 rounded-2xl" />;

  const account = db.accounts.find((a) => a.id === accountId);
  if (!account) {
    return (
      <div className="surface p-8 text-center">
        <p className="text-sm text-muted-foreground">That account no longer exists.</p>
        <Link to="/accounts" className="mt-3 inline-block text-sm font-medium text-primary">
          Back to accounts
        </Link>
      </div>
    );
  }

  const bal = accountBalance(db, account.id);
  const txns = db.transactions
    .filter((t) => t.accountId === account.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <Link
        to="/accounts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Accounts
      </Link>

      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            {account.type === "credit" && account.brand ? (
              <CardBrandMark brand={account.brand} className="h-6 w-9" />
            ) : (
              <BankMark bank={account.bank} className="h-6 w-6" />
            )}
            <h1 className="text-xl font-bold">{account.name}</h1>
          </div>

          <p
            className={cn(
              "num mt-1 text-[clamp(2rem,10vw,2.5rem)] font-bold leading-none",
              bal.total < 0 && "text-destructive",
            )}
          >
            {money(bal.total)}
          </p>
          {account.bank && (
            <p className="mt-2 text-xs text-muted-foreground">
              {account.bank}
              {account.creditLimit ? ` · Limit ${money(account.creditLimit)}` : ""}
              {account.maturityDate ? ` · Maturity ${prettyDate(account.maturityDate)}` : ""}
              {account.rateOfInterest ? ` · ${account.rateOfInterest}% p.a.` : ""}
            </p>
          )}
          {account.upiVpa && <UpiActions upiVpa={account.upiVpa} name={account.name} />}
        </div>
        <Button
          className="h-11 w-full rounded-xl font-bold sm:w-auto"
          onClick={() => uiActions.openAdd("transaction", account.id)}
        >
          <Plus className="h-4 w-4" /> New transaction
        </Button>
      </div>

      <section className="surface overflow-hidden">
        <ul className="divide-y divide-border">
          {txns.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              No transactions yet on this account.
            </li>
          )}
          {txns.map((t, i) => {
            const splitCats = t.splits?.length
              ? t.splits.map((s) => db.categories.find((c) => c.id === s.categoryId))
              : [];
            const singleCat = db.categories.find((c) => c.id === t.categoryId);
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
                  <p className="truncate text-sm font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.transferId ? (
                      "Between accounts"
                    ) : splitCats.length ? (
                      <CategoryList cats={splitCats} />
                    ) : singleCat ? (
                      <CategoryInline cat={singleCat} />
                    ) : (
                      "Ready to Assign"
                    )}{" "}
                    · {prettyDate(t.date)}
                  </p>
                  {t.memo && t.memo !== label && (
                    <p className="truncate text-[11px] italic text-muted-foreground/75">{t.memo}</p>
                  )}
                </button>

                <span
                  className={cn(
                    "num text-sm font-semibold",
                    t.amount > 0 ? "text-primary" : "text-foreground",
                  )}
                >
                  {money(t.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
