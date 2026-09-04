import { PendingBadge } from "@/components/PendingBadge";
import { useDB, transactionLabel, categoryTransferInfo, type Transaction } from "@/lib/store";
import { money, prettyDate } from "@/lib/format";
import { CategoryInline, CategoryList } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

/** A read-only transaction row used for drill-down inside reports. */
export function TransactionRow({
  t,
  share,
  showDate = false,
}: {
  t: Transaction;
  /** Optional category share to display instead of the full amount. */
  share?: number;
  showDate?: boolean;
}) {
  const db = useDB();
  const account = db.accounts.find((a) => a.id === t.accountId)?.name ?? "—";
  const splitCats = t.splits?.length
    ? t.splits.map((s) => db.categories.find((c) => c.id === s.categoryId))
    : [];
  const singleCat = db.categories.find((c) => c.id === t.categoryId);
  const info = categoryTransferInfo(db, t);
  const label = transactionLabel(db, t);
  const isSplit = !!t.splits?.length;

  return (
    <li key={t.id} className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
          <span className="truncate">{label}</span>
          {isSplit && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              Split
            </span>
          )}
          {t.pending && <PendingBadge />}
        </p>
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
              {showDate && (
                <>
                  {" · "}
                  {prettyDate(t.date)}
                </>
              )}
              {t.transferId && !showDate ? (
                " · Between accounts"
              ) : splitCats.length ? (
                <>
                  {" · "}
                  <CategoryList cats={splitCats} />
                </>
              ) : singleCat ? (
                <>
                  {" · "}
                  <CategoryInline cat={singleCat} />
                </>
              ) : (
                ""
              )}
            </>
          )}
        </p>
        {t.memo && t.memo !== label && (
          <p className="truncate text-[11px] italic text-muted-foreground/75">{t.memo}</p>
        )}
      </div>
      <span
        className={cn(
          "num shrink-0 text-sm font-bold",
          t.transferId || info
            ? "text-muted-foreground"
            : share !== undefined
              ? share < 0
                ? "text-foreground"
                : "text-primary"
              : t.amount > 0
                ? "text-primary"
                : "text-foreground",
        )}
      >
        {money(share !== undefined ? share : t.amount)}
      </span>
    </li>
  );
}
