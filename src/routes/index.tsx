import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  useDB,
  accountBalance,
  netWorth,
  monthActivity,
  readyToAssign,
  lastMonths,
  categoryTransferInfo,
  transactionLabel,
  sortedAccounts,
} from "@/lib/store";
import { money, monthKey, greeting, prettyDate } from "@/lib/format";
import { useHydrated } from "@/hooks/use-hydrated";
import { CategoryInline, CategoryList } from "@/lib/category-icons";
import { uiActions } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartBudget — Family Budgeting with AI & UPI SmartPay" },
      {
        name: "description",
        content:
          "Zero-based family budgeting in rupees: track accounts, assign every rupee, split bills over UPI, and get AI help.",
      },
      { property: "og:title", content: "SmartBudget — Family Budgeting with AI & UPI SmartPay" },
      {
        property: "og:description",
        content: "Zero-based family budgeting in rupees with AI assistance and UPI bill splitting.",
      },
    ],
  }),
  component: Dashboard,
});

const typeLabel: Record<string, string> = {
  account: "Account",
  credit: "Credit card",
  fd: "Fixed deposit",
  rd: "Recurring deposit",
};

function Dashboard() {
  const db = useDB();
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const month = monthKey();

  const nw = netWorth(db);
  const toAssign = readyToAssign(db, month);
  const activity = monthActivity(db, month);

  const chartData = lastMonths(6).map((m) => {
    const a = monthActivity(db, m);
    return {
      month: new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" }),
      income: a.income,
      expense: Math.abs(a.expense),
    };
  });

  const recent = [...db.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  if (!hydrated) return <DashboardSkeleton />;

  const healthy = toAssign >= 0;

  return (
    <div className="space-y-9">
      {/* Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            SmartBudget
          </p>
          <h1 className="truncate text-lg font-semibold">{greeting()}, family</h1>
        </div>
        <span className="num flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-accent-foreground">
          S
        </span>
      </header>

      {/* Single-focus hero */}
      <section className="animate-bounce-in flex flex-col items-center py-2 text-center">
        <p className="text-sm text-muted-foreground">Ready to Assign</p>
        <p className="num mt-1 text-[clamp(2.5rem,13vw,3.5rem)] font-bold leading-none">
          <span className="text-primary">₹</span>{" "}
          {Math.abs(toAssign).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
        <Link
          to="/budget"
          className={cn(
            "tap mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold",
            healthy
              ? "border-primary/15 bg-primary/8 text-primary"
              : "border-destructive/20 bg-destructive/8 text-destructive",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 animate-pulse rounded-full",
              healthy ? "bg-primary" : "bg-destructive",
            )}
          />
          {healthy ? "Budget is healthy" : "Over-assigned — rebalance"}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>

        <dl className="mt-6 grid w-full grid-cols-2 gap-3">
          <div className="surface px-4 py-3 text-left">
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Net worth
            </dt>
            <dd className="num mt-0.5 text-base font-bold">{money(nw)}</dd>
          </div>
          <div className="surface px-4 py-3 text-left">
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              This month
            </dt>
            <dd
              className={cn(
                "num mt-0.5 text-base font-bold",
                activity.net >= 0 ? "text-primary" : "text-destructive",
              )}
            >
              {money(activity.net)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Accounts — horizontal snap scroll */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Accounts
          </h2>
          <Link to="/accounts" className="text-xs font-bold text-primary">
            View all
          </Link>
        </div>
        <div className="edge-scroll -mx-4 gap-3 px-4 pb-1 md:mx-0 md:px-0">
          {sortedAccounts(db).map((a, i) => {
            const bal = accountBalance(db, a.id).total;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() =>
                  navigate({ to: "/accounts/$accountId", params: { accountId: a.id } })
                }
                className="tap surface animate-fade-up min-w-[150px] shrink-0 p-4 text-left"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {typeLabel[a.type] ?? a.type}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold">{a.name}</p>
                <p
                  className={cn(
                    "num mt-3 text-lg font-bold",
                    bal < 0 ? "text-destructive" : "text-foreground",
                  )}
                >
                  {money(bal)}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Recent activity
        </h2>
        <ul className="space-y-2.5">
          {recent.map((t, i) => {
            const splitCats = t.splits?.length
              ? t.splits.map((s) => db.categories.find((c) => c.id === s.categoryId))
              : [];
            const singleCat = db.categories.find((c) => c.id === t.categoryId);
            const income = t.amount > 0;
            const info = categoryTransferInfo(db, t);
            const label = transactionLabel(db, t);
            return (
              <li key={t.id} className="surface animate-fade-up">
                <button
                  type="button"
                  onClick={() => uiActions.editTxn(t.id)}
                  className="tap flex w-full items-center gap-3 p-4 text-left"
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.transferId ? (
                        "Between accounts"
                      ) : info ? (
                        singleCat ? (
                          <CategoryInline cat={singleCat} />
                        ) : (
                          "Category"
                        )
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
                      <p className="truncate text-[11px] italic text-muted-foreground/75">
                        {t.memo}
                      </p>
                    )}
                  </div>

                  <span
                    className={cn(
                      "num shrink-0 text-sm font-bold",
                      t.transferId || info
                        ? "text-muted-foreground"
                        : income
                          ? "text-primary"
                          : "text-foreground",
                    )}
                  >
                    {t.transferId || info ? "" : income ? "+" : "−"}
                    {money(Math.abs(t.amount))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Progressive detail: trend last */}
      <section className="surface p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Income vs expense · 6 months
        </h2>
        <div className="mt-4 h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={3}>
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(v: number) => money(v)}
              />
              <Bar dataKey="income" fill="var(--chart-1)" radius={[5, 5, 0, 0]} />
              <Bar dataKey="expense" fill="var(--chart-2)" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="shimmer h-12 rounded-2xl" />
      <div className="shimmer h-40 rounded-3xl" />
      <div className="shimmer h-28 rounded-2xl" />
      <div className="shimmer h-56 rounded-2xl" />
    </div>
  );
}
