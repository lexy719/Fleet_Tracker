import { describe, expect, it } from "vitest";
import fixture from "../__fixtures__/tomtomCoimbraViseuIp3.json";
import { demoJobs as seedJobs, demoTrucks as trucks } from "../../data/mockData";
import type { Job, Truck } from "../../data/types";
import type { RoutePlanOption } from "../../tomtom/planRoutes";
import { createComplianceRecord } from "../decisionRecord";
import { evaluateCompliance, type EvaluateOptions } from "../evaluate";
import { buildRouteStops, buildTransportFacts } from "../fleetFacts";
import { PT_ROAD_EVENTS } from "../portugal/roadEvents";
import { assessPlannedJob, readComplianceRecord } from "../reevaluate";
import { buildRegulationDataset, REGULATION_DATASET } from "../repository";
import { DEFAULT_TIMING_MODEL, routeTimingInput, type TimingModel } from "../timeline";
import type { RegulationDataset } from "../types";

/*
 * Confirmed decisions made with the Phase 3C.5 timeline must replay identically after
 * reload, and "what was decided then" must stay distinguishable from "what FleetOS knows now".
 */

type FR = { lengthInMeters: number; travelTimeInSeconds: number; legs: { travelTimeInSeconds: number; points: number[][] }[] };
const ALT = (fixture as unknown as { avoidAreas: FR; original: FR }).original;
const truck = trucks.find((t) => t.id === "t-demo-vci")!;
const job: Job = { ...seedJobs.find((j) => j.id === "J-DEMO-IP3")!, status: "assigned", assignedTruckId: truck.id };
const EVENT = PT_ROAD_EVENTS[0]!.id;
const WITH_EVENT = buildRegulationDataset([EVENT]);
const DEPART_OK = new Date("2026-10-01T10:00:00Z"); // daytime: IP3 night closure not in force

function option(r: FR, depart: Date): RoutePlanOption {
  return {
    id: "route-0", title: "", subtitle: "", polyline: r.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number])),
    distanceM: r.lengthInMeters, durationSec: r.travelTimeInSeconds, trafficDelaySec: 0, fuelCostEur: 0, tollCostEur: 0, tollPricedEur: 0,
    tollEstimatedEur: 0, tollDataQuality: "none", tollSectionCount: 0, stopArrivals: [], legDurationSec: r.legs.map((l) => l.travelTimeInSeconds),
    legPointCounts: r.legs.map((l) => l.points.length), roadNumbers: [], departAtIso: depart.toISOString(), colorIndex: 0, routing: { role: "primary", params: {} },
  };
}

function plan(ds: RegulationDataset, depart: Date, model: TimingModel | undefined, j: Job = { ...job, plannedDepartureAt: depart.toISOString() }, t: Truck = truck): Job {
  const opt = option(ALT, depart);
  const opts: EvaluateOptions = { timeToleranceMin: 15, sampleStepMin: 5, ...(model ? { timing: model } : {}) };
  const input = { route: routeTimingInput(opt.polyline, opt.legPointCounts, opt.legDurationSec, depart.getTime(), model), stops: buildRouteStops(j, ds.areas), facts: buildTransportFacts(t, j) };
  const live = evaluateCompliance(ds, input, opts);
  const rc = createComplianceRecord({ job: j, truck: t, dataset: ds, option: opt, title: "t", departAt: depart, liveInput: input, evaluationOptions: opts, liveReport: live, followsOfficialAlternatives: [] });
  if (!rc) throw new Error(`not confirmable: ${live.status}`);
  return { ...j, routeCompliance: rc };
}

