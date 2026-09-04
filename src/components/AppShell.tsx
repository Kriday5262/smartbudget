import { useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Plus, Undo2, Redo2, Lock } from "lucide-react";
import { NAV_ITEMS, BottomTabBar } from "./BottomTabBar";
import { AddPopup } from "./AddPopup";
import { EditAccountDialog } from "./EditAccountDialog";
import { EditTransactionDialog } from "./EditTransactionDialog";
import { JoinHomeInvitePopup } from "./JoinHomeInvitePopup";
import { PullToRefresh } from "./PullToRefresh";

import { Toaster } from "@/components/ui/sonner";
import { useDB, accountBalance, initDB, refreshDB, useUndo, undo, redo } from "@/lib/store";
import { money } from "@/lib/format";
import { uiActions } from "@/lib/ui-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { LockScreen } from "./LockScreen";
import { hydrateLock, hydrateUsers, useUnlocked, lock } from "@/lib/lock";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { todayISO } from "@/lib/format";
import { KeyboardModePanel } from "./KeyboardModePanel";

const KEYBOARD_MODE_KEY = "smartbudget.keyboard_mode";

export function AppShell({ children }: { children: React.ReactNode }) {
  const db = useDB();
  const hydrated = useHydrated();
  const unlocked = useUnlocked();
  const { canUndo, canRedo } = useUndo();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [keyboardDate, setKeyboardDate] = useState(todayISO());
  useTheme();

  const closeKeyboardMode = useCallback(() => {
    setKeyboardMode(false);
    window.localStorage.setItem(KEYBOARD_MODE_KEY, "0");
  }, []);

  useEffect(() => {
    setKeyboardMode(window.localStorage.getItem(KEYBOARD_MODE_KEY) === "1");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && e.shiftKey && e.code === "KeyK") {
        e.preventDefault();
        setKeyboardMode((current) => {
          const next = !current;
          window.localStorage.setItem(KEYBOARD_MODE_KEY, next ? "1" : "0");
          return next;
        });
        return;
      }
      if (keyboardMode) return;

      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        if (e.shiftKey && e.code === "KeyL" && !isTyping) {
          e.preventDefault();
          uiActions.openAdd("transaction");
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (e.shiftKey && k === "a") {
        e.preventDefault();
        uiActions.openAdd("account");
      } else if (e.shiftKey && k === "c") {
        e.preventDefault();
        uiActions.openAdd("card");
      } else if (e.shiftKey && k === "g") {
        e.preventDefault();
        uiActions.openAdd("goal");
      } else if (k === "l") {
        e.preventDefault();
        uiActions.openAdd("transaction");
      } else if (k === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (k === "z") {
        e.preventDefault();
        undo();
      } else if (k === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboardMode]);

  useEffect(() => {
    hydrateLock();
    hydrateUsers();
    initDB();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => refreshDB(), 5000);
    return () => clearInterval(interval);
  }, []);

  if (hydrated && !unlocked) return <LockScreen />;

  if (keyboardMode) {
    return (
      <div className="h-screen w-full overflow-hidden bg-background">
        <KeyboardModePanel
          db={db}
          date={keyboardDate}
          onDateChange={setKeyboardDate}
          onClose={closeKeyboardMode}
        />
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 transition-[width] md:flex",
          "w-64",
        )}
      >
        <Link to="/" className="flex items-center gap-2.5 px-2 py-1">
          <span className="num flex h-9 w-9 items-center justify-center rounded-2xl gradient-primary text-primary-foreground">
            ₹
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight">SmartBudget</span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Family
            </span>
          </span>
        </Link>

        <div className="mt-4" />

        <nav className="mt-5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.to ||
              (item.to.startsWith("/accounts") && pathname.startsWith("/accounts"));
            return (
              <Link
                key={item.to}
                to={item.to}
                preload="intent"
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-2 flex-1 overflow-y-auto no-scrollbar">
          {hydrated &&
            [
              { label: "Accounts", type: "account" as const },
              { label: "Credit Cards", type: "credit" as const },
              { label: "Fixed Deposits", type: "fd" as const },
              { label: "Recurring Deposits", type: "rd" as const },
            ].map((group) => {
              const accts = db.accounts
                .filter((a) => a.type === group.type && !a.closed)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              if (accts.length === 0) return null;
              return (
                <div key={group.type} className="mb-2">
                  <p className="px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {accts.map((a) => {
                      const bal = accountBalance(db, a.id).total;
                      const active = pathname === `/accounts/${a.id}`;
                      return (
                        <Link
                          key={a.id}
                          to="/accounts/$accountId"
                          params={{ accountId: a.id }}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-sidebar-accent",
                            active && "bg-primary/10",
                          )}
                        >
                          <span className="truncate text-sidebar-foreground">{a.name}</span>
                          <span
                            className={cn(
                              "num text-xs font-semibold",
                              active
                                ? "text-primary"
                                : bal < 0
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                            )}
                          >
                            {money(bal)}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => uiActions.openAdd("transaction")}
            className="tap flex flex-1 items-center justify-center gap-2 rounded-2xl gradient-primary px-3 py-2.5 text-sm font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            Add
          </button>
          <button
            onClick={undo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            className="tap rounded-2xl border border-sidebar-border p-2.5 hover:bg-sidebar-accent disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            className="tap rounded-2xl border border-sidebar-border p-2.5 hover:bg-sidebar-accent disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            onClick={lock}
            aria-label="Lock App"
            title="Lock Session"
            className="tap rounded-2xl border border-sidebar-border p-2.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <Lock className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10">
        <PullToRefresh>
          <div
            key={pathname}
            className="animate-native-slide mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8"
          >
            {children}
          </div>
        </PullToRefresh>
      </main>

      <BottomTabBar />
      <AddPopup />
      <EditAccountDialog />
      <EditTransactionDialog />
      <JoinHomeInvitePopup />
      <Toaster position="top-center" richColors />
    </div>
  );
}
