import { describe, expect, it } from "vitest";
import caopJson from "../../../public/data/caop2025-municipios.json";
import tomtomLeixoesEspinho from "../../regulations/__fixtures__/tomtomLeixoesEspinho.json";
import tomtomCoimbraViseu from "../../regulations/__fixtures__/tomtomCoimbraViseuIp3.json";
import { demoJobs as seedJobs, demoTrucks as trucks } from "../../data/mockData";
import type { Job } from "../../data/types";
import { createComplianceRecord } from "../../regulations/decisionRecord";
import { evaluateCompliance, type EvaluateOptions } from "../../regulations/evaluate";
import { buildRouteStops, buildTransportFacts } from "../../regulations/fleetFacts";
import { estimatePointTimes, pointToSegmentM } from "../../regulations/geometry";
import { assessPlannedJob } from "../../regulations/reevaluate";
import { buildRegulationDataset, REGULATION_DATASET } from "../../regulations/repository";
import type { RoutePlanOption } from "../../tomtom/planRoutes";
import { assessRouteCoverage, candidateNearRoute, NEARBY_M, RouteProximityIndex } from "../coverage";
import { destinationPoint } from "./geo";
import { assessFreshness } from "../freshness";
import { isMunicipalityDataset, MunicipalityIndex } from "../municipalities";
import { buildIngestedConstraints, runSource, type FetchImpl } from "../pipeline";
import { getSource, SOURCES } from "../sources";
import { MemoryIngestionStore } from "../store";
import type { Freshness, MunicipalityDataset, SourceRecord } from "../types";
import { fixture, scriptedFetch, syntheticDatex } from "./helpers";

const CAOP = caopJson as unknown as MunicipalityDataset;
const INDEX = new MunicipalityIndex(CAOP);
const NOW = new Date("2026-09-30T18:00:00Z");

type FR = { legs: { travelTimeInSeconds: number; points: number[][] }[]; lengthInMeters: number; travelTimeInSeconds: number };
const pts = (r: FR) => r.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number]));
const LEIXOES_ESPINHO = pts((tomtomLeixoesEspinho as unknown as { original: FR }).original);

describe("CAOP municipality registry", () => {
  it("is the official DGT dataset with provenance, 278 mainland municipalities", () => {
    expect(isMunicipalityDataset(CAOP)).toBe(true);
    expect(CAOP.count).toBe(278);
    expect(CAOP.authority).toMatch(/Direção-Geral do Território/);
    expect(CAOP.license).toMatch(/CC-BY/);
  });
  it.each([
    [41.1496, -8.6109, "Porto"], // Avenida dos Aliados
    [41.0072, -8.6411, "Espinho"],
    [40.2033, -8.4103, "Coimbra"],
    [38.7071, -9.1355, "Lisboa"],
  ])("(%f, %f) ⇒ %s", (lat, lng, name) => {
    const r = INDEX.lookup(lat, lng);
    expect(r.status).toBe("inside");
    if (r.status === "inside") expect(r.municipality.name).toBe(name);
  });
  it("a point on the Porto/Gaia boundary (Douro, Ponte Luiz I) ⇒ near_border (UNKNOWN), not guessed", () => {
    const r = INDEX.lookup(41.1399, -8.6093);
    expect(r.status).toBe("near_border");
  });
  it("Madrid ⇒ outside the dataset", () => {
    expect(INDEX.lookup(40.4168, -3.7038).status).toBe("outside_dataset");
  });
});

function freshnessFor(states: Record<string, Freshness["state"]>): Record<string, Freshness> {
  return Object.fromEntries(SOURCES.map((s) => [s.id, { state: states[s.id] ?? "UNKNOWN", reason: "test" } as Freshness]));
}

