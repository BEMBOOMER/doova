import { create } from "zustand";
import type { JSONContent } from "@tiptap/react";
import type {
  AppData,
  Block,
  BlockGroup,
  BlockLayout,
  CalendarEvent,
  ChecklistItem,
  FileOrganizerItem,
  NoteBlockData,
  ProjectFolder,
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

/** "Blok 1", "Blok 2", ... skipping numbers already in use */
function nextBlockName(blocks: Block[]): string {
  const used = new Set(blocks.map((b) => b.title));
  for (let n = 1; ; n++) {
    const name = `Blok ${n}`;
    if (!used.has(name)) return name;
  }
}

function makeBlock(blocks: Block[], at?: { x: number; y: number }): NoteBlockData {
  const pos = at ?? findFreeSlot(blocks);
  return {
    id: newId(),
    type: "note",
    title: nextBlockName(blocks),
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
    const groups = Array.isArray(tab.groups) ? tab.groups : [];
    const validGroupIds = new Set(groups.map((g) => g.id));
    return {
      ...tab,
      blocks: blocks.map((b) =>
        b.groupId && !validGroupIds.has(b.groupId) ? { ...b, groupId: null } : b,
      ),
      groups,
    };
  });
}

// ---------- store ----------

interface ProjectsState {
  tabs: ProjectTab[];
  folders: ProjectFolder[];
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
  /** puts both projects in a new collapsible sidebar folder */
  groupProjects: (aId: string, bId: string) => void;
  renameFolder: (folderId: string, name: string) => void;
  toggleFolder: (folderId: string) => void;
  /** removes the folder; the projects stay, back at top level */
  dissolveFolder: (folderId: string) => void;
  moveTabToFolder: (tabId: string, folderId: string | null) => void;

  addBlock: (at?: { x: number; y: number }) => string;
  addCalendarBlock: (at?: { x: number; y: number }) => void;
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
  /** adds files to a note (as attachments) or to a file block (as items) */
  addFilesToBlock: (blockId: string, items: FileOrganizerItem[]) => void;
  removeNoteFile: (blockId: string, itemId: string) => void;

  addFileItem: (blockId: string, item: FileOrganizerItem) => void;
  removeFileItem: (blockId: string, itemId: string) => void;
  markFileMissing: (blockId: string, itemId: string, missing: boolean) => void;

  addEvent: (blockId: string, event: Omit<CalendarEvent, "id">) => void;
  updateEvent: (blockId: string, eventId: string, patch: Partial<CalendarEvent>) => void;
  removeEvent: (blockId: string, eventId: string) => void;

  /** puts both blocks in a collapsible canvas group */
  groupBlocks: (aId: string, bId: string) => void;
  toggleBlockGroup: (groupId: string) => void;
  /** drags the whole group: offsets every member (and the chip position) */
  moveBlockGroup: (groupId: string, dx: number, dy: number) => void;
  /** moves the collapsed chip without touching the members */
  setGroupPosition: (groupId: string, x: number, y: number) => void;
  /** lays the members out in tidy rows, like the reference design */
  arrangeBlockGroup: (groupId: string) => void;
  renameBlockGroup: (groupId: string, name: string) => void;
  dissolveBlockGroup: (groupId: string) => void;
  removeBlockFromGroup: (blockId: string) => void;
}

