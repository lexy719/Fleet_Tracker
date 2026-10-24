import type { CrewState } from "./crewSchedule";
import type { Crew, FuelModel, Instance } from "./model";

/*
 * What a crew's week costs. Without a fuel model: € per km. With one: wear per km + the diesel
 * actually bought, where it is bought. Refuelling follows the classic rule for a known road ahead
 * (optimal when you can buy any amount): at each stop, if a cheaper stop is within reach, buy just
 * enough to get there; otherwise fill up (only as much as the rest of the week needs). The week must
 * end with the fuel it started with, so fuel used and not bought on the road is bought at home.
 * Stops are the places the crew passes (start, pickups, deliveries, home): fuelling at stations
 * along a leg is left to the per-route refuel planner (fuelPlanning/refuelPlanner) at verification.
 */

export type FuelPurchase = { at: [number, number]; litres: number; eurPerL: number };
export type FuelPlan = { litresUsed: number; litresBought: number; costEur: number; purchases: FuelPurchase[] };

export function fuelPlan(fuel: FuelModel, crew: Crew, s: Pick<CrewState, "legs">, policy: "smart" | "naive" = "smart"): FuelPlan {
  // Stops 0..n: start, then the end of every leg (last = home). use[i] = litres from stop i to i+1.
  const at: [number, number][] = [crew.start, ...s.legs.map((l) => l.to)];
  const use = s.legs.map((l) => (l.km * (l.loaded ? fuel.lPer100KmLoaded : fuel.lPer100KmEmpty)) / 100);
  // The week ends by putting back the starting fuel at home: one virtual leg of (start − reserve).
  use.push(Math.max(0, fuel.startFuelL - fuel.reserveL));
  const price = at.map((p) => fuel.priceAt(p));
  const n = at.length;
  let level = fuel.startFuelL, costEur = 0, litresBought = 0;
  const purchases: FuelPurchase[] = [];
  const buy = (i: number, litres: number) => {
    if (litres <= 1e-9) return;
    level += litres;
    litresBought += litres;
    costEur += litres * price[i]!;
    purchases.push({ at: at[i]!, litres, eurPerL: price[i]! });
  };
  const usable = fuel.tankL - fuel.reserveL;
  for (let i = 0; i < n; i++) {
    const needToEnd = use.slice(i).reduce((a, b) => a + b, 0) + fuel.reserveL - level;
    if (policy === "naive") {
      // Fill up wherever the truck is, once below 30 % (or when the next leg needs it).
      if (level < 0.3 * fuel.tankL || level - use[i]! < fuel.reserveL) buy(i, Math.min(fuel.tankL - level, Math.max(0, needToEnd)));
    } else {
      let reach = 0, cheaper = -1;
      for (let j = i + 1; j < n && reach + use[j - 1]! <= usable; j++) {
        reach += use[j - 1]!;
        if (price[j]! < price[i]!) { cheaper = j; break; }
      }
      if (cheaper >= 0) buy(i, Math.max(0, reach + fuel.reserveL - level));
      else buy(i, Math.min(fuel.tankL - level, Math.max(0, needToEnd)));
    }
    if (level - use[i]! < fuel.reserveL - 1e-6) buy(i, fuel.reserveL - (level - use[i]!)); // a leg longer than the tank allows: never below reserve
    level -= use[i]!;
  }
  return { litresUsed: use.slice(0, -1).reduce((a, b) => a + b, 0), litresBought, costEur, purchases };
}

/** € cost of a crew's week (negative = it earns more than it costs). */
export function weekCostEur(inst: Instance, crew: Crew, s: CrewState): number {
  const km = s.loadedKm + s.emptyKm;
  if (!inst.fuel) return km * inst.costEurPerKm - s.revenueEur;
  return km * inst.fuel.nonFuelEurPerKm + fuelPlan(inst.fuel, crew, s).costEur - s.revenueEur;
}
