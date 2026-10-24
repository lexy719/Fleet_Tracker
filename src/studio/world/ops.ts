// Operational source: the application's store (jobs, trucks, trailers, drivers, documents),
// read through the application-owned projection `readEnvironment`. Nothing here writes.
//
// Honesty rules:
//  · No road geometry is persisted for jobs yet → each transport is drawn as a straight line
//    between its recorded stop coordinates (`recorded: false`, labelled "rota por calcular").
//    Distances use the simulator's road uplift (×1.25) and 72 km/h average — estimates.
//  · Truck positions exist only as demo telemetry (DEMO_SIMULATED) → labelled "simulado".
//  · Unknown values stay unknown (no invented hours, trailer locations or fuel readings).
import type { Driver, Job, Trailer, Truck } from "../../data/types";
import type { OpsSnapshot } from "../../repositories/operationalStore";
import { readEnvironment } from "../../application/environmentQueries";
import { driverQualifications } from "../../domain/drivers/drivers";
import { truckOperationalState } from "../../domain/fleet/trucks";
import { STATUS_LABELS } from "../../domain/jobs/lifecycle";
import { ROAD_UPLIFT, TRUCK_AVG_KMH } from "../../sim/weekSimulation";
import { SPELL_LIMIT, haversineKm, kmOf, type DriverWorld, type Stop, type TrailerWorld, type TruckWorld } from "../../world/world";
import { PT_PLACES } from "./lab";
import { cachedRoad, roadFailed, roadKey, type RoadGeometry } from "./roads";
import type { AttentionItem, Point, StudioRoute, StudioWorld, WorldJob } from "./types";

const fmt = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hour12: false });
const hm = (iso?: string) => (iso ? fmt.format(new Date(iso)) : "");
const dayLabel = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", weekday: "short", day: "numeric", month: "short" });
const minOfDay = (d: Date) => {
  const [h, m] = fmt.format(d).split(":").map(Number);
  return h * 60 + m;
};

const TRAILER_LABEL: Record<Trailer["type"], string> = {
  CURTAINSIDER: "Cortinas",
  BOX: "Caixa fechada",
  REFRIGERATED: "Frigorífico",
  FLATBED: "Plataforma",
  TANKER: "Cisterna",
  CONTAINER_CHASSIS: "Porta-contentores",
  OTHER: "Outro",
};
const QUAL_DETAIL = { VALID: "válido", EXPIRING: "a caducar", EXPIRED: "caducou", MISSING: "por verificar", NOT_HELD: "não tem" } as const;

const displayId = (j: Job) => j.jobNumber || j.id;

/** Straight polyline through the recorded stops, with road-uplifted cumulative km. */
function directRoute(job: Job, id: string): StudioRoute & { stopKm: number[] } {
  const stops = [...job.stops].sort((a, b) => a.sequence - b.sequence);
  const corners: Point[] = stops.map((s) => [s.lng, s.lat]);
  if (corners.length === 1) corners.push(corners[0]);
  // Densify (~2 km) so positions project onto the line and trucks glide along it.
  const line: Point[] = [corners[0]];
  const stopIdx = [0];
  for (let i = 1; i < corners.length; i++) {
    const [a, b] = [corners[i - 1], corners[i]];
    const n = Math.max(1, Math.ceil(haversineKm(a, b) / 2));
    for (let k = 1; k <= n; k++) line.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    stopIdx.push(line.length - 1);
  }
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversineKm(line[i - 1], line[i]) * ROAD_UPLIFT);
  const km = Math.max(1, cum.at(-1)!);
  return { id, km, hours: km / TRUCK_AVG_KMH, roads: [], retrievedAt: "", strategy: "direct", line, cum, recorded: false, stopKm: stopIdx.map((i) => cum[i]) };
}

/** TomTom road geometry through the stops (display only, `preview`): roads instead of a straight line. */
function roadRoute(g: RoadGeometry, id: string): StudioRoute & { stopKm: number[] } {
  const line = g.line;
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversineKm(line[i - 1], line[i]));
  const km = g.distanceM / 1000 || Math.max(1, cum.at(-1)!);
  const k = km / Math.max(1e-6, cum.at(-1)!);
  const stopKm = [0];
  for (const m of g.legM) stopKm.push(stopKm.at(-1)! + m / 1000);
  return {
    id,
    km,
    hours: g.durationSec / 3600,
    roads: [],
    retrievedAt: g.at,
    strategy: "Estrada TomTom (pré-visualização)",
    line,
    cum: cum.map((c) => c * k),
    recorded: true,
    preview: true,
    stopKm,
  };
}

