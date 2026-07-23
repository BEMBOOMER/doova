import { create } from "zustand";
import type { JSONContent } from "@tiptap/react";
import type {
  AppData,
  Block,
  BlockType,
  ChecklistItem,
  FileOrganizerItem,
  ProjectTab,
} from "../types";
import { SCHEMA_VERSION } from "../types";
import { newId, nowIso } from "../lib/ids";
import { DATA_FILE, loadJson, saveJsonDebounced } from "../lib/persistence";

function makeTab(name: string): ProjectTab {
  return { id: newId(), name, blocks: [], createdAt: nowIso() };
}

function makeBlock(type: BlockType): Block {
  const base = { id: newId(), createdAt: nowIso() };
  switch (type) {
    case "note":
      return { ...base, type, title: "Notities", content: null };
    case "checklist":
      return { ...base, type, title: "To do", items: [] };
    case "file-organizer":
      return { ...base, type, title: "Bestanden", items: [] };
  }
}

interface ProjectsState {
  tabs: ProjectTab[];
  activeTabId: string | null;
  loaded: boolean;

  load: () => Promise<void>;

  addTab: () => void;
  renameTab: (tabId: string, name: string) => void;
  closeTab: (tabId: string) => void;
  restoreTab: (tab: ProjectTab, index: number) => void;
  setActiveTab: (tabId: string) => void;
  reorderTabs: (fromId: string, toId: string) => void;

  addBlock: (type: BlockType) => void;
  removeBlock: (blockId: string) => void;
  restoreBlock: (tabId: string, block: Block, index: number) => void;
  renameBlock: (blockId: string, title: string) => void;
  reorderBlocks: (fromId: string, toId: string) => void;

  setNoteContent: (blockId: string, content: JSONContent) => void;

  addChecklistItem: (blockId: string, text: string, parentItemId?: string) => void;
  updateChecklistItem: (blockId: string, itemId: string, patch: Partial<ChecklistItem>) => void;
  removeChecklistItem: (blockId: string, itemId: string) => void;

  addFileItem: (blockId: string, item: FileOrganizerItem) => void;
  removeFileItem: (blockId: string, itemId: string) => void;
  markFileMissing: (blockId: string, itemId: string, missing: boolean) => void;
}

function persist(state: Pick<ProjectsState, "tabs" | "activeTabId">) {
  const data: AppData = {
    schemaVersion: SCHEMA_VERSION,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
  };
  saveJsonDebounced(DATA_FILE, data);
}

/** Immutably update one tab by id. */
function withTab(
  tabs: ProjectTab[],
  tabId: string | null,
  fn: (tab: ProjectTab) => ProjectTab,
): ProjectTab[] {
  return tabs.map((t) => (t.id === tabId ? fn(t) : t));
}

/** Immutably update one block in one tab. */
function withBlock(
  tabs: ProjectTab[],
  tabId: string | null,
  blockId: string,
  fn: (block: Block) => Block,
): ProjectTab[] {
  return withTab(tabs, tabId, (tab) => ({
    ...tab,
    blocks: tab.blocks.map((b) => (b.id === blockId ? fn(b) : b)),
  }));
}

/** Recursively update a checklist item (top-level or subtask). */
function mapItems(
  items: ChecklistItem[],
  itemId: string,
  fn: (item: ChecklistItem) => ChecklistItem,
): ChecklistItem[] {
  return items.map((it) =>
    it.id === itemId ? fn(it) : { ...it, subtasks: mapItems(it.subtasks, itemId, fn) },
  );
}

