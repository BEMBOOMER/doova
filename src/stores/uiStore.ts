import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export type ActiveView = "canvas" | "settings";

interface UiState {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;

  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

  /** true while a block is being dragged/resized: used to pause backdrop blur */
  interacting: boolean;
  setInteracting: (v: boolean) => void;

  /** set while the settings screen is capturing a new key binding */
  recordingShortcut: string | null;
  setRecordingShortcut: (id: string | null) => void;

  toasts: Toast[];
  showToast: (message: string, actionLabel?: string, onAction?: () => void) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set) => ({
  activeView: "canvas",
  setActiveView: (activeView) => set({ activeView }),

  selectedBlockId: null,
  setSelectedBlockId: (selectedBlockId) => set({ selectedBlockId }),

  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  recordingShortcut: null,
  setRecordingShortcut: (recordingShortcut) => set({ recordingShortcut }),

  interacting: false,
  setInteracting: (interacting) => {
    set({ interacting });
    document.body.classList.toggle("is-interacting", interacting);
  },

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
