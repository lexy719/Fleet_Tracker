import { describe, expect, it } from "vitest";
import fixture from "../__fixtures__/tomtomLeixoesEspinho.json";
import { evaluateCompliance, evaluateRegulation } from "../evaluate";
import { estimatePointTimes, routeExposure, routesEquivalent } from "../geometry";
import { REGULATION_DATASET } from "../repository";
import type { GeometryRecord, RouteGeometryInput } from "../types";
import { at, closure, dataset, geometry, input, period, ROAD_A, routeAlong } from "./helpers";

const M_PER_DEG_LAT = 111_320;
const ACTIVE = [period("2026-10-01T00:00", "2026-10-02T00:00")];
const NOON = at("2026-10-01T12:00:00+01:00");

function evalOn(route: RouteGeometryInput, geom: GeometryRecord = geometry("road-a", ROAD_A)) {
  const reg = closure("c", geom.id, { activePeriods: ACTIVE });
  return evaluateCompliance(dataset([reg], [geom]), input(route), { timeToleranceMin: 0, sampleStepMin: 5 });
}

/** Same route shape, shifted north by `m` metres. */
function shifted(route: RouteGeometryInput, m: number): RouteGeometryInput {
  const d = m / M_PER_DEG_LAT;
  return { ...route, points: route.points.map((p) => [p[0] + d, p[1]] as [number, number]) };
}

function timed(points: [number, number][], startIso = NOON, secPerPoint = 20): RouteGeometryInput {
  const t0 = Date.parse(startIso);
  return { points, pointTimesMs: points.map((_, i) => t0 + i * secPerPoint * 1000), timesAreEstimates: true };
}

describe("intersection", () => {
  it("route along the segment ⇒ ROUTE_AFFECTED", () => {
    expect(evalOn(routeAlong(ROAD_A, NOON)).status).toBe("ROUTE_AFFECTED");
  });
  it("tolerance boundary: 25 m offset matches, 40 m does not (tolerance 30 m)", () => {
    expect(evalOn(shifted(routeAlong(ROAD_A, NOON), 25)).status).toBe("ROUTE_AFFECTED");
    expect(evalOn(shifted(routeAlong(ROAD_A, NOON), 40)).status).toBe("ROUTE_COMPLIANT");
  });
  it("parallel road 80 m away ⇒ not affected", () => {
    expect(evalOn(shifted(routeAlong(ROAD_A, NOON), 80)).status).toBe("ROUTE_COMPLIANT");
  });
  it("perpendicular crossing (over/underpass) ⇒ not affected", () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 20; i++) pts.push([40.99 + i * 0.001, -8.61]);
    expect(evalOn(timed(pts)).status).toBe("ROUTE_COMPLIANT");
  });
  it("touching the segment for < 200 m ⇒ not affected", () => {
    // Realistic spacing (≤ 250 m): approach from the south, ~130 m along the road, leave south.
    const pts: [number, number][] = [
      [40.99, -8.62], [40.992, -8.6199], [40.994, -8.6198], [40.996, -8.6197], [40.998, -8.6196],
      [41.0, -8.6195], [41.0, -8.618],
      [40.998, -8.6179], [40.996, -8.6178], [40.994, -8.6177], [40.992, -8.6176], [40.99, -8.6175],
    ];
    expect(evalOn(timed(pts)).status).toBe("ROUTE_COMPLIANT");
  });
  it("route starting inside the segment ⇒ affected", () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 20; i++) pts.push([41.0, -8.61 + i * 0.001]);
    expect(evalOn(timed(pts)).status).toBe("ROUTE_AFFECTED");
  });
  it("route ending inside the segment ⇒ affected", () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 20; i++) pts.push([41.0, -8.64 + i * 0.0015]);
    expect(evalOn(timed(pts)).status).toBe("ROUTE_AFFECTED");
  });
  it("entering and leaving twice ⇒ two runs, both evaluated", () => {
    const pts: [number, number][] = [
      [41.0, -8.625], [41.0, -8.621], [41.0, -8.617], [41.0, -8.613], // along (≈1 km)
      [41.01, -8.613], [41.01, -8.609], // detour north
      [41.0, -8.609], [41.0, -8.605], [41.0, -8.601], // back along
    ];
    const g = geometry("road-a", ROAD_A);
    const exp = routeExposure(timed(pts), g);
    expect(exp.kind).toBe("exact");
    expect(exp.kind === "exact" && exp.runs.length).toBe(2);
  });
});

describe("direction", () => {
  it("directional constraint: opposite-direction travel is not affected", () => {
    const g = geometry("road-a", ROAD_A, { directional: true });
    expect(evalOn(routeAlong(ROAD_A, NOON), g).status).toBe("ROUTE_AFFECTED");
    expect(evalOn(routeAlong(ROAD_A, NOON, 60, true), g).status).toBe("ROUTE_COMPLIANT");
  });
  it("non-directional constraint: both directions affected", () => {
    expect(evalOn(routeAlong(ROAD_A, NOON, 60, true)).status).toBe("ROUTE_AFFECTED");
  });
});

