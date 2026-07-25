import { useState, type ReactNode } from "react";
import type { FileOrganizerItem } from "../../types";
import { iconFor, imageSrc, isImage } from "../../lib/fileSystem";

/**
 * Small square thumbnail for a file row: real image preview when the item is
 * an image the webview can decode, emoji icon otherwise (or when loading fails,
 * e.g. HEIC on older macOS).
 */
export function FileThumb({ item, size = 30 }: { item: FileOrganizerItem; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = !failed && !item.missing && isImage(item) ? imageSrc(item.path) : null;

  if (!src) {
    return <span className="shrink-0 text-[15px]">{item.missing ? "⚠️" : iconFor(item)}</span>;
  }
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[7px] border border-border-themed/40 object-cover"
    />
  );
}

/**
 * Attachment renderer used by note blocks: images become a full-width preview
 * card, everything else (or an image that fails to decode, e.g. HEIC on older
 * macOS) falls back to the compact file row the caller provides.
 */
export function ImageOrRow({
  item,
  onOpen,
  onRemove,
  row,
}: {
  item: FileOrganizerItem;
  onOpen: () => void;
  onRemove: () => void;
  row: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const src = !failed && !item.missing && isImage(item) ? imageSrc(item.path) : null;
  if (!src) return <>{row}</>;

  return (
    <div className="group relative mt-1.5" title={`${item.path}\nKlik om te tonen in Finder`}>
      <img
        src={src}
        alt={item.name}
        draggable={false}
        onError={() => setFailed(true)}
        onClick={onOpen}
        className="max-h-44 w-full cursor-pointer rounded-themed-sm border border-border-themed/40 object-cover"
      />
      <span className="pointer-events-none absolute bottom-1 left-1.5 max-w-[80%] truncate rounded-[6px] bg-black/45 px-1.5 py-0.5 text-[10.5px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        {item.name}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/45 text-[10px] text-white group-hover:flex"
        title="Bijlage verwijderen"
      >
        ✕
      </button>
    </div>
  );
}
