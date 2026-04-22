import clsx from "clsx";
import type { ReactNode } from "react";

const variants: Record<string, string> = {
  default: "bg-[var(--app-elevated)] text-[var(--app-fg)] border-[var(--app-border)]",
  brand: "border-[#2D5F4E]/30 bg-[#E8F0EC] text-[#2D5F4E]",
  ok: "border-[#2D5F4E]/25 bg-[#E8F0EC] text-[#2D5F4E]",
  warn: "border-[#C4A882]/30 bg-[#F2EBE0] text-[#8B6F47]",
  danger: "border-[#A84432]/25 bg-[#F6E3DE] text-[#A84432]",
  muted: "bg-black/5 text-[var(--app-muted)] border-[var(--app-border)]",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
