import clsx from "clsx";
import { ChevronUp, GitCompareArrows } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Card } from "../ui/Card";
import {
  quickCompareTargets,
  routeLineBaseColor,
  totalTripCostEur,
  type RoutePlanOption,
  type RouteOptionId,
  type TollDataQuality,
} from "../../tomtom/planRoutes";

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${min}m`;
}

function formatDistanceM(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(n);
}

function tollQualityBadgeClass(q: TollDataQuality): string {
  switch (q) {
    case "priced":
      return "bg-emerald-500/15 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200";
    case "estimated":
      return "bg-amber-500/15 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200";
    case "mixed":
      return "bg-violet-500/15 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200";
    case "unpriced_sections":
      return "bg-sky-500/15 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200";
    default:
      return "bg-slate-500/15 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300";
  }
}

function tollQualityShortLabel(q: TollDataQuality): string {
  switch (q) {
    case "priced":
      return "Priced";
    case "estimated":
      return "Est.";
    case "mixed":
      return "Mixed";
    case "unpriced_sections":
      return "Sections";
    default:
      return "No data";
  }
}

function lastStopEta(o: RoutePlanOption): string | null {
  if (!o.stopArrivals.length) return null;
  return o.stopArrivals[o.stopArrivals.length - 1]?.etaLabel ?? null;
}

const DRAG_THRESHOLD_PX = 28;
const CLICK_MOVE_TOLERANCE = 10;

export function RouteComparisonSheet({
  options,
  selectedId,
  hoveredRouteId,
  onSelect,
  onHover,
  expanded: expandedControlled,
  onExpandedChange,
}: {
  options: RoutePlanOption[];
  selectedId: RouteOptionId | null;
  hoveredRouteId: RouteOptionId | null;
  onSelect: (id: RouteOptionId) => void;
  onHover: (id: RouteOptionId | null) => void;
  /** Controlled expanded state (optional). */
  expanded?: boolean;
  /** Called when expanded/collapsed toggles (for map chrome). */
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [expandedInternal, setExpandedInternal] = useState(false);
  const expanded = expandedControlled ?? expandedInternal;
  const setExpanded = useCallback(
    (next: boolean) => {
      if (expandedControlled === undefined) setExpandedInternal(next);
      onExpandedChange?.(next);
    },
    [expandedControlled, onExpandedChange],
  );

  const dragRef = useRef<{
    pointerId: number | null;
    startY: number;
    moved: boolean;
  }>({ pointerId: null, startY: 0, moved: false });

  const onHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    if (Math.abs(e.clientY - dragRef.current.startY) > CLICK_MOVE_TOLERANCE) {
      dragRef.current.moved = true;
    }
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const dy = e.clientY - dragRef.current.startY;
    dragRef.current.pointerId = null;

    if (dragRef.current.moved) {
      if (dy < -DRAG_THRESHOLD_PX) setExpanded(true);
      else if (dy > DRAG_THRESHOLD_PX) setExpanded(false);
    } else {
      setExpanded(!expanded);
    }
  };

  const decisions = quickCompareTargets(options);
  const showQuickCompare = Boolean(decisions.fastest || decisions.lowestToll || decisions.mostFuelEfficient);

  return (
    <div
      className={clsx(
        "pointer-events-auto absolute inset-x-0 bottom-0 z-[500] flex flex-col overflow-hidden rounded-t-2xl border border-b-0 border-white/25 shadow-[0_-8px_32px_-6px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-[max-height] duration-300 ease-out dark:border-white/10 dark:shadow-black/30",
        "bg-white/72 dark:bg-slate-950/55",
        expanded ? "max-h-[min(36vh,320px)]" : "h-20",
      )}
      role="region"
      aria-label="Route comparison"
    >
      {/* Drag / toggle handle — click or vertical drag to expand or collapse */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse route comparison" : "Expand route comparison"}
        className="flex h-8 shrink-0 cursor-grab touch-none select-none items-center justify-center gap-2 border-b border-slate-200/50 active:cursor-grabbing dark:border-slate-600/40"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <span className="h-1 w-10 rounded-full bg-slate-400/70 dark:bg-slate-500" aria-hidden />
        <ChevronUp
          className={clsx("h-4 w-4 text-slate-500 transition-transform dark:text-slate-400", expanded && "rotate-180")}
          aria-hidden
        />
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {expanded ? "Collapse" : "Expand"} · compare routes
        </span>
      </div>

      {!expanded ? (
        <div className="flex min-h-0 flex-1 items-stretch gap-2 overflow-x-auto overflow-y-hidden px-2 pb-1.5 pt-0 scroll-thin">
          {options.map((o) => {
            const ok = !o.error && o.polyline.length > 0;
            const eta = lastStopEta(o);
            const isSel = selectedId === o.id && ok;
            const isHov = hoveredRouteId === o.id && ok;
            const total = formatEur(totalTripCostEur(o));

            return (
              <button
                key={o.id}
                type="button"
                id={ok ? `route-card-${o.id}` : undefined}
                disabled={!ok}
                onClick={() => ok && onSelect(o.id)}
                onMouseEnter={() => ok && onHover(o.id)}
                onMouseLeave={() => onHover(null)}
                className={clsx(
                  "flex min-w-[148px] max-w-[200px] shrink-0 flex-col rounded-lg border px-2.5 py-1.5 text-left transition",
                  !ok && "cursor-not-allowed opacity-50",
                  ok && "hover:bg-white/50 dark:hover:bg-white/5",
                  isSel && ok && "border-teal-500/80 bg-white/55 shadow-sm ring-1 ring-teal-500/30 dark:bg-white/5",
                  !isSel && ok && "border-slate-200/60 bg-white/40 dark:border-slate-600/50 dark:bg-slate-900/30",
                  isHov && !isSel && ok && "ring-1 ring-teal-400/40",
                )}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: ok ? routeLineBaseColor(o) : "#94a3b8" }}
                    aria-hidden
                  />
                  <span className="truncate text-[11px] font-semibold leading-tight text-slate-900 dark:text-slate-100">
                    {o.title}
                  </span>
                </span>
                <span className="mt-0.5 pl-4 font-mono text-[10px] tabular-nums leading-tight text-slate-600 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">ETA</span> {eta ?? "—"} · {total}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-3 pt-1 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2 gap-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                <GitCompareArrows className="h-3.5 w-3.5" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">Compare routes</h2>
                <p className="text-[10px] text-[var(--app-muted)]">Hover map lines · click to select</p>
              </div>
            </div>

            {showQuickCompare ? (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {decisions.fastest ? (
                  <button
                    type="button"
                    onClick={() => onSelect(decisions.fastest!)}
                    className="rounded-lg border border-slate-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-800 shadow-sm backdrop-blur-sm hover:bg-white dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    Fastest
                  </button>
                ) : null}
                {decisions.lowestToll ? (
                  <button
                    type="button"
                    onClick={() => onSelect(decisions.lowestToll!)}
                    className="rounded-lg border border-slate-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-800 shadow-sm backdrop-blur-sm hover:bg-white dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    Lowest toll
                  </button>
                ) : null}
                {decisions.mostFuelEfficient ? (
                  <button
                    type="button"
                    onClick={() => onSelect(decisions.mostFuelEfficient!)}
                    className="rounded-lg border border-slate-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-800 shadow-sm backdrop-blur-sm hover:bg-white dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    Fuel-efficient
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden scroll-thin pb-1">
            <ul className="flex gap-3 pb-1">
              {options.map((o) => {
                const ok = !o.error && o.polyline.length > 0;
                const eta = lastStopEta(o);
                const isSel = selectedId === o.id && ok;
                const isHov = hoveredRouteId === o.id && ok;

                return (
                  <li key={o.id} className="w-[min(100%,260px)] shrink-0 sm:w-[280px]">
                    <Card
                      id={ok ? `route-card-${o.id}` : undefined}
                      padding="p-3"
                      onClick={() => {
                        if (ok) onSelect(o.id);
                      }}
                      onMouseEnter={() => {
                        if (ok) onHover(o.id);
                      }}
                      onMouseLeave={() => onHover(null)}
                      role={ok ? "button" : undefined}
                      tabIndex={ok ? 0 : undefined}
                      className={clsx(
                        "h-full transition",
                        !ok && "opacity-70",
                        ok && "cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.04]",
                        isSel && ok && "shadow-lg",
                        isHov && !isSel && ok && "ring-2 ring-teal-500/40 ring-offset-2 ring-offset-[var(--app-card)] dark:ring-teal-400/35",
                      )}
                      style={{
                        borderColor: isSel && ok ? routeLineBaseColor(o) : "var(--app-border)",
                        borderWidth: isSel && ok ? 2 : 1,
                      }}
                    >
                      <div className="flex h-full flex-col gap-2">
                        <div className="flex items-start gap-2">
                          <span
                            className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: routeLineBaseColor(o) }}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[13px] font-medium leading-snug text-slate-900 dark:text-slate-100">
                                {o.title}
                              </span>
                              {isSel ? (
                                <span className="rounded-full bg-brand-600/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-800 dark:bg-brand-500/20 dark:text-brand-200">
                                  Selected
                                </span>
                              ) : null}
                            </div>
                            {o.subtitle ? (
                              <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--app-muted)]">{o.subtitle}</p>
                            ) : null}
                          </div>
                        </div>

                        {o.error ? (
                          <p className="text-xs text-rose-600 dark:text-rose-400">{o.error}</p>
                        ) : (
                          <>
                            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[10px] tabular-nums">
                              <div>
                                <dt className="text-[9px] font-normal uppercase tracking-wide text-[var(--app-muted)]">ETA</dt>
                                <dd className="text-slate-900 dark:text-slate-100">{eta ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-[9px] font-normal uppercase tracking-wide text-[var(--app-muted)]">Drive</dt>
                                <dd className="text-slate-800 dark:text-slate-200">{formatDuration(o.durationSec)}</dd>
                              </div>
                              <div>
                                <dt className="text-[9px] font-normal uppercase tracking-wide text-emerald-800/90 dark:text-emerald-300/90">
                                  Fuel
                                </dt>
                                <dd className="text-emerald-900 dark:text-emerald-200">{formatEur(o.fuelCostEur)}</dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="text-[9px] font-normal uppercase tracking-wide text-orange-800/90 dark:text-orange-300/90">
                                  Tolls
                                </dt>
                                <dd className="mt-0.5 space-y-0.5 text-orange-900 dark:text-orange-200">
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono tabular-nums">
                                      {o.tollDataQuality === "unpriced_sections"
                                        ? `${o.tollSectionCount} sect.`
                                        : o.tollDataQuality === "none" && o.tollCostEur === 0
                                          ? "—"
                                          : o.tollDataQuality === "estimated"
                                            ? `~${formatEur(o.tollCostEur)}`
                                            : formatEur(o.tollCostEur)}
                                    </span>
                                    <span
                                      className={clsx(
                                        "rounded px-1 py-px text-[8px] font-semibold uppercase tracking-wide",
                                        tollQualityBadgeClass(o.tollDataQuality),
                                      )}
                                    >
                                      {tollQualityShortLabel(o.tollDataQuality)}
                                    </span>
                                  </span>
                                  {o.tollDataQuality === "mixed" ? (
                                    <span className="block text-[9px] font-normal text-[var(--app-muted)]">
                                      {formatEur(o.tollPricedEur)} priced + ~{formatEur(o.tollEstimatedEur)} est.
                                    </span>
                                  ) : o.tollDataQuality === "priced" && o.tollPricedEur > 0 ? (
                                    <span className="block text-[9px] text-[var(--app-muted)]">TomTom EUR toll prices</span>
                                  ) : o.tollDataQuality === "estimated" && o.tollEstimatedEur > 0 ? (
                                    <span className="block text-[9px] text-[var(--app-muted)]">
                                      Model estimate (toll / motorway exposure)
                                    </span>
                                  ) : o.tollDataQuality === "unpriced_sections" ? (
                                    <span className="block text-[9px] text-[var(--app-muted)]">
                                      Toll sections in response; EUR price not in API (see tollPaymentTypes / indices)
                                    </span>
                                  ) : o.tollDataQuality === "none" ? (
                                    <span className="block text-[9px] text-[var(--app-muted)]">
                                      No toll-related sections in TomTom response for this request
                                    </span>
                                  ) : null}
                                </dd>
                              </div>
                              <div className="col-span-2 border-t border-slate-200/80 pt-1 dark:border-slate-600">
                                <dt className="text-[9px] font-normal uppercase tracking-wide text-[var(--app-muted)]">Total</dt>
                                <dd className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                                  {formatEur(totalTripCostEur(o))}
                                </dd>
                              </div>
                            </dl>
                            <div className="mt-auto flex flex-wrap gap-x-2 gap-y-0.5 border-t border-slate-200/80 pt-1.5 text-[9px] text-[var(--app-muted)] dark:border-slate-600">
                              <span>{formatDistanceM(o.distanceM)}</span>
                              {o.trafficDelaySec > 0 ? (
                                <span className="text-amber-700 dark:text-amber-300">
                                  +{formatDuration(o.trafficDelaySec)} traffic
                                </span>
                              ) : null}
                            </div>
                            {o.stopArrivals.length > 0 ? (
                              <ul className="space-y-0.5 border-t border-slate-200/80 pt-1.5 text-[9px] dark:border-slate-600">
                                {o.stopArrivals.map((a) => (
                                  <li key={a.stopId} className="flex flex-wrap items-center gap-x-1.5 gap-y-0">
                                    <span className="text-[var(--app-muted)]">{a.name}</span>
                                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">{a.etaLabel}</span>
                                    {a.windowRisk === "critical" ? (
                                      <span className="text-red-600 dark:text-red-400">Window risk</span>
                                    ) : a.windowRisk === "warn" ? (
                                      <span className="text-amber-700 dark:text-amber-300">Tight</span>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
