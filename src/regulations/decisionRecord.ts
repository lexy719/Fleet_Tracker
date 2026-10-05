import type { Job, TruckFacts } from "../data/types";
import type { RoutePlanOption } from "../tomtom/planRoutes";
import { rejectionReasons, toPersistedRoute, type AvoidancePlan } from "./alternatives";
import { buildDecisionInputs, inputsFingerprint } from "./decisionInputs";
import { evaluateCompliance, type EvaluateOptions } from "./evaluate";
import { routeTimingInput } from "./timeline";
import { operationalTimeline } from "./operationalTimeline";
import { findEvidence } from "./repository";
import {
  COMPLIANCE_RECORD_SCHEMA_VERSION,
  type ComplianceReport,
  type Evidence,
  type EvaluationInput,
  type PersistedRoute,
  type RegulationDataset,
  type RouteComplianceRecord,
} from "./types";

function sameOutcomes(a: ComplianceReport, b: ComplianceReport): boolean {
  return (
    a.status === b.status &&
    a.results.length === b.results.length &&
    a.results.every((r, i) => r.regulationId === b.results[i]!.regulationId && r.outcome === b.results[i]!.outcome)
  );
}

/**
 * Build the record saved with a confirmed route. The decision stored is the evaluation
 * of the STORED route representation (so a reload reproduces it exactly); a compact
 * geometry is used only if it reproduces the live decision, else the full geometry.
 * Returns null if no reproducible decision can be stored (caller must not confirm).
 */
export function createComplianceRecord(args: {
  job: Job;
  truck: TruckFacts | null;
  dataset: RegulationDataset;
  option: RoutePlanOption;
  title: string;
  departAt: Date;
  /** The live evaluation input used for `option` (same facts/stops). */
  liveInput: EvaluationInput;
  evaluationOptions: EvaluateOptions;
  liveReport: ComplianceReport;
  followsOfficialAlternatives: PersistedRoute["followsOfficialAlternatives"];
  plan?: AvoidancePlan | null;
  original?: { option: RoutePlanOption; title: string; report: ComplianceReport };
  now?: Date;
}): RouteComplianceRecord | null {
  const { job, truck, dataset, option, departAt, liveInput, evaluationOptions, liveReport } = args;
  if (liveReport.status === "ROUTE_AFFECTED" || liveReport.status === "EVALUATION_ERROR") return null;
  const departMs = departAt.getTime();
  const departIso = departAt.toISOString();
  const replay = (pr: PersistedRoute) =>
    evaluateCompliance(
      dataset,
      {
        ...liveInput,
        route: evaluationOptions.timing
          ? routeTimingInput(pr.polyline, pr.legPointCounts, pr.legDurationSec, departMs, evaluationOptions.timing)
          : {
              ...routeTimingInput(pr.polyline, pr.legPointCounts, pr.legDurationSec, departMs),
              tripWindowMs: liveInput.route.tripWindowMs,
            },
      },
      evaluationOptions,
      args.now,
    );

  // The stored route always carries the DECISION's departure (never a stale option value).
  const timeline = operationalTimeline(option, departMs, 0, evaluationOptions.timing);
  const persist = (tol?: number) => ({
    ...toPersistedRoute(option, args.title, departIso, args.followsOfficialAlternatives, args.plan, tol),
    departAtIso: departIso,
    arrivalAtIso: timeline.arrivalAtIso,
    operationalDurationSec: timeline.elapsedSec,
    legDurationSec: timeline.legDurationSec,
  });
  let route = persist();
  let decision = replay(route);
  if (!sameOutcomes(decision, liveReport)) {
    route = persist(0);
    decision = replay(route);
  }
  if (!sameOutcomes(decision, liveReport)) return null;

  const evidenceIds = new Set<string>();
  const collect = (rep: ComplianceReport) => {
    for (const r of rep.results) {
      r.evidenceIds.forEach((id) => evidenceIds.add(id));
      if (r.outcome !== "DOES_NOT_APPLY") dataset.regulations.find((x) => x.id === r.regulationId)?.evidence.forEach((e) => evidenceIds.add(e.id));
    }
  };
  collect(decision);
  if (args.original) collect(args.original.report);

  const inputs = buildDecisionInputs({ job, truck, departAtIso: departIso, routePoints: route.polyline, datasetVersion: dataset.version });
  return {
    schemaVersion: COMPLIANCE_RECORD_SCHEMA_VERSION,
    inputs,
    inputFingerprint: inputsFingerprint(inputs),
    evaluationOptions: {
      timeToleranceMin: evaluationOptions.timeToleranceMin,
      sampleStepMin: evaluationOptions.sampleStepMin,
      ...(evaluationOptions.timing ? { timing: evaluationOptions.timing } : {}),
    },
    report: decision,
    facts: liveInput.facts,
    route,
    original: args.original
      ? {
          route: toPersistedRoute(args.original.option, args.original.title, departIso, [], null, 0),
          report: args.original.report,
          rejectedBecause: rejectionReasons(args.original.report),
        }
      : undefined,
    evidence: [...evidenceIds].map((id) => findEvidence(dataset, id)).filter((e): e is Evidence => !!e),
    acknowledged: decision.status !== "ROUTE_COMPLIANT",
    confirmedAt: (args.now ?? new Date()).toISOString(),
  };
}
