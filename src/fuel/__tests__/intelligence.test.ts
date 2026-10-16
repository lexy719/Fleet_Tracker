import { describe, expect, it } from "vitest";
import { createFuelIntelligence, truckForRefuel, withFuelIntelligence } from "../intelligence";
import type { FuelPriceObservation, FuelStation } from "../types";

const NOW = new Date("2026-10-11T10:00:00Z");
const seen = "2026-10-11T09:00:00Z";
function station(id: string, lat: number, lon: number, country: "PT" | "ES"): FuelStation {
  return { id, sourceId: "t", externalId: id, country, name: id, lat, lon, firstSeenAt: seen, lastSeenAt: seen };
}
function price(stationId: string, p: number): FuelPriceObservation {
  return { stationId, fuelType: "diesel", sourceLabel: "x", price: p, unit: "EUR/L", currency: "EUR", taxBasis: "", sourceId: "t", snapshotId: "s", parserVersion: 1, firstSeenAt: seen, lastSeenAt: seen };
}

// Straight 600 km route east along latitude 41.5 (≈ 83.4 km per degree of longitude).
const polyline: [number, number][] = Array.from({ length: 61 }, (_, i) => [41.5, -8.6 + (i * 7.2) / 60] as [number, number]);
const route = { polyline, distanceM: 600_000, durationSec: 7.5 * 3600, fuelConsumptionL: 192, fuelCostEur: 0 };
const stations = [station("pt1", 41.5, -8.0, "PT"), station("pt2", 41.52, -7.5, "PT"), station("es1", 41.5, -6.0, "ES"), station("es2", 41.51, -4.0, "ES"), station("far", 43.0, -5.0, "ES")];
const prices = [price("pt1", 2.2), price("pt2", 2.18), price("es1", 1.8), price("es2", 1.9), price("far", 1.2)];

describe("fuel intelligence → route cost", () => {
  const fi = createFuelIntelligence(stations, prices, () => NOW);

  it("re-costs the route with the median pump price on its own corridor (litres unchanged)", () => {
    const o = withFuelIntelligence(route, fi, { tankL: 600, startFuelL: 100, lPer100km: 32 }, 2.0);
    expect(o.fuelPriceBasis.source).toBe("MEASURED");
    expect(o.fuelPriceBasis.sample).toBe(4); // the far, cheap station is not on the corridor
    expect(o.fuelPriceBasis.eurPerL).toBeCloseTo(2.04, 2);
    expect(o.fuelCostEur).toBeCloseTo(192 * 2.04, 0);
  });

  it("plans the refuel at the cheap Spanish pump, with the route's own consumption", () => {
    const o = withFuelIntelligence(route, fi, { tankL: 600, startFuelL: 200, lPer100km: 26 }, 2.0);
    expect(o.refuelPlan!.status).toBe("OK");
    expect(o.refuelPlan!.stops[0]!.stationId).toBe("es1");
    expect(o.refuelPlan!.assumptions.join(" ")).toMatch(/32 L\/100 km/);
    expect(o.refuelPlan!.assumptions.join(" ")).toMatch(/30 €\/h/);
  });

  it("falls back to the default price, and says so, without stations", () => {
    const empty = createFuelIntelligence([], [], () => NOW);
    const o = withFuelIntelligence(route, empty, { lPer100km: 32 }, 2.0);
    expect(o.fuelPriceBasis.source).toBe("DEFAULT");
    expect(o.fuelCostEur).toBeCloseTo(384, 0);
    expect(o.refuelPlan).toBeUndefined();
  });

  it("only trusts a recent recorded tank level", () => {
    expect(truckForRefuel({ fuelCapacityL: 600, fuelLevelPct: { value: 50, recordedAt: "2026-10-11T08:00:00Z" } }, 30, NOW)).toEqual({ tankL: 600, startFuelL: 300, lPer100km: 30 });
    expect(truckForRefuel({ fuelCapacityL: 600, fuelLevelPct: { value: 50, recordedAt: "2026-10-09T08:00:00Z" } }, 30, NOW)).toEqual({ tankL: 600, lPer100km: 30 });
  });

  it("asks for the tank capacity instead of guessing it", () => {
    const o = withFuelIntelligence(route, fi, { lPer100km: 32 }, 2.0);
    expect(o.refuelPlan!.status).toBe("INFEASIBLE");
    expect(o.refuelPlan!.explanations[0]).toMatch(/Capacidade do depósito/);
  });
});
