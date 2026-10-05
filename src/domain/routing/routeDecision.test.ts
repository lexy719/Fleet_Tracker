import { describe, expect, it } from "vitest";
import { acceptanceFixture, fixturePath, fixtureRoute, FIXTURE_DEPART } from "./acceptanceFixtures";
import { decideRoutes, dominates, sameRouteFamily, type DecisionCandidate } from "./routeDecision";
import { operationalTimeline } from "../../regulations/operationalTimeline";
import { assessOptionWindows, optionWindowStatus } from "../../regulations/alternatives";
import { simulateDrivingSchedule } from "../../ops/euDrivingRules";
import { makeJob, makeTruck } from "../__tests__/fixtures";
import { nextCountdown } from "../../ui/work/workModel";
import { createComplianceRecord } from "../../regulations/decisionRecord";
import { DEFAULT_TIMING_MODEL, routeTimingInput } from "../../regulations/timeline";
import { evaluateCompliance } from "../../regulations/evaluate";
import { closure, dataset, geometry, ROAD_A, ROAD_B } from "../../regulations/__tests__/helpers";
import { assessPlannedJob } from "../../regulations/reevaluate";
import { solveStrategy } from "../../solver/solver";
import { cleanRouteInputsKey } from "../../solver/reuse";
import { tomtomAvoidRequest } from "../../solver/tomtomProvider";

const clean = acceptanceFixture("Uma decisão").candidates[0]!;
const candidate = (id: string, min: number, eur: number, distinct = false): DecisionCandidate => ({ ...clean, option: fixtureRoute(id, min, eur, distinct ? fixturePath([[41, -8.7], [41.045, -8.6], [41, -8.5]]) : undefined), elapsedSec: min * 60 });

describe("Decision pipeline — no UI quota", () => {
  it.each([
    ["Uma decisão", 1, 0, "A"], ["Duas decisões com troca material", 2, 0, "B"],
    ["Obras: direto ainda melhor", 1, 0, "A"], ["Obras: desvio local melhor", 1, 0, "B"],
    ["VCI: proibição aplicável", 1, 1, "Desvio"], ["Proibição com desvio válido", 1, 1, "B"], ["Nenhuma rota executável", 0, 2, null],
  ] as const)("%s", (name, decisions, excluded, recommended) => {
    const { result } = acceptanceFixture(name);
    expect(result.decisions).toHaveLength(decisions);
    expect(result.excludedCandidateCount).toBe(excluded);
    expect(result.recommendedRouteId).toBe(recommended);
    if (!decisions) expect(result.decisionStatus).toBe("NO_EXECUTABLE_ROUTE");
  });
  it("many duplicate candidates collapse geometrically and preserve all provenance", () => {
    const pool = Array.from({ length: 12 }, (_, i) => ({ ...candidate(`r${i}`, 42, 12), provenance: [`provider-${i}`] }));
    const r = decideRoutes(pool);
    expect(r.evaluatedCandidateCount).toBe(12);
    expect(r.decisions).toHaveLength(1);
    expect(r.decisions[0]!.provenance).toHaveLength(12);
    expect(r.fastestRouteId).toBe(r.bestValueRouteId);
  });
  it("same metrics on different roads are not route equivalence but can be the same decision", () => {
    const a = candidate("a", 43, 12.3), b = candidate("b", 43.75, 12.1, true);
    expect(sameRouteFamily(a.option, b.option)).toBe(false);
    expect(decideRoutes([a, b]).decisions).toHaveLength(1);
  });
  it("opposite directions do not become the same route family", () => {
    const a = candidate("a", 42, 12), b = {...a.option, polyline: [...a.option.polyline].reverse()};
    expect(sameRouteFamily(a.option, b)).toBe(false);
  });
  it("a tiny local geometry deviation remains one family", () => {
    const a = candidate("a", 42, 12), b = candidate("b", 42.1, 12);
    b.option = { ...b.option, polyline: b.option.polyline.map(([lat, lng], i) => [lat + (i === 50 ? 0.00005 : 0), lng]) };
    expect(sameRouteFamily(a.option, b.option)).toBe(true);
    expect(decideRoutes([a, b]).decisions).toHaveLength(1);
  });
  it("dominance removes a strictly worse different corridor", () => {
    const a = candidate("a", 42, 12), b = candidate("b", 46, 13, true);
    expect(dominates(a, b)).toBe(true);
    expect(decideRoutes([a, b]).decisions.map((d) => d.routeId)).toEqual(["a"]);
  });
  it("material cost advantage survives dominance", () => {
    const a = candidate("a", 43, 14), b = candidate("b", 48, 8, true);
    expect(dominates(a, b)).toBe(false);
    expect(decideRoutes([a, b]).decisions).toHaveLength(2);
  });
  it("unknown remains unknown and does not create extra cards", () => {
    const a = { ...candidate("a", 42, 12), report: { ...clean.report!, status: "POTENTIALLY_AFFECTED" as const } };
    const r = decideRoutes([a, { ...a, option: { ...a.option, id: "copy" } }]);
    expect(r.decisions).toHaveLength(1);
    expect(r.decisionStatus).toBe("RECOMMENDED_WITH_UNCERTAINTY");
    expect(r.unresolvedIssues.join(" ")).toMatch(/parcial/);
  });
  it("stable corridor survives seconds/cents improvements, but never a hard-invalid route", () => {
    const old = candidate("z-old", 43, 12.3), improved = candidate("a-new", 42.9, 12.2, true);
    expect(decideRoutes([old, improved], old.option).recommendedRouteId).toBe("z-old");
    const bad = { ...old, criticalHours: true };
    expect(decideRoutes([bad, improved], old.option).recommendedRouteId).toBe("a-new");
  });
  it("missed window and unavailable evaluation cannot become selectable plans", () => {
    const r = decideRoutes([{ ...clean, window: "missed" }, { ...candidate("missing", 20, 1), report: undefined }]);
    expect(r.decisions).toHaveLength(0);
    expect(r.excluded).toHaveLength(2);
  });
});

