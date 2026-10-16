import { truckForRefuel, withFuelIntelligence, type FuelIntelligence } from "../fuel/intelligence";
import { routingProfileForTruck } from "../domain/fleet/routingProfile";
import type { MovementRequest } from "../domain/planning/types";
import { canonicalJson, hashString } from "../regulations/decisionInputs";
import type { RegulationDataset } from "../regulations/types";
import { precautionary, solveStrategy } from "../solver/solver";
import { tomtomRoutingProvider } from "../solver/tomtomProvider";
import type { RouteStrategy, RoutingProvider } from "../solver/types";
import {
  DEFAULT_FUEL_EUR_PER_L,
  type RoutePlanOption,
  type PlanRoutePlanningOpts,
} from "../tomtom/planRoutes";
import { RouteCache } from "../tomtom/routeCache";

const cache = new RouteCache<RoutePlanOption>(5 * 60_000, 256);

/** Reuses traffic cache and the existing clean solver. Hard external-call budget for one run. */
export function planningRouter(
  apiKey: string,
  dataset: RegulationDataset,
  maxExternalRequests = 64,
  providerFactory: (
    key: string,
    waypoints: { lat: number; lng: number }[],
    opts: PlanRoutePlanningOpts,
  ) => RoutingProvider = tomtomRoutingProvider,
  /** Measured pump prices + refuel planning; without it routes are costed at the default €/L. */
  fuel?: FuelIntelligence,
) {
  const stats = { externalRequests: 0, cacheHits: 0, solverInvocations: 0 };
  const route = async (r: MovementRequest): Promise<RoutePlanOption[]> => {
    if (!apiKey)
      throw new Error(
        "Fornecedor de rotas não configurado; não é possível confirmar uma estimativa geográfica.",
      );
    const profile = routingProfileForTruck(r.truck),
      preset = { ...profile.preset };
    // Trailer dimensions may increase the routing envelope; never promote defaults to legal facts.
    if (r.trailer?.heightM !== undefined)
      preset.vehicleHeight = Math.max(preset.vehicleHeight, r.trailer.heightM);
    if (r.trailer?.widthM !== undefined)
      preset.vehicleWidth = Math.max(preset.vehicleWidth, r.trailer.widthM);
    if (r.trailer?.lengthM !== undefined)
      preset.vehicleLength = Math.max(
        preset.vehicleLength,
        r.trailer.lengthM + (r.truck.lengthM ?? 0),
      );
    if (
      r.trailer &&
      r.truck.axleCountScope === "POWER_UNIT" &&
      r.truck.axleCount !== undefined &&
      r.trailer.axleCount !== undefined
    )
      preset.vehicleNumberOfAxles = r.truck.axleCount + r.trailer.axleCount;
    if (r.trailer?.tareKg !== undefined)
      preset.kerbWeightKg += r.trailer.tareKg;
    const waypoints = [r.from, r.to].map(([lat, lng]) => ({ lat, lng }));
    const opts: PlanRoutePlanningOpts = {
      waypointStops: [
        {
          id: `${r.job.id}:${r.kind}:arrival`,
          name: r.kind === "EMPTY" ? "Recolha" : "Paragem do trabalho",
        },
      ],
      departAt: new Date(r.departMs),
      // Pre-route estimate on the straight corridor; each final route is re-costed on its own polyline below.
      fuelEurPerL: fuel ? fuel.priceForTrip([r.from, r.to], DEFAULT_FUEL_EUR_PER_L).eurPerL : DEFAULT_FUEL_EUR_PER_L,
      truck: {
        fleetTruckId: r.truck.id,
        cargoWeightKg: r.kind === "EMPTY" ? 0 : r.job.totalWeightKg,
        preset,
      },
    };
    const raw = providerFactory(apiKey, waypoints, opts);
    const provider: RoutingProvider = {
      ...raw,
      route: async (strategy, avoid) => {
        const key = canonicalJson({
          credential: hashString(apiKey),
          waypoints,
          opts: { ...opts, departAt: new Date(r.departMs).toISOString() },
          strategy,
          avoid,
        });
        let loaded = false;
        const result = await cache.get(key, async () => {
          loaded = true;
          if (stats.externalRequests >= maxExternalRequests)
            throw new Error(
              "Limite de pedidos externos atingido; plano parcial, sem garantia de melhor solução.",
            );
          stats.externalRequests++;
          const value = await raw.route(strategy, avoid);
          if (value.error || value.polyline.length < 2)
            throw new Error(value.error ?? "Rota sem geometria utilizável");
          return value;
        });
        if (!loaded) stats.cacheHits++;
        return structuredClone(result);
      },
    };
    const candidates: RoutePlanOption[] = [];
    for (const strategy of ["FASTEST", "NO_TOLLS"] as RouteStrategy[]) {
      let baseline: RoutePlanOption;
      try {
        baseline = await provider.route(strategy, []);
      } catch (e) {
        if (!candidates.length && strategy === "NO_TOLLS") throw e;
        continue;
      }
      candidates.push(baseline);
      const report = r.evaluate(baseline);
      if (
        report.status === "ROUTE_AFFECTED" ||
        report.results.some(precautionary)
      ) {
        stats.solverInvocations++;
        const solved = await solveStrategy({
          strategy,
          provider,
          baseline,
          evaluate: (o) => r.evaluate(o),
          getDataset: async () => dataset,
          maxReroutes: 2,
          inputsKey: canonicalJson({
            r: r.job.id,
            truck: r.truck.id,
            trailer: r.trailer?.id,
            from: r.from,
            to: r.to,
            depart: r.departMs,
            dataset: dataset.version,
            facts: report.results,
          }),
        });
        if (solved.finalOption) candidates.push(solved.finalOption);
      }
    }
    if (!fuel) return candidates;
    const lPer = preset.lPer100kmFallback;
    const truck = truckForRefuel(r.truck, lPer, new Date());
    return candidates.map((o) => withFuelIntelligence(o, fuel, truck, DEFAULT_FUEL_EUR_PER_L));
  };
  return { route, stats };
}
