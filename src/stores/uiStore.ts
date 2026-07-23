import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface UiState {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  toasts: Toast[];
  showToast: (message: string, actionLabel?: string, onAction?: () => void) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  toasts: [],
  showToast: (message, actionLabel, onAction) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message, actionLabel, onAction }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
