import { Loader2 } from "lucide-react";

export function PageLoading({ label = "Loading workspace…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 py-16"
      style={{ color: "var(--app-muted)" }}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#2D5F4E" }} aria-hidden />
      <p className="text-sm font-medium" style={{ color: "var(--app-fg)" }}>
        {label}
      </p>
    </div>
  );
}
