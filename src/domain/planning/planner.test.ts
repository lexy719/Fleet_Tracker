import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { planFleet } from "./planner";
import {
  fleetFixture,
  fixturePosition,
  FIXTURE_NOW,
  planningDriver,
  planningJob,
  planningTruck,
  singleJobFixture,
  syntheticOption,
  syntheticRouter,
} from "./fixtures";
import {
  comparePlans,
  operationallyDominates,
  overrideImpact,
  planMetrics,
} from "./economics";
import { confirmOperationalPlan } from "./confirmation";
import { initialFleetState, inventoryFingerprint, jobPhase } from "./state";
import { OperationsService } from "../../application/operations";
import {
  ConcurrencyError,
  IdbOperationalStore,
  MemoryOperationalStore,
} from "../../repositories/operationalStore";
import { assessPlannedJob } from "../../regulations/reevaluate";
import {
  closure,
  dataset,
  EV,
  geometry,
} from "../../regulations/__tests__/helpers";
import { acceptanceFixture } from "../routing/acceptanceFixtures";
import { decideRoutes, type DecisionCandidate } from "../routing/routeDecision";
import { transitionJob, promoteNextQueued } from "../jobs/lifecycle";
import type { Job } from "../../data/types";
import type { PlanningRequest, OperationalPlan } from "./types";

const emptyDataset = dataset([], []);
function small(): PlanningRequest {
  const r = singleJobFixture();
  r.dataset = emptyDataset;
  r.jobs = [planningJob("A", [40, -8], [40.2, -8])];
  r.initialState!.trucks![r.trucks[0].id].position = fixturePosition([40, -8]);
  r.initialState!.drivers![r.drivers[0].id].position = fixturePosition([
    40, -8,
  ]);
  r.search = {
    beamWidth: 8,
    extensionsPerState: 32,
    maxRouteRequests: 512,
    maxAlternatives: 4,
  };
  return r;
}
const must = (p: OperationalPlan | null) => {
  expect(p).not.toBeNull();
  return p!;
};
function confirm(r: PlanningRequest, p: OperationalPlan, now = FIXTURE_NOW) {
  const result = confirmOperationalPlan({
    ...r,
    selected: p,
    recommended: p,
    now: new Date(now),
    id: "confirmed",
    acknowledgeUncertainty: true,
  });
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.value;
}
const diagnostics = (result: Awaited<ReturnType<typeof planFleet>>) =>
  result.diagnostics.map((d) => d.reason.code);

