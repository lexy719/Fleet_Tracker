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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Container, Loader2, RefreshCw, Truck, User, X } from "lucide-react";
import { useFleetData } from "../../context/FleetDataContext";
import { fmtHours, fmtWhen } from "../../ui/format";
import { Button, Drawer } from "../../ui/kit";
import { toneVars } from "../../ui/status";
import { CargoTag, DeadlineChip, JobIdentity, RouteLine } from "../../ui/work/JobVisuals";
import { nextCountdown } from "../../ui/work/workModel";
import { CheckRow, Delta, Details, riConclusion, Step, WINDOW_TEXT, type CheckVerdict } from "./DecisionParts";
import { STATUS_LABELS, useJobs } from "../../context/JobsContext";
import type { Driver, Job, JobStatus } from "../../data/types";
import { checkAssignment } from "../../domain/assignments/assignment";
import { driverHoursForPlanning, type PlanningHours } from "../../domain/drivers/drivers";
import { routingProfileForTruck } from "../../domain/fleet/routingProfile";
import { trailerTypeLabel } from "../../domain/fleet/trailers";
import { DEFAULT_TRUCK_PRESET_ID, getTruckPreset, type TruckPreset } from "../../tomtom/truckPresets";
import { evaluateEuDrivingRules, simulateDrivingSchedule } from "../../ops/euDrivingRules";
import { getTomTomKey } from "../../tomtom/config";
import {
  DEFAULT_FUEL_EUR_PER_L,
  planRouteOptions,
  routeLineBaseColor,
  type RoutePlanOption,
  type RouteOptionId,
} from "../../tomtom/planRoutes";
import type { RouteMapMarker } from "../routes/RoutePlannerMap";
import { DEFAULT_EVALUATE_OPTIONS, evaluateCompliance, type EvaluateOptions } from "../../regulations/evaluate";
import { DEFAULT_TIMING_MODEL, type TimingModel } from "../../regulations/timeline";
import { buildRouteStops, buildTransportFacts } from "../../regulations/fleetFacts";
import { useIngestion } from "../../context/IngestionContext";
import { useRoadEvents } from "../../context/RoadEventsContext";
import { assessRouteCoverage } from "../../ingestion/coverage";
import type { ComplianceReport, RegulationDataset, RouteComplianceRecord } from "../../regulations/types";
import type { PlanRoutePlanningOpts } from "../../tomtom/planRoutes";
import {
  officialAlternativesFollowed,
  optionWindowStatus,
  provenanceOf,
  rejectionReasons,
  reviewAlternatives,
  type AvoidancePlan,
} from "../../regulations/alternatives";
import { RouteCache } from "../../tomtom/routeCache";
import { canonicalJson, hashString } from "../../regulations/decisionInputs";
import { createComplianceRecord } from "../../regulations/decisionRecord";
import { assessPlannedJob } from "../../regulations/reevaluate";
import type { EvaluationInput } from "../../regulations/types";
import { RouteCompliancePanel, type AlternativeView } from "./RouteCompliancePanel";
import { CleanRoutesPanel } from "./CleanRoutesPanel";
import { RouteResearchControl } from "./RouteResearchControl";
import { STRATEGIES, useCleanRoutes } from "./useCleanRoutes";
import { type RouteStrategy } from "../../solver/types";
import type { RouteCoverage } from "../../ingestion/coverage";
import type { DiscoveryRun } from "../../discovery/types";
import { operationalTimeline } from "../../regulations/operationalTimeline";
import { decideRoutes } from "../../domain/routing/routeDecision";

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

const DECISION_LABELS = { RECOMMENDED: "Rota recomendada", MEANINGFUL_TOLL_TRADEOFF: "Menos portagens", MEANINGFUL_TIME_COST_TRADEOFF: "Alternativa de tempo e custo", DISTINCT_OPERATIONAL_CORRIDOR: "Outro corredor operacional" };
const providerRouteCache = new RouteCache<RoutePlanOption[]>();

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
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h === 0) return `${min} min`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

