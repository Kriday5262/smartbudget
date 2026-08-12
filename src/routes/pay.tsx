import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Plus, Trash2, QrCode, Copy, Check, Users, X, Link2 } from "lucide-react";
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
  "bg-primary/20 text-primary",
  "bg-secondary/50 text-secondary-foreground",
  "bg-success/20 text-success",
  "bg-warning/20 text-warning",
  "bg-destructive/20 text-destructive",
  "bg-accent/50 text-accent-foreground",
];

function Avatar({ name, index, className }: { name: string; index: number; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold",
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
    for (const s of sp.shares) {
      if (s.settled) continue;
      // Skip self-payments where payer is the payee
      if (sp.payerName && key(sp.payerName) === key(s.payeeName)) continue;

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

  if (!hydrated) return <div className="shimmer h-96 rounded-2xl" />;

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
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">SmartPay</h1>
          <p className="text-sm text-muted-foreground">{money(outstanding)} still to be settled</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyAllLinks}
            className="tap flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <Link2 className="h-4 w-4" /> Copy all links
          </button>
          <button
            onClick={() => {
              setPrefill(undefined);
              setCreating(true);
            }}
            className="tap flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Split
          </button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {[
          { k: "Total splits", v: totalAll },
          { k: "Settled", v: settledAll },
          { k: "Outstanding", v: outstanding },
        ].map((s) => (
          <div key={s.k} className="surface px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {s.k}
            </p>
            <p className="num mt-1 text-[15px] font-bold">{money(s.v)}</p>
          </div>
        ))}
      </div>

      {(() => {
        const smartPay = minimalSettlements(db);
        if (!smartPay.settlements.length && !smartPay.netBalances.length) return null;
        return (
          <div className="space-y-4">
            {smartPay.netBalances.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Net Balances · SmartPay Calculation
                  </p>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                    SmartPay Engine
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {smartPay.netBalances.map((b, i) => {
                    const isPositive = b.net > 0;
                    return (
                      <div key={i} className="surface px-3 py-2.5">
                        <p className="truncate text-xs font-bold">{b.name}</p>
                        <p
                          className={cn(
                            "num mt-0.5 text-xs font-bold",
                            isPositive ? "text-emerald-500" : "text-rose-500",
                          )}
                        >
                          {isPositive ? "+" : ""}
                          {money(b.net)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {isPositive ? "gets back" : "owes"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {smartPay.settlements.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Who Pays Whom · Minimal Transfers
                  </p>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    {smartPay.settlements.length} direct transfer{smartPay.settlements.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-2">
                  {smartPay.settlements.map((s, i) => {
                    const link = s.toUpi
                      ? upiLink(s.toUpi, s.toName, s.amount, `SmartPay: ${s.fromName} to ${s.toName}`)
                      : "";
                    return (
                      <div
                        key={i}
                        className="surface flex items-center justify-between gap-3 px-3.5 py-3"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                          <span className="font-bold text-foreground">{s.fromName}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-bold text-foreground">{s.toName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="num text-sm font-bold text-primary">
                            {money(s.amount)}
                          </span>
                          {link && (
                            <>
                              <button
                                aria-label={`Copy UPI link from ${s.fromName} to ${s.toName}`}
                                onClick={() => {
                                  navigator.clipboard?.writeText(link);
                                  toast.success("UPI pay link copied");
                                }}
                                className="tap rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                              >
                                <Copy className="h-4 w-4" />
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
                                className="tap flex items-center gap-1 rounded-xl bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20"
                              >
                                <QrCode className="h-3.5 w-3.5" /> Pay
                              </button>
                            </>
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

      {dues.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Outstanding · pay each person
            </p>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
              {pendingCount} with UPI
            </span>
          </div>
          <div className="space-y-2">
            {dues.map((d, i) => {
              const pidx = people.findIndex(
                (p) => p.name.trim().toLowerCase() === d.person.name.trim().toLowerCase(),
              );
              const link = d.person.upi
                ? upiLink(d.person.upi, d.person.name, d.amount, "SmartPay")
                : "";
              return (
                <div key={i} className="surface flex items-center gap-2.5 px-3 py-2.5">
                  <Avatar
                    name={d.person.name}
                    index={pidx >= 0 ? pidx : i}
                    className="h-9 w-9 text-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{d.person.name}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {d.person.upi ?? "no UPI"}
                    </p>
                  </div>
                  <span className="num shrink-0 text-xs font-bold">{money(d.amount)}</span>
                  {link && (
                    <>
                      <button
                        aria-label={`Copy pay link for ${d.person.name}`}
                        onClick={() => {
                          navigator.clipboard?.writeText(link);
                          toast.success("UPI link copied");
                        }}
                        className="tap rounded-lg p-1.5 text-muted-foreground"
                      >
                        <Copy className="h-4 w-4" />
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
                        className="tap rounded-lg p-1.5 text-primary"
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {splitTxns.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Recommended splits
          </p>
          <ul className="space-y-3">
            {splitTxns.map((t) => (
              <li key={t.id} className="relative">
                <button
                  onClick={() => {
                    const account = db.accounts.find((a) => a.id === t.accountId);
                    setPrefill({
                      total: Math.abs(t.amount),
                      note: t.payeeName || t.memo,
                      date: t.date,
                      sourceTxnId: t.id,
                      payerName: account?.name ?? "",
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
                  className="surface w-full px-4 py-3 pr-12 text-left hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {t.payeeName || t.memo || "Split transaction"}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {t.memo && t.payeeName ? `${t.memo} · ` : ""}
                        {prettyDate(t.date)}
                      </p>
                    </div>
                    <span className="num shrink-0 text-sm font-bold">
                      {money(Math.abs(t.amount))}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.splits?.map((s) => {
                      const cat = db.categories.find((c) => c.id === s.categoryId);
                      return (
                        <span
                          key={s.categoryId}
                          className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                        >
                          {cat?.name ?? "?"} · {money(Math.abs(s.amount))}
                        </span>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] font-bold text-primary">
                    Do you want to generate a UPI split? →
                  </p>
                </button>
                <button
                  onClick={() => dismissSplitTxn(t.id)}
                  aria-label={`Hide ${t.payeeName || t.memo || "split transaction"}`}
                  className="tap absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {db.splits.length === 0 && (
        <div className="surface flex flex-col items-center gap-3 px-4 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-primary">
            <Users className="h-5 w-5" />
          </span>
          <p className="max-w-xs text-sm text-muted-foreground">
            Split a dinner, a trip or the monthly groceries. Everyone gets their own UPI pay link
            and QR code.
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {db.splits.map((sp) => (
          <SplitCard key={sp.id} split={sp} />
        ))}
      </ul>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent
          className={cn(
            "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
            "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
            "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          )}
        >
          <DialogHeader>
            <DialogTitle>New split</DialogTitle>
          </DialogHeader>
          <SplitForm onDone={() => setCreating(false)} initial={prefill} />
        </DialogContent>
      </Dialog>

      <QrDialog qr={qr} onClose={() => setQr(undefined)} />
    </div>
  );
}

function SplitCard({ split }: { split: Split }) {
  const settled = split.shares.filter((s) => s.settled).reduce((a, s) => a + s.share, 0);
  const pct = split.total > 0 ? Math.min(1, settled / split.total) : 0;

  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="surface overflow-hidden">
      <div
        className="px-4 py-3"
        style={{
          backgroundImage: `linear-gradient(90deg, color-mix(in oklab, var(--primary) 12%, transparent) ${pct * 100}%, transparent ${pct * 100}%)`,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{split.note || "Split"}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {split.payerName} paid · {prettyDate(split.date)}
            </p>
          </div>
          <span className="num shrink-0 text-sm font-bold">{money(split.total)}</span>
          <button
            aria-label="Delete split"
            onClick={() => setConfirmDelete(true)}
            className="tap rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
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

      <ul className="divide-y divide-border border-t border-border">
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
    <li className="flex items-center gap-2 px-4 py-2.5">
      <Avatar name={share.payeeName} index={index} className="h-6 w-6 text-[10px]" />
      <button
        onClick={() => toggleShareSettled(splitId, share.id)}
        aria-label={share.settled ? "Mark unsettled" : "Mark settled"}
        className={cn(
          "tap flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
          share.settled
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-transparent",
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-xs font-semibold",
          share.settled && "text-muted-foreground line-through",
        )}
      >
        {share.payeeName}
        {share.upiVpa && (
          <span className="ml-1.5 font-normal text-muted-foreground">{share.upiVpa}</span>
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
        )}>
        <DialogTitle className="sr-only">
          {qr ? `Payment request ${qr.from} → ${qr.to}` : "Payment request"}
        </DialogTitle>
        <div className="flex flex-col items-center gap-3 text-center">
          <div>
            <p className="text-sm font-bold">SmartPay</p>
            <p className="text-[11px] text-muted-foreground">Payment Request</p>
          </div>

          <p className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold">
            <span>{qr?.from}</span>
            <span className="text-muted-foreground">pays</span>
            <span className="text-muted-foreground">→</span>
            <span>{qr?.to}</span>
          </p>

          <p className="num text-2xl font-bold">{qr ? money(qr.amount) : "—"}</p>

          <div className="relative">
            {src ? (
              <img
                src={src}
                alt="UPI payment QR code"
                className="h-56 w-56 rounded-2xl border border-border bg-white p-2"
              />
            ) : (
              <div className="shimmer h-56 w-56 rounded-2xl" />
            )}
            <img
              src="/favicon.svg"
              alt="SmartPay logo"
              className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white shadow"
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Scan with GPay · PhonePe · Paytm · any UPI app
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
  const [payerName, setPayerName] = useState(initial?.payerName ?? "");
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Total (₹)</Label>
          <Input
            className="num"
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Paid by</Label>
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
          <Label className="text-xs font-medium text-muted-foreground">What for</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dinner" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-border p-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            People
          </p>
          <button onClick={splitEqually} className="tap text-xs font-bold text-primary">
            Split equally
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
                  className="num w-24"
                  inputMode="decimal"
                  placeholder="0"
                  value={p.amount}
                  onChange={(e) => setPerson(i, { amount: e.target.value })}
                />
                <button
                  aria-label="Remove person"
                  onClick={() => setPeople((ps) => ps.filter((_, k) => k !== i))}
                  disabled={people.length <= 2}
                  className="tap rounded-lg p-2 text-muted-foreground disabled:opacity-30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="pl-1 text-[11px] text-muted-foreground">{p.upi ?? "No UPI id saved"}</p>
            </div>
          );
        })}

        <div className="flex items-center justify-between pt-1">
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
              "num text-[11px] font-bold",
              Math.abs(value - sum) < 0.5 ? "text-primary" : "text-muted-foreground",
            )}
          >
            {Math.abs(value - sum) < 0.5 ? "Balanced" : `${money(value - sum)} left`}
          </span>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button className="h-11 w-full rounded-xl font-bold" onClick={save}>
        Create split
      </Button>
    </div>
  );
}
