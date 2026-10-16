import { describe, expect, it } from "vitest";
import type { CorridorStation } from "../../fuel/corridor";
import { planRefuel, type RefuelInput } from "./refuelPlanner";

/** Synthetic corridor station (only the fields the planner reads). */
function st(id: string, alongKm: number, price: number, offRouteM = 100, country = "ES"): CorridorStation {
  return {
    station: { id, sourceId: "t", externalId: id, country: country as "ES", name: id, lat: 0, lon: 0, firstSeenAt: "", lastSeenAt: "" },
    price: { stationId: id, fuelType: "diesel", sourceLabel: "x", price, unit: "EUR/L", currency: "EUR", taxBasis: "", sourceId: "t", snapshotId: "s", parserVersion: 1, firstSeenAt: "", lastSeenAt: "" },
    offRouteM,
    alongRouteM: alongKm * 1000,
    ageH: 1,
  };
}

// 1 000 km at 80 km/h driving; 600 L tank at 32 L/100 km ⇒ 320 L needed; 200 L on board ⇒ ~437 km to reserve.
const base = (stations: CorridorStation[], over: Partial<RefuelInput> = {}): RefuelInput => ({
  route: { distanceM: 1_000_000, drivingSec: 12.5 * 3600 },
  stations,
  truck: { tankL: 600, startFuelL: 200, lPer100km: 32 },
  driver: { drivenTodaySec: 0, continuousSec: 0 },
  ...over,
});

describe("refuel planner", () => {
  it("no refuel when the tank already covers the trip", () => {
    const p = planRefuel(base([st("a", 100, 1.9)], { truck: { tankL: 600, startFuelL: 500, lPer100km: 32 } }));
    expect(p.status).toBe("NO_REFUEL_NEEDED");
    expect(p.stops).toEqual([]);
  });

  it("buys only what is needed at the cheapest reachable station, never below reserve", () => {
    const p = planRefuel(base([st("pricey", 200, 2.2), st("cheap", 300, 1.75), st("mid", 600, 2.0)]));
    expect(p.status).toBe("OK");
    expect(p.stops.map((s) => s.stationId)).toEqual(["cheap"]);
    // Need 320 L + 60 L reserve on arrival − 200 L on board ⇒ ~180 L bought.
    expect(p.stops[0]!.litres).toBeGreaterThanOrEqual(180);
    expect(p.stops[0]!.litres).toBeLessThanOrEqual(200);
    expect(p.totals!.endFuelL).toBeGreaterThanOrEqual(60);
  });

  it("takes a short detour to a much cheaper station off the route when it pays", () => {
    const p = planRefuel(base([st("onRoute", 300, 2.05, 50), st("offRouteCheap", 310, 1.70, 2500)]));
    expect(p.stops[0]!.stationId).toBe("offRouteCheap");
    expect(p.stops[0]!.detourKm).toBeGreaterThan(5);
    expect(p.stops[0]!.detourEur).toBeGreaterThan(0);
  });

  it("does not detour when the saving is smaller than the detour cost", () => {
    const p = planRefuel(base([st("onRoute", 300, 1.90, 50), st("offRouteBarelyCheaper", 310, 1.895, 4500)], { policy: { eurPerHour: 40, nonFuelEurPerKm: 0.5 } }));
    expect(p.stops[0]!.stationId).toBe("onRoute");
  });

  it("prefers a station inside a mandatory 45-min pause when time is priced (stop costs no extra time)", () => {
    // First mandatory break after 4h30 driving ≈ km 360 at 80 km/h.
    const p = planRefuel(base([st("beforeBreak", 340, 1.90, 100), st("noBreak", 200, 1.90, 100)], { policy: { eurPerHour: 40 } }));
    expect(p.stops[0]!.stationId).toBe("beforeBreak");
    expect(p.stops[0]!.pause).toMatchObject({ kind: "break" });
    expect(p.explanations[0]).toMatch(/pausa obrigatória/);
  });

  it("refuses to plan when stations are too sparse for the tank (never crosses the reserve)", () => {
    const p = planRefuel(base([st("only", 900, 1.8)], { truck: { tankL: 600, startFuelL: 150, lPer100km: 32 } }));
    expect(p.status).toBe("INFEASIBLE");
  });

  it("reports a fair saving against the naive fill-up policy (leftover fuel credited)", () => {
    const p = planRefuel(base([st("s1", 200, 2.10), st("s2", 330, 1.72, 300), st("s3", 600, 2.05)]));
    expect(p.status).toBe("OK");
    expect(p.baseline!.feasible).toBe(true);
    expect(p.savingEur!).toBeGreaterThan(0);
    expect(p.assumptions.join(" ")).toMatch(/mediano do corredor/);
  });

  it("dense corridor: hundreds of stations add no fuel drift (buys only what the trip needs)", () => {
    // A station every 3 km, all the same price: the cheapest plan buys need + reserve − on board.
    const dense = Array.from({ length: 330 }, (_, i) => st(`d${i}`, 3 + i * 3, 1.9, 100));
    const p = planRefuel(base(dense, { truck: { tankL: 900, startFuelL: 250, lPer100km: 34.5 } }));
    expect(p.status).toBe("OK");
    // 1 000 km × 34.5 L/100 km = 345 L; reserve 90 L ⇒ ~185 L bought (plus detour litres, rounding).
    expect(p.totals!.litres).toBeGreaterThanOrEqual(180);
    expect(p.totals!.litres).toBeLessThanOrEqual(200);
    expect(p.totals!.endFuelL).toBeGreaterThanOrEqual(90);
    expect(p.totals!.endFuelL).toBeLessThan(110);
  });

  it("discloses assumed start fuel", () => {
    const p = planRefuel(base([st("a", 300, 1.8)], { truck: { tankL: 600, lPer100km: 32 } }));
    expect(p.assumptions[0]).toMatch(/assumido 300 L/);
  });
});
