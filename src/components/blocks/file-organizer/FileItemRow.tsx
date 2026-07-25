import type { FileOrganizerItem } from "../../../types";
import { useProjectsStore } from "../../../stores/projectsStore";
import { useUiStore } from "../../../stores/uiStore";
import { pathExists, revealInFinder } from "../../../lib/fileSystem";
import { FileThumb } from "../../ui/FileThumb";

export function FileItemRow({
  blockId,
  item,
}: {
  blockId: string;
  item: FileOrganizerItem;
}) {
  const { removeFileItem, markFileMissing } = useProjectsStore();
  const showToast = useUiStore((s) => s.showToast);

  const reveal = async () => {
    const stillThere = await pathExists(item.path);
    if (!stillThere) {
      markFileMissing(blockId, item.id, true);
      showToast("Bestand niet gevonden, is het verplaatst of verwijderd?");
      return;
    }
    if (item.missing) markFileMissing(blockId, item.id, false);
    const ok = await revealInFinder(item.path);
    if (!ok) showToast("Kon dit item niet tonen in Finder");
  };

  return (
    <div
      onClick={reveal}
      className={`group flex cursor-pointer items-center gap-2 rounded-themed-sm px-1.5 py-1.5 transition-colors hover:bg-surface-raised ${
        item.missing ? "opacity-50" : ""
      }`}
      title={item.path}
    >
      <FileThumb item={item} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-tight text-ink">{item.name}</p>
        <p className="truncate text-[10.5px] text-ink-soft">
          {item.path.replace(/^\/Users\/[^/]+/, "~").split("/").slice(0, -1).join("/")}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); removeFileItem(blockId, item.id); }}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] text-ink-soft hover:text-ink group-hover:flex"
        title="Verwijderen uit lijst"
      >
        ✕
      </button>
    </div>
  );
}
