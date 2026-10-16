import { describe, expect, it, vi } from "vitest";
import { planningRouter } from "./planningRouter";
import {
  FIXTURE_NOW,
  planningJob,
  planningTruck,
  syntheticOption,
} from "../domain/planning/fixtures";
import { dataset } from "../regulations/__tests__/helpers";
import type { MovementRequest } from "../domain/planning/types";
import type { ComplianceReport } from "../regulations/types";
import type { RoutingProvider } from "../solver/types";
import type { PlanRoutePlanningOpts } from "../tomtom/planRoutes";

const ds = dataset([], []),
  report: ComplianceReport = {
    status: "ROUTE_COMPLIANT",
    results: [],
    datasetId: ds.id,
    datasetVersion: ds.version,
    evaluatedAt: new Date(FIXTURE_NOW).toISOString(),
  };
const request = (): MovementRequest => ({
  job: planningJob("Router test", [40, -8], [40.2, -8]),
  truck: planningTruck("Router truck"),
  kind: "LOADED",
  from: [40, -8],
  to: [40.2, -8],
  departMs: FIXTURE_NOW,
  evaluate: () => report,
});
function provider(
  calls: { opts: PlanRoutePlanningOpts; strategy: string }[],
  fail = false,
) {
  return (
    _key: string,
    waypoints: { lat: number; lng: number }[],
    opts: PlanRoutePlanningOpts,
  ): RoutingProvider => ({
    name: "Synthetic primary provider",
    describe: () => ({
      ok: true,
      request: { kind: "avoid_rectangles", provider: "test", rectangles: [] },
    }),
    route: async (strategy) => {
      expect(opts.waypointStops).toHaveLength(waypoints.length - 1);
      calls.push({ opts, strategy });
      if (fail) throw new Error("Provider offline");
      return syntheticOption(
        {
          from: [waypoints[0].lat, waypoints[0].lng],
          to: [waypoints[1].lat, waypoints[1].lng],
          departMs: opts.departAt!.getTime(),
        },
        { id: strategy },
      );
    },
  });
}
describe("budgeted traffic/provider adapter", () => {
  it("reuses exact geometry/departure/profile requests across driver comparisons and later runs", async () => {
    const calls: { opts: PlanRoutePlanningOpts; strategy: string }[] = [],
      r = request(),
      router = planningRouter("synthetic-cache-case", ds, 64, provider(calls));
    await router.route(r);
    await router.route(r);
    expect(calls).toHaveLength(2);
    expect(router.stats).toMatchObject({ externalRequests: 2, cacheHits: 2 });
    const other = planningRouter(
      "synthetic-cache-case",
      ds,
      64,
      provider(calls),
    );
    await other.route(r);
    expect(calls).toHaveLength(2);
    expect(other.stats.externalRequests).toBe(0);
  });
  it("does not reuse a route for a different departure or load, and labels EMPTY as zero cargo", async () => {
    const calls: { opts: PlanRoutePlanningOpts; strategy: string }[] = [],
      r = request(),
      router = planningRouter(
        "synthetic-departure-load",
        ds,
        64,
        provider(calls),
      );
    await router.route(r);
    await router.route({ ...r, departMs: r.departMs + 3600000 });
    await router.route({ ...r, kind: "EMPTY" });
    expect(calls).toHaveLength(6);
    expect(calls.slice(-2).every((c) => c.opts.truck.cargoWeightKg === 0)).toBe(
      true,
    );
    expect(calls[0].opts.truck.cargoWeightKg).toBe(r.job.totalWeightKg);
  });
  it("honours the external-call cap even when the domain explores additional combinations", async () => {
    const calls: { opts: PlanRoutePlanningOpts; strategy: string }[] = [],
      r = request(),
      router = planningRouter("synthetic-budget", ds, 3, provider(calls));
    await router.route(r);
    await router.route({ ...r, departMs: r.departMs + 1000 });
    await expect(
      router.route({ ...r, departMs: r.departMs + 2000 }),
    ).rejects.toThrow("Limite de pedidos externos");
    expect(calls).toHaveLength(3);
    expect(router.stats.externalRequests).toBe(3);
  });
  it("rejects missing configuration and retries failed cached requests without inventing geometry", async () => {
    const calls: { opts: PlanRoutePlanningOpts; strategy: string }[] = [],
      r = request();
    await expect(
      planningRouter("", ds, 4, provider(calls)).route(r),
    ).rejects.toThrow("não configurado");
    expect(calls).toHaveLength(0);
    const router = planningRouter(
      "synthetic-offline",
      ds,
      4,
      provider(calls, true),
    );
    await expect(router.route(r)).rejects.toThrow("offline");
    await expect(router.route(r)).rejects.toThrow("offline");
    expect(calls).toHaveLength(4);
  });
  it("re-evaluates cached provider geometry against the current legal evaluator", async () => {
    const calls: { opts: PlanRoutePlanningOpts; strategy: string }[] = [],
      r = request(),
      router = planningRouter("synthetic-reevaluate", ds, 4, provider(calls));
    const evaluate = vi.fn(() => report);
    await router.route({ ...r, evaluate });
    await router.route({ ...r, evaluate });
    expect(evaluate).toHaveBeenCalledTimes(4);
    expect(calls).toHaveLength(2);
  });
});
