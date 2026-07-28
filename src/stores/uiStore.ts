import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** blijft staan tot je hem wegklikt, voor meldingen die je niet mag missen */
  persist?: boolean;
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

  /** block currently holding the microphone; only one dictation runs at a time */
  dictatingBlockId: string | null;
  setDictatingBlockId: (id: string | null) => void;

  /** a search hit waiting to be scrolled to, once its canvas has rendered */
  revealBlockId: string | null;
  setRevealBlockId: (id: string | null) => void;

  /** the connection line under selection, which Delete removes */
  selectedConnectionId: string | null;
  setSelectedConnectionId: (id: string | null) => void;

  /** canvas scale; 1 is life size. Session-only, like a scroll position. */
  zoom: number;
  setZoom: (zoom: number) => void;

  toasts: Toast[];
  showToast: (
    message: string,
    actionLabel?: string,
    onAction?: () => void,
    opts?: { persist?: boolean },
  ) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set) => ({
  activeView: "canvas",
  setActiveView: (activeView) => set({ activeView }),

  // One thing at a time. Blocks and lines used to hold their own selection, so
  // picking one never released the other and a clicked line stayed lit forever.
  selectedBlockId: null,
  setSelectedBlockId: (selectedBlockId) => set({ selectedBlockId, selectedConnectionId: null }),

  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  recordingShortcut: null,
  setRecordingShortcut: (recordingShortcut) => set({ recordingShortcut }),

  dictatingBlockId: null,
  setDictatingBlockId: (dictatingBlockId) => set({ dictatingBlockId }),

  revealBlockId: null,
  setRevealBlockId: (revealBlockId) => set({ revealBlockId }),

  selectedConnectionId: null,
  setSelectedConnectionId: (selectedConnectionId) =>
    set(selectedConnectionId ? { selectedConnectionId, selectedBlockId: null } : { selectedConnectionId }),

  zoom: 1,
  // Below a third the blocks are unreadable, above double there is no overview
  // left to gain, and both extremes make the drag maths lose precision.
  setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.34, zoom)) }),

  interacting: false,
  setInteracting: (interacting) => {
    set({ interacting });
    document.body.classList.toggle("is-interacting", interacting);
  },

  toasts: [],
  showToast: (message, actionLabel, onAction, opts) => {
    const id = ++toastSeq;
    const persist = opts?.persist ?? false;
    set((s) => ({ toasts: [...s.toasts, { id, message, actionLabel, onAction, persist }] }));
    if (persist) return;
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
