import { haversineM } from "../regulations/geometry";

/*
 * Lean model for weekly load assignment (full truckloads). A crew = truck + driver + trailer that
 * normally travel together; a load = one pickup and one delivery that fills the trailer. The search
 * works on this model with fast travel estimates; the chosen plan is then verified with real routes
 * and the full rule evaluation.
 */

export type LatLng = [number, number];
export type Equipment = "CURTAIN" | "REEFER";

export type Load = {
  id: string;
  fromName: string;
  toName: string;
  from: LatLng;
  to: LatLng;
  /** Country of each end: two Spanish ends on a Portuguese truck = cabotage. */
  fromCountry: "PT" | "ES";
  toCountry: "PT" | "ES";
  pickupStartMs: number;
  pickupEndMs: number;
  deliveryStartMs: number;
  deliveryEndMs: number;
  pickupServiceSec: number;
  deliveryServiceSec: number;
  equipment: Equipment;
  weightKg: number;
  rateEur: number;
};

export type DrivingBaseline = {
  /** Driving since the last daily rest, seconds. */
  dayDriveSec: number;
  /** Driving since the last break of 45 min (or 15 + 30), seconds. */
  continuousDriveSec: number;
  /** Driving in the current calendar week (Mon 00:00 Lisbon), seconds. */
  weekDriveSec: number;
  /** Driving in the previous calendar week (for the 90 h fortnight), seconds. */
  previousWeekDriveSec: number;
};

export type Crew = {
  id: string;
  truckId: string;
  driverId: string;
  trailerId: string;
  equipment: Equipment;
  homeName: string;
  home: LatLng;
  /** Where the crew is when the plan starts, and from when it can move. */
  start: LatLng;
  availableFromMs: number;
  /** Must be back home by then for the weekly rest (Bragança style: weekends at home). */
  homeByMs: number;
  driving: DrivingBaseline;
};

export type Leg = { km: number; sec: number };
export type Travel = (a: LatLng, b: LatLng) => Leg;

export type Instance = {
  name: string;
  weekStartMs: number;
  crews: Crew[];
  loads: Load[];
  travel: Travel;
  /** Cost of running a truck per km (fuel + wear), €; tolls not modelled yet. Used when `fuel` is absent. */
  costEurPerKm: number;
  /** Fuel priced where it is bought; then `costEurPerKm` is replaced by fuel + `fuel.nonFuelEurPerKm`. */
  fuel?: FuelModel;
};

export type FuelModel = {
  /** Road-diesel pump price around a place, €/L (e.g. median of the stations within 15 km). */
  priceAt: (p: LatLng) => number;
  tankL: number;
  /** On board at the start of the week; the week must end with the same (bought at home if not before). */
  startFuelL: number;
  reserveL: number;
  lPer100KmLoaded: number;
  lPer100KmEmpty: number;
  /** Wear, tyres, maintenance… per km, €. */
  nonFuelEurPerKm: number;
};

/** A load the search may plan: real coordinates, real times, windows the right way round, non-negative price. */
export function isPlannableLoad(l: Load): boolean {
  const finite = [...l.from, ...l.to, l.pickupStartMs, l.pickupEndMs, l.deliveryStartMs, l.deliveryEndMs, l.pickupServiceSec, l.deliveryServiceSec, l.rateEur].every(Number.isFinite);
  return finite && Math.abs(l.from[0]) <= 90 && Math.abs(l.to[0]) <= 90 && Math.abs(l.from[1]) <= 180 && Math.abs(l.to[1]) <= 180 &&
    l.pickupEndMs >= l.pickupStartMs && l.deliveryEndMs >= l.deliveryStartMs && l.deliveryEndMs >= l.pickupStartMs &&
    l.pickupServiceSec >= 0 && l.deliveryServiceSec >= 0 && l.rateEur >= 0;
}

export type Solution = {
  routes: { crewId: string; loadIds: string[] }[];
  unassigned: string[];
};

/** Synthetic road model (same as the week simulation): 25 % over straight line, 72 km/h average. */
export const ROAD_UPLIFT = 1.25;
export const TRUCK_AVG_KMH = 72;
export function syntheticTravel(): Travel {
  return (a, b) => {
    const km = (haversineM(a, b) / 1000) * ROAD_UPLIFT;
    return { km, sec: (km / TRUCK_AVG_KMH) * 3600 };
  };
}
