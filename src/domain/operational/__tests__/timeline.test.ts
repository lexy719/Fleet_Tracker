import { describe, it, expect } from "vitest";
import { generated, confirmed } from "./fixtures";
import { buildExecutionTimeline } from "../executionTimeline";
import { instantMs } from "../values";
import {
  estimatePointTimes,
  matchRouteAlongLines,
} from "../../../regulations/geometry";
import {
  buildRouteTiming,
  DEFAULT_TIMING_MODEL,
  getPassageWindow,
} from "../../../regulations/timeline";
import { operationalTimeline } from "../../../regulations/operationalTimeline";
import { planStops } from "../../../ops/drivingStops";
import { evaluateCompliance } from "../../../regulations/evaluate";
import {
  closure,
  geometry,
  dataset,
  period,
  ROAD_A,
  ROAD_B,
} from "../../../regulations/__tests__/helpers";
import { routeTimingInput } from "../../../regulations/timeline";
import { routeGeometryHash } from "../../../regulations/decisionInputs";

describe("canonical execution replay", () => {
  it("a claimed known baseline without continuous driving evidence remains UNKNOWN", async () => {
    const { request, plan } = await generated();
    const e = plan.executions[0];
    delete e.drivingAtStart.continuousSec;
    delete e.movements[0].timingModel.driver.continuousSec;
    delete e.movements[0].drivingBefore.continuousSec;
    const t = buildExecutionTimeline(request.jobs[0], e);
    expect(t.legalDriving).toBe("UNKNOWN");
    expect(t.end.status).toBe("ASSUMED");
  });
  it("replays the planner including service without independent ETA totals", async () => {
    const { request, plan } = await generated();
    const t = buildExecutionTimeline(request.jobs[0], plan.executions[0]);
    expect(t.status).toBe("READY");
    expect(t.end).toMatchObject({ value: plan.executions[0].endMs });
    expect(t.activities.filter((a) => a.kind === "service")).toHaveLength(2);
    expect(t.driverAfter).toEqual(plan.executions[0].drivingAfter);
  });
  it("confirmation's loaded departure does not repeat pickup service", async () => {
    const { job, plan } = await confirmed();
    const t = buildExecutionTimeline(job, job.operationalPlan!.execution);
    expect(t.status).toBe("READY");
    expect(t.end).toMatchObject({ value: plan.executions[0].endMs });
  });
  it.each(["end", "geometry", "window", "service", "sequence"])(
    "rejects stale or invalid %s without a partial timeline",
    async (kind) => {
      const { request, plan } = await generated();
      const e = structuredClone(plan.executions[0]),
        j = structuredClone(request.jobs[0]);
      if (kind === "end") e.endMs += 1;
      if (kind === "geometry") e.movements[0].route.polyline = [];
      if (kind === "window") j.stops[0].windowStartAt = "2026-10-07T08:00:00";
      if (kind === "service")
        j.operationalRequirements!.serviceSecByStop![j.stops[0].id] = -1;
      if (kind === "sequence") j.stops[1].sequence = j.stops[0].sequence;
      const t = buildExecutionTimeline(j, e);
      expect(t.status).toBe("UNAVAILABLE");
      expect(t.activities).toEqual([]);
      expect(t.end.status).toBe("UNKNOWN");
    },
  );
  it("a missed delivery window is an explicit failure", async () => {
    const { request, plan } = await generated();
    request.jobs[0].stops[1].windowEndAt = new Date(
      plan.executions[0].startMs,
    ).toISOString();
    const t = buildExecutionTimeline(request.jobs[0], plan.executions[0]);
    expect(t.stops[1].window).toBe("FAIL");
    expect(t.issues.map((i) => i.code)).toContain("STOP_WINDOW_MISSED");
  });
  it("missing driver evidence never becomes legal PASS", async () => {
    const { request, plan } = await generated();
    const e = plan.executions[0];
    e.drivingAtStart.known = false;
    e.drivingAfter.known = false;
    const t = buildExecutionTimeline(request.jobs[0], e);
    expect(t.legalDriving).toBe("UNKNOWN");
    expect(t.status).toBe("REVIEW_REQUIRED");
    expect(t.end.status).toBe("ASSUMED");
  });
  it("unknown service remains explicit even when zero-service scheduling can be replayed", async () => {
    const r = (await generated()).request;
    r.jobs[0].operationalRequirements!.serviceSecByStop = {};
    const { request, plan } = await generated(r);
    const t = buildExecutionTimeline(request.jobs[0], plan.executions[0]);
    expect(t.status).toBe("REVIEW_REQUIRED");
    expect(t.stops[0].serviceDurationSec.status).toBe("UNKNOWN");
  });
});

