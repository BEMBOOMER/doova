import { create } from "zustand";
import type { JSONContent } from "@tiptap/react";
import type {
  AppData,
  Block,
  BlockLayout,
  CalendarEvent,
  ChecklistItem,
  FileOrganizerItem,
  NoteBlockData,
  ProjectTab,
} from "../types";
import {
  CANVAS_PAD,
  DEFAULT_BLOCK_SIZE,
  DUE_MARKER,
  MIN_BLOCK_SIZE,
  SCHEMA_VERSION,
} from "../types";
import { newId, nowIso } from "../lib/ids";
import { DATA_FILE, loadJson, saveJsonDebounced } from "../lib/persistence";

const GAP = 16;

function makeTab(name: string): ProjectTab {
  return { id: newId(), name, blocks: [], createdAt: nowIso() };
}

// ---------- placement ----------

function overlaps(a: BlockLayout, b: BlockLayout): boolean {
  return (
    a.x < b.x + b.width + GAP &&
    a.x + a.width + GAP > b.x &&
    a.y < b.y + b.height + GAP &&
    a.y + a.height + GAP > b.y
  );
}

/**
 * First free rect scanning left-to-right, then downward — so new blocks fill
 * the board down instead of marching endlessly to the right.
 */
export function findFreeSlot(
  blocks: Block[],
  size = DEFAULT_BLOCK_SIZE,
  viewportWidth = 1200,
): { x: number; y: number } {
  const cols = Math.max(1, Math.floor((viewportWidth - CANVAS_PAD * 2 + GAP) / (size.width + GAP)));
  for (let row = 0; row < 100; row++) {
    for (let col = 0; col < cols; col++) {
      const candidate: BlockLayout = {
        x: CANVAS_PAD + col * (size.width + GAP),
        y: CANVAS_PAD + row * (size.height + GAP),
        ...size,
        z: 0,
      };
      if (!blocks.some((b) => overlaps(candidate, b.layout))) {
        return { x: candidate.x, y: candidate.y };
      }
    }
  }
  const bottom = Math.max(0, ...blocks.map((b) => b.layout.y + b.layout.height));
  return { x: CANVAS_PAD, y: bottom + GAP };
}

function maxZ(blocks: Block[]): number {
  return blocks.reduce((m, b) => Math.max(m, b.layout.z), 0);
}

function makeBlock(blocks: Block[], at?: { x: number; y: number }): NoteBlockData {
  const pos = at ?? findFreeSlot(blocks);
  return {
    id: newId(),
    type: "note",
    title: "Nieuw blok",
    createdAt: nowIso(),
    content: null,
    layout: { ...pos, ...DEFAULT_BLOCK_SIZE, z: maxZ(blocks) + 1 },
  };
}

// ---------- v1 -> v2 migration ----------

function taskItemNode(item: ChecklistItem): JSONContent {
  let text = item.text;
  if (item.dueDate) text += ` · ${DUE_MARKER}${item.dueDate}`;
  if (item.label?.text) text += ` · #${item.label.text}`;
  const content: JSONContent[] = [
    { type: "paragraph", content: text ? [{ type: "text", text }] : [] },
  ];
  if (item.subtasks.length > 0) {
    content.push({ type: "taskList", content: item.subtasks.map(taskItemNode) });
  }
  return { type: "taskItem", attrs: { checked: item.done }, content };
}

function checklistToNoteContent(items: ChecklistItem[]): JSONContent {
  if (items.length === 0) return { type: "doc", content: [{ type: "paragraph" }] };
  return { type: "doc", content: [{ type: "taskList", content: items.map(taskItemNode) }] };
}

function normalizeItems(items: unknown): ChecklistItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((it) => ({
    ...(it as ChecklistItem),
    subtasks: normalizeItems((it as ChecklistItem).subtasks),
  }));
}

/**
 * Migration + shape repair. Handles v1 files: legacy `checklist` blocks become
 * note blocks with a Tiptap task list, and blocks without geometry get
 * positions matching their old left-to-right order.
 */