/** The road geometry saved with a confirmed plan (Expedição or studio) — a real route. */
function savedRoute(r: NonNullable<Job["routeCompliance"]>["route"], id: string, job: Job): StudioRoute & { stopKm: number[] } {
  const line: Point[] = r.polyline.map(([lat, lng]) => [lng, lat]);
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversineKm(line[i - 1], line[i]));
  const geom = Math.max(1, cum.at(-1)!);
  const km = r.distanceM / 1000 || geom;
  const k = km / geom;
  const scaled = cum.map((c) => c * k);
  const stops = [...job.stops].sort((a, b) => a.sequence - b.sequence);
  const stopKm = stops.map((s, i) => {
    if (i === 0) return 0;
    if (i === stops.length - 1) return km;
    let best = 0;
    line.forEach((p, n) => {
      if (haversineKm(p, [s.lng, s.lat]) < haversineKm(line[best], [s.lng, s.lat])) best = n;
    });
    return scaled[best];
  });
  return {
    id,
    km,
    hours: (r.operationalDurationSec ?? r.durationSec) / 3600,
    roads: r.roadNumbers,
    retrievedAt: r.departAtIso,
    strategy: r.title,
    line,
    cum: scaled,
    recorded: true,
    stopKm,
  };
}

function driverOf(d: Driver, now: Date): DriverWorld {
  const h = d.hours;
  return {
    id: d.id,
    name: d.name,
    employee: d.employeeNumber ? `N.º ${d.employeeNumber}` : d.homeTerminal ?? "",
    qualifications: driverQualifications(d, now).map((q) => ({
      kind: q.kind as DriverWorld["qualifications"][number]["kind"],
      label: q.label,
      detail: q.daysLeft != null && q.state === "EXPIRING" ? `${q.daysLeft} dias` : QUAL_DETAIL[q.state as keyof typeof QUAL_DETAIL] ?? q.state,
      state: q.state as DriverWorld["qualifications"][number]["state"],
      until: q.expiresOn,
    })),
    baseline: {
      recordedAt: h?.recordedAt ?? "—",
      recordedLabel: h ? `registo ${hm(h.recordedAt)}` : "sem base de condução",
      stale: !h,
      drivenBeforeMin: 0,
      weekMin: h?.drivenWeekMin ?? 0,
      fortnightMin: 0,
    },
    duty: [],
    // The spell since the last break is only known when recorded; otherwise assume the
    // conservative case (all of today's driving without a qualifying break).
    spellMin: h ? (h.currentSpellMin ?? Math.min(h.drivenTodayMin, SPELL_LIMIT)) : 0,
    dayMin: h?.drivenTodayMin ?? 0,
  };
}

function truckOf(t: Truck, jobs: Job[]): TruckWorld {
  const fuel = t.fuelLevelPct;
  const state = truckOperationalState(t, jobs);
  return {
    id: t.id,
    plate: t.plate,
    make: t.make ?? "",
    model: t.model ?? "",
    emission: t.emissionClass ?? "—",
    vehicleType: "TRACTOR",
    availability: t.availability,
    state: state === "ASSIGNED" || state === "IN_SERVICE" || state === "MAINTENANCE" ? state : "AVAILABLE",
    adrEquipped: !!t.adrEquipped,
    axles: t.axleCount ?? 2,
    tareKg: t.kerbWeightKg ?? 0,
    firstAxleHeightM: t.firstAxleHeightM ?? null,
    tankL: t.fuelCapacityL ?? 400,
    fuel: fuel
      ? { value: fuel.value, prov: { kind: "KNOWN", source: `registo · ${fuel.source.toLowerCase()}`, at: hm(fuel.recordedAt) } }
      : { value: t.demoTelemetry?.fuelPct ?? 0, prov: { kind: t.demoTelemetry ? "SIMULATED" : "UNKNOWN", source: t.demoTelemetry ? "simulado (demo)" : "sem leitura", at: "" } },
    odometer: t.odometerKm
      ? { value: t.odometerKm.value, prov: { kind: "KNOWN", source: "registo", at: hm(t.odometerKm.recordedAt) } }
      : { value: 0, prov: { kind: "UNKNOWN", source: "sem leitura" } },
    consumptionL100: { value: 0, prov: { kind: "UNKNOWN", source: "sem leitura" } },
    service: t.notes ?? (t.availability === "MAINTENANCE" ? "Em manutenção" : t.availability === "OUT_OF_SERVICE" ? "Fora de serviço" : "Sem atenção registada"),
  };
}

