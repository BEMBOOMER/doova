import { CANVAS_PAD, type BlockSize } from "../types";
import { useUiStore } from "../stores/uiStore";

/**
 * The one place that knows where the canvas is currently looking.
 *
 * CanvasBoard registers its scroll container here so code outside the component
 * (pasting, the palette) can place something where you can actually see it,
 * rather than at the origin of a board you scrolled away from ages ago.
 */

let viewport: HTMLElement | null = null;

export function registerViewport(element: HTMLElement | null) {
  viewport = element;
}

/**
 * Screen distances are scaled; canvas coordinates are not. Everything that
 * turns one into the other divides by this, and there is exactly one of it so
 * a new caller cannot quietly forget.
 */
export function canvasScale(): number {
  return useUiStore.getState().zoom;
}

/** A point in the window, expressed in canvas coordinates. */
export function toCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
  const inner = document.getElementById("canvas-inner");
  if (!inner) return { x: 0, y: 0 };
  const rect = inner.getBoundingClientRect();
  const scale = canvasScale();
  return {
    x: Math.max(0, (clientX - rect.left) / scale),
    y: Math.max(0, (clientY - rect.top) / scale),
  };
}

/** Top-left for a block of `size` centred in the current view, in canvas coordinates. */
export function viewportCenter(size: BlockSize): { x: number; y: number } {
  if (!viewport) return { x: CANVAS_PAD, y: CANVAS_PAD };
  const scale = canvasScale();
  return {
    x: Math.max(0, (viewport.scrollLeft + viewport.clientWidth / 2) / scale - size.width / 2),
    y: Math.max(0, (viewport.scrollTop + viewport.clientHeight / 2) / scale - size.height / 2),
  };
}

/**
 * The scale and scroll that bring everything into view at once.
 *
 * Returns null when there is nothing to fit, so an empty project does not end
 * up zoomed to an infinitely small rectangle.
 */
export function fitToBlocks(
  blocks: { layout: { x: number; y: number; width: number; height: number } }[],
): { zoom: number; scrollLeft: number; scrollTop: number } | null {
  if (!viewport || blocks.length === 0) return null;
  const pad = 60;
  const minX = Math.min(...blocks.map((b) => b.layout.x)) - pad;
  const minY = Math.min(...blocks.map((b) => b.layout.y)) - pad;
  const maxX = Math.max(...blocks.map((b) => b.layout.x + b.layout.width)) + pad;
  const maxY = Math.max(...blocks.map((b) => b.layout.y + b.layout.height)) + pad;

  const zoom = Math.min(
    2,
    Math.max(0.34, Math.min(viewport.clientWidth / (maxX - minX), viewport.clientHeight / (maxY - minY))),
  );
  return {
    zoom,
    scrollLeft: Math.max(0, minX * zoom),
    scrollTop: Math.max(0, minY * zoom),
  };
}

/** Scrolls the registered viewport; used right after a zoom change. */
export function scrollViewportTo(left: number, top: number) {
  if (!viewport) return;
  viewport.scrollLeft = left;
  viewport.scrollTop = top;
}