function normalizeTabs(tabs: ProjectTab[]): ProjectTab[] {
  return tabs.map((tab) => {
    const blocks = (Array.isArray(tab.blocks) ? tab.blocks : []).map(
      (raw, index): Block => {
        // v1 files can hold a "checklist" type that no longer exists in the union
        const legacy = raw as unknown as {
          type: string;
          id: string;
          title: string;
          createdAt: string;
          color?: string | null;
          layout?: BlockLayout;
          items?: unknown;
          events?: unknown;
        };
        let block: Block;
        if (legacy.type === "checklist") {
          const items = normalizeItems(legacy.items);
          block = {
            id: legacy.id,
            type: "note",
            title: legacy.title,
            createdAt: legacy.createdAt,
            content: checklistToNoteContent(items),
            _legacyChecklist: items,
            layout: legacy.layout as BlockLayout,
            color: legacy.color ?? null,
          };
        } else if (legacy.type === "file-organizer") {
          block = { ...(raw as Block), items: Array.isArray(legacy.items) ? legacy.items : [] } as Block;
        } else if (legacy.type === "calendar") {
          block = { ...(raw as Block), events: Array.isArray(legacy.events) ? legacy.events : [] } as Block;
        } else {
          block = raw as Block;
        }
        if (!block.layout || typeof block.layout.x !== "number") {
          // v1 rendered a horizontal row; reproduce it so nothing visually jumps
          block = {
            ...block,
            layout: {
              x: CANVAS_PAD + index * (DEFAULT_BLOCK_SIZE.width + GAP),
              y: CANVAS_PAD,
              ...DEFAULT_BLOCK_SIZE,
              z: index,
            },
          };
        }
        return block;
      },
    );
    return { ...tab, blocks };
  });
}

// ---------- store ----------

interface ProjectsState {
  tabs: ProjectTab[];
  activeTabId: string | null;
  loaded: boolean;
  /** true when data.json exists but could not be read: never overwrite it */
  loadFailed: boolean;

  load: () => Promise<void>;

  addTab: () => void;
  renameTab: (tabId: string, name: string) => void;
  closeTab: (tabId: string) => void;
  restoreTab: (tab: ProjectTab, index: number) => void;
  setActiveTab: (tabId: string) => void;
  reorderTabs: (fromId: string, toId: string) => void;
  mergeProjects: (sourceId: string, targetId: string) => void;

  addBlock: (at?: { x: number; y: number }) => string;
  removeBlock: (blockId: string) => void;
  restoreBlock: (tabId: string, block: Block) => void;
  renameBlock: (blockId: string, title: string) => void;
  duplicateBlock: (blockId: string) => void;
  setBlockColor: (blockId: string, color: string | null) => void;

  moveBlock: (blockId: string, x: number, y: number) => void;
  resizeBlock: (blockId: string, patch: Partial<Omit<BlockLayout, "z">>) => void;
  bringToFront: (blockId: string) => void;

  setNoteContent: (blockId: string, content: JSONContent) => void;
  promoteBlockToFileOrganizer: (blockId: string, items: FileOrganizerItem[]) => void;
  addCalendarBlock: () => void;

  addFileItem: (blockId: string, item: FileOrganizerItem) => void;
  removeFileItem: (blockId: string, itemId: string) => void;
  markFileMissing: (blockId: string, itemId: string, missing: boolean) => void;

  addEvent: (blockId: string, event: Omit<CalendarEvent, "id">) => void;
  updateEvent: (blockId: string, eventId: string, patch: Partial<CalendarEvent>) => void;
  removeEvent: (blockId: string, eventId: string) => void;
}

function persist(state: Pick<ProjectsState, "tabs" | "activeTabId" | "loaded" | "loadFailed">) {
  if (!state.loaded || state.loadFailed) return;
  const data: AppData = {
    schemaVersion: SCHEMA_VERSION,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
  };
  saveJsonDebounced(DATA_FILE, data);
}

