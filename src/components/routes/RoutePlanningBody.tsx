import { Loader2, Route as RouteIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RouteBuilderCard } from "./RouteBuilderCard";
import { RouteComparisonSheet } from "./RouteComparisonSheet";
import { RoutePlannerMap, type RouteMapMarker } from "./RoutePlannerMap";
import { createEmptyPoint, type PlannerPointDraft } from "./routePlannerTypes";
import { draftsToWaypoints } from "./waypointsFromDrafts";
import { useFleetData } from "../../context/FleetDataContext";
import { useRouteSessionAlerts } from "../../context/RouteSessionContext";
import { trucks as fleetTrucksBase } from "../../data/mockData";
import type { OpsAlert } from "../../data/types";
import { evaluateEuDrivingRules } from "../../ops/euDrivingRules";
import { routingPresetForFleetTruck } from "../../tomtom/fleetTruckRouting";
import { getTomTomKey } from "../../tomtom/config";
import {
  DEFAULT_FUEL_EUR_PER_L,
  planRouteOptions,
  type RoutePlanOption,
  type RouteOptionId,
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

function draftsToMapMarkers(
  start: PlannerPointDraft,
  middle: PlannerPointDraft[],
  finish: PlannerPointDraft,
): RouteMapMarker[] {
  const out: RouteMapMarker[] = [];
  if (start.lat != null && start.lng != null) {
    out.push({ id: start.id, lat: start.lat, lng: start.lng, label: start.label, role: "start" });
  }
  for (const p of middle) {
    if (p.lat != null && p.lng != null) {
      out.push({ id: p.id, lat: p.lat, lng: p.lng, label: p.label, role: "via" });
    }
  }
  if (finish.lat != null && finish.lng != null) {
    out.push({ id: finish.id, lat: finish.lat, lng: finish.lng, label: finish.label, role: "finish" });
  }
  return out;
}

export type RouteLoadPoints = {
  start: PlannerPointDraft;
  middle: PlannerPointDraft[];
  finish: PlannerPointDraft;
};

export type RoutePlanningBodyProps = {
  /** Optional column before the map (e.g. unassigned jobs on Dispatch). */
  leading?: React.ReactNode;
  /** Planning controls sit left (Routes) or right (Dispatch). */
  sidebarPosition?: "left" | "right";
  /** When both are set, truck selection is controlled by the parent (e.g. Dispatch + jobs panel). */
  selectedFleetTruckId?: string;
  onSelectedFleetTruckIdChange?: (id: string) => void;
  /**
   * Pass a new unique string here (e.g. `jobId + Date.now()`) to trigger a
   * one-shot load of `loadPoints` into the planner — resets the current draft.
   */
  loadKey?: string;
  loadPoints?: RouteLoadPoints | null;
  /** Rendered at the top of the sidebar — use for active-job status card. */
  activeJobBanner?: React.ReactNode;
};

export function RoutePlanningBody({
  leading,
  sidebarPosition = "left",
  selectedFleetTruckId: controlledTruckId,
  onSelectedFleetTruckIdChange,
  loadKey,
  loadPoints,
  activeJobBanner,
}: RoutePlanningBodyProps) {
  const apiKey = getTomTomKey();
  const { setRouteSessionAlerts } = useRouteSessionAlerts();
  const { cargoByTruck, trucksLive } = useFleetData();

  const [start, setStart] = useState<PlannerPointDraft>(() => createEmptyPoint("start"));
  const [finish, setFinish] = useState<PlannerPointDraft>(() => createEmptyPoint("finish"));
  const [middleStops, setMiddleStops] = useState<PlannerPointDraft[]>([]);
  const [internalTruckId, setInternalTruckId] = useState(fleetTrucksBase[0]?.id ?? "t1");

  const truckSelectionControlled =
    typeof controlledTruckId === "string" &&
    controlledTruckId.length > 0 &&
    typeof onSelectedFleetTruckIdChange === "function";

  const selectedFleetTruckId = truckSelectionControlled ? controlledTruckId : internalTruckId;
  const setSelectedFleetTruckId = truckSelectionControlled ? onSelectedFleetTruckIdChange! : setInternalTruckId;

  const selectedTruck = useMemo(
    () => trucksLive.find((t) => t.id === selectedFleetTruckId) ?? trucksLive[0]!,
    [trucksLive, selectedFleetTruckId],
  );

  const assignedCargo = useMemo(() => cargoByTruck[selectedTruck.id] ?? [], [cargoByTruck, selectedTruck.id]);
  const cargoWeightKg = useMemo(
    () => assignedCargo.reduce((a, c) => a + c.weightKg, 0),
    [assignedCargo],
  );
  const cargoSignature = useMemo(
    () => assignedCargo.map((c) => `${c.id}:${c.weightKg}`).join("|"),
    [assignedCargo],
  );

  const routingPreset = useMemo(() => routingPresetForFleetTruck(selectedTruck.id), [selectedTruck.id]);

  const mapMarkers = useMemo(
    () => draftsToMapMarkers(start, middleStops, finish),
    [start, middleStops, finish],
  );

  const vehicleSig = `${selectedFleetTruckId}:${cargoSignature}`;

  const resolvedCoordsSig = useMemo(() => {
    const parts: string[] = [];
    if (start.lat != null && start.lng != null) parts.push(`${start.lat},${start.lng}`);
    middleStops.forEach((m) => {
      if (m.lat != null && m.lng != null) parts.push(`${m.lat},${m.lng}`);
    });
    if (finish.lat != null && finish.lng != null) parts.push(`${finish.lat},${finish.lng}`);
    return parts.join("|");
  }, [start, middleStops, finish]);

  const [options, setOptions] = useState<RoutePlanOption[]>([]);
  const [selectedId, setSelectedId] = useState<RouteOptionId | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [hoveredRouteId, setHoveredRouteId] = useState<RouteOptionId | null>(null);
  const [comparisonExpanded, setComparisonExpanded] = useState(false);

  const selected = useMemo(() => options.find((o) => o.id === selectedId) ?? null, [options, selectedId]);

  /* ── Load job stops into planner when trigger key changes ─────────── */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!loadKey || !loadPoints) return;
    setStart(loadPoints.start);
    setMiddleStops(loadPoints.middle);
    setFinish(loadPoints.finish);
    setOptions([]);
    setSelectedId(null);
    setHoveredRouteId(null);
    setComparisonExpanded(false);
  }, [loadKey]); // intentional: loadKey is the trigger, loadPoints is read synchronously

  useEffect(() => {
    setOptions([]);
    setSelectedId(null);
    setHoveredRouteId(null);
    setComparisonExpanded(false);
  }, [resolvedCoordsSig, vehicleSig]);

  useEffect(() => {
    if (!hoveredRouteId) return;
    const el = document.getElementById(`route-card-${hoveredRouteId}`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [hoveredRouteId]);

  const plan = useCallback(async () => {
    setError(null);
    setOptions([]);
    setSelectedId(null);

    if (!apiKey) {
      setError("Configure VITE_TOMTOM_API_KEY para calcular rotas com TomTom.");
      return;
    }

    const built = draftsToWaypoints(start, middleStops, finish);
    if (!built.ok) {
      setError(built.error);
      return;
    }

    const { coords, waypointStops } = built.data;
    if (coords.length < 2) {
      setError("Defina pelo menos origem e destino com coordenadas válidas.");
      return;
    }

    setLoading(true);
    try {
      setHoveredRouteId(null);
      const planned = await planRouteOptions(apiKey, coords, {
        waypointStops,
        fuelEurPerL: DEFAULT_FUEL_EUR_PER_L,
        departAt: new Date(),
        truck: {
          fleetTruckId: selectedTruck.id,
          cargoWeightKg,
          preset: routingPreset,
        },
      });
      setOptions(planned);
      const firstOk = planned.find((p) => !p.error && p.polyline.length);
      if (firstOk) setSelectedId(firstOk.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao calcular rota.");
    } finally {
      setLoading(false);
    }
  }, [apiKey, start, middleStops, finish, selectedTruck.id, cargoWeightKg, routingPreset]);

  useEffect(() => {
    if (!selected) {
      setRouteSessionAlerts([]);
      return;
    }

    const alerts: OpsAlert[] = [];
    const ts = new Date().toISOString();

    if (selected.trafficDelaySec >= 15 * 60) {
      alerts.push({
        id: "route-sess-traffic",
        severity: "warning",
        title: "Tráfego na rota selecionada",
        detail: `+${formatDuration(selected.trafficDelaySec)} vs. trânsito livre`,
        entityType: "route",
        entityId: "plan",
        ts,
      });
    }

    const euIssues = evaluateEuDrivingRules(selected.legDurationSec, 0, undefined);
    for (let i = 0; i < euIssues.length; i++) {
      const issue = euIssues[i]!;
      alerts.push({
        id: `route-sess-eu-${issue.code}-${i}`,
        severity: issue.severity === "critical" ? "critical" : "warning",
        title: "Regras de condução UE",
        detail: issue.message,
        entityType: "route",
        entityId: "plan",
        ts,
      });
    }

    setRouteSessionAlerts(alerts);
  }, [selected, setRouteSessionAlerts]);

  const okOptions = options.filter((o) => !o.error && o.polyline.length);
  const hasComparison = options.length > 0;
  const hasLeading = Boolean(leading);

  const sidebarClass =
    sidebarPosition === "left"
      ? "order-2 border-t border-[var(--app-border)] lg:order-1 lg:border-b-0 lg:border-r"
      : hasLeading
        ? "order-3 border-t border-[var(--app-border)] lg:order-3 lg:border-b-0 lg:border-l"
        : "order-2 border-t border-[var(--app-border)] lg:order-2 lg:border-b-0 lg:border-l";

  const mapClass = hasLeading
    ? "order-2 lg:order-2"
    : sidebarPosition === "left"
      ? "order-1 lg:order-2"
      : "order-1 lg:order-1";

  const sidebar = (
    <aside
      className={`flex min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden p-4 lg:h-full lg:max-h-none lg:max-w-[min(100%,380px)] xl:max-w-[400px] ${sidebarClass}`}
    >
      {activeJobBanner ?? (
        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight" style={{ color: "var(--app-fg)" }}>
            Planeador de rotas
          </h2>
          <p className="mt-1 text-xs text-[var(--app-muted)]">
            Defina origem, destino e paragens. Compare alternativas no mapa e avance o trabalho.
          </p>
        </div>
      )}

      <RouteBuilderCard
        apiKey={apiKey}
        start={start}
        finish={finish}
        middleStops={middleStops}
        fleetTrucks={trucksLive}
        selectedTruckId={selectedFleetTruckId}
        onTruckChange={setSelectedFleetTruckId}
        assignedCargo={assignedCargo}
        routingPreset={routingPreset}
        onStartChange={setStart}
        onFinishChange={setFinish}
        onMiddleStopsChange={setMiddleStops}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void plan()}
          disabled={loading}
          className="flex min-w-[160px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: "#2D5F4E" }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RouteIcon className="h-4 w-4" />}
          {loading ? "A calcular…" : "Calcular rota"}
        </button>
      </div>

      {error ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {!apiKey ? (
        <p className="text-xs text-[var(--app-muted)]">
          Configure{" "}
          <code className="rounded bg-black/10 px-1 font-mono dark:bg-white/10">VITE_TOMTOM_API_KEY</code>{" "}
          para mapas, pesquisa de locais e cálculo de rotas.
        </p>
      ) : null}

      {!hasComparison && !loading ? (
        <p className="text-xs text-[var(--app-muted)]">
          Após calcular, uma faixa de comparação aparece no mapa — expanda para ver detalhes de custo, distância e HOS da UE.
        </p>
      ) : null}
    </aside>
  );

  const mapBlock = (
    <div
      className={`relative flex min-h-[min(55vh,560px)] w-full min-w-0 flex-1 flex-col lg:min-h-0 ${mapClass}`}
    >
      <div className="box-border flex h-full min-h-0 flex-1 flex-col p-3 pb-2 sm:p-4 lg:p-6">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <RoutePlannerMap
            className="min-h-0 flex-1"
            options={okOptions}
            selectedId={selectedId}
            hoveredRouteId={hoveredRouteId}
            onRouteHover={setHoveredRouteId}
            onRouteLineClick={setSelectedId}
            markers={mapMarkers}
            cargoByStopId={{}}
            selectedMarkerId={selectedMarkerId}
            onMarkerClick={setSelectedMarkerId}
            comparisonSheetInset={!hasComparison ? "none" : comparisonExpanded ? "expanded" : "peek"}
          />
          {hasComparison ? (
            <RouteComparisonSheet
              options={options}
              selectedId={selectedId}
              hoveredRouteId={hoveredRouteId}
              onSelect={setSelectedId}
              onHover={setHoveredRouteId}
              expanded={comparisonExpanded}
              onExpandedChange={setComparisonExpanded}
            />
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:min-h-0 lg:flex-row">
      {leading ? (
        <div className="order-1 flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-[var(--app-border)] lg:order-1 lg:w-[min(100%,280px)] lg:max-w-[320px] lg:border-b-0 lg:border-r">
          {leading}
        </div>
      ) : null}
      {sidebarPosition === "left" ? sidebar : null}
      {mapBlock}
      {sidebarPosition === "right" ? sidebar : null}
    </div>
  );
}
