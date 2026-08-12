import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDB, type Transaction, categoryTransferInfo, transactionLabel } from "@/lib/store";
import { money, prettyDate } from "@/lib/format";
import { CategoryInline, CategoryList } from "@/lib/category-icons";
import { useHydrated } from "@/hooks/use-hydrated";
import { uiActions } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — every transaction | SmartBudget" },
      {
        name: "description",
        content:
          "Browse every family transaction grouped by date, search by payee, account, category or amount, and edit any entry.",
      },
      { property: "og:title", content: "History — every transaction | SmartBudget" },
      {
        property: "og:description",
        content: "All activity grouped by date, searchable and editable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const db = useDB();
  const hydrated = useHydrated();
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();

    const catNames = (t: Transaction) =>
      t.splits?.length
        ? t.splits
            .map((s) => db.categories.find((c) => c.id === s.categoryId)?.name ?? "")
            .join(" ")
        : (db.categories.find((c) => c.id === t.categoryId)?.name ?? "");

    const matches = (t: Transaction) => {
      if (!term) return true;
      const account = db.accounts.find((a) => a.id === t.accountId)?.name ?? "";
      const haystack = [
        t.payeeName ?? "",
        t.memo ?? "",
        account,
        catNames(t),
        t.transferId ? "transfer" : "",
        String(Math.abs(t.amount)),
        money(t.amount),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    };

    const list = db.transactions.filter(matches).sort((a, b) => b.date.localeCompare(a.date));

    const byDate = new Map<string, Transaction[]>();
    list.forEach((t) => {
      const arr = byDate.get(t.date) ?? [];
      arr.push(t);
      byDate.set(t.date, arr);
    });
    return [...byDate.entries()];
  }, [db, q]);

  const total = groups.reduce((s, [, items]) => s + items.length, 0);

  if (!hydrated) return <div className="shimmer h-96 rounded-2xl" />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "entry" : "entries"}
        </p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search payee, account, category, amount"
          aria-label="Search transactions"
          className="h-11 rounded-2xl pl-10 pr-10 text-sm"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="tap absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {groups.length === 0 && (
        <p className="surface px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing matches “{q}”.
        </p>
      )}

      {groups.map(([date, items]) => {
        const dayNet = items.reduce(
          (s, t) => s + (t.transferId || t.categoryTransferId ? 0 : t.amount),
          0,
        );
        return (
          <section key={date}>
            <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-background/90 px-4 py-2 backdrop-blur-sm md:mx-0 md:px-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {prettyDate(date)}
              </span>
              <span
                className={cn(
                  "num text-[11px] font-bold",
                  dayNet < 0 ? "text-muted-foreground" : "text-primary",
                )}
              >
                {money(dayNet)}
              </span>
            </div>

            <ul className="space-y-1.5">
              {items.map((t) => {
                const account = db.accounts.find((a) => a.id === t.accountId)?.name ?? "—";
                const splitCats = t.splits?.length
                  ? t.splits.map((s) => db.categories.find((c) => c.id === s.categoryId))
                  : [];
                const singleCat = db.categories.find((c) => c.id === t.categoryId);
                const info = categoryTransferInfo(db, t);
                const label = transactionLabel(db, t);
                return (
                  <li key={t.id} className="surface px-3.5 py-2.5">
                    <button
                      type="button"
                      onClick={() => uiActions.editTxn(t.id)}
                      className="tap flex w-full items-center gap-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{label}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {info ? (
                            singleCat ? (
                              <CategoryInline cat={singleCat} />
                            ) : (
                              "Category"
                            )
                          ) : (
                            <>
                              {account}
                              {" · "}
                              {t.transferId ? (
                                "Between accounts"
                              ) : splitCats.length ? (
                                <CategoryList cats={splitCats} />
                              ) : singleCat ? (
                                <CategoryInline cat={singleCat} />
                              ) : (
                                "Ready to Assign"
                              )}
                            </>
                          )}
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
                            : t.amount > 0
                              ? "text-primary"
                              : "text-foreground",
                        )}
                      >
                        {money(t.amount)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