describe("route coverage (never changes the compliance status, qualifies it)", () => {
  it("Leixões → Espinho: partial coverage, Porto municipal source stale, known ZAR not encoded", () => {
    const cov = assessRouteCoverage({
      route: LEIXOES_ESPINHO,
      index: INDEX,
      sources: SOURCES,
      freshness: freshnessFor({ "porto-datex-programados": "STALE", "ip-arcgis-condicionamentos": "STALE" }),
      candidates: [],
      status: "ROUTE_COMPLIANT",
    });
    const names = cov.municipalities.map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(["Matosinhos", "Porto", "Vila Nova de Gaia", "Espinho"]));
    expect(cov.municipalities.find((m) => m.name === "Porto")!.temporaryEvents).toBe("COVERED_NOT_FRESH");
    expect(cov.municipalities.find((m) => m.name === "Espinho")!.temporaryEvents).toBe("NO_SOURCE");
    expect(cov.complete).toBe(false);
    expect(cov.headline).toMatch(/^NO KNOWN CONSTRAINT FOUND BUT COVERAGE IS PARTIAL/);
    expect(cov.headline).toMatch(/KNOWN RESTRICTION NOT ENCODED/);
    expect(cov.knownNotEncoded[0]!.label).toMatch(/ZAR/);
  });

  it("without the municipal registry ⇒ municipalities unknown, still partial", () => {
    const cov = assessRouteCoverage({ route: LEIXOES_ESPINHO, index: null, sources: SOURCES, freshness: {}, candidates: [], status: "ROUTE_COMPLIANT" });
    expect(cov.municipalities).toEqual([]);
    expect(cov.unresolvedSamples).toBe(cov.totalSamples);
    expect(cov.notes.join(" ")).toMatch(/CAOP.*não carregado/);
    expect(cov.headline).toMatch(/PARTIAL/);
  });

  it("unreviewed IP reports near the route are surfaced; far ones are not", async () => {
    const store = new MemoryIngestionStore();
    const ip = getSource("ip-arcgis-condicionamentos")!;
    await runSource(ip, { store, fetch: scriptedFetch([fixture("ipArcgisCondicionamentos.json")]) as FetchImpl, now: NOW });
    const cands = await store.getAllCandidates();
    const review = cands.filter((c) => c.gate.decision === "REVIEW_REQUIRED");
    expect(review.length).toBeGreaterThan(0);
    const target = review[0]!;
    const p = target.fields.geometry.value!;
    if (p.kind !== "point") throw new Error("expected point");
    const through: [number, number][] = [[p.point[0] - 0.01, p.point[1]], [p.point[0] + 0.01, p.point[1]]];
    expect(candidateNearRoute(target, through)).toBe(true);
    expect(candidateNearRoute(target, [[p.point[0] - 0.01, p.point[1] + 0.05], [p.point[0] + 0.01, p.point[1] + 0.05]])).toBe(false);
    const cov = assessRouteCoverage({ route: through, index: INDEX, sources: SOURCES, freshness: {}, candidates: cands, status: "ROUTE_COMPLIANT" });
    expect(cov.unresolvedNearby.map((c) => c.id)).toContain(target.id);
    expect(cov.headline).toMatch(/UNREVIEWED REPORT/);
  });
});

describe("route proximity grid is exact (same answer as brute force)", () => {
  const brute = (p: [number, number], route: [number, number][]) => {
    let b = Infinity;
    for (let i = 1; i < route.length; i++) b = Math.min(b, pointToSegmentM(p, route[i - 1]!, route[i]!));
    return b <= NEARBY_M;
  };
  it("random points around the Leixões → Espinho route", () => {
    const px = new RouteProximityIndex(LEIXOES_ESPINHO, NEARBY_M);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let near = 0;
    for (let k = 0; k < 3000; k++) {
      const base = LEIXOES_ESPINHO[Math.floor(rnd() * LEIXOES_ESPINHO.length)]!;
      const p = destinationPoint(base, rnd() * 360, rnd() * 400);
      const expected = brute(p, LEIXOES_ESPINHO);
      if (expected) near++;
      expect(px.near(p)).toBe(expected);
    }
    expect(near).toBeGreaterThan(300); // both sides of the threshold were exercised
    expect(near).toBeLessThan(2900);
  });
  it("single-point and empty routes", () => {
    expect(new RouteProximityIndex([[41, -8.6]], NEARBY_M).near([41.0005, -8.6])).toBe(true);
    expect(new RouteProximityIndex([[41, -8.6]], NEARBY_M).near([41.01, -8.6])).toBe(false);
    expect(new RouteProximityIndex([], NEARBY_M).near([41, -8.6])).toBe(false);
  });
});

