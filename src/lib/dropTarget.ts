import type { Block, FileOrganizerItem } from "../types";

export type DropPlan =
  | { action: "append"; blockId: string; items: FileOrganizerItem[] }
  | { action: "create"; items: FileOrganizerItem[] };

/**
 * Decides where dropped files go. Any block you drop on receives them:
 * notes keep their text and gain an attachment list, file blocks append.
 * Only a drop on empty canvas creates a new block.
 */
export function planDrop(block: Block | undefined, items: FileOrganizerItem[]): DropPlan {
  if (!block) return { action: "create", items };

  const existing =
    block.type === "file-organizer" ? block.items : block.type === "note" ? (block.files ?? []) : [];
  const fresh = items.filter((it) => !existing.some((ex) => ex.path === it.path));

  // calendar blocks cannot hold files; drop next to them instead
  if (block.type === "calendar") return { action: "create", items };

  return { action: "append", blockId: block.id, items: fresh };
}