describe("Canonical timeline / windows / persisted arrival", () => {
  it.each([[240, 0, 0], [270, 0, 0], [271, 1, 0], [423, 1, 0], [600, 1, 1], [1200, 2, 2]])("%i driving minutes", (min, breaks, rests) => {
    const route = fixtureRoute("r", min);
    const t = operationalTimeline(route, FIXTURE_DEPART);
    expect(t.breakCount).toBe(breaks);
    expect(t.restCount).toBe(rests);
    expect(t.arrivalMs).toBe(FIXTURE_DEPART + t.elapsedSec * 1000);
    expect(t.timing.arrivalMs).toBe(t.arrivalMs);
    expect(t.elapsedSec).toBe(simulateDrivingSchedule(min * 60, 0).totalElapsedSec);
  });
  it("Vieira timing and window share the same break-inclusive ETA", () => {
    const route = fixtureRoute("r", 423);
    const job = makeJob();
    job.stops = [job.stops[0]!, { ...job.stops[2]!, sequence: 2 }];
    job.stops[0] = { ...job.stops[0]!, windowStartAt: new Date(FIXTURE_DEPART - 60_000).toISOString(), windowEndAt: new Date(FIXTURE_DEPART + 60 * 60_000).toISOString() };
    job.stops[1] = { ...job.stops[1]!, windowStartAt: new Date(FIXTURE_DEPART + 400 * 60_000).toISOString(), windowEndAt: new Date(FIXTURE_DEPART + 450 * 60_000).toISOString() };
    const t = operationalTimeline(route, FIXTURE_DEPART);
    const windows = assessOptionWindows(route, job, FIXTURE_DEPART, 0);
    expect(t.elapsedSec / 60).toBe(468);
    expect(windows[1]!.etaEarliestIso).toBe(t.arrivalAtIso);
    expect(windows[1]!.etaLatestIso).toBe(t.arrivalAtIso);
    expect(optionWindowStatus(route, job, FIXTURE_DEPART, 0)).toBe("missed");
    job.stops[1]!.windowEndAt = new Date(FIXTURE_DEPART + 500 * 60_000).toISOString();
    expect(optionWindowStatus(route, job, FIXTURE_DEPART, 0)).toBe("achievable");
  });
  it("provider summary / leg rounding cannot split the operational and passage timelines", () => {
    const route = {...fixtureRoute("rounding", 423), legDurationSec: [420 * 60] };
    const t = operationalTimeline(route, FIXTURE_DEPART);
    expect(t.legDurationSec).toEqual([423 * 60]);
    expect(t.timing.arrivalMs).toBe(t.arrivalMs);
    expect(t.stopArrivalMs[1]).toBe(t.arrivalMs);
    expect(t.routeInput.pointTimesMs.at(-1)).toBe(t.arrivalMs);
  });
  it("crosses midnight without resetting elapsed time", () => {
    const depart = Date.parse("2026-10-06T23:30:00+01:00");
    expect(operationalTimeline(fixtureRoute("r", 300), depart).arrivalAtIso).toBe("2026-10-07T04:15:00.000Z");
  });
  it("provider traffic delay is already included, not counted twice", () => {
    const route = { ...fixtureRoute("r", 240), trafficDelaySec: 1800 };
    expect(operationalTimeline(route, FIXTURE_DEPART).elapsedSec).toBe(240 * 60);
  });
  it("handles a daily rest needed before departure consistently", () => {
    const t = operationalTimeline(fixtureRoute("r", 60), FIXTURE_DEPART, 9);
    expect(t.restCount).toBe(1);
    expect(t.elapsedSec / 3600).toBe(12);
  });
  it("persists the exact operational arrival while retaining provider driving time", () => {
    const route = fixtureRoute("r", 423), job = makeJob(), ds = dataset([], []);
    const liveInput = { route: routeTimingInput(route.polyline, route.legPointCounts, route.legDurationSec, FIXTURE_DEPART, DEFAULT_TIMING_MODEL), facts: {}, stops: [] };
    const rc = createComplianceRecord({ job, truck: null, dataset: ds, option: route, title: "Recomendada", departAt: new Date(FIXTURE_DEPART), liveInput, evaluationOptions: { timeToleranceMin: 15, sampleStepMin: 5, timing: DEFAULT_TIMING_MODEL }, liveReport: evaluateCompliance(ds, liveInput), followsOfficialAlternatives: [] })!;
    expect(rc.route.arrivalAtIso).toBe(operationalTimeline(route, FIXTURE_DEPART).arrivalAtIso);
    expect(rc.route.operationalDurationSec).toBe(468 * 60);
    expect(rc.route.durationSec).toBe(423 * 60);
  });
  it("tomorrow countdown uses actual now and rejects time-only/unknown dates", () => {
    const job = { ...makeJob(), pickupDeadline: "2026-10-06T06:30:00+01:00" };
    expect(nextCountdown(job, new Date("2026-10-05T19:00:00+01:00"))!.minutes).toBe(690);
    const legacy = { ...job, stops: job.stops.map((s) => ({...s, windowEndAt: undefined, windowStartAt: undefined})) };
    expect(nextCountdown({ ...legacy, pickupDeadline: "06:30" }, new Date(FIXTURE_DEPART))).toBeNull();
    expect(nextCountdown({ ...legacy, pickupDeadline: "" }, new Date(FIXTURE_DEPART))).toBeNull();
    expect(nextCountdown({ ...legacy, pickupDeadline: "2026-10-06T06:30" }, new Date(FIXTURE_DEPART))).toBeNull();
    const datedStop = { ...job, pickupDeadline: "2026-10-06T06:30", stops: [{...job.stops[0]!, windowEndAt:"2026-10-06T06:30:00+01:00"}] };
    expect(nextCountdown(datedStop, new Date("2026-10-05T19:00:00+01:00"))!.minutes).toBe(690);
    expect(nextCountdown(job, new Date("2026-10-06T07:00:00+01:00"))!.label).toMatch(/atrasada/);
  });
});

