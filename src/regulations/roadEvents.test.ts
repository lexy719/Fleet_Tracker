import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/tomtomCoimbraViseuIp3.json";
import { demoJobs as jobs, demoTrucks as trucks } from "../data/mockData";
import type { Job } from "../data/types";
import type { RoutePlanOption } from "../tomtom/planRoutes";
import { avoidancePlan, officialAlternativesFollowed, toPersistedRoute, verdictFor } from "./alternatives";
import { evaluateCompliance, evaluateRegulation } from "./evaluate";
import { buildRouteStops, buildTransportFacts } from "./fleetFacts";
import { estimatePointTimes } from "./geometry";
import { PT_ROAD_EVENTS } from "./portugal/roadEvents";
import { reevaluatePlannedJob } from "./reevaluate";
import { buildRegulationDataset, REGULATION_DATASET, validateDataset } from "./repository";
import type { ComplianceReport, EvaluationInput } from "./types";

type FixtureRoute = { lengthInMeters: number; travelTimeInSeconds: number; legs: { travelTimeInSeconds: number; points: number[][] }[] };
const ORIGINAL = fixture.original as FixtureRoute;
const AVOIDING = fixture.avoidAreas as FixtureRoute;

const EVENT_ID = PT_ROAD_EVENTS[0]!.id;
const WITH_EVENT = buildRegulationDataset([EVENT_ID]);
const CLOSURE_VP_TS = "ip-ip3-corte-noturno-2026-09-vila-pouca-tondela-sul";
const CLOSURE_CANAS_SMO = "ip-ip3-corte-noturno-2026-09-canas-sao-miguel";

const demoJob = jobs.find((j) => j.id === "J-DEMO-IP3")!;
const truck = trucks.find((t) => t.id === "t-demo-vci")!;
const pointsOf = (r: FixtureRoute) => r.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number]));

function input(r: FixtureRoute, departIso: string): EvaluationInput {
  const points = pointsOf(r);
  return {
    route: {
      points,
      pointTimesMs: estimatePointTimes(points, r.legs.map((l) => l.points.length), r.legs.map((l) => l.travelTimeInSeconds), Date.parse(departIso)),
      timesAreEstimates: true,
    },
    stops: buildRouteStops(demoJob, WITH_EVENT.areas),
    facts: buildTransportFacts(truck, demoJob),
  };
}

const outcomeOf = (report: ComplianceReport, id: string) => report.results.find((r) => r.regulationId === id)?.outcome;

