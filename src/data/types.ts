/* ─────────────────────────────────────────────────────
   Core domain types for Peninsula Fleet OS
   ───────────────────────────────────────────────────── */

import type { FactValue, RouteComplianceRecord } from "../regulations/types";
import type { JobExecution, Economics } from "../domain/planning/types";

export type TruckStatus =
  | "in_transit"
  | "idle"
  | "loading"
  | "maintenance"
  | "delayed";

export type CargoType = "dry" | "refrigerated" | "hazmat" | "bulk" | "automotive";

export type DriverStatus = "on_duty" | "off_duty" | "driving" | "violation";

/* ─── Jobs ─────────────────────────────────────────── */
export type JobStatus =
  | "backlog"      // not yet assigned to a truck/driver
  | "queued"       // truck + driver set; waits until current operational job on same unit finishes
  | "assigned"     // truck + driver set, not yet loading
  | "loading"      // currently loading at pickup
  | "in_transit"   // on the road
  | "delivered"    // all stops completed
  | "invoiced"     // billed to client
  | "cancelled";

export type JobPriority = "normal" | "urgent" | "critical";
export type SlaStatus   = "on_track" | "at_risk" | "breached";

/** "stop" = intermediate stop (neither the main pickup nor the main delivery). */
export type StopType = "pickup" | "delivery" | "stop";

export interface JobStop {
  id: string;
  sequence: number;
  type: StopType;
  clientName: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  /** Legacy clock-only window start ("08:00") — kept for display; not dated. */
  scheduledTime: string;
  /** Legacy clock-only window end ("11:00") — kept for display; not dated. */
  windowEnd: string;
  /**
   * Dated window — ISO 8601 instants WITH offset (entered as Europe/Lisbon local time).
   * The source of truth for new jobs; Road Intelligence only evaluates dated windows.
   */
  windowStartAt?: string;
  windowEndAt?: string;
  /** Legacy clock-only actual time ("14:05"). New code records `completedAt`. */
  actualTime?: string;
  /** Instant the stop was marked completed (ISO). */
  completedAt?: string;
  cargoDescription: string;
  weightKg: number;
  pallets: number;
  completed: boolean;
  notes?: string;
  /** Municipality as RECORDED for this stop (not geocoded/inferred). */
  municipality?: string;
  /** Reusable Site this stop was created from. The stop keeps its own copy of the fields. */
  siteId?: string;
}

/** One line of transport cargo (not warehouse inventory). */
export interface CargoLine {
  id: string;
  description: string;
  quantity: number;
  unit: "pallet" | "package" | "unit" | "bulk";
  /** Total weight of this line (kg). */
  weightKg: number;
  /** Pallet places used (loading units). */
  pallets?: number;
  dangerousGoods?: { unNumber?: string; adrClass?: string; packingGroup?: string };
}

/** Is the confirmed route still valid for the job's current planning inputs? */
export type JobPlanStatus = "UNPLANNED" | "PLANNED" | "REPLAN_REQUIRED";

