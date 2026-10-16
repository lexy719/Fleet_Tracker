import { planRefuel, type RefuelPlan, type RefuelPolicy } from "../domain/fuelPlanning/refuelPlanner";
import type { DriverState } from "../ops/drivingStops";
import { stationsAlongRoute } from "./corridor";
import { tripFuelPrice, type TripFuelPrice } from "./tripPrice";
import type { FuelPriceObservation, FuelStation } from "./types";

/*
 * What routing/planning consumes from Fuel Intelligence: a trip price for costing, and a
 * refuel plan for a concrete route. Built from an in-memory view of stations + current prices.
 */

/** Stations up to this far off the route are considered for refuelling (detour weighed by the planner). */
export const REFUEL_CORRIDOR_M = 5_000;
export const REFUEL_PRICE_MAX_AGE_H = 72;
/**
 * Default economics for detour decisions in routing (disclosed in every plan's assumptions):
 * driver + truck time and non-fuel wear per detour km. Order-of-magnitude values, to be replaced
 * by the operator's own cost model.
 */
export const ROUTING_REFUEL_POLICY: Partial<RefuelPolicy> = { eurPerHour: 30, nonFuelEurPerKm: 0.2 };

export type RouteForRefuel = { polyline: [number, number][]; distanceM: number; durationSec: number };
export type TruckForRefuel = { tankL?: number; startFuelL?: number; lPer100km: number };

export interface FuelIntelligence {
  readonly stationCount: number;
  priceForTrip(points: [number, number][], fallbackEurPerL: number): TripFuelPrice;
  refuelPlan(route: RouteForRefuel, truck: TruckForRefuel, driver?: DriverState, policy?: Partial<RefuelPolicy>): RefuelPlan;
}

export function createFuelIntelligence(stations: FuelStation[], prices: FuelPriceObservation[], now: () => Date = () => new Date()): FuelIntelligence {
  const active = stations.filter((s) => !s.missingSinceAt);
  return {
    stationCount: active.length,
    priceForTrip: (points, fallbackEurPerL) => tripFuelPrice(points, active, prices, { fallbackEurPerL, now: now() }),
    refuelPlan: (route, truck, driver, policy) => {
      if (!truck.tankL) {
        return { status: "INFEASIBLE", stops: [], assumptions: [], explanations: ["Capacidade do depósito do camião desconhecida — registe-a na ficha do camião para planear abastecimentos."] };
      }
      const corridor = stationsAlongRoute(route.polyline, active, prices, { fuelType: "diesel", bufferM: REFUEL_CORRIDOR_M, now: now(), maxAgeH: REFUEL_PRICE_MAX_AGE_H });
      return planRefuel({
        route: { distanceM: route.distanceM, drivingSec: route.durationSec },
        stations: corridor.stations,
        truck: { tankL: truck.tankL, ...(truck.startFuelL !== undefined ? { startFuelL: truck.startFuelL } : {}), lPer100km: truck.lPer100km },
        ...(driver ? { driver } : {}),
        policy: { ...ROUTING_REFUEL_POLICY, ...policy },
      });
    },
  };
}

/** Truck fields Fuel Intelligence reads from the fleet record. */
export type FleetTruckFuel = { fuelCapacityL?: number; fuelLevelPct?: { value: number; recordedAt: string } };
/** A recorded tank level older than this is not trusted as the start level (planner assumes and says so). */
export const FUEL_LEVEL_MAX_AGE_H = 12;

export function truckForRefuel(t: FleetTruckFuel, lPer100km: number, now: Date): TruckForRefuel {
  const lvl = t.fuelLevelPct;
  const fresh = lvl && t.fuelCapacityL && (now.getTime() - Date.parse(lvl.recordedAt)) / 3_600_000 <= FUEL_LEVEL_MAX_AGE_H;
  return {
    ...(t.fuelCapacityL ? { tankL: t.fuelCapacityL } : {}),
    ...(fresh ? { startFuelL: Math.round((t.fuelCapacityL! * lvl!.value) / 100) } : {}),
    lPer100km,
  };
}

/**
 * Re-cost a planned route with measured pump prices along ITS polyline and attach a refuel
 * plan. Litres are the routing engine's; only the €/L changes. Routes without geometry are
 * returned untouched.
 */
export function withFuelIntelligence<O extends RouteForRefuel & { fuelConsumptionL?: number; fuelCostEur: number }>(
  option: O,
  fi: FuelIntelligence,
  truck: TruckForRefuel,
  fallbackEurPerL: number,
  driver?: DriverState,
): O & { fuelPriceBasis: TripFuelPrice; refuelPlan?: RefuelPlan } {
  if (option.polyline.length < 2) return { ...option, fuelPriceBasis: { eurPerL: fallbackEurPerL, basis: "rota sem geometria", sample: 0, source: "DEFAULT" } };
  const price = fi.priceForTrip(option.polyline, fallbackEurPerL);
  const litres = option.fuelConsumptionL ?? (option.distanceM / 1000) * (truck.lPer100km / 100);
  // Plan with the routing engine's consumption for this route (load, profile), not the preset.
  const lPer100km = option.fuelConsumptionL && option.distanceM > 0 ? Math.round((option.fuelConsumptionL / option.distanceM) * 1_000_000) / 10 : truck.lPer100km;
  const plan = fi.stationCount ? fi.refuelPlan(option, { ...truck, lPer100km }, driver) : undefined;
  return {
    ...option,
    fuelCostEur: Math.round(litres * price.eurPerL * 100) / 100,
    fuelPriceBasis: price,
    ...(plan ? { refuelPlan: plan } : {}),
  };
}
