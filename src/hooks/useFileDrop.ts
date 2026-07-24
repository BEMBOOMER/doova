import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { JSONContent } from "@tiptap/react";
import { useProjectsStore } from "../stores/projectsStore";
import { useUiStore } from "../stores/uiStore";
import { makeFileItem, revealInFinder } from "../lib/fileSystem";
import { isTauri } from "../lib/ids";

/**
 * Tauri's drag-drop event is window-wide, not per element. This hook
 * hit-tests the cursor position against canvas blocks. Universal-block rules:
 * drop on a file-organizer appends; drop on an EMPTY note promotes it to a
 * file-organizer; drop on a filled note or empty canvas creates a new block.
 */
function blockAt(x: number, y: number): string | null {
  const el = document
    .elementsFromPoint(x, y)
    .find((e) => (e as HTMLElement).dataset?.blockId);
  return el ? ((el as HTMLElement).dataset.blockId ?? null) : null;
}

function isNoteEmpty(content: JSONContent | null): boolean {
  if (!content) return true;
  return !JSON.stringify(content).includes('"text"');
}

export function useFileDrop() {
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWebview().onDragDropEvent(async (event) => {
      const { type } = event.payload;
      if (type === "over") {
        const { x, y } = event.payload.position.toLogical(window.devicePixelRatio);
        setHoverBlockId(blockAt(x, y));
      } else if (type === "drop") {
        const { x, y } = event.payload.position.toLogical(window.devicePixelRatio);
        setHoverBlockId(null);
        const paths = event.payload.paths;
        if (paths.length === 0) return;

        const store = useProjectsStore.getState();
        const { showToast } = useUiStore.getState();
        const tab = store.tabs.find((t) => t.id === store.activeTabId);
        if (!tab) return;

        const items = await Promise.all(paths.map((p) => makeFileItem(p)));
        const blockId = blockAt(x, y);
        const block = tab.blocks.find((b) => b.id === blockId);

        if (block?.type === "file-organizer") {
          const fresh = items.filter((it) => !block.items.some((ex) => ex.path === it.path));
          fresh.forEach((it) => store.addFileItem(block.id, it));
          notify(fresh.length, paths[0]);
        } else if (block?.type === "note" && isNoteEmpty(block.content)) {
          store.promoteBlockToFileOrganizer(block.id, items);
          notify(items.length, paths[0]);
        } else {
          // filled note, calendar, or empty canvas: new file block at the drop point
          const canvas = document.getElementById("canvas-inner");
          const rect = canvas?.getBoundingClientRect();
          const at = rect ? { x: Math.max(0, x - rect.left), y: Math.max(0, y - rect.top) } : undefined;
          const newId = store.addBlock(at);
          store.promoteBlockToFileOrganizer(newId, items);
          notify(items.length, paths[0]);
        }

        async function notify(added: number, firstPath: string) {
          await revealInFinder(firstPath);
          showToast(
            added === 0
              ? "Stond er al in"
              : added === 1
                ? "Toegevoegd en getoond in Finder"
                : `${added} items toegevoegd`,
          );
        }
      } else {
        setHoverBlockId(null);
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return hoverBlockId;
}