function persist(
  state: Pick<ProjectsState, "tabs" | "folders" | "activeTabId" | "loaded" | "loadFailed">,
) {
  if (!state.loaded || state.loadFailed) return;
  const data: AppData = {
    schemaVersion: SCHEMA_VERSION,
    tabs: state.tabs,
    folders: state.folders,
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

/** Gap between blocks laid out by "netjes ordenen" inside a group. */
const GROUP_GAP = 18;
/** Rows wrap once they get wider than this (unless a single block is wider). */
const GROUP_ROW_WIDTH = 940;

/** Lays a group's members out in tidy top-aligned rows from their top-left corner. */
function arrangeGroupInTab(t: ProjectTab, groupId: string): ProjectTab {
  const members = t.blocks
    .filter((b) => b.groupId === groupId)
    .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
  if (members.length < 2) return t;
  const originX = Math.max(24, Math.min(...members.map((b) => b.layout.x)));
  const originY = Math.max(48, Math.min(...members.map((b) => b.layout.y)));
  const pos = new Map<string, { x: number; y: number }>();
  let x = originX;
  let y = originY;
  let rowH = 0;
  for (const m of members) {
    if (x > originX && x + m.layout.width > originX + GROUP_ROW_WIDTH) {
      x = originX;
      y += rowH + GROUP_GAP;
      rowH = 0;
    }
    pos.set(m.id, { x, y });
    x += m.layout.width + GROUP_GAP;
    rowH = Math.max(rowH, m.layout.height);
  }
  return {
    ...t,
    blocks: t.blocks.map((b) => {
      const p = pos.get(b.id);
      return p ? { ...b, layout: { ...b.layout, x: p.x, y: p.y } } : b;
    }),
  };
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
  folders: [],
  activeTabId: null,
  loaded: false,
  loadFailed: false,

  load: async () => {
    const result = await loadJson<AppData>(DATA_FILE);
    if (result.status === "ok" && Array.isArray(result.data.tabs) && result.data.tabs.length > 0) {
      const data = result.data;
      const folders = Array.isArray(data.folders) ? data.folders : [];
      if (data.schemaVersion > SCHEMA_VERSION) {
        console.error(`data.json has schema ${data.schemaVersion}, app supports ${SCHEMA_VERSION}`);
        set({ tabs: normalizeTabs(data.tabs), folders, activeTabId: data.tabs[0].id, loaded: true, loadFailed: true });
        return;
      }
      const tabs = normalizeTabs(data.tabs);
      const activeTabId = tabs.some((t) => t.id === data.activeTabId) ? data.activeTabId : tabs[0].id;
      set({ tabs, folders, activeTabId, loaded: true });
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

  groupProjects: (aId, bId) => {
    if (aId === bId) return;
    set((s) => {
      const a = s.tabs.find((t) => t.id === aId);
      const b = s.tabs.find((t) => t.id === bId);
      if (!a || !b) return s;
      // reuse b's folder when it already lives in one
      const existing = b.folderId ? s.folders.find((f) => f.id === b.folderId) : null;
      if (existing) {
        return {
          tabs: s.tabs.map((t) => (t.id === aId ? { ...t, folderId: existing.id } : t)),
        };
      }
      const folder: ProjectFolder = { id: newId(), name: "Nieuwe map", collapsed: false };
      return {
        folders: [...s.folders, folder],
        tabs: s.tabs.map((t) =>
          t.id === aId || t.id === bId ? { ...t, folderId: folder.id } : t,
        ),
      };
    });
    persist(get());
  },

  renameFolder: (folderId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({
      folders: s.folders.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f)),
    }));
    persist(get());
  },

  toggleFolder: (folderId) => {
    set((s) => ({
      folders: s.folders.map((f) => (f.id === folderId ? { ...f, collapsed: !f.collapsed } : f)),
    }));
    persist(get());
  },

  dissolveFolder: (folderId) => {
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== folderId),
      tabs: s.tabs.map((t) => (t.folderId === folderId ? { ...t, folderId: null } : t)),
    }));
    persist(get());
  },

  moveTabToFolder: (tabId, folderId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, folderId } : t)),
    }));
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

  addCalendarBlock: (at) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => {
        const base = makeBlock(t.blocks, at);
        const calendar: Block = {
          id: base.id,
          type: "calendar",
          title: "Agenda",
          createdAt: base.createdAt,
          layout: base.layout,
          events: [],
        };
        return { ...t, blocks: [...t.blocks, calendar] };
      }),
    }));
    persist(get());
  },

  removeBlock: (blockId) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => {
        const blocks = t.blocks.filter((b) => b.id !== blockId);
        // drop groups that no longer have at least two members
        const groups = (t.groups ?? []).filter(
          (g) => blocks.filter((b) => b.groupId === g.id).length >= 2,
        );
        return {
          ...t,
          blocks: blocks.map((b) =>
            b.groupId && !groups.some((g) => g.id === b.groupId) ? { ...b, groupId: null } : b,
          ),
          groups,
        };
      }),
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
        clone.groupId = null;
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
          title: b.title,
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

  addFilesToBlock: (blockId, items) => {
    if (items.length === 0) return;
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) => {
        if (b.type === "file-organizer") {
          const fresh = items.filter((it) => !b.items.some((ex) => ex.path === it.path));
          return { ...b, items: [...b.items, ...fresh] };
        }
        if (b.type === "note") {
          const current = b.files ?? [];
          const fresh = items.filter((it) => !current.some((ex) => ex.path === it.path));
          return { ...b, files: [...current, ...fresh] };
        }
        return b;
      }),
    }));
    persist(get());
  },

  removeNoteFile: (blockId, itemId) => {
    set((s) => ({
      tabs: withBlock(s.tabs, s.activeTabId, blockId, (b) =>
        b.type === "note" ? { ...b, files: (b.files ?? []).filter((f) => f.id !== itemId) } : b,
      ),
    }));
    persist(get());
  },

  groupBlocks: (aId, bId) => {
    if (aId === bId) return;
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => {
        const a = t.blocks.find((b) => b.id === aId);
        const b = t.blocks.find((b) => b.id === bId);
        if (!a || !b) return t;
        const groups = t.groups ?? [];
        const existing = b.groupId ? groups.find((g) => g.id === b.groupId) : null;
        if (existing) {
          return arrangeGroupInTab(
            {
              ...t,
              blocks: t.blocks.map((bl) => (bl.id === aId ? { ...bl, groupId: existing.id } : bl)),
            },
            existing.id,
          );
        }
        const group: BlockGroup = {
          id: newId(),
          name: "Groep",
          collapsed: false,
          x: Math.min(a.layout.x, b.layout.x),
          y: Math.min(a.layout.y, b.layout.y),
        };
        return arrangeGroupInTab(
          {
            ...t,
            groups: [...groups, group],
            blocks: t.blocks.map((bl) =>
              bl.id === aId || bl.id === bId ? { ...bl, groupId: group.id } : bl,
            ),
          },
          group.id,
        );
      }),
    }));
    persist(get());
  },

  moveBlockGroup: (groupId, dx, dy) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => {
        const members = t.blocks.filter((b) => b.groupId === groupId);
        if (members.length === 0) return t;
        // keep the whole group on-canvas: clamp the shared offset, not per block
        const minX = Math.min(...members.map((b) => b.layout.x));
        const minY = Math.min(...members.map((b) => b.layout.y));
        const fx = Math.max(dx, -minX);
        const fy = Math.max(dy, 48 - minY);
        return {
          ...t,
          groups: (t.groups ?? []).map((g) =>
            g.id === groupId ? { ...g, x: g.x + fx, y: g.y + fy } : g,
          ),
          blocks: t.blocks.map((b) =>
            b.groupId === groupId
              ? { ...b, layout: { ...b.layout, x: b.layout.x + fx, y: b.layout.y + fy } }
              : b,
          ),
        };
      }),
    }));
    persist(get());
  },

  setGroupPosition: (groupId, x, y) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => ({
        ...t,
        groups: (t.groups ?? []).map((g) =>
          g.id === groupId ? { ...g, x: Math.max(0, x), y: Math.max(0, y) } : g,
        ),
      })),
    }));
    persist(get());
  },

  arrangeBlockGroup: (groupId) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => arrangeGroupInTab(t, groupId)),
    }));
    persist(get());
  },

  toggleBlockGroup: (groupId) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => {
        const group = (t.groups ?? []).find((g) => g.id === groupId);
        const members = t.blocks.filter((b) => b.groupId === groupId);
        if (!group || members.length === 0) return t;
        const minX = Math.min(...members.map((b) => b.layout.x));
        const minY = Math.min(...members.map((b) => b.layout.y));
        if (!group.collapsed) {
          // collapse: the chip appears where the group's top-left was
          return {
            ...t,
            groups: (t.groups ?? []).map((g) =>
              g.id === groupId ? { ...g, collapsed: true, x: minX, y: minY } : g,
            ),
          };
        }
        // expand at the chip's current spot: if the chip was dragged while
        // collapsed, the blocks follow it instead of popping back
        const dx = Math.max(0, group.x) - minX;
        const dy = Math.max(48, group.y) - minY;
        return {
          ...t,
          groups: (t.groups ?? []).map((g) => (g.id === groupId ? { ...g, collapsed: false } : g)),
          blocks:
            dx === 0 && dy === 0
              ? t.blocks
              : t.blocks.map((b) =>
                  b.groupId === groupId
                    ? { ...b, layout: { ...b.layout, x: b.layout.x + dx, y: b.layout.y + dy } }
                    : b,
                ),
        };
      }),
    }));
    persist(get());
  },

  renameBlockGroup: (groupId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => ({
        ...t,
        groups: (t.groups ?? []).map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)),
      })),
    }));
    persist(get());
  },

  dissolveBlockGroup: (groupId) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => ({
        ...t,
        groups: (t.groups ?? []).filter((g) => g.id !== groupId),
        blocks: t.blocks.map((b) => (b.groupId === groupId ? { ...b, groupId: null } : b)),
      })),
    }));
    persist(get());
  },

  removeBlockFromGroup: (blockId) => {
    set((s) => ({
      tabs: withTab(s.tabs, s.activeTabId, (t) => {
        const block = t.blocks.find((b) => b.id === blockId);
        if (!block?.groupId) return t;
        const groupId = block.groupId;
        const blocks = t.blocks.map((b) => (b.id === blockId ? { ...b, groupId: null } : b));
        const remaining = blocks.filter((b) => b.groupId === groupId).length;
        return {
          ...t,
          blocks:
            remaining >= 2
              ? blocks
              : blocks.map((b) => (b.groupId === groupId ? { ...b, groupId: null } : b)),
          groups:
            remaining >= 2 ? t.groups : (t.groups ?? []).filter((g) => g.id !== groupId),
        };
      }),
    }));
    persist(get());
  },
}));
