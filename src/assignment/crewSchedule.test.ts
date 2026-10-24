import { describe, expect, it } from "vitest";
import { validateDriverTimeline } from "../legal/driverLegality";
import { BENCH_SIZES, BENCH_WEEK_START, bragancaInstance } from "./bench/bragancaInstance";
import { dispatcherPlan } from "./greedy";
import { scorePlan } from "./bench/evaluate";
import { appendLoad, appendLoadWhy, initialState, returnHome, scheduleRoute, scheduleRouteWhy, type FailDetail } from "./crewSchedule";
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

describe("crew schedule: delays, a truck out of service, and why a step fails", () => {
  const audit = (c: Crew, loads: Load[]) => {
    const s = scheduleRoute(c, loads, travel, true)!;
    expect(s).not.toBeNull();
    expect(validateDriverTimeline(s.activities!, { afterWeeklyRestEndMs: c.availableFromMs }).violations).toEqual([]);
    return s;
  };
  const week = [load("A", braganca, leixoes, "PT", "PT", 0), load("B", leixoes, madrid, "PT", "ES", 6)];

  it("a delay in the middle of a leg splits it there and counts as driving", () => {
    const at = BENCH_WEEK_START + 2.5 * H; // Bragança → Leixões, loaded
    const plain = audit(crew(), week), late = audit(crew({ delays: [{ atMs: at, sec: 2 * 3600, as: "driving" }] }), week);
    const d = late.activities!.find((a) => a.note === "atraso")!;
    expect(d.startMs).toBe(at);
    expect(late.driveSec - plain.driveSec).toBeCloseTo(2 * 3600, 0);
    expect(late.t).toBeGreaterThan(plain.t);
  });

  it("a delay that falls in a compulsory break comes after it, and the next break is still on time", () => {
    // Regression: the break ran past the delay and the time to the delay went negative (the audit caught 4.75 h without a break).
    const c = crew();
    const s0 = audit(c, week);
    const brk = s0.activities!.find((a) => a.kind === "BREAK" && a.note === "pausa")!;
    audit(crew({ delays: [{ atMs: (brk.startMs + brk.endMs) / 2, sec: 3 * 3600, as: "driving" }] }), week);
  });

  it("a delay while waiting for a window only matters if it outlasts the wait", () => {
    const l = load("C", leixoes, braganca, "PT", "PT", 10);
    const c = crew({ start: leixoes });
    const loadingAt = (sec: number) => audit(crew({ start: leixoes, delays: [{ atMs: BENCH_WEEK_START + 2 * H, sec, as: "waiting" }] }), [l]).activities!.find((a) => a.note === "carga C")!.startMs;
    const plain = audit(c, [l]).activities!.find((a) => a.note === "carga C")!.startMs;
    expect(loadingAt(3 * 3600)).toBe(plain);
    expect(loadingAt(12 * 3600)).toBe(BENCH_WEEK_START + 14 * H);
  });

  it("a truck out of service: no load that ends after it, and no trip home", () => {
    const out = crew({ outOfServiceFromMs: BENCH_WEEK_START + 3 * H });
    const why: FailDetail = {};
    expect(appendLoadWhy(initialState(out), week[0]!, travel, out, why)).toBe("OUT_OF_SERVICE");
    expect(why.limitMs).toBe(BENCH_WEEK_START + 3 * H);
    const short = load("S", braganca, [41.485, -7.181], "PT", "PT", 0);
    const s = appendLoad(initialState(out), short, travel, out)!;
    expect(returnHome(s, out, travel)!.emptyKm).toBe(s.emptyKm);
  });

  it("says why a step fails, with the times", () => {
    const why: FailDetail = {};
    expect(appendLoadWhy(initialState(crew()), load("late", madrid, leixoes, "ES", "PT", 1, { pickupEndMs: BENCH_WEEK_START + 2 * H }), travel, crew(), why)).toBe("PICKUP_LATE");
    expect(why.atMs).toBeGreaterThan(why.limitMs!);
    const tired = crew({ driving: { dayDriveSec: 0, continuousDriveSec: 0, weekDriveSec: 55 * 3600, previousWeekDriveSec: 0 } });
    expect(appendLoadWhy(initialState(tired), week[1]!, travel, tired)).toBe("WEEK_DRIVE");
    const sevilla: [number, number] = [37.389, -5.985];
    const r = scheduleRouteWhy(crew(), [load("far", braganca, sevilla, "PT", "ES", 4 * 24 + 6)], travel);
    expect("fail" in r && [r.fail.code, r.index]).toEqual(["NOT_HOME", 1]);
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
