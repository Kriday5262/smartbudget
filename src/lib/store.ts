import { useSyncExternalStore } from "react";
import { saveDB } from "./api";
import { monthKey, todayISO } from "./format";

/** The four account families the app understands. */
export type AccountType = "account" | "credit" | "fd" | "rd";
export type CardBrand = "visa" | "mastercard" | "amex" | "rupay";

export const ACCOUNT_TYPES: { id: AccountType; label: string; plural: string }[] = [
  { id: "account", label: "Account", plural: "Accounts" },
  { id: "credit", label: "Credit Card", plural: "Credit Cards" },
  { id: "fd", label: "Fixed Deposit", plural: "Fixed Deposits" },
  { id: "rd", label: "Recurring Deposit", plural: "Recurring Deposits" },
];

export const BANKS = ["HDFC", "ICICI", "Kotak", "Axis", "Other"] as const;
export type BankName = (typeof BANKS)[number];

export const CARD_BRANDS: { id: CardBrand; label: string }[] = [
  { id: "visa", label: "Visa" },
  { id: "mastercard", label: "Mastercard" },
  { id: "amex", label: "American Express" },
  { id: "rupay", label: "RuPay" },
];

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  onBudget: boolean;
  closed: boolean;
  sortOrder: number;
  startingBalance: number;
  /** issuing bank, for accounts / cards / deposits */
  bank?: BankName;
  /** owner's UPI id, so SmartPay knows who paid when splitting a bill */
  upiVpa?: string;
  /** credit-card only */
  brand?: CardBrand;
  creditLimit?: number;
  billingDate?: number;
  dueDate?: number;
  /** fixed deposit / recurring deposit only */
  maturityDate?: string;
  /** fixed deposit / recurring deposit only, % p.a. */
  rateOfInterest?: number;
};

export type CategoryGroup = { id: string; name: string; sortOrder: number; hidden: boolean };
export type Category = {
  id: string;
  groupId: string;
  name: string;
  sortOrder: number;
  hidden: boolean;
  /** Lucide icon key from the category icon catalog */
  icon?: string;
  /** owner's UPI id, for receiving money into this category */
  upiVpa?: string;
};
export type Payee = { id: string; name: string; upiVpa?: string; sortOrder: number };

/** One leg of a transaction split across several categories. */
export type TxnSplit = { categoryId: string; amount: number };

export type Transaction = {
  id: string;
  accountId: string;
  payeeName?: string;
  categoryId?: string;
  /** when present, the transaction is split across categories (amounts are signed) */
  splits?: TxnSplit[];
  /** negative = expense, positive = income */
  amount: number;
  date: string;
  memo?: string;
  /** both legs of an account-to-account transfer share this id */
  transferId?: string;
  /** both legs of a category-to-category transfer share this id (no real account) */
  categoryTransferId?: string;
  source?: string;
  upiRef?: string;
};

export type MonthlyBudget = { id: string; categoryId: string; month: string; budgeted: number };
export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  targetDate?: string;
  categoryId?: string;
  saved: number;
};
export type SplitShare = {
  id: string;
  payeeName: string;
  upiVpa?: string;
  share: number;
  settled: boolean;
};
export type Split = {
  id: string;
  total: number;
  payerName: string;
  note?: string;
  date: string;
  shares: SplitShare[];
  /** when created from a split transaction in the Pay tab, links back to it */
  sourceTxnId?: string;
};

export type Loan = {
  id: string;
  name: string;
  lender?: string;
  /** amount originally borrowed */
  principal: number;
  /** amount still owed */
  outstanding: number;
  /** % p.a. */
  rateOfInterest?: number;
};

