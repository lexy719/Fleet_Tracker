/* ─────────────────────────────────────────────────────
   Core domain types for Peninsula Fleet OS
   ───────────────────────────────────────────────────── */

export type TruckStatus =
  | "in_transit"
  | "idle"
  | "loading"
  | "maintenance"
  | "delayed";

export type CargoType = "dry" | "refrigerated" | "hazmat" | "bulk" | "automotive";

export type LoadStatus = "secured" | "pending" | "unbalanced";

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

export interface JobStop {
  id: string;
  sequence: number;
  type: "pickup" | "delivery";
  clientName: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  scheduledTime: string;   // "08:00"
  windowEnd: string;       // "11:00"
  actualTime?: string;
  cargoDescription: string;
  weightKg: number;
  pallets: number;
  completed: boolean;
  notes?: string;
}

export interface Job {
  id: string;
  reference: string;          // referência interna — gerada automaticamente
  client: string;
  status: JobStatus;
  priority: JobPriority;
  cargoType: CargoType;
  totalWeightKg: number;
  totalPallets: number;
  stops: JobStop[];
  assignedTruckId?: string;
  assignedDriverId?: string;
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
}

/* ─── Fleet maintenance ─────────────────────────────── */
export type MaintenanceStatus = "ok" | "due_soon" | "overdue";
export type MaintenanceType =
  | "itp"          // ITP — Inspeção Técnica Periódica
  | "service_oil"  // oil + filters service
  | "tires"        // tire replacement
  | "tacho_cal"    // tachograph calibration (EU: every 2y)
  | "cpc"          // Driver CPC periodic training
  | "adr_cert";    // ADR hazmat certificate

export interface MaintenanceItem {
  id: string;
  truckId: string;
  type: MaintenanceType;
  label: string;
  dueDate: string;           // "2026-05-14"
  lastDoneDate?: string;
  status: MaintenanceStatus;
  estimatedCostEur?: number;
  notes?: string;
}

/* ─── Existing types (unchanged contracts) ─────────── */
export interface CargoItem {
  id: string;
  sku: string;
  label: string;
  weightKg: number;
  type: CargoType;
  destination: string;
  loadStatus: LoadStatus;
}

export interface Truck {
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
  // Additional fields for Fleet page
  model?: string;
  yearManuf?: number;
  odometerKm?: number;
  bodyType?: "curtainsider" | "reefer" | "flatbed" | "box" | "tanker";
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

export interface Driver {
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
  /** EU document expiry dates — drives countdown/alert logic. */
  licenseExpiry?:  string;   // driving licence (cat C+E) — "YYYY-MM-DD"
  cpcExpiry?:      string;   // Certificate of Professional Competence (every 5 y)
  adrExpiry?:      string;   // ADR hazmat certificate (every 5 y)
  tachoCalExpiry?: string;   // tachograph calibration reminder
}

export interface FuelReading {
  id: string;
  truckId: string;
  date: string;
  liters: number;
  costEur: number;
  odometerKm: number;
  lPer100km: number;
}

export interface FuelMetrics {
  truckId: string;
  avgLPer100km30d: number;
  cost30dEur: number;
  inefficiencyFlags: string[];
}

export type AlertSeverity = "critical" | "warning" | "info";

export interface OpsAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  entityType: "route" | "truck" | "driver" | "cargo" | "fuel" | "job" | "maintenance";
  entityId: string;
  ts: string;
}

export type VehicleTrailKind = "ignition_off" | "stop" | "driving";

export interface VehicleTrailEvent {
  id: string;
  truckId: string;
  kind: VehicleTrailKind;
  timeLabel: string;
  address: string;
  speedKmh: number;
}

export interface TruckingJobRow {
  id: string;
  shipmentId: string;
  carrier: string;
  jobType: "FTL" | "LTL";
  status: string;
  estPickup: string;
  actualPickup: string;
  routeId?: string;
}