function filterItems(items: ChecklistItem[], itemId: string): ChecklistItem[] {
  return items
    .filter((it) => it.id !== itemId)
    .map((it) => ({ ...it, subtasks: filterItems(it.subtasks, itemId) }));
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  loaded: false,

  load: async () => {
    const data = await loadJson<AppData>(DATA_FILE);
    if (data && Array.isArray(data.tabs) && data.tabs.length > 0) {
      const activeTabId =
        data.tabs.some((t) => t.id === data.activeTabId) ? data.activeTabId : data.tabs[0].id;
      set({ tabs: data.tabs, activeTabId, loaded: true });
    } else {
      const first = makeTab("Project 1");
      set({ tabs: [first], activeTabId: first.id, loaded: true });
      persist(get());
    }
  },

  addTab: () => {
    const tab = makeTab(`Project ${get().tabs.length + 1}`);
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    persist(get());
  },

  renameTab: (tabId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({ tabs: withTab(s.tabs, tabId, (t) => ({ ...t, name: trimmed })) }));
    persist(get());
  },

  closeTab: (tabId) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      let activeTabId = s.activeTabId;
      if (activeTabId === tabId) {
        const idx = s.tabs.findIndex((t) => t.id === tabId);
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null;
      }
      return { tabs, activeTabId };
    });
    persist(get());
  },

  restoreTab: (tab, index) => {
    set((s) => {
      const tabs = [...s.tabs];
      tabs.splice(Math.min(index, tabs.length), 0, tab);
      return { tabs, activeTabId: tab.id };
    });
    persist(get());
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
    persist(get());
  },

  reorderTabs: (fromId, toId) => {
    set((s) => {
      const tabs = [...s.tabs];
      const from = tabs.findIndex((t) => t.id === fromId);
      const to = tabs.findIndex((t) => t.id === toId);
      if (from < 0 || to < 0) return s;
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      return { tabs };
    });
    persist(get());
  },

  addBlock: (type) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => ({
        ...t,
        blocks: [...t.blocks, makeBlock(type)],
      })),
    }));
    persist(get());
  },

  removeBlock: (blockId) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => ({
        ...t,
        blocks: t.blocks.filter((b) => b.id !== blockId),
      })),
    }));
    persist(get());
  },

  restoreBlock: (tabId, block, index) => {
    set((s) => ({
      tabs: withTab(s.tabs, tabId, (t) => {
        const blocks = [...t.blocks];
        blocks.splice(Math.min(index, blocks.length), 0, block);
        return { ...t, blocks };
      }),
    }));
    persist(get());
  },

  renameBlock: (blockId, title) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) => ({ ...b, title })),
    }));
    persist(get());
  },

  reorderBlocks: (fromId, toId) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => {
        const blocks = [...t.blocks];
        const from = blocks.findIndex((b) => b.id === fromId);
        const to = blocks.findIndex((b) => b.id === toId);
        if (from < 0 || to < 0) return t;
        const [moved] = blocks.splice(from, 1);
        blocks.splice(to, 0, moved);
        return { ...t, blocks };
      }),
    }));
    persist(get());
  },

  setNoteContent: (blockId, content) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) =>
        b.type === "note" ? { ...b, content } : b,
      ),
    }));
    persist(get());
  },

  addChecklistItem: (blockId, text, parentItemId) => {
    const item: ChecklistItem = {
      id: newId(),
      text,
      done: false,
      dueDate: null,
      label: null,
      subtasks: [],
    };
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) => {
        if (b.type !== "checklist") return b;
        if (parentItemId) {
          return {
            ...b,
            items: mapItems(b.items, parentItemId, (p) => ({
              ...p,
              subtasks: [...p.subtasks, item],
            })),
          };
        }
        return { ...b, items: [...b.items, item] };
      }),
    }));
    persist(get());
  },

  updateChecklistItem: (blockId, itemId, patch) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) =>
        b.type === "checklist"
          ? { ...b, items: mapItems(b.items, itemId, (it) => ({ ...it, ...patch })) }
          : b,
      ),
    }));
    persist(get());
  },

  removeChecklistItem: (blockId, itemId) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) =>
        b.type === "checklist" ? { ...b, items: filterItems(b.items, itemId) } : b,
      ),
    }));
    persist(get());
  },

  addFileItem: (blockId, item) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) => {
        if (b.type !== "file-organizer") return b;
        if (b.items.some((it) => it.path === item.path)) return b;
        return { ...b, items: [...b.items, item] };
      }),
    }));
    persist(get());
  },

  removeFileItem: (blockId, itemId) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) =>
        b.type === "file-organizer"
          ? { ...b, items: b.items.filter((it) => it.id !== itemId) }
          : b,
      ),
    }));
    persist(get());
  },

  markFileMissing: (blockId, itemId, missing) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) =>
        b.type === "file-organizer"
          ? { ...b, items: b.items.map((it) => (it.id === itemId ? { ...it, missing } : it)) }
          : b,
      ),
    }));
    persist(get());
  },
}));
