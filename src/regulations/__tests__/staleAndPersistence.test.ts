import { describe, expect, it } from "vitest";
import fixture from "../__fixtures__/tomtomCoimbraViseuIp3.json";
import { demoJobs as seedJobs, demoTrucks as trucks } from "../../data/mockData";
import type { Job, Truck } from "../../data/types";
import { migrateStoredJobs } from "../../lib/jobsStorage";
import type { RoutePlanOption } from "../../tomtom/planRoutes";
import { createComplianceRecord } from "../decisionRecord";
import { evaluateCompliance, type EvaluateOptions } from "../evaluate";
import { buildRouteStops, buildTransportFacts } from "../fleetFacts";
import { estimatePointTimes } from "../geometry";
import { PT_ROAD_EVENTS } from "../portugal/roadEvents";
import { assessPlannedJob, readComplianceRecord } from "../reevaluate";
import { buildRegulationDataset, REGULATION_DATASET } from "../repository";
import type { EvaluationInput, RegulationDataset } from "../types";
import { closure, dataset, geometry, period, ROAD_A, routeAlong, at } from "./helpers";

type FixtureRoute = { lengthInMeters: number; travelTimeInSeconds: number; legs: { travelTimeInSeconds: number; points: number[][] }[] };
const ORIG = fixture.original as FixtureRoute;
const EVENT_ID = PT_ROAD_EVENTS[0]!.id;
const WITH_EVENT = buildRegulationDataset([EVENT_ID]);
const DEPART = new Date("2026-10-01T20:15:00Z");
const OPTS: EvaluateOptions = { timeToleranceMin: 15, sampleStepMin: 5 };

const demoTruck = trucks.find((t) => t.id === "t-demo-vci")!;
const baseJob: Job = { ...seedJobs.find((j) => j.id === "J-DEMO-IP3")!, status: "assigned", assignedTruckId: demoTruck.id };

function option(r: FixtureRoute): RoutePlanOption {
  return {
    id: "route-0", title: "", subtitle: "", polyline: r.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number])),
    distanceM: r.lengthInMeters, durationSec: r.travelTimeInSeconds, trafficDelaySec: 0, fuelCostEur: 0, tollCostEur: 0,
    tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none", tollSectionCount: 0, stopArrivals: [],
    legDurationSec: r.legs.map((l) => l.travelTimeInSeconds), legPointCounts: r.legs.map((l) => l.points.length),
    roadNumbers: [], departAtIso: DEPART.toISOString(), colorIndex: 0, routing: { role: "primary", params: {} },
  };
}

const departOf = (job: Job) => (job.plannedDepartureAt ? new Date(job.plannedDepartureAt) : DEPART);

function liveInput(job: Job, truck: Truck | null, opt: RoutePlanOption, ds: RegulationDataset): EvaluationInput {
  const t0 = departOf(job).getTime();
  return {
    route: { points: opt.polyline, pointTimesMs: estimatePointTimes(opt.polyline, opt.legPointCounts, opt.legDurationSec, t0), timesAreEstimates: true, tripWindowMs: [t0, t0 + opt.durationSec * 1000] },
    stops: buildRouteStops(job, ds.areas),
    facts: buildTransportFacts(truck, job),
  };
}

/** Confirm through the SAME function the planner uses. */
function planned(ds: RegulationDataset = REGULATION_DATASET, job: Job = baseJob, truck: Truck = demoTruck): Job {
  const opt = option(ORIG);
  const input = liveInput(job, truck, opt, ds);
  const live = evaluateCompliance(ds, input, OPTS);
  const rc = createComplianceRecord({ job, truck, dataset: ds, option: opt, title: "Mais rápida", departAt: departOf(job), liveInput: input, evaluationOptions: OPTS, liveReport: live, followsOfficialAlternatives: [] });
  if (!rc) throw new Error("record not created");
  return { ...job, routeCompliance: rc };
}