describe("timing boundaries", () => {
  const points: [number, number][] = [
    [41, -8.62],
    [41, -8.6],
  ];
  it("temporal restriction uses fractional driving passage, not a smeared break", () => {
    const routePoints: [number, number][] = [ROAD_A[0], [41, -8.61], ROAD_A[1]];
    const g = geometry("g", [
      [41, -8.6075],
      [41, -8.6065],
    ]);
    g.resolved!.minMatchLengthM = 30;
    const ds = dataset(
      [
        closure("r", "g", {
          activePeriods: [period("2026-10-07T12:10", "2026-10-07T12:30")],
        }),
      ],
      [g],
    );
    const model = {
      ...DEFAULT_TIMING_MODEL,
      margin: { baseMin: 0, perDrivingHourMin: 0, maxMin: 0 },
      breakFlexMin: 0,
      restFlexMin: 0,
    };
    const route = routeTimingInput(
      routePoints,
      [3],
      [6 * 3600],
      Date.parse("2026-10-07T07:00:00Z"),
      model,
    );
    const report = evaluateCompliance(
      ds,
      { route, stops: [], facts: {} },
      { timeToleranceMin: 0, sampleStepMin: 1 },
    );
    expect(report.results[0].outcome).toBe("DOES_NOT_APPLY");
  });
  it("in-place geometry mutation changes both compliance index and decision hash", () => {
    const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => [
      41,
      -8.62 + (i * 0.02) / 9,
    ]);
    const ds = dataset([closure("r", "g", {})], [geometry("g", ROAD_A)]);
    const input = {
      route: {
        points: pts,
        pointTimesMs: pts.map(
          (_, i) => Date.parse("2026-10-07T07:00:00Z") + i * 1000,
        ),
        timesAreEstimates: true,
      },
      stops: [],
      facts: {},
    };
    const hash = routeGeometryHash(pts);
    expect(evaluateCompliance(ds, input).status).toBe("ROUTE_AFFECTED");
    pts.forEach((p) => (p[0] = ROAD_B[0][0]));
    expect(routeGeometryHash(pts)).not.toBe(hash);
    expect(evaluateCompliance(ds, input).status).toBe("ROUTE_COMPLIANT");
  });
  it("invalid geometry remains an error even with no restrictions loaded", () => {
    const route = routeTimingInput(
      [
        [NaN, 0],
        [41, -8],
      ],
      [2],
      [10],
      0,
      DEFAULT_TIMING_MODEL,
    );
    expect(
      evaluateCompliance(dataset([], []), { route, stops: [], facts: {} })
        .status,
    ).toBe("EVALUATION_ERROR");
  });
  it("does not smear a discrete break over sparse geometry", () => {
    const t = buildRouteTiming(points, [2], [6 * 3600], 0, {
      ...DEFAULT_TIMING_MODEL,
      margin: { baseMin: 0, perDrivingHourMin: 0, maxMin: 0 },
    });
    expect(getPassageWindow(t, 0.5, 0.5).expectedFromMs).toBe(3 * 3600_000);
    expect(getPassageWindow(t, 0.9, 0.9).expectedFromMs).toBe(
      (5.4 * 3600 + 2700) * 1000,
    );
    expect(getPassageWindow(t, 0.9, 0.5)).toEqual(
      getPassageWindow(t, 0.5, 0.9),
    );
  });
  it("interval uncertainty includes an interior daily rest", () => {
    const t = buildRouteTiming(points, [2], [16 * 3600], 0);
    const w = getPassageWindow(t, 0.5, 0.95);
    expect(w.maxShiftMs).toBeGreaterThanOrEqual(11 * 3600_000);
  });
  it("coincident points retain provider duration", () =>
    expect(estimatePointTimes([points[0], points[0]], [2], [60], 1000)).toEqual(
      [1000, 61000],
    ));
  it("single-point leg denotes arrival", () =>
    expect(estimatePointTimes([points[0]], [1], [60], 0)).toEqual([60000]));
  it("bad leg partitions fail explicitly", () =>
    expect(() => estimatePointTimes(points, [1], [60], 0)).toThrow());
  it("invalid sampling cannot loop forever", () =>
    expect(() =>
      matchRouteAlongLines(points, [points], {
        toleranceM: 30,
        minMatchLengthM: 200,
        maxHeadingDiffDeg: 30,
        sampleStepM: 0,
      }),
    ).toThrow());
  it("no geometry still preserves aggregate duration, but cannot locate passage", async () => {
    const { plan } = await generated();
    const route = { ...plan.executions[0].movements[0].route, polyline: [] };
    const t = operationalTimeline(route, 0);
    expect(t.arrivalMs).toBe(t.timing.arrivalMs);
    expect(t.routeInput.points).toEqual([]);
    expect(() => getPassageWindow(t.timing, 0, 1)).toThrow();
  });
  it.each([NaN, -1, Infinity])("invalid duration %s is rejected", (sec) =>
    expect(() => planStops(sec, { drivenTodaySec: 0 })).toThrow(),
  );
  it("an unsupported huge horizon never silently returns a partial stop plan", () =>
    expect(() => planStops(1e10, { drivenTodaySec: 0 })).toThrow());
  it.each(["2026-10-07T07:00:00Z", "2026-10-07T08:00:00+01:00"])(
    "accepts explicit instant %s",
    (s) => expect(instantMs(s)).toBe(Date.parse("2026-10-07T07:00:00Z")),
  );
  it.each(["08:00", "2026-10-07T08:00:00", "invalid"])(
    "rejects host-local time %s",
    (s) => expect(instantMs(s)).toBeNull(),
  );
});
