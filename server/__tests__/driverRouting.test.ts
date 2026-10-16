import { describe, it, expect } from "vitest";
import {
  solveDriverRoute,
  validateDriverRequest,
  type DriverRouteRequest,
} from "../driverRouting";
import {
  closure,
  geometry,
  dataset,
  period,
  ROAD_A,
  routeAlong,
} from "../../src/regulations/__tests__/helpers";
import { haversineM } from "../../src/regulations/geometry";
import { tomtomAvoidRequest } from "../../src/solver/tomtomProvider";
import type { RoutingProvider } from "../../src/solver/types";
import type { RoutePlanOption } from "../../src/tomtom/planRoutes";

const now = new Date("2026-10-12T12:00:00Z");
const direct = routeAlong(ROAD_A, now.toISOString()).points;
const detour = direct.map(
  ([lat, lng]) => [lat + 0.02, lng] as [number, number],
);
const request: DriverRouteRequest = {
  from: direct[0]!,
  stops: [{ at: direct.at(-1)!, label: "Destino", kind: "destination" }],
  lang: "pt",
  truck: { weightKg: 40000, heightM: 4, widthM: 2.55, lengthM: 16.5 },
};
function option(points: [number, number][], message: string): RoutePlanOption {
  return {
    id: message,
    title: message,
    subtitle: "",
    polyline: points,
    distanceM: points
      .slice(1)
      .reduce((s, p, i) => s + haversineM(points[i]!, p), 0),
    durationSec: 600,
    trafficDelaySec: 0,
    fuelCostEur: 0,
    tollCostEur: 0,
    tollPricedEur: 0,
    tollEstimatedEur: 0,
    tollDataQuality: "none",
    tollSectionCount: 0,
    stopArrivals: [],
    legDurationSec: [600],
    legPointCounts: [points.length],
    roadNumbers: [],
    departAtIso: now.toISOString(),
    colorIndex: 0,
    navigation: {
      instructions: [{ message, maneuver: "STRAIGHT", routeOffsetInMeters: 0 }],
      sections: [],
    },
  };
}
const ds = dataset(
  [
    closure("works-closure", "road", {
      activePeriods: [period("2026-10-12T00:00", "2026-10-13T00:00")],
    }),
  ],
  [geometry("road", ROAD_A)],
);

describe("driver uses Project 2 decisions", () => {
  it("avoids an applicable closure and returns the detour's exact geometry AND guidance", async () => {
    const requests: string[][] = [];
    const provider: RoutingProvider = {
      name: "test",
      describe: tomtomAvoidRequest,
      route: async (_strategy, avoid) => {
        requests.push(avoid.flatMap((a) => a.constraintIds));
        return avoid.length
          ? option(detour, "detour instruction")
          : option(direct, "direct instruction");
      },
    };
    const solved = await solveDriverRoute(request, provider, ds, now);
    expect(requests).toEqual([[], ["works-closure"]]);
    expect(solved.result.outcome).toBe("CLEANED");
    expect(solved.finalOption?.polyline).toEqual(detour);
    expect(solved.finalOption?.navigation?.instructions[0]?.message).toBe(
      "detour instruction",
    );
    expect(solved.result.final?.report.status).toBe("ROUTE_COMPLIANT");
  });
  it("does not return the baseline when the provider ignores the required detour", async () => {
    const provider: RoutingProvider = {
      name: "test",
      describe: tomtomAvoidRequest,
      route: async () => option(direct, "direct"),
    };
    const solved = await solveDriverRoute(request, provider, ds, now);
    expect(solved.finalOption).toBeNull();
    expect(solved.result.outcome).toBe("UNRESOLVED");
  });
  it("rejects malformed coordinates and excessive truck dimensions before provider calls", () => {
    expect(() =>
      validateDriverRequest({ ...request, from: [100, -8] }),
    ).toThrow();
    expect(() =>
      validateDriverRequest({
        ...request,
        truck: { ...request.truck, heightM: 99 },
      }),
    ).toThrow();
    expect(validateDriverRequest(request)).toEqual(request);
  });
});
