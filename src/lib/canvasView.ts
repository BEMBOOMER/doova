import { CANVAS_PAD, type BlockSize } from "../types";

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

/** Top-left for a block of `size` centred in the current view, in canvas coordinates. */
export function viewportCenter(size: BlockSize): { x: number; y: number } {
  if (!viewport) return { x: CANVAS_PAD, y: CANVAS_PAD };
  return {
    x: Math.max(0, viewport.scrollLeft + viewport.clientWidth / 2 - size.width / 2),
    y: Math.max(0, viewport.scrollTop + viewport.clientHeight / 2 - size.height / 2),
  };
}
