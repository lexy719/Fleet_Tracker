import clsx from "clsx";
import { Plus } from "lucide-react";
import { useDeferredValue, useId, useMemo, useState, type ReactNode } from "react";
import { fold } from "./RecordLists";

export type PickerOption = { id: string; label: string; detail?: string; group?: string };

/**
 * Search-as-you-type picker over records with an inline «Criar …» action.
 * Keyboard: ↑/↓ to move, Enter to choose, Escape to close.
 */
export function RecordPicker({
  value,
  onText,
  options,
  onPick,
  onCreate,
  createLabel,
  placeholder,
  ariaLabel,
  autoFocus,
  adornment,
  limit = 8,
}: {
  value: string;
  onText: (v: string) => void;
  options: PickerOption[];
  onPick: (id: string) => void;
  onCreate?: (text: string) => void;
  createLabel?: (text: string) => string;
  placeholder?: string;
  ariaLabel: string;
  autoFocus?: boolean;
  adornment?: ReactNode;
  limit?: number;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = fold(useDeferredValue(value).trim());
  const matches = useMemo(() => {
    if (!q) return options.slice(0, limit);
    return options.filter((o) => fold(`${o.label} ${o.detail ?? ""}`).includes(q)).slice(0, limit);
  }, [options, q, limit]);
  const exact = matches.some((m) => fold(m.label) === q);
  const showCreate = !!onCreate && !!value.trim() && !exact;
  const total = matches.length + (showCreate ? 1 : 0);
  const choose = (i: number) => {
    if (i < matches.length) onPick(matches[i]!.id);
    else if (showCreate) onCreate!(value.trim());
    setOpen(false);
  };
  return (
    <div className="relative">
      <input
        className="ui-input pr-8"
        role="combobox"
        aria-expanded={open && total > 0}
        aria-controls={`${id}-list`}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) return setOpen(true);
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(total - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && open && total) { e.preventDefault(); choose(active); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {adornment ? <span className="absolute right-2 top-1/2 -translate-y-1/2">{adornment}</span> : null}
      {open && total > 0 ? (
        <ul id={`${id}-list`} role="listbox" className="absolute left-0 right-0 top-full z-[230] mt-1 max-h-[280px] overflow-y-auto rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[var(--shadow-lg)] scroll-thin">
          {matches.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === active}>
              {o.group && (i === 0 || matches[i - 1]!.group !== o.group) ? <div className="px-3 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{o.group}</div> : null}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)} onMouseEnter={() => setActive(i)} className={clsx("block w-full px-3 py-1.5 text-left", i === active && "bg-[var(--surface-2)]")}>
                <span className="block truncate text-[13px] text-[var(--text)]">{o.label}</span>
                {o.detail ? <span className="block truncate text-[12px] text-[var(--text-3)]">{o.detail}</span> : null}
              </button>
            </li>
          ))}
          {showCreate ? (
            <li role="option" aria-selected={active === matches.length}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(matches.length)} onMouseEnter={() => setActive(matches.length)} className={clsx("flex w-full items-center gap-1.5 border-t border-[var(--border)] px-3 py-1.5 text-left text-[13px] text-[var(--accent)]", active === matches.length && "bg-[var(--surface-2)]")}>
                <Plus className="h-3.5 w-3.5" />{createLabel ? createLabel(value.trim()) : `Criar «${value.trim()}»`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
