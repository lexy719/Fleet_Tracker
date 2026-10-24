/**
 * 5.7I synthetic operational world.
 *
 * Shapes follow the production domain model (Job/JobStop/CargoLine, Driver hours
 * baseline + qualifications, Truck Measured readings, OpsDocument snapshots,
 * RegulationRecord tri-state applicability, OpsAlert severities). Values are
 * synthetic. Road geometry is NOT synthetic: it is read from recorded TomTom truck
 * routes and OSM restriction geometry already stored in the repository.
 * Nothing here reads an operational repository or production state.
 */
import { VCI_RING_LINES } from "../regulations/portugal/geometry/vciPortoRing";
import { CREP_LINES } from "../regulations/portugal/geometry/crepA41";
import {
  IP3_SEGMENT_21_22,
  IP3_SEGMENT_24_25,
} from "../regulations/portugal/geometry/ip3Works2026";
import type { Point } from "./mapTypes";

/* ─── Recorded route geometry ─────────────────────────────────────────── */

type RouteFixture = {
  id: string;
  from: string;
  to: string;
  strategy: string;
  retrievedAt: string;
  request: string;
  lengthInMeters: number;
  travelTimeInSeconds: number;
  roads: string[];
  points: [number, number][];
};
const FIXTURES = import.meta.glob<RouteFixture>(
  [
    "../regulations/__fixtures__/routeMatrix/faro__porto__fastest.json",
    "../regulations/__fixtures__/routeMatrix/faro__porto__no_tolls.json",
    "../regulations/__fixtures__/routeMatrix/porto__lisboa__fastest.json",
    "../regulations/__fixtures__/routeMatrix/braganca__porto__fastest.json",
    "../regulations/__fixtures__/routeMatrix/coimbra__viseu__fastest.json",
    "../regulations/__fixtures__/routeMatrix/evora__porto__fastest.json",
    "../regulations/__fixtures__/routeMatrix/viseu__faro__fastest.json",
  ],
  { eager: true, import: "default" },
);

export type RecordedRoute = {
  id: string;
  km: number;
  hours: number;
  roads: string[];
  retrievedAt: string;
  strategy: string;
  line: Point[];
  /** Cumulative km for every point of `line`. */
  cum: number[];
};
const rad = (d: number) => (d * Math.PI) / 180;
export function haversineKm(a: Point, b: Point) {
  const x =
    Math.sin(rad(b[1] - a[1]) / 2) ** 2 +
    Math.cos(rad(a[1])) *
      Math.cos(rad(b[1])) *
      Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}
/** Drop points closer than `minKm` to the previous kept point (keeps road shape). */
function thin(points: Point[], minKm: number): Point[] {
  const out: Point[] = [points[0]];
  for (const p of points.slice(1, -1))
    if (haversineKm(out.at(-1)!, p) >= minKm) out.push(p);
  out.push(points.at(-1)!);
  return out;
}
const toLngLat = (lines: [number, number][][]) =>
  lines.map((l) => l.map(([lat, lng]) => [lng, lat] as Point));
