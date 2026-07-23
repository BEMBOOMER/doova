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
}

export const DEFAULT_SETTINGS: SettingsData = {
  theme: "glass",
  accentColor: "lightblue",
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

// ---------- checklist ----------
export interface ChecklistLabel {
  text: string;
  color: string; // hex, from curated set
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  dueDate: string | null; // ISO date (yyyy-mm-dd)
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

// ---------- blocks ----------
export type BlockType = "note" | "checklist" | "file-organizer";

interface BaseBlock {
  id: string;
  title: string;
  createdAt: string;
}

export interface NoteBlockData extends BaseBlock {
  type: "note";
  content: JSONContent | null;
}

export interface ChecklistBlockData extends BaseBlock {
  type: "checklist";
  items: ChecklistItem[];
}

export interface FileOrganizerBlockData extends BaseBlock {
  type: "file-organizer";
  items: FileOrganizerItem[];
}

export type Block = NoteBlockData | ChecklistBlockData | FileOrganizerBlockData;

// ---------- project / app ----------
export interface ProjectTab {
  id: string;
  name: string;
  blocks: Block[];
  createdAt: string;
}

export interface AppData {
  schemaVersion: number;
  tabs: ProjectTab[];
  activeTabId: string | null;
}

export const SCHEMA_VERSION = 1;