describe("coarse, missing or malformed route geometry never reads as 'not affected'", () => {
  it("very sparse route near the constraint ⇒ UNKNOWN (cannot rule out)", () => {
    // Two points 3.5 km apart crossing the area diagonally: no match, but too coarse to trust.
    const r = evalOn(timed([[40.985, -8.625], [41.015, -8.6]]));
    expect(r.status).toBe("POTENTIALLY_AFFECTED");
    expect(r.results[0]!.reasons.map((x) => x.text).join(" ")).toMatch(/demasiado esparsa/);
  });
  it("sparse route FAR from the constraint is still a clean miss", () => {
    expect(evalOn(timed([[40.5, -8.9], [40.6, -8.8]])).status).toBe("ROUTE_COMPLIANT");
  });
  it("missing polyline ⇒ UNKNOWN while active", () => {
    const t0 = Date.parse(NOON);
    expect(evalOn({ points: [], pointTimesMs: [], timesAreEstimates: true, tripWindowMs: [t0, t0 + 3_600_000] }).status).toBe("POTENTIALLY_AFFECTED");
  });
  it("missing polyline and no trip window ⇒ UNKNOWN", () => {
    expect(evalOn({ points: [], pointTimesMs: [], timesAreEstimates: true }).status).toBe("POTENTIALLY_AFFECTED");
  });
  it.each([
    ["NaN coordinate", { points: [[41, -8.62], [Number.NaN, -8.6]] as [number, number][], pointTimesMs: [0, 1] }],
    ["out-of-range latitude", { points: [[41, -8.62], [95, -8.6]] as [number, number][], pointTimesMs: [0, 1] }],
    ["times length mismatch", { points: [[41, -8.62], [41, -8.6]] as [number, number][], pointTimesMs: [0] }],
    ["decreasing times", { points: [[41, -8.62], [41, -8.6]] as [number, number][], pointTimesMs: [10, 0] }],
    ["NaN time", { points: [[41, -8.62], [41, -8.6]] as [number, number][], pointTimesMs: [0, Number.NaN] }],
  ])("%s ⇒ EVALUATION_ERROR", (_l, bad) => {
    const r = evalOn({ ...bad, timesAreEstimates: true });
    expect(r.status).toBe("EVALUATION_ERROR");
    expect(r.results.every((x) => x.outcome === "UNKNOWN" && x.error)).toBe(true);
  });
});

describe("screening area stays negative-only", () => {
  const vci = REGULATION_DATASET.regulations[0]!;
  const unresolved: GeometryRecord = { ...REGULATION_DATASET.geometries.find((g) => g.id === vci.location.geometryId)!, status: "UNRESOLVED", resolved: undefined };
  const route = (() => {
    const pts = fixture.original.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number]));
    return { points: pts, pointTimesMs: estimatePointTimes(pts, fixture.original.legs.map((l) => l.points.length), fixture.original.legs.map((l) => l.travelTimeInSeconds), Date.parse("2026-10-07T09:00:00Z")), timesAreEstimates: true };
  })();
  it("route inside the screening area with UNRESOLVED geometry is never APPLIES", () => {
    const ds = { ...REGULATION_DATASET, geometries: REGULATION_DATASET.geometries.map((g) => (g.id === unresolved.id ? unresolved : g)) };
    const facts = { "vehicle.grossWeightKg": { status: "known", value: 40000, source: "t" }, "vehicle.axleCount": { status: "known", value: 5, source: "t" }, "vehicle.firstAxleHeightM": { status: "known", value: 1.4, source: "t" }, "vehicle.isGoodsVehicle": { status: "known", value: true, source: "t" }, "vehicle.ownerCategory": { status: "known", value: "private", source: "t" }, "authorization.pt-vci-habilitacao": { status: "known", value: false, source: "t" }, "authorization.pt-imt-aet": { status: "known", value: false, source: "t" } } as const;
    const r = evaluateRegulation(vci, ds, { route, stops: [], facts: facts as never });
    expect(r.outcome).toBe("UNKNOWN");
  });
});

describe("route equivalence (for de-duplication)", () => {
  const pts = fixture.original.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number]));
  const alt = fixture.avoidAreas.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number]));
  it("a route is equivalent to itself and to a 5 m-jittered copy", () => {
    expect(routesEquivalent(pts, pts)).toBe(true);
    const jitter = pts.map((p, i) => [p[0] + ((i % 2 ? 1 : -1) * 5) / M_PER_DEG_LAT, p[1]] as [number, number]);
    expect(routesEquivalent(pts, jitter)).toBe(true);
  });
  it("different real routes are not equivalent", () => {
    expect(routesEquivalent(pts, alt)).toBe(false);
  });
  it("same length on a parallel road 80 m away is NOT equivalent (no distance/time dedupe)", () => {
    const a = routeAlong(ROAD_A, NOON).points;
    const b = shifted(routeAlong(ROAD_A, NOON), 80).points;
    expect(routesEquivalent(a, b)).toBe(false);
  });
});
