import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  useDB,
  monthActivity,
  lastMonths,
  amountForCategory,
  accountBalance,
  netWorth,
  sortedAccounts,
  type DB,
} from "@/lib/store";
import { money, monthKey, monthLabel } from "@/lib/format";
import { useHydrated } from "@/hooks/use-hydrated";
import { CategoryGlyph, categoryIconKey } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Spending insights | SmartBudget" },
      {
        name: "description",
        content:
          "Net worth trend, income vs expense over 12 months and spending by category for your family budget.",
      },
      { property: "og:title", content: "Reports — Spending insights | SmartBudget" },
      {
        property: "og:description",
        content: "Net worth trend, income vs expense and category breakdowns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const RANGES = [6, 12] as const;
const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Net worth at the end of each month (starting balances + all txns up to then). */
function netWorthAt(db: DB, month: string) {
  const opening = db.accounts.filter((a) => !a.closed).reduce((s, a) => s + a.startingBalance, 0);
  const ids = new Set(db.accounts.filter((a) => !a.closed).map((a) => a.id));
  const flow = db.transactions
    .filter((t) => ids.has(t.accountId) && t.date.slice(0, 7) <= month)
    .reduce((s, t) => s + t.amount, 0);
  return opening + flow;
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface p-4">
      <div className="mb-3">
        <h2 className="text-sm font-bold">{title}</h2>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function ReportsPage() {
  const db = useDB();
  const hydrated = useHydrated();
  const [range, setRange] = useState<(typeof RANGES)[number]>(6);
  const month = monthKey();

  const months = useMemo(() => lastMonths(range), [range]);

  const flowData = months.map((m) => {
    const a = monthActivity(db, m);
    return {
      label: monthLabel(m).slice(0, 3),
      income: a.income,
      expense: Math.abs(a.expense),
    };
  });

  const trendData = months.map((m) => ({
    label: monthLabel(m).slice(0, 3),
    worth: netWorthAt(db, m),
  }));

  const byCategory = useMemo(() => {
    const rows = db.categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        value: Math.abs(
          db.transactions
            .filter((t) => t.date.startsWith(month) && !t.categoryTransferId)
            .reduce((s, t) => s + Math.min(0, amountForCategory(t, c.id)), 0),
        ),
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    return rows;
  }, [db, month]);

  const spentTotal = byCategory.reduce((s, r) => s + r.value, 0);
  const activity = monthActivity(db, month);

  if (!hydrated) return <div className="shimmer h-96 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">{monthLabel(month)} at a glance</p>
        </div>
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "tap rounded-full px-3 py-1.5 text-[11px] font-bold",
                range === r
                  ? "bg-card text-foreground shadow-[var(--shadow-card)]"
                  : "text-muted-foreground",
              )}
            >
              {r}m
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {[
          { k: "Net worth", v: netWorth(db) },
          { k: "Income", v: activity.income },
          { k: "Spent", v: Math.abs(activity.expense) },
        ].map((s) => (
          <div key={s.k} className="surface px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {s.k}
            </p>
            <p className="num mt-1 text-[15px] font-bold">{money(s.v)}</p>
          </div>
        ))}
      </div>

      <Card title="Income vs expense" sub={`Last ${range} months`}>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={flowData} barGap={3}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              formatter={(v: number) => money(v)}
              contentStyle={{
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "var(--card)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="income" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expense" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Net worth trend" sub={`Closing balance each month`}>
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
            <Tooltip
              formatter={(v: number) => money(v)}
              contentStyle={{
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "var(--card)",
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="worth"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              fill="url(#nw)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Spending by category" sub={monthLabel(month)}>
        {byCategory.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No spending recorded this month.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={byCategory}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="none"
                >
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => money(v)}
                  contentStyle={{
                    borderRadius: 14,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="mt-2 space-y-1.5">
              {byCategory.slice(0, 8).map((r, i) => (
                <li key={r.name} className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <CategoryGlyph
                    icon={categoryIconKey(db.categories.find((c) => c.id === r.id))}
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  />
                  <Link
                    to="/categories/$categoryId"
                    params={{ categoryId: r.id }}
                    className="tap min-w-0 flex-1 truncate text-xs font-semibold hover:text-primary"
                  >
                    {r.name}
                  </Link>
                  <span className="num text-xs font-bold">{money(r.value)}</span>
                  <span className="num w-10 text-right text-[11px] text-muted-foreground">
                    {Math.round((r.value / spentTotal) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card title="Account balances" sub="Live totals across every account">
        <ul className="space-y-1.5">
          {sortedAccounts(db).map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{a.name}</span>
              <span
                className={cn(
                  "num text-xs font-bold",
                  accountBalance(db, a.id).total < 0 ? "text-destructive" : "text-foreground",
                )}
              >
                {money(accountBalance(db, a.id).total)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
