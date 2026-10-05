/* ─────────────────────────────────────────────────────
   Regulation domain — generic, data-driven road restrictions.

   A restriction is DATA (see `portugal/seededRestrictions.ts`), evaluated by the
   single generic engine in `evaluate.ts`. Nothing in the engine knows about a
   specific road, city or regulation.
   ───────────────────────────────────────────────────── */

import type { RouteTiming, TimingModel } from "./timeline";

/** Three-valued result. UNKNOWN must never be treated as APPLIES or DOES_NOT_APPLY. */
export type Tri = "APPLIES" | "DOES_NOT_APPLY" | "UNKNOWN";

/**
 * How a normalized fact was established.
 * - VERIFIED: stated in the cited official source.
 * - INTERPRETED: a reading of the source that the source itself does not spell out.
 * - UNVERIFIED: not established from an authoritative source (e.g. OSM-derived, AI-extracted).
 */
export type VerificationState = "VERIFIED" | "INTERPRETED" | "UNVERIFIED";

/** One piece of evidence backing one or more normalized facts. */
export type Evidence = {
  id: string;
  authority: string;
  /** Legal instrument or dataset, e.g. "Decreto-Lei n.º 155-A/2026, de 31 de julho". */
  instrument: string;
  /** Article / number / section, e.g. "Art. 2.º, n.º 3". */
  locator?: string;
  url: string;
  /** ISO date the source was read. */
  retrievedAt: string;
  /** Short verbatim excerpt of the official text. */
  quote?: string;
  verification: VerificationState;
  note?: string;
};

/* ─── Transport facts (what FleetOS knows at evaluation time) ─── */

export type FactValue = number | boolean | string;

export type Fact =
  | { status: "known"; value: FactValue; /** Where FleetOS got it, e.g. "fleet record". */ source: string }
  /** Numeric value only known to lie within bounds (e.g. weight ≥ cargo weight). */
  | { status: "range"; min?: number; max?: number; source: string }
  | { status: "unknown"; reason: string };

/** Keyed by fact id, e.g. "vehicle.axleCount". Missing keys are UNKNOWN. */
export type FactSet = Record<string, Fact>;

/* ─── Conditions (vehicle / cargo / operational) ─── */

export type FactOperator = "gt" | "gte" | "lt" | "lte" | "eq" | "in";

export type StopSelector = "origin" | "destination" | "originOrDestination" | "any";

export type Condition =
  | { kind: "all"; of: Condition[] }
  | { kind: "any"; of: Condition[] }
  | { kind: "not"; of: Condition }
  | {
      kind: "fact";
      fact: string;
      op: FactOperator;
      value: FactValue | FactValue[];
      /** Human label for explanations, e.g. "Peso bruto > 3500 kg". */
      label: string;
      evidence: string[];
    }
  | {
      /** A job stop (by role) lies inside a referenced area. */
      kind: "stopInArea";
      stops: StopSelector;
      areaId: string;
      /** Restrict to stops of these types (e.g. loading/unloading). Omit for any type. */
      stopTypes?: ("pickup" | "delivery")[];
      label: string;
      evidence: string[];
    };

/* ─── Temporal rule ─── */

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1 = Monday … 7 = Sunday

/** A calendar of dates (generic: fixed month/day + offsets from Western Easter). */
export type DateCalendar = {
  id: string;
  label: string;
  fixed: { month: number; day: number; label: string }[];
  easterOffsets: { days: number; label: string }[];
  evidence: string[];
};

export type DayClassRule = {
  /** Wording of the source, e.g. "dias úteis". */
  label: string;
  /** Outcome per ISO weekday for dates not matched by an override. */
  weekdays: Record<Weekday, Tri>;
  weekdaysEvidence: string[];
  /** Dates in these calendars take the given outcome instead (first match wins). */
  dateOverrides: { calendarId: string; outcome: Tri; evidence: string[] }[];
};

/** A dated local interval [start, end), e.g. one night of a closure ("2026-10-01T21:00" → "2026-10-02T05:00"). */
export type ActivePeriod = { start: string; end: string; evidence: string[] };

