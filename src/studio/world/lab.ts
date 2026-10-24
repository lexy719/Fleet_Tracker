// Lab source: the environment lab's synthetic world. Road geometry is recorded (TomTom
// fixtures); people, vehicles, times and positions are invented and labelled as such.
import {
  ATTENTION,
  DRIVER_POOL,
  NOW,
  ROUTES,
  TRAILERS,
  TRUCKS,
  WORLD_JOBS,
  driverWorld,
  trailerWorld,
  truckWorld,
} from "../../world/world";
import type { Point, StudioRoute, StudioWorld } from "./types";

export const PT_PLACES: Record<string, Point> = {
  Faro: [-7.93, 37.02],
  Coimbra: [-8.43, 40.21],
  Porto: [-8.61, 41.15],
  Lisboa: [-9.14, 38.72],
  Bragança: [-6.76, 41.81],
  Viseu: [-7.91, 40.66],
  Évora: [-7.91, 38.57],
  Maia: [-8.62, 41.24],
  Carregado: [-8.98, 39.02],
  Amarante: [-8.08, 41.27],
  Braga: [-8.42, 41.55],
  Aveiro: [-8.65, 40.64],
  Setúbal: [-8.89, 38.52],
  Madrid: [-3.7, 40.42],
  Badajoz: [-6.97, 38.88],
};

export const findPlace = (places: Record<string, Point>, where: string): Point | null =>
  Object.entries(places).find(([k]) => where.includes(k))?.[1] ?? null;

export function labWorld(): StudioWorld {
  const routes: Record<string, StudioRoute> = Object.fromEntries(
    Object.entries(ROUTES).map(([k, r]) => [k, { ...r, recorded: true }]),
  );
  const truckPositions: Record<string, Point> = {};
  for (const t of Object.values(TRUCKS)) {
    const p = findPlace(PT_PLACES, t.fuel.prov.source);
    if (p) truckPositions[t.id] = p;
  }
  return {
    source: "lab",
    label: "Mundo de demonstração (laboratório)",
    now: NOW,
    day: { start: 5 * 60, end: 21 * 60 },
    jobs: WORLD_JOBS,
    routes,
    drivers: DRIVER_POOL,
    driver: (id) => driverWorld(id),
    trucks: Object.values(TRUCKS),
    truck: truckWorld,
    trailers: Object.values(TRAILERS),
    trailer: trailerWorld,
    places: PT_PLACES,
    truckPositions,
    attention: ATTENTION,
    bounds: [
      [-9.7, 36.85],
      [-6.1, 42.2],
    ],
  };
}
