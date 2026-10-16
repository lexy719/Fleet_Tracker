import { describe, it, expect } from "vitest";
import { syntheticOption, FIXTURE_NOW } from "../../planning/fixtures";
import {
  dataset,
  closure,
  geometry,
  ROAD_A,
  ROAD_B,
} from "../../../regulations/__tests__/helpers";
import { operationalRouteAlternatives } from "../routeAlternatives";
import {
  buildRouteTiming,
  DEFAULT_TIMING_MODEL,
} from "../../../regulations/timeline";
import { planOperationalStops, type StopPlanningInput } from "../stopPlanning";
import { calculated, unknown, assumed } from "../values";

const option = () =>
  syntheticOption(
    { from: ROAD_A[0], to: ROAD_A[1], departMs: FIXTURE_NOW },
    { routing: { role: "primary", params: { routeType: "fastest" } } },
  );
const context = () => ({
  timingModel: DEFAULT_TIMING_MODEL,
  departMs: FIXTURE_NOW,
  driverKnown: true,
  dataset: dataset([], []),
  facts: {},
  stops: [],
  nowMs: FIXTURE_NOW,
});
describe("operational route alternatives", () => {
  it("preserves only actual alternatives with domain intent", () => {
    const a = option(),
      b = {
        ...option(),
        id: "eco",
        routing: { role: "alternative" as const, params: { routeType: "eco" } },
      },
      c = {
        ...option(),
        id: "free",
        routing: {
          role: "toll_avoiding" as const,
          params: { avoid: "tollRoads" },
        },
      };
    const result = operationalRouteAlternatives([a, b, c], context());
    expect(result.map((r) => r.intent)).toEqual([
      "fastest",
      "fuel_efficient",
      "no_tolls",
    ]);
    expect(result.every((r) => r.feasibility === "PASS")).toBe(true);
    expect(operationalRouteAlternatives([], context())).toEqual([]);
  });
  it("missing geometry and provenance remain unknown rather than simulated facts", () => {
    const a = option();
    a.polyline = [];
    delete a.routing;
    const r = operationalRouteAlternatives([a], context())[0];
    expect(r.feasibility).toBe("UNKNOWN");
    expect(r.geometry.status).toBe("UNKNOWN");
    expect(r.distanceM.status).toBe("ASSUMED");
    expect(r.timing).toBeNull();
  });
  it("stale departure and provider failure are explicit", () => {
    const a = option();
    a.departAtIso = new Date(FIXTURE_NOW - 1).toISOString();
    a.error = "provider unavailable";
    const r = operationalRouteAlternatives([a], context())[0];
    expect(r.feasibility).toBe("FAIL");
    expect(r.infeasibilityReasons).toEqual([
      "PROVIDER_ERROR",
      "STALE_PROVIDER_DEPARTURE",
    ]);
  });
  it("mandatory restriction leaves no clean route; unrelated restriction does not apply", () => {
    const ctx = context();
    ctx.dataset = dataset(
      [closure("r", "a", {}), closure("unrelated", "b", {})],
      [geometry("a", ROAD_A), geometry("b", ROAD_B)],
    );
    const r = operationalRouteAlternatives([option()], ctx)[0];
    expect(r.feasibility).toBe("FAIL");
    expect(
      r.restrictions!.results.find((x) => x.regulationId === "unrelated")!
        .outcome,
    ).toBe("DOES_NOT_APPLY");
  });
  it("missing axle fact causes UNKNOWN rather than allowed", () => {
    const ctx = context();
    ctx.dataset = dataset(
      [
        closure(
          "r",
          "a",
          {},
          {
            appliesTo: {
              kind: "fact",
              fact: "vehicle.firstAxleHeightM",
              label: "first axle height",
              op: "gte",
              value: 1.3,
              evidence: [],
            },
          },
        ),
      ],
      [geometry("a", ROAD_A)],
    );
    const r = operationalRouteAlternatives([option()], ctx)[0];
    expect(r.feasibility).toBe("UNKNOWN");
    expect(r.restrictions!.status).toBe("POTENTIALLY_AFFECTED");
  });
  it("unknown driver never yields PASS", () =>
    expect(
      operationalRouteAlternatives([option()], {
        ...context(),
        driverKnown: false,
      })[0].feasibility,
    ).toBe("UNKNOWN"));
  it.each(["estimated", "unpriced_sections"] as const)(
    "toll %s preserves uncertainty",
    (quality) => {
      const a = option();
      a.tollDataQuality = quality;
      a.tollSectionCount = 1;
      a.tollCostEur = 8.2;
      expect(
        operationalRouteAlternatives([a], context())[0].tollEur.status,
      ).toBe(quality === "estimated" ? "ASSUMED" : "UNKNOWN");
    },
  );
  it("missing leg timing is declared assumed", () => {
    const a = option();
    a.legPointCounts = [];
    a.legDurationSec = [];
    expect(
      operationalRouteAlternatives([a], context())[0].unknownReasons,
    ).toContain("ROUTE_LEG_TIMING_ASSUMED");
  });
});