/** Build a one-line schedule description for the route card. */
function scheduleDescription(driveSec: number, hoursToday: number): string {
  // simulateDrivingSchedule expects SECONDS already driven today.
  const sched = simulateDrivingSchedule(driveSec, hoursToday * 3_600);

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


function roleLabel(role: RoutePlanOption["comparisonRole"]): string {
  switch (role) {
    case "fastest":     return "Mais rápida";
    case "lowest_toll": return "Menos portagens";
    case "most_fuel":   return "Menos combustível";
    case "single":      return "Rota calculada";
    default:            return "Rota alternativa";
  }
}


/* ── Props ───────────────────────────────────────────────── */
export type JobRoutePlannerProps = {
  job: Job;
  onRoutesReady: (
    options: RoutePlanOption[],
    selectedId: RouteOptionId | null,
    markers: RouteMapMarker[],
  ) => void;
  onRouteSelect: (id: RouteOptionId | null) => void;
  requestedRouteId?: RouteOptionId | null;
  onClose: () => void;
  onConfirmed: () => void;
};

/* ── Component ───────────────────────────────────────────── */
export function JobRoutePlanner({
  job,
  onRoutesReady,
  onRouteSelect,
  requestedRouteId,
  onClose,
  onConfirmed,
}: JobRoutePlannerProps) {
  const apiKey          = getTomTomKey();
  const { confirmPlan, jobs } = useJobs();
  const { trucksLive: allTrucksLive, drivers: allDrivers, trailers: allTrailers, getTruck } = useFleetData();
  // Archived resources are never offered for a new assignment.
  const trucksLive = useMemo(() => allTrucksLive.filter((t) => !t.archivedAt), [allTrucksLive]);
  const activeDrivers = useMemo(() => allDrivers.filter((d) => !d.archivedAt), [allDrivers]);
  const activeTrailers = useMemo(() => allTrailers.filter((t) => !t.archivedAt), [allTrailers]);

  /** Departure the plan is computed for (planned departure, else now) — also the EU 561 reference. */
  const departAtMs = useMemo(() => (job.plannedDepartureAt ? Date.parse(job.plannedDepartureAt) : Date.now()), [job.plannedDepartureAt]);

  /** Routing profile from the truck RECORD; generic preset only fills missing values (reported). */
  const presetFor = useCallback(
    (truckId: string): TruckPreset => {
      const t = getTruck(truckId);
      return t ? routingProfileForTruck(t).preset : getTruckPreset(DEFAULT_TRUCK_PRESET_ID);
    },
    [getTruck],
  );

  /* ── Truck selection ─────────────────────────────────── */
  const [selectedTruckId, setSelectedTruckId] = useState<string>(() => {
    if (job.assignedTruckId && trucksLive.some((t) => t.id === job.assignedTruckId)) return job.assignedTruckId;
    // Regulatory test jobs (J-DEMO-*) start on the regulatory test vehicle (explicit test data).
    if (job.isDemo && job.id.startsWith("J-DEMO")) {
      const demo = trucksLive.find((t) => t.demoPurpose === "regulatory-test");
      if (demo) return demo.id;
    }
    // Prefer idle truck with enough capacity; fallback to first capable truck
    const idle = trucksLive.find(
      (t) => t.operationalState === "AVAILABLE" && t.maxWeightKg >= job.totalWeightKg,
    );
    if (idle) return idle.id;
    const capable = trucksLive.find(
      (t) => t.availability === "AVAILABLE" && t.maxWeightKg >= job.totalWeightKg,
    );
    return capable?.id ?? trucksLive[0]?.id ?? "";
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
  /** Drivers that can be assigned: not on leave / unavailable, not currently on another active job. */
  const availableDrivers = useMemo(() => {
    if (truckIsBusy) return [];
    return activeDrivers
      .filter((d) => {
        if (d.availability === "LEAVE" || d.availability === "UNAVAILABLE") return false;
        return !jobs.some(
          (j) =>
            j.id !== job.id &&
            j.assignedDriverId === d.id &&
            (OPERATIONAL as string[]).includes(j.status),
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [truckIsBusy, jobs, job.id, activeDrivers]);

  const [selectedDriverId, setSelectedDriverId] = useState<string>(() => {
    if (job.assignedDriverId) return job.assignedDriverId;
    return availableDrivers[0]?.id ?? "";
  });
  const [selectedTrailerId, setSelectedTrailerId] = useState<string>(job.assignedTrailerId ?? "");

  // Keep selectedDriverId valid when truck changes (only matters when idle)
  useEffect(() => {
    if (truckIsBusy) return;
    if (availableDrivers.some((d) => d.id === selectedDriverId)) return;
    if (availableDrivers[0]) setSelectedDriverId(availableDrivers[0].id);
  }, [truckIsBusy, availableDrivers, selectedDriverId]);

  /** The driver ID that will actually be written on the job. */
  const effectiveDriverId: string | null =
    truckIsBusy ? lockedDriverId : selectedDriverId;

  const driverRecord: Driver | null = activeDrivers.find((d) => d.id === effectiveDriverId) ?? null;
  /** Hours fed to EU 561: the driver's recorded baseline, valid only for the departure's day/week. */
  const driverHours: PlanningHours = useMemo(() => driverHoursForPlanning(driverRecord, departAtMs), [driverRecord, departAtMs]);
  const effectiveDriver = useMemo(
    () =>
      driverRecord
        ? {
            id: driverRecord.id,
            name: driverRecord.name,
            hoursToday: driverHours.hoursToday,
            hoursWeek: driverHours.hoursWeek,
            hoursLimit: 56,
            license: driverRecord.licence.categories.join(", ") || "categorias não registadas",
          }
        : null,
    [driverRecord, driverHours],
  );
  const hoursFor = useCallback((d: Driver) => driverHoursForPlanning(d, departAtMs), [departAtMs]);

  /* ── Assignment mode ─────────────────────────────────── */
  /** queued → job waits behind the active one; driver already in truck. */
  const assignmentMode: "assigned" | "queued" = truckIsBusy ? "queued" : "assigned";

  /* ── Truck dropdown labels ──────────────────────────── */
  const truckDisabled = (t: (typeof trucksLive)[0]) =>
    t.availability !== "AVAILABLE" || (t.maxWeightKg > 0 && t.maxWeightKg < job.totalWeightKg);

  const truckLabel = (t: (typeof trucksLive)[0]): string => {
    const base = `${t.plate} · ${t.name.slice(0, 20)}${t.isDemo ? " (demo)" : ""}`;
    if (t.availability === "MAINTENANCE")    return `${base} — Manutenção`;
    if (t.availability === "OUT_OF_SERVICE") return `${base} — Fora de serviço`;
    if (t.maxWeightKg > 0 && t.maxWeightKg < job.totalWeightKg) return `${base} — Capacidade insuficiente`;

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
      const driver = allDrivers.find((d) => d.id === activeJob.assignedDriverId);
      const driverName = driver ? driver.name.split(" ")[0] : activeJob.assignedDriverId;
      const statusPt = STATUS_LABELS[activeJob.status] ?? activeJob.status;
      return `${base} — ${statusPt} · ${activeJob.jobNumber}${driverName ? ` (${driverName})` : ""}`;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trucksLive, jobs, job.id, job.totalWeightKg],
  );

  /* ── Route state ──────────────────────────────────────── */
  const [loading,          setLoading]          = useState(false);
  const [calcError,        setCalcError]        = useState<string | null>(null);
  const [options,          setOptions]          = useState<RoutePlanOption[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<RouteOptionId | null>(null);
  /** Departure used for the current options — sent to TomTom and used for ETAs / compliance. */
  const [plannedDepartAt,  setPlannedDepartAt]  = useState<Date | null>(null);

  /** Candidates from the documented POST avoidAreas request (verified by the engine before use). */
  const [avoidOptions,     setAvoidOptions]     = useState<RoutePlanOption[]>([]);
  const [altSearch,        setAltSearch]        = useState<{
    status: "idle" | "searching" | "done" | "unavailable" | "error";
    /** option:truck the search was run for — a different key means the result is stale. */
    key?: string;
    /** The affected option that triggered the search. */
    forOptionId?: string;
    plan?: AvoidancePlan;
    message?: string;
  }>({ status: "idle" });
  /** Inputs of the last TomTom calculation — reused for alternative searches. */
  const lastPlanning = useRef<{
    waypoints: { lat: number; lng: number }[];
    waypointStops: { id: string; name: string; windowStart?: string; windowEnd?: string }[];
    truckId: string;
    departAt: Date;
  } | null>(null);

  /** Everything the provider returned (baselines for the clean-route solver). */
  const [plannedAll, setPlannedAll] = useState<RoutePlanOption[]>([]);
  const [planningInput, setPlanningInput] = useState<{ waypoints: { lat: number; lng: number }[]; opts: PlanRoutePlanningOpts } | null>(null);


  /* ── Route calculation ────────────────────────────────── */
  const calculationEpoch = useRef(0);
  const calculate = async (truckId: string, refresh = false) => {
    const epoch = ++calculationEpoch.current;
    setLoading(true);
    setCalcError(null);
    setOptions([]);
    setSelectedOptionId(null);
    setAvoidOptions([]);
    setAltSearch({ status: "idle" });
    setPlannedAll([]);
    setPlanningInput(null);
    // Planned departure when the job has one (so time-bound events are checked at the real time).
    const departAt = job.plannedDepartureAt ? new Date(job.plannedDepartureAt) : new Date();
    setPlannedDepartAt(departAt);

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
        legPointCounts: [], roadNumbers: [], departAtIso: departAt.toISOString(),
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
      const preset        = presetFor(truckId);
      const waypointStops = sorted.slice(1).map((s) => ({
        id: s.id, name: s.city,
        windowStart: s.scheduledTime, windowEnd: s.windowEnd,
      }));
      lastPlanning.current = { waypoints, waypointStops, truckId, departAt };
      const opts: PlanRoutePlanningOpts = {
        waypointStops, fuelEurPerL: DEFAULT_FUEL_EUR_PER_L,
        departAt,
        truck: { fleetTruckId: truckId, cargoWeightKg: job.totalWeightKg, preset },
      };
      const cacheKey = canonicalJson({ credential: hashString(apiKey), waypoints, opts: { ...opts, departAt: departAt.toISOString() }, trailer: selectedTrailer, cargo: job.cargo, cargoType: job.cargoType, adr: job.adrClass, adrUnNumber: job.adrUnNumber, recordedFacts: job.recordedFacts });
      const planned = await providerRouteCache.get(cacheKey, async () => {
        const result = await planRouteOptions(apiKey, waypoints, opts);
        if (!result.some((o) => !o.error && o.polyline.length > 1)) throw new Error(result[0]?.error ?? "Fornecedor sem rota utilizável");
        return result;
      }, Date.now(), refresh);
      if (epoch !== calculationEpoch.current) return;
      setPlannedAll(planned);
      setPlanningInput({ waypoints, opts });
      setOptions(planned);
      setSelectedOptionId(null);
    } catch (e) {
      if (epoch === calculationEpoch.current) setCalcError(e instanceof Error ? e.message : "Erro ao calcular rota.");
    } finally {
      if (epoch === calculationEpoch.current) setLoading(false);
    }
  };


  /* ── Derived ──────────────────────────────────────────── */
  const selectedOption = options.find((o) => o.id === selectedOptionId) ?? null;

  const hosIssues =
    selectedOption && effectiveDriver
      ? evaluateEuDrivingRules(
          [selectedOption.durationSec],
          effectiveDriver.hoursToday,
          effectiveDriver.hoursWeek,
        )
      : [];

  /**
   * Hard blocker — only weekly-limit issues are critical.
   * Multi-day trips, daily soft limits, and break warnings are all informational.
   */
  const hasBlocker = hosIssues.some((i) => i.severity === "critical");

  const selectedTrailer = activeTrailers.find((t) => t.id === selectedTrailerId);
  const assignment = useMemo(
    () =>
      checkAssignment({
        jobs,
        job,
        truck: getTruck(selectedTruckId),
        driver: driverRecord ?? undefined,
        trailer: selectedTrailer,
        trailerId: selectedTrailerId || undefined,
        now: new Date(),
      }),
    [jobs, job, getTruck, selectedTruckId, driverRecord, selectedTrailer, selectedTrailerId],
  );
  const truckOk = !!selectedTruck && assignment.blockers.length === 0;

  const driverOk = !!effectiveDriverId;

  /* ── Regulatory compliance (generic engine, data-driven restrictions) ── */
  const { dataset: regulationDataset } = useRoadEvents();
  const providerInputKey = canonicalJson({ jobId: job.id, stops: job.stops, depart: job.plannedDepartureAt, cargo: job.cargo, weight: job.totalWeightKg, cargoType: job.cargoType, adr: job.adrClass, adrUnNumber: job.adrUnNumber, facts: job.recordedFacts, profile: presetFor(selectedTruckId), truckId: selectedTruckId, trailer: selectedTrailer });
  const calculatedFor = useRef<string | null>(null);
  useEffect(() => {
    if (calculatedFor.current === providerInputKey) return;
    calculatedFor.current = providerInputKey;
    void calculate(selectedTruckId);
    // Re-rendering alone never changes the input fingerprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerInputKey]);
  const routingProfile    = useMemo(() => {
    const t = getTruck(selectedTruckId);
    return t ? routingProfileForTruck(t) : null;
  }, [getTruck, selectedTruckId]);
  const routingPreset     = routingProfile?.preset;
  const complianceFacts   = useMemo(
    () => buildTransportFacts(selectedTruck, job, routingPreset),
    [selectedTruck, job, routingPreset],
  );

  /** Evaluation input + options for one route option — the single definition used live AND when persisting. */
  const evaluationFor = useCallback(
    (o: RoutePlanOption, departMs: number): { input: EvaluationInput; options: EvaluateOptions } => {
      // Driving timeline: mandatory stops placed along route progress, LOCAL passage windows
      // (a restriction 45 min into the trip never inherits the rests of hour 9).
      const timing: TimingModel = { ...DEFAULT_TIMING_MODEL, driver: { drivenTodaySec: (effectiveDriver?.hoursToday ?? 0) * 3_600, continuousSec: 0 } };
      return {
        input: {
          route: operationalTimeline(o, departMs, effectiveDriver?.hoursToday ?? 0, timing).routeInput,
          stops: buildRouteStops(job, regulationDataset.areas),
          facts: complianceFacts,
          routeRoadNumbers: o.roadNumbers,
        },
        options: { timeToleranceMin: DEFAULT_EVALUATE_OPTIONS.timeToleranceMin, sampleStepMin: 5, timing },
      };
    },
    [effectiveDriver?.hoursToday, job, regulationDataset, complianceFacts],
  );

  /* ── Clean-route solver (Phase 3C): every strategy cleaned independently ── */
  const solverEvaluate = useCallback(
    (o: RoutePlanOption, ds: RegulationDataset) => {
      const departMs = plannedDepartAt?.getTime() ?? Date.now();
      const { input, options: evalOpts } = evaluationFor(o, departMs);
      return evaluateCompliance(ds, { ...input, stops: buildRouteStops(job, ds.areas) }, evalOpts);
    },
    [plannedDepartAt, evaluationFor, job],
  );
  const cleanStates = useCleanRoutes({
    job,
    apiKey: apiKey ?? null,
    planned: plannedAll,
    planning: planningInput,
    departAt: plannedDepartAt,
    truckId: selectedTruckId,
    facts: complianceFacts,
    evaluate: solverEvaluate,
    timingKey: canonicalJson({ driverId: effectiveDriverId, hoursToday: driverHours.hoursToday, hoursWeek: driverHours.hoursWeek, trailer: selectedTrailer, cargo: job.cargo, cargoType: job.cargoType, adrClass: job.adrClass, adrUnNumber: job.adrUnNumber }),
  });
  const cleanOptions = useMemo(
    () => STRATEGIES.map((s) => cleanStates[s].finalOption).filter((o): o is RoutePlanOption => !!o),
    [cleanStates],
  );

  const candidateOptions = useMemo(() => [...new Map([...plannedAll, ...options, ...cleanOptions, ...STRATEGIES.flatMap((st) => cleanStates[st].candidates ?? [])].map((o) => [o.id, o])).values()], [plannedAll, options, cleanOptions, cleanStates]);

  const complianceByOption = useMemo(() => {
    const out: Record<string, ComplianceReport> = {};
    if (!plannedDepartAt) return out;
    const departMs = plannedDepartAt.getTime();
    for (const o of candidateOptions) {
      if (o.error && o.polyline.length === 0) continue;
      const { input, options: evalOpts } = evaluationFor(o, departMs);
      out[o.id] = evaluateCompliance(regulationDataset, input, evalOpts);
    }
    return out;
  }, [candidateOptions, plannedDepartAt, regulationDataset, evaluationFor]);

  const selectedCompliance = selectedOption ? complianceByOption[selectedOption.id] : undefined;
  const ingestion = useIngestion();
  const selectedCoverage = useMemo(
    () =>
      selectedOption && selectedCompliance
        ? assessRouteCoverage({
            route: selectedOption.polyline,
            index: ingestion.municipalities,
            sources: ingestion.sources,
            freshness: ingestion.freshness,
            candidates: ingestion.candidates,
            status: selectedCompliance.status,
          })
        : undefined,
    [selectedOption, selectedCompliance, ingestion.municipalities, ingestion.freshness, ingestion.candidates, ingestion.sources],
  );
  const cleanCoverage = useMemo(() => {
    const out: Partial<Record<RouteStrategy, RouteCoverage>> = {};
    for (const s of STRATEGIES) {
      const r = cleanStates[s].result;
      if (!r?.final) continue;
      out[s] = assessRouteCoverage({
        route: r.final.route.polyline,
        index: ingestion.municipalities,
        sources: ingestion.sources,
        freshness: ingestion.freshness,
        candidates: ingestion.candidates,
        status: r.final.report.status,
      });
    }
    return out;
  }, [cleanStates, ingestion.municipalities, ingestion.sources, ingestion.freshness, ingestion.candidates]);
  const cleanDiscovery = useMemo(() => {
    const out: Partial<Record<RouteStrategy, DiscoveryRun>> = {};
    for (const s of STRATEGIES) {
      const id = cleanStates[s].result?.discoveryRunIds.at(-1);
      const run = id ? ingestion.discoveryRuns.find((r) => r.id === id) : undefined;
      if (run) out[s] = run;
    }
    return out;
  }, [cleanStates, ingestion.discoveryRuns]);
  const applyCleanRoute = (s: RouteStrategy) => {
    const id = cleanStates[s].finalOption?.id;
    const d = decisionSet.decisions.find((x) => x.candidateIds.includes(id ?? ""));
    if (d) handleOptionSelect(d.routeId);
  };

  /** A verified violation blocks; so does a failed or missing evaluation. UNKNOWN does not. */
  const complianceBlocks = selectedCompliance?.status === "ROUTE_AFFECTED";
  const complianceUnusable = !!selectedOption && (!selectedCompliance || selectedCompliance.status === "EVALUATION_ERROR");

  /* ── Alternatives for an affected route ───────────────────────────
     Candidates = TomTom's own alternatives + a documented POST avoidAreas request
     built from the affected constraints' resolved geometry. Every candidate is
     re-evaluated by the same engine; nothing is assumed compliant. */
  /** The affected route the search was run for (the "original"). */
  const originalOption =
    [...options, ...avoidOptions].find((o) => o.id === altSearch.forOptionId) ?? null;
  const originalReport = originalOption ? complianceByOption[originalOption.id] : undefined;
  const affectedRegulationIds = (originalReport ?? selectedCompliance)?.results
    .filter((r) => r.outcome === "APPLIES")
    .map((r) => r.regulationId) ?? [];

  const departMsForWindows = plannedDepartAt?.getTime() ?? Number.NaN;
  const hoursToday = effectiveDriver?.hoursToday ?? 0;

  const alternativeViews: AlternativeView[] = originalOption
    ? reviewAlternatives(originalOption, [...options, ...avoidOptions], complianceByOption)
        .map((c): AlternativeView => {
          const o = c.option;
          const via = o.polyline.length >= 2 ? officialAlternativesFollowed(o.polyline, affectedRegulationIds, regulationDataset) : [];
          return {
            optionId: o.id,
            verdict: c.sameAsOriginal ? "rejected" : c.verdict,
            status: c.report?.status,
            distanceM: o.distanceM,
            durationSec: o.durationSec,
            deltaDistanceM: o.distanceM - originalOption.distanceM,
            deltaDurationSec: o.durationSec - originalOption.durationSec,
            via: via.map((v) => `${v.label} · ${v.matchedKm.toFixed(1)} km`),
            method: c.provenance.join(" + "),
            arrivalAtIso: o.arrivalAtIso,
            deliveryWindow: optionWindowStatus(o, job, departMsForWindows, hoursToday),
            rejectedBecause: c.sameAsOriginal
              ? ["mesmo percurso que a rota original (o fornecedor não evitou a restrição)"]
              : c.verdict === "rejected" && c.report
                ? rejectionReasons(c.report).slice(0, 1)
                : c.verdict === "error"
                  ? ["erro de avaliação"]
                  : c.verdict === "not_evaluated"
                    ? ["rota sem geometria utilizável — não avaliada"]
                    : [],
            isSelected: o.id === selectedOptionId,
          };
        })
        .sort((a, b) => {
          const rank = { compliant: 0, uncertain: 1, rejected: 2, error: 3, not_evaluated: 4 } as const;
          return rank[a.verdict] - rank[b.verdict] || a.durationSec - b.durationSec;
        })
    : [];

  const applyAlternative = (id: string) => {
    const alt = avoidOptions.find((o) => o.id === id);
    let next = options;
    if (alt && !options.some((o) => o.id === id)) {
      next = [...options, alt];
      setOptions(next);
    }
    setSelectedOptionId(id);
    onRoutesReady(next, id, buildMarkersFromJob(job));
    onRouteSelect(id);
  };

  /** State of the decision already saved on this job (stale inputs, new events, legacy data…). */
  const savedDecision = useMemo(
    () => assessPlannedJob(job, trucksLive.find((t) => t.id === job.assignedTruckId) ?? null, regulationDataset),
    [job, trucksLive, regulationDataset],
  );

  const previousRecommendation = useRef<Pick<RoutePlanOption, "polyline" | "distanceM"> | undefined>(job.routeCompliance?.route);
  const decisionSet = useMemo(() => decideRoutes(candidateOptions.map((o) => ({
    option: o, report: complianceByOption[o.id],
    elapsedSec: operationalTimeline(o, departMsForWindows, hoursToday).elapsedSec,
    window: optionWindowStatus(o, job, departMsForWindows, hoursToday),
    criticalHours: !!effectiveDriver && evaluateEuDrivingRules([o.durationSec], hoursToday, effectiveDriver.hoursWeek).some((i) => i.severity === "critical"),
    coverageComplete: false,
    provenance: [provenanceOf(o), ...STRATEGIES.filter((st) => cleanStates[st].finalOption?.id === o.id).map((st) => cleanStates[st].result?.deviations.map((d) => d.reason).join("; ") || "Road Intelligence: reavaliada")],
  })), previousRecommendation.current), [candidateOptions, complianceByOption, departMsForWindows, hoursToday, job, effectiveDriver, cleanStates]);
  const decisionIds = decisionSet.decisions.map((d) => d.routeId).join(",");
  useEffect(() => {
    const chosen = decisionSet.decisions.find((d) => d.routeId === selectedOptionId) ?? decisionSet.decisions.find((d) => d.routeId === decisionSet.recommendedRouteId);
    const id = chosen?.routeId ?? null;
    previousRecommendation.current = decisionSet.decisions.find((d) => d.routeId === decisionSet.recommendedRouteId)?.option;
    if (chosen && !options.some((o) => o.id === id)) setOptions((prev) => [...prev, chosen.option]);
    if (id !== selectedOptionId) setSelectedOptionId(id);
    onRoutesReady(decisionSet.decisions.map((d) => ({ ...d.option, title: DECISION_LABELS[d.reason] })), id, buildMarkersFromJob(job));
    onRouteSelect(id);
    // The map refreshes when the decision identity, geometry, or selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionIds, selectedOptionId, candidateOptions, onRoutesReady, onRouteSelect]);

  const solving = STRATEGIES.some((s) => cleanStates[s].status === "solving" || (cleanStates[s].status === "idle" && plannedAll.length > 0 && !!apiKey));
  const canConfirmRoute =
    !!selectedOption &&
    !complianceBlocks &&
    !loading && !solving && decisionSet.decisions.some((d) => d.routeId === selectedOption.id) &&
    !hasBlocker &&
    !complianceUnusable &&
    truckOk &&
    driverOk &&
    (truckIsBusy || availableDrivers.some((d) => d.id === selectedDriverId));

  const isAlreadyAssigned = job.status !== "backlog";

  /* ── Handlers ─────────────────────────────────────────── */
  const handleOptionSelect = (id: RouteOptionId) => {
    const choice = decisionSet.decisions.find((d) => d.routeId === id);
    if (!choice) return;
    if (!options.some((o) => o.id === id)) setOptions((prev) => [...prev, choice.option]);
    setSelectedOptionId(id);
    onRouteSelect(id);
  };

  useEffect(() => {
    if (requestedRouteId && requestedRouteId !== selectedOptionId && decisionSet.decisions.some((d) => d.routeId === requestedRouteId)) handleOptionSelect(requestedRouteId);
    // An external route click must select the same decision used for confirmation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedRouteId]);

  const buildComplianceRecord = (): RouteComplianceRecord | null => {
    if (!selectedOption || !selectedCompliance || !plannedDepartAt) return null;
    const titleOf = (o: RoutePlanOption) => { const d = decisionSet.decisions.find((d) => d.routeId === o.id); return d ? DECISION_LABELS[d.reason] : provenanceOf(o); };
    const { input, options: evalOpts } = evaluationFor(selectedOption, plannedDepartAt.getTime());
    const replacesOriginal =
      !!originalOption && !!originalReport && originalOption.id !== selectedOption.id && originalReport.status === "ROUTE_AFFECTED";
    return createComplianceRecord({
      job,
      truck: selectedTruck,
      dataset: regulationDataset,
      option: selectedOption,
      title: titleOf(selectedOption),
      departAt: plannedDepartAt,
      liveInput: input,
      evaluationOptions: evalOpts,
      liveReport: selectedCompliance,
      followsOfficialAlternatives: officialAlternativesFollowed(selectedOption.polyline, affectedRegulationIds, regulationDataset),
      plan: altSearch.plan,
      original: replacesOriginal ? { option: originalOption!, title: titleOf(originalOption!), report: originalReport! } : undefined,
    });
  };

  const [confirmError, setConfirmError] = useState<string | null>(null);
  const handleConfirm = () => {
    if (!selectedOption || !effectiveDriverId || !canConfirmRoute || !assignment.mode) return;
    const built = buildComplianceRecord();
    const selectedFamily = decisionSet.decisions.find((d) => d.routeId === selectedOption.id);
    const strategy = STRATEGIES.find((s) => selectedFamily?.candidateIds.includes(cleanStates[s].finalOption?.id ?? ""));
    const solved = strategy ? cleanStates[strategy].result : undefined;
    const record = built && solved
      ? {
          ...built,
          cleanRoute: {
            strategy: solved.strategy,
            solvedAt: solved.solvedAt,
            outcome: solved.outcome,
            baseline: { distanceM: solved.baseline.route.distanceM, durationSec: solved.baseline.route.durationSec, provenance: solved.baseline.route.provenance },
            total: solved.total,
            deviations: solved.deviations.map((d) => ({
              reason: d.reason,
              constraintIds: d.triggers.map((t) => t.constraintId),
              deltaDistanceM: d.deltaDistanceM,
              deltaDurationSec: d.deltaDurationSec,
              perConstraintImpact: d.perConstraintImpact,
            })),
            datasetVersion: solved.datasetVersion,
            discoveryRunIds: solved.discoveryRunIds,
            ...(solved.coverageAtSolve ? { outsideTerritoryKm: solved.coverageAtSolve.outsideTerritoryKm, coverageHeadline: solved.coverageAtSolve.headline } : {}),
          },
        }
      : built;
    if (!record) {
      setConfirmError("Não foi possível guardar uma decisão de conformidade reprodutível para esta rota — confirmação cancelada.");
      return;
    }
    setConfirmError(null);
    const decision = {
      confirmedAt: new Date().toISOString(),
      routeTitle: routeRows.find((r) => r.id === selectedOption.id)?.title ?? roleLabel(selectedOption.comparisonRole),
      departureAt: (plannedDepartAt ?? new Date()).toISOString(),
      arrivalAt: operationalTimeline(selectedOption, departMsForWindows, hoursToday).arrivalAtIso,
      routingDecision: { recommendedRouteId: decisionSet.recommendedRouteId, selectedRouteId: selectedOption.id, evaluatedCandidateCount: decisionSet.evaluatedCandidateCount, excludedCandidateCount: decisionSet.excludedCandidateCount, executableCandidateCount: decisionSet.executableCandidateCount, decisionCount: decisionSet.decisions.length, fastestRouteId: decisionSet.fastestRouteId, bestValueRouteId: decisionSet.bestValueRouteId, lowestCostRouteId: decisionSet.lowestCostRouteId, decisionStatus: decisionSet.decisionStatus, tradeoffExists: decisionSet.tradeoffExists, unresolvedIssues: decisionSet.unresolvedIssues, provenance: selectedFamily?.provenance, familyId: selectedFamily?.familyId, reason: decisionSet.decisions.find((d) => d.routeId === selectedOption.id)?.explanation, policyVersion: 1 },
      windowResult: { ok: windowNow.verdict === "OK" ? true : windowNow.verdict === "BLOCKS" ? false : null, text: windowNow.text },
      eu561: { ok: eu561.verdict === "OK" ? true : eu561.verdict === "BLOCKS" ? false : null, text: eu561.text },
      roadIntelligence: { tone: ri.tone === "ok" ? "ok" as const : ri.tone === "warn" ? "warn" as const : ri.tone === "danger" ? "danger" as const : "neutral" as const, text: ri.text },
      assumptions: [...assumed, ...driverHours.notes],
    };
    void confirmPlan(job.id, {
      truckId: selectedTruckId,
      driverId: effectiveDriverId,
      ...(selectedTrailerId ? { trailerId: selectedTrailerId } : {}),
      mode: assignment.mode,
      km: Math.round(selectedOption.distanceM / 1_000),
      durationMin: Math.round(operationalTimeline(selectedOption, departMsForWindows, hoursToday).elapsedSec / 60),
      costEur: Math.round((selectedOption.fuelCostEur + selectedOption.tollCostEur) * 100) / 100,
      compliance: record,
      decision,
    }).then((r) => {
      if (!r.ok) setConfirmError(r.errors.join("; "));
      else onConfirmed();
    });
  };

  /* ── Unified route list (provider, solver and avoid-area options — provenance under Details) ── */
  const routeRows = decisionSet.decisions.map((d) => ({
    id: d.routeId, option: d.option,
    title: DECISION_LABELS[d.reason],
    provenance: [...d.provenance, d.explanation], select: () => handleOptionSelect(d.routeId),
  }));

  const realSec = (o: RoutePlanOption) => operationalTimeline(o, departMsForWindows, hoursToday).elapsedSec;
  const costOf = (o: RoutePlanOption) => o.fuelCostEur + o.tollCostEur;

  /* ── Checks ── */
  const isDriverMsg = (m: string) => /motorista|^carta|^cam|^adr \(|tacógrafo/i.test(m);
  const truckBlockers = assignment.blockers.filter((m) => !isDriverMsg(m));
  const truckWarnings = assignment.warnings.filter((m) => !isDriverMsg(m));
  const driverBlockers = assignment.blockers.filter(isDriverMsg);
  const driverWarnings = assignment.warnings.filter(isDriverMsg);
  const hosWarnings = hosIssues.filter((i) => i.severity === "warning" && i.code !== "MULTI_DAY");
  const weekAfter = effectiveDriver && selectedOption ? effectiveDriver.hoursWeek + selectedOption.durationSec / 3_600 : null;
  const eu561: { verdict: CheckVerdict; text: string } = !effectiveDriver
    ? { verdict: "UNKNOWN", text: "Sem motorista selecionado" }
    : !selectedOption
      ? { verdict: "UNKNOWN", text: "Por calcular" }
      : hasBlocker
        ? { verdict: "BLOCKS", text: hosIssues.find((i) => i.severity === "critical")?.code === "WEEKLY_EXCEEDED" ? "Limite semanal atingido — não pode partir" : "Excede as horas semanais disponíveis" }
        : !driverHours.weekKnown
          ? { verdict: "UNKNOWN", text: `Base de horas desconhecida · ${fmtHours(weekAfter!)} contando só esta viagem` }
          : hosWarnings.length
            ? { verdict: "RISK", text: `Legal com avisos · ${fmtHours(weekAfter!)} esta semana` }
            : { verdict: "OK", text: `Legal · ${fmtHours(weekAfter!)} esta semana` };
  const driverVerdict: CheckVerdict = driverBlockers.length || !driverOk ? "BLOCKS" : eu561.verdict === "BLOCKS" ? "BLOCKS" : driverWarnings.length || eu561.verdict === "RISK" ? "RISK" : eu561.verdict;
  const truckVerdict: CheckVerdict = !selectedTruck || truckBlockers.length ? "BLOCKS" : truckWarnings.length ? "RISK" : "OK";
  const windowNow = selectedOption ? WINDOW_TEXT[optionWindowStatus(selectedOption, job, departMsForWindows, hoursToday)] : { verdict: "UNKNOWN" as const, text: "Por calcular" };
  const ri = riConclusion(selectedCompliance?.status, !!selectedCoverage?.complete);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const assumed = routingProfile?.assumed ?? [];

  /** Why the primary action is disabled — shown right next to it. */
  const blockReason: string | null = loading
    ? "A calcular rotas…"
    : calcError
      ? "Não foi possível calcular rotas."
      : !selectedOption
        ? "Escolha uma opção de rota."
        : truckBlockers[0] ?? driverBlockers[0] ?? (!driverOk ? "Nenhum motorista disponível." : null) ?? (hasBlocker ? eu561.text + "." : null) ?? (complianceBlocks ? "Rota afetada por restrição verificada — escolha outra rota." : null) ?? (complianceUnusable ? "Avaliação de restrições indisponível para esta rota." : null) ?? (!canConfirmRoute ? "Verifique os recursos selecionados." : null);

  /* ── Render ──────────────────────────────────────────── */
  const selectCls = "ui-input h-9 w-full text-[13px]";
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {/* 1 · Trabalho */}
        <section className="border-b border-[var(--border)] px-5 py-4" data-testid="decision-job">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">{job.planStatus === "REPLAN_REQUIRED" ? "Replanear" : isAlreadyAssigned ? "Rever plano" : "Planear e atribuir"}</p>
              <JobIdentity job={job} />
            </div>
            <DeadlineChip c={nextCountdown(job, new Date())} />
            <button type="button" onClick={onClose} className="shrink-0 rounded-[var(--r-md)] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]" aria-label="Fechar planeador">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2.5"><RouteLine job={job} variant="compact" now={new Date()} /></div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-2)]">
            <CargoTag job={job} />
            {job.planStatus === "REPLAN_REQUIRED" && job.planInvalidation ? <span className="text-[var(--warn)]">Alterado: {job.planInvalidation.fields.join(", ")}</span> : null}
          </div>
        </section>

        {/* 2 · Recursos */}
        <Step n={2} title="Recursos">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--text-2)]"><Truck className="h-3.5 w-3.5" />Viatura</span>
              <select value={selectedTruckId} onChange={(e) => setSelectedTruckId(e.target.value)} className={selectCls} aria-label="Viatura">
                {sortedTrucks.map((t) => (
                  <option key={t.id} value={t.id} disabled={truckDisabled(t)}>{truckLabel(t)}</option>
                ))}
              </select>
              <span className="mt-1 block truncate text-[12px] text-[var(--text-3)]" data-testid="truck-summary">
                {!selectedTruck ? "—" : selectedTruck.availability !== "AVAILABLE" ? (selectedTruck.availability === "MAINTENANCE" ? "Em manutenção" : "Fora de serviço") : truckIsBusy ? `Em serviço · ${activeJobOnTruck!.jobNumber} — entra na fila` : `Livre · carga útil ${selectedTruck.maxWeightKg ? `${(selectedTruck.maxWeightKg / 1_000).toFixed(1)} t` : "desconhecida"}`}
              </span>
            </label>
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--text-2)]"><User className="h-3.5 w-3.5" />Motorista</span>
              {truckIsBusy ? (
                <div className={clsx(selectCls, "flex items-center bg-[var(--surface-2)] text-[var(--text-2)]")}>{effectiveDriver?.name ?? "Motorista em serviço desconhecido"}</div>
              ) : availableDrivers.length ? (
                <select value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)} className={selectCls} aria-label="Motorista">
                  {availableDrivers.map((d) => {
                    const h = hoursFor(d);
                    return <option key={d.id} value={d.id}>{d.name} · {h.weekKnown ? `${h.hoursWeek.toFixed(1)} h semana` : "horas desconhecidas"}{d.isDemo ? " (demo)" : ""}</option>;
                  })}
                </select>
              ) : (
                <div className={clsx(selectCls, "flex items-center text-[var(--danger)]")}>Nenhum motorista disponível</div>
              )}
              <span className="mt-1 block truncate text-[12px] text-[var(--text-3)]" data-testid="driver-summary">
                {effectiveDriver ? (truckIsBusy ? `Já na viatura (${activeJobOnTruck?.jobNumber})` : `${effectiveDriver.license}${driverHours.weekKnown ? ` · ${fmtHours(effectiveDriver.hoursWeek)} esta semana` : " · base de horas desconhecida"}`) : "—"}
              </span>
            </label>
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--text-2)]"><Container className="h-3.5 w-3.5" />Reboque</span>
              <select value={selectedTrailerId} onChange={(e) => setSelectedTrailerId(e.target.value)} aria-label="Reboque" className={selectCls}>
                <option value="">Sem reboque</option>
                {activeTrailers.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.availability !== "AVAILABLE"}>
                    {t.plate} · {trailerTypeLabel(t)}{t.payloadKg ? ` · ${(t.payloadKg / 1000).toFixed(1)} t` : ""}{t.isDemo ? " (demo)" : ""}{t.availability !== "AVAILABLE" ? " — indisponível" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block truncate text-[12px] text-[var(--text-3)]">{selectedTrailerId ? trailerTypeLabel(activeTrailers.find((t) => t.id === selectedTrailerId)!) : "Opcional"}</span>
            </label>
          </div>
          {assumed.length > 0 ? (
            <div className="mt-2" data-testid="routing-profile">
              <Details label={<span>{assumed.length} {assumed.length === 1 ? "valor assumido" : "valores assumidos"} no cálculo da rota · <span className="underline">Ver detalhes</span></span>}>
                <p>A ficha da viatura não regista estes valores; foi usado o perfil genérico:</p>
                <ul className="list-disc pl-4">{assumed.map((a) => <li key={a}>{a}</li>)}</ul>
                {routingProfile?.fromRecord.length ? <p className="text-[var(--text-3)]">Da ficha: {routingProfile.fromRecord.join(", ")}.</p> : null}
              </Details>
            </div>
          ) : null}
        </Step>

        {/* 3 · Opções de rota */}
        <Step
          n={3}
          title="Opções de rota"
          aside={
            <>
              {plannedDepartAt ? <span className="num text-[var(--text-3)]">partida {job.plannedDepartureAt ? "" : "agora · "}{fmtWhen(plannedDepartAt.toISOString())}</span> : null}
              {!loading && (options.length > 0 || calcError) ? (
                <button type="button" onClick={() => void calculate(selectedTruckId, true)} className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"><RefreshCw className="h-3 w-3" />Recalcular</button>
              ) : null}
            </>
          }
        >
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-[13px] text-[var(--text-2)]"><Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />{apiKey ? "A calcular rotas…" : "A estimar rota…"}</div>
          ) : calcError ? (
            <p className="rounded-[var(--r-md)] bg-[var(--danger-soft)] px-3 py-2 text-[12.5px] text-[var(--danger)]">{calcError}</p>
          ) : (
            <>
              {!apiKey && options.length > 0 ? <p className="mb-2 text-[12px] text-[var(--warn)]">Estimativa sem fornecedor de rotas — distâncias aproximadas.</p> : null}
              <ul className="divide-y divide-[var(--border)] rounded-[var(--r-md)] border border-[var(--border)]" data-testid="route-list">
                {routeRows.map((r) => {
                  const o = r.option;
                  const sel = r.id === selectedOptionId;
                  const rep = complianceByOption[o.id];
                  const win = WINDOW_TEXT[optionWindowStatus(o, job, departMsForWindows, hoursToday)];
                  const hos = effectiveDriver ? evaluateEuDrivingRules(o.legDurationSec, hoursToday, effectiveDriver.hoursWeek) : [];
                  const sched = operationalTimeline(o, departMsForWindows, hoursToday);
                  const riR = riConclusion(rep?.status, false);
                  return (
                    <li key={r.id} className={clsx("relative", sel && "bg-[var(--accent-soft)]")} data-testid="route-row" data-selected={sel}>
                      {sel ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: routeLineBaseColor(o) }} /> : null}
                      <button type="button" onClick={r.select} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-3 py-2.5 text-left" aria-pressed={sel}>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className={clsx("truncate text-[13px]", sel ? "font-semibold text-[var(--text)]" : "font-medium text-[var(--text)]")}>{r.title}</span>
                            {sched.drivingDays > 1 ? <span className="text-[11.5px] text-[var(--text-3)]">{sched.drivingDays} dias</span> : null}
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px]">
                            <span style={{ color: toneVars(riR.tone).fg }}>{rep ? riR.text : "restrições por avaliar"}</span>
                            {win.verdict !== "OK" ? <span style={{ color: win.verdict === "BLOCKS" ? "var(--danger)" : win.verdict === "RISK" ? "var(--warn)" : "var(--text-3)" }}>{win.text.toLowerCase()}</span> : null}
                            {hos.some((i) => i.severity === "critical") ? <span className="text-[var(--danger)]">excede UE 561</span> : null}
                          </span>
                        </span>
                        <span className="num grid grid-cols-[64px_56px_56px] gap-x-2 text-right text-[12.5px]">
                          {sel || !selectedOption ? (
                            <>
                              <span className="font-medium text-[var(--text)]" title="Duração com pausas e descansos">{fmtDur(realSec(o))}</span>
                              <span className="text-[var(--text-2)]">{(o.distanceM / 1_000).toFixed(0)} km</span>
                              <span className="text-[var(--text-2)]">€{costOf(o).toFixed(0)}</span>
                            </>
                          ) : (
                            <>
                              <Delta value={(realSec(o) - realSec(selectedOption)) / 60} fmt={(m) => (m >= 60 ? fmtDur(m * 60) : `${Math.round(m)} min`)} />
                              <Delta value={Math.round((o.distanceM - selectedOption.distanceM) / 1_000)} fmt={(v) => `${v}`} unit=" km" />
                              <Delta value={Math.round(costOf(o) - costOf(selectedOption))} fmt={(v) => `€${v}`} />
                            </>
                          )}
                        </span>
                      </button>
                      {sel ? (
                        <div className="px-3 pb-2.5">
                          <Details label="Detalhes da rota" testId="route-details">
                            <p>{scheduleDescription(o.durationSec, hoursToday)}</p>
                            <p className="num">Condução {fmtDur(o.durationSec)} · combustível €{o.fuelCostEur.toFixed(0)} · portagens €{o.tollCostEur.toFixed(2)}{o.trafficDelaySec >= 300 ? ` · trânsito +${fmtDur(o.trafficDelaySec)}` : ""}</p>
                            <p>Chegada prevista {fmtWhen(operationalTimeline(o, departMsForWindows, hoursToday).arrivalAtIso)}</p>
                            <p className="text-[var(--text-3)]">Origem: {r.provenance.join(" · ")}</p>
                          </Details>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                {routeRows.length === 0 ? <li className="px-3 py-3 text-[12.5px] text-[var(--text-3)]">{decisionSet.decisionStatus === "NO_EXECUTABLE_ROUTE" ? "Nenhuma rota executável encontrada. Reveja a partida, os recursos ou as restrições." : "Sem rota avaliada disponível."}</li> : null}
              </ul>
              <p className="mt-2 text-[11.5px] text-[var(--text-3)]" data-testid="decision-summary">{decisionSet.analysisSummary}</p>
              {decisionSet.unresolvedIssues.length > 0 && <p className="mt-1 text-[11.5px] text-[var(--text-3)]">{decisionSet.unresolvedIssues.join(" · ")}</p>}
              {decisionSet.excluded.length > 0 ? <Details label="Ver análise"><ul>{decisionSet.excluded.map((e) => <li key={e.routeId}>{e.reasons.join(" · ")}</li>)}</ul></Details> : null}
              {solving ? <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--text-3)]"><Loader2 className="h-3 w-3 animate-spin" />A verificar restrições conhecidas nas rotas…</p> : null}
              {selectedOption ? <p className="mt-1.5 text-[11.5px] text-[var(--text-3)]">Nas outras opções, valores relativos à rota escolhida (duração com pausas · distância · custo).</p> : null}
            </>
          )}
        </Step>

        {/* 4 · Verificações */}
        <Step n={4} title="Verificações">
          <ul className="divide-y divide-[var(--border)]" data-testid="checks">
            <CheckRow label="Viatura" verdict={truckVerdict} testId="check-truck" text={truckBlockers[0] ?? truckWarnings[0] ?? (truckIsBusy ? `Em serviço — este trabalho entra na fila depois de ${activeJobOnTruck?.jobNumber}` : "Disponível e com capacidade registada para a carga")}>
              {[...truckBlockers.slice(1), ...truckWarnings.slice(truckBlockers.length ? 0 : 1)].map((m) => <p key={m} className="text-[12px] text-[var(--text-2)]">{m}</p>)}
            </CheckRow>
            <CheckRow label="Motorista" verdict={driverVerdict} testId="check-driver" text={driverBlockers[0] ?? (!driverOk ? "Nenhum motorista disponível" : eu561.text)}>
              {driverWarnings.map((m) => <p key={m} className="text-[12px] text-[var(--text-2)]">{m}</p>)}
              {effectiveDriver ? (
                <Details label="Detalhes UE 561" testId="eu561-details">
                  <p>Calculado com {fmtHours(driverHours.hoursToday)} hoje e {fmtHours(driverHours.hoursWeek)} esta semana — {driverHours.basis}.</p>
                  {driverHours.notes.map((n) => <p key={n} className="text-[var(--warn)]">{n}</p>)}
                  {hosIssues.map((i, k) => <p key={k} style={{ color: i.severity === "critical" ? "var(--danger)" : i.code === "MULTI_DAY" ? undefined : "var(--warn)" }}>{i.message}</p>)}
                </Details>
              ) : null}
            </CheckRow>
            <CheckRow label="Janela" verdict={windowNow.verdict} testId="check-window" text={selectedOption ? `${windowNow.text} · chegada ${fmtWhen(operationalTimeline(selectedOption, departMsForWindows, hoursToday).arrivalAtIso)}` : windowNow.text} />
            <CheckRow
              label="Restrições"
              verdict={selectedOption ? ri.verdict : "UNKNOWN"}
              testId="check-restrictions"
              text={selectedOption ? ri.text : "Por avaliar"}
              action={selectedCompliance ? <Button size="sm" variant="ghost" onClick={() => setEvidenceOpen(true)}>Ver análise</Button> : undefined}
            >
              {complianceBlocks && alternativeViews.length ? <p className="text-[12px] text-[var(--text-2)]">{alternativeViews.filter((a) => a.verdict === "compliant" || a.verdict === "uncertain").length} alternativa(s) avaliada(s) — ver análise.</p> : null}
              {complianceBlocks && altSearch.status === "searching" ? <p className="text-[12px] text-[var(--text-3)]">A procurar alternativa que evite a restrição…</p> : null}
            </CheckRow>
          </ul>
        </Step>
      </div>

      {/* 5 · Confirmar */}
      <div className="flex shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3" data-testid="confirm-bar">
        <div className="min-w-0 flex-1 text-[12.5px]" aria-live="polite">
          {confirmError ? <span className="text-[var(--danger)]">{confirmError}</span> : blockReason ? <span className="text-[var(--text-2)]" data-testid="block-reason">{blockReason}</span> : <span className="text-[var(--text-3)]">{assignmentMode === "queued" ? `Fica na fila de ${selectedTruck?.plate} depois de ${activeJobOnTruck?.jobNumber}.` : "Atribui viatura e motorista e guarda a decisão."}</span>}
        </div>
        <Button variant="primary" onClick={handleConfirm} disabled={!canConfirmRoute} icon={<CheckCircle2 className="h-4 w-4" />} data-testid="confirm-route">
          Confirmar rota e atribuir
        </Button>
      </div>

      {evidenceOpen && selectedCompliance && selectedOption ? (
        <Drawer width={640} title="Análise de restrições" subtitle={`${job.jobNumber} · ${routeRows.find((r) => r.id === selectedOptionId)?.title ?? ""}`} onClose={() => setEvidenceOpen(false)}>
          <div className="space-y-4 px-5 py-4">
            <RouteCompliancePanel
              report={selectedCompliance}
              dataset={regulationDataset}
              coverage={selectedCoverage}
              route={{
                distanceM: selectedOption.distanceM,
                durationSec: realSec(selectedOption),
                arrivalAtIso: operationalTimeline(selectedOption, departMsForWindows, hoursToday).arrivalAtIso,
                deliveryWindow: optionWindowStatus(selectedOption, job, departMsForWindows, hoursToday),
              }}
              savedDecision={savedDecision}
              replacesAffected={
                originalOption && originalOption.id !== selectedOptionId && originalReport?.status === "ROUTE_AFFECTED"
                  ? { distanceM: originalOption.distanceM, durationSec: originalOption.durationSec, arrivalAtIso: originalOption.arrivalAtIso, deliveryWindow: optionWindowStatus(originalOption, job, departMsForWindows, hoursToday) }
                  : undefined
              }
              alternatives={complianceBlocks ? alternativeViews : undefined}
              altSearchStatus={complianceBlocks ? altSearch.status : undefined}
              altSearchMessage={altSearch.message}
              onUseAlternative={(id) => { applyAlternative(id); setEvidenceOpen(false); }}
            />
            {apiKey && plannedAll.length > 0 ? (
              <>
                <CleanRoutesPanel
                  states={cleanStates}
                  elapsedDurationSec={(driveSec) => simulateDrivingSchedule(driveSec, hoursToday * 3600).totalElapsedSec}
                  coverage={cleanCoverage}
                  discovery={cleanDiscovery}
                  selectedOptionId={selectedOptionId}
                  selectedCandidateIds={decisionSet.decisions.find((d) => d.routeId === selectedOptionId)?.candidateIds}
                  selectableIds={decisionSet.decisions.flatMap((d) => d.candidateIds)}
                  onUse={(s) => { applyCleanRoute(s); setEvidenceOpen(false); }}
                  windowStatus={Object.fromEntries(STRATEGIES.flatMap((st) => { const o = cleanStates[st].finalOption; return o ? [[st, optionWindowStatus(o, job, departMsForWindows, hoursToday)]] : []; }))}
                  confirmed={job.routeCompliance?.cleanRoute ? { strategy: job.routeCompliance.cleanRoute.strategy, at: job.routeCompliance.confirmedAt } : null}
                />
                <RouteResearchControl route={plannedAll[0]} report={plannedAll[0] ? complianceByOption[plannedAll[0].id] : undefined} facts={complianceFacts} />
              </>
            ) : null}
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
