import type { JSONContent } from "@tiptap/react";

// ---------- settings ----------
export type ThemeName = "glass" | "bemboe";
/** light/dark for the glass theme; "auto" follows macOS */
export type ColorScheme = "auto" | "light" | "dark";
export type AccentColor =
  | "yellow"
  | "blue"
  | "lightblue"
  | "purple"
  | "coral"
  | "lime"
  | "orange"
  | "teal";

/** Locales Doova offers for dictation; macOS needs an explicit one, it does not auto-detect. */
export type DictationLocale = "nl-NL" | "en-US";

export const DICTATION_LOCALES: { id: DictationLocale; short: string; label: string }[] = [
  { id: "nl-NL", short: "NL", label: "Nederlands" },
  { id: "en-US", short: "EN", label: "Engels" },
];

export type ShortcutAction =
  | "palette"
  | "newBlock"
  | "toggleSidebar"
  | "settings"
  | "exportProject"
  | "quickCapture";

export const SHORTCUT_ACTIONS: { id: ShortcutAction; label: string; hint: string }[] = [
  { id: "palette", label: "Zoeken & acties", hint: "Opent de command-palette" },
  { id: "newBlock", label: "Nieuw blok", hint: "Voegt een blok toe aan het canvas" },
  { id: "toggleSidebar", label: "Zijbalk in/uitklappen", hint: "Meer ruimte voor je canvas" },
  { id: "settings", label: "Instellingen", hint: "Wisselt tussen canvas en instellingen" },
  { id: "exportProject", label: "Exporteer project", hint: "Markdown van het actieve project" },
  {
    id: "quickCapture",
    label: "Snel vastleggen",
    hint: "Werkt overal, ook als Doova dicht staat. Vereist minstens één modifier.",
  },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  palette: "mod+k",
  newBlock: "mod+n",
  toggleSidebar: "mod+b",
  settings: "mod+,",
  exportProject: "mod+shift+e",
  quickCapture: "mod+shift+ ",
};

export interface SettingsData {
  theme: ThemeName;
  colorScheme: ColorScheme;
  accentColor: AccentColor;
  snapEnabled: boolean;
  gridSize: number;
  compactMode: boolean;
  reduceTransparency: boolean;
  sidebarCollapsed: boolean;
  /** mouse button that pans the canvas: 1 = middle, 2 = right, 0 = off */
  panButton: 0 | 1 | 2;
  /** action id -> key binding like "mod+k"; empty string disables it */
  shortcuts: Record<ShortcutAction, string>;
  /** language the microphone button dictates in */
  dictationLocale: DictationLocale;
}



export const DEFAULT_SETTINGS: SettingsData = {
  theme: "glass",
  colorScheme: "auto",
  accentColor: "lightblue",
  snapEnabled: true,
  gridSize: 5,
  compactMode: false,
  reduceTransparency: false,
  sidebarCollapsed: false,
  panButton: 1,
  shortcuts: DEFAULT_SHORTCUTS,
  dictationLocale: "nl-NL",
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

export interface BlockSize {
  width: number;
  height: number;
}

export const DEFAULT_BLOCK_SIZE: BlockSize = { width: 300, height: 380 };
export const MIN_BLOCK_SIZE: BlockSize = { width: 220, height: 140 };

/**
 * A link or a colour is a line, not a page. One shared minimum would either
 * leave those blocks with three empty rows or let a note be squashed to nothing.
 */
const SIZES: Partial<Record<BlockType, { min: BlockSize; default: BlockSize }>> = {
  link: { min: { width: 200, height: 68 }, default: { width: 300, height: 88 } },
  swatch: { min: { width: 170, height: 64 }, default: { width: 280, height: 96 } },
};

export function minSizeFor(type: BlockType): BlockSize {
  return SIZES[type]?.min ?? MIN_BLOCK_SIZE;
}

export function defaultSizeFor(type: BlockType): BlockSize {
  return SIZES[type]?.default ?? DEFAULT_BLOCK_SIZE;
}
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

// ---------- moodboard ----------
/** Images live as copies in the app's own images folder, so the board survives
 *  the original being moved or thrown away. `file` is the name inside it. */
export interface MoodboardImage {
  id: string;
  file: string;
  name: string;
  addedAt: string;
  /** natural size, kept so the grid can reserve space before the image loads */
  width?: number;
  height?: number;
}

// ---------- link ----------
/** Metadata is filled in after the block exists, or never, when offline. */
export interface LinkMeta {
  linkTitle?: string | null;
  /** filename inside the app's favicons folder */
  favicon?: string | null;
  fetchedAt?: string | null;
}

// ---------- swatch ----------
export interface Swatch {
  id: string;
  hex: string;
  name?: string | null;
}

// ---------- blocks ----------
export type BlockType = "note" | "file-organizer" | "calendar" | "moodboard" | "link" | "swatch";

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
  /** files dropped onto this note live alongside the text */
  files?: FileOrganizerItem[];
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

export interface MoodboardBlockData extends BaseBlock {
  type: "moodboard";
  images: MoodboardImage[];
}

export interface LinkBlockData extends BaseBlock, LinkMeta {
  type: "link";
  url: string;
}

export interface SwatchBlockData extends BaseBlock {
  type: "swatch";
  swatches: Swatch[];
}

/**
 * Omit applied to each member of a union separately. A plain Omit over a union
 * collapses to the keys they share, which for Block means losing every field
 * that makes a block what it is.
 */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** A block as a template describes it, before the store gives it an identity. */
export type NewBlock = DistributiveOmit<Block, "id" | "createdAt">;

export type Block =
  | NoteBlockData
  | FileOrganizerBlockData
  | CalendarBlockData
  | MoodboardBlockData
  | LinkBlockData
  | SwatchBlockData;

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
  /** pinned projects sit in their own section at the top of the sidebar */
  pinned?: boolean;
  /** where quick capture drops its notes; a flag, not a name, so renaming is safe */
  inbox?: boolean;
}

export interface AppData {
  schemaVersion: number;
  tabs: ProjectTab[];
  folders?: ProjectFolder[];
  activeTabId: string | null;
}

export const SCHEMA_VERSION = 3;

/** Marker used in task text to carry a due date through migration/export. */
export const DUE_MARKER = "⏳";
