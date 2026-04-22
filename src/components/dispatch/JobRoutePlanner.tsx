/**
 * JobRoutePlanner — right-panel component in Dispatch.
 *
 * Assignment model:
 *  • Dispatcher picks a TRUCK first.
 *  • IDLE truck (no active job): dispatcher also picks a driver from the
 *    available pool.  Driver + truck are written on the job together.
 *  • BUSY truck (assigned/loading/in_transit): the driver is already in the
 *    truck finishing another job.  New job queues automatically — same truck,
 *    same driver, no picker needed.
 *  • Queue promotion: when the active job finishes, the queued job with the
 *    pickup closest to the truck's live position is promoted first.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  RefreshCw,
  Truck,
  User,
  X,
} from "lucide-react";
import { useFleetData } from "../../context/FleetDataContext";
import { STATUS_LABELS, useJobs } from "../../context/JobsContext";
import { drivers as allDriversStatic } from "../../data/mockData";
import type { Job, JobStatus } from "../../data/types";
import { evaluateEuDrivingRules, simulateDrivingSchedule } from "../../ops/euDrivingRules";
import { getTomTomKey } from "../../tomtom/config";
import { routingPresetForFleetTruck } from "../../tomtom/fleetTruckRouting";
import {
  DEFAULT_FUEL_EUR_PER_L,
  planRouteOptions,
  routeLineBaseColor,
  type RoutePlanOption,
  type RouteOptionId,
} from "../../tomtom/planRoutes";
import type { RouteMapMarker } from "../routes/RoutePlannerMap";

const OPERATIONAL: readonly JobStatus[] = ["assigned", "loading", "in_transit"];

/* ── Helpers ─────────────────────────────────────────────── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function buildMarkersFromJob(job: Job): RouteMapMarker[] {
  const sorted = [...job.stops].sort((a, b) => a.sequence - b.sequence);
  return sorted.map((s, i): RouteMapMarker => ({
    id: s.id,
    lat: s.lat,
    lng: s.lng,
    label: `${s.city} — ${s.type === "pickup" ? "Carga" : "Entrega"}`,
    role: i === 0 ? "start" : i === sorted.length - 1 ? "finish" : "via",
  }));
}

/** Format seconds as "Xh Ym" or "Xh" */
function fmtDur(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const h   = Math.floor(sec / 3_600);
  const min = Math.round((sec % 3_600) / 60);
  if (h === 0) return `${min} min`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

/** Build a one-line schedule description for the route card. */
function scheduleDescription(driveSec: number, hoursToday: number): string {
  const sched = simulateDrivingSchedule(driveSec, hoursToday);

  if (sched.restCount === 0 && sched.breakCount === 0) {
    return "Sem paragens obrigatórias — chegada no próprio dia.";
  }

  const parts: string[] = [];
  if (sched.drivingDays > 1) parts.push(`${sched.drivingDays} dias de condução`);
  if (sched.restCount > 0)
    parts.push(`${sched.restCount} descanso${sched.restCount > 1 ? "s" : ""} noturno${sched.restCount > 1 ? "s" : ""} de 11h`);
  if (sched.breakCount > 0)
    parts.push(`${sched.breakCount} pausa${sched.breakCount > 1 ? "s" : ""} de 45 min`);

  return parts.join(" · ") + ` — duração real: ${fmtDur(sched.totalElapsedSec)}.`;
}

function roleIcon(role: RoutePlanOption["comparisonRole"]): string {
  switch (role) {
    case "fastest":     return "⚡";
    case "lowest_toll": return "🛣️";
    case "most_fuel":   return "🌿";
    case "single":      return "📍";
    default:            return "🔀";
  }
}

function roleLabel(role: RoutePlanOption["comparisonRole"]): string {
  switch (role) {
    case "fastest":     return "Mais rápida";
    case "lowest_toll": return "Menos portagens";
    case "most_fuel":   return "Menos combustível";
    case "single":      return "Rota calculada";
    default:            return "Rota alternativa";
  }
}

function slaChip(s: Job["slaStatus"]) {
  if (s === "breached") return { label: "Prazo ultrapassado", color: "#dc2626" };
  if (s === "at_risk")  return { label: "Prazo em risco",     color: "#d97706" };
  return                       { label: "Dentro do prazo",    color: "#059669" };
}

/* ── Props ───────────────────────────────────────────────── */
export type JobRoutePlannerProps = {
  job: Job;
  onRoutesReady: (
    options: RoutePlanOption[],
    selectedId: RouteOptionId | null,
    markers: RouteMapMarker[],
  ) => void;
  onRouteSelect: (id: RouteOptionId) => void;
  onClose: () => void;
  onConfirmed: () => void;
};

/* ── Component ───────────────────────────────────────────── */
export function JobRoutePlanner({
  job,
  onRoutesReady,
  onRouteSelect,
  onClose,
  onConfirmed,
}: JobRoutePlannerProps) {
  const apiKey          = getTomTomKey();
  const { planRoute, jobs } = useJobs();
  const { trucksLive }  = useFleetData();

  /* ── Truck selection ─────────────────────────────────── */
  const [selectedTruckId, setSelectedTruckId] = useState<string>(() => {
    // Prefer idle truck with enough capacity; fallback to first capable truck
    const idle = trucksLive.find(
      (t) => t.status === "idle" && t.maxWeightKg >= job.totalWeightKg,
    );
    if (idle) return idle.id;
    const capable = trucksLive.find(
      (t) => t.status !== "maintenance" && t.maxWeightKg >= job.totalWeightKg,
    );
    return capable?.id ?? trucksLive[0]?.id ?? "t1";
  });

  const selectedTruck = useMemo(
    () => trucksLive.find((t) => t.id === selectedTruckId) ?? null,
    [trucksLive, selectedTruckId],
  );

  /* ── Active job already on this truck (not the current one — for re-planning) */
  const activeJobOnTruck = useMemo(() => {
    const ops = jobs
      .filter(
        (j) =>
          j.id !== job.id &&
          j.assignedTruckId === selectedTruckId &&
          (OPERATIONAL as string[]).includes(j.status),
      )
      .sort((a, b) => {
        const o: Record<string, number> = { in_transit: 0, loading: 1, assigned: 2 };
        return (o[a.status] ?? 9) - (o[b.status] ?? 9) || a.id.localeCompare(b.id);
      });
    return ops[0] ?? null;
  }, [jobs, job.id, selectedTruckId]);

  /**
   * Three distinct truck states:
   *
   * IN_SERVICE — truck has an active TMS job (assigned/loading/in_transit).
   *   Driver is locked to that job's assignedDriverId. New job queues behind.
   *
   * RETAINED — truck is idle (telematics) but driverId is set.
   *   Driver just finished a previous job and is still aboard. Driver is
   *   auto-derived from truck.driverId — no picker needed.
   *
   * FREE — truck is idle and driverId is null. Truly unoccupied.
   *   Dispatcher must choose which available driver takes this truck.
   */
  /**
   * BUSY  — truck has an active job right now (assigned/loading/in_transit).
   *         Driver is whoever is already in the truck (from that job).
   *         New job queues; no driver picker — same driver handles both.
   *
   * IDLE  — truck has no active job.  Dispatcher must pick a driver.
   */
  const truckIsBusy = !!activeJobOnTruck;

  /** Driver locked inside the active job (busy trucks only). */
  const lockedDriverId: string | null = activeJobOnTruck?.assignedDriverId ?? null;

  /* ── Driver selection (idle trucks only) ─────────── */
  /** Drivers that can be assigned: not in violation, not currently in another truck on an active job. */
  const availableDrivers = useMemo(() => {
    if (truckIsBusy) return [];
    return allDriversStatic
      .filter((d) => {
        if (d.status === "violation") return false;
        return !jobs.some(
          (j) =>
            j.id !== job.id &&
            j.assignedDriverId === d.id &&
            (OPERATIONAL as string[]).includes(j.status),
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [truckIsBusy, jobs, job.id]);

  const [selectedDriverId, setSelectedDriverId] = useState<string>(() => {
    if (job.assignedDriverId) return job.assignedDriverId;
    return availableDrivers[0]?.id ?? allDriversStatic[0]?.id ?? "d1";
  });

  // Keep selectedDriverId valid when truck changes (only matters when idle)
  useEffect(() => {
    if (truckIsBusy) return;
    if (availableDrivers.some((d) => d.id === selectedDriverId)) return;
    if (availableDrivers[0]) setSelectedDriverId(availableDrivers[0].id);
  }, [truckIsBusy, availableDrivers, selectedDriverId]);

  /** The driver ID that will actually be written on the job. */
  const effectiveDriverId: string | null =
    truckIsBusy ? lockedDriverId : selectedDriverId;

  const effectiveDriver = allDriversStatic.find((d) => d.id === effectiveDriverId) ?? null;

  /* ── Assignment mode ─────────────────────────────────── */
  /** queued → job waits behind the active one; driver already in truck. */
  const assignmentMode: "assigned" | "queued" = truckIsBusy ? "queued" : "assigned";

  /* ── Truck dropdown labels ──────────────────────────── */
  const truckDisabled = (t: (typeof trucksLive)[0]) =>
    t.status === "maintenance" || t.maxWeightKg < job.totalWeightKg;

  const truckLabel = (t: (typeof trucksLive)[0]): string => {
    const base = `${t.plate} · ${t.name.slice(0, 20)}`;
    if (t.status === "maintenance")        return `${base} — Manutenção`;
    if (t.maxWeightKg < job.totalWeightKg) return `${base} — Capacidade insuficiente`;

    const activeJob = jobs
      .filter(
        (j) =>
          j.id !== job.id &&
          j.assignedTruckId === t.id &&
          (OPERATIONAL as string[]).includes(j.status),
      )
      .sort((a, b) => {
        const o: Record<string, number> = { in_transit: 0, loading: 1, assigned: 2 };
        return (o[a.status] ?? 9) - (o[b.status] ?? 9);
      })[0];

    if (activeJob) {
      const driver = allDriversStatic.find((d) => d.id === activeJob.assignedDriverId);
      const driverName = driver ? driver.name.split(" ")[0] : activeJob.assignedDriverId;
      const statusPt = STATUS_LABELS[activeJob.status] ?? activeJob.status;
      return `${base} — ${statusPt} · ${activeJob.id}${driverName ? ` (${driverName})` : ""}`;
    }

    return `${base} — Disponível`;
  };

  const sortedTrucks = useMemo(
    () =>
      [...trucksLive].sort((a, b) => {
        // Available first, then busy, then disabled
        const score = (t: (typeof trucksLive)[0]) => {
          if (truckDisabled(t)) return 2;
          const busy = jobs.some(
            (j) =>
              j.id !== job.id &&
              j.assignedTruckId === t.id &&
              (OPERATIONAL as string[]).includes(j.status),
          );
          return busy ? 1 : 0;
        };
        const sa = score(a), sb = score(b);
        if (sa !== sb) return sa - sb;
        return a.plate.localeCompare(b.plate);
      }),
    [trucksLive, jobs, job.id],
  );

  /* ── Route state ──────────────────────────────────────── */
  const [loading,          setLoading]          = useState(false);
  const [calcError,        setCalcError]        = useState<string | null>(null);
  const [options,          setOptions]          = useState<RoutePlanOption[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<RouteOptionId | null>(null);

  const truckIdForCalc = useRef(selectedTruckId);
  useEffect(() => { truckIdForCalc.current = selectedTruckId; }, [selectedTruckId]);

  /* ── Route calculation ────────────────────────────────── */
  const calculate = async (truckId: string) => {
    setLoading(true);
    setCalcError(null);
    setOptions([]);
    setSelectedOptionId(null);

    const sorted  = [...job.stops].sort((a, b) => a.sequence - b.sequence);
    const markers = buildMarkersFromJob(job);
    onRoutesReady([], null, markers);

    if (sorted.length < 2) {
      setCalcError("Este trabalho precisa de pelo menos 2 paragens com coordenadas.");
      setLoading(false);
      return;
    }

    /* No API key → haversine estimate */
    if (!apiKey) {
      let rawKm = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        rawKm += haversineKm(
          sorted[i]!.lat, sorted[i]!.lng,
          sorted[i + 1]!.lat, sorted[i + 1]!.lng,
        );
      }
      const km          = rawKm * 1.25;
      const durationSec = (km / 78) * 3_600;
      const fuelL       = (km * 32) / 100;
      const fuelCostEur = Math.round(fuelL * DEFAULT_FUEL_EUR_PER_L * 100) / 100;
      const est: RoutePlanOption = {
        id: "route-est", title: "Rota estimada",
        subtitle: `Estimativa sem TomTom · ${km.toFixed(0)} km`,
        polyline: [], distanceM: km * 1_000, durationSec,
        trafficDelaySec: 0, fuelCostEur, tollCostEur: 0,
        tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none",
        tollSectionCount: 0, stopArrivals: [], legDurationSec: [durationSec],
        colorIndex: 0, comparisonRole: "single",
      };
      setOptions([est]);
      setSelectedOptionId("route-est");
      onRoutesReady([est], "route-est", markers);
      setLoading(false);
      return;
    }

    /* TomTom routing */
    try {
      const waypoints     = sorted.map((s) => ({ lat: s.lat, lng: s.lng }));
      const preset        = routingPresetForFleetTruck(truckId);
      const waypointStops = sorted.slice(1).map((s) => ({
        id: s.id, name: s.city,
        windowStart: s.scheduledTime, windowEnd: s.windowEnd,
      }));
      const planned = await planRouteOptions(apiKey, waypoints, {
        waypointStops, fuelEurPerL: DEFAULT_FUEL_EUR_PER_L,
        departAt: new Date(),
        truck: { fleetTruckId: truckId, cargoWeightKg: job.totalWeightKg, preset },
      });
      const filtered = planned.filter((o, _, arr) => {
        const r = o.comparisonRole;
        if (r === "fastest" || r === "lowest_toll" || r === "most_fuel" || r === "single") return true;
        return o.id === arr.find((x) => x.comparisonRole === "other")?.id;
      });
      setOptions(filtered);
      const firstOk =
        filtered.find((p) => !p.error && p.polyline.length > 0) ??
        filtered.find((p) => !p.error && p.distanceM > 0);
      const selId   = firstOk?.id ?? null;
      setSelectedOptionId(selId);
      onRoutesReady(filtered, selId, markers);
    } catch (e) {
      setCalcError(e instanceof Error ? e.message : "Erro ao calcular rota.");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void calculate(truckIdForCalc.current); }, []);

  /* ── Derived ──────────────────────────────────────────── */
  const selectedOption = options.find((o) => o.id === selectedOptionId) ?? null;

  const hosIssues =
    selectedOption && effectiveDriver
      ? evaluateEuDrivingRules(
          selectedOption.legDurationSec,
          effectiveDriver.hoursToday,
          effectiveDriver.hoursWeek,
        )
      : [];

  /**
   * Hard blocker — only weekly-limit issues are critical.
   * Multi-day trips, daily soft limits, and break warnings are all informational.
   */
  const hasBlocker = hosIssues.some((i) => i.severity === "critical");

  const truckOk =
    !!selectedTruck &&
    selectedTruck.status !== "maintenance" &&
    job.totalWeightKg <= selectedTruck.maxWeightKg;

  const driverOk = !!effectiveDriverId;

  const canConfirmRoute =
    !!selectedOption &&
    !hasBlocker &&
    truckOk &&
    driverOk &&
    (truckIsBusy || availableDrivers.some((d) => d.id === selectedDriverId));

  const isAlreadyAssigned = job.status !== "backlog";
  const sla = slaChip(job.slaStatus);
  const firstStop = [...job.stops].sort((a, b) => a.sequence - b.sequence)[0]!;
  const lastStop  = [...job.stops].sort((a, b) => b.sequence - a.sequence)[0]!;

  /* ── Handlers ─────────────────────────────────────────── */
  const handleOptionSelect = (id: RouteOptionId) => {
    setSelectedOptionId(id);
    onRouteSelect(id);
  };

  const handleConfirm = () => {
    if (!selectedOption || !effectiveDriverId) return;
    planRoute(
      job.id,
      selectedTruckId,
      effectiveDriverId,
      Math.round(selectedOption.distanceM / 1_000),
      Math.round(selectedOption.durationSec / 60),
      Math.round((selectedOption.fuelCostEur + selectedOption.tollCostEur) * 100) / 100,
    );
    onConfirmed();
  };

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--app-card)]">

      {/* ── Job header ─────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--app-border)] p-4" style={{ background: "#E8F0EC" }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#2D5F4E" }}>
              {isAlreadyAssigned ? "Rever rota" : "Planear rota"}
            </p>
            <p className="mt-0.5 font-mono text-[15px] font-black leading-none" style={{ color: "#1A1A1A" }}>
              {job.id}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-semibold" style={{ color: "#2D5F4E" }}>
              {job.client}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 transition hover:bg-black/10"
            title="Fechar planeador"
          >
            <X className="h-4 w-4" style={{ color: "#2D5F4E" }} />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: "#4A7A6A" }}>
          <MapPin className="h-3 w-3 shrink-0" />
          {firstStop.city}
          <span className="opacity-50">→</span>
          {lastStop.city}
          {job.stops.length > 2 && (
            <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[9px] font-semibold" style={{ color: "#4A7A6A" }}>
              +{job.stops.length - 2} paragem{job.stops.length - 2 > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: "rgba(45,95,78,0.15)", color: "#2D5F4E" }}>
            {STATUS_LABELS[job.status]}
          </span>
          <span style={{ color: "#4A7A6A" }}>·</span>
          <span style={{ color: "#4A7A6A" }}>{job.totalPallets} plt · {(job.totalWeightKg / 1_000).toFixed(1)} t</span>
          <span style={{ color: "#4A7A6A" }}>·</span>
          <span className="font-semibold" style={{ color: sla.color }}>{sla.label}</span>
        </div>
      </div>

      {/* ── Route options ──────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--app-border)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">
            Opções de rota
          </h3>
          {!loading && (options.length > 0 || calcError) && (
            <button
              type="button"
              onClick={() => void calculate(selectedTruckId)}
              className="flex items-center gap-1 text-[10px] font-semibold text-[#2D5F4E] hover:underline"
            >
              <RefreshCw className="h-3 w-3" />
              Recalcular
            </button>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-[12px] text-[var(--app-muted)]">
            <Loader2 className="h-4 w-4 animate-spin text-[#2D5F4E]" />
            {apiKey ? "A calcular rotas TomTom…" : "A estimar rota…"}
          </div>
        )}

        {!loading && calcError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] text-rose-900">
            {calcError}
          </div>
        )}

        {!loading && !apiKey && options.length > 0 && (
          <p className="mb-2 text-[10px] text-[#8B6F47]">
            ⚠ Modo estimativa — distâncias aproximadas, sem GPS em tempo real.
          </p>
        )}

        {!loading && options.length > 0 && (
          <div className="space-y-2">
            {options
              .filter((o) => !o.error || o.polyline.length > 0)
              .map((opt) => {
                const isSel       = opt.id === selectedOptionId;
                const color       = routeLineBaseColor(opt);
                const driverHrsToday = effectiveDriver?.hoursToday ?? 0;
                const hosOpt      = effectiveDriver
                  ? evaluateEuDrivingRules(opt.legDurationSec, driverHrsToday, effectiveDriver.hoursWeek)
                  : [];
                const sched       = simulateDrivingSchedule(opt.durationSec, driverHrsToday);
                const realElapsed = sched.totalElapsedSec;
                const isMultiDay  = sched.restCount > 0;
                const desc        = scheduleDescription(opt.durationSec, driverHrsToday);

                return (
                  <button
                    key={opt.id}
                    id={`route-option-${opt.id}`}
                    type="button"
                    onClick={() => handleOptionSelect(opt.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isSel
                        ? "shadow-md"
                        : "border-[var(--app-border)] bg-[var(--app-elevated)] hover:border-[#2D5F4E]/40"
                    }`}
                    style={isSel ? { borderColor: color, background: `${color}14` } : undefined}
                  >
                    {/* Title row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px]">{roleIcon(opt.comparisonRole)}</span>
                        <span className="text-[12px] font-bold" style={{ color: isSel ? color : "var(--app-fg)" }}>
                          {roleLabel(opt.comparisonRole)}
                        </span>
                        {isMultiDay && (
                          <span className="rounded-full bg-[#E8F0EC] px-1.5 py-0.5 text-[9px] font-bold text-[#2D5F4E]">
                            {sched.drivingDays} dias
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {hosOpt.some((i) => i.severity === "critical") && (
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                        )}
                        {hosOpt.some((i) => i.severity === "warning") && !hosOpt.some((i) => i.severity === "critical") && (
                          <AlertTriangle className="h-3.5 w-3.5 text-[#8B6F47]" />
                        )}
                        {isSel && <CheckCircle2 className="h-3.5 w-3.5" style={{ color }} />}
                      </div>
                    </div>

                    {/* Stats grid — 4 cols */}
                    <div className="mt-2 grid grid-cols-4 gap-1 text-[11px]">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--app-muted)]">
                          Duração real
                        </p>
                        <p className="font-semibold text-[var(--app-fg)]">{fmtDur(realElapsed)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--app-muted)]">
                          Condução
                        </p>
                        <p className="font-semibold text-[var(--app-muted)]">{fmtDur(opt.durationSec)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--app-muted)]">Distância</p>
                        <p className="font-semibold text-[var(--app-fg)]">{(opt.distanceM / 1_000).toFixed(0)} km</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--app-muted)]">Custo est.</p>
                        <p className="font-semibold text-[var(--app-fg)]">€{(opt.fuelCostEur + opt.tollCostEur).toFixed(0)}</p>
                      </div>
                    </div>

                    {/* Schedule description */}
                    <p className="mt-2 text-[10px] leading-snug" style={{ color: isMultiDay ? "#4A7A6A" : "var(--app-muted)" }}>
                      {desc}
                    </p>

                    {/* Toll / traffic chips */}
                    {(opt.trafficDelaySec >= 5 * 60 || opt.tollCostEur > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {opt.tollCostEur > 0 && (
                          <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-semibold text-orange-800">
                            🛣 €{opt.tollCostEur.toFixed(2)} portagem
                          </span>
                        )}
                        {opt.trafficDelaySec >= 5 * 60 && (
                          <span className="rounded-full bg-[#F2EBE0] px-1.5 py-0.5 text-[9px] font-semibold text-[#7A5C2E]">
                            🚦 +{fmtDur(opt.trafficDelaySec)} trânsito
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* ── Assignment section ─────────────────────────── */}
      <div className="shrink-0 space-y-3 border-b border-[var(--app-border)] p-4">

        {/* Section title */}
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">
          Atribuição
        </h3>

        {/* ── Truck picker ─────────────────────────────── */}
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--app-fg)]">
            <Truck className="h-3.5 w-3.5 text-[#2D5F4E]" />
            Viatura
          </label>
          <div className="relative">
            <select
              value={selectedTruckId}
              onChange={(e) => setSelectedTruckId(e.target.value)}
              className="w-full appearance-none rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2.5 pr-8 text-[12px] font-semibold text-[var(--app-fg)] outline-none focus:border-[#2D5F4E] focus:ring-1 focus:ring-[#2D5F4E]/30"
            >
              {sortedTrucks.map((t) => (
                <option key={t.id} value={t.id} disabled={truckDisabled(t)}>
                  {truckLabel(t)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
          </div>

          {/* Truck status line */}
          {selectedTruck && (
            <p className={`mt-1 text-[10px] leading-snug ${
              !truckOk ? "text-rose-600" : "text-[var(--app-muted)]"
            }`}>
              {selectedTruck.status === "maintenance"
                ? "⛔ Viatura em manutenção — indisponível."
                : job.totalWeightKg > selectedTruck.maxWeightKg
                  ? `⛔ Capacidade insuficiente: ${(selectedTruck.maxWeightKg / 1_000).toFixed(0)} t disponível, ${(job.totalWeightKg / 1_000).toFixed(1)} t necessário.`
                  : truckIsBusy
                    ? `🔵 Em serviço · ${STATUS_LABELS[activeJobOnTruck!.status]} · ${activeJobOnTruck!.id} — novo trabalho entra na fila.`
                    : `🟢 Disponível · ${(selectedTruck.maxWeightKg / 1_000).toFixed(0)} t · ${selectedTruck.fuelPct}% combustível`
              }
            </p>
          )}
        </div>

        {/* ── Driver (derived from truck) ───────────────── */}
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--app-fg)]">
            <User className="h-3.5 w-3.5 text-[#2D5F4E]" />
            Motorista
          </label>

          {/* CASE 1 — truck in maintenance */}
          {selectedTruck?.status === "maintenance" && (
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2.5 text-[11px] text-[var(--app-muted)]">
              Viatura em manutenção — indisponível para atribuição.
            </div>
          )}

          {/* CASE 2 — truck BUSY → driver locked (already in the truck on the active job) */}
          {selectedTruck && selectedTruck.status !== "maintenance" && truckIsBusy && (
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2.5">
              {effectiveDriver ? (
                <>
                  <p className="text-[12px] font-semibold text-[var(--app-fg)]">{effectiveDriver.name}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--app-muted)]">
                    {effectiveDriver.hoursToday.toFixed(1)}h hoje · {effectiveDriver.hoursWeek.toFixed(1)}h esta semana · {effectiveDriver.license}
                  </p>
                  <p className="mt-1 text-[10px] text-[#2D5F4E]">
                    Em serviço em {activeJobOnTruck?.id} — este trabalho entra na fila com o mesmo motorista.
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-rose-700">
                  Não foi possível identificar o motorista em serviço.
                </p>
              )}
            </div>
          )}

          {/* CASE 3 — truck IDLE → pick an available driver */}
          {selectedTruck && selectedTruck.status !== "maintenance" && !truckIsBusy && (
            availableDrivers.length > 0 ? (
              <>
                <div className="relative">
                  <select
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2.5 pr-8 text-[12px] font-semibold text-[var(--app-fg)] outline-none focus:border-[#2D5F4E] focus:ring-1 focus:ring-[#2D5F4E]/30"
                  >
                    {availableDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.hoursToday.toFixed(1)}h hoje{d.hoursWeek >= 50 ? " ⚠" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-muted)]" />
                </div>
                {effectiveDriver && (
                  <p className="mt-1 text-[10px] text-[var(--app-muted)]">
                    {effectiveDriver.hoursWeek.toFixed(1)}h esta semana · limite {effectiveDriver.hoursLimit}h · {effectiveDriver.license}
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] text-rose-800">
                Nenhum motorista disponível — todos estão em serviço ou em infração.
              </div>
            )
          )}
        </div>

        {/* ── Queue notice ─────────────────────────────── */}
        {truckIsBusy && truckOk && (
          <div className="flex items-start gap-2 rounded-xl border border-[#2D5F4E]/20 bg-[#E8F0EC] px-3 py-2.5 text-[11px] text-[#2D5F4E]">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>Na fila</strong> — este trabalho aguarda que{" "}
              <strong>{activeJobOnTruck?.id}</strong> termine.
              Quando a viatura ficar livre, avança automaticamente.
            </span>
          </div>
        )}

        {/* ── HOS notices ─────────────────────────────────
              MULTI_DAY  → blue info box, not a problem
              warning    → amber, informativo, pode confirmar
              critical   → red, bloqueia confirmação          */}
        {hosIssues.length > 0 && (
          <div className="space-y-1.5">
            {hosIssues.map((issue, i) => {
              const isMultiDay = issue.code === "MULTI_DAY";
              const isCritical = issue.severity === "critical";
              return (
                <div
                  key={i}
                  className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-[11px] ${
                    isCritical
                      ? "bg-rose-50 text-rose-800"
                      : isMultiDay
                        ? "border border-[#2D5F4E]/20 bg-[#E8F0EC] text-[#2D5F4E]"
                        : "bg-[#F2EBE0] text-[#7A5C2E]"
                  }`}
                >
                  {isMultiDay
                    ? <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  }
                  <span>{issue.message}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Confirm ────────────────────────────────────── */}
      <div className="shrink-0 p-4">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirmRoute}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "#2D5F4E" }}
        >
          <CheckCircle2 className="h-4 w-4" />
          {assignmentMode === "queued"
            ? isAlreadyAssigned ? "Atualizar rota (na fila)" : "Confirmar — entrar na fila"
            : isAlreadyAssigned ? "Atualizar rota e viatura" : "Confirmar rota e atribuir"
          }
        </button>

        {hasBlocker && (
          <p className="mt-1.5 text-center text-[10px] text-rose-600">
            {hosIssues.find((i) => i.severity === "critical")?.code === "WEEKLY_EXCEEDED"
              ? "Limite semanal de condução atingido — motorista não pode partir."
              : "Esta viagem excede as horas semanais disponíveis do motorista."}
          </p>
        )}
        {!selectedOption && !loading && !calcError && (
          <p className="mt-1.5 text-center text-[10px] text-[var(--app-muted)]">
            Selecione uma opção de rota para continuar.
          </p>
        )}
        {loading && (
          <p className="mt-1.5 text-center text-[10px] text-[var(--app-muted)]">
            A aguardar cálculo de rota…
          </p>
        )}
      </div>
    </div>
  );
}
