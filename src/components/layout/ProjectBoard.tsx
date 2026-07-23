import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useProjectsStore } from "../../stores/projectsStore";
import { BlockContainer } from "../blocks/BlockContainer";
import { AddBlockMenu } from "../blocks/AddBlockMenu";

export function ProjectBoard() {
  const { tabs, activeTabId, reorderBlocks } = useProjectsStore();
  const tab = tabs.find((t) => t.id === activeTabId);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) {
      reorderBlocks(String(e.active.id), String(e.over.id));
    }
  };

  if (!tab) {
    return (
      <div className="flex flex-1 items-center justify-center text-ink-soft">
        <div className="text-center">
          <p className="heading mb-1 text-lg">Geen project open</p>
          <p className="text-sm">Klik op + bovenin om een project te starten.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-start gap-4 overflow-x-auto overflow-y-hidden p-4 pt-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={tab.blocks.map((b) => b.id)} strategy={horizontalListSortingStrategy}>
          {tab.blocks.map((block) => (
            <BlockContainer key={block.id} block={block} tabId={tab.id} />
          ))}
        </SortableContext>
      </DndContext>
      <AddBlockMenu isEmpty={tab.blocks.length === 0} />
    </div>
  );
}
