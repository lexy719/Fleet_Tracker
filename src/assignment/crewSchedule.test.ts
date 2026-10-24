import { describe, expect, it } from "vitest";
import { validateDriverTimeline } from "../legal/driverLegality";
import { BENCH_SIZES, BENCH_WEEK_START, bragancaInstance } from "./bench/bragancaInstance";
import { dispatcherPlan } from "./greedy";
import { scorePlan } from "./bench/evaluate";
import { appendLoad, initialState, scheduleRoute } from "./crewSchedule";
import { syntheticTravel, type Crew, type Load } from "./model";

const H = 3_600_000;
const travel = syntheticTravel();
const braganca: [number, number] = [41.806, -6.757], madrid: [number, number] = [40.424, -3.561], leixoes: [number, number] = [41.185, -8.7];
const crew = (over: Partial<Crew> = {}): Crew => ({
  id: "E1", truckId: "T1", driverId: "M1", trailerId: "R1", equipment: "CURTAIN", homeName: "Bragança", home: braganca, start: braganca,
  availableFromMs: BENCH_WEEK_START, homeByMs: BENCH_WEEK_START + 5 * 24 * H + 8 * H,
  driving: { dayDriveSec: 0, continuousDriveSec: 0, weekDriveSec: 0, previousWeekDriveSec: 0 }, ...over,
});
const load = (id: string, from: [number, number], to: [number, number], fromCountry: "PT" | "ES", toCountry: "PT" | "ES", pickupH: number, over: Partial<Load> = {}): Load => ({
  id, fromName: id, toName: id, from, to, fromCountry, toCountry,
  pickupStartMs: BENCH_WEEK_START + pickupH * H, pickupEndMs: BENCH_WEEK_START + (pickupH + 6) * H,
  deliveryStartMs: BENCH_WEEK_START + pickupH * H, deliveryEndMs: BENCH_WEEK_START + (pickupH + 48) * H,
  pickupServiceSec: 3600, deliveryServiceSec: 3600, equipment: "CURTAIN", weightKg: 20_000, rateEur: 1000, ...over,
});

describe("crew schedule", () => {
  it("a long day gets its breaks and a daily rest, and the audit finds it legal", () => {
    // Bragança → Leixões → Madrid → Bragança: ~1 400 km, several days.
    const s = scheduleRoute(crew(), [load("A", braganca, leixoes, "PT", "PT", 0), load("B", leixoes, madrid, "PT", "ES", 6)], travel, true)!;
    expect(s).not.toBeNull();
    const kinds = new Set(s.activities!.map((a) => a.kind));
    expect(kinds.has("BREAK")).toBe(true);
    expect(kinds.has("REST")).toBe(true);
    const report = validateDriverTimeline(s.activities!, { afterWeeklyRestEndMs: BENCH_WEEK_START });
    expect(report.violations).toEqual([]);
  });

  it("refuses a missed pickup window, wrong equipment and cabotage without an international delivery", () => {
    expect(appendLoad(initialState(crew()), load("late", madrid, leixoes, "ES", "PT", 1, { pickupEndMs: BENCH_WEEK_START + 2 * H }), travel, crew())).toBeNull();
    expect(appendLoad(initialState(crew()), load("cold", braganca, leixoes, "PT", "PT", 0, { equipment: "REEFER" }), travel, crew())).toBeNull();
    const zamora: [number, number] = [41.5, -5.75];
    expect(appendLoad(initialState(crew({ start: zamora })), load("cab", zamora, madrid, "ES", "ES", 0), travel, crew())).toBeNull();
    const intoSpain = appendLoad(initialState(crew()), load("in", braganca, zamora, "PT", "ES", 0), travel, crew())!;
    expect(appendLoad(intoSpain, load("cab", zamora, madrid, "ES", "ES", 10), travel, crew())).not.toBeNull();
  });

  it("must be home by Saturday", () => {
    const sevilla: [number, number] = [37.389, -5.985];
    expect(scheduleRoute(crew(), [load("far", braganca, sevilla, "PT", "ES", 4 * 24 + 6)], travel)).toBeNull();
  });
});

describe("benchmark: dispatcher baseline on the small Bragança week", () => {
  it("every route it builds is legal under the independent audit", () => {
    const inst = bragancaInstance(BENCH_SIZES[0]!);
    const score = scorePlan("despachante (mais perto)", inst, dispatcherPlan(inst, "nearest"), 0);
    expect(score.infeasibleRoutes).toBe(0);
    expect(score.violations).toEqual({});
    expect(score.assigned).toBeGreaterThan(0);
  });
});
