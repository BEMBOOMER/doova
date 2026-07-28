import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useProjectsStore } from "../stores/projectsStore";
import { useUiStore } from "../stores/uiStore";
import { makeFileItem, revealInFinder } from "../lib/fileSystem";
import { importImagePaths, isImagePath } from "../lib/moodboard";
import { planDrop } from "../lib/dropTarget";
import { toCanvasPoint } from "../lib/canvasView";
import { isTauri } from "../lib/ids";

/**
 * Tauri's drag-drop event is window-wide, not per element, so this hook
 * hit-tests the cursor against the canvas blocks and hands the decision to
 * planDrop: whatever block you drop on keeps its content and takes the files.
 */
/**
 * Geometric hit-test instead of elementsFromPoint: Moveable's overlays and
 * pointer-events rules made the point lookup miss the block underneath, which
 * is why drops kept spawning a new block instead of filling the hovered one.
 * Topmost (highest z-index) wins when blocks overlap.
 */
function blockAt(x: number, y: number): string | null {
  const candidates = [...document.querySelectorAll<HTMLElement>("[data-block-id]")]
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
    .sort(
      (a, b) =>
        (Number(getComputedStyle(a.el).zIndex) || 0) - (Number(getComputedStyle(b.el).zIndex) || 0),
    );
  return candidates.length > 0 ? (candidates[candidates.length - 1].el.dataset.blockId ?? null) : null;
}

export function useFileDrop() {
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWebview().onDragDropEvent(async (event) => {
      const { type } = event.payload;
      if (type === "over") {
        // macOS wry reports drag positions in AppKit points (= CSS pixels)
        // even though the type says PhysicalPosition — do NOT divide by DPR.
        const { x, y } = event.payload.position;
        setHoverBlockId(blockAt(x, y));
      } else if (type === "drop") {
        const { x, y } = event.payload.position;
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
        const plan = planDrop(block, items);

        if (plan.action === "moodboard") {
          const images = await importImagePaths(plan.paths);
          if (images.length === 0) {
            showToast(
              plan.paths.some(isImagePath)
                ? "Deze afbeelding kon niet worden toegevoegd"
                : "Een moodboard neemt alleen afbeeldingen",
            );
            return;
          }
          store.addMoodboardImages(plan.blockId, images);
          showToast(
            images.length === 1 ? "Beeld toegevoegd" : `${images.length} beelden toegevoegd`,
          );
        } else if (plan.action === "append") {
          store.addFilesToBlock(plan.blockId, plan.items);
          notify(plan.items.length, paths[0]);
        } else {
          // empty canvas (or a calendar): fresh block at the drop point
          const at = toCanvasPoint(x, y);
          const newId = store.addBlock(at);
          store.promoteBlockToFileOrganizer(newId, plan.items);
          notify(plan.items.length, paths[0]);
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
