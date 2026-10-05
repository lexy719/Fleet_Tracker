import type { BBox, ComplianceReport, ComplianceStatus, ExposureSummary, RegulationRecord } from "../regulations/types";
import type { RoutePlanOption } from "../tomtom/planRoutes";

/* ─────────────────────────────────────────────────────
   Clean-route solver (Phase 3C).

   "Clean" = no ACCEPTED constraint FleetOS knows of applies to the final route, as
   decided by the existing deterministic evaluator. It never means "no unknown
   restriction exists" — coverage travels with every result.
   ───────────────────────────────────────────────────── */

/** Provider-supported strategies only (fuel/balanced/economic are future phases). */
export type RouteStrategy = "FASTEST" | "NO_TOLLS";

export const STRATEGY_LABEL: Record<RouteStrategy, string> = {
  FASTEST: "Mais rápida / autoestrada",
  NO_TOLLS: "Sem portagens",
};

/** Provider-neutral routing requirement derived from a RoadConstraint. */
export type RoutingAvoidance = {
  id: string;
  kind: "avoid_path";
  /** [lat, lng] lines to keep away from. */
  lines: [number, number][][];
  constraintIds: string[];
};

export interface RoutingProvider {
  name: string;
  /** Route for a strategy, avoiding the given paths. Avoidance is a REQUEST, not a guarantee. */
  route(strategy: RouteStrategy, avoid: RoutingAvoidance[]): Promise<RoutePlanOption>;
  /** Provider-specific description of what would be sent (for audit), or an error if not expressible. */
  describe(avoid: RoutingAvoidance[]): { ok: true; request: ProviderAvoidRequest } | { ok: false; reason: string };
}

export type ProviderAvoidRequest = { kind: "avoid_rectangles"; provider: string; rectangles: BBox[] };

export type RouteSummary = {
  optionId: string;
  fingerprint: string;
  distanceM: number;
  durationSec: number;
  departAtIso?: string;
  arrivalAtIso?: string;
  roadNumbers: string[];
  provenance: string;
};

export type ConstraintRef = {
  constraintId: string;
  title: string;
  kind: RegulationRecord["kind"];
  origin?: RegulationRecord["origin"];
  /** Who the constraint applies to, as worded by its conditions (e.g. "todo o trânsito"). */
  vehicleScope?: string;
  evidence: { id: string; url: string; authority: string; quote?: string; verification: string }[];
};

export type SolverAttempt = {
  iteration: number;
  route: RouteSummary;
  status: ComplianceStatus;
  datasetVersion: string;
  applies: (ConstraintRef & { exposure?: ExposureSummary })[];
  uncertain: (ConstraintRef & { reasons: string[] })[];
  discoveryRunId?: string;
  /** Avoidances in force when this route was requested (cumulative). */
  requestedAvoiding: string[];
  providerRequest?: ProviderAvoidRequest;
};

export type DeviationTrigger = ConstraintRef & {
  /**
   * applies: the evaluator says the constraint APPLIES.
   * precautionary: geometry, time and vehicle all apply, but the rule's legal status is not
   * VERIFIED (e.g. synthetic/test data, interpreted source) — avoided as a precaution.
   */
  basis: "applies" | "precautionary_unverified_legal_status";
  passageBefore?: ExposureSummary;
  /** Evaluated on the NEW route with its NEW timing. */
  outcomeAfter: "avoided" | "still_applies" | "uncertain";
  passageAfter?: ExposureSummary;
};

/** One route change caused by Road Intelligence (one solver step). */
export type RoadDeviation = {
  id: string;
  strategy: RouteStrategy;
  iteration: number;
  triggers: DeviationTrigger[];
  before: RouteSummary;
  after: RouteSummary;
  /** Measured difference between the two provider routes of this step. */
  deltaDistanceM: number;
  deltaDurationSec: number;
  /**
   * single_trigger: this step avoided exactly one constraint (its delta is that step's).
   * unavailable: several constraints avoided in one step — per-constraint impact NOT computed.
   */
  perConstraintImpact: "single_trigger" | "unavailable_multiple_triggers";
  method: ProviderAvoidRequest;
  status: "APPLIED" | "PROVIDER_IGNORED" | "PARTIAL";
  reason: string;
};

export type StrategyOutcome =
  /** Baseline had no applicable known constraint. */
  | "UNCHANGED"
  /** Baseline has only uncertain (UNKNOWN) constraints — not rerouted, not green. */
  | "UNCHANGED_UNCERTAIN"
  | "CLEANED"
  | "CLEANED_UNCERTAIN"
  /** No known-conflict-free route could be produced. */
  | "UNRESOLVED"
  | "ERROR";

export type TraceSpan = { phase: string; iteration: number; ms: number; external?: boolean };

/** A clean route is "materially worse" above either threshold (shown to the dispatcher, never hidden). */
export const MATERIALLY_WORSE = { durationRatio: 1.15, minExtraSec: 20 * 60, distanceRatio: 1.15 };

export type StoredRoute = RouteSummary & {
  routing?: RoutePlanOption["routing"];
  trafficDelaySec?: number;
  polyline: [number, number][];
  legPointCounts: number[];
  legDurationSec: number[];
  /** Provider-reported costs, kept only so a reused result is not shown as €0 (not Fuel/Toll Intelligence). */
  providerCosts?: { fuelCostEur: number; tollCostEur: number; tollDataQuality: string };
};

export type StrategyResult = {
  schemaVersion: 1;
  strategy: RouteStrategy;
  solvedAt: string;
  outcome: StrategyOutcome;
  baseline: { route: StoredRoute; report: ComplianceReport };
  /** Final route FleetOS proposes; null when unresolved/error. */
  final: { route: StoredRoute; report: ComplianceReport } | null;
  attempts: SolverAttempt[];
  deviations: RoadDeviation[];
  /** final − baseline (exact, from provider summaries). */
  total: { deltaDistanceM: number; deltaDurationSec: number } | null;
  unresolved: { reason: string; constraintIds: string[] }[];
  datasetVersion: string;
  discoveryRunIds: string[];
  /** Inputs the result depends on (dataset excluded, stored separately). */
  inputsKey: string;
  /**
   * Ordered wall-clock trace of the solve. Top-level phases (no ":" in the name) partition
   * the solve; "discovery:*" entries break the discovery phase down. `external` marks
   * network time (routing provider / source fetches).
   */
  trace?: TraceSpan[];
  /** Total wall-clock of the solve and the part not covered by top-level phases. */
  wallMs?: number;
  unexplainedMs?: number;
  /** Final vs baseline, and whether the clean route is materially worse (still compliant). */
  impact?: { durationRatio: number; distanceRatio: number; materiallyWorse: boolean };
  /** Coverage of the final (or baseline) route at solve time — persisted so it survives reload. */
  coverageAtSolve?: { territories: { code: string; name: string; km: number }[]; outsideTerritoryKm: number; invalidSamples: number; headline: string };
  /** Ingested (non-curated) constraint ids in the dataset at the first and last iteration. */
  ingestedConstraintIds?: { first: string[]; last: string[] };
  /** Internal timing (ms) excluding external latency, and external latency separately. */
  timings: { evaluateMs: number; orchestrationMs: number; discoveryLocalMs: number; externalRoutingMs: number; externalDiscoveryMs: number; datasetMs?: number };
};