export const ROUTES: Record<string, RecordedRoute> = Object.fromEntries(
  Object.values(FIXTURES).map((f) => {
    const line = thin(
      f.points.map(([lat, lng]) => [lng, lat] as Point),
      0.25,
    );
    const cum = [0];
    for (let i = 1; i < line.length; i++)
      cum.push(cum[i - 1] + haversineKm(line[i - 1], line[i]));
    return [
      f.id,
      {
        id: f.id,
        km: f.lengthInMeters / 1000,
        hours: f.travelTimeInSeconds / 3600,
        roads: f.roads,
        retrievedAt: f.retrievedAt,
        strategy: f.strategy,
        line,
        cum,
      },
    ];
  }),
);
export function pointAtKm(route: RecordedRoute, km: number): Point {
  const i = route.cum.findIndex((c) => c >= km);
  if (i <= 0) return route.line[i === 0 ? 0 : route.line.length - 1];
  const t = (km - route.cum[i - 1]) / (route.cum[i] - route.cum[i - 1] || 1);
  const a = route.line[i - 1],
    b = route.line[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
export function sliceKm(route: RecordedRoute, from: number, to: number) {
  const inner = route.line.filter(
    (_, i) => route.cum[i] > from && route.cum[i] < to,
  );
  return [pointAtKm(route, from), ...inner, pointAtKm(route, to)];
}
export function kmOf(route: RecordedRoute, p: Point) {
  let best = 0;
  route.line.forEach((q, i) => {
    if (
      (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 <
      (route.line[best][0] - p[0]) ** 2 + (route.line[best][1] - p[1]) ** 2
    )
      best = i;
  });
  return route.cum[best];
}

export const VCI_LINES = toLngLat(VCI_RING_LINES);
export const CREP = toLngLat(CREP_LINES);
export const IP3_WORKS = toLngLat([...IP3_SEGMENT_21_22, ...IP3_SEGMENT_24_25]);

/* ─── Time ────────────────────────────────────────────────────────────── */

/** The lab clock: Tuesday 6 Oct 2026, 10:05 Europe/Lisbon. */
export const NOW = { label: "ter 6 out", clock: "10:05", min: 10 * 60 + 5 };
export const hm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
export const dur = (min: number) =>
  `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`;

/* ─── Honesty vocabulary ──────────────────────────────────────────────── */

export type Honesty =
  | "KNOWN"
  | "UNKNOWN"
  | "ASSUMED"
  | "STALE"
  | "SIMULATED"
  | "UNCERTAIN"
  | "ERROR"
  | "LOADING"
  | "EMPTY";
export type Prov = { kind: Honesty; source: string; at?: string };

/* ─── Jobs (production Job shape, reduced) ────────────────────────────── */

export type JobStatus =
  | "backlog"
  | "queued"
  | "assigned"
  | "loading"
  | "in_transit"
  | "delivered"
  | "invoiced"
  | "cancelled";
export type Stop = {
  id: string;
  type: "pickup" | "stop" | "delivery";
  site: string;
  city: string;
  km: number;
  window: [string, string];
  /** Planned arrival (lab plan), or actual completion. */
  eta: string;
  completedAt?: string;
  cargo: string;
};
export type CargoLine = {
  id: string;
  description: string;
  pallets: number;
  weightKg: number;
  dropAt: string;
  adr?: string;
  tempC?: [number, number];
};
export type WorldJob = {
  id: string;
  reference: string;
  client: string;
  routeId: string;
  status: JobStatus;
  priority: "normal" | "urgent" | "critical";
  sla: "on_track" | "at_risk" | "breached";
  plan: "UNPLANNED" | "PLANNED" | "REPLAN_REQUIRED";
  planNote?: string;
  revision: number;
  stops: Stop[];
  cargo: CargoLine[];
  driverId: string;
  truckId: string;
  trailerId: string;
  positionKm: number | null;
  positionSource: "SIMULATED" | "UNKNOWN";
  blockers: string[];
  next: string;
};
export const STATUS_LABEL: Record<JobStatus, string> = {
  backlog: "Por atribuir",
  queued: "Em fila",
  assigned: "Atribuído",
  loading: "Em carga",
  in_transit: "Em trânsito",
  delivered: "Entregue",
  invoiced: "Faturado",
  cancelled: "Cancelado",
};
export const LIFECYCLE: JobStatus[] = [
  "backlog",
  "assigned",
  "loading",
  "in_transit",
  "delivered",
  "invoiced",
];
export const SLA_LABEL = {
  on_track: "SLA ok",
  at_risk: "SLA em risco",
  breached: "SLA ultrapassado",
};
export const PLAN_LABEL = {
  UNPLANNED: "Por planear",
  PLANNED: "Planeado",
  REPLAN_REQUIRED: "A replanear",
};

export const WORLD_JOBS: WorldJob[] = [
  {
    id: "J-4217",
    reference: "IBC-88213",
    client: "Iberia Components",
    routeId: "faro__porto__fastest",
    status: "in_transit",
    priority: "normal",
    sla: "on_track",
    plan: "PLANNED",
    revision: 7,
    stops: [
      {
        id: "S1",
        type: "pickup",
        site: "Parque Empresarial de Faro",
        city: "Faro",
        km: 0,
        window: ["06:00", "07:00"],
        eta: "06:10",
        completedAt: "06:41",
        cargo: "24 paletes carregadas",
      },
      {
        id: "S2",
        type: "stop",
        site: "Armazém Eiras",
        city: "Coimbra",
        km: 441,
        window: ["12:30", "13:30"],
        eta: "12:57",
        cargo: "Descarga parcial · 6 paletes",
      },
      {
        id: "S3",
        type: "delivery",
        site: "Centro logístico Campanhã",
        city: "Porto",
        km: 556,
        window: ["15:30", "17:00"],
        eta: "15:12",
        cargo: "Entrega final · 18 paletes",
      },
    ],
    cargo: [
      {
        id: "C1",
        description: "Componentes eletrónicos",
        pallets: 18,
        weightKg: 10500,
        dropAt: "Porto",
      },
      {
        id: "C2",
        description: "Cablagens automóvel",
        pallets: 6,
        weightKg: 2600,
        dropAt: "Coimbra",
      },
    ],
    driverId: "D-14",
    truckId: "T-08",
    trailerId: "PT-3821",
    positionKm: 282,
    positionSource: "SIMULATED",
    blockers: [],
    next: "Confirmar a paragem para a pausa obrigatória",
  },
  {
    id: "J-4218",
    reference: "LSB-20931",
    client: "Atlântico Retalho",
    routeId: "porto__lisboa__fastest",
    status: "assigned",
    priority: "urgent",
    sla: "at_risk",
    plan: "REPLAN_REQUIRED",
    planNote: "Janela de entrega mudou de 14:00–15:00 para 11:00–12:00",
    revision: 4,
    stops: [
      {
        id: "S1",
        type: "pickup",
        site: "Plataforma Maia",
        city: "Porto",
        km: 0,
        window: ["13:00", "14:00"],
        eta: "13:20",
        cargo: "30 paletes",
      },
      {
        id: "S2",
        type: "delivery",
        site: "Loja Alcântara",
        city: "Lisboa",
        km: 313,
        window: ["11:00", "12:00"],
        eta: "17:40",
        cargo: "30 paletes",
      },
    ],
    cargo: [
      {
        id: "C1",
        description: "Bens de consumo",
        pallets: 30,
        weightKg: 14200,
        dropAt: "Lisboa",
      },
    ],
    driverId: "D-22",
    truckId: "T-12",
    trailerId: "PT-3910",
    positionKm: null,
    positionSource: "UNKNOWN",
    blockers: ["Plano confirmado já não corresponde à janela de entrega"],
    next: "Rever o plano com a nova janela",
  },
  {
    id: "J-4219",
    reference: "FRV-1182",
    client: "Frutas do Nordeste",
    routeId: "braganca__porto__fastest",
    status: "in_transit",
    priority: "normal",
    sla: "on_track",
    plan: "PLANNED",
    revision: 3,
    stops: [
      {
        id: "S1",
        type: "pickup",
        site: "Central fruteira",
        city: "Bragança",
        km: 0,
        window: ["06:30", "07:30"],
        eta: "06:40",
        completedAt: "07:02",
        cargo: "26 paletes refrigeradas",
      },
      {
        id: "S2",
        type: "delivery",
        site: "Mercado Abastecedor",
        city: "Porto",
        km: 216,
        window: ["11:00", "12:30"],
        eta: "11:18",
        cargo: "26 paletes",
      },
    ],
    cargo: [
      {
        id: "C1",
        description: "Fruta fresca",
        pallets: 26,
        weightKg: 15600,
        dropAt: "Porto",
        tempC: [2, 6],
      },
    ],
    driverId: "D-09",
    truckId: "T-03",
    trailerId: "PT-3720",
    positionKm: 160,
    positionSource: "SIMULATED",
    blockers: [],
    next: "Confirmar substituição do motorista ou exceção",
  },
  {
    id: "J-4220",
    reference: "QMC-3307",
    client: "Química Centro",
    routeId: "coimbra__viseu__fastest",
    status: "queued",
    priority: "urgent",
    sla: "on_track",
    plan: "PLANNED",
    revision: 2,
    stops: [
      {
        id: "S1",
        type: "pickup",
        site: "Terminal Taveiro",
        city: "Coimbra",
        km: 0,
        window: ["14:00", "15:00"],
        eta: "14:10",
        cargo: "12 IBC",
      },
      {
        id: "S2",
        type: "delivery",
        site: "Zona industrial Mundão",
        city: "Viseu",
        km: 96,
        window: ["16:30", "18:00"],
        eta: "16:05",
        cargo: "12 IBC",
      },
    ],
    cargo: [
      {
        id: "C1",
        description: "Resina em IBC",
        pallets: 12,
        weightKg: 11800,
        dropAt: "Viseu",
        adr: "UN1993 · Classe 3",
      },
    ],
    driverId: "D-31",
    truckId: "T-19",
    trailerId: "PT-4082",
    positionKm: null,
    positionSource: "UNKNOWN",
    blockers: ["Viatura atribuída está em manutenção"],
    next: "Reatribuir viatura antes da carga das 14:00",
  },
  {
    id: "J-4221",
    reference: "ALT-5520",
    client: "Alentejo Têxtil",
    routeId: "evora__porto__fastest",
    status: "loading",
    priority: "normal",
    sla: "at_risk",
    plan: "PLANNED",
    revision: 5,
    stops: [
      {
        id: "S1",
        type: "pickup",
        site: "Fábrica Horta das Figueiras",
        city: "Évora",
        km: 0,
        window: ["08:30", "09:30"],
        eta: "08:40",
        cargo: "20 paletes",
      },
      {
        id: "S2",
        type: "delivery",
        site: "Armazém Leça",
        city: "Porto",
        km: 395,
        window: ["13:30", "14:00"],
        eta: "14:12",
        cargo: "20 paletes",
      },
    ],
    cargo: [
      {
        id: "C1",
        description: "Rolos têxteis",
        pallets: 20,
        weightKg: 9100,
        dropAt: "Porto",
      },
    ],
    driverId: "D-17",
    truckId: "T-06",
    trailerId: "PT-3854",
    positionKm: 0,
    positionSource: "SIMULATED",
    blockers: [],
    next: "Avisar o cliente ou rever a entrega",
  },
  {
    id: "J-4222",
    reference: "VSF-0712",
    client: "Granitos Beira",
    routeId: "viseu__faro__fastest",
    status: "backlog",
    priority: "normal",
    sla: "on_track",
    plan: "UNPLANNED",
    revision: 1,
    stops: [
      {
        id: "S1",
        type: "pickup",
        site: "Pedreira Abraveses",
        city: "Viseu",
        km: 0,
        window: ["08:00", "10:00"],
        eta: "—",
        cargo: "Blocos de granito",
      },
      {
        id: "S2",
        type: "delivery",
        site: "Obra Marina",
        city: "Faro",
        km: 520,
        window: ["16:00", "18:00"],
        eta: "—",
        cargo: "Blocos de granito",
      },
    ],
    cargo: [
      {
        id: "C1",
        description: "Blocos de granito",
        pallets: 10,
        weightKg: 22800,
        dropAt: "Faro",
      },
    ],
    driverId: "D-26",
    truckId: "T-15",
    trailerId: "PT-3302",
    positionKm: null,
    positionSource: "UNKNOWN",
    blockers: ["Reboque «PT-3302» não existe na frota"],
    next: "Atribuir um reboque existente",
  },
];
export const worldJob = (id: string) =>
  WORLD_JOBS.find((j) => j.id === id) ?? WORLD_JOBS[0];

/* ─── Driver (production Driver + hours baseline) ─────────────────────── */

export type Qualification = {
  kind: "licence" | "cpc" | "adr" | "tacho";
  label: string;
  detail: string;
  state: "VALID" | "EXPIRING" | "EXPIRED" | "MISSING" | "NOT_HELD";
  until?: string;
};
export type DutyBlock = {
  kind: "drive" | "work" | "break" | "rest";
  from: number;
  to: number;
  planned?: boolean;
  label?: string;
};
export type DriverWorld = {
  id: string;
  name: string;
  employee: string;
  qualifications: Qualification[];
  baseline: {
    recordedAt: string;
    recordedLabel: string;
    stale: boolean;
    drivenBeforeMin: number;
    weekMin: number;
    fortnightMin: number;
  };
  duty: DutyBlock[];
  /** Driving since the last qualifying break, at NOW. */
  spellMin: number;
  dayMin: number;
};
export function driverWorld(
  id: string,
  /** forJob: the day of a reassigned driver follows the transport, not their seeded one. */
  opts: { stale?: boolean; critical?: boolean; forJob?: string } = {},
): DriverWorld {
  const base: DriverWorld = {
    id,
    name:
      {
        "D-14": "Miguel Costa",
        "D-22": "Ana Ribeiro",
        "D-09": "Rui Santos",
        "D-31": "Sofia Martins",
        "D-17": "Pedro Lima",
        "D-26": "Inês Duarte",
        "D-40": "Carla Nunes",
        "D-41": "Jorge Pires",
      }[id] ?? "Motorista",
    employee: `N.º ${id.replace("D-", "10")}`,
    qualifications: [
      {
        kind: "licence",
        label: "Carta CE",
        detail: "C · CE",
        state: "VALID",
        until: "14 mar 2031",
      },
      id === "D-09"
        ? {
            kind: "cpc",
            label: "CQM (CPC)",
            detail: "caducou há 4 dias",
            state: "EXPIRED",
            until: "2 out 2026",
          }
        : {
            kind: "cpc",
            label: "CQM (CPC)",
            detail: "41 dias",
            state: "EXPIRING",
            until: "16 nov 2026",
          },
      {
        kind: "adr",
        label: "ADR",
        detail: "não exigido pela carga",
        state: "NOT_HELD",
      },
      {
        kind: "tacho",
        label: "Cartão de tacógrafo",
        detail: "válido",
        state: "VALID",
        until: "2 fev 2028",
      },
    ],
    baseline: {
      recordedAt: "06:30",
      recordedLabel: "hoje 06:30",
      stale: false,
      drivenBeforeMin: 25,
      weekMin: 31 * 60 + 20,
      fortnightMin: 62 * 60 + 40,
    },
    duty: [
      { kind: "drive", from: 5 * 60 + 55, to: 6 * 60 + 20, label: "Posicionamento" },
      { kind: "work", from: 6 * 60 + 20, to: 6 * 60 + 45, label: "Carga em Faro" },
      { kind: "drive", from: 6 * 60 + 45, to: NOW.min, label: "A22 · A2 · A1" },
      { kind: "drive", from: NOW.min, to: 10 * 60 + 32, planned: true },
      { kind: "work", from: 10 * 60 + 32, to: 10 * 60 + 42, planned: true, label: "Abastecer" },
      { kind: "break", from: 10 * 60 + 42, to: 11 * 60 + 27, planned: true, label: "Pausa 45 min" },
      { kind: "drive", from: 11 * 60 + 27, to: 12 * 60 + 57, planned: true },
      { kind: "work", from: 12 * 60 + 57, to: 13 * 60 + 37, planned: true, label: "Descarga Coimbra" },
      { kind: "drive", from: 13 * 60 + 37, to: 15 * 60 + 12, planned: true },
      { kind: "work", from: 15 * 60 + 12, to: 15 * 60 + 52, planned: true, label: "Descarga Porto" },
    ],
    spellMin: 25 + 200,
    dayMin: 25 + 200,
  };
  if (opts.stale)
    base.baseline = {
      ...base.baseline,
      recordedAt: "ontem 18:40",
      recordedLabel: "ontem 18:40",
      stale: true,
      drivenBeforeMin: 0,
    };
  if (opts.critical) {
    base.spellMin = 245;
    base.dayMin = 245;
    base.baseline = { ...base.baseline, drivenBeforeMin: 45 };
    base.duty[0] = { ...base.duty[0], from: 5 * 60 + 35, label: "Posicionamento corrigido" };
  }
  if (opts.stale) {
    base.spellMin = 200;
    base.dayMin = 200;
  }
  // Only D-14 / D-09 carry qualification exceptions; everyone else is valid.
  if (id !== "D-14" && id !== "D-09")
    base.qualifications[1] = {
      kind: "cpc",
      label: "CQM (CPC)",
      detail: "válido",
      state: "VALID",
      until: "3 mai 2028",
    };
  // Every other driver's day follows their own transport, not the J-4217 template.
  const job = opts.forJob ? WORLD_JOBS.find((j) => j.id === opts.forJob) : WORLD_JOBS.find((j) => j.driverId === id);
  if (opts.forJob && job?.driverId !== id)
    // A reassigned driver has no recorded hours for this transport yet.
    base.baseline = { ...base.baseline, recordedAt: "—", recordedLabel: "sem base registada hoje", stale: true, drivenBeforeMin: 0 };
  if (!job) {
    // Free drivers: no duty planned today.
    base.duty = [{ kind: "rest", from: 6 * 60, to: NOW.min, label: "Sem serviço" }];
    base.spellMin = 0;
    base.dayMin = 0;
    return base;
  }
  if (job.id !== "J-4217") {
    const t = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    const first = t(job.stops[0].window[0]);
    const last = job.stops.at(-1)!;
    const eta = /\d/.test(last.eta) ? t(last.eta) : first + 300;
    if (job.status === "in_transit") {
      const start = t(job.stops[0].completedAt ?? job.stops[0].window[0]);
      base.duty = [
        { kind: "work", from: start - 30, to: start, label: `Carga em ${job.stops[0].city}` },
        { kind: "drive", from: start, to: NOW.min, label: "Em viagem" },
        { kind: "drive", from: NOW.min, to: eta, planned: true },
        { kind: "work", from: eta, to: eta + 40, planned: true, label: `Descarga ${last.city}` },
      ];
      base.spellMin = NOW.min - start;
    } else if (job.status === "loading") {
      base.duty = [
        { kind: "work", from: first, to: NOW.min, label: `Carga em ${job.stops[0].city}` },
        { kind: "drive", from: NOW.min + 10, to: Math.max(NOW.min + 20, eta), planned: true },
      ];
      base.spellMin = 0;
    } else {
      base.duty = [
        { kind: "work", from: first, to: first + 40, planned: true, label: `Carga em ${job.stops[0].city}` },
        { kind: "drive", from: first + 40, to: Math.max(first + 60, eta), planned: true },
      ];
      base.spellMin = 0;
    }
    base.dayMin = base.spellMin;
    base.baseline = { ...base.baseline, drivenBeforeMin: 0 };
  }
  return base;
}
export const SPELL_LIMIT = 270;
export const DAY_LIMIT = 540;
export const WEEK_LIMIT = 56 * 60;

/* ─── Truck / trailer (production Truck, Trailer, Measured<T>) ────────── */

export type Measured<T> = { value: T; prov: Prov };
export type TruckWorld = {
  id: string;
  plate: string;
  make: string;
  model: string;
  emission: string;
  vehicleType: "TRACTOR";
  availability: "AVAILABLE" | "MAINTENANCE" | "OUT_OF_SERVICE";
  state: "AVAILABLE" | "ASSIGNED" | "IN_SERVICE" | "MAINTENANCE";
  adrEquipped: boolean;
  axles: number;
  tareKg: number;
  firstAxleHeightM: number | null;
  tankL: number;
  fuel: Measured<number>;
  odometer: Measured<number>;
  consumptionL100: Measured<number>;
  service: string;
};
export type TrailerWorld = {
  id: string;
  /** Where an unassigned trailer is parked (assigned ones follow their transport). */
  location?: string;
  plate: string;
  type: string;
  lengthM: number;
  heightM: number;
  axles: number;
  tareKg: number;
  pallets: number;
  capabilities: string[];
};
export const TRUCKS: Record<string, TruckWorld> = {
  "T-08": {
    id: "T-08",
    plate: "AA-42-ZP",
    make: "DAF",
    model: "XF 480 FT",
    emission: "Euro VI",
    vehicleType: "TRACTOR",
    availability: "AVAILABLE",
    state: "IN_SERVICE",
    adrEquipped: false,
    axles: 2,
    tareKg: 7600,
    firstAxleHeightM: null,
    tankL: 430,
    fuel: {
      value: 31,
      prov: { kind: "KNOWN", source: "manual · depósito Faro", at: "06:30" },
    },
    odometer: {
      value: 412380,
      prov: { kind: "KNOWN", source: "manual", at: "ontem 19:10" },
    },
    consumptionL100: {
      value: 29,
      prov: { kind: "ASSUMED", source: "perfil do cenário" },
    },
    service: "Revisão aos 420 000 km",
  },
  "T-18": {
    id: "T-18",
    plate: "DE-18-RT",
    make: "Volvo",
    model: "FH 460",
    emission: "Euro VI",
    vehicleType: "TRACTOR",
    availability: "AVAILABLE",
    state: "AVAILABLE",
    adrEquipped: true,
    axles: 2,
    tareKg: 7900,
    firstAxleHeightM: 1.18,
    tankL: 300,
    fuel: {
      value: 24,
      prov: { kind: "KNOWN", source: "manual · Porto", at: "ontem 20:15" },
    },
    odometer: {
      value: 288104,
      prov: { kind: "KNOWN", source: "manual", at: "ontem 20:15" },
    },
    consumptionL100: {
      value: 31,
      prov: { kind: "ASSUMED", source: "perfil do cenário" },
    },
    service: "Sem atenção registada",
  },
};
const variant = (
  id: string,
  plate: string,
  make: string,
  model: string,
  firstAxleHeightM: number | null,
  availability: TruckWorld["availability"],
  fuel: [number, string, string],
  odometer: number,
  service: string,
): TruckWorld => ({
  ...TRUCKS["T-08"],
  id,
  plate,
  make,
  model,
  firstAxleHeightM,
  availability,
  state: availability === "MAINTENANCE" ? "MAINTENANCE" : "IN_SERVICE",
  fuel: { value: fuel[0], prov: { kind: "KNOWN", source: `manual · ${fuel[1]}`, at: fuel[2] } },
  odometer: { value: odometer, prov: { kind: "KNOWN", source: "manual", at: fuel[2] } },
  service,
  adrEquipped: id === "T-19",
});
Object.assign(TRUCKS, {
  "T-12": variant("T-12", "BC-71-LA", "Mercedes-Benz", "Actros 1845", 1.15, "AVAILABLE", [68, "parque Maia", "ontem 19:40"], 356210, "Sem atenção registada"),
  "T-03": variant("T-03", "BE-26-XM", "Scania", "R 450", 1.25, "AVAILABLE", [56, "Bragança", "hoje 06:50"], 501877, "Revisão aos 510 000 km"),
  "T-19": variant("T-19", "CA-48-VN", "MAN", "TGX 18.470", null, "MAINTENANCE", [44, "oficina Coimbra", "hoje 08:40"], 274930, "Em oficina · travões, previsão 15:00"),
  "T-06": variant("T-06", "BB-53-HS", "Iveco", "S-Way 490", 1.12, "AVAILABLE", [62, "Évora", "hoje 08:20"], 198442, "Sem atenção registada"),
  "T-15": variant("T-15", "CD-19-RP", "Renault", "T 480", null, "AVAILABLE", [82, "Viseu", "ontem 18:00"], 433015, "Sem atenção registada"),
});
export const TRAILERS: Record<string, TrailerWorld> = {
  "PT-3821": {
    id: "PT-3821",
    plate: "L-238214",
    type: "Cortinas",
    lengthM: 13.6,
    heightM: 4.0,
    axles: 3,
    tareKg: 6900,
    pallets: 33,
    capabilities: ["Cortinas laterais", "Sem frio", "Sem ADR"],
  },
  "PT-3910": { id: "PT-3910", plate: "L-239108", type: "Cortinas", lengthM: 13.6, heightM: 4.0, axles: 3, tareKg: 6800, pallets: 33, capabilities: ["Cortinas laterais", "Sem frio", "Sem ADR"] },
  "PT-3720": { id: "PT-3720", plate: "L-237205", type: "Frigorífico", lengthM: 13.6, heightM: 4.0, axles: 3, tareKg: 8200, pallets: 33, capabilities: ["Frio 0–8 °C", "Sem ADR"] },
  "PT-4082": { id: "PT-4082", plate: "L-240826", type: "Cortinas ADR", lengthM: 13.6, heightM: 4.0, axles: 3, tareKg: 7000, pallets: 33, capabilities: ["Cortinas laterais", "Equipado ADR"] },
  "PT-1021": { id: "PT-1021", location: "livre · parque Maia", plate: "L-210214", type: "Cortinas", lengthM: 13.6, heightM: 4.0, axles: 3, tareKg: 6850, pallets: 33, capabilities: ["Cortinas laterais", "Sem frio", "Sem ADR"] },
  "PT-8481": { id: "PT-8481", location: "livre · Viseu", plate: "L-284810", type: "Cortinas ADR", lengthM: 13.6, heightM: 4.0, axles: 3, tareKg: 7050, pallets: 33, capabilities: ["Cortinas laterais", "Equipado ADR"] },
  "PT-3390": { id: "PT-3390", location: "livre · Coimbra", plate: "L-233906", type: "Frigorífico", lengthM: 13.6, heightM: 4.1, axles: 3, tareKg: 8300, pallets: 33, capabilities: ["Frio 0–8 °C", "Sem ADR"] },
  "PT-9281": { id: "PT-9281", location: "livre · Faro", plate: "L-292817", type: "Lona baixa", lengthM: 13.6, heightM: 3.6, axles: 2, tareKg: 6100, pallets: 30, capabilities: ["Lona", "Sem frio", "Sem ADR"] },
  "PT-3854": { id: "PT-3854", plate: "L-238547", type: "Cortinas", lengthM: 13.6, heightM: 4.0, axles: 3, tareKg: 6900, pallets: 33, capabilities: ["Cortinas laterais", "Sem frio", "Sem ADR"] },
};
export const truckWorld = (id: string) => TRUCKS[id] ?? TRUCKS["T-08"];
/** Who uses a resource today (for assignment candidates). */
export const holderOf = (kind: "driverId" | "truckId" | "trailerId", id: string) =>
  WORLD_JOBS.find((j) => j[kind] === id)?.id ?? null;
export const DRIVER_POOL: { id: string; where: string }[] = [
  { id: "D-14", where: "A1 · Carregado" },
  { id: "D-22", where: "Porto" },
  { id: "D-09", where: "IP4 · Amarante" },
  { id: "D-31", where: "Coimbra" },
  { id: "D-17", where: "Évora" },
  { id: "D-26", where: "Viseu" },
  { id: "D-40", where: "livre · Maia" },
  { id: "D-41", where: "folga até 14:00 · Faro" },
];
/** Unknown trailer ids stay unknown: the caller must handle a missing trailer. */
export function trailerWorld(id: string): TrailerWorld | null {
  return Object.prototype.hasOwnProperty.call(TRAILERS, id) ? TRAILERS[id] : null;
}

/* ─── Route & Stops candidates (lab concept; no production stop source) ─ */

export type StopCandidate = {
  id: string;
  name: string;
  road: string;
  km: number;
  detourKm: number;
  arrival: string;
  arrivalMin: number;
  priceEurL: number;
  litres: number;
  parking: number;
  breakFits: boolean;
  marginMin: number;
  coimbraEta: string;
  restriction: string | null;
  recommended?: boolean;
  note: string;
};
export function stopCandidates(opts: { critical?: boolean } = {}): StopCandidate[] {
  const limit = NOW.min + (SPELL_LIMIT - (opts.critical ? 245 : 225));
  const mk = (
    c: Omit<StopCandidate, "breakFits" | "marginMin" | "arrival">,
  ): StopCandidate => ({
    ...c,
    arrival: hm(c.arrivalMin),
    breakFits: c.arrivalMin <= limit,
    marginMin: limit - c.arrivalMin,
  });
  return [
    mk({
      id: "F-03",
      name: "Área de serviço de Aveiras",
      road: "A1 · sentido norte",
      km: 296,
      detourKm: 0.4,
      arrivalMin: NOW.min + 11,
      priceEurL: 1.61,
      litres: 300,
      parking: 18,
      coimbraEta: "12:46",
      restriction: null,
      recommended: !!opts.critical,
      note: "Pausa cedo; perde 16 min de condução útil",
    }),
    mk({
      id: "F-07",
      name: "Área de serviço de Santarém",
      road: "A1 · sentido norte",
      km: 320,
      detourKm: 0.6,
      arrivalMin: NOW.min + 27,
      priceEurL: 1.54,
      litres: 300,
      parking: 40,
      coimbraEta: "12:57",
      restriction: null,
      recommended: !opts.critical,
      note: "Usa a condução disponível e chega a Coimbra dentro da janela",
    }),
    mk({
      id: "F-12",
      name: "Área de serviço de Leiria",
      road: "A1 · sentido norte",
      km: 381,
      detourKm: 1.2,
      arrivalMin: NOW.min + 71,
      priceEurL: 1.49,
      litres: 300,
      parking: 26,
      coimbraEta: "13:04",
      restriction: "Acesso de pesados pela saída 11 · sintético",
      note: "Mais barato, mas depois do limite de 4h30",
    }),
  ];
}

/* ─── Documents (production OpsDocument + snapshot) ───────────────────── */

export type LedgerItem = {
  id: string;
  type: "CMR" | "INVOICE";
  title: string;
  number: string | null;
  state: "ISSUED" | "VOID" | "BLOCKED" | "MISSING" | "DRAFT";
  stateText: string;
  at?: string;
  reason?: string;
  required: string;
  diverges?: number;
};
export function ledger(jobId: string): LedgerItem[] {
  const job = WORLD_JOBS.find((j) => j.id === jobId) ?? WORLD_JOBS[0];
  const n = job.id.slice(2);
  const departed = ["in_transit", "delivered", "invoiced"].includes(job.status);
  const issuedAt = job.stops[0].completedAt ?? job.stops[0].window[0];
  const cmr: LedgerItem = departed
    ? {
        id: `CMR-${n}`,
        type: "CMR",
        title: "Guia CMR",
        number: `CMR 2026/000${Number(n) - 3805}`,
        state: "ISSUED",
        stateText: "Emitida",
        at: job.id === "J-4217" ? "06:52" : issuedAt,
        required: "Obrigatória antes da partida",
        diverges: job.id === "J-4217" ? 2 : 0,
      }
    : job.status === "loading"
      ? {
          id: `CMR-${n}`,
          type: "CMR",
          title: "Guia CMR",
          number: null,
          state: "MISSING",
          stateText: "Em falta",
          reason: `Carga a decorrer em ${job.stops[0].city} sem guia emitida`,
          required: "Obrigatória antes da partida",
        }
      : {
          id: `CMR-${n}`,
          type: "CMR",
          title: "Guia CMR",
          number: null,
          state: "DRAFT",
          stateText: "A emitir antes da partida",
          reason: `Partida prevista às ${job.stops[0].window[0]}`,
          required: "Obrigatória antes da partida",
        };
  const items: LedgerItem[] = [
    cmr,
    {
      id: `FT-${n}`,
      type: "INVOICE",
      title: "Fatura",
      number: null,
      state: "BLOCKED",
      stateText: "Ainda não pode ser emitida",
      reason: "O trabalho ainda não foi entregue",
      required: "Obrigatória após entrega",
    },
  ];
  if (job.id === "J-4217")
    items.push({
      id: `CMR-${n}-A`,
      type: "CMR",
      title: "Guia CMR",
      number: `CMR 2026/000${Number(n) - 3808}`,
      state: "VOID",
      stateText: "Anulada",
      at: "06:31",
      reason: "Destinatário errado (Maia em vez de Campanhã)",
      required: "Substituída",
    });
  return items;
}
export type DiffRow = { field: string; issued: string; current: string; changed: boolean };
/** Issued snapshot vs current transport data — only exists once a CMR is issued. */
export function snapshotDiff(jobId: string): DiffRow[] {
  const job = WORLD_JOBS.find((j) => j.id === jobId) ?? WORLD_JOBS[0];
  const pallets = job.cargo.reduce((s, c) => s + c.pallets, 0);
  const kg = job.cargo.reduce((s, c) => s + c.weightKg, 0);
  const fmt = (v: number) => `${v.toLocaleString("pt-PT")} kg`;
  const driver = driverWorld(job.driverId).name;
  const trailer = TRAILERS[job.trailerId]?.plate ?? job.trailerId;
  const last = job.stops.at(-1)!;
  const changed = job.id === "J-4217";
  return [
    { field: "Paletes", issued: String(changed ? 22 : pallets), current: String(pallets), changed },
    { field: "Peso bruto da carga", issued: fmt(changed ? 12400 : kg), current: fmt(kg), changed },
    { field: "Reboque", issued: trailer, current: trailer, changed: false },
    { field: "Motorista", issued: driver, current: driver, changed: false },
    { field: "Destinatário", issued: `${last.site} · ${last.city}`, current: `${last.site} · ${last.city}`, changed: false },
  ];
}
export const SNAPSHOT_DIFF = snapshotDiff("J-4217");
export function docEvents(jobId: string) {
  const job = WORLD_JOBS.find((j) => j.id === jobId) ?? WORLD_JOBS[0];
  const l = ledger(jobId);
  if (job.id === "J-4217")
    return [
      { at: "06:31", text: "CMR 2026/000409 anulada", detail: "Destinatário errado" },
      { at: "06:52", text: "CMR 2026/000412 emitida", detail: "Snapshot do trabalho, revisão 5" },
      { at: "09:05", text: "Carga editada", detail: "Linha C1: 16 → 18 paletes · revisão 7" },
    ];
  const ev = [{ at: "—", text: "Transporte criado", detail: `Revisão 1 · ${job.client}` }];
  if (l[0].state === "ISSUED")
    ev.push({ at: l[0].at ?? "—", text: `${l[0].number} emitida`, detail: `Snapshot do trabalho, revisão ${job.revision}` });
  return ev;
}
export const DOC_EVENTS = docEvents("J-4217");

/* ─── Restrictions (production RegulationRecord + tri-state) ──────────── */

export type Tri = "APPLIES" | "DOES_NOT_APPLY" | "UNKNOWN";
export type Predicate = {
  label: string;
  fact: string;
  value: string;
  outcome: "yes" | "no" | "unknown";
  source: string;
  /** Which part of the vehicle the fact belongs to (Truck instrument overlay). */
  part?: "weight" | "axles" | "firstAxle" | "body" | "height";
};
export type RestrictionWorld = {
  id: string;
  kind: "LEGAL_RESTRICTION" | "ROAD_CLOSURE" | "OPERATIONAL_IMPACT";
  title: string;
  where: string;
  result: Tri;
  answer: string;
  answerDetail: string;
  all: Predicate[];
  any: Predicate[];
  when: Predicate[];
  exemptions: Predicate[];
  evidence: { ref: string; trust: string; detail: string }[];
  verification: "VERIFIED" | "INTERPRETED" | "UNVERIFIED";
  window: string;
  consequence: string;
  alternative?: string;
  lines: Point[][];
  altLines?: Point[][];
  km?: number;
  /** Physical limit bound to a vehicle part (e.g. clearance height, m). */
  limitM?: number;
};
/** Registered vehicle facts (DEV edits). Absent = the seeded world. */
export type RestrictionFacts = { firstAxleHeightM?: number; vciAuthorization?: boolean };
export function restrictionsFor(jobId: string, facts: RestrictionFacts = {}): RestrictionWorld[] {
  const exempt = jobId === "J-4219" || facts.vciAuthorization === true;
  const axle = facts.firstAxleHeightM;
  const axleOutcome: Predicate["outcome"] =
    jobId === "J-4219" ? "yes" : axle == null ? "unknown" : axle >= 1.1 ? "yes" : "no";
  const axleText = (m: number) => `${m.toFixed(2).replace(".", ",")} m`;
  // Tri-state: a failed condition decides «does not apply»; an exemption too;
  // every condition met with no exemption decides «applies»; otherwise unknown.
  const noAuth = facts.vciAuthorization === false;
  const vciResult: Tri =
    exempt || axleOutcome === "no" ? "DOES_NOT_APPLY" : axleOutcome === "yes" && noAuth ? "APPLIES" : "UNKNOWN";
  const vci: RestrictionWorld = {
    id: "RI-042",
    kind: "LEGAL_RESTRICTION",
    title: "VCI Porto — pesados de mercadorias em dias úteis",
    where: "VCI · IC23, entre a Ponte da Arrábida e a Ponte do Freixo",
    result: vciResult,
    answer: exempt
      ? "Não se aplica — habilitação VCI registada"
      : axleOutcome === "no"
        ? `Não se aplica — 1.º eixo a ${axleText(axle!)}, abaixo de 1,10 m`
        : axleOutcome === "yes"
          ? noAuth
            ? "Aplica-se — passagem na VCI às 15:05 proibida"
            : "Desconhecido — falta confirmar a habilitação VCI"
          : "Desconhecido — falta a altura ao 1.º eixo",
    answerDetail: exempt
      ? jobId === "J-4219"
        ? "A isenção está confirmada por registo manual de 5 out."
        : "A isenção foi registada no laboratório; sem documento anexado."
      : axleOutcome === "no"
        ? "Uma condição necessária não se verifica: a regra não abrange esta viatura."
        : axleOutcome === "yes"
          ? noAuth
            ? "Todas as condições verificam-se e a viatura não tem habilitação."
            : "As condições verificam-se; só a isenção por habilitação pode afastar a regra."
          : noAuth
            ? "Falta a altura ao 1.º eixo. Sem essa medição, a passagem não pode ser dada como permitida."
            : "Faltam a altura ao 1.º eixo e a confirmação da habilitação VCI. É preciso resolver ambos os factos para decidir a passagem.",
    all: [
      {
        label: "Peso bruto > 3 500 kg",
        fact: "vehicle.grossWeightKg",
        value: "40 000 kg",
        outcome: "yes",
        source: "registo da viatura",
        part: "weight",
      },
      {
        label: "Três ou mais eixos",
        fact: "vehicle.axleCount",
        value: "5 · conjunto",
        outcome: "yes",
        source: "registo da viatura e do reboque",
        part: "axles",
      },
      {
        label: "Altura ao 1.º eixo ≥ 1,1 m",
        fact: "vehicle.firstAxleHeightM",
        value: jobId === "J-4219" ? "1,25 m" : axle == null ? "não registada" : axleText(axle),
        outcome: axleOutcome,
        source: jobId === "J-4219" ? "registo da viatura" : axle == null ? "facto em falta" : "medição registada · DEV",
        part: "firstAxle",
      },
      {
        label: "Destina-se a transporte de carga",
        fact: "vehicle.isGoodsVehicle",
        value: "sim",
        outcome: "yes",
        source: "tipo de viatura",
        part: "body",
      },
    ],
    any: [
      {
        label: "Origem ou destino no município do Porto",
        fact: "stop.inArea",
        value: "Campanhã · entrega final",
        outcome: "yes",
        source: "paragem do trabalho",
      },
      {
        label: "Origem ou destino em Vila Nova de Gaia",
        fact: "stop.inArea",
        value: "não",
        outcome: "no",
        source: "paragem do trabalho",
      },
    ],
    when: [
      {
        label: "Dia útil, 07h00–21h00",
        fact: "passage.window",
        value: "terça · passagem prevista 15:05",
        outcome: "yes",
        source: "plano do trabalho",
      },
    ],
    exemptions: [
      {
        label: "Habilitação de circulação VCI",
        fact: "authorization.pt-vci-habilitacao",
        value: jobId === "J-4219" ? "registada · 5 out" : exempt ? "registada · hoje" : noAuth ? "não detém · registado" : "não registada",
        outcome: exempt ? "yes" : noAuth ? "no" : "unknown",
        source: jobId === "J-4219" ? "registo manual · Ana Ribeiro" : exempt ? "registo manual · DEV" : "facto em falta",
      },
      {
        label: "Autorização especial de trânsito IMT",
        fact: "authorization.pt-imt-aet",
        value: "não",
        outcome: "no",
        source: "registo do trabalho",
      },
    ],
    evidence: [
      {
        ref: "DL 155-A/2026 · art. 2.º–3.º",
        trust: "oficial · verificado",
        detail: "Diário da República",
      },
      {
        ref: "Geometria VCI",
        trust: "OpenStreetMap · 30 set 2026",
        detail: "Anel IC23 entre pontes",
      },
    ],
    verification: "VERIFIED",
    window: "Dias úteis · 07h00–21h00",
    consequence: exempt || axleOutcome === "no"
      ? "Pode usar a VCI; sem desvio."
      : vciResult === "APPLIES"
        ? "A entrega tem de evitar a VCI. Alternativa oficial: CREP (A41), +11 km — o tempo exato exige recálculo."
        : "Se se aplicar, a entrega pela VCI às 15:05 é proibida. Alternativa oficial: CREP (A41), +11 km.",
    alternative: "CREP · A41",
    lines: VCI_LINES,
    altLines: CREP,
    km: 548,
  };
  const works: RestrictionWorld = {
    id: "RI-058",
    kind: "OPERATIONAL_IMPACT",
    title: "A1 · obras junto a Coimbra Norte",
    where: "A1, km 441–452 da rota",
    result: "DOES_NOT_APPLY",
    answer: "Não se aplica hoje — obras começam a 8 out",
    answerDetail: "A passagem de hoje (terça, 6 out) é antes do período das obras. A partir de 8 out haverá redução para uma via.",
    all: [
      {
        label: "Passagem no troço afetado",
        fact: "route.segment",
        value: "sim · km 441–452",
        outcome: "yes",
        source: "rota TomTom gravada",
      },
    ],
    any: [],
    when: [
      {
        label: "Entre 8 e 23 out, 09h00–17h00",
        fact: "passage.window",
        value: "passagem prevista ter 6 out 12:50",
        outcome: "no",
        source: "plano do trabalho",
      },
    ],
    exemptions: [],
    evidence: [
      {
        ref: "Aviso IP · Viajar na Estrada",
        trust: "interpretado · fonte atualizada há 2 d",
        detail: "Infraestruturas de Portugal",
      },
    ],
    verification: "INTERPRETED",
    window: "8–23 out · 09h00–17h00",
    consequence: "Sem impacto hoje. Em transportes a partir de 8 out, +6 min até Coimbra.",
    lines: [],
    km: 441,
  };
  const clearance: RestrictionWorld = {
    id: "RI-063",
    kind: "OPERATIONAL_IMPACT",
    title: "Campanhã · passagem inferior com gabarito 4,30 m",
    where: "Acesso ao centro logístico, km 553 da rota",
    result: "DOES_NOT_APPLY",
    answer: "Passa — 0,30 m de folga",
    answerDetail: "Altura registada do conjunto 4,00 m contra gabarito de 4,30 m. Levantamento sintético do laboratório, não verificado.",
    all: [
      {
        label: "Altura do conjunto > 4,30 m",
        fact: "vehicle.heightM",
        value: "4,00 m",
        outcome: "no",
        source: "registo do reboque",
        part: "height" as Predicate["part"],
      },
    ],
    any: [],
    when: [],
    exemptions: [],
    evidence: [{ ref: "Levantamento do laboratório", trust: "sintético · não verificado", detail: "Sem fonte oficial" }],
    verification: "UNVERIFIED",
    window: "Permanente",
    consequence: "Sem impacto: o conjunto passa sob o gabarito.",
    lines: [],
    km: 553,
    limitM: 4.3,
  };
  if (jobId === "J-4217") return [vci, works, clearance];
  if (jobId === "J-4220") return [IP3_CLOSURE];
  const job = worldJob(jobId);
  const touchesPorto = job.stops.some((st) => st.city === "Porto");
  if (!touchesPorto)
    return [
      {
        ...vci,
        result: "DOES_NOT_APPLY",
        answer: "Não se aplica — sem origem ou destino no Porto",
        answerDetail: "A condição de origem/destino no município do Porto não se verifica.",
        any: vci.any.map((p) => ({ ...p, value: "não", outcome: "no" as const })),
        consequence: "Sem impacto no plano atual.",
      },
    ];
  return [vci];
}
export const IP3_CLOSURE: RestrictionWorld = {
  id: "RI-071",
  kind: "ROAD_CLOSURE",
  title: "IP3 · encerramento noturno entre nós 21–22 e 24–25",
  where: "IP3, Coimbra–Viseu",
  result: "DOES_NOT_APPLY",
  answer: "Não se aplica — passagem fora do horário",
  answerDetail: "Encerramento entre 21h00 e 06h00; passagem prevista às 15:20.",
  all: [],
  any: [],
  when: [
    {
      label: "Noites 21h00–06h00",
      fact: "passage.window",
      value: "passagem prevista 15:20",
      outcome: "no",
      source: "plano do trabalho",
    },
  ],
  exemptions: [],
  evidence: [
    { ref: "Aviso IP · obras IP3 2026", trust: "oficial · verificado", detail: "Infraestruturas de Portugal" },
  ],
  verification: "VERIFIED",
  window: "Noites · 21h00–06h00",
  consequence: "Sem impacto no plano atual.",
  lines: IP3_WORKS,
};

/* ─── Attention (production OpsAlert severities) ──────────────────────── */

export type AttentionItem = {
  id: string;
  severity: "BLOCKER" | "ACTION_REQUIRED" | "RISK" | "INFORMATION";
  subject: string;
  what: string;
  why: string;
  next: string;
  jobId: string;
  lead: "Jobs" | "Drivers" | "Trucks" | "Fuel" | "Restrictions" | "Documents" | null;
  lenses: ("Jobs" | "Drivers" | "Trucks" | "Fuel" | "Restrictions" | "Documents")[];
  age: string;
  /** What happens if nobody acts. */
  ifIgnored?: string;
};
export const ATTENTION: AttentionItem[] = [
  {
    id: "A-1",
    ifIgnored: "Sem reboque válido, o transporte de amanhã não pode ser planeado nem atribuído.",
    severity: "BLOCKER",
    subject: "J-4222",
    what: "Referência não resolvida",
    why: "O reboque «PT-3302» não existe na frota. O trabalho não pode ser planeado.",
    next: "Atribuir um reboque existente",
    jobId: "J-4222",
    lead: "Trucks",
    lenses: ["Jobs", "Trucks"],
    age: "há 2 h",
  },
  {
    id: "A-2",
    ifIgnored: "A entrega chega 5 h 40 depois da janela; o cliente recusa a receção.",
    severity: "ACTION_REQUIRED",
    subject: "J-4218",
    what: "Replaneamento necessário",
    why: "A janela de entrega em Lisboa mudou para 11:00–12:00. A rota confirmada chega às 17:40.",
    next: "Rever o plano com a nova janela",
    jobId: "J-4218",
    lead: "Jobs",
    lenses: ["Jobs", "Fuel"],
    age: "09:12",
  },
  {
    id: "A-3",
    ifIgnored: "Viagem continua com um motorista sem certificado válido.",
    severity: "ACTION_REQUIRED",
    subject: "Rui Santos",
    what: "CQM caducado",
    why: "Em viagem com J-4219 desde as 07:02. O certificado caducou a 2 out.",
    next: "Confirmar substituição ou exceção",
    jobId: "J-4219",
    lead: "Drivers",
    lenses: ["Jobs", "Drivers"],
    age: "há 4 d",
  },
  {
    id: "A-4",
    ifIgnored: "Às 14:00 não há viatura para carregar mercadoria ADR em Coimbra.",
    severity: "ACTION_REQUIRED",
    subject: "CA-48-VN",
    what: "Viatura em manutenção com trabalho",
    why: "J-4220 carrega às 14:00 em Coimbra com mercadoria ADR.",
    next: "Reatribuir viatura antes das 14:00",
    jobId: "J-4220",
    lead: "Trucks",
    lenses: ["Jobs", "Trucks"],
    age: "08:40",
  },
  {
    id: "A-5",
    ifIgnored: "Entrega 12 min fora da janela sem aviso ao cliente.",
    severity: "RISK",
    subject: "J-4221",
    what: "Prazo em risco",
    why: "A carga em Évora terminou 38 min depois do previsto. Chegada estimada 14:12 para janela até 14:00.",
    next: "Avisar o cliente ou rever a entrega",
    jobId: "J-4221",
    lead: "Jobs",
    lenses: ["Jobs", "Fuel"],
    age: "09:52",
  },
  {
    id: "A-6",
    ifIgnored: "Em 41 dias o motorista deixa de poder conduzir em serviço.",
    severity: "RISK",
    subject: "Miguel Costa",
    what: "CQM a caducar em 41 dias",
    why: "Validade a 16 nov. Está em viagem com J-4217.",
    next: "Agendar a renovação",
    jobId: "J-4217",
    lead: "Drivers",
    lenses: ["Jobs", "Drivers"],
    age: "hoje",
  },
  {
    id: "A-7",
    ifIgnored: "A viagem parte sem guia de transporte.",
    severity: "INFORMATION",
    subject: "Documentos",
    what: "1 guia CMR por emitir",
    why: "J-4221 está em carga sem guia CMR.",
    next: "Emitir a guia CMR",
    jobId: "J-4221",
    lead: "Documents",
    lenses: ["Jobs", "Documents"],
    age: "09:40",
  },
];
export const SEVERITY_LABEL = {
  BLOCKER: "Bloqueios",
  ACTION_REQUIRED: "Ação necessária",
  RISK: "Risco",
  INFORMATION: "Informação",
};