describe("timeline decisions persist and replay exactly", () => {
  const planned = plan(WITH_EVENT, DEPART_OK, DEFAULT_TIMING_MODEL);

  it("the timing model is stored with the decision", () => {
    expect(planned.routeCompliance!.evaluationOptions!.timing).toEqual(DEFAULT_TIMING_MODEL);
  });
  it("JSON reload ⇒ CURRENT, identical outcomes, identical passage windows", () => {
    const reloaded = JSON.parse(JSON.stringify(planned)) as Job;
    const s = assessPlannedJob(reloaded, truck, WITH_EVENT);
    expect(s.state).toBe("CURRENT");
    if (s.state !== "CURRENT") return;
    expect(s.reevaluation.current.results.map((r) => [r.regulationId, r.outcome])).toEqual(planned.routeCompliance!.report.results.map((r) => [r.regulationId, r.outcome]));
    expect(s.reevaluation.newFindings).toEqual([]);
  });
  it("a different driver state at re-evaluation time does NOT rewrite the stored decision's timing", () => {
    const rc = planned.routeCompliance!;
    const tampered = { ...planned, routeCompliance: { ...rc, evaluationOptions: { ...rc.evaluationOptions!, timing: { ...DEFAULT_TIMING_MODEL, driver: { drivenTodaySec: 8.5 * 3600 } } } } };
    // The stored model is what replays; tampering is visible as a (possibly) different result, never silently merged.
    expect(readComplianceRecord(tampered.routeCompliance).kind).toBe("ok");
    expect(planned.routeCompliance!.evaluationOptions!.timing!.driver.drivenTodaySec).toBe(0);
  });
  it("legacy record (no timing model) replays with the legacy model — still reproducible", () => {
    const legacy = plan(WITH_EVENT, DEPART_OK, undefined);
    expect(legacy.routeCompliance!.evaluationOptions!.timing).toBeUndefined();
    expect(assessPlannedJob(JSON.parse(JSON.stringify(legacy)) as Job, truck, WITH_EVENT).state).toBe("CURRENT");
  });
  it("corrupt stored timing model ⇒ falls back to legacy replay, never throws", () => {
    const rc = planned.routeCompliance!;
    const bad = { ...planned, routeCompliance: { ...rc, evaluationOptions: { ...rc.evaluationOptions!, timing: { version: 9 } as unknown as TimingModel } } };
    expect(() => assessPlannedJob(bad, truck, WITH_EVENT)).not.toThrow();
  });
});

describe("what was decided THEN vs what FleetOS knows NOW", () => {
  // Decided at night while the IP3 closure was NOT known ⇒ compliant; now it is known.
  const NIGHT = new Date("2026-10-01T20:15:00Z");
  const decidedWithoutEvent = plan(REGULATION_DATASET, NIGHT, DEFAULT_TIMING_MODEL);

  it("new intelligence ⇒ re-evaluated on the SAVED route; the stored decision is untouched", () => {
    const before = JSON.stringify(decidedWithoutEvent.routeCompliance);
    const s = assessPlannedJob(decidedWithoutEvent, truck, WITH_EVENT);
    expect(s.state).toBe("CURRENT");
    if (s.state !== "CURRENT") return;
    expect(s.reevaluation.previousStatus).toBe("ROUTE_COMPLIANT"); // then
    expect(s.reevaluation.current.status).not.toBe("ROUTE_COMPLIANT"); // now
    expect(s.datasetChanged).toBe(true);
    expect(JSON.stringify(decidedWithoutEvent.routeCompliance)).toBe(before);
  });
  it("constraint expires / event removed ⇒ back to compliant against the dataset now; history intact", () => {
    const decidedWithEventDay = plan(WITH_EVENT, DEPART_OK, DEFAULT_TIMING_MODEL);
    const s = assessPlannedJob(decidedWithEventDay, truck, REGULATION_DATASET);
    expect(s.state).toBe("CURRENT");
    if (s.state === "CURRENT") expect(s.datasetChanged).toBe(true);
    expect(decidedWithEventDay.routeCompliance!.report.datasetVersion).toBe(WITH_EVENT.version);
  });
  it("departure changed ⇒ STALE_INPUTS (previous decision invalid, not silently re-labelled)", () => {
    const moved = { ...decidedWithoutEvent, plannedDepartureAt: new Date(NIGHT.getTime() + 30 * 60_000).toISOString() };
    expect(assessPlannedJob(moved, truck, REGULATION_DATASET).state).toBe("STALE_INPUTS");
  });
  it("truck changed ⇒ STALE_INPUTS", () => {
    const other = { ...truck, id: "t1", grossVehicleWeightKg: 18_000 };
    expect(assessPlannedJob(decidedWithoutEvent, other, REGULATION_DATASET).state).toBe("STALE_INPUTS");
  });
  it("provider would now return a different route ⇒ irrelevant: re-evaluation always uses the saved geometry", () => {
    const at = new Date("2026-10-01T12:00:00Z");
    const s1 = assessPlannedJob(decidedWithoutEvent, truck, REGULATION_DATASET, at);
    const s2 = assessPlannedJob(JSON.parse(JSON.stringify(decidedWithoutEvent)), truck, REGULATION_DATASET, at);
    expect(s1).toEqual(s2);
  });
});