export type DB = {
  accounts: Account[];
  categoryGroups: CategoryGroup[];
  categories: Category[];
  payees: Payee[];
  transactions: Transaction[];
  monthlyBudgets: MonthlyBudget[];
  goals: Goal[];
  splits: Split[];
  loans: Loan[];
  settings: Record<string, string>;
};

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function seed(): DB {
  const acc = (
    name: string,
    type: AccountType,
    startingBalance: number,
    sortOrder: number,
    extra: Partial<Account> = {},
  ): Account => ({
    id: uid(),
    name,
    type,
    onBudget: type === "account" || type === "credit",
    closed: false,
    sortOrder,
    startingBalance,
    ...extra,
  });

  const accounts = [
    acc("HDFC Savings", "account", 184500, 0, { bank: "HDFC" }),
    acc("ICICI Salary", "account", 42800, 1, { bank: "ICICI" }),
    acc("HDFC Regalia", "credit", -18400, 2, {
      bank: "HDFC",
      brand: "visa",
      creditLimit: 300000,
      billingDate: 5,
      dueDate: 22,
    }),
    acc("Axis Ace", "credit", -6250, 3, {
      bank: "Axis",
      brand: "mastercard",
      creditLimit: 150000,
      billingDate: 12,
      dueDate: 30,
    }),
    acc("Kotak FD 2027", "fd", 250000, 4, { bank: "Kotak" }),
    acc("ICICI RD Monthly", "rd", 60000, 5, { bank: "ICICI" }),
  ];

  const groups: CategoryGroup[] = [
    { id: uid(), name: "Immediate Obligations", sortOrder: 0, hidden: false },
    { id: uid(), name: "Family Life", sortOrder: 1, hidden: false },
    { id: uid(), name: "Future You", sortOrder: 2, hidden: false },
  ];

  const catNames: [number, string][] = [
    [0, "Rent"],
    [0, "Groceries"],
    [0, "Electricity"],
    [0, "Internet"],
    [1, "Dining Out"],
    [1, "Kids & School"],
    [1, "Transport"],
    [1, "Entertainment"],
    [2, "Emergency Fund"],
    [2, "Travel Fund"],
  ];
  const categories: Category[] = catNames.map(([g, name], i) => ({
    id: uid(),
    groupId: groups[g].id,
    name,
    sortOrder: i,
    hidden: false,
  }));

  const payeeSeed: [string, string | undefined][] = [
    ["Priya", "priya@okicici"],
    ["Arjun", "arjun@ybl"],
    ["Meera", "meera@okaxis"],
  ];
  const payees: Payee[] = payeeSeed.map(([name, upiVpa], i) => ({
    id: uid(),
    name,
    upiVpa,
    sortOrder: i,
  }));

  const cat = (n: string) => categories.find((c) => c.name === n)!.id;

  const transactions: Transaction[] = [
    {
      id: uid(),
      accountId: accounts[0].id,
      payeeName: "Salary",
      amount: 185000,
      date: daysAgo(28),
      memo: "Monthly salary",
    },
    {
      id: uid(),
      accountId: accounts[0].id,
      payeeName: "Landlord",
      categoryId: cat("Rent"),
      amount: -42000,
      date: daysAgo(26),
    },
    {
      id: uid(),
      accountId: accounts[0].id,
      payeeName: "BigBasket",
      amount: -6480.5,
      date: daysAgo(12),
      memo: "Monthly stock-up",
      splits: [
        { categoryId: cat("Groceries"), amount: -5200 },
        { categoryId: cat("Kids & School"), amount: -1280.5 },
      ],
    },
    {
      id: uid(),
      accountId: accounts[1].id,
      payeeName: "Swiggy",
      categoryId: cat("Dining Out"),
      amount: -845,
      date: daysAgo(6),
    },
    {
      id: uid(),
      accountId: accounts[2].id,
      payeeName: "Uber",
      categoryId: cat("Transport"),
      amount: -320,
      date: daysAgo(3),
    },
    {
      id: uid(),
      accountId: accounts[0].id,
      payeeName: "School",
      categoryId: cat("Kids & School"),
      amount: -1500,
      date: daysAgo(2),
      memo: "School supplies",
    },
    {
      id: uid(),
      accountId: accounts[3].id,
      payeeName: "BigBasket",
      categoryId: cat("Groceries"),
      amount: -2310,
      date: daysAgo(1),
    },
  ];

  const m = monthKey();
  const budgetSeed: [string, number][] = [
    ["Rent", 42000],
    ["Groceries", 14000],
    ["Electricity", 3200],
    ["Internet", 1200],
    ["Dining Out", 5000],
    ["Kids & School", 8000],
    ["Transport", 4000],
    ["Entertainment", 2500],
    ["Emergency Fund", 20000],
    ["Travel Fund", 10000],
  ];
  const monthlyBudgets: MonthlyBudget[] = budgetSeed.map(([name, budgeted]) => ({
    id: uid(),
    categoryId: cat(name),
    month: m,
    budgeted,
  }));

  const goals: Goal[] = [
    { id: uid(), name: "Goa Family Trip", targetAmount: 120000, saved: 46000 },
    { id: uid(), name: "6-Month Emergency Fund", targetAmount: 600000, saved: 250000 },
    { id: uid(), name: "New Laptop", targetAmount: 90000, saved: 90000 },
  ];

  return {
    accounts,
    categoryGroups: groups,
    categories,
    payees,
    transactions,
    monthlyBudgets,
    goals,
    splits: [],
    loans: [],
    settings: { payLinkBase: "https://pay.smarthomeskc.me/upi" },
  };
}

let db: DB | null = null;
const listeners = new Set<() => void>();
let dbInitialized = false;

