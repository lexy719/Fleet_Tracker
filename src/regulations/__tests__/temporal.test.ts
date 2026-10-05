import { describe, expect, it } from "vitest";
import { evaluateCompliance, evaluateRegulation } from "../evaluate";
import { at, closure, dataset, geometry, input, period, ROAD_A, routeAlong } from "./helpers";

/*
 * Overnight closure 21:00 → 05:00 (Europe/Lisbon, UTC+1 on these dates).
 * Semantics: active periods are half-open [start, end) on local wall time — an
 * INTERPRETATION (sources do not state boundary inclusivity); with the default ETA
 * tolerance (±15 min) every boundary passage is UNKNOWN anyway.
 */
const G = geometry("road-a", ROAD_A);
const NIGHT = closure("night", "road-a", { activePeriods: [period("2026-10-01T21:00", "2026-10-02T05:00")] });
const DS = dataset([NIGHT], [G]);

const outcome = (enterLocal: string, tolMin = 15, kmh = 60) =>
  evaluateRegulation(NIGHT, DS, input(routeAlong(ROAD_A, at(enterLocal), kmh)), { timeToleranceMin: tolMin, sampleStepMin: 5 }).outcome;

describe("overnight period with ETA tolerance ±15 min", () => {
  it.each([
    ["well before start", "2026-10-01T20:00:00+01:00", "DOES_NOT_APPLY"],
    ["10 min before start", "2026-10-01T20:50:00+01:00", "UNKNOWN"],
    ["exactly at start", "2026-10-01T21:00:00+01:00", "UNKNOWN"],
    ["20 min after start", "2026-10-01T21:20:00+01:00", "APPLIES"],
    ["across midnight", "2026-10-01T23:59:00+01:00", "APPLIES"],
    ["after midnight, still inside", "2026-10-02T00:30:00+01:00", "APPLIES"],
    ["20 min before end", "2026-10-02T04:40:00+01:00", "APPLIES"],
    ["10 min before end", "2026-10-02T04:50:00+01:00", "UNKNOWN"],
    ["exactly at end", "2026-10-02T05:00:00+01:00", "UNKNOWN"],
    ["well after end", "2026-10-02T05:30:00+01:00", "DOES_NOT_APPLY"],
    ["same clock time, previous night (outside dates)", "2026-09-30T23:00:00+01:00", "DOES_NOT_APPLY"],
    ["same clock time, next night (outside dates)", "2026-10-02T23:00:00+01:00", "DOES_NOT_APPLY"],
  ])("%s → %s", (_label, enter, expected) => {
    expect(outcome(enter)).toBe(expected);
  });
});

describe("boundary semantics with zero tolerance (exact ETA)", () => {
  it("exactly at start is inside (half-open start)", () => {
    expect(outcome("2026-10-01T21:00:00+01:00", 0)).toBe("APPLIES");
  });
  it("enters just before the start and is still on the segment when it begins ⇒ APPLIES", () => {
    // ~1.7 km at 60 km/h ≈ 1.7 min on the segment: 20:59 → 21:00.7
    expect(outcome("2026-10-01T20:59:00+01:00", 0)).toBe("APPLIES");
  });
  it("leaves the segment before the start ⇒ DOES_NOT_APPLY", () => {
    expect(outcome("2026-10-01T20:57:00+01:00", 0)).toBe("DOES_NOT_APPLY");
  });
  it("enters during the event and exits after it ends ⇒ APPLIES", () => {
    expect(outcome("2026-10-02T04:59:00+01:00", 0)).toBe("APPLIES");
  });
  it("reaching the line's first point exactly at 05:00 is still APPLIES — the matched stretch starts ~30 m (≈2 s) earlier, at 04:59:58", () => {
    expect(outcome("2026-10-02T05:00:00+01:00", 0)).toBe("APPLIES");
  });
  it("entering 30 s after the end ⇒ DOES_NOT_APPLY (half-open end)", () => {
    expect(outcome("2026-10-02T05:00:30+01:00", 0)).toBe("DOES_NOT_APPLY");
  });
  it("slow traversal spanning a whole short event ⇒ APPLIES", () => {
    const short = closure("short", "road-a", { activePeriods: [period("2026-10-01T10:00", "2026-10-01T10:05")] });
    const r = evaluateRegulation(short, dataset([short], [G]), input(routeAlong(ROAD_A, at("2026-10-01T09:58:00+01:00"), 10)), { timeToleranceMin: 0, sampleStepMin: 5 });
    expect(r.outcome).toBe("APPLIES");
  });
});