function trailerOf(t: Trailer, busy: boolean): TrailerWorld {
  const c = t.capabilities;
  return {
    id: t.id,
    // Trailers have no recorded position: a free trailer is "livre" without a place.
    location: busy ? undefined : "livre",
    plate: t.plate,
    type: t.type === "OTHER" && t.typeLabel ? t.typeLabel : TRAILER_LABEL[t.type],
    lengthM: t.lengthM ?? 13.6,
    heightM: t.heightM ?? 4,
    axles: t.axleCount ?? 3,
    tareKg: t.tareKg ?? 0,
    pallets: t.palletCapacity ?? 0,
    capabilities: [
      ...(c.refrigerated ? [`Frio ${c.tempMinC ?? ""}–${c.tempMaxC ?? ""} °C`] : []),
      ...(c.adrSuitable ? ["Equipado ADR"] : []),
      ...(c.tailLift ? ["Plataforma elevatória"] : []),
      ...(c.other ?? []),
    ],
  };
}

const STUB_DRIVER: DriverWorld = {
  id: "",
  name: "",
  employee: "",
  qualifications: [],
  baseline: { recordedAt: "—", recordedLabel: "", stale: true, drivenBeforeMin: 0, weekMin: 0, fortnightMin: 0 },
  duty: [],
  spellMin: 0,
  dayMin: 0,
};
const STUB_TRUCK: TruckWorld = {
  id: "",
  plate: "—",
  make: "Sem viatura",
  model: "",
  emission: "—",
  vehicleType: "TRACTOR",
  availability: "AVAILABLE",
  state: "AVAILABLE",
  adrEquipped: false,
  axles: 0,
  tareKg: 0,
  firstAxleHeightM: null,
  tankL: 0,
  fuel: { value: 0, prov: { kind: "UNKNOWN", source: "—" } },
  odometer: { value: 0, prov: { kind: "UNKNOWN", source: "—" } },
  consumptionL100: { value: 0, prov: { kind: "UNKNOWN", source: "—" } },
  service: "",
};