function withTab(
  tabs: ProjectTab[],
  tabId: string | null,
  fn: (tab: ProjectTab) => ProjectTab,
): ProjectTab[] {
  return tabs.map((t) => (t.id === tabId ? fn(t) : t));
}

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

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  loaded: false,
  loadFailed: false,

  load: async () => {
    const result = await loadJson<AppData>(DATA_FILE);
    if (result.status === "ok" && Array.isArray(result.data.tabs) && result.data.tabs.length > 0) {
      const data = result.data;
      if (data.schemaVersion > SCHEMA_VERSION) {
        console.error(`data.json has schema ${data.schemaVersion}, app supports ${SCHEMA_VERSION}`);
        set({ tabs: normalizeTabs(data.tabs), activeTabId: data.tabs[0].id, loaded: true, loadFailed: true });
        return;
      }
      const tabs = normalizeTabs(data.tabs);
      const activeTabId = tabs.some((t) => t.id === data.activeTabId) ? data.activeTabId : tabs[0].id;
      set({ tabs, activeTabId, loaded: true });
      if (data.schemaVersion < SCHEMA_VERSION) persist(get()); // write migrated shape once
    } else if (result.status === "error") {
      const first = makeTab("Project 1");
      set({ tabs: [first], activeTabId: first.id, loaded: true, loadFailed: true });
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

  mergeProjects: (sourceId, targetId) => {
    if (sourceId === targetId) return;
    set((s) => {
      const source = s.tabs.find((t) => t.id === sourceId);
      const target = s.tabs.find((t) => t.id === targetId);
      if (!source || !target) return s;
      const bottom = Math.max(0, ...target.blocks.map((b) => b.layout.y + b.layout.height));
      const minSourceY = Math.min(CANVAS_PAD, ...source.blocks.map((b) => b.layout.y));
      const offsetY = target.blocks.length > 0 ? bottom + GAP - minSourceY + CANVAS_PAD : 0;
      const zBase = maxZ(target.blocks);
      const targetIds = new Set(target.blocks.map((b) => b.id));
      const moved = source.blocks.map((b, i) => ({
        ...b,
        id: targetIds.has(b.id) ? newId() : b.id,
        layout: { ...b.layout, y: b.layout.y + offsetY, z: zBase + i + 1 },
      }));
      const tabs = s.tabs
        .filter((t) => t.id !== sourceId)
        .map((t) => (t.id === targetId ? { ...t, blocks: [...t.blocks, ...moved] } : t));
      return { tabs, activeTabId: targetId };
    });
    persist(get());
  },

  addBlock: (at) => {
    let id = "";
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => {
        const block = makeBlock(t.blocks, at);
        id = block.id;
        return { ...t, blocks: [...t.blocks, block] };
      }),
    }));
    persist(get());
    return id;
  },

  addCalendarBlock: () => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => {
        const base = makeBlock(t.blocks);
        return {
          ...t,
          blocks: [
            ...t.blocks,
            { ...base, type: "calendar", title: "Agenda", events: [], content: undefined } as unknown as Block,
          ],
        };
      }),
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

  restoreBlock: (tabId, block) => {
    set((s) => {
      const target = s.tabs.some((t) => t.id === tabId)
        ? tabId
        : (s.activeTabId ?? s.tabs[0]?.id ?? null);
      if (!target) return s;
      return {
        tabs: withTab(s.tabs, target, (t) => ({ ...t, blocks: [...t.blocks, block] })),
      };
    });
    persist(get());
  },

  renameBlock: (blockId, title) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) => ({ ...b, title })),
    }));
    persist(get());
  },

  duplicateBlock: (blockId) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => {
        const src = t.blocks.find((b) => b.id === blockId);
        if (!src) return t;
        const clone: Block = JSON.parse(JSON.stringify(src));
        clone.id = newId();
        clone.createdAt = nowIso();
        clone.layout = {
          ...clone.layout,
          x: clone.layout.x + 24,
          y: clone.layout.y + 24,
          z: maxZ(t.blocks) + 1,
        };
        if (clone.type === "file-organizer") {
          clone.items = clone.items.map((it) => ({ ...it, id: newId() }));
        }
        if (clone.type === "calendar") {
          clone.events = clone.events.map((ev) => ({ ...ev, id: newId() }));
        }
        return { ...t, blocks: [...t.blocks, clone] };
      }),
    }));
    persist(get());
  },

  setBlockColor: (blockId, color) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) => ({ ...b, color })),
    }));
    persist(get());
  },

  moveBlock: (blockId, x, y) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) => ({
        ...b,
        layout: { ...b.layout, x: Math.max(0, x), y: Math.max(0, y) },
      })),
    }));
    persist(get());
  },

  resizeBlock: (blockId, patch) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) => ({
        ...b,
        layout: {
          ...b.layout,
          ...patch,
          x: Math.max(0, patch.x ?? b.layout.x),
          y: Math.max(0, patch.y ?? b.layout.y),
          width: Math.max(MIN_BLOCK_SIZE.width, patch.width ?? b.layout.width),
          height: Math.max(MIN_BLOCK_SIZE.height, patch.height ?? b.layout.height),
        },
      })),
    }));
    persist(get());
  },

  bringToFront: (blockId) => {
    const tab = get().tabs.find((t) => t.id === get().activeTabId);
    const block = tab?.blocks.find((b) => b.id === blockId);
    if (!tab || !block || block.layout.z === maxZ(tab.blocks)) return;
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) => ({
        ...b,
        layout: { ...b.layout, z: maxZ(tab.blocks) + 1 },
      })),
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

  promoteBlockToFileOrganizer: (blockId, items) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) => {
        if (b.type !== "note") return b;
        return {
          id: b.id,
          type: "file-organizer",
          title: b.title === "Nieuw blok" ? "Bestanden" : b.title,
          createdAt: b.createdAt,
          layout: b.layout,
          color: b.color ?? null,
          items,
        };
      }),
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

  addEvent: (blockId, event) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) =>
        b.type === "calendar"
          ? { ...b, events: [...b.events, { ...event, id: newId() }] }
          : b,
      ),
    }));
    persist(get());
  },

  updateEvent: (blockId, eventId, patch) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) =>
        b.type === "calendar"
          ? { ...b, events: b.events.map((ev) => (ev.id === eventId ? { ...ev, ...patch } : ev)) }
          : b,
      ),
    }));
    persist(get());
  },

  removeEvent: (blockId, eventId) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) =>
        b.type === "calendar"
          ? { ...b, events: b.events.filter((ev) => ev.id !== eventId) }
          : b,
      ),
    }));
    persist(get());
  },
}));
