import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Plus,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Field, AccountPicker, CategoryPicker, SearchSelect } from "@/components/pickers";
import { useUI, uiActions, type AddTab } from "@/lib/ui-store";
import { useDB, addTransaction, addTransfer, addAccount, addGoal, BANKS, CARD_BRANDS, type BankName, type CardBrand, type AccountType } from "@/lib/store";
import { money, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

const TITLES: Record<AddTab, string> = {
  transaction: "Add transaction",
  account: "Add account",
  card: "Add credit card",
  goal: "Add goal",
};

export function AddPopup() {
  const { addOpen, addTab, addAccountId, addCategoryId } = useUI();
  const [done, setDone] = useState(false);

  const flash = (msg: string) => {
    toast.success(msg);
    setDone(true);
    setTimeout(() => {
      setDone(false);
      uiActions.closeAdd();
    }, 550);
  };

  return (
    <Dialog open={addOpen} onOpenChange={(o) => !o && uiActions.closeAdd()}>
      <DialogContent
        className={cn(
          "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
          "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
          "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        )}
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-2 pr-8 text-left">
          <DialogTitle className="truncate">{TITLES[addTab]}</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14">
            <div className="animate-bounce-in flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-8 w-8" strokeWidth={2.5} />
            </div>
            <p className="text-sm text-muted-foreground">Saved</p>
          </div>
        ) : addTab === "transaction" ? (
          <TransactionForm
            defaultAccountId={addAccountId}
            defaultCategoryId={addCategoryId}
            onSaved={flash}
          />
        ) : addTab === "account" ? (
          <AccountForm onSaved={flash} />
        ) : addTab === "card" ? (
          <CardForm onSaved={flash} />
        ) : (
          <GoalForm onSaved={flash} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- transaction ---------------- */

type Kind = "expense" | "income" | "transfer";

function TransactionForm({
  defaultAccountId,
  defaultCategoryId,
  onSaved,
}: {
  defaultAccountId?: string;
  defaultCategoryId?: string;
  onSaved: (m: string) => void;
}) {
  const db = useDB();
  const [kind, setKind] = useState<Kind>("expense");
  const [accountId, setAccountId] = useState(defaultAccountId ?? db.accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "");
  const [splitOn, setSplitOn] = useState(false);
  const [rows, setRows] = useState<{ categoryId: string; amount: string }[]>([
    { categoryId: "", amount: "" },
    { categoryId: "", amount: "" },
  ]);
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fromAccount = db.accounts.find((a) => a.id === accountId);
  const toAccount = db.accounts.find((a) => a.id === toAccountId);
  const needTransferCategory =
    kind === "transfer" &&
    fromAccount?.type === "account" &&
    (toAccount?.type === "fd" || toAccount?.type === "rd");

  const splitSum = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);

  function submit() {
    const e: Record<string, string> = {};
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) e.amount = "Enter an amount above zero";

    if (kind === "transfer") {
      if (!accountId) e.accountId = "Pick the source account";
      if (!toAccountId) e.toAccountId = "Pick the destination";
      if (accountId && accountId === toAccountId) e.toAccountId = "Pick two different accounts";
      if (needTransferCategory && !categoryId) e.category = "Pick a category for this transfer";
      setErrors(e);
      if (Object.keys(e).length) return;
      addTransfer({
        fromAccountId: accountId,
        toAccountId,
        amount: value,
        date,
        memo: memo || undefined,
        categoryId: needTransferCategory ? categoryId : undefined,
      });
      onSaved(`Transfer of ${money(value)} recorded`);
      return;
    }

    if (!accountId) e.accountId = "Pick an account";
    if (kind === "expense" && splitOn) {
      const filled = rows.filter((r) => r.categoryId && Number(r.amount) > 0);
      if (filled.length < 2) e.split = "Add at least two categories with amounts";
      else if (Math.abs(splitSum - value) > 0.5) e.split = `Split adds up to ${money(splitSum)}`;
    }
    setErrors(e);
    if (Object.keys(e).length) return;

    const signed = kind === "expense" ? -value : value;
    addTransaction({
      accountId,
      payeeName: payeeName.trim() || undefined,
      categoryId: kind === "expense" && !splitOn ? categoryId || undefined : undefined,
      splits:
        kind === "expense" && splitOn
          ? rows
              .filter((r) => r.categoryId && Number(r.amount) > 0)
              .map((r) => ({ categoryId: r.categoryId, amount: -Number(r.amount) }))
          : undefined,
      amount: signed,
      date,
      memo: memo || undefined,
    });
    onSaved(`Transaction added: ${money(signed)}`);
  }

  return (
    <div className="space-y-4">
      {/* Expense / Income / Transfer */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
        {(["expense", "income", "transfer"] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "tap rounded-xl py-2 text-xs font-bold capitalize transition-colors",
              kind === k
                ? "bg-card text-foreground shadow-[var(--shadow-card)]"
                : "text-muted-foreground",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <AccountPicker
        label={kind === "transfer" ? "From account" : "Account"}
        value={accountId}
        onChange={setAccountId}
      />

      {kind === "transfer" ? (
        <AccountPicker
          label="To account"
          value={toAccountId}
          onChange={setToAccountId}
          excludeId={accountId}
        />
      ) : (
        <Field label="Amount (₹)" error={errors.amount}>
          <Input
            className="num"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
      )}

      {kind === "transfer" && (
        <Field label="Amount (₹)" error={errors.amount}>
          <Input
            className="num"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
      )}

      {needTransferCategory && (
        <Field label="Category" error={errors.category}>
          <CategoryPicker
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Pick a category"
          />
        </Field>
      )}

      {kind !== "transfer" && (
        <Field label="Payee">
          <Input
            value={payeeName}
            onChange={(e) => setPayeeName(e.target.value)}
            placeholder={kind === "income" ? "Salary" : "BigBasket"}
          />
        </Field>
      )}

      {kind === "expense" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground">Category</Label>
            <div className="flex items-center gap-2">
              {splitOn && (
                <button
                  type="button"
                  onClick={() => {
                    const totalVal = Number(amount) || 0;
                    const n = rows.length;
                    if (!totalVal || !n) return;
                    const each = Math.floor((totalVal / n) * 100) / 100;
                    setRows(
                      rows.map((r, i) => ({
                        ...r,
                        amount: String(
                          i === n - 1 ? Math.round((totalVal - each * (n - 1)) * 100) / 100 : each,
                        ),
                      })),
                    );
                  }}
                  className="text-[11px] font-bold text-primary"
                >
                  Split equally
                </button>
              )}
              <button
                type="button"
                onClick={() => setSplitOn((s) => !s)}
                className="text-[11px] font-bold text-primary"
              >
                {splitOn ? "Use one category" : "Split across categories"}
              </button>
            </div>
          </div>

          {!splitOn ? (
            <CategoryPicker value={categoryId} onChange={setCategoryId} />
          ) : (
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CategoryPicker
                    value={r.categoryId}
                    onChange={(id) => setRows(rows.map((x, k) => (k === i ? { ...x, categoryId: id } : x)))}
                    placeholder="Category"
                    excludeId={rows.slice(0, i).map((x) => x.categoryId)}
                  />
                  <Input
                    className="num w-24"
                    inputMode="decimal"
                    placeholder="0"
                    value={r.amount}
                    onChange={(e) =>
                      setRows(rows.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))
                    }
                  />
                  <button
                    type="button"
                    aria-label="Remove split row"
                    onClick={() => setRows(rows.filter((_, k) => k !== i))}
                    className="tap rounded-lg p-2 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setRows([...rows, { categoryId: "", amount: "" }])}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> Add category
                </button>
                <span
                  className={cn(
                    "num text-[11px] font-bold",
                    Math.abs(splitSum - (Number(amount) || 0)) > 0.5
                      ? "text-destructive"
                      : "text-primary",
                  )}
                >
                  {money(splitSum)} / {money(Number(amount) || 0)}
                </span>
              </div>
              {errors.split && <p className="text-xs text-destructive">{errors.split}</p>}
            </div>
          )}
        </div>
      )}

      <Field label="Date">
        <span className="block w-28 shrink-0">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full"
          />
        </span>
      </Field>
      <Field label="Memo">
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional" />
      </Field>

      <Button className="h-11 w-full rounded-xl font-bold" onClick={submit}>
        {kind === "transfer" ? "Record transfer" : "Add transaction"}
      </Button>
    </div>
  );
}

/* ---------------- account ---------------- */

function AccountForm({ onSaved }: { onSaved: (m: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Exclude<AccountType, "credit">>("account");
  const [bank, setBank] = useState<BankName>("HDFC");
  const [balance, setBalance] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [rateOfInterest, setRateOfInterest] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isDeposit = type === "fd" || type === "rd";

  function submit() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Give the account a name";
    if (rateOfInterest && Number(rateOfInterest) < 0) e.rate = "Rate of interest can't be negative";
    setErrors(e);
    if (Object.keys(e).length) return;
    addAccount({
      name: name.trim(),
      type,
      bank,
      startingBalance: Number(balance) || 0,
      maturityDate: isDeposit && maturityDate ? maturityDate : undefined,
      rateOfInterest: isDeposit && rateOfInterest ? Number(rateOfInterest) : undefined,
    });
    onSaved(`Account added: ${name.trim()}`);
  }

  return (
    <div className="space-y-4">
      <Field label="Account name" error={errors.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="SBI Savings" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <SearchSelect
            value={type}
            onChange={(v) => setType(v as Exclude<AccountType, "credit">)}
            options={[
              { value: "account", label: "Account" },
              { value: "fd", label: "Fixed Deposit" },
              { value: "rd", label: "Recurring Deposit" },
            ]}
            title="Account type"
          />
        </Field>
        <Field label="Bank">
          <SearchSelect
            value={bank}
            onChange={(v) => setBank(v as BankName)}
            options={BANKS.map((b) => ({ value: b, label: b }))}
            title="Bank"
          />
        </Field>
      </div>
      <Field label="Starting balance (₹)">
        <Input
          className="num"
          inputMode="decimal"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="0.00"
        />
      </Field>
      {isDeposit && (
        <div className="space-y-4">
          <Field label="Maturity date">
            <Input
              type="date"
              value={maturityDate}
              onChange={(e) => setMaturityDate(e.target.value)}
              className="w-full"
            />
          </Field>
          <Field label="Rate of interest (% p.a.)" error={errors.rate}>
            <Input
              className="num w-full"
              inputMode="decimal"
              value={rateOfInterest}
              onChange={(e) => setRateOfInterest(e.target.value)}
              placeholder="7.1"
            />
          </Field>
        </div>
      )}
      <Button className="h-11 w-full rounded-xl font-bold" onClick={submit}>
        Add account
      </Button>
    </div>
  );
}

/* ---------------- credit card ---------------- */

function CardForm({ onSaved }: { onSaved: (m: string) => void }) {
  const [name, setName] = useState("");
  const [bank, setBank] = useState<BankName>("HDFC");
  const [brand, setBrand] = useState<CardBrand>("visa");
  const [outstanding, setOutstanding] = useState("");
  const [limit, setLimit] = useState("");
  const [billing, setBilling] = useState("");
  const [due, setDue] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Give the card a name";
    if (limit && Number(limit) <= 0) e.limit = "Credit limit must be positive";
    setErrors(e);
    if (Object.keys(e).length) return;
    addAccount({
      name: name.trim(),
      type: "credit",
      bank,
      brand,
      startingBalance: -Math.abs(Number(outstanding) || 0),
      creditLimit: Number(limit) || undefined,
      billingDate: Number(billing) || undefined,
      dueDate: Number(due) || undefined,
    });
    onSaved(`Card added: ${name.trim()}`);
  }

  return (
    <div className="space-y-4">
      <Field label="Card name" error={errors.name}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ICICI Amazon Pay"
        />
      </Field>
            <div className="grid grid-cols-2 gap-3">
        <Field label="Bank">
          <SearchSelect
            value={bank}
            onChange={(v) => setBank(v as BankName)}
            options={BANKS.map((b) => ({ value: b, label: b }))}
            title="Bank"
          />
        </Field>
        <Field label="Card network">
          <SearchSelect
            value={brand}
            onChange={(v) => setBrand(v as CardBrand)}
            options={CARD_BRANDS.map((b) => ({ value: b.id, label: b.label }))}
            title="Card network"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Outstanding (₹)">
          <Input
            className="num"
            inputMode="decimal"
            value={outstanding}
            onChange={(e) => setOutstanding(e.target.value)}
          />
        </Field>
        <Field label="Credit limit (₹)" error={errors.limit}>
          <Input
            className="num"
            inputMode="decimal"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Billing date">
          <Input
            className="num"
            inputMode="numeric"
            value={billing}
            onChange={(e) => setBilling(e.target.value)}
            placeholder="5"
          />
        </Field>
        <Field label="Due date">
          <Input
            className="num"
            inputMode="numeric"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            placeholder="22"
          />
        </Field>
      </div>
      <Button className="h-11 w-full rounded-xl font-bold" onClick={submit}>
        Add card
      </Button>
    </div>
  );
}

/* ---------------- goal ---------------- */

function GoalForm({ onSaved }: { onSaved: (m: string) => void }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name your goal";
    if (!target || Number(target) <= 0) e.target = "Set a target above zero";
    setErrors(e);
    if (Object.keys(e).length) return;
    addGoal(name.trim(), Number(target), date || undefined);
    onSaved(`Goal added: ${name.trim()}`);
  }

  return (
    <div className="space-y-4">
      <Field label="Goal name" error={errors.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goa trip" />
      </Field>
      <Field label="Target amount (₹)" error={errors.target}>
        <Input
          className="num"
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </Field>
      <Field label="Target date">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-28 shrink-0"
        />
      </Field>
      <Button className="h-11 w-full rounded-xl font-bold" onClick={submit}>
        Add goal
      </Button>
    </div>
  );
}

