import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../__fixtures__/tomtomLeixoesEspinho.json";
import { planRouteOptions, type RoutePlanOption } from "../../tomtom/planRoutes";
import { getTruckPreset } from "../../tomtom/truckPresets";
import { reviewAlternatives, verdictFor } from "../alternatives";
import { evaluateCompliance } from "../evaluate";
import type { ComplianceReport } from "../types";
import { at, closure, dataset, geometry, input, period, ROAD_A, ROAD_B, routeAlong } from "./helpers";

type FR = { lengthInMeters: number; travelTimeInSeconds: number; legs: { travelTimeInSeconds: number; points: number[][] }[] };

function opt(id: string, points: [number, number][], routing?: RoutePlanOption["routing"], distanceM = 2500): RoutePlanOption {
  return {
    id, title: id, subtitle: "", polyline: points, distanceM, durationSec: 150, trafficDelaySec: 0, fuelCostEur: 0, tollCostEur: 0,
    tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none", tollSectionCount: 0, stopArrivals: [], legDurationSec: [150],
    legPointCounts: [points.length], roadNumbers: [], colorIndex: 0, routing,
  };
}
const fromFixture = (id: string, r: FR, routing?: RoutePlanOption["routing"]) =>
  opt(id, r.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number])), routing, r.lengthInMeters);

const NATIVE = { role: "alternative" as const, params: {} };
const AVOID = { role: "primary" as const, params: {}, avoidAreas: [{ south: 0, west: 0, north: 1, east: 1 }] };

const NOON = at("2026-10-01T12:00:00+01:00");
const ACTIVE = [period("2026-10-01T00:00", "2026-10-02T00:00")];
const DS = dataset(
  [closure("closure-a", "road-a", { activePeriods: ACTIVE }), closure("closure-b", "road-b", { activePeriods: ACTIVE })],
  [geometry("road-a", ROAD_A), geometry("road-b", ROAD_B)],
);
const reportFor = (o: RoutePlanOption): ComplianceReport =>
  evaluateCompliance(DS, input({ points: o.polyline, pointTimesMs: o.polyline.map((_, i) => Date.parse(NOON) + i * 10_000), timesAreEstimates: true }), { timeToleranceMin: 0, sampleStepMin: 5 });

describe("verdicts are never green unless the engine said ROUTE_COMPLIANT", () => {
  it.each<[ComplianceReport["status"] | undefined, string]>([
    ["ROUTE_COMPLIANT", "compliant"],
    ["ROUTE_AFFECTED", "rejected"],
    ["POTENTIALLY_AFFECTED", "uncertain"],
    ["EVALUATION_ERROR", "error"],
    [undefined, "not_evaluated"],
  ])("%s ⇒ %s", (status, v) => {
    expect(verdictFor(status ? ({ status } as ComplianceReport) : undefined)).toBe(v);
  });
});

describe("reviewing candidates", () => {
  const original = opt("orig", routeAlong(ROAD_A, NOON).points);
  const onB = opt("alt-b", routeAlong(ROAD_B, NOON).points, NATIVE);
  const clear = opt("clear", routeAlong([[41.2, -8.62], [41.2, -8.6]], NOON).points, NATIVE);

  it("alternative that hits a SECOND constraint is rejected", () => {
    const r = reviewAlternatives(original, [onB], { "alt-b": reportFor(onB) });
    expect(r[0]!.verdict).toBe("rejected");
  });
  it("alternative whose evaluation is UNKNOWN is 'uncertain', not compliant", () => {
    const unk = { ...reportFor(clear), status: "POTENTIALLY_AFFECTED" as const };
    expect(reviewAlternatives(original, [clear], { clear: unk })[0]!.verdict).toBe("uncertain");
  });
  it("provider returning the original again is flagged sameAsOriginal", () => {
    const again = opt("again", original.polyline, AVOID);
    expect(reviewAlternatives(original, [again], { again: reportFor(again) })[0]!.sameAsOriginal).toBe(true);
  });
  it("native alternative duplicating the avoidAreas route ⇒ one candidate, merged provenance", () => {
    const a = fromFixture("native", fixture.avoidAreas as FR, NATIVE);
    const b = fromFixture("avoid", fixture.avoidAreas as FR, AVOID);
    const r = reviewAlternatives(opt("o", routeAlong(ROAD_A, NOON).points), [a, b], { native: reportFor(a), avoid: reportFor(b) });
    expect(r).toHaveLength(1);
    expect(r[0]!.provenance).toEqual(["Alternativa nativa TomTom", "TomTom avoidAreas (1 retângulos)"]);
  });
  it("same length on a different road is NOT merged", () => {
    const a = opt("a", routeAlong([[41.3, -8.62], [41.3, -8.6]], NOON).points, NATIVE);
    const b = opt("b", routeAlong([[41.301, -8.62], [41.301, -8.6]], NOON).points, AVOID); // ≈110 m apart
    expect(reviewAlternatives(original, [a, b], {})).toHaveLength(2);
  });
  it("candidate without geometry or with error is 'not_evaluated'", () => {
    const empty = { ...opt("e", []), error: "TomTom 500" };
    expect(reviewAlternatives(original, [empty], {})[0]!.verdict).toBe("not_evaluated");
  });
  it("no candidates ⇒ empty list (UI shows 'no verified compliant alternative')", () => {
    expect(reviewAlternatives(original, [original], {})).toEqual([]);
  });
});

describe("provider failures never produce a usable (let alone compliant) route", () => {
  const planning = {
    waypointStops: [{ id: "s2", name: "B" }],
    truck: { fleetTruckId: "t1", cargoWeightKg: 10_000, preset: getTruckPreset("artic-40") },
    departAt: new Date("2026-10-01T11:00:00Z"),
  };
  const wps = [{ lat: 41, lng: -8.62 }, { lat: 41, lng: -8.6 }];
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["HTTP 500", () => Promise.resolve(new Response("boom", { status: 500 }))],
    ["malformed JSON body", () => Promise.resolve(new Response("{not json", { status: 200 }))],
    ["empty routes", () => Promise.resolve(new Response(JSON.stringify({ routes: [] }), { status: 200 }))],
  ])("%s", async (_l, impl) => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("fetch", vi.fn(impl));
    let out: RoutePlanOption[] = [];
    try {
      out = await planRouteOptions("k", wps, planning);
    } catch {
      out = [];
    }
    const usable = out.filter((o) => !o.error && o.polyline.length > 1);
    expect(usable).toEqual([]);
  });

  it("route without geometry ⇒ not offered as a usable route at all (and could never be compliant)", async () => {
    vi.stubGlobal("window", globalThis);
    const body = { routes: [{ summary: { lengthInMeters: 2000, travelTimeInSeconds: 150 }, legs: [{ summary: { travelTimeInSeconds: 150 }, points: [] }] }] };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))));
    const out = await planRouteOptions("k", wps, planning);
    expect(out.filter((o) => !o.error && o.polyline.length > 1)).toEqual([]);
    // And if such a route were ever evaluated, it would not be green:
    const t0 = Date.parse(NOON);
    const rep = evaluateCompliance(DS, input({ points: [], pointTimesMs: [], timesAreEstimates: true, tripWindowMs: [t0, t0 + 150_000] }));
    expect(rep.status).not.toBe("ROUTE_COMPLIANT");
  });
});
