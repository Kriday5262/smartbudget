import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, AccountPicker, CategoryPicker } from "@/components/pickers";
import { useUI, uiActions } from "@/lib/ui-store";
import {
  useDB,
  updateTransaction,
  updateTransfer,
  updateCategoryTransfer,
  deleteTransaction,
  categoryTransferInfo,
} from "@/lib/store";
import { money, prettyDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Edit an existing transaction from anywhere (History, account detail). */
export function EditTransactionDialog() {
  const { editTxnId } = useUI();
  const db = useDB();
  const txn = db.transactions.find((t) => t.id === editTxnId);
  const isCatTransfer = !!txn?.categoryTransferId;

  return (
    <Dialog open={!!txn} onOpenChange={(o) => !o && uiActions.editTxn(undefined)}>
      <DialogContent
        className={cn(
          "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
          "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
          "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {txn?.categoryTransferId
              ? "Category transfer"
              : txn?.transferId
                ? "Edit transfer"
                : "Edit transaction"}
          </DialogTitle>
        </DialogHeader>
        {txn &&
          (isCatTransfer ? (
            <CatTransferForm key={txn.id} id={txn.id} />
          ) : (
            <Form key={txn.id} id={txn.id} />
          ))}
      </DialogContent>
    </Dialog>
  );
}

/** Edit + delete a category-to-category transfer (keeps both legs in sync). */
function CatTransferForm({ id }: { id: string }) {
  const db = useDB();
  const t = db.transactions.find((x) => x.id === id)!;
  const info = categoryTransferInfo(db, t);
  const [fromId, setFromId] = useState(
    info?.outbound ? (t.categoryId ?? "") : (info?.other?.categoryId ?? ""),
  );
  const [toId, setToId] = useState(
    info?.outbound ? (info?.other?.categoryId ?? "") : (t.categoryId ?? ""),
  );
  const [amount, setAmount] = useState(String(Math.abs(t.amount)));
  const [date, setDate] = useState(t.date);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const fromName = db.categories.find((c) => c.id === fromId)?.name ?? "category";
  const toName = db.categories.find((c) => c.id === toId)?.name ?? "category";

  function save() {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError("Enter an amount above zero");
      return;
    }
    if (!fromId || !toId || fromId === toId) {
      setError("Pick two different categories");
      return;
    }
    setError("");
    updateCategoryTransfer(id, { fromCategoryId: fromId, toCategoryId: toId, amount: value, date });
    toast.success("Transfer updated");
    uiActions.editTxn(undefined);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-muted p-4">
        <p className="text-sm font-bold">
          Move {money(Math.abs(t.amount))} from {fromName} to {toName}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{prettyDate(t.date)}</p>
      </div>

      <Field label="From category">
        <CategoryPicker value={fromId} onChange={setFromId} placeholder="Pick a category" />
      </Field>
      <Field label="To category">
        <CategoryPicker
          value={toId}
          onChange={setToId}
          placeholder="Pick a category"
          excludeId={fromId}
        />
      </Field>
      <Field label="Amount (₹)">
        <Input
          className="num"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button className="h-11 flex-1 rounded-xl font-bold" onClick={save}>
          Save changes
        </Button>
        <button
          type="button"
          aria-label="Delete transfer"
          onClick={() => setConfirmingDelete(true)}
          className="tap rounded-xl border border-border p-3 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent
          className={cn(
            "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
            "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
            "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          )}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the transfer and both category legs. You can still undo it
              afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteTransaction(id);
                toast.success("Transfer deleted");
                uiActions.editTxn(undefined);
              }}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Form({ id }: { id: string }) {
  const db = useDB();
  const t = db.transactions.find((x) => x.id === id)!;
  const isTransfer = !!t.transferId;

  const other = db.transactions.find((x) => x.transferId === t.transferId && x.id !== t.id);
  const fromLeg = isTransfer ? (t.amount < 0 ? t : other) : undefined;
  const toLeg = isTransfer ? (t.amount < 0 ? other : t) : undefined;

  const [accountId, setAccountId] = useState(t.accountId);
  const [fromId, setFromId] = useState(fromLeg?.accountId ?? t.accountId);
  const [toId, setToId] = useState(toLeg?.accountId ?? "");
  const [payeeName, setPayeeName] = useState(t.payeeName ?? "");
  const [categoryId, setCategoryId] = useState(t.categoryId ?? "");
  const [income, setIncome] = useState(t.amount > 0);
  const [amount, setAmount] = useState(String(Math.abs(t.amount)));
  const [date, setDate] = useState(t.date);
  const [memo, setMemo] = useState(t.memo ?? "");
  const [splitOn, setSplitOn] = useState(!!t.splits?.length);
  const [rows, setRows] = useState<{ categoryId: string; amount: string }[]>(
    t.splits?.length
      ? t.splits.map((s) => ({ categoryId: s.categoryId, amount: String(Math.abs(s.amount)) }))
      : [
          { categoryId: "", amount: "" },
          { categoryId: "", amount: "" },
        ],
  );
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const total = Number(amount) || 0;
  const splitSum = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);
  const remaining = total - splitSum;

  const fromAccount = db.accounts.find((a) => a.id === fromId);
  const toAccount = db.accounts.find((a) => a.id === toId);
  const needTransferCategory =
    isTransfer &&
    fromAccount?.type === "account" &&
    (toAccount?.type === "fd" || toAccount?.type === "rd");

  const setRow = (i: number, patch: Partial<{ categoryId: string; amount: string }>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  function splitEqually() {
    const n = rows.length;
    if (!total || !n) return;
    const each = Math.floor((total / n) * 100) / 100;
    setRows((rs) =>
      rs.map((r, i) => ({
        ...r,
        amount: String(i === n - 1 ? Math.round((total - each * (n - 1)) * 100) / 100 : each),
      })),
    );
  }

  function save() {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError("Enter an amount above zero");
      return;
    }

    if (isTransfer) {
      if (!fromId || !toId || fromId === toId) {
        setError("Pick two different accounts");
        return;
      }
      if (needTransferCategory && !categoryId) {
        setError("Pick a category for this transfer");
        return;
      }
      setError("");
      updateTransfer(id, {
        fromAccountId: fromId,
        toAccountId: toId,
        amount: value,
        date,
        memo: memo.trim() || undefined,
        categoryId: needTransferCategory ? categoryId || undefined : undefined,
      });
      toast.success("Transfer updated");
      uiActions.editTxn(undefined);
      return;
    }

    const signed = income ? value : -value;
    const filled = rows.filter((r) => r.categoryId && Number(r.amount) > 0);
    if (splitOn) {
      if (filled.length < 2) {
        setError("Add at least two categories with amounts");
        return;
      }
      if (Math.abs(splitSum - value) > 0.5) {
        setError(`Split adds up to ${money(splitSum)} — total is ${money(value)}`);
        return;
      }
    }
    setError("");

    updateTransaction(id, {
      accountId,
      date,
      memo: memo.trim() || undefined,
      amount: signed,
      payeeName: payeeName.trim() || undefined,
      categoryId: splitOn ? undefined : categoryId || undefined,
      splits: splitOn
        ? filled.map((r) => ({
            categoryId: r.categoryId,
            amount: (income ? 1 : -1) * Number(r.amount),
          }))
        : undefined,
    });
    toast.success("Transaction updated");
    uiActions.editTxn(undefined);
  }

  return (
    <div className="space-y-4">
      {!isTransfer && (
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
          {[
            { k: false, label: "Expense" },
            { k: true, label: "Income" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setIncome(o.k)}
              className={cn(
                "tap rounded-xl py-2 text-xs font-bold transition-colors",
                income === o.k
                  ? "bg-card text-foreground shadow-[var(--shadow-card)]"
                  : "text-muted-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {isTransfer ? (
        <>
          <AccountPicker label="From account" value={fromId} onChange={setFromId} />
          <AccountPicker label="To account" value={toId} onChange={setToId} excludeId={fromId} />
          <Field label="Amount (₹)">
            <Input
              className="num"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          {needTransferCategory && (
            <Field label="Category">
              <CategoryPicker
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Pick a category"
              />
            </Field>
          )}
        </>
      ) : (
        <>
          <AccountPicker label="Account" value={accountId} onChange={setAccountId} />
          <Field label="Amount (₹)">
            <Input
              className="num"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Payee">
            <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
          </Field>

          {!splitOn && (
            <Field label="Category">
              <CategoryPicker value={categoryId} onChange={setCategoryId} placeholder="Optional" />
            </Field>
          )}

          <button
            type="button"
            onClick={() => setSplitOn((s) => !s)}
            className="tap text-xs font-bold text-primary"
          >
            {splitOn ? "Use a single category" : "Split across categories"}
          </button>

          {splitOn && (
            <div className="space-y-2 rounded-2xl border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Categories
                </p>
                <button
                  type="button"
                  onClick={splitEqually}
                  className="tap text-xs font-bold text-primary"
                >
                  Split equally
                </button>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CategoryPicker
                    value={r.categoryId}
                    onChange={(id) => setRow(i, { categoryId: id })}
                    placeholder="Category"
                    excludeId={rows.slice(0, i).map((x) => x.categoryId)}
                  />
                  <Input
                    className="num w-24"
                    inputMode="decimal"
                    placeholder="0"
                    value={r.amount}
                    onChange={(e) => setRow(i, { amount: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label="Remove split row"
                    onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
                    disabled={rows.length <= 2}
                    className="tap rounded-lg p-2 text-muted-foreground disabled:opacity-30"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setRows((rs) => [...rs, { categoryId: "", amount: "" }])}
                  className="tap flex items-center gap-1 text-xs font-bold text-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> Add category
                </button>
                <span
                  className={cn(
                    "num text-[11px] font-bold",
                    Math.abs(remaining) < 0.5 ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {Math.abs(remaining) < 0.5 ? "Balanced" : `${money(remaining)} left`}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Memo">
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional" />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button className="h-11 flex-1 rounded-xl font-bold" onClick={save}>
          Save changes
        </Button>
        <button
          type="button"
          aria-label="Delete transaction"
          onClick={() => setConfirmingDelete(true)}
          className="tap rounded-xl border border-border p-3 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent
          className={cn(
            "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
            "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
            "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          )}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes{" "}
              {isTransfer ? "the transfer and both account legs" : "the transaction"}. You can still
              undo it afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteTransaction(id);
                toast.success("Transaction deleted");
                uiActions.editTxn(undefined);
              }}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
