import { useEffect, useMemo, useRef, useState } from "react";
import { prettyDate, signedMoney, todayISO } from "@/lib/format";
import { deleteTransaction, transactionLabel, type DB, type Transaction } from "@/lib/store";
import { cn } from "@/lib/utils";
import { KeyboardTransactionEditor } from "./KeyboardTransactionEditor";

type Column = {
  letter: string;
  label: string;
  value: (db: DB, transaction: Transaction) => string;
  align?: "right";
};

const COLUMNS: Column[] = [
  {
    letter: "A",
    label: "Payee",
    value: (db, transaction) => transaction.payeeName || transactionLabel(db, transaction),
  },
  {
    letter: "B",
    label: "Account",
    value: (db, transaction) =>
      db.accounts.find((account) => account.id === transaction.accountId)?.name || "—",
  },
  {
    letter: "C",
    label: "Category",
    value: (db, transaction) =>
      transaction.splits?.length
        ? "Split"
        : db.categories.find((category) => category.id === transaction.categoryId)?.name || "—",
  },
  {
    letter: "D",
    label: "Type",
    value: (_db, transaction) => (transaction.amount > 0 ? "Income" : "Expense"),
  },
  {
    letter: "E",
    label: "Date",
    value: (_db, transaction) => prettyDate(transaction.date),
  },
  {
    letter: "F",
    label: "Memo",
    value: (_db, transaction) => transaction.memo || "",
  },
  {
    letter: "G",
    label: "Amount",
    value: (_db, transaction) => signedMoney(transaction.amount),
    align: "right",
  },
  {
    letter: "H",
    label: "Actions",
    value: () => "",
  },
];

const MINIMUM_ROWS = 30;

function shiftDay(date: string, amount: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + amount);
  return next.toISOString().slice(0, 10);
}

