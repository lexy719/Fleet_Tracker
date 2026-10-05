import type { Job, TruckFacts } from "../data/types";
import { buildDecisionInputs, changedInputs, inputsFingerprint } from "./decisionInputs";
import { DEFAULT_EVALUATE_OPTIONS, evaluateCompliance } from "./evaluate";
import { buildRouteStops } from "./fleetFacts";
import { routeTimingInput, validTimingModel } from "./timeline";
import {
  COMPLIANCE_RECORD_SCHEMA_VERSION,
  type ComplianceReport,
  type ComplianceStatus,
  type RegulationDataset,
  type RegulationResult,
  type RouteComplianceRecord,
} from "./types";

/* ─── Reading persisted records (never trust shape) ─── */

export type RecordRead =
  | { kind: "none" }
  | { kind: "unusable"; reason: string }
  | { kind: "ok"; record: RouteComplianceRecord; hasInputs: boolean };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNumArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x));

/**
 * Validate a persisted compliance record. Older shapes are readable only as far as
 * they actually contain the data; nothing is invented to fill gaps.
 */
export function readComplianceRecord(raw: unknown): RecordRead {
  if (raw === undefined || raw === null) return { kind: "none" };
  if (!isObj(raw)) return { kind: "unusable", reason: "registo de decisão com formato inválido" };
  const report = raw.report;
  if (!isObj(report) || !Array.isArray(report.results) || typeof report.status !== "string") {
    return { kind: "unusable", reason: "registo sem resultado de conformidade legível" };
  }
  if (typeof report.datasetVersion !== "string") return { kind: "unusable", reason: "registo sem versão do conjunto de restrições" };
  if (!isObj(raw.facts)) return { kind: "unusable", reason: "registo sem factos da decisão" };
  const route = raw.route;
  if (!isObj(route)) return { kind: "unusable", reason: "registo sem rota" };
  const poly = route.polyline;
  if (!Array.isArray(poly) || poly.length < 2) return { kind: "unusable", reason: "rota guardada sem geometria (registo anterior à fase 1.5)" };
  if (!poly.every((p) => Array.isArray(p) && p.length === 2 && isNumArray(p))) return { kind: "unusable", reason: "geometria guardada corrompida" };
  if (!isNumArray(route.legPointCounts) || !isNumArray(route.legDurationSec)) return { kind: "unusable", reason: "rota guardada sem tempos por troço" };
  const counts = route.legPointCounts as number[];
  if (counts.length > 0 && counts.reduce((a, b) => a + b, 0) !== poly.length) return { kind: "unusable", reason: "tempos por troço inconsistentes com a geometria" };
  if (typeof route.departAtIso !== "string" || !Number.isFinite(Date.parse(route.departAtIso))) {
    return { kind: "unusable", reason: "rota guardada sem hora de partida válida" };
  }
  const hasInputs =
    raw.schemaVersion === COMPLIANCE_RECORD_SCHEMA_VERSION && isObj(raw.inputs) && typeof raw.inputFingerprint === "string";
  if (hasInputs) {
    const inDep = Date.parse(String((raw.inputs as Record<string, unknown>).departAtIso));
    if (inDep !== Date.parse(route.departAtIso)) return { kind: "unusable", reason: "partida da rota guardada difere da partida da decisão" };
  }
  return { kind: "ok", record: raw as unknown as RouteComplianceRecord, hasInputs };
}

/* ─── Re-evaluating a saved route ─── */

export type PlannedJobReevaluation = {
  jobId: string;
  previousStatus: ComplianceStatus;
  previousDatasetVersion: string;
  current: ComplianceReport;
  /** Constraints whose outcome is now non-clear and differs from the stored decision. */
  newFindings: RegulationResult[];
  /** Constraints evaluated now at a different version than in the stored decision. */
  versionChanges: string[];
};

/** Jobs whose confirmed route is still ahead (re-evaluation is meaningful). */
const PLANNED_STATUSES: ReadonlySet<Job["status"]> = new Set(["assigned", "queued", "loading", "in_transit"]);

