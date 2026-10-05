import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/tomtomLeixoesEspinho.json";
import { demoJobs as jobs, demoTrucks as trucks } from "../data/mockData";
import type { RoutePlanOption } from "../tomtom/planRoutes";
import {
  avoidancePlan,
  MAX_AVOID_RECTANGLES,
  officialAlternativesFollowed,
  rejectionReasons,
  toPersistedRoute,
  verdictFor,
} from "./alternatives";
import { evaluateCompliance } from "./evaluate";
import { buildRouteStops, buildTransportFacts } from "./fleetFacts";
import { estimatePointTimes, matchRouteAlongLines, pointInBBox } from "./geometry";
import { VCI_RING_LINES } from "./portugal/geometry/vciPortoRing";
import { REGULATION_DATASET } from "./repository";
import type { ComplianceReport, EvaluationInput } from "./types";

type FixtureRoute = { lengthInMeters: number; travelTimeInSeconds: number; legs: { travelTimeInSeconds: number; points: number[][] }[] };
const ORIGINAL = fixture.original as FixtureRoute;
const AVOIDING = fixture.avoidAreas as FixtureRoute;
const WED_10H = "2026-10-07T09:00:00Z";
const VCI_ID = "pt-dl155a2026-vci-pesados";

const pointsOf = (r: FixtureRoute) => r.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number]));

function asOption(r: FixtureRoute, id: string, routing?: RoutePlanOption["routing"]): RoutePlanOption {
  return {
    id,
    title: id,
    subtitle: "",
    polyline: pointsOf(r),
    distanceM: r.lengthInMeters,
    durationSec: r.travelTimeInSeconds,
    trafficDelaySec: 0,
    fuelCostEur: 0,
    tollCostEur: 0,
    tollPricedEur: 0,
    tollEstimatedEur: 0,
    tollDataQuality: "none",
    tollSectionCount: 0,
    stopArrivals: [],
    legDurationSec: r.legs.map((l) => l.travelTimeInSeconds),
    legPointCounts: r.legs.map((l) => l.points.length),
    roadNumbers: [],
    departAtIso: WED_10H,
    colorIndex: 0,
    routing,
  };
}

/* Demo transport — explicit DEMO records from mockData (not inferred). */
const demoTruck = trucks.find((t) => t.id === "t-demo-vci")!;
const demoJob = jobs.find((j) => j.id === "J-DEMO-VCI")!;

function evaluateDemo(r: FixtureRoute): ComplianceReport {
  const points = pointsOf(r);
  const input: EvaluationInput = {
    route: {
      points,
      pointTimesMs: estimatePointTimes(points, r.legs.map((l) => l.points.length), r.legs.map((l) => l.travelTimeInSeconds), Date.parse(WED_10H)),
      timesAreEstimates: true,
    },
    stops: buildRouteStops(demoJob, REGULATION_DATASET.areas),
    facts: buildTransportFacts(demoTruck, demoJob),
  };
  return evaluateCompliance(REGULATION_DATASET, input);
}

describe("demo transport records", () => {
  it("are explicitly labelled demo data", () => {
    expect(demoTruck.isDemo).toBe(true);
    expect(demoJob.isDemo).toBe(true);
  });

  it("produce known facts only from recorded values", () => {
    const facts = buildTransportFacts(demoTruck, demoJob);
    expect(facts["vehicle.axleCount"]).toMatchObject({ status: "known", value: 5 });
    expect(facts["vehicle.firstAxleHeightM"]).toMatchObject({ status: "known", value: 1.35 });
    expect(facts["authorization.pt-vci-habilitacao"]).toMatchObject({ status: "known", value: false });
    expect((facts["vehicle.axleCount"] as { source: string }).source).toMatch(/DEMO/);
  });

  it("stop municipalities come from recorded attributes; unrecorded stays unknown", () => {
    const stops = buildRouteStops(demoJob, REGULATION_DATASET.areas);
    expect(stops[0]!.areas!["pt-municipio-porto"]).toMatchObject({ status: "known", value: false });
    // A job without recorded stop municipalities (seed records are all labelled demo since Phase 5).
    const other = { ...jobs.find((j) => j.id === "J-4201")!, isDemo: undefined };
    expect(buildRouteStops(other, REGULATION_DATASET.areas)[0]!.areas).toEqual({});
  });

  it("a real (non-demo) truck without recorded attributes stays UNKNOWN", () => {
    const facts = buildTransportFacts(trucks.find((t) => t.id === "t1")!, demoJob);
    expect(facts["vehicle.axleCount"]!.status).toBe("unknown");
    expect(facts["vehicle.firstAxleHeightM"]!.status).toBe("unknown");
  });
});

