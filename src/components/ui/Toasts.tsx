import { useUiStore } from "../../stores/uiStore";

export function Toasts() {
  const { toasts, dismissToast } = useUiStore();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="panel toast-in pointer-events-auto flex items-center gap-3 px-3.5 py-2"
        >
          <span className="text-[12.5px]">{toast.message}</span>
          {toast.actionLabel && (
            <button
              onClick={() => { toast.onAction?.(); dismissToast(toast.id); }}
              className="heading rounded-themed-sm bg-accent px-2 py-0.5 text-[11.5px] text-accent-ink"
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
