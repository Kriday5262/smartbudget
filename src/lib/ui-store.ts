import { useSyncExternalStore } from "react";

export type AddTab = "transaction" | "account" | "card" | "goal";

type UIState = {
  addOpen: boolean;
  addTab: AddTab;
  addAccountId?: string;
  addCategoryId?: string;
  fabOpen: boolean;
  editAccountId?: string;
  editTxnId?: string;
};

let state: UIState = { addOpen: false, addTab: "transaction", fabOpen: false };
const listeners = new Set<() => void>();

function set(patch: Partial<UIState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const uiActions = {
  openAdd: (tab: AddTab = "transaction", accountId?: string, categoryId?: string) =>
    set({
      addOpen: true,
      addTab: tab,
      addAccountId: accountId,
      addCategoryId: categoryId,
      fabOpen: false,
    }),
  closeAdd: () => set({ addOpen: false, addAccountId: undefined, addCategoryId: undefined }),
  toggleFab: () => set({ fabOpen: !state.fabOpen }),
  openFab: () => set({ fabOpen: true }),
  closeFab: () => set({ fabOpen: false }),
  editAccount: (editAccountId?: string) => set({ editAccountId, fabOpen: false }),
  editTxn: (editTxnId?: string) => set({ editTxnId, fabOpen: false }),
};

export function useUI(): UIState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