describe("end-to-end on real TomTom geometry with the demo transport", () => {
  const original = evaluateDemo(ORIGINAL);
  const avoiding = evaluateDemo(AVOIDING);

  it("original route ⇒ ROUTE_AFFECTED (rejected) with reasons", () => {
    expect(original.status).toBe("ROUTE_AFFECTED");
    expect(verdictFor(original)).toBe("rejected");
    expect(rejectionReasons(original).join("\n")).toMatch(/VCI/);
  });

  it("avoidAreas route ⇒ ROUTE_COMPLIANT (compliant) and follows the official CREP corridor", () => {
    expect(avoiding.status).toBe("ROUTE_COMPLIANT");
    expect(verdictFor(avoiding)).toBe("compliant");
    const via = officialAlternativesFollowed(pointsOf(AVOIDING), [VCI_ID], REGULATION_DATASET);
    expect(via[0]).toMatchObject({ id: "crep-a41-ic24" });
    expect(via[0]!.matchedKm).toBeGreaterThan(10);
    expect(officialAlternativesFollowed(pointsOf(ORIGINAL), [VCI_ID], REGULATION_DATASET)).toEqual([]);
  });

  it("an uncertain report is never labelled compliant", () => {
    const uncertain: ComplianceReport = { ...avoiding, status: "POTENTIALLY_AFFECTED" };
    expect(verdictFor(uncertain)).toBe("uncertain");
  });
});

describe("avoidancePlan", () => {
  const original = evaluateDemo(ORIGINAL);

  it("covers every point of the affected geometry with ≤ 10 rectangles", () => {
    const plan = avoidancePlan(original, REGULATION_DATASET)!;
    expect(plan.derivedFrom).toEqual([VCI_ID]);
    expect(plan.rectangles.length).toBeGreaterThan(0);
    expect(plan.rectangles.length).toBeLessThanOrEqual(MAX_AVOID_RECTANGLES);
    for (const p of VCI_RING_LINES.flat()) expect(plan.rectangles.some((b) => pointInBBox(p, b))).toBe(true);
  });

  it("is null when nothing APPLIES", () => {
    expect(avoidancePlan(evaluateDemo(AVOIDING), REGULATION_DATASET)).toBeNull();
  });
});

describe("corridor matcher", () => {
  const opts = { toleranceM: 30, minMatchLengthM: 200, maxHeadingDiffDeg: 30 };
  const line: [number, number][][] = [[[41.0, -8.62], [41.0, -8.6]]]; // ~1.7 km east–west

  it("matches a route running along the line", () => {
    expect(matchRouteAlongLines([[41.0, -8.625], [41.0, -8.595]], line, opts).runs.length).toBe(1);
  });

  it("ignores a perpendicular crossing (over/underpass)", () => {
    expect(matchRouteAlongLines([[40.99, -8.61], [41.01, -8.61]], line, opts).runs.length).toBe(0);
  });

  it("ignores a parallel road 80 m away", () => {
    const off = 80 / 111_320;
    expect(matchRouteAlongLines([[41.0 + off, -8.625], [41.0 + off, -8.595]], line, opts).runs.length).toBe(0);
  });
});

describe("persisted route", () => {
  it("keeps simplified geometry partitioned by legs and records the routing method", () => {
    const opt = asOption(AVOIDING, "avoid-0", {
      role: "primary",
      params: { travelMode: "truck", departAt: WED_10H },
      avoidAreas: [{ south: 41.1, west: -8.7, north: 41.2, east: -8.6 }],
    });
    const plan = { rectangles: opt.routing!.avoidAreas!, derivedFrom: [VCI_ID] };
    const pr = toPersistedRoute(opt, "Alternativa", WED_10H, [], plan);
    expect(pr.polyline.length).toBeLessThan(opt.polyline.length);
    expect(pr.legPointCounts.reduce((a, b) => a + b, 0)).toBe(pr.polyline.length);
    expect(pr.method).toMatchObject({ kind: "provider_avoid_areas", derivedFrom: [VCI_ID] });
  });

  it("re-evaluating the persisted (simplified) original still gives ROUTE_AFFECTED", () => {
    const pr = toPersistedRoute(asOption(ORIGINAL, "route-0", { role: "primary", params: {} }), "Original", WED_10H, []);
    const report = evaluateCompliance(REGULATION_DATASET, {
      route: {
        points: pr.polyline,
        pointTimesMs: estimatePointTimes(pr.polyline, pr.legPointCounts, pr.legDurationSec, Date.parse(pr.departAtIso)),
        timesAreEstimates: true,
      },
      stops: buildRouteStops(demoJob, REGULATION_DATASET.areas),
      facts: buildTransportFacts(demoTruck, demoJob),
    });
    expect(report.status).toBe("ROUTE_AFFECTED");
  });
});