export interface Job {
  /** Immutable internal id (UUID for new jobs; legacy ids such as "J-4201" are kept as-is). */
  id: string;
  /** Human-readable job number shown in the UI (e.g. "J-004302"). Not a database key. */
  jobNumber: string;
  /** Customer / order reference (external). */
  reference: string;
  /** Customer display name as recorded on the job (snapshot; does not follow later Customer edits). */
  client: string;
  /** Customer record this job belongs to (live reference — documents snapshot billing data at issue). */
  customerId?: string;
  status: JobStatus;
  priority: JobPriority;
  cargoType: CargoType;
  /** Derived from `cargo` (kept on the record for the planner / Road Intelligence). */
  totalWeightKg: number;
  totalPallets: number;
  cargo: CargoLine[];
  stops: JobStop[];
  assignedTruckId?: string;
  assignedDriverId?: string;
  assignedTrailerId?: string;
  pickupDeadline: string;     // ISO date-time
  deliveryDeadline: string;   // ISO date-time
  slaStatus: SlaStatus;
  rateEur: number;
  createdAt: string;
  /** Set when status is `queued` — used with geography to order promotion after the active job. */
  queuedAt?: string;
  notes?: string;
  /** Planned route data — set when dispatcher confirms a route in the planner. */
  plannedKm?:          number;
  plannedDurationMin?: number;
  plannedCostEur?:     number;
  /** Regulatory compliance evaluation of the confirmed route. */
  routeCompliance?:    RouteComplianceRecord;
  /** Dispatcher-facing conclusions recorded when the plan was confirmed (Phase 5.6B). */
  planDecision?:       PlanDecisionSummary;
  /** Immutable execution snapshot produced by the operational planner, separate from demand. */
  operationalPlan?: { planId: string; confirmedAt: string; execution: JobExecution; economics: Economics; compliance: RouteComplianceRecord[]; datasetVersion: string; truckSpecification: ReturnType<typeof import("../domain/planning/state").truckPlanningSpecification>; driverSpecification: ReturnType<typeof import("../domain/planning/state").driverPlanningSpecification>; trailerSpecification?: ReturnType<typeof import("../domain/planning/state").trailerPlanningSpecification> };
  operationalRequirements?: { trailerRequired?: boolean; trailerTypes?: TrailerType[]; lengthM?: number; widthM?: number; heightM?: number; serviceSecByStop?: Record<string, number> };
  /** Earlier decisions replaced by re-planning (audit trail, newest last, capped). */
  routeComplianceHistory?: RouteComplianceRecord[];
  /** ADR — dangerous goods (EU Reg. ADR / Directiva 2008/68/CE). */
  adrClass?:    string;   // e.g. "Classe 3 — Líquidos inflamáveis"
  adrUnNumber?: string;   // e.g. "UN1993"
  /** Refrigerated cargo — target temperature range (°C). */
  tempTargetC?: { min: number; max: number };
  /** International / cabotage flag. */
  isInternational?:        boolean;
  destinationCountryCode?: string;  // ISO-3166 alpha-2, e.g. "ES"
  /** Buyer NIF for invoice generation (optional). */
  buyerNif?: string;
  /**
   * Regulatory facts explicitly recorded for this transport, keyed by fact id
   * (e.g. "authorization.pt-vci-habilitacao"). Absent keys are UNKNOWN.
   */
  recordedFacts?: Record<string, { value: FactValue; source: string }>;
  /** Demo/test record — not a real transport. */
  isDemo?: boolean;
  /** Planned departure from the first stop (ISO). Route planning uses it instead of "now". */
  plannedDepartureAt?: string;
  /** Route-plan validity; a planning-relevant edit turns PLANNED into REPLAN_REQUIRED. */
  planStatus: JobPlanStatus;
  planInvalidation?: { at: string; reason: string; fields: string[] };
  cancelReason?: string;
  /** Incremented on every persisted change. */
  revision: number;
  updatedAt: string;
}

/** Job shape before Phase 5 (legacy localStorage / demo seed source). */
export type LegacyJob = Omit<Job, "jobNumber" | "cargo" | "planStatus" | "revision" | "updatedAt" | "stops"> & {
  stops: (Omit<JobStop, "type"> & { type: "pickup" | "delivery" })[];
  jobNumber?: string;
  cargo?: CargoLine[];
  planStatus?: JobPlanStatus;
  revision?: number;
  updatedAt?: string;
};


/* ─── Existing types (unchanged contracts) ─────────── */

/** Who/what established a manually maintained measurement. Never presented as live telemetry. */
export type RecordSource = "MANUAL" | "DEMO";
export type Measured<T> = { value: T; recordedAt: string; source: RecordSource };

/** Manually controlled availability. Assignment/execution states are DERIVED from jobs. */
export type ResourceAvailability = "AVAILABLE" | "MAINTENANCE" | "OUT_OF_SERVICE";
export type TruckOperationalState = "AVAILABLE" | "ASSIGNED" | "IN_SERVICE" | "MAINTENANCE" | "OUT_OF_SERVICE" | "ARCHIVED";
export type VehicleType = "TRACTOR" | "RIGID" | "VAN";

/** Simulated position/status kept only for demo vehicles — always labelled as such. */
export interface DemoTelemetry {
  lat: number;
  lng: number;
  headingDeg: number;
  status: TruckStatus;
  routeId: string | null;
  fuelPct: number;
}

