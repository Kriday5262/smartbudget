import { useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Wallet,
  PiggyBank,
  BarChart3,
  Settings,
  Split,
  Target,
  CreditCard,
  ArrowLeftRight,
  History,
  Plus,
  X,
  Undo2,
  Redo2,
} from "lucide-react";
import { useUI, uiActions, type AddTab } from "@/lib/ui-store";
import { useUndo, undo, redo } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Full navigation set — used by the desktop sidebar and the "More" sheet. */
export const NAV_ITEMS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/budget", label: "Budget", icon: PiggyBank },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/history", label: "History", icon: History },
  { to: "/pay", label: "Pay", icon: Split },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/** The four thumb-reachable tabs, split around the centre add button. */
const LEFT_TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/budget", label: "Budget", icon: PiggyBank },
] as const;

const RIGHT_TABS = [
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/history", label: "History", icon: History },
] as const;

const MORE_ITEMS = NAV_ITEMS.filter(
  (i) => !["/", "/budget", "/accounts", "/history"].includes(i.to),
);

const NEW_ITEMS: { tab: AddTab; label: string; icon: typeof Home }[] = [
  { tab: "transaction", label: "Transaction", icon: ArrowLeftRight },
  { tab: "account", label: "Account", icon: Wallet },
  { tab: "card", label: "Card", icon: CreditCard },
  { tab: "goal", label: "Goal", icon: Target },
];

function Tab({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className="tap flex w-16 flex-col items-center gap-1 py-1"
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className={cn("h-[22px] w-[22px]", active ? "text-primary" : "text-muted-foreground")}
        strokeWidth={active ? 2.4 : 1.9}
      />
      <span
        className={cn(
          "text-[10px] font-bold tracking-tight",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

export function BottomTabBar() {
  const { fabOpen } = useUI();
  const { canUndo, canRedo } = useUndo();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const swipe = useRef<{ y: number; fired: boolean }>({ y: 0, fired: false });
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);

  const progress = Math.min(drag / 40, 1);

  return (
    <div className="md:hidden">
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-border bg-card/95 px-3 pt-2 backdrop-blur-xl">
        {LEFT_TABS.map((t) => (
          <Tab key={t.to} {...t} active={pathname === t.to} />
        ))}

        <div className="relative flex flex-col items-center">
          {/* swipe hint: grabber lifts + a "More" label fades in as you drag */}
          <span
            aria-hidden
            className="absolute -top-11 h-1 rounded-full bg-border"
            style={{
              width: `${24 + progress * 14}px`,
              opacity: 0.5 + progress * 0.5,
              transform: `translateY(${-progress * 6}px)`,
              transition: dragging ? "none" : "all 0.3s cubic-bezier(0.22,1,0.36,1)",
              backgroundColor: progress > 0.6 ? "var(--primary)" : undefined,
            }}
            title="Swipe up for more"
          />
          <span
            aria-hidden
            className="absolute -top-[4.6rem] rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold text-background"
            style={{
              opacity: progress,
              transform: `translateY(${(1 - progress) * 10}px) scale(${0.85 + progress * 0.15})`,
              transition: dragging ? "none" : "all 0.25s cubic-bezier(0.22,1,0.36,1)",
              pointerEvents: "none",
            }}
          >
            More
          </span>
          <button
            type="button"
            onClick={() => uiActions.openAdd("transaction")}
            onTouchStart={(e) => {
              swipe.current = { y: e.touches[0].clientY, fired: false };
              setDragging(true);
              holdTimer.current = setTimeout(() => {
                swipe.current.fired = true;
                setDragging(false);
                setDrag(0);
                uiActions.openFab();
              }, 500);
            }}
            onTouchMove={(e) => {
              if (swipe.current.fired) return;
              const delta = swipe.current.y - e.touches[0].clientY;
              setDrag(Math.max(0, Math.min(delta, 56)));
              if (delta > 40) {
                swipe.current.fired = true;
                if (holdTimer.current) clearTimeout(holdTimer.current);
                setDragging(false);
                setDrag(0);
                uiActions.openFab();
              }
            }}
            onTouchEnd={(e) => {
              if (holdTimer.current) clearTimeout(holdTimer.current);
              setDragging(false);
              setDrag(0);
              if (swipe.current.fired) e.preventDefault();
            }}
            aria-label="Add transaction — swipe up for more options"
            className="tap -mt-8 flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-background gradient-primary text-primary-foreground shadow-[var(--shadow-3d)]"
            style={{
              transform: `translateY(${-drag * 0.45}px) scale(${1 + progress * 0.08})`,
              transition: dragging ? "none" : "transform 0.35s cubic-bezier(0.34,1.4,0.64,1)",
            }}
          >
            <Plus
              className="h-7 w-7"
              strokeWidth={2.6}
              style={{
                transform: `rotate(${progress * 90}deg)`,
                transition: dragging ? "none" : "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
              }}
            />
          </button>
        </div>

        {RIGHT_TABS.map((t) => (
          <Tab key={t.to} {...t} active={pathname.startsWith(t.to)} />
        ))}
      </nav>

      {fabOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
            onClick={uiActions.closeFab}
          />
          <div
            className="animate-rise pb-safe fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[32px] border-t border-border bg-card p-5 shadow-[var(--shadow-lift)]"
            onTouchStart={(e) => {
              const startY = e.touches[0].clientY;
              const onEnd = (ev: TouchEvent) => {
                if (ev.changedTouches[0].clientY - startY > 70) uiActions.closeFab();
                window.removeEventListener("touchend", onEnd);
              };
              window.addEventListener("touchend", onEnd);
            }}
          >
            <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-border" />

            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">More</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className="tap rounded-full p-2 hover:bg-muted disabled:opacity-30"
                  aria-label="Undo"
                >
                  <Undo2 className="h-[18px] w-[18px]" />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  className="tap rounded-full p-2 hover:bg-muted disabled:opacity-30"
                  aria-label="Redo"
                >
                  <Redo2 className="h-[18px] w-[18px]" />
                </button>
                <button
                  onClick={uiActions.closeFab}
                  className="tap rounded-full p-2 hover:bg-muted"
                  aria-label="Close menu"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {MORE_ITEMS.map((item) => {
                const active = pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={uiActions.closeFab}
                    className={cn(
                      "tap flex items-center gap-3 rounded-2xl border p-3.5 text-sm font-semibold",
                      active
                        ? "border-primary/30 bg-primary/8 text-primary"
                        : "border-border text-foreground",
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Quick add
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {NEW_ITEMS.map((item) => (
                <button
                  key={item.tab}
                  onClick={() => uiActions.openAdd(item.tab)}
                  className="tap flex flex-col items-center gap-2 rounded-2xl bg-muted p-3 text-[11px] font-semibold"
                >
                  <item.icon className="h-5 w-5 text-primary" strokeWidth={2} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