describe("automatic operational planning", () => {
  it("assigns an unassigned commercial demand without dropdown inputs and records actual facts", async () => {
    const r = small(),
      result = await planFleet(r),
      p = must(result.recommended);
    expect(r.jobs[0].assignedTruckId).toBeUndefined();
    expect(p.executions[0].assignment).toEqual({
      truckId: r.trucks[0].id,
      driverId: r.drivers[0].id,
    });
    expect(
      p.executions[0].movements[0].evaluationInput.facts["vehicle.axleCount"],
    ).toMatchObject({ status: "known", value: 3 });
    expect(p.executions[0].reasons.map((v) => v.code)).toContain(
      "RESOURCE_CAPACITY_AND_EQUIPMENT_COMPATIBLE",
    );
    expect(result.unassignedJobIds).toEqual([]);
  });
  it.each([
    "capacity",
    "trailer",
    "unavailable",
    "weekly",
    "qualification",
    "position",
  ])("cheap-rejects %s before a provider call", async (reason) => {
    const r = small(),
      route = vi.fn(syntheticRouter);
    r.route = route;
    if (reason === "capacity") r.trucks[0].payloadKg = 1000;
    if (reason === "trailer") r.trucks[0].vehicleType = "TRACTOR";
    if (reason === "unavailable") r.drivers[0].availability = "UNAVAILABLE";
    if (reason === "weekly")
      r.initialState!.drivers![r.drivers[0].id].driving!.weekSec = 56 * 3600;
    if (reason === "qualification")
      r.drivers[0].licence.expiresOn = "2020-01-01";
    if (reason === "position")
      delete r.initialState!.trucks![r.trucks[0].id].position;
    expect((await planFleet(r)).recommended).toBeNull();
    expect(route).not.toHaveBeenCalled();
  });
  it("uses vehicle-specific mandatory prohibition; unproven exemption does not erase it", async () => {
    const r = small(),
      line: [number, number][] = [
        [40, -8],
        [40.2, -8],
      ],
      rule = closure(
        "Axle prohibition",
        "test",
        {},
        {
          appliesTo: {
            kind: "fact",
            fact: "vehicle.axleCount",
            op: "gte",
            value: 4,
            label: "4+ axles",
            evidence: [EV],
          },
          exceptions: [
            {
              id: "permit",
              label: "Affirmative permit",
              proof: "affirmative",
              condition: {
                kind: "fact",
                fact: "permit",
                op: "eq",
                value: true,
                label: "permit",
                evidence: [EV],
              },
              evidence: [EV],
            },
          ],
        },
      );
    r.dataset = dataset([rule], [geometry("test", line)]);
    r.trucks[0].axleCount = 5;
    const legal = { ...planningTruck("Legal vehicle"), axleCount: 3 };
    r.trucks.push(legal);
    r.initialState!.trucks![legal.id] = {
      availableAt: r.nowMs,
      position: fixturePosition(line[0]),
    };
    const result = await planFleet(r);
    expect(must(result.recommended).executions[0].assignment.truckId).toBe(
      legal.id,
    );
    expect(diagnostics(result)).toContain("MANDATORY_ROUTE_REJECTED");
  });
  it("preserves the real VCI base-unknown distinction instead of filling preset facts", async () => {
    const r = small(),
      option = acceptanceFixture("VCI: isenções por demonstrar").candidates[0]
        .option;
    r.dataset = singleJobFixture().dataset;
    r.jobs = [
      planningJob(
        "VCI transport",
        option.polyline[0],
        option.polyline.at(-1)!,
        r.nowMs,
      ),
    ];
    r.initialState!.trucks![r.trucks[0].id].position = fixturePosition(
      option.polyline[0],
    );
    r.initialState!.drivers![r.drivers[0].id].position = fixturePosition(
      option.polyline[0],
    );
    r.earliestStartMs = Date.parse("2026-10-07T09:00:00Z");
    r.route = async (m) => [
      { ...option, departAtIso: new Date(m.departMs).toISOString() },
    ];
    r.trucks[0].axleCount = 5;
    r.trucks[0].grossVehicleWeightKg = 40000;
    r.trucks[0].firstAxleHeightM = 1.4;
    expect((await planFleet(r)).recommended).toBeNull();
    delete r.trucks[0].firstAxleHeightM;
    const p = must((await planFleet(r)).recommended);
    expect(p.status).toBe("REVIEW_REQUIRED");
    expect(
      p.executions[0].movements[0].report.results.find(
        (v) => v.regulationId === r.dataset.regulations[0].id,
      )?.outcome,
    ).toBe("UNKNOWN");
  });
  it("selects a different driver when the first driver requires daily rest", async () => {
    const r = small(),
      rest = r.drivers[0],
      fresh = planningDriver("Fresh driver");
    r.drivers.push(fresh);
    r.initialState!.drivers![rest.id].driving = {
      drivenTodaySec: 9 * 3600,
      continuousSec: 0,
      weekSec: 9 * 3600,
      known: true,
    };
    r.initialState!.drivers![fresh.id] = {
      availableAt: r.nowMs,
      position: fixturePosition([40, -8]),
      driving: { drivenTodaySec: 0, continuousSec: 0, weekSec: 0, known: true },
    };
    const p = must((await planFleet(r)).recommended);
    expect(p.executions[0].assignment.driverId).toBe(fresh.id);
    expect(p.metrics.restSec).toBe(0);
  });
  it("carries continuous driving across EMPTY/LOADED boundaries and jobs", async () => {
    const r = small();
    r.initialState!.trucks![r.trucks[0].id].position = fixturePosition([
      39.8, -8,
    ]);
    r.initialState!.drivers![r.drivers[0].id].position = fixturePosition([
      39.8, -8,
    ]);
    r.initialState!.drivers![r.drivers[0].id].driving = {
      drivenTodaySec: 4 * 3600,
      continuousSec: 4 * 3600,
      weekSec: 4 * 3600,
      known: true,
    };
    r.jobs.push(planningJob("B", [40.2, -8], [40.3, -8]));
    r.constraints = [{ jobId: "B", afterJobId: "A" }];
    r.route = async (m) => [
      syntheticOption(m, { durationSec: 2400, legDurationSec: [2400] }),
    ];
    const p = must((await planFleet(r)).recommended);
    expect(p.metrics.breakSec).toBeGreaterThanOrEqual(2700);
    expect(p.metrics.emptyDrivingSec).toBe(2400);
    expect(p.futureState.drivers[r.drivers[0].id].driving!.weekSec).toBe(
      4 * 3600 + 3 * 2400,
    );
  });
  it("never resets daily driving merely because midnight passes", async () => {
    const r = small();
    r.nowMs = Date.parse("2026-10-07T22:30:00Z");
    r.earliestStartMs = r.nowMs + 600000;
    r.horizonEndMs = r.nowMs + 86400_000;
    r.initialState!.drivers![r.drivers[0].id].availableAt = r.nowMs;
    r.initialState!.trucks![r.trucks[0].id].availableAt = r.nowMs;
    r.initialState!.drivers![r.drivers[0].id].driving = {
      drivenTodaySec: 8 * 3600,
      continuousSec: 0,
      weekSec: 8 * 3600,
      known: true,
    };
    r.route = async (m) => [
      syntheticOption(m, { durationSec: 7200, legDurationSec: [7200] }),
    ];
    expect(must((await planFleet(r)).recommended).metrics.restSec).toBe(
      11 * 3600,
    );
  });
  it("keeps a useful daily-rest plan when it serves downstream demand another crew cannot serve", async () => {
    const r = small();
    r.initialState!.drivers![r.drivers[0].id].driving = {
      drivenTodaySec: 8.5 * 3600,
      continuousSec: 0,
      weekSec: 8.5 * 3600,
      known: true,
    };
    const fresh = planningDriver("Fresh but limited");
    r.drivers.push(fresh);
    r.initialState!.drivers![fresh.id] = {
      availableAt: r.nowMs,
      position: fixturePosition([40, -8]),
      driving: {
        drivenTodaySec: 0,
        continuousSec: 0,
        weekSec: 55 * 3600,
        known: true,
      },
    };
    r.jobs.push(planningJob("B", [40.2, -8], [40.4, -8]));
    r.constraints = [{ jobId: "B", afterJobId: "A" }];
    r.route = async (m) => [
      syntheticOption(m, { durationSec: 3600, legDurationSec: [3600] }),
    ];
    const p = must((await planFleet(r)).recommended);
    expect(p.executions).toHaveLength(2);
    expect(p.executions[0].assignment.driverId).toBe(r.drivers[0].id);
    expect(p.metrics.restSec).toBe(11 * 3600);
  });
  it("respects explicit override and quantifies extra empty kilometres", async () => {
    const r = small(),
      far = planningTruck("Far vehicle");
    r.trucks.push(far);
    r.initialState!.trucks![far.id] = {
      availableAt: r.nowMs,
      position: fixturePosition([39, -8]),
    };
    delete r.initialState!.drivers![r.drivers[0].id].position;
    const normal = must((await planFleet(r)).recommended);
    r.constraints = [{ jobId: "A", truckId: far.id }];
    const forced = must((await planFleet(r)).recommended);
    expect(forced.executions[0].assignment.truckId).toBe(far.id);
    expect(
      overrideImpact(normal, forced)[0].data!.additionalEmptyKm,
    ).toBeGreaterThan(100);
    r.constraints = [{ jobId: "A", truckId: "Nonexistent" }];
    const impossible = await planFleet(r);
    expect(impossible.recommended).toBeNull();
    expect(impossible.unassignedJobIds).toEqual(["A"]);
  });
  it("uses confirmed future destination rather than current proximity", async () => {
    const r = small();
    r.jobs[0] = planningJob("Tomorrow", [40.42, -3.7], [40.5, -3.7]);
    r.earliestStartMs = r.nowMs + 24 * 3600_000;
    const committed: Job = {
      ...planningJob("Locked", [40, -8], [40.42, -3.7]),
      status: "assigned",
      planStatus: "PLANNED",
      assignedTruckId: r.trucks[0].id,
      assignedDriverId: r.drivers[0].id,
      plannedDepartureAt: new Date(r.nowMs + 3600_000).toISOString(),
      planDecision: {
        confirmedAt: new Date(r.nowMs).toISOString(),
        routeTitle: "Locked",
        departureAt: new Date(r.nowMs + 3600_000).toISOString(),
        arrivalAt: new Date(r.nowMs + 23 * 3600_000).toISOString(),
        windowResult: { ok: true, text: "" },
        eu561: { ok: true, text: "" },
        roadIntelligence: { tone: "ok", text: "" },
        assumptions: [],
      },
    };
    r.jobs.push(committed);
    const currentlyCloser = planningTruck("Currently closer");
    r.trucks.push(currentlyCloser);
    r.initialState!.trucks![currentlyCloser.id] = {
      availableAt: r.nowMs,
      position: fixturePosition([40.3, -3.7]),
    };
    const p = must((await planFleet(r)).recommended);
    expect(p.executions[0].assignment.truckId).toBe(r.trucks[0].id);
    expect(p.metrics.emptyKm).toBe(0);
    expect(
      p.executions[0].reasons.find((v) => v.code === "RESOURCE_ORIGIN")!.data!
        .source,
    ).toBe("CONFIRMED_JOB:Locked");
  });
  it("does not fabricate remaining driving allowance for an in-progress commitment", () => {
    const r = small();
    r.jobs[0] = {
      ...r.jobs[0],
      status: "in_transit",
      assignedTruckId: r.trucks[0].id,
      assignedDriverId: r.drivers[0].id,
      plannedDepartureAt: new Date(r.nowMs - 3600_000).toISOString(),
      planDecision: {
        confirmedAt: "",
        routeTitle: "",
        departureAt: new Date(r.nowMs - 3600_000).toISOString(),
        arrivalAt: new Date(r.nowMs + 3600_000).toISOString(),
        windowResult: { ok: true, text: "" },
        eu561: { ok: true, text: "" },
        roadIntelligence: { tone: "ok", text: "" },
        assumptions: [],
      },
    };
    expect(initialFleetState(r).drivers[r.drivers[0].id].blocked).toContain(
      "IN_PROGRESS_REMAINING_HOURS_UNKNOWN",
    );
  });
  it("changes sequence with geography and with dated windows", async () => {
    const r = small();
    r.jobs = [
      planningJob("A", [40, -8], [40.2, -8]),
      planningJob("B", [40.21, -8], [40.4, -8]),
      planningJob("C", [40.6, -8], [40.8, -8]),
    ];
    expect(
      must((await planFleet(r)).recommended).executions.map((e) => e.jobId),
    ).toEqual(["A", "B", "C"]);
    r.jobs[1] = planningJob("B", [40.8, -8], [41, -8]);
    r.jobs[2] = planningJob("C", [40.21, -8], [40.4, -8]);
    expect(
      must((await planFleet(r)).recommended).executions.map((e) => e.jobId),
    ).toEqual(["A", "C", "B"]);
    r.jobs[1].stops[0].windowEndAt = new Date(
      r.nowMs + 90 * 60000,
    ).toISOString();
    expect(must((await planFleet(r)).recommended).executions[0].jobId).toBe(
      "B",
    );
  });
  it("fewer fleet empty km defeats a cheaper isolated loaded movement", async () => {
    const r = small();
    r.jobs.push(planningJob("B", [40.21, -8], [40.5, -8]));
    r.jobs.push(planningJob("C", [39, -8], [39.1, -8]));
    r.route = async (m) => [
      syntheticOption(m, {
        fuelCostEur:
          m.kind === "LOADED" && m.job.id === "C"
            ? 1
            : syntheticOption(m).fuelCostEur,
      }),
    ];
    const p = must((await planFleet(r)).recommended);
    expect(p.executions.slice(0, 2).map((e) => e.jobId)).toEqual(["A", "B"]);
    const naive = await planFleet({
      ...r,
      constraints: [
        { jobId: "A", afterJobId: "C" },
        { jobId: "B", afterJobId: "A" },
      ],
    });
    expect(p.metrics.generalizedCostEur).toBeLessThan(
      must(naive.recommended).metrics.generalizedCostEur,
    );
  });
  it("separates empty/loaded costs and preserves unknown revenue without double-counting", async () => {
    const r = small();
    r.initialState!.trucks![r.trucks[0].id].position = fixturePosition([
      39.8, -8,
    ]);
    r.initialState!.drivers![r.drivers[0].id].position = fixturePosition([
      39.8, -8,
    ]);
    r.economics = { nonFuelEurPerKm: 0.1, opportunityEurPerHour: 18 };
    const p = must((await planFleet(r)).recommended),
      m = p.metrics;
    expect(m.emptyKm).toBeGreaterThan(0);
    expect(m.totalKm).toBeCloseTo(m.emptyKm + m.loadedKm);
    expect(m.directCostEur).toBeCloseTo(
      m.providerFuelTollEur + m.totalKm * 0.1,
    );
    expect(m.generalizedCostEur).toBeCloseTo(
      m.directCostEur + m.opportunityCostEur,
    );
    expect(m.revenueEur).toBeNull();
    expect(m.contributionBeforeUnpricedCostsEur).toBeNull();
    r.jobs[0].rateEur = 600;
    expect(planMetrics(p.executions, r.jobs, r.economics).revenueEur).toBe(600);
  });
  it("bounds provider-independent search and discloses partial/unassigned demand", async () => {
    const r = small();
    r.jobs.push(planningJob("B", [40.2, -8], [40.4, -8]));
    r.search = { maxRouteRequests: 1 };
    const result = await planFleet(r);
    expect(result.search.routeRequests).toBe(1);
    expect(result.search.truncated).toBe(true);
    expect(result.search.globallyOptimal).toBe(false);
    expect(result.unassignedJobIds).toHaveLength(1);
  });
  it("preserves an urgent pickup ahead of cheaper prefixes across a heterogeneous fleet", async () => {
    const r = fleetFixture(),
      urgent = r.jobs.find((j) => j.id === "TESTE-J1-2")!;
    urgent.stops[0].windowStartAt = new Date(r.nowMs + 600000).toISOString();
    urgent.stops[0].windowEndAt = new Date(r.nowMs + 25 * 60000).toISOString();
    urgent.stops[1].windowStartAt = urgent.stops[0].windowStartAt;
    const result = await planFleet(r),
      p = must(result.recommended);
    expect(result.unassignedJobIds).toEqual([]);
    expect(p.executions).toHaveLength(20);
    expect(p.trips.find((t) => t.jobIds.includes(urgent.id))!.jobIds[0]).toBe(
      urgent.id,
    );
    expect(
      p.executions.find((e) => e.jobId === urgent.id)!.pickupMs,
    ).toBeLessThanOrEqual(Date.parse(urgent.stops[0].windowEndAt));
  }, 60000);
  it("plans twenty heterogeneous jobs across five crews with unequal geographic sequences", async () => {
    const r = fleetFixture(),
      result = await planFleet(r),
      p = must(result.recommended);
    expect(p.executions).toHaveLength(20);
    expect(p.trips).toHaveLength(5);
    expect(p.trips.map((t) => t.jobIds.length).sort((a, b) => b - a)).toEqual([
      8, 5, 3, 2, 2,
    ]);
    expect(p.metrics.emptyKm).toBeLessThan(35);
    expect(result.search.routeRequests).toBeLessThanOrEqual(4096);
    for (const trip of p.trips) {
      const ordered = trip.jobIds.map(
        (id) => p.executions.find((e) => e.jobId === id)!,
      );
      for (let i = 1; i < ordered.length; i++)
        expect(ordered[i].startMs).toBeGreaterThanOrEqual(ordered[i - 1].endMs);
    }
  }, 60000);
});

