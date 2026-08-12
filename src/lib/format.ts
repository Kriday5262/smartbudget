const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,23,456.78 */
export function money(amount: number): string {
  return inr.format(amount);
}

export function signedMoney(amount: number): string {
  return `${amount > 0 ? "+" : ""}${money(amount)}`;
}

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Date to stamp a category-to-category transfer so it lands inside the viewed
 * month: today when viewing the current month, else the month's start/end.
 */
export function categoryTransferDate(month: string): string {
  const today = todayISO();
  if (today.slice(0, 7) === month) return today;
  const [y, m] = month.split("-").map(Number);
  if (today < `${month}-01`) return `${month}-01`;
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

export function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
