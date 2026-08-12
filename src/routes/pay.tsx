import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Plus,
  Trash2,
  QrCode,
  Copy,
  Check,
  Users,
  X,
  Link2,
  ArrowRight,
  Sparkles,
  Zap,
  CheckCircle2,
  Clock,
  ChevronRight,
  CreditCard,
  Percent,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import { PersonPicker, personOptions, UpiPicker } from "@/components/pickers";
import {
  useDB,
  addSplit,
  deleteSplit,
  toggleShareSettled,
  dismissSplitTxn,
  minimalSettlements,
  resolvePersonName,
  uid,
  type DB,
  type Split,
  type SplitShare,
} from "@/lib/store";
import { money, prettyDate, todayISO } from "@/lib/format";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pay")({
  head: () => ({
    meta: [
      { title: "SmartPay — UPI bill splitting | SmartBudget" },
      {
        name: "description",
        content:
          "Split bills with family and friends, track who has settled, and share UPI pay links and QR codes instantly.",
      },
      { property: "og:title", content: "SmartPay — UPI bill splitting | SmartBudget" },
      {
        property: "og:description",
        content: "Split bills and settle instantly with UPI links and QR codes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayPage,
});

function upiLink(vpa: string, name: string, amount: number, note?: string) {
  const p = new URLSearchParams({
    pa: vpa,
    pn: name,
    am: amount.toFixed(2),
    cu: "INR",
  });
  if (note) p.set("tn", note);
  return `upi://pay?${p.toString()}`;
}

type Person = { name: string; upi?: string };

const AV_COLORS = [
  "bg-primary/15 text-primary border-primary/20",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20",
  "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
];

function Avatar({ name, index, className }: { name: string; index: number; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border font-bold shadow-xs transition-transform hover:scale-105",
        AV_COLORS[index % AV_COLORS.length],
        className,
      )}
    >
      {(name?.trim().charAt(0) ?? "?").toUpperCase()}
    </span>
  );
}

/** Everyone who appears in a split or is a saved payee. */
function participants(db: DB): Person[] {
  const map = new Map<string, Person>();
  const key = (n: string) => n.trim().toLowerCase();
  for (const p of db.payees) {
    if (!map.has(key(p.name))) map.set(key(p.name), { name: p.name, upi: p.upiVpa });
  }
  for (const sp of db.splits) {
    for (const s of sp.shares) {
      if (!map.has(key(s.payeeName)))
        map.set(key(s.payeeName), { name: s.payeeName, upi: s.upiVpa });
    }
    if (!map.has(key(sp.payerName))) map.set(key(sp.payerName), { name: sp.payerName });
  }
  return [...map.values()];
}

