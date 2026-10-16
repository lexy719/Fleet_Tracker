import type { Point } from "./mapTypes";
import {
  ROUTES,
  WORLD_JOBS,
  STATUS_LABEL,
  pointAtKm,
  restrictionsFor,
  stopCandidates,
  ledger,
  truckWorld,
  TRAILERS,
  driverWorld,
  sliceKm,
} from "./world";

export type DemoJob = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  eta: string;
  window: string;
  driver: string;
  truck: string;
  progress: number;
  cargo: string;
  customer: string;
  exception: string | null;
  route: Point[];
};
/**
 * Hand-authored synthetic jobs on RECORDED TomTom truck-route geometry (see world.ts).
 * Never import an operational repository here.
 */
export const JOBS: DemoJob[] = WORLD_JOBS.map((j) => {
  const route = ROUTES[j.routeId];
  const first = j.stops[0],
    last = j.stops.at(-1)!;
  return {
    id: j.id,
    origin: first.city,
    destination: last.city,
    status: STATUS_LABEL[j.status],
    eta: last.eta,
    window: `${last.window[0]}–${last.window[1]}`,
    driver: driverWorld(j.driverId).name,
    truck: j.truckId === "T-08" ? "DAF XF 480" : "Trator atribuído",
    progress: j.positionKm == null ? 0 : Math.round((j.positionKm / route.km) * 100),
    cargo: `${j.cargo.reduce((s, c) => s + c.pallets, 0)} paletes · ${(j.cargo.reduce((s, c) => s + c.weightKg, 0) / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} t`,
    customer: j.client,
    exception: j.blockers[0] ?? null,
    route: route.line,
  };
});
export type DemoStop = {
  id: string;
  name: string;
  location: string;
  price: string;
  detour: number;
  eta: string;
  parking: string;
  point: Point;
  recommended: boolean;
};
const J4217 = WORLD_JOBS[0];
// The recommended stop leads; spatial questions default to it.
export const STOPS: DemoStop[] = [...stopCandidates()]
  .sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended))
  .map((s) => ({
  id: s.id,
  name: s.name,
  location: s.road,
  price: s.priceEurL.toFixed(2).replace(".", ","),
  detour: s.detourKm,
  eta: s.arrival,
  parking: `${s.parking} lugares pesados`,
  point: pointAtKm(ROUTES[J4217.routeId], s.km),
  recommended: !!s.recommended,
}));
export const DOCUMENTS = ledger("J-4217").map((d) => ({
  id: d.id,
  title: d.title,
  status: d.stateText,
  kind: d.type === "CMR" ? "Transporte" : "Faturação",
  pages: d.type === "CMR" ? 2 : 1,
}));
export const RESTRICTIONS = restrictionsFor("J-4217").map((r) => ({
  id: r.id,
  title: r.title,
  status: r.result === "UNKNOWN" ? "Desconhecido" : r.result === "APPLIES" ? "Aplica-se" : "Não se aplica",
  description: r.answer,
  segment: (r.lines[0] ?? []) as Point[],
  lines: r.lines,
}));
export const jobById = (id: string) => JOBS.find((j) => j.id === id) ?? JOBS[0];

// Each job keeps one assigned team. The supporting fixture follows the selected
// transport; it is not a planning calculation.
const TEAM_PLATES: Record<string, string> = {
  "T-08": "AA-42-ZP",
  "T-12": "BC-71-LA",
  "T-03": "BE-26-XM",
  "T-19": "CA-48-VN",
  "T-06": "BB-53-HS",
  "T-15": "CD-19-RP",
};
export function demoContext(
  job: DemoJob,
  assignment?: { truck: string | null },
) {
  const world = WORLD_JOBS.find((j) => j.id === job.id) ?? J4217;
  const route = ROUTES[world.routeId];
  const truckId =
    assignment?.truck === "T-18" ? "T-18" : world.truckId;
  const truck = truckWorld(truckId);
  const km = world.positionKm ?? 0;
  const restrictions = restrictionsFor(world.id).map((r) => ({
    id: r.id,
    title: r.title,
    status:
      r.result === "UNKNOWN"
        ? "Desconhecido"
        : r.result === "APPLIES"
          ? "Aplica-se"
          : "Não se aplica",
    description: r.answer,
    // A restriction without its own stored geometry uses the recorded route slice
    // it affects (never an invented straight segment).
    segment: (r.lines.length
      ? r.lines[0]
      : r.km != null
        ? sliceKm(route, Math.min(r.km, route.km - 12), Math.min(r.km + 11, route.km))
        : []) as Point[],
    altLines: r.result === "DOES_NOT_APPLY" ? [] : (r.altLines ?? []),
    lines: r.lines.length
      ? r.lines
      : r.km != null
        ? [sliceKm(route, Math.min(r.km, route.km - 12), Math.min(r.km + 11, route.km))]
        : [],
  }));
  return {
    driverId: world.driverId,
    truckId,
    plate: truckId === "T-18" ? truck.plate : TEAM_PLATES[world.truckId],
    trailer: world.trailerId,
    location: world.id === "J-4217" ? "Carregado" : world.stops[0].city,
    fuel: truckId === "T-18" ? 24 : 31,
    range: truckId === "T-18" ? 230 : 175,
    position: pointAtKm(route, km),
    positionKnown: world.positionKm != null,
    loadPercent: Math.round(
      (world.cargo.reduce((s, c) => s + c.pallets, 0) /
        (TRAILERS[world.trailerId]?.pallets ?? 33)) *
        100,
    ),
    remaining: Math.round(route.km - km),
    stops:
      world.id === "J-4217"
        ? STOPS.filter((s) => assignment?.truck !== "T-18" || s.id !== "F-07")
        : [
            {
              id: `F-${world.id.slice(2)}`,
              name: "Área de serviço na rota",
              location: route.roads.slice(-1)[0] ?? "rota",
              price: "1,57",
              detour: 1,
              eta: "—",
              parking: "pesados · sintético",
              point: pointAtKm(route, route.km * 0.55),
              recommended: true,
            },
          ],
    documents: ledger(world.id).map((d) => ({
      id: d.id,
      title: d.title,
      status:
        d.type === "INVOICE" && job.status === STATUS_LABEL.delivered
          ? "Pronta a emitir"
          : d.stateText,
      kind: d.type === "CMR" ? "Transporte" : "Faturação",
      pages: d.type === "CMR" ? 2 : 1,
    })),
    restrictions,
  };
}