function stops(): StopPlanningInput {
  const timing = buildRouteTiming(
    ROAD_A,
    [2],
    [6 * 3600],
    FIXTURE_NOW,
    DEFAULT_TIMING_MODEL,
  );
  return {
    timing,
    routePoints: ROAD_A,
    progress: calculated(0),
    driverKnown: true,
    rangeM: calculated(100000),
    routeDistanceM: 2000,
    deliveryClosingMs: timing.arrivalLatestMs + 3600_000,
    candidates: [
      {
        id: "F-07",
        routePosition: 0.5,
        detourOutSec: 300,
        detourReturnSec: 300,
        detourM: 4000,
        detourOutM: 2000,
        serviceSec: 0,
        compatible: "PASS",
      },
    ],
  };
}
describe("explainable stop planning", () => {
  it("an early pause on a short route adds its full duration to the delivery calculation", () => {
    const s = stops();
    s.timing = buildRouteTiming(
      ROAD_A,
      [2],
      [3600],
      FIXTURE_NOW,
      DEFAULT_TIMING_MODEL,
    );
    s.deliveryClosingMs = s.timing.arrivalLatestMs + 40 * 60000;
    s.candidates[0].detourOutSec = 0;
    s.candidates[0].detourReturnSec = 0;
    expect(
      planOperationalStops(s).candidates[0].reasons.map((r) => r.code),
    ).toContain("DELIVERY_WINDOW_MISSED");
  });
  it("active service is additional time, not qualifying rest", () => {
    const s = stops();
    const before = planOperationalStops(s).candidates[0].deliveryMarginSec!;
    s.candidates[0].serviceSec = 600;
    expect(planOperationalStops(s).candidates[0].deliveryMarginSec).toBe(
      before - 600,
    );
  });
  it("explains legal reachability, detour, window and compatibility", () => {
    const p = planOperationalStops(stops());
    expect(p.recommendedId).toBe("F-07");
    expect(p.candidates[0].reasons.map((r) => r.code)).toEqual(
      expect.arrayContaining([
        "VEHICLE_COMPATIBLE",
        "REACHABLE_BEFORE_LEGAL_STOP",
        "DELIVERY_WINDOW_PRESERVED",
        "FUEL_RANGE_SUFFICIENT",
        "DETOUR_METRES",
      ]),
    );
  });
  it.each([
    "unknownRange",
    "assumedRange",
    "unknownProgress",
    "unknownDriver",
    "compatibility",
    "window",
    "geometry",
  ])("cannot recommend with %s", (kind) => {
    const s = stops();
    if (kind === "unknownRange") s.rangeM = unknown("missing fuel");
    if (kind === "assumedRange") s.rangeM = assumed(10000, "guess");
    if (kind === "unknownProgress") s.progress = unknown("missing GPS");
    if (kind === "unknownDriver") s.driverKnown = false;
    if (kind === "compatibility") s.candidates[0].compatible = "UNKNOWN";
    if (kind === "window") delete s.deliveryClosingMs;
    if (kind === "geometry") s.routePoints = [];
    const p = planOperationalStops(s);
    expect(p.recommendedId).toBeNull();
    expect(p.candidates[0].eligibility).toBe("UNKNOWN");
  });
  it.each(["past", "detour", "range", "missedWindow", "incompatible"])(
    "rejects %s candidate",
    (kind) => {
      const s = stops();
      if (kind === "past") s.progress = calculated(0.6);
      if (kind === "detour") s.candidates[0].detourOutSec = 2 * 3600;
      if (kind === "range") s.rangeM = calculated(100);
      if (kind === "missedWindow")
        s.deliveryClosingMs = s.timing.arrivalLatestMs;
      if (kind === "incompatible") s.candidates[0].compatible = "FAIL";
      const p = planOperationalStops(s);
      expect(p.recommendedId).toBeNull();
      expect(p.candidates[0].eligibility).toBe("FAIL");
    },
  );
  it("exact legal boundary is reachable but one second later is not", () => {
    const s = stops();
    s.candidates[0].routePosition = 0.75;
    s.candidates[0].detourOutSec = 0;
    expect(planOperationalStops(s).candidates[0].legalMarginSec).toBe(0);
    s.candidates[0].detourOutSec = 1;
    expect(planOperationalStops(s).candidates[0].eligibility).toBe("FAIL");
  });
  it("short routes still validate the next legal threshold with detour", () => {
    const s = stops();
    s.timing = buildRouteTiming(ROAD_A, [2], [3600], FIXTURE_NOW, {
      ...DEFAULT_TIMING_MODEL,
      driver: { drivenTodaySec: 4 * 3600, continuousSec: 4 * 3600 },
    });
    s.candidates[0].routePosition = 0.5;
    s.candidates[0].detourOutSec = 1;
    expect(
      planOperationalStops(s).candidates[0].reasons.map((r) => r.code),
    ).toContain("LEGAL_STOP_LIMIT_MISSED");
  });
});
