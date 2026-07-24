import { useCallback, useRef, useState } from "react";
import { useProjectsStore } from "../../stores/projectsStore";
import { useUiStore } from "../../stores/uiStore";
import { CanvasBlock } from "../blocks/CanvasBlock";

/** Extra room around the outermost blocks so drop shadows never hit the clip edge. */
const CANVAS_MARGIN = 400;

export function CanvasBoard() {
  const { tabs, activeTabId, addBlock } = useProjectsStore();
  const setSelectedBlockId = useUiStore((s) => s.setSelectedBlockId);
  const tab = tabs.find((t) => t.id === activeTabId);

  const targetsRef = useRef(new Map<string, HTMLElement>());
  const [, bump] = useState(0);
  const registerTarget = useCallback((id: string, el: HTMLElement | null) => {
    const map = targetsRef.current;
    if (el) {
      if (map.get(id) !== el) {
        map.set(id, el);
        bump((n) => n + 1); // other blocks need the fresh element for snap guidelines
      }
    } else if (map.delete(id)) {
      bump((n) => n + 1);
    }
  }, []);

  if (!tab) {
    return (
      <div className="flex flex-1 items-center justify-center text-ink-soft">
        <div className="text-center">
          <p className="heading mb-1 text-lg">Geen project open</p>
          <p className="text-sm">Maak een project aan in de zijbalk.</p>
        </div>
      </div>
    );
  }

  const width =
    Math.max(0, ...tab.blocks.map((b) => b.layout.x + b.layout.width)) + CANVAS_MARGIN;
  const height =
    Math.max(0, ...tab.blocks.map((b) => b.layout.y + b.layout.height)) + CANVAS_MARGIN;

  const onCanvasDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    addBlock({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div className="canvas-viewport relative flex-1 overflow-auto">
      <div
        id="canvas-inner"
        className="relative"
        style={{ width, height, minWidth: "100%", minHeight: "100%" }}
        onDoubleClick={onCanvasDoubleClick}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSelectedBlockId(null);
        }}
      >
        {tab.blocks.map((block) => (
          <CanvasBlock
            key={block.id}
            block={block}
            tabId={tab.id}
            otherTargets={[...targetsRef.current.entries()]
              .filter(([id]) => id !== block.id)
              .map(([, el]) => el)}
            registerTarget={registerTarget}
          />
        ))}
        {tab.blocks.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-ink-soft">
            <div className="text-center">
              <p className="heading mb-1 text-[15px]">Leeg project</p>
              <p className="text-[13px]">Dubbelklik ergens, of klik op + rechtsonder.</p>
            </div>
          </div>
        )}
      </div>
      <button
        onClick={() => addBlock()}
        className="panel fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full text-2xl text-ink-soft transition-transform hover:scale-105 hover:text-ink"
        title="Nieuw blok (dubbelklik op canvas kan ook)"
      >
        +
      </button>
    </div>
  );
}
