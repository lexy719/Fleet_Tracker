import { evaluateCompliance } from "../regulations/evaluate";
import { getRegulationDataset } from "../regulations/repository";
import { routeTimingInput, DEFAULT_TIMING_MODEL } from "../regulations/timeline";
import { canonicalJson, hashString } from "../regulations/decisionInputs";
import type { Fact, FactSet, RegulationDataset, RouteStopInput } from "../regulations/types";
import type { MunicipalityIndex } from "../ingestion/municipalities";
import { solveStrategy } from "../solver/solver";
import type { RouteStrategy } from "../solver/types";
import { graphhopperRoutingProvider } from "./graphhopperProvider";

/*
 * A truck route at a given departure time, on FleetOS's own engine, with FleetOS's rules inside:
 * the deterministic evaluator decides which known rules apply to THIS truck at the time it passes,
 * and the clean-route solver asks the engine to avoid them. Same evaluator and solver as dispatch.
 */

export type TruckSpec = {
  grossWeightKg: number;
  axleCount: number;
  firstAxleHeightM: number;
  heightM: number;
  widthM: number;
  lengthM: number;
  /** Authorizations held for this movement, e.g. { "pt-vci-habilitacao": true }. */
  authorizations?: Record<string, boolean>;
};

export type TruckRouteRequest = {
  from: [number, number];
  to: [number, number];
  via?: [number, number][];
  departAt: Date;
  truck: TruckSpec;
  strategy?: RouteStrategy;
  /** GraphHopper profile (default "truck3"). */
  profile?: string;
  ghUrl?: string;
  dataset?: RegulationDataset;
  /** CAOP municipality index: lets area rules (e.g. "origin or destination in Porto") be decided per stop. */
  municipalities?: MunicipalityIndex;
};

/** Area membership of a stop for rules matched on its municipality (UNKNOWN near a border or without index). */
export function stopAreas(dataset: RegulationDataset, lat: number, lng: number, index?: MunicipalityIndex): Record<string, Fact> {
  const areas = dataset.areas.filter((a) => a.match?.attribute === "municipality");
  if (!areas.length) return {};
  const found = index?.lookup(lat, lng);
  return Object.fromEntries(
    areas.map((a): [string, Fact] => {
      if (!found) return [a.id, { status: "unknown", reason: "concelho da paragem não determinado" }];
      if (found.status === "inside") return [a.id, { status: "known", value: found.municipality.name === a.match!.equals, source: "CAOP 2025 (DGT)" }];
      if (found.status === "near_border" && !found.candidates.some((m) => m.name === a.match!.equals))
        return [a.id, { status: "known", value: false, source: "CAOP 2025 (DGT)" }];
      return [a.id, { status: "unknown", reason: `paragem junto ao limite do concelho (${found.status})` }];
    }),
  );
}

export function truckFacts(t: TruckSpec): FactSet {
  const known = (value: number | boolean | string) => ({ status: "known" as const, value, source: "pedido de rota" });
  return {
    "vehicle.grossWeightKg": known(t.grossWeightKg),
    "vehicle.axleCount": known(t.axleCount),
    "vehicle.firstAxleHeightM": known(t.firstAxleHeightM),
    "vehicle.heightM": known(t.heightM),
    "vehicle.widthM": known(t.widthM),
    "vehicle.lengthM": known(t.lengthM),
    "vehicle.isGoodsVehicle": known(true),
    "vehicle.ownerCategory": known("private"),
    ...Object.fromEntries(
      Object.entries(t.authorizations ?? {}).map(([id, v]) => [`authorization.${id}`, known(v)]),
    ),
  };
}

export async function routeTruck(req: TruckRouteRequest) {
  const dataset = req.dataset ?? getRegulationDataset();
  const points = [req.from, ...(req.via ?? []), req.to];
  const provider = graphhopperRoutingProvider({
    url: req.ghUrl,
    profile: req.profile ?? "truck3",
    waypoints: points.map(([lat, lng]) => ({ lat, lng })),
    departAt: req.departAt,
  });
  const facts = truckFacts(req.truck);
  const stops: RouteStopInput[] = points.map(([lat, lng], i) => ({
    id: i === 0 ? "origin" : `stop-${i}`,
    type: i === 0 ? "pickup" : "delivery",
    lat,
    lng,
    areas: stopAreas(dataset, lat, lng, req.municipalities),
  }));
  const solved = await solveStrategy({
    strategy: req.strategy ?? "FASTEST",
    provider,
    getDataset: async () => dataset,
    inputsKey: hashString(canonicalJson({ points, departAt: req.departAt.toISOString(), truck: req.truck })),
    now: () => req.departAt,
    evaluate: (route, current) =>
      evaluateCompliance(
        current,
        {
          route: routeTimingInput(route.polyline, route.legPointCounts, route.legDurationSec, Date.parse(route.departAtIso ?? req.departAt.toISOString()), DEFAULT_TIMING_MODEL),
          facts,
          routeRoadNumbers: route.roadNumbers,
          stops,
        },
        undefined,
        req.departAt,
      ),
  });
  return { ...solved, engineRequests: provider.requests };
}
