import { open } from "@tauri-apps/plugin-dialog";
import type { FileOrganizerBlockData } from "../../../types";
import { useProjectsStore } from "../../../stores/projectsStore";
import { makeFileItem } from "../../../lib/fileSystem";
import { FileItemRow } from "./FileItemRow";

export function FileOrganizerBlock({ block }: { block: FileOrganizerBlockData }) {
  const addFileItem = useProjectsStore((s) => s.addFileItem);

  const pickFiles = async () => {
    const picked = await open({ multiple: true, directory: false });
    for (const path of picked ?? []) {
      addFileItem(block.id, await makeFileItem(path));
    }
  };

  const pickFolder = async () => {
    const picked = await open({ multiple: true, directory: true });
    for (const path of picked ?? []) {
      addFileItem(block.id, await makeFileItem(path));
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      {block.items.length === 0 ? (
        <div className="rounded-themed-sm border-2 border-dashed border-border-themed/40 px-3 py-6 text-center">
          <p className="text-[13px] text-ink-soft">Sleep bestanden of mappen hierheen</p>
          <p className="mt-0.5 text-[11px] text-ink-soft opacity-70">Klik = tonen in Finder</p>
        </div>
      ) : (
        block.items.map((item) => (
          <FileItemRow key={item.id} blockId={block.id} item={item} />
        ))
      )}
      <div className="mt-1 flex gap-1.5">
        <button
          onClick={pickFiles}
          className="flex-1 rounded-themed-sm bg-surface-raised px-2 py-1 text-[11.5px] text-ink-soft transition-colors hover:bg-accent hover:text-accent-ink"
        >
          + Bestand
        </button>
        <button
          onClick={pickFolder}
          className="flex-1 rounded-themed-sm bg-surface-raised px-2 py-1 text-[11.5px] text-ink-soft transition-colors hover:bg-accent hover:text-accent-ink"
        >
          + Map
        </button>
      </div>
    </div>
  );
}