function shiftMonth(date: string, amount: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + amount, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function KeyboardModePanel({
  db,
  date,
  onDateChange,
  onClose,
}: {
  db: DB;
  date: string;
  onDateChange: (date: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState({ row: 0, column: 0 });
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const transactions = useMemo(
    () =>
      db.transactions
        .filter((transaction) => transaction.date === date)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [date, db.transactions],
  );
  const rowCount = Math.max(MINIMUM_ROWS, transactions.length);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    setCell((current) => ({
      row: Math.min(current.row, rowCount - 1),
      column: current.column,
    }));
  }, [rowCount]);

  useEffect(() => {
    setPendingDeleteId(null);
  }, [cell.row, date]);

  useEffect(() => {
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-sheet-cell="${cell.row}-${cell.column}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [cell.column, cell.row]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === "KeyH") {
        event.preventDefault();
        event.stopPropagation();
        setShowCheatSheet((current) => !current);
        return;
      }
      if (showCheatSheet) {
        if (event.key === "Escape") {
          event.preventDefault();
          setShowCheatSheet(false);
          panelRef.current?.focus();
        }
        return;
      }
      if (editing) return;
      const target = event.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      ) {
        return;
      }

      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        onDateChange(todayISO());
        return;
      }
      if (event.altKey && event.shiftKey && event.key === "ArrowLeft") {
        event.preventDefault();
        onDateChange(shiftMonth(date, -1));
        return;
      }
      if (event.altKey && event.shiftKey && event.key === "ArrowRight") {
        event.preventDefault();
        const nextMonth = shiftMonth(date, 1);
        onDateChange(nextMonth > todayISO() ? todayISO() : nextMonth);
        return;
      }
      if (event.altKey && !event.shiftKey && event.key === "ArrowLeft") {
        event.preventDefault();
        onDateChange(shiftDay(date, -1));
        return;
      }
      if (event.altKey && !event.shiftKey && event.key === "ArrowRight") {
        event.preventDefault();
        if (date < todayISO()) onDateChange(shiftDay(date, 1));
        return;
      }
      if (event.shiftKey && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        event.stopPropagation();
        const selected = transactions[cell.row];
        if (!selected) return;
        if (pendingDeleteId === selected.id) {
          deleteTransaction(selected.id);
          setPendingDeleteId(null);
          setCell((current) => ({
            ...current,
            row: Math.min(current.row, Math.max(0, transactions.length - 2)),
          }));
        } else {
          setPendingDeleteId(selected.id);
        }
        return;
      }
      if (event.key === "Escape" && pendingDeleteId) {
        event.preventDefault();
        setPendingDeleteId(null);
        return;
      }
      if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setCell({ row: Math.min(transactions.length, rowCount - 1), column: 0 });
        setEditing("new");
        return;
      }
      if (event.key === "Enter") {
        const selected = transactions[cell.row];
        event.preventDefault();
        setEditing(selected ?? "new");
        return;
      }

      const movement: Record<string, { row: number; column: number }> = {
        ArrowUp: { row: -1, column: 0 },
        ArrowDown: { row: 1, column: 0 },
        ArrowLeft: { row: 0, column: -1 },
        ArrowRight: { row: 0, column: 1 },
      };
      const delta = movement[event.key];
      if (!delta) return;
      event.preventDefault();
      setCell((current) => ({
        row: Math.max(0, Math.min(rowCount - 1, current.row + delta.row)),
        column: Math.max(0, Math.min(COLUMNS.length - 1, current.column + delta.column)),
      }));
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cell.row, date, editing, onClose, onDateChange, pendingDeleteId, rowCount, showCheatSheet, transactions]);

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="keyboard-sheet-font flex h-screen min-h-0 w-full flex-col overflow-hidden bg-background font-semibold outline-none"
    >
      <div ref={gridRef} className="min-h-0 flex-1 overflow-auto bg-card">
        <div className="grid min-w-[1280px] grid-cols-[44px_1.25fr_1fr_1fr_110px_130px_1.25fr_130px_90px] text-xs">
          <div className="sticky top-0 z-20 border-b border-r border-border bg-muted" />
          {COLUMNS.map((column) => (
            <div
              key={column.letter}
              className="sticky top-0 z-20 border-b border-r border-border bg-muted py-1.5 text-center font-extrabold text-foreground last:border-r-0"
            >
              {column.letter}
            </div>
          ))}

          <div className="border-b border-r border-border bg-muted px-1 py-1.5 text-center font-bold text-muted-foreground">
            #
          </div>
          {COLUMNS.map((column) => (
            <div
              key={column.label}
              className="border-b border-r border-border bg-card px-1.5 py-1.5 font-extrabold text-foreground last:border-r-0"
            >
              {column.label}
            </div>
          ))}

          {Array.from({ length: rowCount }, (_, row) => {
            const transaction = transactions[row];
            const isEditing = Boolean(editing) && (
              editing === "new" ? !transaction && row === cell.row : editing.id === transaction?.id
            );
            return (
            <div key={transaction?.id ?? `empty-${row}`} className="contents">
              <button
                onClick={() => setCell({ row, column: cell.column })}
                className={cn(
                  "border-b border-r border-border bg-muted px-1 py-2.5 text-center font-bold text-muted-foreground",
                  pendingDeleteId === transaction?.id && "bg-destructive/15 text-destructive",
                )}
              >
                {row + 1}
              </button>
              {isEditing ? (
                <KeyboardTransactionEditor
                  key={editing === "new" ? `new-${date}-${row}` : editing.id}
                  db={db}
                  transaction={editing === "new" ? undefined : editing}
                  defaultDate={date}
                  onDone={() => {
                    setEditing(null);
                    panelRef.current?.focus();
                  }}
                  onCancel={() => {
                    setEditing(null);
                    panelRef.current?.focus();
                  }}
                />
              ) : COLUMNS.map((column, columnIndex) => {
                const selected = cell.row === row && cell.column === columnIndex;
                return (
                  <button
                    key={column.letter}
                    data-sheet-cell={`${row}-${columnIndex}`}
                    onClick={() => setCell({ row, column: columnIndex })}
                    onDoubleClick={() =>
                      setEditing(transaction ?? "new")
                    }
                    className={cn(
                      "min-h-9 truncate border-b border-r border-border px-2 py-2 text-left font-semibold text-foreground last:border-r-0",
                      column.align === "right" && "text-right font-semibold tabular-nums",
                      transaction && transaction.amount > 0 && column.letter === "G" && "text-primary",
                      pendingDeleteId === transaction?.id && "bg-destructive/10 text-destructive",
                      selected && "relative z-10 bg-primary/8 outline-2 -outline-offset-2 outline-primary",
                    )}
                    title={transaction ? column.value(db, transaction) : ""}
                  >
                    {transaction ? column.value(db, transaction) : ""}
                  </button>
                );
              })}
            </div>
          )})}
        </div>
      </div>

      <div className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-muted px-3 text-[9px] font-semibold text-muted-foreground">
        <span className={cn(pendingDeleteId && "font-bold text-destructive")}>
          {pendingDeleteId
            ? "Delete this row? Press ⇧Delete or ⇧Backspace again to confirm · Esc cancels"
            : `${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`}
        </span>
        <span>⌥⇧H Help · Ready · {prettyDate(date)}</span>
      </div>

      {showCheatSheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-cheat-sheet-title"
          className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 p-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border bg-primary px-5 py-3 text-primary-foreground">
              <div>
                <h2 id="keyboard-cheat-sheet-title" className="text-base font-extrabold">
                  Keyboard Mode Cheat Sheet
                </h2>
                <p className="text-[10px] font-semibold opacity-75">Press ⌥⇧H or Escape to close</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCheatSheet(false);
                  panelRef.current?.focus();
                }}
                className="rounded-md border border-primary-foreground/30 px-3 py-1.5 text-xs font-bold hover:bg-primary-foreground/10"
              >
                Close
              </button>
            </div>
            <div className="grid gap-px bg-border sm:grid-cols-2">
              {[
                ["Arrow keys", "Move between sheet cells"],
                ["Enter", "Edit the selected row"],
                ["N", "Add a new row"],
                ["⇧Delete / ⇧⌫", "Delete selected row; press twice to confirm"],
                ["Tab / ⇧Tab", "Move through and loop within row fields"],
                ["Enter / Space", "Open the selected dropdown"],
                ["↑ / ↓", "Move through dropdown choices"],
                ["Enter", "Choose the highlighted dropdown option"],
                ["Escape", "Close a menu, cancel editing, or close help"],
                ["⌥← / ⌥→", "Previous or next day"],
                ["⌥⇧← / ⌥⇧→", "Previous or next month"],
                ["⌥↑", "Return to today"],
                ["⌥⇧K", "Enter or exit Keyboard Mode"],
                ["⌥⇧H", "Open or close this cheat sheet"],
              ].map(([shortcut, description]) => (
                <div key={`${shortcut}-${description}`} className="flex items-center gap-4 bg-card px-5 py-3">
                  <kbd className="min-w-28 rounded-md border border-border bg-muted px-2.5 py-1.5 text-center text-xs font-extrabold text-foreground shadow-sm">
                    {shortcut}
                  </kbd>
                  <span className="text-xs font-semibold text-muted-foreground">{description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
