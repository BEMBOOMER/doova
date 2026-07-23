import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useProjectsStore } from "../stores/projectsStore";
import { useUiStore } from "../stores/uiStore";
import { makeFileItem, revealInFinder } from "../lib/fileSystem";
import { isTauri } from "../lib/ids";

/**
 * Tauri's drag-drop event is window-wide, not per element. This hook
 * hit-tests the cursor position against file-organizer blocks so a drop
 * lands in the block you're hovering, and highlights it while dragging.
 */
function blockAt(x: number, y: number): string | null {
  const el = document
    .elementsFromPoint(x, y)
    .find((e) => (e as HTMLElement).dataset?.blockType === "file-organizer");
  return el ? ((el as HTMLElement).dataset.blockId ?? null) : null;
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
        const blockId = blockAt(x, y);
        if (!blockId) return;
        const { addFileItem } = useProjectsStore.getState();
        const { showToast } = useUiStore.getState();
        const paths = event.payload.paths;
        for (const path of paths) {
          addFileItem(blockId, await makeFileItem(path));
        }
        if (paths.length > 0) {
          // confirm in Finder, as designed: drop = save shortcut + reveal
          await revealInFinder(paths[0]);
          showToast(
            paths.length === 1
              ? "Toegevoegd en getoond in Finder"
              : `${paths.length} items toegevoegd`,
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
