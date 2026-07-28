import type { ProjectFolder, ProjectTab } from "../types";

/**
 * Undo and redo for everything structural.
 *
 * Zustand state is replaced rather than mutated, so a snapshot is just holding
 * on to the previous arrays: no copying, no deep equality, a couple of pointers
 * per entry. That is why this is a stack of states rather than a log of
 * reversible actions, which would need an inverse written for every action and
 * kept correct forever after.
 *
 * Text inside a note is not in here. ProseMirror has its own history and keeps
 * the keys while an editor has focus; this only sees the debounced result, and
 * consecutive edits to the same note collapse into one entry so undo does not
 * walk back a sentence at a time.
 */

export interface Snapshot {
  tabs: ProjectTab[];
  folders: ProjectFolder[];
}

interface Entry extends Snapshot {
  /** Consecutive commits sharing a key replace each other instead of stacking. */
  coalesceKey?: string;
  at: number;
}

/** Deep enough for a long session, short enough that nothing piles up unseen. */
const LIMIT = 100;
const COALESCE_MS = 1200;

let past: Entry[] = [];
let future: Entry[] = [];
/** The state as it stood after the last commit: what an undo returns you to. */
let previous: Snapshot | null = null;

export function resetHistory(current: Snapshot) {
  past = [];
  future = [];
  previous = current;
}

export function recordCommit(next: Snapshot, coalesceKey?: string) {
  if (!previous) {
    previous = next;
    return;
  }

  const top = past[past.length - 1];
  const sameRun =
    coalesceKey !== undefined && top?.coalesceKey === coalesceKey && Date.now() - top.at < COALESCE_MS;

  if (sameRun) {
    // keep the older state: undo should land before the whole run, not inside it
    top.at = Date.now();
  } else {
    past.push({ ...previous, coalesceKey, at: Date.now() });
    if (past.length > LIMIT) past.shift();
  }

  // A fresh change is a new branch; whatever was undone is no longer reachable.
  future = [];
  previous = next;
}

export function undo(current: Snapshot): Snapshot | null {
  const entry = past.pop();
  if (!entry) return null;
  future.push({ ...current, at: Date.now() });
  previous = { tabs: entry.tabs, folders: entry.folders };
  return previous;
}

export function redo(current: Snapshot): Snapshot | null {
  const entry = future.pop();
  if (!entry) return null;
  past.push({ ...current, at: Date.now() });
  previous = { tabs: entry.tabs, folders: entry.folders };
  return previous;
}

export function canUndo(): boolean {
  return past.length > 0;
}

export function canRedo(): boolean {
  return future.length > 0;
}
