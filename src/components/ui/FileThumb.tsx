import { useState, type ReactNode } from "react";
import type { FileOrganizerItem } from "../../types";
import { imageSrc, isImage } from "../../lib/fileSystem";

/** Colored file-type chip like the promo video: pink PDF, purple JPG, blue SVG… */
const BADGE_COLORS: Record<string, { bg: string; fg?: string }> = {
  pdf: { bg: "#FF4F81" },
  png: { bg: "#A855F7" }, jpg: { bg: "#A855F7" }, jpeg: { bg: "#A855F7" },
  gif: { bg: "#A855F7" }, webp: { bg: "#A855F7" }, heic: { bg: "#A855F7" },
  heif: { bg: "#A855F7" }, avif: { bg: "#A855F7" }, bmp: { bg: "#A855F7" },
  tiff: { bg: "#A855F7" }, tif: { bg: "#A855F7" },
  svg: { bg: "#58C4F6", fg: "#123" },
  mp4: { bg: "#FF6B35" }, mov: { bg: "#FF6B35" }, avi: { bg: "#FF6B35" },
  mkv: { bg: "#FF6B35" }, webm: { bg: "#FF6B35" },
  mp3: { bg: "#FFD600", fg: "#1a1a1a" }, wav: { bg: "#FFD600", fg: "#1a1a1a" },
  aiff: { bg: "#FFD600", fg: "#1a1a1a" }, flac: { bg: "#FFD600", fg: "#1a1a1a" },
  m4a: { bg: "#FFD600", fg: "#1a1a1a" },
  doc: { bg: "#4361EE" }, docx: { bg: "#4361EE" }, txt: { bg: "#4361EE" },
  md: { bg: "#4361EE" }, rtf: { bg: "#4361EE" }, pages: { bg: "#4361EE" },
  xls: { bg: "#06D6A0", fg: "#123" }, xlsx: { bg: "#06D6A0", fg: "#123" },
  csv: { bg: "#06D6A0", fg: "#123" }, numbers: { bg: "#06D6A0", fg: "#123" },
  ppt: { bg: "#FF6B35" }, pptx: { bg: "#FF6B35" }, key: { bg: "#FF6B35" },
  zip: { bg: "#8E8E93" }, rar: { bg: "#8E8E93" }, "7z": { bg: "#8E8E93" }, dmg: { bg: "#8E8E93" },
  psd: { bg: "#EC4899" }, ai: { bg: "#EC4899" }, fig: { bg: "#EC4899" },
  sketch: { bg: "#EC4899" }, afdesign: { bg: "#EC4899" },
  drp: { bg: "#EC4899" }, prproj: { bg: "#EC4899" }, aep: { bg: "#EC4899" },
};

/** Rounded colored chip with the uppercase extension, folder chip for folders. */
export function FileBadge({ item, size = 28 }: { item: FileOrganizerItem; size?: number }) {
  if (item.missing) {
    return (
      <span
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-[8px] bg-black/20 text-[13px]"
      >
        ⚠️
      </span>
    );
  }
  const isFolder = item.kind === "folder";
  const ext = item.ext ?? "";
  const color = isFolder ? { bg: "#4361EE" } : (BADGE_COLORS[ext] ?? { bg: "#64748B" });
  const label = isFolder ? "MAP" : (ext || "?").toUpperCase().slice(0, 4);
  return (
    <span
      style={{ width: size, height: size, background: color.bg, color: color.fg ?? "#fff" }}
      className="file-badge flex shrink-0 items-center justify-center rounded-[8px] text-[8.5px] font-bold tracking-tight"
    >
      {label}
    </span>
  );
}

/**
 * Small square thumbnail for a file row: real image preview when the item is
 * an image the webview can decode, colored type chip otherwise (or when
 * loading fails, e.g. HEIC on older macOS).
 */
export function FileThumb({ item, size = 30 }: { item: FileOrganizerItem; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = !failed && !item.missing && isImage(item) ? imageSrc(item.path) : null;

  if (!src) {
    return <FileBadge item={item} size={size} />;
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