describe("contextual decisions and historical truth", () => {
  it("does not let job-level physical facts override the automatically selected truck", async () => {
    const r = small();
    r.jobs[0].recordedFacts = {
      "vehicle.axleCount": {
        value: 8,
        source: "old manually selected vehicle",
      },
    };
    const p = must((await planFleet(r)).recommended);
    expect(
      p.executions[0].movements[0].evaluationInput.facts["vehicle.axleCount"],
    ).toMatchObject({ status: "known", value: 3 });
  });
  it("uses the actual trailer envelope and detects later trailer/driver changes", async () => {
    const r = fleetFixture();
    r.scopeJobIds = [r.jobs[0].id];
    const p = must((await planFleet(r)).recommended),
      job = confirm(r, p).jobs.find((j) => j.id === r.jobs[0].id)!;
    expect(
      p.executions[0].movements[0].evaluationInput.facts["vehicle.heightM"],
    ).toMatchObject({ status: "known", value: 4 });
    expect(
      p.executions[0].movements[0].evaluationInput.facts["vehicle.lengthM"]
        .status,
    ).toBe("unknown");
    expect(
      p.executions[0].movements[0].evaluationInput.facts["vehicle.axleCount"],
    ).toMatchObject({ status: "known", value: 6 });
    const truck = r.trucks.find((t) => t.id === job.assignedTruckId)!;
    expect(
      assessPlannedJob(job, truck, r.dataset, new Date(r.nowMs), {
        drivers: r.drivers,
        trailers: r.trailers,
      }).state,
    ).toBe("CURRENT");
    const trailers = r.trailers.map((t) =>
      t.id === job.assignedTrailerId ? { ...t, heightM: 4.2 } : t,
    );
    expect(
      assessPlannedJob(job, truck, r.dataset, new Date(r.nowMs), {
        drivers: r.drivers,
        trailers,
      }).state,
    ).toBe("STALE_INPUTS");
    const drivers = r.drivers.map((d) =>
      d.id === job.assignedDriverId
        ? { ...d, licence: { ...d.licence, expiresOn: "2020-01-01" } }
        : d,
    );
    expect(
      assessPlannedJob(job, truck, r.dataset, new Date(r.nowMs), {
        drivers,
        trailers: r.trailers,
      }).state,
    ).toBe("STALE_INPUTS");
  });
  it("keeps unspecified coupled axle scope unknown and rejects unknown trailer payload before routing", async () => {
    const r = fleetFixture();
    r.scopeJobIds = [r.jobs[0].id];
    delete r.trucks[0].axleCountScope;
    const p = must((await planFleet(r)).recommended);
    expect(
      p.executions[0].movements[0].evaluationInput.facts["vehicle.axleCount"]
        .status,
    ).toBe("unknown");
    delete r.trailers[0].payloadKg;
    const result = await planFleet(r);
    expect(result.recommended).toBeNull();
    expect(result.search.routeRequests).toBe(0);
    expect(diagnostics(result)).toContain("TRAILER_CAPACITY_UNKNOWN");
    r.trailers[0].maxGrossWeightKg = 32000;
    r.trailers[0].tareKg = 6000;
    expect((await planFleet(r)).recommended).not.toBeNull();
    r.trailers[0].tareKg = 20000;
    const heavy = await planFleet(r);
    expect(heavy.recommended).toBeNull();
    expect(diagnostics(heavy)).toContain("COMBINATION_GROSS_WEIGHT_EXCEEDED");
  });
  it("blocks extending a newly prohibited commitment and preserves that commitment verbatim", async () => {
    const r = small(),
      p = must((await planFleet(r)).recommended),
      job = confirm(r, p).jobs[0],
      before = JSON.stringify(job);
    r.jobs = [job, planningJob("B", [40.2, -8], [40.4, -8])];
    r.dataset = dataset(
      [closure("New prohibition", "road", {})],
      [
        geometry("road", [
          [40, -8],
          [40.2, -8],
        ]),
      ],
    );
    const result = await planFleet(r);
    expect(result.recommended).toBeNull();
    expect(diagnostics(result)).toContain("COMMITTED_ROUTE_REQUIRES_REVIEW");
    expect(JSON.stringify(job)).toBe(before);
  });
  it("rejects overlapping resources at confirmation even when saved route reports are clear", async () => {
    const r = small();
    r.jobs.push(planningJob("B", [40.2, -8], [40.4, -8]));
    const p = must((await planFleet(r)).recommended);
    p.executions[1].startMs = p.executions[0].startMs;
    expect(
      confirmOperationalPlan({
        ...r,
        selected: p,
        recommended: p,
        now: new Date(r.nowMs),
        id: "overlap",
        acknowledgeUncertainty: true,
      }).ok,
    ).toBe(false);
  });
  it("leaves completed history outside replanning and surfaces cancelled search", async () => {
    const r = small();
    r.jobs[0] = { ...r.jobs[0], status: "delivered" };
    const before = JSON.stringify(r.jobs);
    expect((await planFleet(r)).recommended).toBeNull();
    expect(JSON.stringify(r.jobs)).toBe(before);
    r.jobs.push(planningJob("B", [40, -8], [40.3, -8]));
    const controller = new AbortController();
    controller.abort();
    await expect(
      planFleet({ ...r, signal: controller.signal }),
    ).rejects.toThrow("cancelled");
  });
  it("prunes thirteen extra hours for a trivial saving and retains explicit downstream value", () => {
    const candidate = (
      id: string,
      hours: number,
      cost: number,
    ): DecisionCandidate => ({
      option: syntheticOption(
        { from: [40, -8], to: [40.2, -8], departMs: FIXTURE_NOW },
        { id, fuelCostEur: cost },
      ),
      report: {
        status: "ROUTE_COMPLIANT",
        results: [],
        datasetId: "test",
        datasetVersion: "t1",
        evaluatedAt: "",
      },
      elapsedSec: hours * 3600,
      window: "achievable",
      criticalHours: false,
      coverageComplete: false,
      provenance: [],
    });
    const fast = candidate("Fast", 3.5, 254),
      slow = candidate("Rest", 16.5, 213);
    slow.option.polyline = slow.option.polyline.map(([lat, lng]) => [
      lat,
      lng + 0.1,
    ]);
    expect(
      decideRoutes([fast, slow], undefined, {
        opportunityEurPerHour: 18,
      }).decisions.map((d) => d.routeId),
    ).toEqual(["Fast"]);
    expect(
      decideRoutes([fast, slow], undefined, {
        opportunityEurPerHour: 18,
        downstreamValueEurByRoute: { Rest: 300 },
      }).decisions.some((d) => d.routeId === "Rest"),
    ).toBe(true);
    expect(
      decideRoutes([fast, slow], fast.option, {
        opportunityEurPerHour: 18,
        downstreamValueEurByRoute: { Rest: 300 },
      }).recommendedRouteId,
    ).toBe("Rest");
    expect(
      decideRoutes([fast, slow], undefined, {
        opportunityEurPerHour: 0,
        preserveTollObjective: true,
      }).decisions.some((d) => d.routeId === "Rest"),
    ).toBe(true);
  });
  it("compares complete served demand before cheaper partial plans", async () => {
    const r = small(),
      a = must((await planFleet(r)).recommended),
      b = structuredClone(a);
    b.id = "partial";
    b.executions = [];
    b.metrics.generalizedCostEur = 0;
    expect(comparePlans(a, b)).toBeLessThan(0);
    expect(operationallyDominates(b, a)).toBe(false);
  });
  it("does not manufacture duplicate uncertain driver permutations alongside a better documented recommendation", async () => {
    const r = small();
    r.initialState!.drivers![r.drivers[0].id].driving!.drivenTodaySec =
      8.9 * 3600;
    r.route = async (m) => [
      syntheticOption(m, { durationSec: 3600, legDurationSec: [3600] }),
    ];
    for (const id of ["Unknown one", "Unknown two"]) {
      r.drivers.push(planningDriver(id, r.nowMs));
      r.initialState!.drivers![id] = {
        availableAt: r.nowMs,
        position: fixturePosition([40, -8]),
        driving: {
          drivenTodaySec: 0,
          continuousSec: 0,
          weekSec: 0,
          known: false,
        },
      };
    }
    const result = await planFleet(r);
    expect(must(result.recommended).executions[0].assignment.driverId).toBe(
      r.drivers[0].id,
    );
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0].metrics.restSec).toBe(0);
    expect(diagnostics(result)).toContain("IMMATERIAL_RESOURCE_PERMUTATION");
  });
  it("confirms every movement, preserves recommendation, and replans only remaining future demand", async () => {
    const r = small();
    r.initialState!.trucks![r.trucks[0].id].position = fixturePosition([
      39.8, -8,
    ]);
    r.initialState!.drivers![r.drivers[0].id].position = fixturePosition([
      39.8, -8,
    ]);
    const store = new MemoryOperationalStore();
    await store.commit({
      put: {
        jobs: r.jobs,
        trucks: r.trucks,
        drivers: r.drivers,
        trailers: r.trailers,
      },
    });
    const service = new OperationsService(store, () => new Date(r.nowMs));
    await service.load();
    const result = await planFleet(r),
      saved = await service.savePlanningRecommendation(result);
    if (!saved.ok) throw Error(saved.errors.join());
    const outcome = await service.confirmOperationalRecommendation(
      saved.value.id,
      must(result.recommended).id,
      r.dataset,
      true,
    );
    if (!outcome.ok) throw Error(outcome.errors.join());
    const before = JSON.stringify(service.getState().jobs[0]),
      receipt = JSON.stringify(outcome.value);
    expect(outcome.value.compliance.A).toHaveLength(2);
    const confirmed = service.getState().jobs[0];
    expect(jobPhase(confirmed)).toBe("COMMITTED");
    expect(assessPlannedJob(confirmed, r.trucks[0], r.dataset).state).toBe(
      "CURRENT",
    );
    const next = await planFleet({
      ...r,
      jobs: [
        ...service.getState().jobs,
        planningJob("B", [40.2, -8], [40.4, -8]),
      ],
    });
    expect(must(next.recommended).executions.map((e) => e.jobId)).toEqual([
      "B",
    ]);
    expect(JSON.stringify(service.getState().jobs[0])).toBe(before);
    expect(
      JSON.stringify(
        await service.readConfirmedOperationalPlan(outcome.value.id),
      ),
    ).toContain('"source":"HUMAN_CONFIRMED"');
    expect(JSON.stringify(outcome.value)).toBe(receipt);
  });
  it("never counts active cargo service as a qualifying break when extending confirmed work", async () => {
    const r = small();
    r.initialState!.drivers![r.drivers[0].id].driving!.continuousSec = 3600;
    r.route = async (m) => [
      syntheticOption(m, { durationSec: 7200, legDurationSec: [7200] }),
    ];
    r.jobs[0].operationalRequirements!.serviceSecByStop = Object.fromEntries(
      r.jobs[0].stops.map((s) => [s.id, 3600]),
    );
    const p = must((await planFleet(r)).recommended),
      j = confirm(r, p).jobs[0];
    expect(j.operationalPlan!.execution.drivingAfter.continuousSec).toBe(10800);
    r.jobs = [j, planningJob("B", [40.2, -8], [40.4, -8])];
    const next = must((await planFleet(r)).recommended);
    expect(next.executions).toHaveLength(1);
    expect(next.metrics.breakSec).toBe(2700);
    expect(next.executions[0].drivingAtStart.continuousSec).toBe(10800);
    r.initialState!.drivers![r.drivers[0].id].driving!.continuousSec = 4000;
    const changed = await planFleet(r);
    expect(changed.recommended).toBeNull();
    expect(diagnostics(changed)).toContain(
      "COMMITTED_DRIVING_BASELINE_CHANGED",
    );
  });
  it("re-evaluates empty-leg restrictions as well as loaded legs, without rewriting stored reports", async () => {
    const r = small();
    r.initialState!.trucks![r.trucks[0].id].position = fixturePosition([
      39.8, -8,
    ]);
    r.initialState!.drivers![r.drivers[0].id].position = fixturePosition([
      39.8, -8,
    ]);
    const p = must((await planFleet(r)).recommended),
      j = confirm(r, p).jobs[0],
      before = JSON.stringify(j);
    const ds = dataset(
      [closure("New deadhead closure", "empty", {})],
      [
        geometry("empty", [
          [39.8, -8],
          [39.95, -8],
        ]),
      ],
    );
    ds.version = "t2";
    const state = assessPlannedJob(j, r.trucks[0], ds);
    expect(state.state).toBe("CURRENT");
    if (state.state === "CURRENT")
      expect(state.reevaluation.current.status).toBe("ROUTE_AFFECTED");
    expect(JSON.stringify(j)).toBe(before);
    expect(
      assessPlannedJob(j, { ...r.trucks[0], heightM: 4.2 }, ds).state,
    ).toBe("STALE_INPUTS");
  });
  it.each(["inventory", "dataset", "past", "review"])(
    "rejects unsafe %s confirmation atomically",
    async (kind) => {
      const r = small(),
        p = must((await planFleet(r)).recommended);
      if (kind === "inventory") r.trucks[0].payloadKg = 500;
      if (kind === "dataset") r.dataset = { ...r.dataset, version: "changed" };
      if (kind === "review") p.status = "REVIEW_REQUIRED";
      const result = confirmOperationalPlan({
        ...r,
        selected: p,
        recommended: p,
        now: new Date(kind === "past" ? r.nowMs + 86400000 : r.nowMs),
        id: "test",
        acknowledgeUncertainty: kind !== "review",
      });
      expect(result.ok).toBe(false);
      expect(r.jobs[0].status).toBe("backlog");
    },
  );
  it("guards resources in an IndexedDB confirmation transaction against another session", async () => {
    const store = await IdbOperationalStore.open(
        "planning-atomic-test",
        new IDBFactory(),
      ),
      r = small();
    await store.commit({ put: { trucks: r.trucks, jobs: r.jobs } });
    await expect(
      store.commit({
        put: { jobs: [{ ...r.jobs[0], status: "assigned" }] },
        meta: { confirmed: "should-not-exist" },
        expectResourceUpdates: { trucks: { [r.trucks[0].id]: "stale" } },
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    expect((await store.loadAll()).jobs[0].status).toBe("backlog");
    expect(await store.getMeta("confirmed")).toBeUndefined();
    store.close();
  });
  it("promotes confirmed sequence before nearest geography and clears active plan on explicit unassignment", async () => {
    const r = small();
    r.jobs.push(
      planningJob("B", [40.8, -8], [40.9, -8]),
      planningJob("C", [40.2, -8], [40.3, -8]),
    );
    r.constraints = [
      { jobId: "B", afterJobId: "A" },
      { jobId: "C", afterJobId: "B" },
    ];
    const p = must((await planFleet(r)).recommended),
      jobs = confirm(r, p).jobs,
      ended = {
        ...jobs.find((j) => j.id === "A")!,
        status: "delivered" as const,
      };
    const promoted = promoteNextQueued(
      jobs.map((j) => (j.id === "A" ? ended : j)),
      ended,
      new Date(r.nowMs).toISOString(),
    );
    expect(promoted.jobs.find((j) => j.id === "B")!.status).toBe("assigned");
    expect(promoted.jobs.find((j) => j.id === "C")!.status).toBe("queued");
    const resources = {
      trucks: new Map(r.trucks.map((t) => [t.id, t])),
      drivers: new Map(r.drivers.map((d) => [d.id, d])),
      trailers: new Map(r.trailers.map((t) => [t.id, t])),
    };
    const unassign = transitionJob(jobs, "A", "backlog", {
      now: new Date(r.nowMs),
      resources,
    });
    expect(unassign.ok).toBe(true);
    if (unassign.ok)
      expect(
        unassign.value.jobs.find((j) => j.id === "A")!.operationalPlan,
      ).toBeUndefined();
  });
  it("rejects stale inventory saved after an intervening resource edit", async () => {
    const r = small(),
      result = await planFleet(r),
      store = new MemoryOperationalStore();
    await store.commit({
      put: { jobs: r.jobs, trucks: r.trucks, drivers: r.drivers },
    });
    const service = new OperationsService(store, () => new Date(r.nowMs));
    await service.load();
    await store.commit({
      put: { trucks: [{ ...r.trucks[0], updatedAt: "changed" }] },
    });
    await service.load();
    expect((await service.savePlanningRecommendation(result)).ok).toBe(false);
    expect(inventoryFingerprint(r.jobs, r.trucks, r.drivers, [])).not.toBe(
      inventoryFingerprint(r.jobs, service.getState().trucks, r.drivers, []),
    );
  });
});
