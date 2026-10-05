import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PROVENANCE, toneVars, type Provenance, type StatusView, type Tone } from "./status";

/* FleetOS UI kit — the only place button / badge / drawer / field styles are defined. */

/* ─── Buttons ─── */

type Variant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<Variant, string> = {
  primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] border border-transparent",
  secondary: "bg-[var(--surface)] text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
  ghost: "bg-transparent text-[var(--text-2)] border border-transparent hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]",
  danger: "bg-[var(--surface)] text-[var(--danger)] border border-[var(--border-strong)] hover:bg-[var(--danger-soft)]",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--r-md)] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
        BTN[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={clsx(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-md)] text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ─── Status / provenance ─── */

export function StatusBadge({ status, className }: { status: StatusView; className?: string }) {
  const v = toneVars(status.tone);
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium", className)} style={{ color: v.fg }}>
      <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: v.fg }} />
      {status.label}
    </span>
  );
}

/** Small tinted label — counts, categories, inline flags. */
export function Pill({ tone = "neutral", children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  const v = toneVars(tone);
  return (
    <span title={title} className={clsx("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[var(--r-sm)] px-1.5 text-[11px] font-medium", className)} style={{ color: v.fg, background: v.bg }}>
      {children}
    </span>
  );
}

/** Where a value comes from (manual / demo / unknown / assumed / stale) — never styled as an alarm. */
export function ProvenanceTag({ kind, detail, className }: { kind: Provenance; detail?: string; className?: string }) {
  const p = PROVENANCE[kind];
  const demo = kind === "DEMO";
  return (
    <span
      title={p.title}
      className={clsx("inline-flex h-[18px] items-center whitespace-nowrap rounded-[var(--r-sm)] border px-1.5 text-[10.5px] font-medium tracking-[0.02em]", className)}
      style={demo ? { color: "var(--prov-demo)", background: "var(--prov-demo-soft)", borderColor: "transparent" } : { color: "var(--text-3)", borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {p.label}
      {detail ? <span className="ml-1 font-normal">· {detail}</span> : null}
    </span>
  );
}

/* ─── Layout ─── */

export function PageHeader({ title, meta, actions, children }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-6 pt-4">
      <div className="flex min-h-8 items-center justify-between gap-4 pb-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-[18px] font-semibold tracking-[-0.01em] text-[var(--text)]">{title}</h1>
          {meta ? <span className="num truncate text-[13px] text-[var(--text-3)]">{meta}</span> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

/** Underline tabs (page-level navigation within an entity / section). */
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={clsx("-mb-px flex gap-5", className)}>
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(it.value)}
            className={clsx(
              "flex h-9 items-center gap-1.5 border-b-2 text-[13px] font-medium transition-colors duration-150",
              on ? "border-[var(--accent)] text-[var(--text)]" : "border-transparent text-[var(--text-3)] hover:text-[var(--text)]",
            )}
          >
            {it.label}
            {it.count !== undefined ? <span className="num text-[12px] font-normal text-[var(--text-3)]">{it.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Segmented control (view switches such as Lista | Quadro). */
export function Segmented<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; icon?: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 items-center rounded-[var(--r-md)] bg-[var(--surface-sunken)] p-0.5">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(it.value)}
            className={clsx(
              "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors duration-150",
              on ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)]" : "text-[var(--text-2)] hover:text-[var(--text)]",
            )}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Section heading inside a panel/page (small caps label + optional action). */
export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-center justify-between gap-2", className)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">{children}</h2>
      {action}
    </div>
  );
}

/** Label / value rows. */
export function DataList({ rows, className }: { rows: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={clsx("grid grid-cols-[minmax(120px,max-content)_1fr] gap-x-6 gap-y-1.5 text-[13px]", className)}>
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-[var(--text-3)]">{r.label}</dt>
          <dd className="num min-w-0 text-[var(--text)]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ title, detail, action, className }: { title: string; detail?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-1 px-6 py-12 text-center", className)}>
      <p className="text-[13px] font-medium text-[var(--text)]">{title}</p>
      {detail ? <p className="max-w-sm text-[12px] text-[var(--text-3)]">{detail}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function SkeletonRows({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx("space-y-0", className)} aria-busy="true" aria-label="A carregar">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[var(--row-h)] items-center gap-4 border-b border-[var(--border)] px-4">
          <div className="ui-skeleton h-3 w-20" />
          <div className="ui-skeleton h-3 w-40" />
          <div className="ui-skeleton h-3 w-24" />
          <div className="ui-skeleton ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Inline error: what happened + what the user can do. */
export function Notice({ tone = "danger", title, children, action, className }: { tone?: Tone; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  const v = toneVars(tone);
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={clsx("flex items-start gap-3 rounded-[var(--r-md)] border-l-[3px] px-3 py-2", className)} style={{ borderColor: v.fg, background: v.bg }}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium" style={{ color: v.fg }}>{title}</p>
        {children ? <div className="mt-0.5 text-[12px] text-[var(--text-2)]">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

/* ─── Forms ─── */

export function Field({ label, help, error, unit, children, className }: { label: string; help?: ReactNode; error?: string; unit?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block min-w-0", className)}>
      <span className="mb-1 block text-[12px] font-medium text-[var(--text-2)]">
        {label}
        {unit ? <span className="ml-1 font-normal text-[var(--text-3)]">({unit})</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-[11.5px] text-[var(--danger)]">{error}</span> : help ? <span className="mt-1 block text-[11.5px] text-[var(--text-3)]">{help}</span> : null}
    </label>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-[var(--text)]">
      <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/* ─── Overlays ─── */

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

/** Right-side drawer: inspect / edit without losing the workspace. */
export function Drawer({
  open = true,
  title,
  subtitle,
  onClose,
  width = 560,
  headerActions,
  footer,
  children,
}: {
  open?: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  width?: number;
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEscape(onClose);
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-[var(--overlay)] [animation:ui-fade-in_150ms_var(--ease)]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="absolute inset-y-0 right-0 flex max-w-full flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] outline-none [animation:ui-slide-in_180ms_var(--ease)]"
        style={{ width }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="min-w-0">
            <h2 id={id} className="truncate text-[15px] font-semibold text-[var(--text)]">{title}</h2>
            {subtitle ? <div className="mt-0.5 text-[12px] text-[var(--text-3)]">{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <IconButton label="Fechar" onClick={onClose}><X className="h-4 w-4" /></IconButton>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">{children}</div>
        {footer ? <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-2.5">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** Small focused action (confirmations, single input). */
export function Modal({ title, onClose, children, footer, width = 420 }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(onClose);
  const id = useId();
  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-start justify-center pt-[14vh]">
      <div className="absolute inset-0 bg-[var(--overlay)] [animation:ui-fade-in_150ms_var(--ease)]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby={id} className="relative rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] [animation:ui-pop_150ms_var(--ease)]" style={{ width }}>
        <div className="px-5 pb-2 pt-4">
          <h2 id={id} className="text-[15px] font-semibold text-[var(--text)]">{title}</h2>
        </div>
        <div className="px-5 pb-4 text-[13px] text-[var(--text-2)]">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** Anchored popover panel (menus, filters, alerts). Closes on outside click / Escape. */
export function Popover({ open, onClose, anchor, children, width = 320, align = "left" }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; children: ReactNode; width?: number; align?: "left" | "right" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose, anchor]);
  if (!open || !anchor.current) return null;
  const r = anchor.current.getBoundingClientRect();
  const left = align === "left" ? Math.min(r.left, window.innerWidth - width - 8) : Math.max(8, r.right - width);
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[210] max-h-[70vh] overflow-y-auto rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] scroll-thin [animation:ui-pop_120ms_var(--ease)]"
      style={{ top: r.bottom + 6, left, width }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({ icon, label, hint, onClick }: { icon?: ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-8 w-full items-center gap-2.5 px-3 text-left text-[13px] text-[var(--text)] transition-colors hover:bg-[var(--surface-2)]">
      <span className="text-[var(--text-3)]">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-[11px] text-[var(--text-3)]">{hint}</span> : null}
    </button>
  );
}