/** Persistent truck record (power unit). */
export interface Truck {
  id: string;
  plate: string;
  unitNumber?: string;
  make?: string;
  model?: string;
  yearManuf?: number;
  vehicleType: VehicleType;
  bodyType?: "curtainsider" | "reefer" | "flatbed" | "box" | "tanker";
  availability: ResourceAvailability;
  /* Physical / regulatory specification — as recorded from vehicle documents, never inferred. */
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  /** Maximum authorised gross weight (kg) — combination weight for tractors. */
  grossVehicleWeightKg?: number;
  kerbWeightKg?: number;
  /** Payload capacity (kg). */
  payloadKg?: number;
  axleCount?: number;
  /** Explicit scope for coupled planning; legacy axle counts have unspecified scope. */
  axleCountScope?: "POWER_UNIT" | "COMBINATION";
  maxAxleWeightKg?: number;
  /** Height measured vertically at the first axle (m). */
  firstAxleHeightM?: number;
  emissionClass?: string;
  adrEquipped?: boolean;
  palletCapacity?: number;
  /** e.g. "private", "state", "municipality:porto". */
  ownerCategory?: string;
  /** Generic routing profile used ONLY for dimensions this record does not have. */
  routingPresetId?: string;
  /* Manually entered measurements (not telemetry). */
  odometerKm?: Measured<number>;
  fuelCapacityL?: number;
  fuelLevelPct?: Measured<number>;
  notes?: string;
  /** Demo/test record — not a real vehicle. */
  isDemo?: boolean;
  /** Purpose of a demo record (e.g. "regulatory-test"). */
  demoPurpose?: string;
  demoTelemetry?: DemoTelemetry;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** The truck attributes Road Intelligence reads (structural — any record with these fields). */
export type TruckFacts = Pick<Truck, "id" | "grossVehicleWeightKg" | "axleCount" | "firstAxleHeightM" | "ownerCategory" | "isDemo" | "bodyType">;

/** Read model for visual components (map, cargo deck…): record + derived/display fields. */
export interface TruckView extends Truck {
  name: string;
  status: TruckStatus;
  operationalState: TruckOperationalState;
  /** null = position unknown (no telemetry). Demo vehicles carry a SIMULATED position. */
  lat: number | null;
  lng: number | null;
  positionSource: "DEMO_SIMULATED" | "UNKNOWN";
  headingDeg: number;
  fuelPct: number | null;
  maxWeightKg: number;
  currentWeightKg: number;
  cargoSlots: number;
  maxSlots: number;
  routeId: string | null;
  driverId: string | null;
}

export type TrailerType = "CURTAINSIDER" | "BOX" | "REFRIGERATED" | "FLATBED" | "TANKER" | "CONTAINER_CHASSIS" | "OTHER";

export interface Trailer {
  id: string;
  plate: string;
  unitNumber?: string;
  make?: string;
  model?: string;
  type: TrailerType;
  /** Free label when type is OTHER (extensible without code changes). */
  typeLabel?: string;
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  tareKg?: number;
  maxGrossWeightKg?: number;
  payloadKg?: number;
  axleCount?: number;
  palletCapacity?: number;
  capabilities: {
    refrigerated?: boolean;
    tempMinC?: number;
    tempMaxC?: number;
    adrSuitable?: boolean;
    tailLift?: boolean;
    other?: string[];
  };
  availability: ResourceAvailability;
  notes?: string;
  isDemo?: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Legacy demo truck shape (seed source only). */
export interface LegacyTruck {
  id: string;
  name: string;
  plate: string;
  status: TruckStatus;
  lat: number;
  lng: number;
  headingDeg: number;
  routeId: string | null;
  driverId: string | null;
  fuelPct: number;
  maxWeightKg: number;
  currentWeightKg: number;
  cargoSlots: number;
  maxSlots: number;
  model?: string;
  yearManuf?: number;
  odometerKm?: number;
  bodyType?: "curtainsider" | "reefer" | "flatbed" | "box" | "tanker";
  axleCount?: number;
  grossVehicleWeightKg?: number;
  firstAxleHeightM?: number;
  ownerCategory?: string;
  isDemo?: boolean;
}

export interface RouteStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  eta: string;
  plannedEta: string;
  delayMin: number;
  type: "pickup" | "delivery" | "fuel" | "rest";
  windowStart?: string;
  windowEnd?: string;
}

export interface Route {
  id: string;
  name: string;
  origin: string;
  destination: string;
  truckId: string;
  driverId: string;
  distanceKm: number;
  progressPct: number;
  status: "active" | "completed" | "planned" | "delayed";
  etaDestination: string;
  delayMin: number;
  stops: RouteStop[];
  polyline: [number, number][];
}

export type DriverAvailability = "AVAILABLE" | "OFF_DUTY" | "LEAVE" | "UNAVAILABLE";
export type DriverOperationalState = DriverAvailability | "ASSIGNED" | "ON_JOB" | "ARCHIVED";

/**
 * Driving-time baseline for EU 561 planning — manually entered (no tachograph ingestion yet).
 * Valid as of `recordedAt`; the planner shows its age and never treats it as live.
 */
export interface DriverHoursBaseline {
  drivenTodayMin: number;
  drivenWeekMin: number;
  /** Driving since the last qualifying break (min), if known. */
  currentSpellMin?: number;
  dutyStartedAt?: string;
  recordedAt: string;
  source: RecordSource;
}

export interface Driver {
  id: string;
  name: string;
  employeeNumber?: string;
  phone?: string;
  email?: string;
  homeTerminal?: string;
  availability: DriverAvailability;
  licence: { number?: string; categories: string[]; expiresOn?: string };
  cpc: { expiresOn?: string };
  adr: { certified: boolean; classes?: string[]; tanks?: boolean; expiresOn?: string };
  tachoCardExpiresOn?: string;
  hours: DriverHoursBaseline | null;
  notes?: string;
  isDemo?: boolean;
  /** Demo-only performance figures (not computed by FleetOS). */
  demoMetrics?: { safetyScore: number; onTimePct: number };
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Legacy demo driver shape (seed source only). */
export interface LegacyDriver {
  id: string;
  name: string;
  phone: string;
  license: string;
  status: DriverStatus;
  availability: "available" | "assigned" | "pto";
  truckId: string | null;
  hoursToday: number;
  hoursWeek: number;
  hoursLimit: number;
  safetyScore: number;
  onTimePct: number;
  complianceAlerts: string[];
  homeTerminal: string;
  licenseExpiry?: string;
  cpcExpiry?: string;
  adrExpiry?: string;
  tachoCalExpiry?: string;
}



/**
 * BLOCKER — work cannot proceed until fixed (broken reference).
 * ACTION_REQUIRED — something is wrong now and needs a person (deadline missed, replan, expired credential).
 * RISK — will become a problem if nothing is done (deadline at risk, credential expiring).
 * INFORMATION — housekeeping (documents to issue).
 * UNKNOWN / ASSUMED data never produce alerts: they are shown where the data is used.
 */
export type AlertSeverity = "BLOCKER" | "ACTION_REQUIRED" | "RISK" | "INFORMATION";

export interface OpsAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  entityType: "truck" | "driver" | "job" | "document";
  entityId: string;
  ts: string;
}



/* ─── Master data (Phase 5.6B) ─── */

export interface Customer {
  id: string;
  name: string;
  nif?: string;
  billingAddress?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  isDemo?: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Site {
  id: string;
  customerId?: string;
  name: string;
  address: string;
  locality?: string;
  postalCode?: string;
  country?: string;
  lat: number;
  lng: number;
  /** Address the coordinates were located for (stale when the address changes). */
  geocodedAddress?: string;
  /** Informational only — not a scheduling rule. */
  openingHours?: string;
  contactName?: string;
  phone?: string;
  accessNotes?: string;
  isDemo?: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** What the dispatcher saw and accepted when confirming a plan — kept verbatim for the dossier. */
export interface PlanDecisionSummary {
  routingDecision?: { recommendedRouteId: string | null; selectedRouteId: string; evaluatedCandidateCount: number; excludedCandidateCount: number; executableCandidateCount?: number; decisionCount?: number; fastestRouteId?: string | null; bestValueRouteId?: string | null; lowestCostRouteId?: string | null; decisionStatus?: string; tradeoffExists?: boolean; unresolvedIssues?: string[]; provenance?: string[]; familyId?: string; reason?: string; policyVersion: number };
  confirmedAt: string;
  routeTitle: string;
  departureAt: string;
  arrivalAt?: string;
  /** Delivery-window result as shown at confirmation, e.g. "Dentro da janela" / "Fora da janela (+45 min)". */
  windowResult?: { ok: boolean | null; text: string };
  /** EU 561 conclusion line, e.g. "Legal · 18h30 esta semana". */
  eu561?: { ok: boolean | null; text: string };
  /** Road Intelligence conclusion line. */
  roadIntelligence?: { tone: "ok" | "warn" | "danger" | "neutral"; text: string };
  /** Short list of routing assumptions (values not recorded on the truck/cargo). */
  assumptions: string[];
}