describe("Solver cache input integrity", () => {
  it("a stop window, role or municipality change invalidates reuse even with identical coordinates", () => {
    const base = {jobId:"j", stops:makeJob().stops, truckId:"t", cargoKg:24000, departAtIso:new Date(FIXTURE_DEPART).toISOString(), strategy:"FASTEST" as const, facts:{}};
    const key = cleanRouteInputsKey(base);
    for (const change of [{windowEndAt:"2026-10-07T06:30:00+01:00"}, {type:"delivery" as const}, {municipality:"Porto"}]) {
      expect(cleanRouteInputsKey({...base, stops:base.stops.map((s,i)=> i ? s : {...s,...change})})).not.toBe(key);
    }
  });
});

describe("Accepted restrictions — complete reevaluation", () => {
  it.each(["vehicle", "adr", "direction", "time"] as const)("%s applicability can exclude or permit the SAME geometry", (kind) => {
    const route = fixtureRoute("r", 60);
    const reg = closure("rule", "A", kind === "time" ? { windows: [{ start: "06:20", end: "07:00", evidence: ["test-evidence"] }] } : {}, {
      appliesTo: kind === "vehicle" || kind === "adr" ? { kind: "fact", fact: kind, op: "eq", value: true, label: kind, evidence: ["test-evidence"] } : { kind: "all", of: [] },
    });
    const ds = dataset([reg], [geometry("A", ROAD_A, { directional: kind === "direction" })]);
    const evaluate = (reverse: boolean, depart: number, value: boolean) => {
      const polyline = reverse ? [...route.polyline].reverse() : route.polyline;
      return evaluateCompliance(ds, { route: routeTimingInput(polyline, [polyline.length], [3600], depart, DEFAULT_TIMING_MODEL), stops: [], facts: { [kind]: { value, status: "known", source: "fixture" } } });
    };
    expect(evaluate(false, FIXTURE_DEPART, true).status).toBe("ROUTE_AFFECTED");
    const allowed = evaluate(kind === "direction", kind === "time" ? FIXTURE_DEPART + 3_600_000 : FIXTURE_DEPART, false);
    expect(allowed.status).toBe("ROUTE_COMPLIANT");
    if (kind === "time") expect(evaluate(false, FIXTURE_DEPART, true).results[0]!.exposure!.fromIso).not.toBe(new Date(FIXTURE_DEPART).toISOString());
  });
  it("soft works never request avoidance or invent delay", async () => {
    const direct = fixtureRoute("a");
    const ds = dataset([closure("works", "A", {}, {kind: "OPERATIONAL_IMPACT", effect: "advisory"})], [geometry("A", ROAD_A)]);
    let calls = 0;
    const solved = await solveStrategy({ strategy: "FASTEST", baseline: direct, inputsKey: "soft", getDataset: async () => ds, provider: { name: "test", describe: tomtomAvoidRequest, route: async () => {calls++; return direct;} }, evaluate: (o,d) => evaluateCompliance(d,{route:routeTimingInput(o.polyline,o.legPointCounts,o.legDurationSec,FIXTURE_DEPART,DEFAULT_TIMING_MODEL), facts:{}, stops:[]}) });
    expect(calls).toBe(0);
    expect(solved.finalOption?.durationSec).toBe(direct.durationSec);
    expect(solved.result.deviations).toHaveLength(0);
  });
  it("avoiding A never silently accepts a new B conflict; requests remain bounded", async () => {
    const direct = fixtureRoute("a"), via = acceptanceFixture("Nenhuma rota executável").candidates[1]!.option;
    const ds = dataset([closure("a", "A", {}), closure("b", "B", {})], [geometry("A", ROAD_A), geometry("B", ROAD_B)]);
    let calls = 0;
    const solved = await solveStrategy({ strategy: "FASTEST", baseline: direct, inputsKey: "test", getDataset: async () => ds,
      provider: { name: "synthetic", describe: tomtomAvoidRequest, route: async () => { calls++; return via; } },
      evaluate: (o, d) => evaluateCompliance(d, { route: routeTimingInput(o.polyline, o.legPointCounts, o.legDurationSec, FIXTURE_DEPART, DEFAULT_TIMING_MODEL), facts: {}, stops: [] }),
    });
    expect(solved.finalOption).toBeNull();
    expect(solved.result.attempts[1]!.applies.map((r) => r.constraintId)).toContain("b");
    expect(calls).toBeLessThanOrEqual(6);
  });
  it("new hard restriction flags a confirmed route; soft information does not invalidate it", () => {
    const route = fixtureRoute("r"), job = { ...makeJob(), status: "in_transit" as const }, truck = makeTruck(), ds = dataset([], []);
    const liveInput = { route: routeTimingInput(route.polyline, route.legPointCounts, route.legDurationSec, FIXTURE_DEPART, DEFAULT_TIMING_MODEL), facts: {}, stops: [] };
    job.routeCompliance = createComplianceRecord({ job, truck, dataset: ds, option: route, title: "r", departAt: new Date(FIXTURE_DEPART), liveInput, evaluationOptions: { timeToleranceMin: 15, sampleStepMin: 5, timing: DEFAULT_TIMING_MODEL }, liveReport: evaluateCompliance(ds, liveInput), followsOfficialAlternatives: [] })!;
    job.plannedDepartureAt = new Date(FIXTURE_DEPART).toISOString();
    const hard = dataset([closure("new", "A", {})], [geometry("A", ROAD_A)]);
    const before = JSON.stringify(job);
    const state = assessPlannedJob(job, truck, hard);
    expect(state.state).toBe("CURRENT");
    if (state.state === "CURRENT") expect(state.reevaluation.current.status).toBe("ROUTE_AFFECTED");
    const soft = dataset([closure("works", "A", {}, { kind: "OPERATIONAL_IMPACT", effect: "advisory" })], [geometry("A", ROAD_A)]);
    const softState = assessPlannedJob(job, truck, soft);
    if (softState.state === "CURRENT") expect(softState.reevaluation.current.status).toBe("ROUTE_COMPLIANT");
    expect(JSON.stringify(job)).toBe(before);
  });
});