describe("confirmation record", () => {
  it("refuses to create a record for an AFFECTED route", () => {
    const opt = option(ORIG);
    const input = liveInput(baseJob, demoTruck, opt, WITH_EVENT);
    const live = evaluateCompliance(WITH_EVENT, input, OPTS);
    expect(live.status).toBe("ROUTE_AFFECTED");
    expect(createComplianceRecord({ job: baseJob, truck: demoTruck, dataset: WITH_EVENT, option: opt, title: "", departAt: DEPART, liveInput: input, evaluationOptions: OPTS, liveReport: live, followsOfficialAlternatives: [] })).toBeNull();
  });
  it("carries schema version, inputs, fingerprint, options, dataset version and evidence", () => {
    const rc = planned().routeCompliance!;
    expect(rc.schemaVersion).toBe(2);
    expect(rc.inputFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(rc.evaluationOptions).toEqual({ timeToleranceMin: 15, sampleStepMin: 5 });
    expect(rc.report.datasetVersion).toBe(REGULATION_DATASET.version);
    expect(rc.report.results.every((r) => r.regulationVersion >= 1)).toBe(true);
  });
});

describe("reload must not change the truth", () => {
  it("JSON round-trip ⇒ CURRENT with identical outcomes", () => {
    const job = JSON.parse(JSON.stringify(planned())) as Job;
    const s = assessPlannedJob(job, demoTruck, REGULATION_DATASET);
    expect(s.state).toBe("CURRENT");
    if (s.state !== "CURRENT") return;
    expect(s.reevaluation.current.status).toBe(job.routeCompliance!.report.status);
    expect(s.reevaluation.current.results.map((r) => r.outcome)).toEqual(job.routeCompliance!.report.results.map((r) => r.outcome));
    expect(s.reevaluation.newFindings).toEqual([]);
  });
});

describe("stale decisions: mutate one input at a time", () => {
  const job = planned();
  const other = trucks.find((t) => t.id === "t1")!;
  const withStop = (i: number, patch: Partial<Job["stops"][number]>): Job => ({ ...job, stops: job.stops.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  it.each<[string, Job, Truck, RegExp]>([
    ["truck reassigned", { ...job, assignedTruckId: other.id }, other, /viatura/],
    ["truck gross weight", job, { ...demoTruck, grossVehicleWeightKg: 18_000 }, /viatura/],
    ["axle count", job, { ...demoTruck, axleCount: 2 }, /viatura/],
    ["first-axle height", job, { ...demoTruck, firstAxleHeightM: 0.9 }, /viatura/],
    ["cargo weight", { ...job, totalWeightKg: 20_000 }, demoTruck, /carga/],
    ["cargo type", { ...job, cargoType: "hazmat" }, demoTruck, /carga/],
    ["ADR", { ...job, adrClass: "3", adrUnNumber: "UN1203" }, demoTruck, /carga/],
    ["departure", { ...job, plannedDepartureAt: "2026-10-01T21:15:00.000Z" }, demoTruck, /partida/],
    ["delivery window", withStop(1, { windowEndAt: "2026-10-01T23:00:00+01:00" }), demoTruck, /paragens/],
    ["origin", withStop(0, { lat: 40.2 }), demoTruck, /paragens/],
    ["destination", withStop(1, { lng: -7.91 }), demoTruck, /paragens/],
    ["intermediate stop added", { ...job, stops: [...job.stops, { ...job.stops[1]!, id: "extra", sequence: 3 }] }, demoTruck, /paragens/],
    ["recorded authorization", { ...job, recordedFacts: { "authorization.pt-imt-aet": { value: true, source: "x" } } }, demoTruck, /factos/],
  ])("%s ⇒ STALE_INPUTS", (_label, mutated, truck, label) => {
    const s = assessPlannedJob(mutated, truck, REGULATION_DATASET);
    expect(s.state).toBe("STALE_INPUTS");
    if (s.state === "STALE_INPUTS") expect(s.changed.join(" ")).toMatch(label);
  });
  it("route geometry changed in storage ⇒ STALE_INPUTS", () => {
    const rc = job.routeCompliance!;
    const tampered: Job = { ...job, routeCompliance: { ...rc, route: { ...rc.route, polyline: rc.route.polyline.map((p) => [p[0] + 0.001, p[1]] as [number, number]) } } };
    const s = assessPlannedJob(tampered, demoTruck, REGULATION_DATASET);
    expect(s.state).toBe("STALE_INPUTS");
  });
  it("unchanged inputs ⇒ CURRENT", () => {
    expect(assessPlannedJob(job, demoTruck, REGULATION_DATASET).state).toBe("CURRENT");
  });
});

describe("dataset / event changes re-evaluate (not stale) and keep the audit trail", () => {
  const job = planned(REGULATION_DATASET);
  it("event added ⇒ CURRENT, now AFFECTED, finding listed, dataset changed", () => {
    const s = assessPlannedJob(job, demoTruck, WITH_EVENT);
    expect(s.state).toBe("CURRENT");
    if (s.state !== "CURRENT") return;
    expect(s.datasetChanged).toBe(true);
    expect(s.reevaluation.current.status).toBe("ROUTE_AFFECTED");
    expect(s.reevaluation.newFindings.map((f) => f.regulationId)).toEqual(["ip-ip3-corte-noturno-2026-09-vila-pouca-tondela-sul"]);
    // stored decision untouched
    expect(job.routeCompliance!.report.status).toBe("ROUTE_COMPLIANT");
  });
  it("event removed ⇒ the saved decision (made with it) no longer has findings", () => {
    const withEventDecision = planned(buildRegulationDataset([EVENT_ID]), { ...baseJob, plannedDepartureAt: "2026-10-01T12:00:00.000Z" });
    const s = assessPlannedJob(withEventDecision, demoTruck, REGULATION_DATASET);
    expect(s.state).toBe("CURRENT");
    if (s.state === "CURRENT") expect(s.reevaluation.newFindings).toEqual([]);
  });
  it("event modified (new version) ⇒ version change reported", () => {
    const modified: RegulationDataset = {
      ...WITH_EVENT,
      version: `${WITH_EVENT.version}-v2`,
      regulations: WITH_EVENT.regulations.map((r) => (r.kind === "ROAD_CLOSURE" ? { ...r, version: r.version + 1 } : r)),
    };
    const jobWith = planned(WITH_EVENT, { ...baseJob, plannedDepartureAt: "2026-10-01T12:00:00.000Z" });
    const s = assessPlannedJob(jobWith, demoTruck, modified);
    expect(s.state).toBe("CURRENT");
    if (s.state === "CURRENT") expect(s.reevaluation.versionChanges.length).toBe(2);
  });
});

describe("legacy and corrupted records never crash and never pretend", () => {
  const good = planned().routeCompliance!;
  const legacyNoInputs = { ...good, schemaVersion: undefined, inputs: undefined, inputFingerprint: undefined };
  it.each<[string, unknown, string]>([
    ["no decision on a planned job", undefined, "INSUFFICIENT_SAVED_ROUTE_DATA"],
    ["Phase-1 record (no geometry)", { report: good.report, facts: good.facts, route: { optionId: "route-0", title: "x", distanceM: 1, durationSec: 1, departAtIso: good.route.departAtIso } }, "INSUFFICIENT_SAVED_ROUTE_DATA"],
    ["Phase-1.5/2 record (no inputs snapshot)", legacyNoInputs, "REQUIRES_REEVALUATION"],
    ["missing report", { ...good, report: undefined }, "INSUFFICIENT_SAVED_ROUTE_DATA"],
    ["missing dataset version", { ...good, report: { ...good.report, datasetVersion: undefined } }, "INSUFFICIENT_SAVED_ROUTE_DATA"],
    ["corrupted polyline", { ...good, route: { ...good.route, polyline: [["a", "b"], ["c", "d"]] } }, "INSUFFICIENT_SAVED_ROUTE_DATA"],
    ["leg counts inconsistent", { ...good, route: { ...good.route, legPointCounts: [3] } }, "INSUFFICIENT_SAVED_ROUTE_DATA"],
    ["bad departure", { ...good, route: { ...good.route, departAtIso: "yesterday" } }, "INSUFFICIENT_SAVED_ROUTE_DATA"],
    ["route departure ≠ decision departure", { ...good, route: { ...good.route, departAtIso: "2026-10-05T10:00:00.000Z" } }, "INSUFFICIENT_SAVED_ROUTE_DATA"],
    ["not an object", "garbage", "INSUFFICIENT_SAVED_ROUTE_DATA"],
  ])("%s ⇒ %s", (_l, rc, expected) => {
    const job = { ...baseJob, routeCompliance: rc } as unknown as Job;
    expect(() => assessPlannedJob(job, demoTruck, WITH_EVENT)).not.toThrow();
    expect(assessPlannedJob(job, demoTruck, WITH_EVENT).state).toBe(expected);
  });
  it("backlog jobs are NOT_PLANNED", () => {
    expect(assessPlannedJob({ ...planned(), status: "backlog" }, demoTruck, WITH_EVENT).state).toBe("NOT_PLANNED");
  });
  it("reader reports why a record is unusable", () => {
    const r = readComplianceRecord({ ...good, route: { ...good.route, polyline: [] } });
    expect(r.kind).toBe("unusable");
  });
});

describe("a new event across a collection of planned jobs (no provider calls)", () => {
  // Directional closure on synthetic road A, 21:00–05:00 on 1→2 Oct.
  const G = geometry("road-a", ROAD_A, { directional: true });
  const reg = closure("one-way-night", "road-a", { activePeriods: [period("2026-10-01T21:00", "2026-10-02T05:00")] });
  const before = dataset([], [G]);
  const after = dataset([reg], [G]);
  const mk = (id: string, enterLocal: string, reverse = false): Job => {
    const r = routeAlong(ROAD_A, at(enterLocal), 60, reverse);
    const opt: RoutePlanOption = { ...option(ORIG), id: `route-${id}`, polyline: r.points, legPointCounts: [r.points.length], legDurationSec: [(r.pointTimesMs.at(-1)! - r.pointTimesMs[0]!) / 1000], durationSec: (r.pointTimesMs.at(-1)! - r.pointTimesMs[0]!) / 1000, distanceM: 2500 };
    const job: Job = { ...baseJob, id, plannedDepartureAt: new Date(r.pointTimesMs[0]!).toISOString() };
    const depart = new Date(r.pointTimesMs[0]!);
    const input: EvaluationInput = { route: { points: r.points, pointTimesMs: r.pointTimesMs, timesAreEstimates: true }, stops: buildRouteStops(job, []), facts: buildTransportFacts(demoTruck, job) };
    const live = evaluateCompliance(before, input, OPTS);
    const rc = createComplianceRecord({ job, truck: demoTruck, dataset: before, option: opt, title: "t", departAt: depart, liveInput: input, evaluationOptions: OPTS, liveReport: live, followsOfficialAlternatives: [] });
    return { ...job, routeCompliance: rc! };
  };
  const collection = [
    mk("night-forward", "2026-10-01T23:00:00+01:00"),
    mk("night-reverse", "2026-10-01T23:00:00+01:00", true),
    mk("day-forward", "2026-10-01T14:00:00+01:00"),
    mk("other-night", "2026-10-03T23:00:00+01:00"),
  ];
  const statusOf = (ds: RegulationDataset) =>
    Object.fromEntries(collection.map((j) => {
      const s = assessPlannedJob(j, demoTruck, ds);
      return [j.id, s.state === "CURRENT" ? s.reevaluation.current.status : s.state];
    }));
  it("before the event: nothing affected", () => {
    expect(Object.values(statusOf(before)).every((s) => s === "ROUTE_COMPLIANT")).toBe(true);
  });
  it("after the event: only the job in the closed direction during active hours is affected", () => {
    expect(statusOf(after)).toEqual({
      "night-forward": "ROUTE_AFFECTED",
      "night-reverse": "ROUTE_COMPLIANT",
      "day-forward": "ROUTE_COMPLIANT",
      "other-night": "ROUTE_COMPLIANT",
    });
  });
});

describe("stored jobs migration", () => {
  it("drops malformed entries, adds dated windows to demo jobs only, never reinterprets real jobs", () => {
    const demo = seedJobs.find((j) => j.id === "J-DEMO-IP3")!;
    const oldDemo = { ...demo, plannedDepartureAt: undefined, stops: demo.stops.map((s) => ({ ...s, windowStartAt: undefined, windowEndAt: undefined })) };
    // A user (non-demo) job: since Phase 5 every seed record is labelled demo, so build one explicitly.
    const real = { ...seedJobs.find((j) => j.id === "J-4201")!, id: "J-USER-1", isDemo: undefined };
    const out = migrateStoredJobs([oldDemo, real, null, { nope: true }, "x"], seedJobs);
    const d = out.find((j) => j.id === demo.id)!;
    expect(d.stops[1]!.windowEndAt).toBe(demo.stops[1]!.windowEndAt);
    expect(d.plannedDepartureAt).toBe(demo.plannedDepartureAt);
    const r = out.find((j) => j.id === real.id)!;
    expect(r.stops.every((s) => s.windowEndAt === undefined)).toBe(true);
    expect(out.some((j) => (j as unknown as { nope?: boolean }).nope)).toBe(false);
  });
  it("non-array storage falls back to seed", () => {
    expect(migrateStoredJobs({ bad: 1 }, seedJobs).length).toBe(seedJobs.length);
  });
});