/**
 * When a constraint is in force. All present parts must hold (AND):
 * - `activePeriods`: explicit dated intervals (temporary events);
 * - `windows` + `days`: recurring clock windows on classified days (standing rules).
 */
export type TemporalRule = {
  /** IANA zone in which the rule's clock times are read. */
  timeZone: string;
  timeZoneEvidence: string[];
  activePeriods?: ActivePeriod[];
  /** Half-open local windows [start, end), "HH:MM". */
  windows?: { start: string; end: string; evidence: string[] }[];
  days?: DayClassRule;
};

/* ─── Geometry ─── */

export type BBox = { south: number; west: number; north: number; east: number };

export type GeometryRecord = {
  id: string;
  label: string;
  /** Legal description of the location — what the geometry must represent. */
  legalDescriptionEvidence: string[];
  /**
   * RESOLVED only when the geometry has been mapped back to the legally described
   * roads/sections with documented method. UNRESOLVED ⇒ location conditions are UNKNOWN.
   */
  status: "RESOLVED" | "UNRESOLVED";
  resolved?: {
    kind: "polylines";
    lines: [number, number][][];
    /** Max distance (m) from a line for a route sample to count as "on" it. */
    toleranceM: number;
    /** Only continuous runs along the lines at least this long count. */
    minMatchLengthM: number;
    /** Max direction difference (deg) between route and line. */
    maxHeadingDiffDeg: number;
    /**
     * When true, lines are directed (e.g. one carriageway / one direction closed) and the
     * route must travel in the line's direction. Default: direction-agnostic.
     */
    directional?: boolean;
    /**
     * How the physical lines were tied to the legal description. UNVERIFIED mappings
     * are never used to decide an outcome; INTERPRETED ones are, with a caveat.
     */
    verification: VerificationState;
    mappingMethod: string;
    evidence: string[];
  };
  /**
   * Coarse envelope believed to contain the whole restricted element. Used ONLY to
   * rule a route OUT (never in): a route that never enters it cannot use the element.
   * Carries its own evidence/verification so the UI can disclose it.
   */
  screeningArea?: { bbox: BBox; method: string; evidence: string[] };
  /** Development-only hints (e.g. road numbers). Never used to decide an outcome. */
  diagnosticHints?: { roadNumbers: string[]; note: string };
};

/** A named administrative area used by stop conditions. */
export type AreaRecord = {
  id: string;
  label: string;
  status: "RESOLVED" | "UNRESOLVED";
  /**
   * Membership decided from a RECORDED stop attribute (e.g. municipality = "Porto").
   * Stops without that attribute recorded stay UNKNOWN.
   */
  match?: { attribute: string; equals: string };
  evidence: string[];
};

/**
 * An alternative/diversion named by an authority. Guidance for generating and
 * describing candidate routes — it never proves a route compliant.
 */
export type OfficialAlternative = {
  id: string;
  type: "corridor";
  label: string;
  roads: string[];
  /** Sections as worded by the source. */
  sections: string[];
  evidence: string[];
  /** Physical geometry of the corridor, if mapped (used only to describe routes). */
  geometryId?: string;
};

/* ─── Road constraint record ─── */

/**
 * Kinds of road constraint the engine evaluates. Only kinds backed by real seeded
 * data are listed; add more as real sources require them.
 */
export type ConstraintKind = "LEGAL_RESTRICTION" | "ROAD_CLOSURE" | "OPERATIONAL_IMPACT";

