import clsx from "clsx";
import { Crosshair, GripVertical, Search } from "lucide-react";
import { useCallback, useId } from "react";
import type { GeocodeHit } from "../../tomtom/geocode";
import { LocationSearchCombobox } from "./LocationSearchCombobox";
import { parseLatLngStrings } from "./coordsParse";
import type { EntryMode, PlannerPointDraft } from "./routePlannerTypes";

type RoutePointFieldProps = {
  apiKey: string | undefined;
  rowLabel: string;
  point: PlannerPointDraft;
  onChange: (next: PlannerPointDraft) => void;
  onRemove?: () => void;
  dragHandleProps?: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  placeholderSearch?: string;
};

export function RoutePointField({
  apiKey,
  rowLabel,
  point,
  onChange,
  onRemove,
  dragHandleProps,
  placeholderSearch = "Search place…",
}: RoutePointFieldProps) {
  const listId = useId();

  const coordParse =
    point.mode === "coords" && (point.latInput.trim() !== "" || point.lngInput.trim() !== "")
      ? parseLatLngStrings(point.latInput, point.lngInput)
      : null;
  const coordsInvalid = coordParse != null && !coordParse.ok;

  const applySearchHit = useCallback(
    (hit: GeocodeHit) => {
      onChange({
        ...point,
        label: hit.label,
        lat: hit.lat,
        lng: hit.lng,
        searchText: hit.label,
      });
    },
    [onChange, point],
  );

  const toggleMode = () => {
    const next: EntryMode = point.mode === "search" ? "coords" : "search";
    onChange({
      ...point,
      mode: next,
    });
  };

  const syncCoordsToPoint = (latIn: string, lngIn: string) => {
    const parsed = parseLatLngStrings(latIn, lngIn);
    if (parsed.ok) {
      onChange({
        ...point,
        latInput: latIn,
        lngInput: lngIn,
        lat: parsed.lat,
        lng: parsed.lng,
        label: `${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}`,
      });
    } else {
      onChange({
        ...point,
        latInput: latIn,
        lngInput: lngIn,
        lat: null,
        lng: null,
        label: "",
      });
    }
  };

  return (
    <div className="flex gap-2">
      {dragHandleProps ? (
        <div
          className="mt-2 flex h-9 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 active:cursor-grabbing dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
          aria-label="Arrastar para reordenar"
          role="button"
          tabIndex={0}
          draggable={dragHandleProps.draggable}
          onDragStart={dragHandleProps.onDragStart}
          onDragEnd={dragHandleProps.onDragEnd}
        >
          <GripVertical className="h-4 w-4" />
        </div>
      ) : (
        <span className="mt-2 w-8 shrink-0" aria-hidden />
      )}

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--app-muted)]">{rowLabel}</span>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="ml-auto text-[11px] font-medium text-rose-600 hover:underline dark:text-rose-400"
            >
              Remover
            </button>
          ) : null}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={toggleMode}
            title={point.mode === "search" ? "Mudar para coordenadas" : "Mudar para pesquisa de local"}
            className={clsx(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition",
              point.mode === "search"
                ? "border-teal-500/50 bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
                : "border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300",
            )}
            style={{ borderColor: point.mode === "search" ? undefined : "var(--app-border)" }}
          >
            {point.mode === "search" ? <Search className="h-4 w-4" /> : <Crosshair className="h-4 w-4" />}
          </button>

          {point.mode === "search" ? (
            <div className="min-w-0 flex-1 space-y-1">
              <LocationSearchCombobox
                apiKey={apiKey}
                value={point.searchText}
                listId={listId}
                onValueChange={(next) =>
                  onChange({ ...point, searchText: next, lat: null, lng: null, label: "" })
                }
                onSelect={applySearchHit}
                placeholder={placeholderSearch}
              />
              {point.lat != null && point.lng != null && point.label ? (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">✓ {point.label}</p>
              ) : null}
            </div>
          ) : (
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
              <div>
                <label className="sr-only">Latitude</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={point.latInput}
                  onChange={(e) => syncCoordsToPoint(e.target.value, point.lngInput)}
                  placeholder="Latitude"
                  aria-invalid={coordsInvalid}
                  className={clsx(
                    "w-full rounded-xl border px-3 py-2.5 font-mono text-sm outline-none ring-brand-500/30 focus:ring-2 dark:bg-slate-900 dark:text-slate-100",
                    coordsInvalid ? "border-rose-400 bg-rose-50/50 dark:border-rose-500 dark:bg-rose-950/20" : "",
                  )}
                  style={!coordsInvalid ? { borderColor: "var(--app-border)" } : undefined}
                />
              </div>
              <div>
                <label className="sr-only">Longitude</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={point.lngInput}
                  onChange={(e) => syncCoordsToPoint(point.latInput, e.target.value)}
                  placeholder="Longitude"
                  aria-invalid={coordsInvalid}
                  className={clsx(
                    "w-full rounded-xl border px-3 py-2.5 font-mono text-sm outline-none ring-brand-500/30 focus:ring-2 dark:bg-slate-900 dark:text-slate-100",
                    coordsInvalid ? "border-rose-400 bg-rose-50/50 dark:border-rose-500 dark:bg-rose-950/20" : "",
                  )}
                  style={!coordsInvalid ? { borderColor: "var(--app-border)" } : undefined}
                />
              </div>
              {coordsInvalid && coordParse && !coordParse.ok ? (
                <p className="col-span-2 text-[11px] text-rose-600 dark:text-rose-400">{coordParse.error}</p>
              ) : point.lat != null && point.lng != null ? (
                <p className="col-span-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                  ✓ Coordenadas válidas para rota
                </p>
              ) : (
                <p className="col-span-2 text-[11px] text-[var(--app-muted)]">
                  Ex.: 41.5454 (lat), −8.4265 (lng) — Braga
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
