import { useCallback, useRef } from "react";
import Moveable from "react-moveable";
import type { Block } from "../../types";
import { useProjectsStore } from "../../stores/projectsStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { BlockContainer } from "./BlockContainer";

export function CanvasBlock({
  block,
  tabId,
  otherTargets,
  registerTarget,
}: {
  block: Block;
  tabId: string;
  otherTargets: HTMLElement[];
  registerTarget: (id: string, el: HTMLElement | null) => void;
}) {
  const { moveBlock, resizeBlock, bringToFront } = useProjectsStore();
  const snapEnabled = useSettingsStore((s) => s.snapEnabled);
  const gridSize = useSettingsStore((s) => s.gridSize);
  const selected = useUiStore((s) => s.selectedBlockId === block.id);
  const setSelectedBlockId = useUiStore((s) => s.setSelectedBlockId);
  const setInteracting = useUiStore((s) => s.setInteracting);

  const targetRef = useRef<HTMLDivElement>(null);

  // stable ref: an inline arrow would re-run on every render (detach/attach)
  // and registerTarget's re-render bump would then loop forever
  const setTarget = useCallback(
    (el: HTMLDivElement | null) => {
      (targetRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      registerTarget(block.id, el);
    },
    [block.id, registerTarget],
  );

  return (
    <>
      <div
        ref={setTarget}
        className="canvas-block panel absolute flex flex-col"
        style={{
          left: block.layout.x,
          top: block.layout.y,
          width: block.layout.width,
          height: block.layout.height,
          zIndex: block.layout.z,
        }}
        data-block-id={block.id}
        data-block-type={block.type}
        onPointerDownCapture={() => {
          bringToFront(block.id);
          setSelectedBlockId(block.id);
        }}
      >
        <BlockContainer block={block} tabId={tabId} />
      </div>
      <Moveable
        target={targetRef}
        origin={false}
        useResizeObserver
        draggable
        throttleDrag={0}
        resizable={selected}
        renderDirections={selected ? ["nw", "ne", "sw", "se", "n", "s", "e", "w"] : []}
        hideDefaultLines={!selected}
        snappable={snapEnabled}
        snapThreshold={Math.max(4, gridSize)}
        elementGuidelines={snapEnabled ? otherTargets : []}
        snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
        elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
        isDisplaySnapDigit={false}
        onDragStart={(e) => {
          // drag from the header or any empty spot; never hijack text, rows,
          // or buttons (React's stopPropagation is too late for Moveable's
          // native listener, so buttons must be excluded here explicitly)
          const src = e.inputEvent?.target as HTMLElement | null;
          const interactive = src?.closest(
            ".ProseMirror, input, button, textarea, select, [contenteditable], .group",
          );
          if (interactive || !src?.closest(".canvas-block")) {
            e.stopDrag();
            return;
          }
          setInteracting(true);
        }}
        onDrag={(e) => {
          e.target.style.left = `${Math.max(0, e.left)}px`;
          e.target.style.top = `${Math.max(0, e.top)}px`;
        }}
        onDragEnd={(e) => {
          setInteracting(false);
          if (e.lastEvent) {
            moveBlock(block.id, Math.max(0, e.lastEvent.left), Math.max(0, e.lastEvent.top));
          }
        }}
        onResizeStart={() => setInteracting(true)}
        onResize={(e) => {
          e.target.style.width = `${e.width}px`;
          e.target.style.height = `${e.height}px`;
          e.target.style.left = `${Math.max(0, e.drag.left)}px`;
          e.target.style.top = `${Math.max(0, e.drag.top)}px`;
        }}
        onResizeEnd={(e) => {
          setInteracting(false);
          if (e.lastEvent) {
            resizeBlock(block.id, {
              x: Math.max(0, e.lastEvent.drag.left),
              y: Math.max(0, e.lastEvent.drag.top),
              width: e.lastEvent.width,
              height: e.lastEvent.height,
            });
          }
        }}
      />
    </>
  );
}