export function opsWorld(snapshot: OpsSnapshot, now: Date, label: string, ops?: StudioWorld["ops"]): StudioWorld {
  const env = readEnvironment(snapshot, now);
  const rowOf = new Map(env.jobs.map((r) => [r.job.id, r]));
  const active = (j: Job) => !["delivered", "invoiced", "cancelled"].includes(j.status);
  // readEnvironment's order: work being executed first, then blockers, then deadlines.
  // Every transport: today's operation shows the open ones, Trabalhos shows them all.
  const jobsSrc = env.jobs.map((r) => r.job);
  const storeIds: Record<string, string> = {};
  const routes: Record<string, StudioRoute> = {};
  const places: Record<string, Point> = { ...PT_PLACES };
  const truckById = new Map(snapshot.trucks.map((t) => [t.id, t]));
  const roadsToFetch: NonNullable<StudioWorld["roadsToFetch"]> = [];

  const jobs: WorldJob[] = jobsSrc.map((j) => {
    const id = displayId(j);
    storeIds[id] = j.id;
    const routeId = `job:${id}`;
    const saved = j.routeCompliance?.route;
    const ordered = [...j.stops].sort((a, b) => a.sequence - b.sequence);
    const key = roadKey(ordered);
    const road = saved && saved.polyline.length > 1 ? null : cachedRoad(key);
    if (!(saved && saved.polyline.length > 1) && !road && !roadFailed(key) && ordered.length > 1 && active(j)) roadsToFetch.push({ key, stops: ordered });
    const route =
      saved && saved.polyline.length > 1 ? savedRoute(saved, routeId, j) : road ? roadRoute(road, routeId) : directRoute(j, routeId);
    routes[routeId] = route;
    const sorted = [...j.stops].sort((a, b) => a.sequence - b.sequence);
    sorted.forEach((s) => (places[s.city] ??= [s.lng, s.lat]));
    const stops: Stop[] = sorted.map((s, i) => ({
      id: s.id,
      type: s.type,
      site: s.clientName || s.address,
      city: s.city,
      km: route.stopKm[i] ?? route.km,
      window: [s.windowStartAt ? hm(s.windowStartAt) : s.scheduledTime || "06:00", s.windowEndAt ? hm(s.windowEndAt) : s.windowEnd || "20:00"],
      eta: s.scheduledTime || "—",
      completedAt: s.completed ? (s.completedAt ? hm(s.completedAt) : s.actualTime || "feito") : undefined,
      cargo: s.cargoDescription,
    }));
    const truck = truckById.get(j.assignedTruckId ?? "");
    const tel = truck?.demoTelemetry;
    const positionKm =
      j.status === "loading" ? 0 : j.status === "in_transit" && tel ? Math.min(route.km, kmOf(route, [tel.lng, tel.lat])) : null;
    const row = rowOf.get(j.id);
    const blocks = row?.issues.filter((x) => x.severity === "block").map((x) => x.text) ?? [];
    const reviews = row?.issues.filter((x) => x.severity === "review").map((x) => x.text) ?? [];
    return {
      id,
      reference: j.reference,
      client: j.client,
      routeId,
      status: j.status,
      priority: j.priority,
      sla: row?.sla ?? j.slaStatus,
      plan: j.planStatus,
      planNote: j.planInvalidation?.reason,
      revision: j.revision,
      stops,
      cargo: j.cargo.map((c) => ({
        id: c.id,
        description: c.description,
        pallets: c.pallets ?? 0,
        weightKg: c.weightKg,
        dropAt: stops.at(-1)?.city ?? "",
        adr: c.dangerousGoods?.adrClass,
        tempC: j.tempTargetC ? [j.tempTargetC.min, j.tempTargetC.max] : undefined,
      })),
      driverId: j.assignedDriverId ?? "",
      truckId: j.assignedTruckId ?? "",
      trailerId: j.assignedTrailerId ?? "",
      positionKm,
      positionSource: tel ? "SIMULATED" : "UNKNOWN",
      blockers: blocks,
      next: reviews[0] ?? (row?.step ? `Passar a «${STATUS_LABELS[row.step.to]}»` : "Sem ação pendente"),
    };
  });

  const drivers = snapshot.drivers.filter((d) => !d.archivedAt);
  const driverMap = new Map(drivers.map((d) => [d.id, driverOf(d, now)]));
  const trucks = snapshot.trucks.filter((t) => !t.archivedAt);
  const truckMap = new Map(trucks.map((t) => [t.id, truckOf(t, snapshot.jobs)]));
  const busyTrailers = new Set(snapshot.jobs.filter(active).map((j) => j.assignedTrailerId));
  const trailers = snapshot.trailers.filter((t) => !t.archivedAt);
  const trailerMap = new Map(trailers.map((t) => [t.id, trailerOf(t, busyTrailers.has(t.id))]));
  const truckPositions: Record<string, Point> = {};
  for (const t of trucks) if (t.demoTelemetry) truckPositions[t.id] = [t.demoTelemetry.lng, t.demoTelemetry.lat];

  const attention: AttentionItem[] = env.attention
    .filter((r) => r.issues.length)
    .map((r) => {
      const block = r.issues.find((x) => x.severity === "block");
      const first = block ?? r.issues[0];
      return {
        id: `ops-${r.job.id}`,
        severity: block ? "BLOCKER" : r.issues.some((x) => x.domain === "Drivers" || x.domain === "Trucks") ? "ACTION_REQUIRED" : "RISK",
        subject: displayId(r.job),
        what: first.text.charAt(0).toUpperCase() + first.text.slice(1),
        why: r.issues.slice(1).map((x) => x.text).join(" · "),
        next: "Abrir o transporte",
        jobId: displayId(r.job),
        lead: first.domain,
        lenses: [...new Set(r.issues.map((x) => x.domain))],
        age: "",
      } satisfies AttentionItem;
    });

  // Frame everything we can place: routes and known truck positions.
  const pts = [...Object.values(routes).flatMap((r) => r.line), ...Object.values(truckPositions)];
  const lng = pts.map((p) => p[0]);
  const lat = pts.map((p) => p[1]);
  const bounds: [[number, number], [number, number]] = pts.length
    ? [
        [Math.min(...lng) - 0.4, Math.min(...lat) - 0.3],
        [Math.max(...lng) + 0.4, Math.max(...lat) + 0.3],
      ]
    : [
        [-9.7, 36.85],
        [-6.1, 42.2],
      ];
  const nowMin = minOfDay(now);
  const dayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Lisbon" });
  const today = Date.parse(dayKey.format(now));
  const stopDays = new Map<string, number>();
  for (const j of jobsSrc)
    for (const s of j.stops)
      if (s.windowStartAt) stopDays.set(`${displayId(j)}/${s.id}`, Math.round((Date.parse(dayKey.format(new Date(s.windowStartAt))) - today) / 864e5));
  const start = Math.max(0, Math.min(Math.floor(nowMin / 60) * 60 - 3 * 60, 6 * 60));
  return {
    source: "ops",
    label,
    now: { label: dayLabel.format(now), clock: hm(now.toISOString()), min: nowMin },
    day: { start, end: Math.min(24 * 60, start + 18 * 60) },
    jobs,
    routes,
    drivers: drivers.map((d) => ({ id: d.id, where: d.homeTerminal ?? "" })),
    driver: (id) => driverMap.get(id) ?? { ...STUB_DRIVER, id },
    trucks: [...truckMap.values()],
    truck: (id) => truckMap.get(id) ?? { ...STUB_TRUCK, id },
    trailers: [...trailerMap.values()],
    trailer: (id) => trailerMap.get(id) ?? null,
    places,
    truckPositions,
    attention,
    bounds,
    storeIds,
    roadsToFetch,
    ops,
    stopDay: (jobId, stopId) => stopDays.get(`${jobId}/${stopId}`) ?? 0,
  };
}
