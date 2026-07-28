import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MoodboardBlockData, MoodboardImage } from "../../../types";
import { useProjectsStore } from "../../../stores/projectsStore";
import { imageUrl } from "../../../lib/moodboard";

/** Resolves asset URLs for the whole board in one pass, so a re-render does not
 *  restart every image request. */
function useImageUrls(images: MoodboardImage[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const files = useMemo(() => images.map((i) => i.file).join("|"), [images]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = new Map<string, string>();
      for (const file of files ? files.split("|") : []) {
        const url = await imageUrl(file);
        if (url) next.set(file, url);
      }
      if (!cancelled) setUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [files]);

  return urls;
}

function Tile({
  image,
  url,
  onRemove,
  onOpen,
}: {
  image: MoodboardImage;
  url: string | undefined;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const ratio = image.width && image.height ? image.width / image.height : undefined;
  return (
    <div className="group relative mb-2 break-inside-avoid">
      {url ? (
        <img
          src={url}
          alt={image.name}
          title={image.name}
          onClick={onOpen}
          style={ratio ? { aspectRatio: String(ratio) } : undefined}
          className="w-full cursor-zoom-in rounded-themed-sm object-cover"
        />
      ) : (
        // The file is gone from the images folder; say so instead of a blank gap
        <div
          style={ratio ? { aspectRatio: String(ratio) } : { height: 80 }}
          className="flex w-full items-center justify-center rounded-themed-sm bg-surface-raised text-[11px] text-ink-soft"
        >
          Beeld ontbreekt
        </div>
      )}
      <button
        onClick={onRemove}
        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/55 text-[10px] text-white group-hover:flex"
        title="Uit moodboard halen"
      >
        ✕
      </button>
    </div>
  );
}

export function MoodboardBlock({ block }: { block: MoodboardBlockData }) {
  const removeMoodboardImage = useProjectsStore((s) => s.removeMoodboardImage);
  const urls = useImageUrls(block.images);
  const [lightbox, setLightbox] = useState<MoodboardImage | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  if (block.images.length === 0) {
    return (
      <div
        ref={rootRef}
        className="flex h-full min-h-24 flex-col items-center justify-center gap-1 rounded-themed-sm border border-dashed border-border-themed/50 p-4 text-center"
      >
        <span className="text-[12.5px] text-ink">Sleep afbeeldingen hierin</span>
        <span className="text-[11px] leading-snug text-ink-soft">
          of plak er een met {navigator.platform.includes("Mac") ? "cmd" : "ctrl"}+V
        </span>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <div className="columns-2 gap-2 [column-fill:balance]">
        {block.images.map((image) => (
          <Tile
            key={image.id}
            image={image}
            url={urls.get(image.file)}
            onRemove={() => removeMoodboardImage(block.id, image.id)}
            onOpen={() => setLightbox(image)}
          />
        ))}
      </div>

      {lightbox &&
        urls.get(lightbox.file) &&
        createPortal(
          <div
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/75 p-8"
          >
            <img
              src={urls.get(lightbox.file)}
              alt={lightbox.name}
              className="max-h-full max-w-full rounded-themed-sm object-contain"
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
