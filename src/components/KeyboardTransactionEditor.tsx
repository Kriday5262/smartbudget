import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowDownRight, ArrowUpRight, Check, Tag, X } from "lucide-react";
import {
  ACCOUNT_TYPES,
  accountBalance,
  addTransaction,
  updateTransaction,
  type DB,
  type Transaction,
} from "@/lib/store";
import { money, prettyDate, todayISO } from "@/lib/format";
import { BankMark } from "./BankMark";
import { CardBrandMark } from "./CardBrandMark";
import { CategoryGlyph, categoryIconKey } from "@/lib/category-icons";
import { KeyboardDropdown, type KeyboardDropdownOption } from "./KeyboardDropdown";

export function KeyboardTransactionEditor({
  db,
  transaction,
  defaultDate,
  onDone,
  onCancel,
}: {
  db: DB;
  transaction?: Transaction;
  defaultDate: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(transaction?.accountId ?? db.accounts[0]?.id ?? "");
  const [payeeName, setPayeeName] = useState(transaction?.payeeName ?? "");
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const [amount, setAmount] = useState(transaction ? String(Math.abs(transaction.amount)) : "");
  const [direction, setDirection] = useState<"expense" | "income">(
    transaction && transaction.amount > 0 ? "income" : "expense",
  );
  const [date, setDate] = useState(transaction?.date ?? defaultDate);
  const [memo, setMemo] = useState(transaction?.memo ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  }, []);

  function save(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!accountId) return setError("Choose an account");
    if (!numericAmount || numericAmount <= 0) return setError("Enter an amount above zero");
    if (date > todayISO()) return setError("Date cannot be after today");

    const signedAmount = direction === "income" ? numericAmount : -numericAmount;
    const patch = {
      accountId,
      payeeName: payeeName.trim() || undefined,
      categoryId: categoryId || undefined,
      amount: signedAmount,
      date,
      memo: memo.trim() || undefined,
    };

    if (transaction) updateTransaction(transaction.id, patch);
    else addTransaction(patch);
    onDone();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }

    if (event.key === "Enter") {
      const controls = Array.from(
        formRef.current?.querySelectorAll<HTMLElement>("[data-entry-control]") ?? [],
      ).filter((control) => control.offsetParent !== null);
      const currentIndex = controls.indexOf(event.target as HTMLElement);
      if (currentIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        const next = controls[currentIndex + 1];
        if (next) {
          next.focus();
          if (next instanceof HTMLInputElement) next.select();
        } else {
          formRef.current?.requestSubmit();
        }
        return;
      }
    }

    if (event.key === "Tab") {
      const controls = Array.from(
        formRef.current?.querySelectorAll<HTMLElement>("[data-entry-control]") ?? [],
      ).filter((control) => control.offsetParent !== null);
      const first = controls[0];
      const last = controls[controls.length - 1];

      if (!event.shiftKey && event.target === last) {
        event.preventDefault();
        first?.focus();
      } else if (event.shiftKey && event.target === first) {
        event.preventDefault();
        last?.focus();
      }
    }
  }

  const inputClass =
    "h-10 min-w-0 border-b border-r border-primary/50 bg-primary/5 px-2 text-xs font-bold text-foreground outline-none focus:bg-primary/10 focus:ring-2 focus:ring-inset focus:ring-primary";
  const accountOptions: KeyboardDropdownOption[] = ACCOUNT_TYPES.flatMap((type) =>
    db.accounts
      .filter((account) => account.type === type.id && !account.closed)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((account) => ({
        value: account.id,
        label: account.name,
        group: type.plural,
        trailing: money(accountBalance(db, account.id).total),
        description:
          [
            account.bank,
            account.type === "credit" && account.creditLimit
              ? `Limit ${money(account.creditLimit)}`
              : null,
            (account.type === "fd" || account.type === "rd") && account.maturityDate
              ? `Maturity ${prettyDate(account.maturityDate)}`
              : null,
            (account.type === "fd" || account.type === "rd") && account.rateOfInterest
              ? `${account.rateOfInterest}% p.a.`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "—",
        icon:
          account.type === "credit" && account.brand ? (
            <CardBrandMark brand={account.brand} className="h-5 w-8" />
          ) : (
            <BankMark bank={account.bank} className="h-6 w-6" />
          ),
      })),
  );
  const categoryOptions: KeyboardDropdownOption[] = db.categoryGroups
    .filter((group) => !group.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((group) =>
      db.categories
        .filter((category) => category.groupId === group.id && !category.hidden)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((category) => ({
          value: category.id,
          label: category.name,
          group: group.name,
          description: "Budget category",
          icon: (
            <CategoryGlyph
              icon={categoryIconKey(category)}
              className="h-4 w-4 text-muted-foreground"
            />
          ),
        })),
    );
  const directionOptions: KeyboardDropdownOption[] = [
    {
      value: "expense",
      label: "Expense",
      description: "Money out",
      icon: <ArrowDownRight className="h-4 w-4 text-destructive" />,
    },
    {
      value: "income",
      label: "Income",
      description: "Money in",
      icon: <ArrowUpRight className="h-4 w-4 text-primary" />,
    },
  ];

  return (
    <form
      ref={formRef}
      onSubmit={save}
      onKeyDown={handleKeyDown}
      className="contents"
    >
      <input
        ref={firstFieldRef}
        data-entry-control
        value={payeeName}
        onChange={(event) => setPayeeName(event.target.value)}
        placeholder="Payee"
        className={inputClass}
      />
      <KeyboardDropdown
        value={accountId}
        onChange={setAccountId}
        options={accountOptions}
        placeholder="Account"
        ariaLabel="Account"
      />
      <KeyboardDropdown
        value={categoryId}
        onChange={setCategoryId}
        options={[
          {
            value: "",
            label: "No category",
            group: "Assignment",
            description: "Leave unassigned",
            icon: <Tag className="h-4 w-4 text-muted-foreground" />,
          },
          ...categoryOptions,
        ]}
        placeholder="Category"
        ariaLabel="Category"
      />
      <KeyboardDropdown
        value={direction}
        onChange={(value) => setDirection(value as "expense" | "income")}
        options={directionOptions}
        placeholder="Type"
        ariaLabel="Transaction type"
        searchable={false}
      />
      <input
        type="date"
        data-entry-control
        value={date}
        max={todayISO()}
        onChange={(event) => setDate(event.target.value)}
        className={`${inputClass} text-[10px]`}
        aria-label="Date"
      />
      <input
        data-entry-control
        value={memo}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="Memo"
        className={inputClass}
      />
      <input
        data-entry-control
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="Amount"
        inputMode="decimal"
        className={`${inputClass} text-right tabular-nums`}
        aria-invalid={Boolean(error)}
        title={error || undefined}
      />
      <div className="flex h-10 items-center justify-center gap-1 border-b border-primary/50 bg-primary/5 px-1">
        <button
          type="submit"
          className="rounded bg-primary p-1.5 text-primary-foreground"
          aria-label="Save row"
          title={error || "Save row (Enter)"}
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="Cancel editing"
          title="Cancel (Escape)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
