import { useEffect, useState } from "react";
import type { LinkBlockData } from "../../../types";
import { useProjectsStore, hostOf } from "../../../stores/projectsStore";
import { useUiStore } from "../../../stores/uiStore";
import { faviconUrl, fetchLinkMetadata, openLink } from "../../../lib/links";

/**
 * A pasted link. It exists the instant you paste, showing its hostname; the
 * title and icon arrive later or, offline, never. Nothing here waits on the
 * network, so the block is never a spinner you have to sit through.
 */
export function LinkBlock({ block }: { block: LinkBlockData }) {
  const setLinkMeta = useProjectsStore((s) => s.setLinkMeta);
  const showToast = useUiStore((s) => s.showToast);
  const [icon, setIcon] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const host = hostOf(block.url);
  const alreadyFetched = !!block.fetchedAt;

  const load = () => {
    if (fetching) return;
    setFetching(true);
    void fetchLinkMetadata(block.url)
      .then((meta) => {
        if (meta) setLinkMeta(block.id, meta);
      })
      .finally(() => setFetching(false));
  };

  // One attempt per block, on first sight. A failed attempt still stamps
  // fetchedAt, so a site that is down does not get retried on every render.
  useEffect(() => {
    if (alreadyFetched) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  useEffect(() => {
    let cancelled = false;
    if (!block.favicon) {
      setIcon(null);
      return;
    }
    void faviconUrl(block.favicon).then((url) => {
      if (!cancelled) setIcon(url);
    });
    return () => {
      cancelled = true;
    };
  }, [block.favicon]);

  return (
    <div className="flex h-full flex-col gap-2">
      <button
        onClick={() => void openLink(block.url).catch(() => showToast("Kon deze link niet openen"))}
        className="group flex min-w-0 items-center gap-2.5 rounded-themed-sm p-1.5 text-left transition-colors hover:bg-surface-raised"
        title={`${block.url}\nKlik om te openen`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[7px] bg-surface-raised">
          {icon ? (
            <img src={icon} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="heading text-[11px] text-ink-soft">{host.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
            {block.linkTitle || host}
          </span>
          <span className="block truncate text-[11px] leading-tight text-ink-soft">{block.url}</span>
        </span>
      </button>

      {alreadyFetched && !block.linkTitle && (
        <button
          onClick={load}
          disabled={fetching}
          className="self-start rounded-themed-sm px-1.5 text-[11px] text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
        >
          {fetching ? "Bezig…" : "Titel opnieuw ophalen"}
        </button>
      )}
    </div>
  );
}