export type RegulationRecord = {
  id: string;
  kind: ConstraintKind;
  /** Bumped whenever normalized content changes — persisted with decisions. */
  version: number;
  title: string;
  jurisdiction: string;
  authority: string;
  instrument: string;
  /** Verification of the rule / notice itself (independent of geometry). */
  legalStatus: VerificationState;
  effect: "prohibited" | "advisory";
  effective: { from: string; to?: string; evidence: string[] };
  /** Who the rule targets (vehicle / cargo conditions). */
  appliesTo: Condition;
  location: { geometryId: string };
  when: TemporalRule;
  /** Each exception, when it holds, lifts the restriction. */
  exceptions: { id: string; label: string; condition: Condition; evidence: string[] }[];
  officialAlternatives?: OfficialAlternative[];
  evidence: Evidence[];
  /** Known gaps that were NOT resolved — surfaced alongside results. */
  openQuestions: string[];
  /** Set on constraints produced by ingestion (never on curated records). */
  origin?: {
    kind: "ingested_auto" | "ingested_reviewed";
    sourceId: string;
    sourceName: string;
    candidateId: string;
    /** Source is a development/test fixture, not an official publication. */
    synthetic: boolean;
    reviewedBy?: string;
    reviewedAt?: string;
  };
};

/** Generic name: legal restrictions and temporary road events share one record type. */
export type RoadConstraint = RegulationRecord;

export type RegulationDataset = {
  id: string;
  version: string;
  regulations: RegulationRecord[];
  geometries: GeometryRecord[];
  areas: AreaRecord[];
  calendars: DateCalendar[];
};

/* ─── Evaluation inputs / outputs ─── */

export type RouteStopInput = {
  id: string;
  type: "pickup" | "delivery" | "stop";
  lat: number;
  lng: number;
  /** Area membership already established for this stop (areaId → fact). */
  areas?: Record<string, Fact>;
};

/** Expected passage over the restricted element (resolved geometry only). */
export type ExposureSummary = {
  /** Expected passage. */
  fromIso: string;
  toIso: string;
  lengthM: number;
  timeZone: string;
  /** Possible passage (timeline model) and why it is that wide. */
  window?: { earliestIso: string; latestIso: string; sources: string[] };
};

export type RouteGeometryInput = {
  /** Concatenated route points across all legs. */
  points: [number, number][];
  /** Estimated time at each point, epoch ms. Same length as `points`. */
  pointTimesMs: number[];
  /** Whether times are estimates (always true for TomTom travel times). */
  timesAreEstimates: boolean;
  /** [departure, arrival] epoch ms — used when `points` is empty (no route geometry). */
  tripWindowMs?: [number, number];
  /**
   * Driving timeline (planned stops, local passage windows). When present, `pointTimesMs`
   * are its expected times and the per-passage window replaces the global tolerance.
   */
  timing?: RouteTiming;
};

export type EvaluationInput = {
  route: RouteGeometryInput;
  stops: RouteStopInput[];
  facts: FactSet;
  /** Road numbers reported along the route (diagnostic display only). */
  routeRoadNumbers?: string[];
};

export type ReasonKind = "missing_fact" | "geometry" | "calendar" | "timing" | "legal_status" | "interpretation" | "info" | "error";

export type Reason = { kind: ReasonKind; text: string; evidence?: string[] };

/**
 * Aggregate route status. Precedence (strongest first):
 * ROUTE_AFFECTED > EVALUATION_ERROR > POTENTIALLY_AFFECTED > ROUTE_COMPLIANT.
 * Only ROUTE_COMPLIANT is "green"; it requires every constraint to be DOES_NOT_APPLY.
 */
export type ComplianceStatus = "ROUTE_COMPLIANT" | "POTENTIALLY_AFFECTED" | "ROUTE_AFFECTED" | "EVALUATION_ERROR";

export type RegulationResult = {
  /** Absent in legacy records means a mandatory restriction, never a soft impact. */
  effect?: "prohibited" | "advisory";
  regulationId: string;
  regulationVersion: number;
  title: string;
  outcome: Tri;
  /** Why the outcome is what it is (for UNKNOWN: what is missing). */
  reasons: Reason[];
  /** Interpretations / open questions the outcome relies on. */
  caveats: string[];
  evidenceIds: string[];
  /** Estimated passage on the restricted element, when geometry allowed computing it. */
  exposure?: ExposureSummary;
  /** Set when the constraint could not be evaluated (outcome is then UNKNOWN). */
  error?: string;
};

