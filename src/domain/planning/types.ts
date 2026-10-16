import type { Driver, Job, Trailer, Truck } from "../../data/types";
import type {
  ComplianceReport,
  EvaluationInput,
  RegulationDataset,
  RouteComplianceRecord,
} from "../../regulations/types";
import type { DriverState, TimingModel } from "../../regulations/timeline";
import type { RoutePlanOption } from "../../tomtom/planRoutes";

export type Position = { point: [number, number]; source: string };
export type ResourceState = {
  availableAt: number;
  position?: Position;
  driving?: DriverState & { weekSec: number; known: boolean };
  blocked?: string;
};
export type FleetState = {
  trucks: Record<string, ResourceState>;
  drivers: Record<string, ResourceState>;
  trailers: Record<string, ResourceState>;
};
export type Assignment = {
  truckId: string;
  driverId: string;
  trailerId?: string;
};
export type PlanningConstraint = {
  jobId: string;
  truckId?: string;
  driverId?: string;
  trailerId?: string;
  excludeTruckIds?: string[];
  /** Must occur immediately after this job, with the same assignment. */
  afterJobId?: string;
};
export type PlanningReason = {
  code: string;
  jobId?: string;
  resourceId?: string;
  data?: Record<string, string | number | boolean | string[]>;
};
export type Economics = {
  /** Additional maintenance/etc. EXCLUDES fuel, tolls and time. Zero means not priced. */
  nonFuelEurPerKm: number;
  /** Comparison policy for scarce resource time, not a wage or measured invoice. */
  opportunityEurPerHour: number;
};
export type SearchPolicy = {
  beamWidth: number;
  extensionsPerState: number;
  maxRouteRequests: number;
  maxAlternatives: number;
};
export const DEFAULT_SEARCH: SearchPolicy = {
  beamWidth: 8,
  extensionsPerState: 16,
  maxRouteRequests: 256,
  maxAlternatives: 4,
};
export const DEFAULT_ECONOMICS: Economics = {
  nonFuelEurPerKm: 0,
  opportunityEurPerHour: 18,
};
export type MovementRequest = {
  job: Job;
  truck: Truck;
  trailer?: Trailer;
  kind: "EMPTY" | "LOADED";
  from: [number, number];
  to: [number, number];
  departMs: number;
  /** Evaluator is also used by the existing clean-route solver adapter. */
  evaluate: (route: RoutePlanOption) => ComplianceReport;
};
export type PlanningMovement = {
  kind: "EMPTY" | "LOADED";
  route: RoutePlanOption;
  departMs: number;
  arrivalMs: number;
  elapsedSec: number;
  drivingBefore: DriverState;
  timingModel: TimingModel;
  report: ComplianceReport;
  evaluationInput: EvaluationInput;
  breakSec: number;
  restSec: number;
};
export type JobExecution = {
  jobId: string;
  jobRevision: number;
  assignment: Assignment;
  startMs: number;
  pickupMs: number;
  endMs: number;
  movements: PlanningMovement[];
  waitsSec: number;
  serviceSec: number;
  reasons: PlanningReason[];
  drivingAtStart: NonNullable<ResourceState["driving"]>;
  drivingAfter: NonNullable<ResourceState["driving"]>;
};
export type PlanMetrics = {
  loadedKm: number;
  emptyKm: number;
  totalKm: number;
  loadedDrivingSec: number;
  emptyDrivingSec: number;
  totalDrivingSec: number;
  waitingSec: number;
  restSec: number;
  breakSec: number;
  serviceSec: number;
  providerFuelTollEur: number;
  nonFuelEur: number;
  directCostEur: number;
  opportunityCostEur: number;
  generalizedCostEur: number;
  revenueEur: number | null;
  contributionBeforeUnpricedCostsEur: number | null;
};
export type OperationalPlan = {
  schemaVersion: 1;
  id: string;
  inputFingerprint: string;
  createdAt: string;
  inventoryFingerprint: string;
  datasetVersion: string;
  economics: Economics;
  planningInputs: {
    nowMs: number;
    earliestStartMs?: number;
    horizonEndMs: number;
    scopeJobIds?: string[];
    constraints: PlanningConstraint[];
    initialState: FleetState;
    search: SearchPolicy;
  };
  executions: JobExecution[];
  trips: { assignment: Assignment; jobIds: string[] }[];
  futureState: FleetState;
  metrics: PlanMetrics;
  reasons: PlanningReason[];
  status: "FEASIBLE" | "REVIEW_REQUIRED";
};
export type PlanningResult = {
  recommended: OperationalPlan | null;
  alternatives: OperationalPlan[];
  unassignedJobIds: string[];
  diagnostics: { reason: PlanningReason; count: number }[];
  search: {
    routeRequests: number;
    cacheHits: number;
    evaluatedExtensions: number;
    cheapRejected: number;
    truncated: boolean;
    globallyOptimal: false;
  };
};
export type PlanningRequest = {
  jobs: Job[];
  trucks: Truck[];
  drivers: Driver[];
  trailers: Trailer[];
  scopeJobIds?: string[];
  nowMs: number;
  horizonEndMs: number;
  dataset: RegulationDataset;
  earliestStartMs?: number;
  initialState?: Partial<FleetState>;
  constraints?: PlanningConstraint[];
  economics?: Economics;
  search?: Partial<SearchPolicy>;
  route: (request: MovementRequest) => Promise<RoutePlanOption[]>;
  signal?: AbortSignal;
  /** Host scheduling only; does not change deterministic search order/scoring. */
  yieldControl?: () => Promise<void>;
};
export type ConfirmedOperationalPlan = {
  schemaVersion: 1;
  id: string;
  recommended: OperationalPlan;
  selected: OperationalPlan;
  confirmedAt: string;
  source: "HUMAN_CONFIRMED";
  /** One reproducible compliance record for EVERY empty/loaded movement. */
  compliance: Record<string, RouteComplianceRecord[]>;
};
export type PlanningRecommendation = {
  id: string;
  createdAt: string;
  result: PlanningResult;
};
