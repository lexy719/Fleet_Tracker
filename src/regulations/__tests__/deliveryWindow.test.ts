import { describe, expect, it } from "vitest";
import { demoJobs as seedJobs } from "../../data/mockData";
import type { RoutePlanOption } from "../../tomtom/planRoutes";
import { assessOptionWindows, optionWindowStatus } from "../alternatives";
import { assessStopWindow, worstWindow } from "../deliveryWindow";

const W = { id: "s", scheduledTime: "21:30", windowEnd: "23:30", windowStartAt: "2026-10-01T21:30:00+01:00", windowEndAt: "2026-10-01T23:30:00+01:00" };
const t = (local: string) => Date.parse(local);

describe("dated window assessment", () => {
  it.each([
    ["comfortably inside", "2026-10-01T22:00:00+01:00", "2026-10-01T22:10:00+01:00", "achievable"],
    ["exactly at start", "2026-10-01T21:30:00+01:00", "2026-10-01T21:30:00+01:00", "achievable"],
    ["exactly at end (no margin left)", "2026-10-01T23:30:00+01:00", "2026-10-01T23:30:00+01:00", "at_risk"],
    ["10 min before end (inside ETA margin)", "2026-10-01T23:20:00+01:00", "2026-10-01T23:20:00+01:00", "at_risk"],
    ["ETA range straddles the end", "2026-10-01T23:00:00+01:00", "2026-10-02T00:30:00+01:00", "at_risk"],
    ["clearly late", "2026-10-02T00:00:00+01:00", "2026-10-02T00:20:00+01:00", "missed"],
    ["early arrival (waits)", "2026-10-01T20:00:00+01:00", "2026-10-01T20:10:00+01:00", "achievable"],
  ])("%s ⇒ %s", (_l, e, l, expected) => {
    expect(assessStopWindow(W, t(e), t(l)).status).toBe(expected);
  });

  it("overnight: ETA 00:30 next day vs window ending 23:30 is MISSED (clock-only logic called this early)", () => {
    expect(assessStopWindow(W, t("2026-10-02T00:30:00+01:00"), t("2026-10-02T00:30:00+01:00")).status).toBe("missed");
  });
  it("multi-day window", () => {
    const multi = { ...W, windowStartAt: "2026-10-01T08:00:00+01:00", windowEndAt: "2026-10-03T18:00:00+01:00" };
    expect(assessStopWindow(multi, t("2026-10-02T15:00:00+01:00"), t("2026-10-02T23:00:00+01:00")).status).toBe("achievable");
  });
  it("legacy clock-only window ⇒ UNKNOWN (never guessed onto a date)", () => {
    const a = assessStopWindow({ id: "s", scheduledTime: "08:00", windowEnd: "11:00" }, t("2026-10-01T09:00:00+01:00"), t("2026-10-01T09:00:00+01:00"));
    expect(a.status).toBe("unknown");
    expect(a.reason).toMatch(/sem data/);
  });
  it("missing window ⇒ no_window; invalid dates ⇒ unknown; missing ETA ⇒ unknown", () => {
    expect(assessStopWindow({ id: "s", scheduledTime: "", windowEnd: "" }, 0, 0).status).toBe("no_window");
    expect(assessStopWindow({ ...W, windowEndAt: "not a date" }, t("2026-10-01T22:00:00+01:00"), t("2026-10-01T22:00:00+01:00")).status).toBe("unknown");
    expect(assessStopWindow(W, Number.NaN, Number.NaN).status).toBe("unknown");
  });
  it("worst across stops", () => {
    expect(worstWindow([{ stopId: "a", status: "achievable", reason: "" }, { stopId: "b", status: "unknown", reason: "" }])).toBe("unknown");
    expect(worstWindow([{ stopId: "a", status: "missed", reason: "" }, { stopId: "b", status: "at_risk", reason: "" }])).toBe("missed");
  });
});

describe("per-option impact uses driving (earliest) and driving + mandatory breaks (latest)", () => {
  const job = seedJobs.find((j) => j.id === "J-DEMO-IP3")!;
  const opt = (driveSec: number): RoutePlanOption => ({
    id: "o", title: "", subtitle: "", polyline: [], distanceM: 1, durationSec: driveSec, trafficDelaySec: 0, fuelCostEur: 0, tollCostEur: 0,
    tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none", tollSectionCount: 0, stopArrivals: [], legDurationSec: [driveSec],
    legPointCounts: [], roadNumbers: [], colorIndex: 0,
  });
  const depart = Date.parse("2026-10-01T21:15:00+01:00");
  it("original (78 min) ⇒ achievable", () => {
    expect(optionWindowStatus(opt(78 * 60), job, depart, 0)).toBe("achievable");
  });
  it("reroute adding 90 min makes it late", () => {
    expect(optionWindowStatus(opt((78 + 90) * 60), job, depart, 0)).not.toBe("achievable");
  });
  it("a driver near the daily limit pushes the latest ETA (mandatory break) ⇒ not 'achievable' by driving time alone", () => {
    const withBreaks = assessOptionWindows(opt(110 * 60), job, depart, 8.9);
    const noBreaks = assessOptionWindows(opt(110 * 60), job, depart, 0);
    expect(Date.parse(withBreaks[1]!.etaLatestIso!)).toBeGreaterThan(Date.parse(noBreaks[1]!.etaLatestIso!));
  });
  it("pickup window checked against the departure (stop 0)", () => {
    expect(assessOptionWindows(opt(60 * 60), job, depart, 0)[0]!.status).toBe("achievable");
  });
});

describe("driver hours are interpreted in hours (regression: were passed as seconds)", () => {
  const job = seedJobs.find((j) => j.id === "J-DEMO-IP3")!;
  it("8.9 h already driven + 110 min trip ⇒ daily rest needed ⇒ latest ETA ≥ 11 h later", () => {
    const o = { id: "o", title: "", subtitle: "", polyline: [], distanceM: 1, durationSec: 6600, trafficDelaySec: 0, fuelCostEur: 0, tollCostEur: 0, tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none" as const, tollSectionCount: 0, stopArrivals: [], legDurationSec: [6600], legPointCounts: [], roadNumbers: [], colorIndex: 0 };
    const depart = Date.parse("2026-10-01T21:15:00+01:00");
    const a = assessOptionWindows(o, job, depart, 8.9)[1]!;
    expect(Date.parse(a.etaLatestIso!) - depart).toBeGreaterThanOrEqual((110 + 11 * 60) * 60_000);
    expect(a.status).not.toBe("achievable");
  });
});
