import clsx from "clsx";
import { Loader2, MapPin } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { GeocodeHit, PlaceSuggestionKind } from "../../tomtom/geocode";
import { searchAutocomplete } from "../../tomtom/searchAutocomplete";

const DEBOUNCE_MS = 300;

function SuggestionKindBadge({ kind }: { kind: PlaceSuggestionKind }) {
  const label = kind === "poi" ? "POI" : kind === "city" ? "City" : "Address";
  return (
    <span
      className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
      aria-hidden
    >
      {label}
    </span>
  );
}

type LocationSearchComboboxProps = {
  apiKey: string | undefined;
  value: string;
  onValueChange: (next: string) => void;
  onSelect: (hit: GeocodeHit) => void;
  placeholder?: string;
  listId?: string;
};

export function LocationSearchCombobox({
  apiKey,
  value,
  onValueChange,
  onSelect,
  placeholder = "Search place…",
  listId: listIdProp,
}: LocationSearchComboboxProps) {
  const autoListId = useId();
  const listId = listIdProp ?? autoListId;
  const anchorRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [focused, setFocused] = useState(false);
  const [rect, setRect] = useState({ top: 0, left: 0, width: 0 });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GeocodeHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchGen = useRef(0);

  const q = value.trim();
  const canQuery = Boolean(apiKey) && q.length >= 2;
  const showPanel = focused;

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!showPanel) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showPanel, updatePosition, value, loading, results.length]);

  useEffect(() => {
    if (!focused) {
      abortRef.current?.abort();
      setLoading(false);
      return;
    }
    if (!canQuery) {
      abortRef.current?.abort();
      setLoading(false);
      setResults([]);
      setError(null);
      setHighlight(0);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const gen = ++fetchGen.current;
      setLoading(true);
      setError(null);
      searchAutocomplete(apiKey!, q, { limit: 10, signal: ac.signal })
        .then((hits) => {
          if (gen !== fetchGen.current) return;
          setResults(hits);
          setHighlight(0);
        })
        .catch((err: unknown) => {
          if (gen !== fetchGen.current) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setResults([]);
          setError(err instanceof Error ? err.message : "Search failed.");
        })
        .finally(() => {
          if (gen === fetchGen.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [apiKey, canQuery, focused, q]);

  useEffect(() => {
    if (!showPanel) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (portalRef.current?.contains(t)) return;
      setFocused(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showPanel]);

  const clearBlurTimer = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  };

  const applyHit = useCallback(
    (hit: GeocodeHit) => {
      clearBlurTimer();
      onSelect(hit);
      setFocused(false);
      setResults([]);
      setError(null);
      setHighlight(0);
    },
    [onSelect],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showPanel) return;

    if (!apiKey) {
      if (e.key === "Escape") {
        e.preventDefault();
        setFocused(false);
      }
      return;
    }

    if (q.length < 2) {
      if (e.key === "Escape") {
        e.preventDefault();
        setFocused(false);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setFocused(false);
      return;
    }

    if (loading) return;

    if (error) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }

    const len = results.length;
    if (len === 0) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(len - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[highlight];
      if (hit) applyHit(hit);
    }
  };

  const panelContent = (() => {
    if (!apiKey) {
      return (
        <div className="px-3 py-2.5 text-xs leading-snug text-[var(--app-muted)]">
          Add <code className="rounded bg-black/5 px-1 font-mono dark:bg-white/10">VITE_TOMTOM_API_KEY</code> to search
          places.
        </div>
      );
    }
    if (q.length < 2) {
      return (
        <div className="px-3 py-2.5 text-xs text-[var(--app-muted)]">Type at least 2 characters to search.</div>
      );
    }
    if (loading) {
      return (
        <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span>Searching…</span>
        </div>
      );
    }
    if (error) {
      return <div className="px-3 py-2.5 text-xs text-rose-600 dark:text-rose-400">{error}</div>;
    }
    if (results.length === 0) {
      return (
        <div className="px-3 py-2.5 text-xs text-[var(--app-muted)]">No matching places. Try another search.</div>
      );
    }
    return results.map((s, i) => {
      const primary = s.primaryLine ?? s.label;
      const secondary = s.secondaryLine?.trim();
      return (
        <div key={s.id ?? `${s.lat.toFixed(6)}-${s.lng.toFixed(6)}-${i}`} role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={i === highlight}
            id={`${listId}-opt-${i}`}
            className={clsx(
              "w-full px-3 py-2.5 text-left transition-colors",
              i === highlight ? "bg-teal-50 dark:bg-teal-950/50" : "hover:bg-slate-50 dark:hover:bg-slate-800",
            )}
            onMouseEnter={() => setHighlight(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyHit(s)}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">{primary}</div>
                {secondary ? (
                  <div className="mt-0.5 line-clamp-2 text-xs text-[var(--app-muted)]">{secondary}</div>
                ) : null}
              </div>
              {s.kind ? <SuggestionKindBadge kind={s.kind} /> : null}
            </div>
          </button>
        </div>
      );
    });
  })();

  const listboxMode = Boolean(apiKey) && q.length >= 2 && !loading && !error && results.length > 0;

  const dropdown =
    showPanel && typeof document !== "undefined" ? (
      <div
        ref={portalRef}
        id={listId}
        role={listboxMode ? "listbox" : "region"}
        aria-label="Place suggestions"
        className="fixed z-[10000] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
        style={{
          top: rect.top,
          left: rect.left,
          width: Math.max(rect.width, 220),
        }}
        onMouseDown={(e) => {
          e.preventDefault();
        }}
      >
        {panelContent}
      </div>
    ) : null;

  return (
    <div ref={anchorRef} className="relative min-w-0 flex-1">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listboxMode ? `${listId}-opt-${highlight}` : undefined}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onFocus={() => {
            clearBlurTimer();
            setFocused(true);
          }}
          onBlur={() => {
            clearBlurTimer();
            blurTimerRef.current = setTimeout(() => setFocused(false), 120);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={clsx(
            "w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 text-sm outline-none ring-brand-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
            loading && canQuery && focused ? "pr-10" : "pr-3",
          )}
          style={{ borderColor: "var(--app-border)" }}
        />
        {loading && canQuery && focused ? (
          <Loader2
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
            aria-hidden
          />
        ) : null}
      </div>
      {dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
