import { X } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";

export function SlideOver({
  open,
  title,
  subtitle,
  onClose,
  children,
  widthClassName = "max-w-md",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 z-[210] flex h-full w-full ${widthClassName} flex-col border-l shadow-2xl transition-transform duration-200 ease-out`}
        style={{
          background: "var(--app-card)",
          borderColor: "var(--app-border)",
        }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--app-border)" }}>
          <div>
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: "var(--app-fg)" }}>
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm" style={{ color: "var(--app-muted)" }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-black/5"
            aria-label="Close"
          >
            <X className="h-5 w-5" style={{ color: "var(--app-muted)" }} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin px-5 py-4">{children}</div>
      </aside>
    </>
  );
}