/** Parse the value returned by fetchDB into a DB, repairing legacy double-encoded saves. */
function parseDBValue(json: string | object): DB | null {
  let value: any = json;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        return null;
      }
    }
  }
  if (value && typeof value === "object" && Array.isArray(value.accounts)) {
    return value as DB;
  }
  return null;
}

export async function initDB(): Promise<void> {
  if (dbInitialized) return;
  try {
    const { fetchDB, saveDB } = await import("./api");
    const json = await fetchDB();
    const parsed = parseDBValue(json as any);
    if (parsed) {
      db = parsed;
    } else {
      db = seed();
      await saveDB({ data: db });
    }
  } catch {
    db = seed();
  }
  dbInitialized = true;
  listeners.forEach((l) => l());
}

let pendingSave = false;

export async function refreshDB(): Promise<void> {
  if (pendingSave || !dbInitialized) return;
  try {
    const { fetchDB } = await import("./api");
    const json = await fetchDB();
    const parsed = parseDBValue(json as any);
    if (parsed) {
      const current = db ? JSON.stringify(db) : "";
      if (JSON.stringify(parsed) !== current) {
        db = parsed;
        undoStack = [];
        redoStack = [];
        listeners.forEach((l) => l());
      }
    }
  } catch {}
}

function load(): DB {
  if (db && typeof db === "object" && db.accounts) {
    if (!db.transactions) db.transactions = [];
    if (!db.transactions) db.transactions = [];
    if (!db.categories) db.categories = [];
    if (!db.payees) db.payees = [];
    if (!db.categoryGroups) db.categoryGroups = [];
    if (!db.monthlyBudgets) db.monthlyBudgets = [];
    if (!db.goals) db.goals = [];
    if (!db.splits) db.splits = [];
    if (!db.loans) db.loans = [];
    if (!db.settings) db.settings = {};
    return db;
  }
  db = seed();
  return db;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (typeof window === "undefined" || !db) return;
  pendingSave = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDB({ data: db })
      .then(() => {
        pendingSave = false;
      })
      .catch(() => {
        pendingSave = false;
      });
  }, 300);
}

export function getDB(): DB {
  return load();
}

/* ---------- undo / redo ---------- */

const UNDO_LIMIT = 50;
let undoStack: DB[] = [];
let redoStack: DB[] = [];

