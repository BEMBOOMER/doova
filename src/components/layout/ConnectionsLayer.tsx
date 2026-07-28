import { useEffect, useRef } from "react";
import type { Block, Connection } from "../../types";
import { useProjectsStore } from "../../stores/projectsStore";
import { useUiStore } from "../../stores/uiStore";

/**
 * Draws the lines between blocks, and keeps them attached while you drag.
 *
 * The hard part is that a drag never touches the store: both react-moveable and
 * the group pill write straight to element styles and commit once on release,
 * which is what keeps dragging smooth. So while anything is being moved this
 * reads the blocks' actual rectangles from the DOM each frame and rewrites the
 * paths by hand. No React renders per frame, and it does not care which of the
 * two drag mechanisms is running, because it watches the result rather than
 * listening for events.
 */

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Leaves each block from whichever side faces the other one, so a line reads as
 * joining two things rather than crossing them.
 */
function anchors(a: Rect, b: Rect): { x1: number; y1: number; x2: number; y2: number } {
  const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      x1: dx > 0 ? a.x + a.width : a.x,
      y1: ac.y,
      x2: dx > 0 ? b.x : b.x + b.width,
      y2: bc.y,
    };
  }
  return {
    x1: ac.x,
    y1: dy > 0 ? a.y + a.height : a.y,
    x2: bc.x,
    y2: dy > 0 ? b.y : b.y + b.height,
  };
}

/** A cubic bowing out along the dominant axis: readable where lines cross. */
export function curveBetween(a: Rect, b: Rect): string {
  const { x1, y1, x2, y2 } = anchors(a, b);
  const horizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
  const bend = Math.min(120, Math.max(40, Math.hypot(x2 - x1, y2 - y1) / 2));
  const [c1x, c1y] = horizontal ? [x1 + Math.sign(x2 - x1) * bend, y1] : [x1, y1 + Math.sign(y2 - y1) * bend];
  const [c2x, c2y] = horizontal ? [x2 - Math.sign(x2 - x1) * bend, y2] : [x2, y2 - Math.sign(y2 - y1) * bend];
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

function rectOf(block: Block): Rect {
  return { x: block.layout.x, y: block.layout.y, ...{ width: block.layout.width, height: block.layout.height } };
}

export function ConnectionsLayer({
  connections,
  blocks,
  width,
  height,
}: {
  connections: Connection[];
  blocks: Block[];
  width: number;
  height: number;
}) {
  const interacting = useUiStore((s) => s.interacting);
  const selectedConnectionId = useUiStore((s) => s.selectedConnectionId);
  const setSelectedConnectionId = useUiStore((s) => s.setSelectedConnectionId);
  const removeConnection = useProjectsStore((s) => s.removeConnection);
  const svgRef = useRef<SVGSVGElement>(null);

  const byId = new Map(blocks.map((b) => [b.id, b]));
  const drawable = connections.filter((c) => byId.has(c.fromBlockId) && byId.has(c.toBlockId));

  // While a drag is running the store still holds the old positions, so the
  // paths are rewritten from where the elements actually are.
  useEffect(() => {
    if (!interacting) return;
    let frame = 0;
    const svg = svgRef.current;
    if (!svg) return;
    const inner = svg.parentElement;
    if (!inner) return;

    const tick = () => {
      const origin = inner.getBoundingClientRect();
      const live = (id: string): Rect | null => {
        const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height };
      };
      for (const connection of drawable) {
        const from = live(connection.fromBlockId);
        const to = live(connection.toBlockId);
        if (!from || !to) continue;
        const d = curveBetween(from, to);
        // both the visible line and its wider hit area carry the same attribute
        svg
          .querySelectorAll<SVGPathElement>(`[data-connection="${connection.id}"]`)
          .forEach((path) => path.setAttribute("d", d));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [interacting, drawable]);

  useEffect(() => {
    if (!selectedConnectionId) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable === true;
      if (typing) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        removeConnection(selectedConnectionId);
        setSelectedConnectionId(null);
      }
      if (e.key === "Escape") setSelectedConnectionId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedConnectionId, removeConnection, setSelectedConnectionId]);

  if (drawable.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      // under the blocks, and transparent to the pointer except on the lines
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: 0 }}
    >
      {drawable.map((connection) => {
        const d = curveBetween(rectOf(byId.get(connection.fromBlockId)!), rectOf(byId.get(connection.toBlockId)!));
        const selected = connection.id === selectedConnectionId;
        return (
          <g key={connection.id}>
            {/* a fat invisible copy: a 2px line is far too thin to click */}
            <path
              d={d}
              data-connection={connection.id}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              className="pointer-events-auto cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelectedConnectionId(connection.id);
              }}
            />
            <path
              d={d}
              data-connection={connection.id}
              fill="none"
              stroke={selected ? "var(--color-accent)" : connection.color || "var(--ink-soft)"}
              strokeWidth={selected ? 2.5 : 1.75}
              strokeLinecap="round"
              opacity={selected ? 1 : 0.55}
              className="pointer-events-none"
            />
          </g>
        );
      })}
    </svg>
  );
}