describe("short events are not skipped by sampling (regression)", () => {
  it("a 10-min event 5 min after the ETA is UNKNOWN, not DOES_NOT_APPLY", () => {
    // The previous sampler looked only at t−15, t, t+15 and missed events in between.
    const short = closure("short", "road-a", { activePeriods: [period("2026-10-01T21:02", "2026-10-01T21:12")] });
    const r = evaluateRegulation(short, dataset([short], [G]), input(routeAlong(ROAD_A, at("2026-10-01T20:57:00+01:00"))), { timeToleranceMin: 15, sampleStepMin: 5 });
    expect(r.outcome).toBe("UNKNOWN");
  });
});

describe("dates: departure day ≠ passage day, multi-day trips", () => {
  it("departs one evening, reaches the segment after midnight inside the closure", () => {
    const route = routeAlong(ROAD_A, at("2026-10-02T01:00:00+01:00"));
    // prepend a long approach so departure is the previous day
    const dep = Date.parse(at("2026-10-01T19:00:00+01:00"));
    route.points.unshift([40.9, -8.7]);
    route.pointTimesMs.unshift(dep);
    expect(evaluateRegulation(NIGHT, DS, input(route)).outcome).toBe("APPLIES");
  });
  it("multi-day trip reaching the segment two days later outside the dates ⇒ DOES_NOT_APPLY", () => {
    const route = routeAlong(ROAD_A, at("2026-10-03T22:00:00+01:00"));
    route.points.unshift([40.9, -8.7]);
    route.pointTimesMs.unshift(Date.parse(at("2026-10-01T08:00:00+01:00")));
    expect(evaluateRegulation(NIGHT, DS, input(route)).outcome).toBe("DOES_NOT_APPLY");
  });
});

describe("DST — Europe/Lisbon wall-clock windows", () => {
  const WINDOW = closure("daily", "road-a", { windows: [{ start: "07:00", end: "21:00", evidence: ["test-evidence"] }] });
  const D = dataset([WINDOW], [G]);
  const o = (utc: string) => evaluateRegulation(WINDOW, D, input(routeAlong(ROAD_A, utc)), { timeToleranceMin: 0, sampleStepMin: 5 }).outcome;
  it("06:30Z is 07:30 local before DST ends (UTC+1) ⇒ inside", () => {
    expect(o("2026-10-23T06:30:00Z")).toBe("APPLIES");
  });
  it("06:30Z is 06:30 local after DST ends (UTC+0) ⇒ outside", () => {
    expect(o("2026-10-26T06:30:00Z")).toBe("DOES_NOT_APPLY");
  });
  it("spring forward: 06:30Z is 07:30 local on 2027-03-29 ⇒ inside", () => {
    expect(o("2027-03-29T06:30:00Z")).toBe("APPLIES");
  });
});

describe("time zone must be valid", () => {
  it.each([["missing", ""], ["invalid", "Europe/Nowhere"]])("%s time zone ⇒ EVALUATION_ERROR, never compliant", (_l, tz) => {
    const bad = closure("bad-tz", "road-a", { timeZone: tz, activePeriods: [period("2026-10-01T21:00", "2026-10-02T05:00")] });
    const report = evaluateCompliance(dataset([bad], [G]), input(routeAlong(ROAD_A, at("2026-10-01T12:00:00+01:00"))));
    expect(report.status).toBe("EVALUATION_ERROR");
    expect(report.results[0]!.error).toMatch(/fuso horário/);
  });
});
