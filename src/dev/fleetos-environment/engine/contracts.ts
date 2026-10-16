/**
 * The operational read/command boundary the environment renders from.
 *
 * Read models project the production query boundary prepared in
 * `src/application/operationalQueries.ts` (query names, status envelopes and
 * `OperationalValue` honesty). They are not a drop-in production adapter:
 * movement scope, stop labels and DEV-only spellLimit need explicit mapping.
 * Only types are shared — no production state or service is used.
 */
import type {
  Feasibility,
  OperationalValue,
} from "../../../domain/operational/values";
import type { RouteIntent } from "../../../domain/operational/routeAlternatives";

export type { Feasibility, OperationalValue, RouteIntent };

export type EntityKind =
  | "job"
  | "driver"
  | "truck"
  | "trailer"
  | "document"
  | "restriction"
  | "stop";
export type EntityRef = { kind: EntityKind; id: string };
export type Tone = "ok" | "risk" | "action" | "blocker" | "unknown" | "neutral";

/** A node of the operational graph: identity, one-line state and typed links. */
export type EntityNode = {
  ref: EntityRef;
  label: string;
  detail: string;
  status: { tone: Tone; text: string };
  links: EntityRef[];
};

export type ResourceAssignmentRead = {
  status: "CURRENT" | "REVIEW_REQUIRED" | "UNAVAILABLE";
  assignment: {
    truckId: string | null;
    driverId: string | null;
    trailerId: string | null;
  } | null;
  issues: string[];
};

/** Subset of `ExecutionTimeline` the environment needs; same field names. */
export type TimelineActivityRead = {
  kind: "drive" | "break" | "rest" | "wait" | "service";
  startMs: number;
  endMs: number;
  stopId?: string;
  planned: boolean;
  label?: string;
};
export type StopTimeRead = {
  stopId: string;
  /** Completion is an observation, never inferred because a planned ETA passed. */
  completed?: boolean;
  sequence: number;
  place: string;
  arrival: OperationalValue<number>;
  windowEndMs: number;
  deliveryMarginSec: OperationalValue<number>;
  window: Feasibility;
};
export type OperationalTimelineRead = {
  status: "READY" | "REVIEW_REQUIRED" | "UNAVAILABLE" | "STALE";
  timeline: {
    jobId: string;
    activities: TimelineActivityRead[];
    stops: StopTimeRead[];
    legalDriving: Feasibility;
    /** Instant at which continuous driving reaches 4h30 (EU 561). */
    spellLimit: OperationalValue<number>;
    end: OperationalValue<number>;
  } | null;
  issues: string[];
};

export type RouteAlternativeRead = {
  status: "AVAILABLE" | "UNAVAILABLE";
  alternatives: {
    id: string;
    intent: RouteIntent;
    label: string;
    /** A recorded corridor or official segment is not a validated whole-job alternative. */
    scope: "recorded_corridor" | "official_segment";
    recordedAt?: string;
    distanceM: OperationalValue<number>;
    durationSec: OperationalValue<number>;
    feasibility: Feasibility;
    avoidedRestrictionIds: string[];
    unknownReasons: string[];
  }[];
  issues: string[];
};

export type RestrictionImpactRead = {
  status: "PASS" | "FAIL" | "UNKNOWN";
  reason?: string;
  /** Planned passage through the affected segment. */
  passage: OperationalValue<number>;
  missingFacts: string[];
};

export type ResourceFutureRead = {
  availableAt: OperationalValue<number>;
  position: OperationalValue<[number, number]>;
  blocked: string | null;
  nextAssignments: { jobId: string; startMs: number; endMs: number | null }[];
};

export type OperationalEvent = {
  atMs: number | null;
  type: string;
  text: string;
  about: EntityRef[];
  origin: "SEEDED" | "LOCAL_USER";
};

export interface OperationalWorldProvider {
  readonly name: string;
  readonly nowMs: number;
  entity(ref: EntityRef): EntityNode | null;
  list(kind: EntityKind): EntityNode[];
  /** Entities linked to `ref`, optionally of one kind (one hop, graph order). */
  related(ref: EntityRef, kind?: EntityKind): EntityNode[];
  /** The transport an entity is executing today, if any. */
  currentJob(ref: EntityRef): string | null;
  getResourceAssignment(jobId: string): ResourceAssignmentRead;
  getOperationalTimeline(jobId: string): OperationalTimelineRead;
  getRouteAlternatives(jobId: string): RouteAlternativeRead;
  getRestrictionImpact(
    jobId: string,
    restrictionId: string,
  ): RestrictionImpactRead;
  getResourceFutureState(): Record<
    "trucks" | "drivers" | "trailers",
    Record<string, ResourceFutureRead>
  >;
  events(ref?: EntityRef): OperationalEvent[];
}
