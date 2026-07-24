import type { JSONContent } from "@tiptap/react";

// ---------- settings ----------
export type ThemeName = "glass" | "bemboe";
export type AccentColor =
  | "yellow"
  | "blue"
  | "lightblue"
  | "purple"
  | "coral"
  | "lime"
  | "orange"
  | "teal";

export interface SettingsData {
  theme: ThemeName;
  accentColor: AccentColor;
  snapEnabled: boolean;
  gridSize: number;
  compactMode: boolean;
  reduceTransparency: boolean;
  sidebarCollapsed: boolean;
}

export const DEFAULT_SETTINGS: SettingsData = {
  theme: "glass",
  accentColor: "lightblue",
  snapEnabled: true,
  gridSize: 5,
  compactMode: false,
  reduceTransparency: false,
  sidebarCollapsed: false,
};

export const ACCENT_COLORS: { id: AccentColor; hex: string; label: string }[] = [
  { id: "yellow", hex: "#FFD600", label: "Geel" },
  { id: "blue", hex: "#4361EE", label: "Blauw" },
  { id: "lightblue", hex: "#58C4F6", label: "Lichtblauw" },
  { id: "purple", hex: "#A855F7", label: "Paars" },
  { id: "coral", hex: "#FF4F81", label: "Coral" },
  { id: "lime", hex: "#CCFF00", label: "Lime" },
  { id: "orange", hex: "#FF6B35", label: "Oranje" },
  { id: "teal", hex: "#06D6A0", label: "Teal" },
];

// ---------- geometry ----------
export interface BlockLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export const DEFAULT_BLOCK_SIZE = { width: 300, height: 380 };
export const MIN_BLOCK_SIZE = { width: 220, height: 140 };
/** leaves room for the block title that floats above each block */
export const CANVAS_PAD = 40;

// ---------- legacy checklist (v1, only used by the migration) ----------
export interface ChecklistLabel {
  text: string;
  color: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  label: ChecklistLabel | null;
  subtasks: ChecklistItem[];
}

// ---------- file organizer ----------
export interface FileOrganizerItem {
  id: string;
  path: string;
  name: string;
  kind: "file" | "folder";
  ext: string | null;
  addedAt: string;
  missing?: boolean;
}

// ---------- calendar ----------
export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO yyyy-mm-dd
  time?: string | null; // "HH:mm"
  note?: string | null;
  color?: string | null;
}

// ---------- blocks ----------
export type BlockType = "note" | "file-organizer" | "calendar";

interface BaseBlock {
  id: string;
  title: string;
  createdAt: string;
  layout: BlockLayout;
  color?: string | null;
  /** set when the block belongs to a collapsible canvas group */
  groupId?: string | null;
}

/** Collapsible group of blocks on the canvas; x/y is where the chip sits while collapsed. */
export interface BlockGroup {
  id: string;
  name: string;
  collapsed: boolean;
  x: number;
  y: number;
}

export interface NoteBlockData extends BaseBlock {
  type: "note";
  content: JSONContent | null;
  /** original v1 checklist data, kept one schema version for rollback */
  _legacyChecklist?: ChecklistItem[];
}

export interface FileOrganizerBlockData extends BaseBlock {
  type: "file-organizer";
  items: FileOrganizerItem[];
}

export interface CalendarBlockData extends BaseBlock {
  type: "calendar";
  events: CalendarEvent[];
}

export type Block = NoteBlockData | FileOrganizerBlockData | CalendarBlockData;

// ---------- project / app ----------
export interface ProjectFolder {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface ProjectTab {
  id: string;
  name: string;
  blocks: Block[];
  groups?: BlockGroup[];
  createdAt: string;
  /** set when the project lives inside a sidebar folder */
  folderId?: string | null;
}

export interface AppData {
  schemaVersion: number;
  tabs: ProjectTab[];
  folders?: ProjectFolder[];
  activeTabId: string | null;
}

export const SCHEMA_VERSION = 2;

/** Marker used in task text to carry a due date through migration/export. */
export const DUE_MARKER = "⏳";