function pushUndo(snapshot: DB) {
  undoStack.push(snapshot);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function pushRedo(snapshot: DB) {
  redoStack.push(snapshot);
  if (redoStack.length > UNDO_LIMIT) redoStack.shift();
}

export function canUndo() {
  return undoStack.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

/** Restore the state before the most recent change. */
export function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  pushRedo(load());
  db = prev;
  persist();
  listeners.forEach((l) => l());
}

/** Re-apply the most recently undone change. */
export function redo() {
  const next = redoStack.pop();
  if (!next) return;
  pushUndo(load());
  db = next;
  persist();
  listeners.forEach((l) => l());
}

const EMPTY_UNDO = Object.freeze({ canUndo: false, canRedo: false });
let undoCache: { canUndo: boolean; canRedo: boolean } = EMPTY_UNDO;

function undoSnapshot() {
  const u = canUndo();
  const r = canRedo();
  if (u === undoCache.canUndo && r === undoCache.canRedo) return undoCache;
  undoCache = { canUndo: u, canRedo: r };
  return undoCache;
}

/** Reactive canUndo / canRedo for button disabled states. */
export function useUndo() {
  return useSyncExternalStore(subscribe, undoSnapshot, () => EMPTY_UNDO);
}

export function mutate(fn: (draft: DB) => void) {
  const prev = load();
  const next = structuredClone(prev);
  fn(next);
  // ignore no-op mutations so they don't clutter the undo history
  if (JSON.stringify(next) === JSON.stringify(prev)) return;
  pushUndo(prev);
  redoStack = [];
  db = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const serverSnapshot = seed();

export function useDB(): DB {
  return useSyncExternalStore(
    subscribe,
    () => load(),
    () => serverSnapshot,
  );
}

/* ---------- derived selectors ---------- */

export function accountBalance(db: DB, accountId: string) {
  const a = db.accounts.find((x) => x.id === accountId);
  const raw =
    (a?.startingBalance ?? 0) +
    db.transactions.filter((t) => t.accountId === accountId).reduce((s, t) => s + t.amount, 0);
  // Rupee amounts carry at most 2 decimals; rounding here erases floating-point
  // residue (e.g. -2245.95 + 2245.95 === -4.5e-13) and avoids a bogus red "₹-0.00".
  const total = Math.round(raw * 100) / 100;
  return { total: total === 0 ? 0 : total };
}

export function accountsOfType(db: DB, type: AccountType) {
  return db.accounts
    .filter((a) => a.type === type && !a.closed)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Accounts grouped by type (accounts → cards → FD → RD), then in sortOrder. */
const ACCOUNT_TYPE_ORDER: Record<AccountType, number> = { account: 0, credit: 1, fd: 2, rd: 3 };

export function sortedAccounts(db: DB, opts?: { includeClosed?: boolean }): Account[] {
  return db.accounts
    .filter((a) => (opts?.includeClosed ? true : !a.closed))
    .sort(
      (a, b) =>
        ACCOUNT_TYPE_ORDER[a.type] - ACCOUNT_TYPE_ORDER[b.type] || a.sortOrder - b.sortOrder,
    );
}

/**
 * All categories in the same order the Budget page shows them:
 * groups by sortOrder, then categories by sortOrder within each group.
 */
export function sortedCategories(db: DB): Category[] {
  return [...db.categoryGroups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((g) =>
      [...db.categories]
        .filter((c) => c.groupId === g.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
}

export function typeTotal(db: DB, type: AccountType) {
  return accountsOfType(db, type).reduce((s, a) => s + accountBalance(db, a.id).total, 0);
}

export function netWorth(db: DB) {
  const assets = db.accounts
    .filter((a) => !a.closed)
    .reduce((s, a) => s + accountBalance(db, a.id).total, 0);
  const owed = (db.loans ?? []).reduce((s, l) => s + l.outstanding, 0);
  return assets - owed;
}

/** Transfers move money between accounts, so they never count as income/expense. */
function isSpendable(t: Transaction) {
  return !t.transferId && !t.categoryTransferId;
}

export function monthActivity(db: DB, month: string) {
  const txns = db.transactions.filter((t) => t.date.startsWith(month) && isSpendable(t));
  const income = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = txns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  return { income, expense, net: income + expense };
}

/** Amount of a single transaction that lands on a given category. */
export function amountForCategory(t: Transaction, categoryId: string) {
  if (t.splits?.length) {
    return t.splits.filter((s) => s.categoryId === categoryId).reduce((s, x) => s + x.amount, 0);
  }
  return t.categoryId === categoryId ? t.amount : 0;
}

/** Total amount of a transaction that is assigned to any category at all. */
export function categorisedAmount(t: Transaction) {
  if (t.splits?.length) return t.splits.reduce((s, x) => s + x.amount, 0);
  return t.categoryId ? t.amount : 0;
}

export function categoryActivity(db: DB, categoryId: string, month: string) {
  return db.transactions
    .filter((t) => t.date.startsWith(month))
    .reduce((s, t) => s + amountForCategory(t, categoryId), 0);
}

/**
 * Money actually spent from a category in a month (negative share amounts).
 * Unlinked transfers are excluded so "Spent" reflects real spending only, but
 * an account transfer with an explicitly assigned category counts against it
 * (e.g. money moved to a savings/deposit account leaves the budget). Category
 * moves (categoryTransferId) are excluded too — they surface as "Moved".
 * Transfers still move the Available balance via categoryActivity.
 */
export function categorySpent(db: DB, categoryId: string, month: string) {
  return db.transactions
    .filter(
      (t) =>
        t.date.startsWith(month) &&
        (isSpendable(t) || (!!t.transferId && !t.categoryTransferId && !!t.categoryId)),
    )
    .reduce((s, t) => {
      if (t.splits?.length) {
        return (
          s +
          t.splits
            .filter((x) => x.categoryId === categoryId && x.amount < 0)
            .reduce((a, x) => a + x.amount, 0)
        );
      }
      return t.categoryId === categoryId && t.amount < 0 ? s + t.amount : s;
    }, 0);
}

/**
 * Money moved OUT of a category via category-to-category transfers in a month
 * (positive magnitude). Displayed separately from "Spent" and feeds the budget
 * progress bar, since transferred-out rupees are no longer available to that
 * category.
 */
export function categoryTransferredOut(db: DB, categoryId: string, month: string) {
  return db.transactions
    .filter(
      (t) =>
        t.categoryTransferId &&
        t.date.startsWith(month) &&
        t.categoryId === categoryId &&
        t.amount < 0,
    )
    .reduce((s, t) => s - t.amount, 0);
}

export function budgetedFor(db: DB, categoryId: string, month: string) {
  return (
    db.monthlyBudgets.find((b) => b.categoryId === categoryId && b.month === month)?.budgeted ?? 0
  );
}

/** available = all budgeted up to and including month + all activity up to month */
export function categoryAvailable(db: DB, categoryId: string, month: string) {
  const budgeted = db.monthlyBudgets
    .filter((b) => b.categoryId === categoryId && b.month <= month)
    .reduce((s, b) => s + b.budgeted, 0);
  const activity = db.transactions
    .filter((t) => t.date.slice(0, 7) <= month)
    .reduce((s, t) => s + amountForCategory(t, categoryId), 0);
  return budgeted + activity;
}

export function readyToAssign(db: DB, month: string) {
  const funds = db.accounts
    .filter((a) => a.onBudget && !a.closed)
    .reduce((s, a) => s + accountBalance(db, a.id).total, 0);
  const assigned = db.monthlyBudgets
    .filter((b) => b.month <= month)
    .reduce((s, b) => s + b.budgeted, 0);
  const spentFromCategories = db.transactions
    .filter((t) => t.date.slice(0, 7) <= month)
    .reduce((s, t) => s + categorisedAmount(t), 0);
  // Round away floating-point residue (e.g. a true 0 can come out as -2.9e-11,
  // which would wrongly flag the budget as over-assigned).
  const total = funds - (assigned + spentFromCategories);
  const rounded = Math.round(total * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

export function lastMonths(count: number, from = monthKey()): string[] {
  const [y, m] = from.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => monthKey(new Date(y, m - 1 - (count - 1 - i), 1)));
}

/* ---------- transaction actions ---------- */

export function addTransaction(input: Omit<Transaction, "id">) {
  const id = uid();
  mutate((d) => d.transactions.unshift({ ...input, id }));
  return id;
}

export function addTransfer(input: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  memo?: string;
  categoryId?: string;
}) {
  const transferId = uid();
  mutate((d) => {
    d.transactions.unshift(
      {
        id: uid(),
        accountId: input.fromAccountId,
        amount: -Math.abs(input.amount),
        date: input.date,
        memo: input.memo,
        transferId,
        categoryId: input.categoryId,
      },
      {
        id: uid(),
        accountId: input.toAccountId,
        amount: Math.abs(input.amount),
        date: input.date,
        memo: input.memo,
        transferId,
      },
    );
  });
  return transferId;
}

export function updateTransaction(id: string, patch: Partial<Omit<Transaction, "id">>) {
  mutate((d) => {
    const t = d.transactions.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    // keep both legs of a transfer in sync
    if (t.transferId) {
      const other = d.transactions.find((x) => x.transferId === t.transferId && x.id !== t.id);
      if (other) {
        if (patch.date) other.date = t.date;
        if (patch.memo !== undefined) other.memo = t.memo;
        if (patch.amount !== undefined) other.amount = -t.amount;
      }
    }
  });
}

export function updateTransfer(
  id: string,
  input: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date: string;
    memo?: string;
    categoryId?: string;
  },
) {
  mutate((d) => {
    const t = d.transactions.find((x) => x.id === id);
    if (!t || !t.transferId) return;
    d.transactions.forEach((x) => {
      if (x.transferId !== t.transferId) return;
      if (x.amount < 0) {
        x.accountId = input.fromAccountId;
        x.amount = -Math.abs(input.amount);
        x.categoryId = input.categoryId;
      } else {
        x.accountId = input.toAccountId;
        x.amount = Math.abs(input.amount);
        x.categoryId = undefined;
      }
      x.date = input.date;
      x.memo = input.memo;
    });
  });
}

export function deleteTransaction(id: string) {
  mutate((d) => {
    const t = d.transactions.find((x) => x.id === id);
    d.transactions = d.transactions.filter((x) =>
      t?.transferId
        ? x.transferId !== t.transferId
        : t?.categoryTransferId
          ? x.categoryTransferId !== t.categoryTransferId
          : x.id !== id,
    );
  });
}

/* ---------- budget actions ---------- */

export function setBudget(categoryId: string, month: string, budgeted: number) {
  mutate((d) => {
    const existing = d.monthlyBudgets.find((b) => b.categoryId === categoryId && b.month === month);
    if (existing) existing.budgeted = budgeted;
    else d.monthlyBudgets.push({ id: uid(), categoryId, month, budgeted });
  });
}

export function moveMoney(fromId: string, toId: string, month: string, amount: number) {
  const d = getDB();
  setBudget(fromId, month, budgetedFor(d, fromId, month) - amount);
  setBudget(toId, month, budgetedFor(getDB(), toId, month) + amount);
}

/**
 * Record a category-to-category transfer as a pair of zero-sum ledger entries:
 * a negative leg on the source category and a positive leg on the destination,
 * linked by a shared `categoryTransferId`. Both legs carry `accountId: ""`, so
 * they never affect account balances or income/expense, but they do move the
 * "available" balance between the two categories.
 */
export function categoryTransfer(
  fromCategoryId: string,
  toCategoryId: string,
  amount: number,
  date: string,
) {
  const categoryTransferId = uid();
  mutate((d) => {
    d.transactions.unshift(
      {
        id: uid(),
        accountId: "",
        categoryId: fromCategoryId,
        amount: -Math.abs(amount),
        date,
        categoryTransferId,
      },
      {
        id: uid(),
        accountId: "",
        categoryId: toCategoryId,
        amount: Math.abs(amount),
        date,
        categoryTransferId,
      },
    );
  });
}

/** Paired leg + side of a category-to-category transfer, or null for other txns. */
export function categoryTransferInfo(
  db: DB,
  t: Transaction,
): { other: Transaction | undefined; outbound: boolean } | null {
  if (!t.categoryTransferId) return null;
  const other = db.transactions.find(
    (x) => x.categoryTransferId === t.categoryTransferId && x.id !== t.id,
  );
  return { other, outbound: t.amount < 0 };
}

/** Update both legs of a category-to-category transfer. */
export function updateCategoryTransfer(
  id: string,
  input: { fromCategoryId: string; toCategoryId: string; amount: number; date: string },
) {
  mutate((d) => {
    const t = d.transactions.find((x) => x.id === id);
    if (!t || !t.categoryTransferId) return;
    d.transactions.forEach((x) => {
      if (x.categoryTransferId !== t.categoryTransferId) return;
      if (x.amount < 0) {
        x.categoryId = input.fromCategoryId;
        x.amount = -Math.abs(input.amount);
      } else {
        x.categoryId = input.toCategoryId;
        x.amount = Math.abs(input.amount);
      }
      x.date = input.date;
    });
  });
}

/** Paired leg + side of an account-to-account transfer, or null for other txns. */
export function transferInfo(
  db: DB,
  t: Transaction,
): { other: Transaction | undefined; outbound: boolean } | null {
  if (!t.transferId) return null;
  const other = db.transactions.find((x) => x.transferId === t.transferId && x.id !== t.id);
  return { other, outbound: t.amount < 0 };
}

/**
 * Human label for a transaction row: account transfers become
 * "Transfer from/to <account>", category moves "Move from/to <category>",
 * everything else falls back to payee/memo.
 */
export function transactionLabel(db: DB, t: Transaction): string {
  if (t.transferId) {
    const info = transferInfo(db, t);
    const other = info?.other
      ? db.accounts.find((a) => a.id === info.other!.accountId)?.name
      : undefined;
    return info?.outbound
      ? `Transfer to ${other ?? "account"}`
      : `Transfer from ${other ?? "account"}`;
  }
  if (t.categoryTransferId) {
    const info = categoryTransferInfo(db, t);
    const other = info?.other
      ? db.categories.find((c) => c.id === info.other!.categoryId)?.name
      : undefined;
    return info?.outbound ? `Move to ${other ?? "category"}` : `Move from ${other ?? "category"}`;
  }
  return t.payeeName ?? t.memo ?? "Transaction";
}

/* ---------- category + group actions ---------- */

export function addCategoryGroup(name: string) {
  const id = uid();
  mutate((d) =>
    d.categoryGroups.push({ id, name, sortOrder: d.categoryGroups.length, hidden: false }),
  );
  return id;
}

export function renameCategoryGroup(id: string, name: string) {
  mutate((d) => {
    const g = d.categoryGroups.find((x) => x.id === id);
    if (g) g.name = name;
  });
}

export function deleteCategoryGroup(id: string) {
  mutate((d) => {
    const catIds = d.categories.filter((c) => c.groupId === id).map((c) => c.id);
    d.categories = d.categories.filter((c) => c.groupId !== id);
    d.categoryGroups = d.categoryGroups.filter((g) => g.id !== id);
    d.monthlyBudgets = d.monthlyBudgets.filter((b) => !catIds.includes(b.categoryId));
  });
}

export function addCategory(groupId: string, name: string, icon?: string) {
  const id = uid();
  mutate((d) =>
    d.categories.push({
      id,
      groupId,
      name,
      sortOrder: d.categories.filter((c) => c.groupId === groupId).length,
      hidden: false,
      icon,
    }),
  );
  return id;
}

export function setCategoryIcon(id: string, icon?: string) {
  mutate((d) => {
    const c = d.categories.find((x) => x.id === id);
    if (c) c.icon = icon;
  });
}

export function setCategoryUpi(id: string, upiVpa?: string) {
  mutate((d) => {
    const c = d.categories.find((x) => x.id === id);
    if (c) c.upiVpa = upiVpa;
  });
}

export function renameCategory(id: string, name: string) {
  mutate((d) => {
    const c = d.categories.find((x) => x.id === id);
    if (c) c.name = name;
  });
}

export function deleteCategory(id: string) {
  mutate((d) => {
    d.categories = d.categories.filter((c) => c.id !== id);
    d.monthlyBudgets = d.monthlyBudgets.filter((b) => b.categoryId !== id);
    d.transactions.forEach((t) => {
      if (t.categoryId === id) t.categoryId = undefined;
      if (t.splits) t.splits = t.splits.filter((s) => s.categoryId !== id);
    });
  });
}

function reorder<T extends { id: string; sortOrder: number }>(list: T[], id: string, dir: -1 | 1) {
  const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  const i = sorted.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  sorted.forEach((x, k) => (x.sortOrder = k));
}

export function moveCategory(id: string, dir: -1 | 1) {
  mutate((d) => {
    const c = d.categories.find((x) => x.id === id);
    if (!c) return;
    reorder(
      d.categories.filter((x) => x.groupId === c.groupId),
      id,
      dir,
    );
  });
}

export function moveCategoryGroup(id: string, dir: -1 | 1) {
  mutate((d) => reorder(d.categoryGroups, id, dir));
}

/* ---------- account actions ---------- */

export function addAccount(input: Omit<Account, "id" | "sortOrder" | "closed" | "onBudget">) {
  const id = uid();
  mutate((d) =>
    d.accounts.push({
      ...input,
      id,
      closed: false,
      onBudget: input.type === "account" || input.type === "credit",
      sortOrder: d.accounts.length,
    }),
  );
  return id;
}

export function updateAccount(id: string, patch: Partial<Account>) {
  mutate((d) => {
    const a = d.accounts.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
  });
}

export function deleteAccount(id: string) {
  mutate((d) => {
    d.accounts = d.accounts.filter((a) => a.id !== id);
    d.transactions = d.transactions.filter((t) => t.accountId !== id);
  });
}

export function moveAccount(id: string, dir: -1 | 1) {
  mutate((d) => {
    const a = d.accounts.find((x) => x.id === id);
    if (!a) return;
    reorder(
      d.accounts.filter((x) => x.type === a.type),
      id,
      dir,
    );
  });
}

/* ---------- misc ---------- */

export function addPayee(name: string, upiVpa?: string) {
  const id = uid();
  mutate((d) => d.payees.push({ id, name, upiVpa, sortOrder: d.payees.length }));
  return id;
}

export function addGoal(name: string, targetAmount: number, targetDate?: string) {
  const id = uid();
  mutate((d) => d.goals.push({ id, name, targetAmount, targetDate, saved: 0 }));
  return id;
}

export function addSplit(input: Omit<Split, "id" | "date"> & { date?: string }) {
  const id = uid();
  mutate((d) => d.splits.unshift({ ...input, date: input.date ?? todayISO(), id }));
  return id;
}

export function addLoan(input: Omit<Loan, "id">) {
  const id = uid();
  mutate((d) => d.loans.push({ ...input, id }));
  return id;
}

export function updateLoan(id: string, patch: Partial<Omit<Loan, "id">>) {
  mutate((d) => {
    const l = d.loans.find((x) => x.id === id);
    if (l) Object.assign(l, patch);
  });
}

export function deleteLoan(id: string) {
  mutate((d) => (d.loans = d.loans.filter((l) => l.id !== id)));
}

export function updateGoal(id: string, patch: Partial<Omit<Goal, "id">>) {
  mutate((d) => {
    const g = d.goals.find((x) => x.id === id);
    if (g) Object.assign(g, patch);
  });
}

export function deleteGoal(id: string) {
  mutate((d) => (d.goals = d.goals.filter((g) => g.id !== id)));
}

export function contributeToGoal(id: string, amount: number) {
  mutate((d) => {
    const g = d.goals.find((x) => x.id === id);
    if (g) g.saved = Math.max(0, g.saved + amount);
  });
}

export function updateSplit(id: string, patch: Partial<Omit<Split, "id">>) {
  mutate((d) => {
    const s = d.splits.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
  });
}

export function deleteSplit(id: string) {
  mutate((d) => {
    const s = d.splits.find((x) => x.id === id);
    d.splits = d.splits.filter((x) => x.id !== id);
    if (s?.sourceTxnId) {
      const dismissed = (d.settings["dismissedSplitTxns"] ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (!dismissed.includes(s.sourceTxnId)) {
        d.settings["dismissedSplitTxns"] = [...dismissed, s.sourceTxnId].join(",");
      }
    }
  });
}

export function toggleShareSettled(splitId: string, shareId: string) {
  mutate((d) => {
    const share = d.splits.find((s) => s.id === splitId)?.shares.find((x) => x.id === shareId);
    if (share) share.settled = !share.settled;
  });
}

export function setSetting(key: string, value: string) {
  mutate((d) => (d.settings[key] = value));
}

export function dismissedSplitTxnIds(): string[] {
  return (db?.settings?.["dismissedSplitTxns"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function dismissSplitTxn(txnId: string) {
  const ids = dismissedSplitTxnIds();
  if (!ids.includes(txnId)) setSetting("dismissedSplitTxns", [...ids, txnId].join(","));
}

export function replaceDB(next: DB) {
  db = next;
  persist();
  listeners.forEach((l) => l());
}

export function resetDB() {
  db = seed();
  persist();
  listeners.forEach((l) => l());
}

/** Resolves category/account/payee names (e.g. "Pocket Money: Shantanu") to the core person name (e.g. "Shantanu") */
export function resolvePersonName(name: string, db: DB): string {
  if (!name) return "";
  const trimName = name.trim();
  const lower = trimName.toLowerCase();

  const payeeMatch = db.payees.find((p) => p.name.trim().toLowerCase() === lower);
  if (payeeMatch) return payeeMatch.name;

  const accountMatch = db.accounts.find((a) => a.name.trim().toLowerCase() === lower);
  if (accountMatch) return accountMatch.name;

  for (const p of db.payees) {
    const pLower = p.name.trim().toLowerCase();
    const regex = new RegExp(`\\b${pLower}\\b`, "i");
    if (regex.test(lower)) {
      return p.name;
    }
  }

  for (const a of db.accounts) {
    const aLower = a.name.trim().toLowerCase();
    const regex = new RegExp(`\\b${aLower}\\b`, "i");
    if (regex.test(lower)) {
      return a.name;
    }
  }

  return trimName;
}

/** SmartPay minimal settlement algorithm: calculates net balances and simplifies group debts */
export function minimalSettlements(db: DB): {
  netBalances: { name: string; upi?: string; net: number }[];
  settlements: { fromName: string; fromUpi?: string; toName: string; toUpi?: string; amount: number }[];
} {
  const map = new Map<string, { name: string; upi?: string; net: number }>();

  function getPerson(rawName: string, upi?: string) {
    const canonicalName = resolvePersonName(rawName, db);
    const key = canonicalName.trim().toLowerCase();
    if (!map.has(key)) {
      const matchPayee = db.payees.find((p) => p.name.trim().toLowerCase() === key);
      const matchAccount = db.accounts.find((a) => a.name.trim().toLowerCase() === key);
      const personUpi = upi || matchPayee?.upiVpa || matchAccount?.upiVpa;
      map.set(key, { name: canonicalName, upi: personUpi, net: 0 });
    }
    return map.get(key)!;
  }

  // Calculate net balances for unsettled splits
  for (const s of db.splits) {
    const payerResolved = resolvePersonName(s.payerName, db);
    const payer = getPerson(payerResolved);
    for (const sh of s.shares) {
      if (sh.settled) continue;
      const beneficiaryResolved = resolvePersonName(sh.payeeName, db);
      if (payerResolved.toLowerCase() === beneficiaryResolved.toLowerCase()) continue;

      const beneficiary = getPerson(beneficiaryResolved, sh.upiVpa);
      payer.net += sh.share;
      beneficiary.net -= sh.share;
    }
  }

  const people = [...map.values()];
  const balances = people.map((p, i) => ({ i, net: p.net }));
  const EPS = 0.005;
  const settlements: { fromName: string; fromUpi?: string; toName: string; toUpi?: string; amount: number }[] = [];

  for (let iter = 0; iter < people.length * people.length; iter++) {
    let cred = balances.reduce((m, b) => (b.net > m.net ? b : m), { i: -1, net: -Infinity });
    let debt = balances.reduce((m, b) => (b.net < m.net ? b : m), { i: -1, net: Infinity });

    if (cred.net < EPS || debt.net > -EPS || cred.i === debt.i) break;

    const fromPerson = people[debt.i];
    const toPerson = people[cred.i];

    if (fromPerson.name.trim().toLowerCase() === toPerson.name.trim().toLowerCase()) {
      debt.net = 0;
      cred.net = 0;
      continue;
    }

    const amt = Math.min(cred.net, -debt.net);
    if (amt < EPS) break;

    settlements.push({
      fromName: fromPerson.name,
      fromUpi: fromPerson.upi,
      toName: toPerson.name,
      toUpi: toPerson.upi,
      amount: Math.round(amt * 100) / 100,
    });

    cred.net -= amt;
    debt.net += amt;
  }

  return {
    netBalances: people.filter((p) => Math.abs(p.net) > EPS),
    settlements,
  };
}