describe("IP3 night closures as data", () => {
  it("dataset with the event validates and keeps VCI", () => {
    expect(validateDataset(WITH_EVENT)).toEqual([]);
    expect(WITH_EVENT.regulations.map((r) => r.kind).sort()).toEqual(["LEGAL_RESTRICTION", "ROAD_CLOSURE", "ROAD_CLOSURE"]);
    expect(WITH_EVENT.version).toContain(EVENT_ID);
  });

  it("without the event introduced, the real route is compliant", () => {
    expect(evaluateCompliance(REGULATION_DATASET, input(ORIGINAL, demoJob.plannedDepartureAt!)).status).toBe("ROUTE_COMPLIANT");
  });

  it("1 Oct 21:15 departure ⇒ ROUTE_AFFECTED by the Vila Pouca–Tondela Sul phase (active that night)", () => {
    const report = evaluateCompliance(WITH_EVENT, input(ORIGINAL, "2026-10-01T20:15:00Z"));
    expect(report.status).toBe("ROUTE_AFFECTED");
    expect(outcomeOf(report, CLOSURE_VP_TS)).toBe("APPLIES");
    expect(outcomeOf(report, CLOSURE_CANAS_SMO)).toBe("DOES_NOT_APPLY"); // route uses it, but not active that night
    const r = report.results.find((x) => x.regulationId === CLOSURE_VP_TS)!;
    expect(r.exposure!.lengthM).toBeGreaterThan(6_000);
    const local = new Date(r.exposure!.fromIso).toLocaleString("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hour12: false });
    expect(local >= "21:00" && local < "23:00").toBe(true);
  });

  it("30 Sep 21:15 departure ⇒ the Canas–São Miguel phase applies instead", () => {
    const report = evaluateCompliance(WITH_EVENT, input(ORIGINAL, "2026-09-30T20:15:00Z"));
    expect(outcomeOf(report, CLOSURE_CANAS_SMO)).toBe("APPLIES");
    expect(outcomeOf(report, CLOSURE_VP_TS)).toBe("DOES_NOT_APPLY");
  });

  it("after midnight, still inside the overnight closure (depart 2 Oct 00:15) ⇒ AFFECTED", () => {
    const report = evaluateCompliance(WITH_EVENT, input(ORIGINAL, "2026-10-01T23:15:00Z"));
    expect(outcomeOf(report, CLOSURE_VP_TS)).toBe("APPLIES");
  });

  it("passage before the closure starts (depart 1 Oct 19:00) ⇒ not applicable", () => {
    const report = evaluateCompliance(WITH_EVENT, input(ORIGINAL, "2026-10-01T18:00:00Z"));
    expect(outcomeOf(report, CLOSURE_VP_TS)).toBe("DOES_NOT_APPLY");
  });

  it("daytime and after-the-event departures are not affected", () => {
    expect(evaluateCompliance(WITH_EVENT, input(ORIGINAL, "2026-10-01T14:00:00Z")).status).toBe("ROUTE_COMPLIANT");
    expect(evaluateCompliance(WITH_EVENT, input(ORIGINAL, "2026-10-02T20:15:00Z")).status).toBe("ROUTE_COMPLIANT");
  });

  it("passage estimated right at the 21:00 start ⇒ UNKNOWN (timing tolerance)", () => {
    const at = evaluateRegulation(WITH_EVENT.regulations.find((r) => r.id === CLOSURE_VP_TS)!, WITH_EVENT, input(ORIGINAL, "2026-10-01T20:15:00Z"));
    const offsetMs = Date.parse(at.exposure!.fromIso) - Date.parse("2026-10-01T20:15:00Z");
    const departForNine = new Date(Date.parse("2026-10-01T20:00:00Z") - offsetMs).toISOString(); // passage ≈ 21:00 Lisbon
    const r = evaluateRegulation(WITH_EVENT.regulations.find((x) => x.id === CLOSURE_VP_TS)!, WITH_EVENT, input(ORIGINAL, departForNine));
    expect(r.outcome).toBe("UNKNOWN");
    expect(r.reasons.some((x) => x.kind === "timing")).toBe(true);
  });

  it("the avoidAreas alternative avoids the closure; the official EN2 diversion is only descriptive", () => {
    const original = evaluateCompliance(WITH_EVENT, input(ORIGINAL, "2026-10-01T20:15:00Z"));
    const plan = avoidancePlan(original, WITH_EVENT)!;
    expect(plan.derivedFrom).toEqual([CLOSURE_VP_TS]);
    const alt = evaluateCompliance(WITH_EVENT, input(AVOIDING, "2026-10-01T20:15:00Z"));
    expect(verdictFor(alt)).toBe("compliant");
    const via = officialAlternativesFollowed(pointsOf(AVOIDING), [CLOSURE_VP_TS], WITH_EVENT);
    // Observed: TomTom's avoidAreas route goes via A1/A25, not the signed EN2 diversion.
    expect(via.every((v) => v.matchedKm < 5)).toBe(true);
  });
});

describe("planned-job re-evaluation", () => {
  function plannedJob(): Job {
    const opt: RoutePlanOption = {
      id: "route-0", title: "", subtitle: "", polyline: pointsOf(ORIGINAL),
      distanceM: ORIGINAL.lengthInMeters, durationSec: ORIGINAL.travelTimeInSeconds, trafficDelaySec: 0,
      fuelCostEur: 0, tollCostEur: 0, tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none", tollSectionCount: 0,
      stopArrivals: [], legDurationSec: ORIGINAL.legs.map((l) => l.travelTimeInSeconds),
      legPointCounts: ORIGINAL.legs.map((l) => l.points.length), roadNumbers: [],
      departAtIso: "2026-10-01T20:15:00Z", colorIndex: 0, routing: { role: "primary", params: {} },
    };
    const facts = buildTransportFacts(truck, demoJob);
    // Planned while the event was NOT yet introduced.
    const report = evaluateCompliance(REGULATION_DATASET, input(ORIGINAL, "2026-10-01T20:15:00Z"));
    return {
      ...demoJob,
      status: "assigned",
      routeCompliance: {
        report,
        facts,
        route: toPersistedRoute(opt, "Mais rápida", "2026-10-01T20:15:00Z", []),
        evidence: [],
        acknowledged: false,
        confirmedAt: "2026-09-30T16:00:00Z",
      },
    };
  }

  it("a route planned before the event becomes affected once the event is introduced", () => {
    const job = plannedJob();
    expect(job.routeCompliance!.report.status).toBe("ROUTE_COMPLIANT");
    expect(reevaluatePlannedJob(job, REGULATION_DATASET)!.newFindings).toEqual([]);
    const re = reevaluatePlannedJob(job, WITH_EVENT)!;
    expect(re.current.status).toBe("ROUTE_AFFECTED");
    expect(re.newFindings.map((f) => f.regulationId)).toEqual([CLOSURE_VP_TS]);
    expect(re.newFindings[0]!.exposure).toBeDefined();
  });

  it("backlog jobs and jobs without persisted geometry are skipped", () => {
    expect(reevaluatePlannedJob({ ...plannedJob(), status: "backlog" }, WITH_EVENT)).toBeNull();
    expect(reevaluatePlannedJob(demoJob, WITH_EVENT)).toBeNull();
  });
});

describe("legacy persisted records", () => {
  it("a record saved before geometry was persisted is skipped, not a crash", () => {
    const legacy = {
      ...demoJob,
      status: "assigned",
      routeCompliance: { report: { status: "ROUTE_COMPLIANT", results: [] }, facts: {}, route: { optionId: "route-0", distanceM: 1, durationSec: 1 } },
    } as unknown as Job;
    expect(reevaluatePlannedJob(legacy, WITH_EVENT)).toBeNull();
  });
});
