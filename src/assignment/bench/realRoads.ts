import type { FuelModel, Instance, LatLng, Travel } from "../model";
import { HUBS } from "./bragancaInstance";
import fuelPrices from "./hubFuelPrices.json";
import matrix from "./hubMatrix.truck3.json";

/*
 * Real truck distance and time between the benchmark hubs, recorded from our routing engine
 * (scripts/build-hub-matrix.mts). Same hub → 0. Points that are not hubs are refused.
 */
const pairs = (matrix as { pairs: Record<string, { km: number; sec: number }> }).pairs;
const nameAt = new Map(HUBS.map((h) => [`${h.at[0]},${h.at[1]}`, h.name]));

export const realRoadTravel: Travel = (a, b) => {
  const na = nameAt.get(`${a[0]},${a[1]}`), nb = nameAt.get(`${b[0]},${b[1]}`);
  if (!na || !nb) throw new Error(`realRoadTravel: not a hub ${a} → ${b}`);
  if (na === nb) return { km: 0, sec: 0 };
  return pairs[`${na}|${nb}`]!;
};

/** The same week on real roads: travel from the engine, and prices recomputed on real km. */
export function onRealRoads(inst: Instance): Instance {
  return { ...inst, name: `${inst.name} — estradas reais`, travel: realRoadTravel,
    loads: inst.loads.map((l) => ({ ...l, rateEur: Math.round(150 + 1.3 * realRoadTravel(l.from, l.to).km) })) };
}


const fuel = fuelPrices as { recordedAt: string; medianPT: number; medianES: number; hubs: Record<string, { eurPerL: number }> };
/** Real pump prices (DGEG + MITECO, median within 15 km of each hub) recorded on `fuel.recordedAt`. */
export const HUB_FUEL_RECORDED_AT = fuel.recordedAt;
export const hubFuelPrice = (p: LatLng): number => {
  const name = nameAt.get(`${p[0]},${p[1]}`);
  const price = name ? fuel.hubs[name]?.eurPerL : undefined;
  if (price === undefined || !Number.isFinite(price)) throw new Error(`hubFuelPrice: no price for ${p}`);
  return price;
};
/** 40 t tractor: 900 L tank, half full at the start, 10 % reserve, 34 L/100 km loaded, 26 empty, €0.15/km wear. */
export const TRUCK_FUEL: Omit<FuelModel, "priceAt"> = { tankL: 900, startFuelL: 450, reserveL: 90, lPer100KmLoaded: 34, lPer100KmEmpty: 26, nonFuelEurPerKm: 0.15 };
export const withRealFuel = (inst: Instance): Instance => ({ ...inst, fuel: { ...TRUCK_FUEL, priceAt: hubFuelPrice } });