describe("planned-job re-evaluation from ingested constraints", () => {
  const OPTS: EvaluateOptions = { timeToleranceMin: 15, sampleStepMin: 5 };
  const truck = trucks.find((t) => t.id === "t-demo-vci")!;
  const job: Job = { ...seedJobs.find((j) => j.id === "J-DEMO-IP3")!, status: "assigned", assignedTruckId: truck.id };
  const ORIG = (tomtomCoimbraViseu as unknown as { original: FR }).original;
  const poly = pts(ORIG);
  const depart = new Date(job.plannedDepartureAt!);
  const opt: RoutePlanOption = {
    id: "route-0", title: "", subtitle: "", polyline: poly, distanceM: ORIG.lengthInMeters, durationSec: ORIG.travelTimeInSeconds, trafficDelaySec: 0,
    fuelCostEur: 0, tollCostEur: 0, tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none", tollSectionCount: 0, stopArrivals: [],
    legDurationSec: ORIG.legs.map((l) => l.travelTimeInSeconds), legPointCounts: ORIG.legs.map((l) => l.points.length), roadNumbers: [],
    departAtIso: depart.toISOString(), colorIndex: 0, routing: { role: "primary", params: {} },
  };
  const liveInput = {
    route: { points: poly, pointTimesMs: estimatePointTimes(poly, opt.legPointCounts, opt.legDurationSec, depart.getTime()), timesAreEstimates: true, tripWindowMs: [depart.getTime(), depart.getTime() + opt.durationSec * 1000] as [number, number] },
    stops: buildRouteStops(job, REGULATION_DATASET.areas),
    facts: buildTransportFacts(truck, job),
  };
  const live = evaluateCompliance(REGULATION_DATASET, liveInput, OPTS);
  const rc = createComplianceRecord({ job, truck, dataset: REGULATION_DATASET, option: opt, title: "t", departAt: depart, liveInput, evaluationOptions: OPTS, liveReport: live, followsOfficialAlternatives: [] });
  const planned: Job = { ...job, routeCompliance: rc! };

  /** SYNTHETIC closure over a 3 km stretch of the saved route (structure identical to DATEX). */
  const stretch = poly.slice(Math.floor(poly.length / 2), Math.floor(poly.length / 2) + 60);
  const SRC: SourceRecord = { ...getSource("porto-datex-programados")!, id: "synthetic-datex" };

  it("the saved decision was compliant against the curated dataset", () => {
    expect(rc).not.toBeNull();
    expect(assessPlannedJob(planned, truck, REGULATION_DATASET).state).toBe("CURRENT");
  });

  it("a newly ingested ACTIVE closure on the saved route ⇒ dataset changed + new ROUTE_AFFECTED finding", async () => {
    const store = new MemoryIngestionStore();
    const xml = syntheticDatex({ publicationTime: "2026-09-30T17:00:00Z", records: [{ id: "c1", mgmt: "roadClosed", start: "2026-10-01T00:00:00Z", end: "2026-10-03T00:00:00Z", line: stretch }] });
    await runSource(SRC, { store, fetch: scriptedFetch([xml]) as FetchImpl, now: NOW });
    const f = assessFreshness(SRC, (await store.getSourceStates())[0], NOW);
    const ds = buildRegulationDataset([], buildIngestedConstraints(await store.getAllCandidates(), [SRC], { [SRC.id]: f }, NOW));
    const s = assessPlannedJob(planned, truck, ds, NOW);
    expect(s.state).toBe("CURRENT");
    if (s.state !== "CURRENT") return;
    expect(s.datasetChanged).toBe(true);
    expect(s.reevaluation.current.status).toBe("ROUTE_AFFECTED");
    expect(s.reevaluation.newFindings.map((r) => r.regulationId)).toEqual(["ing-synthetic-datex:c1"]);
  });

  it("the same closure only as a polygon ⇒ POTENTIALLY_AFFECTED (screening), never AFFECTED", async () => {
    const store = new MemoryIngestionStore();
    const lats = stretch.map((p) => p[0]), lngs = stretch.map((p) => p[1]);
    const [s0, n0, w0, e0] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const ring: [number, number][] = [[s0, w0], [s0, e0], [n0, e0], [n0, w0], [s0, w0]];
    const xml = syntheticDatex({ publicationTime: "2026-09-30T17:00:00Z", records: [{ id: "c2", mgmt: "roadClosed", start: "2026-10-01T00:00:00Z", end: "2026-10-03T00:00:00Z", polygon: ring }] });
    await runSource(SRC, { store, fetch: scriptedFetch([xml]) as FetchImpl, now: NOW });
    const f = assessFreshness(SRC, (await store.getSourceStates())[0], NOW);
    const ds = buildRegulationDataset([], buildIngestedConstraints(await store.getAllCandidates(), [SRC], { [SRC.id]: f }, NOW));
    const s = assessPlannedJob(planned, truck, ds, NOW);
    expect(s.state === "CURRENT" && s.reevaluation.current.status).toBe("POTENTIALLY_AFFECTED");
  });
});
