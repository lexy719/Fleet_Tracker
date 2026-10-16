import { stationsAlongRoute } from "./corridor";
import type { FuelPriceObservation, FuelStation, FuelType } from "./types";

/*
 * Price to cost a trip BEFORE the route is known: median pump price of stations within a
 * corridor around the straight line between the trip's points. Falls back to the given
 * default, and always says which one was used.
 */

export type TripFuelPrice = { eurPerL: number; basis: string; sample: number; source: "MEASURED" | "DEFAULT" };

export const TRIP_PRICE_BUFFER_M = 15_000;
/** Prices not seen for longer than this are ignored for costing. */
export const TRIP_PRICE_MAX_AGE_H = 72;

export function tripFuelPrice(
  points: [number, number][],
  stations: FuelStation[],
  prices: FuelPriceObservation[],
  opts: { fuelType?: FuelType; fallbackEurPerL: number; now: Date },
): TripFuelPrice {
  const fuelType = opts.fuelType ?? "diesel";
  if (points.length >= 2 && stations.length) {
    const r = stationsAlongRoute(points, stations, prices, { fuelType, bufferM: TRIP_PRICE_BUFFER_M, now: opts.now, maxAgeH: TRIP_PRICE_MAX_AGE_H });
    if (r.stations.length >= 3 && r.medianPrice !== undefined) {
      const countries = [...new Set(r.stations.map((s) => s.station.country))].join("+");
      return {
        eurPerL: r.medianPrice,
        basis: `mediana de ${r.stations.length} postos (${countries}) no corredor da viagem, preços com ≤ ${TRIP_PRICE_MAX_AGE_H} h`,
        sample: r.stations.length,
        source: "MEASURED",
      };
    }
  }
  return { eurPerL: opts.fallbackEurPerL, basis: "preço por defeito (sem preços de postos suficientes no corredor)", sample: 0, source: "DEFAULT" };
}