function reevaluateRecord(job: Job, rc: RouteComplianceRecord, dataset: RegulationDataset, now: Date): PlannedJobReevaluation {
  const departMs = Date.parse(rc.route.departAtIso);
  // Same timeline as at decision time (legacy records: legacy pure-driving times).
  const model = validTimingModel(rc.evaluationOptions?.timing) ? rc.evaluationOptions!.timing : undefined;
  const route = model
    ? routeTimingInput(rc.route.polyline, rc.route.legPointCounts, rc.route.legDurationSec, departMs, model)
    : { ...routeTimingInput(rc.route.polyline, rc.route.legPointCounts, rc.route.legDurationSec, departMs), tripWindowMs: [departMs, departMs + rc.route.durationSec * 1000] as [number, number] };
  const current = evaluateCompliance(
    dataset,
    {
      route,
      stops: buildRouteStops(job, dataset.areas),
      facts: rc.facts,
      routeRoadNumbers: Array.isArray(rc.route.roadNumbers) ? rc.route.roadNumbers : [],
    },
    rc.evaluationOptions ?? DEFAULT_EVALUATE_OPTIONS,
    now,
  );
  const before = new Map(rc.report.results.map((r) => [r.regulationId, r]));
  const newFindings = current.results.filter(
    (r) => r.outcome !== "DOES_NOT_APPLY" && before.get(r.regulationId)?.outcome !== r.outcome,
  );
  const versionChanges = current.results
    .filter((r) => before.has(r.regulationId) && before.get(r.regulationId)!.regulationVersion !== r.regulationVersion)
    .map((r) => r.regulationId);
  return {
    jobId: job.id,
    previousStatus: rc.report.status as ComplianceStatus,
    previousDatasetVersion: rc.report.datasetVersion,
    current,
    newFindings,
    versionChanges,
  };
}

/** Re-evaluate a planned job's SAVED route (no provider call). Null when not re-evaluable. */
export function reevaluatePlannedJob(job: Job, dataset: RegulationDataset, now: Date = new Date()): PlannedJobReevaluation | null {
  if (!PLANNED_STATUSES.has(job.status)) return null;
  const read = readComplianceRecord(job.routeCompliance);
  return read.kind === "ok" ? reevaluateRecord(job, read.record, dataset, now) : null;
}

/* ─── State of a planned job's decision ─── */

export type PlannedDecisionState =
  | { state: "NOT_PLANNED" }
  | { state: "INSUFFICIENT_SAVED_ROUTE_DATA"; reason: string }
  | { state: "STALE_INPUTS"; changed: string[]; decidedStatus: ComplianceStatus }
  | { state: "REQUIRES_REEVALUATION"; reason: string; reevaluation: PlannedJobReevaluation }
  | { state: "CURRENT"; reevaluation: PlannedJobReevaluation; datasetChanged: boolean };

/**
 * Is a planned job's saved decision still valid for its CURRENT inputs, and what does
 * the CURRENT constraint dataset say about its saved route? Never throws.
 */
export function assessPlannedJob(
  job: Job,
  truck: TruckFacts | null | undefined,
  dataset: RegulationDataset,
  now: Date = new Date(),
): PlannedDecisionState {
  if (!PLANNED_STATUSES.has(job.status)) return { state: "NOT_PLANNED" };
  const read = readComplianceRecord(job.routeCompliance);
  if (read.kind === "none") return { state: "INSUFFICIENT_SAVED_ROUTE_DATA", reason: "trabalho planeado sem decisão de conformidade guardada" };
  if (read.kind === "unusable") return { state: "INSUFFICIENT_SAVED_ROUTE_DATA", reason: read.reason };
  const rc = read.record;
  try {
    if (!read.hasInputs || !rc.inputs || !rc.inputFingerprint) {
      return {
        state: "REQUIRES_REEVALUATION",
        reason: "decisão guardada antes do registo das entradas — não é possível confirmar que viatura/carga/paragens não mudaram",
        reevaluation: reevaluateRecord(job, rc, dataset, now),
      };
    }
    const current = buildDecisionInputs({
      job,
      truck: truck ?? null,
      departAtIso: job.plannedDepartureAt ?? rc.inputs.departAtIso,
      routePoints: rc.route.polyline,
      datasetVersion: dataset.version,
    });
    if (inputsFingerprint(current) !== rc.inputFingerprint) {
      return { state: "STALE_INPUTS", changed: changedInputs(rc.inputs, current), decidedStatus: rc.report.status as ComplianceStatus };
    }
    return {
      state: "CURRENT",
      reevaluation: reevaluateRecord(job, rc, dataset, now),
      datasetChanged: rc.report.datasetVersion !== dataset.version,
    };
  } catch (e) {
    return { state: "INSUFFICIENT_SAVED_ROUTE_DATA", reason: `não foi possível reavaliar: ${e instanceof Error ? e.message : String(e)}` };
  }
}
