import clsx from "clsx";
import type { CSSProperties, HTMLAttributes, KeyboardEventHandler, ReactNode } from "react";

export function Card({
  children,
  className,
  padding = "p-5",
  id,
  onClick,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  role,
  tabIndex,
  style,
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
  id?: string;
  onClick?: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  role?: HTMLAttributes<HTMLDivElement>["role"];
  tabIndex?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      id={id}
      className={clsx(
        "rounded-2xl border shadow-sm transition-colors",
        "backdrop-blur-sm",
        padding,
        className,
      )}
      style={{
        background: "var(--app-card)",
        borderColor: "var(--app-border)",
        ...style,
      }}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role={role}
      tabIndex={tabIndex}
    >
      {children}
    </div>
  );
}