/** Total outstanding owed to each person across every split (one row per person). */
function perPersonDues(db: DB): { person: Person; amount: number; payers: string[] }[] {
  const map = new Map<string, { person: Person; amount: number; payers: Set<string> }>();
  const key = (n: string) => n.trim().toLowerCase();
  for (const sp of db.splits) {
    const payerResolved = resolvePersonName(sp.payerName, db);
    for (const s of sp.shares) {
      if (s.settled) continue;
      const payeeResolved = resolvePersonName(s.payeeName, db);

      // Skip self-payments where payer is the payee
      if (payerResolved && key(payerResolved) === key(payeeResolved)) continue;

      const k = key(s.payeeName);
      const cur = map.get(k);
      if (cur) {
        cur.amount += s.share;
        if (!cur.person.upi && s.upiVpa) cur.person.upi = s.upiVpa;
      } else {
        map.set(k, {
          person: { name: s.payeeName, upi: s.upiVpa },
          amount: s.share,
          payers: new Set(),
        });
      }
      if (sp.payerName) map.get(k)!.payers.add(sp.payerName);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.amount - a.amount)
    .map(({ person, amount, payers }) => ({ person, amount, payers: [...payers] }));
}

function PayPage() {
  const db = useDB();
  const hydrated = useHydrated();
  const [creating, setCreating] = useState(false);
  const [qr, setQr] = useState<
    { link: string; from: string; to: string; amount: number } | undefined
  >();
  const [prefill, setPrefill] = useState<{
    total: number;
    note?: string;
    date?: string;
    sourceTxnId?: string;
    payerName?: string;
    people?: { key: string; name: string; upi?: string; amount: string }[];
  }>();

  const people = useMemo(() => participants(db), [db]);
  const dues = useMemo(() => perPersonDues(db), [db]);

  if (!hydrated) return <div className="shimmer h-96 rounded-3xl" />;

  const outstanding = db.splits.reduce(
    (s, sp) => s + sp.shares.filter((x) => !x.settled).reduce((a, x) => a + x.share, 0),
    0,
  );

  const totalAll = db.splits.reduce((s, sp) => s + sp.total, 0);
  const settledAll = db.splits.reduce(
    (s, sp) => s + sp.shares.filter((x) => x.settled).reduce((a, x) => a + x.share, 0),
    0,
  );

  const pendingCount = dues.filter((d) => d.person.upi).length;

  function copyAllLinks() {
    const withUpi = dues.filter((d) => d.person.upi);
    if (!withUpi.length) return toast.error("No outstanding UPI links to copy");
    const links = withUpi
      .map((d) => upiLink(d.person.upi!, d.person.name, d.amount, "SmartPay"))
      .join("\n");
    navigator.clipboard?.writeText(links);
    toast.success(`${withUpi.length} UPI link${withUpi.length > 1 ? "s" : ""} copied`);
  }

  const dismissed = new Set(
    (db.settings?.["dismissedSplitTxns"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const splitTxns = db.transactions
    .filter((t) => t.splits?.length)
    .filter((t) => !db.splits.some((s) => s.sourceTxnId === t.id))
    .filter((t) => !dismissed.has(t.id))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <header className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
              <Zap className="h-3 w-3" /> SmartPay Engine
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">SmartPay</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              <span className="num font-bold text-foreground">{money(outstanding)}</span> remaining to settle
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyAllLinks}
              className="tap flex items-center gap-1.5 rounded-2xl border border-border/80 bg-card/80 px-3.5 py-2.5 text-xs font-bold text-foreground shadow-xs hover:border-primary/40 hover:bg-card"
            >
              <Link2 className="h-4 w-4 text-primary" /> Copy all links
            </button>
            <button
              onClick={() => {
                setPrefill(undefined);
                setCreating(true);
              }}
              className="tap flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> New Split
            </button>
          </div>
        </div>

        {/* Dynamic Metric Cards */}
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl border border-border/60 bg-background/60 p-3 backdrop-blur-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Splits</p>
            <p className="num mt-1 text-sm font-bold sm:text-base">{money(totalAll)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 backdrop-blur-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Settled</p>
            <p className="num mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400 sm:text-base">{money(settledAll)}</p>
          </div>
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-3 backdrop-blur-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Outstanding</p>
            <p className="num mt-1 text-sm font-bold text-rose-600 dark:text-rose-400 sm:text-base">{money(outstanding)}</p>
          </div>
        </div>
      </header>

      {/* SmartPay Algorithm & Minimal Transfers */}
      {(() => {
        const smartPay = minimalSettlements(db);
        const validSettlements = smartPay.settlements.filter(
          (s) =>
            s.fromName.trim().toLowerCase() !== s.toName.trim().toLowerCase() &&
            resolvePersonName(s.fromName, db).toLowerCase() !==
              resolvePersonName(s.toName, db).toLowerCase(),
        );
        if (!validSettlements.length && !smartPay.netBalances.length) return null;
        return (
          <div className="space-y-4">
            {/* Net Balances Section */}
            {smartPay.netBalances.length > 0 && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Net Balances · SmartPay Calculation
                  </p>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-primary">
                    <Sparkles className="h-3 w-3" /> Auto-balanced
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {smartPay.netBalances.map((b, i) => {
                    const isPositive = b.net > 0;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "relative overflow-hidden rounded-2xl border p-3 shadow-xs transition-all hover:shadow-sm",
                          isPositive
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-rose-500/30 bg-rose-500/5",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="truncate text-xs font-bold text-foreground">{b.name}</p>
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              isPositive ? "bg-emerald-500 animate-pulse" : "bg-rose-500",
                            )}
                          />
                        </div>
                        <p
                          className={cn(
                            "num mt-1 text-sm font-black",
                            isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {isPositive ? "+" : ""}
                          {money(b.net)}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
                          {isPositive ? "gets back" : "owes"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Direct Minimal Transfers Section */}
            {validSettlements.length > 0 && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Who Pays Whom · Minimal Transfers
                  </p>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    {validSettlements.length} direct transfer{validSettlements.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-2">
                  {validSettlements.map((s, i) => {
                    const link = s.toUpi
                      ? upiLink(s.toUpi, s.toName, s.amount, `SmartPay: ${s.fromName} to ${s.toName}`)
                      : "";
                    return (
                      <div
                        key={i}
                        className="group flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-xs transition-all hover:border-primary/40 hover:shadow-sm"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                          <span className="font-bold text-foreground">{s.fromName}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                          <span className="font-bold text-foreground">{s.toName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="num text-sm font-black text-primary">
                            {money(s.amount)}
                          </span>
                          {link && (
                            <div className="flex items-center gap-1">
                              <button
                                aria-label={`Copy UPI link from ${s.fromName} to ${s.toName}`}
                                onClick={() => {
                                  navigator.clipboard?.writeText(link);
                                  toast.success("UPI pay link copied");
                                }}
                                className="tap rounded-xl border border-border/60 bg-muted/40 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                aria-label={`Show QR code from ${s.fromName} to ${s.toName}`}
                                onClick={() =>
                                  setQr({
                                    link,
                                    from: s.fromName,
                                    to: s.toName,
                                    amount: s.amount,
                                  })
                                }
                                className="tap flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs transition-transform hover:scale-[1.02]"
                              >
                                <QrCode className="h-3.5 w-3.5" /> Pay
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        );
      })()}

      {/* Outstanding dues section */}
      {dues.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Outstanding · Pay Each Person
            </p>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
              {pendingCount} with UPI
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {dues.map((d, i) => {
              const pidx = people.findIndex(
                (p) => p.name.trim().toLowerCase() === d.person.name.trim().toLowerCase(),
              );
              const link = d.person.upi
                ? upiLink(d.person.upi, d.person.name, d.amount, "SmartPay")
                : "";
              return (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                  <Avatar
                    name={d.person.name}
                    index={pidx >= 0 ? pidx : i}
                    className="h-10 w-10 text-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{d.person.name}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {d.person.upi ?? "no UPI id"}
                    </p>
                  </div>
                  <span className="num shrink-0 text-xs font-bold">{money(d.amount)}</span>
                  {link && (
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`Copy pay link for ${d.person.name}`}
                        onClick={() => {
                          navigator.clipboard?.writeText(link);
                          toast.success("UPI link copied");
                        }}
                        className="tap rounded-xl border border-border/60 bg-muted/40 p-2 text-muted-foreground hover:bg-muted"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        aria-label={`Show QR for ${d.person.name}`}
                        onClick={() =>
                          setQr({
                            link,
                            from: d.payers.length ? d.payers.join(" & ") : "Someone",
                            to: d.person.name,
                            amount: d.amount,
                          })
                        }
                        className="tap rounded-xl bg-primary/10 p-2 text-primary hover:bg-primary/20"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recommended Splits */}
      {splitTxns.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Recommended Splits
          </p>
          <ul className="space-y-3">
            {splitTxns.map((t) => (
              <li key={t.id} className="relative">
                <button
                  onClick={() => {
                    const account = db.accounts.find((a) => a.id === t.accountId);
                    const defaultPayer = account?.name ?? db.accounts.find((a) => a.upiVpa)?.name ?? db.accounts[0]?.name ?? "";
                    setPrefill({
                      total: Math.abs(t.amount),
                      note: t.payeeName || t.memo,
                      date: t.date,
                      sourceTxnId: t.id,
                      payerName: defaultPayer,
                      people: (t.splits ?? []).map((s) => {
                        const cat = db.categories.find((c) => c.id === s.categoryId);
                        return {
                          key: cat ? `category:${cat.id}` : `category:${s.categoryId}`,
                          name: cat?.name ?? "Other",
                          upi: cat?.upiVpa,
                          amount: String(Math.abs(s.amount)),
                        };
                      }),
                    });
                    setCreating(true);
                  }}
                  className="w-full rounded-2xl border border-primary/30 bg-primary/5 p-4 pr-12 text-left shadow-xs transition-all hover:border-primary/50 hover:bg-primary/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">
                        {t.payeeName || t.memo || "Split transaction"}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {t.memo && t.payeeName ? `${t.memo} · ` : ""}
                        {prettyDate(t.date)}
                      </p>
                    </div>
                    <span className="num shrink-0 text-sm font-black text-primary">
                      {money(Math.abs(t.amount))}
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {t.splits?.map((s) => {
                      const cat = db.categories.find((c) => c.id === s.categoryId);
                      return (
                        <span
                          key={s.categoryId}
                          className="rounded-full border border-primary/20 bg-background/80 px-2.5 py-0.5 text-[11px] font-semibold text-foreground"
                        >
                          {cat?.name ?? "?"} · {money(Math.abs(s.amount))}
                        </span>
                      );
                    })}
                  </div>
                  <p className="mt-2.5 flex items-center gap-1 text-[11px] font-bold text-primary">
                    Generate UPI split <ChevronRight className="h-3.5 w-3.5" />
                  </p>
                </button>
                <button
                  onClick={() => dismissSplitTxn(t.id)}
                  aria-label={`Hide ${t.payeeName || t.memo || "split transaction"}`}
                  className="tap absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty State */}
      {db.splits.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border/80 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-6 w-6" />
          </span>
          <div className="max-w-xs space-y-1">
            <p className="text-sm font-bold">No active splits</p>
            <p className="text-xs text-muted-foreground">
              Split a dinner, trip or monthly groceries. Everyone gets dedicated UPI links &amp; QR codes.
            </p>
          </div>
        </div>
      )}

      {/* Splits List */}
      <ul className="space-y-3">
        {db.splits.map((sp) => (
          <SplitCard key={sp.id} split={sp} />
        ))}
      </ul>

      {/* New Split Dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent
          className={cn(
            "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
            "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
            "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          )}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">New Split</DialogTitle>
          </DialogHeader>
          <SplitForm onDone={() => setCreating(false)} initial={prefill} />
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <QrDialog qr={qr} onClose={() => setQr(undefined)} />
    </div>
  );
}

function SplitCard({ split }: { split: Split }) {
  const settled = split.shares.filter((s) => s.settled).reduce((a, s) => a + s.share, 0);
  const pct = split.total > 0 ? Math.min(1, settled / split.total) : 0;

  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-xs">
      <div
        className="px-4 py-3.5"
        style={{
          backgroundImage: `linear-gradient(90deg, color-mix(in oklab, var(--primary) 15%, transparent) ${pct * 100}%, transparent ${pct * 100}%)`,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-bold text-foreground">{split.note || "Split"}</p>
              {pct === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Fully Settled
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {split.payerName} paid · {prettyDate(split.date)}
            </p>
          </div>
          <span className="num shrink-0 text-sm font-black">{money(split.total)}</span>
          <button
            aria-label="Delete split"
            onClick={() => setConfirmDelete(true)}
            className="tap rounded-xl p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent
          className={cn(
            "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
            "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
            "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          )}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete split?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this split for {money(split.total)}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteSplit(split.id);
                toast.success("Split deleted");
              }}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ul className="divide-y divide-border border-t border-border/60">
        {split.shares.map((s, i) => (
          <ShareRow key={s.id} splitId={split.id} share={s} index={i} />
        ))}
      </ul>
    </li>
  );
}

function ShareRow({
  splitId,
  share,
  index,
}: {
  splitId: string;
  share: SplitShare;
  index: number;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar name={share.payeeName} index={index} className="h-7 w-7 text-xs" />
      <button
        onClick={() => toggleShareSettled(splitId, share.id)}
        aria-label={share.settled ? "Mark unsettled" : "Mark settled"}
        className={cn(
          "tap flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all",
          share.settled
            ? "border-primary bg-primary text-primary-foreground shadow-xs"
            : "border-border/80 text-transparent hover:border-primary/60",
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-xs font-semibold",
          share.settled && "text-muted-foreground line-through opacity-70",
        )}
      >
        {share.payeeName}
        {share.upiVpa && (
          <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">{share.upiVpa}</span>
        )}
      </span>
      <span className="num shrink-0 text-xs font-bold">{money(share.share)}</span>
    </li>
  );
}

function QrDialog({
  qr,
  onClose,
}: {
  qr?: { link: string; from: string; to: string; amount: number };
  onClose: () => void;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!qr) return setSrc("");
    QRCode.toDataURL(qr.link, { width: 640, margin: 2 })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [qr]);

  return (
    <Dialog open={!!qr} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
          "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
          "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        )}
      >
        <DialogTitle className="sr-only">
          {qr ? `Payment request ${qr.from} → ${qr.to}` : "Payment request"}
        </DialogTitle>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-0.5 text-[11px] font-bold text-primary">
              <Zap className="h-3 w-3" /> SmartPay QR
            </span>
            <p className="text-base font-bold">UPI Payment Request</p>
          </div>

          <p className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-4 py-1.5 text-xs font-bold">
            <span>{qr?.from}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-primary">{qr?.to}</span>
          </p>

          <p className="num text-3xl font-black text-foreground">{qr ? money(qr.amount) : "—"}</p>

          <div className="relative">
            {src ? (
              <img
                src={src}
                alt="UPI payment QR code"
                className="h-60 w-60 rounded-3xl border border-border bg-white p-3 shadow-md"
              />
            ) : (
              <div className="shimmer h-60 w-60 rounded-3xl" />
            )}
            <img
              src="/favicon.svg"
              alt="SmartPay logo"
              className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white shadow-md"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Scan with GPay · PhonePe · Paytm · BHIM · any UPI app
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SplitForm({
  onDone,
  initial,
}: {
  onDone: () => void;
  initial?: {
    total: number;
    note?: string;
    date?: string;
    sourceTxnId?: string;
    payerName?: string;
    people?: { key: string; name: string; upi?: string; amount: string }[];
  };
}) {
  const db = useDB();
  const [total, setTotal] = useState(initial?.total ? String(initial.total) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const defaultPayer = initial?.payerName || db.accounts.find((a) => a.upiVpa)?.name || db.accounts[0]?.name || "";
  const [payerName, setPayerName] = useState(defaultPayer);
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [people, setPeople] = useState<
    { key: string; name: string; upi?: string; amount: string }[]
  >(
    initial?.people?.length
      ? [
          ...initial.people,
          ...Array(Math.max(0, 2 - initial.people.length)).fill({
            key: "",
            name: "",
            upi: undefined,
            amount: "",
          }),
        ]
      : [
          { key: "", name: "", upi: undefined, amount: "" },
          { key: "", name: "", upi: undefined, amount: "" },
        ],
  );
  const [error, setError] = useState("");

  const value = Number(total) || 0;
  const sum = useMemo(() => people.reduce((s, p) => s + (Number(p.amount) || 0), 0), [people]);

  const payerOptions = useMemo(() => personOptions(db, "accountsWithUpi"), [db]);
  const payerKey = useMemo(() => {
    if (!payerName) return "";
    const hit = payerOptions.find(
      (o) => o.name.trim().toLowerCase() === payerName.trim().toLowerCase(),
    );
    return hit?.key ?? "";
  }, [payerName, payerOptions]);

  const setPerson = (
    i: number,
    patch: Partial<{ key: string; name: string; upi?: string; amount: string }>,
  ) => setPeople((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  function splitEqually() {
    const n = people.length;
    if (!value || !n) return;
    const each = Math.floor((value / n) * 100) / 100;
    setPeople((ps) =>
      ps.map((p, i) => ({
        ...p,
        amount: String(i === n - 1 ? Math.round((value - each * (n - 1)) * 100) / 100 : each),
      })),
    );
  }

  function save() {
    const filled = people.filter((p) => p.key && Number(p.amount) > 0);
    if (!value) return setError("Enter the bill total");
    if (filled.length < 2) return setError("Pick at least two payees with amounts");
    if (Math.abs(sum - value) > 0.5) return setError(`Shares add up to ${money(sum)}`);
    addSplit({
      total: value,
      payerName: payerName.trim() || "You",
      note: note.trim() || undefined,
      date,
      sourceTxnId: initial?.sourceTxnId,
      shares: filled.map((p) => ({
        id: uid(),
        payeeName: p.name,
        upiVpa: p.upi || undefined,
        share: Number(p.amount),
        settled: false,
      })),
    });
    toast.success("Split created");
    onDone();
  }

  return (
    <div className="space-y-4 pt-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Total (₹)</Label>
          <Input
            className="num h-11 rounded-xl text-base font-bold"
            inputMode="decimal"
            placeholder="0.00"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Paid by</Label>
          <PersonPicker
            value={payerKey}
            placeholder="Who paid?"
            filter="accountsWithUpi"
            onChange={(sel) => setPayerName(sel.name)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Note / Purpose</Label>
          <Input
            className="h-11 rounded-xl text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Dinner, Trip, Groceries"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Date</Label>
          <Input className="h-11 rounded-xl text-sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-3.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            People &amp; Shares
          </p>
          <button
            onClick={splitEqually}
            className="tap flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            <Percent className="h-3 w-3" /> Split equally
          </button>
        </div>

        {db.payees.length === 0 && db.accounts.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No payees or accounts yet — add them under{" "}
            <Link to="/settings" className="font-bold text-primary">
              Settings › Payees &amp; UPI
            </Link>
            .
          </p>
        )}

        {people.map((p, i) => {
          const taken = new Set(
            people
              .filter((_, k) => k !== i)
              .map((x) => x.key)
              .filter(Boolean),
          );
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <PersonPicker
                    value={p.key}
                    onChange={(sel) => setPerson(i, { key: sel.key, name: sel.name, upi: sel.upi })}
                    excludeKeys={[...taken]}
                  />
                </div>
                <Input
                  className="num h-10 w-24 rounded-xl text-sm font-bold"
                  inputMode="decimal"
                  placeholder="0"
                  value={p.amount}
                  onChange={(e) => setPerson(i, { amount: e.target.value })}
                />
                <button
                  aria-label="Remove person"
                  onClick={() => setPeople((ps) => ps.filter((_, k) => k !== i))}
                  disabled={people.length <= 2}
                  className="tap rounded-xl p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="pl-1 font-mono text-[10px] text-muted-foreground">{p.upi ?? "No UPI id saved"}</p>
            </div>
          );
        })}

        <div className="flex items-center justify-between border-t border-border/60 pt-2">
          <button
            onClick={() =>
              setPeople((ps) => [...ps, { key: "", name: "", upi: undefined, amount: "" }])
            }
            className="tap flex items-center gap-1 text-xs font-bold text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Add person
          </button>
          <span
            className={cn(
              "num text-xs font-bold",
              Math.abs(value - sum) < 0.5 ? "text-emerald-500" : "text-amber-500",
            )}
          >
            {Math.abs(value - sum) < 0.5 ? "✓ Balanced" : `${money(value - sum)} unallocated`}
          </span>
        </div>
      </div>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}

      <Button className="h-12 w-full rounded-2xl text-sm font-bold shadow-md" onClick={save}>
        Create Split
      </Button>
    </div>
  );
}