/** How a route was obtained from the routing provider. */
export type RoutingMethod =
  | { kind: "provider_primary"; provider: "tomtom"; request: Record<string, string> }
  | { kind: "provider_alternative"; provider: "tomtom"; request: Record<string, string> }
  | {
      kind: "provider_avoid_areas";
      provider: "tomtom";
      request: Record<string, string>;
      avoidAreas: BBox[];
      /** Regulations whose resolved geometry produced the rectangles. */
      derivedFrom: string[];
    }
  | { kind: "local_estimate" };

export type PersistedRoute = {
  /** Canonical elapsed time including mandatory stops; durationSec remains provider driving time. */
  operationalDurationSec?: number;
  optionId: string;
  title: string;
  method: RoutingMethod;
  departAtIso: string;
  arrivalAtIso?: string;
  distanceM: number;
  durationSec: number;
  roadNumbers: string[];
  /** Route geometry (simplified), kept for future re-evaluation. */
  polyline: [number, number][];
  legPointCounts: number[];
  legDurationSec: number[];
  /** Official corridors the route follows (computed, not assumed). */
  followsOfficialAlternatives: { id: string; label: string; matchedKm: number }[];
};

export const COMPLIANCE_RECORD_SCHEMA_VERSION = 2;

/** The inputs a decision depended on — compared to detect stale decisions. */
export type DecisionInputs = {
  truck: { id: string | null; grossVehicleWeightKg?: number; axleCount?: number; firstAxleHeightM?: number; ownerCategory?: string };
  cargo: { totalWeightKg: number; cargoType: string; adrClass?: string; adrUnNumber?: string };
  stops: {
    id: string;
    type: string;
    lat: number;
    lng: number;
    municipality?: string;
    windowStartAt?: string;
    windowEndAt?: string;
    legacyWindow?: string;
  }[];
  recordedFacts: Record<string, unknown>;
  departAtIso: string;
  /** Hash of the route geometry that was evaluated. */
  routeGeometryHash: string;
  datasetVersion: string;
};

/** Snapshot persisted with a confirmed route — enough to explain and re-evaluate later. */
export type RouteComplianceRecord = {
  /** Absent on records saved before Phase 2.5 (read through the compatibility path). */
  schemaVersion?: number;
  /** Inputs at decision time, and their fingerprint. */
  inputs?: DecisionInputs;
  inputFingerprint?: string;
  /** Evaluation options used, so a re-evaluation reproduces the decision. */
  evaluationOptions?: { timeToleranceMin: number; sampleStepMin: number; timing?: TimingModel };
  report: ComplianceReport;
  /** Facts as known at decision time. */
  facts: FactSet;
  route: PersistedRoute;
  /** Present when the dispatcher replaced a non-compliant original. */
  original?: {
    route: PersistedRoute;
    report: ComplianceReport;
    rejectedBecause: string[];
  };
  /** Evidence cited by the results, copied so the record stays self-explanatory. */
  evidence: Evidence[];
  /** Phase 3C: the route was produced by the clean-route solver (baseline kept for explanation). */
  cleanRoute?: {
    strategy: string;
    solvedAt: string;
    outcome: string;
    baseline: { distanceM: number; durationSec: number; provenance: string };
    total: { deltaDistanceM: number; deltaDurationSec: number } | null;
    deviations: { reason: string; constraintIds: string[]; deltaDistanceM: number; deltaDurationSec: number; perConstraintImpact: string }[];
    datasetVersion: string;
    discoveryRunIds: string[];
    /** Route km outside the supported Road Intelligence territory at decision time. */
    outsideTerritoryKm?: number;
    coverageHeadline?: string;
  };
  /** Dispatcher confirmed despite a non-compliant status. */
  acknowledged: boolean;
  confirmedAt: string;
};

export type ComplianceReport = {
  status: ComplianceStatus;
  datasetId: string;
  datasetVersion: string;
  evaluatedAt: string;
  results: RegulationResult[];
};
