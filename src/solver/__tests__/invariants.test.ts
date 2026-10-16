import { describe, expect, it, vi } from "vitest";
import { createComplianceRecord } from "../../regulations/decisionRecord";
import { evaluateCompliance, summarizeStatus } from "../../regulations/evaluate";
import { haversineM } from "../../regulations/geometry";
import { closure, dataset, EV, geometry, period, ROAD_A, ROAD_B } from "../../regulations/__tests__/helpers";
import { DEFAULT_TIMING_MODEL, getPassageWindow, routeTimingInput } from "../../regulations/timeline";
import type { ComplianceReport, GeometryRecord, RegulationDataset, RegulationResult } from "../../regulations/types";
import type { RoutePlanOption } from "../../tomtom/planRoutes";
import { buildRouteMetrics, parseRouteMetrics } from "../metrics";
import { canReuseSolve } from "../reuse";
import { parseStrategyResult, solveStrategy } from "../solver";
import { tomtomAvoidRequest } from "../tomtomProvider";
import type { RoutingProvider } from "../types";

/*
 * The 18 Phase 3C.5 invariants, numbered EXACTLY as in the close-out specification.
 * Each is asserted here directly; deeper torture lives in the referenced suites.
 */

function path(corners: [number, number][]): [number, number][] {
  const out: [number, number][] = [corners[0]!];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1]!, b = corners[i]!;
    const n = Math.max(1, Math.ceil(haversineM(a, b) / 100));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
const BASE = path([[41.0, -8.7], [41.0, -8.5]]);
const VIA = path([[41.0, -8.7], [41.0, -8.64], [41.09, -8.64], [41.09, -8.58], [41.0, -8.58], [41.0, -8.5]]);
const VIA_B = path([[41.0, -8.7], [41.0, -8.64], [41.045, -8.64], [41.045, -8.58], [41.0, -8.58], [41.0, -8.5]]);
const route = (id: string, pts: [number, number][]): RoutePlanOption => {
  const d = pts.slice(1).reduce((s, q, i) => s + haversineM(pts[i]!, q), 0);
  const dur = Math.round((d / 1000 / 60) * 3600);
  return { id, title: id, subtitle: "", polyline: pts, distanceM: Math.round(d), durationSec: dur, trafficDelaySec: 0, fuelCostEur: 0, tollCostEur: 0, tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none", tollSectionCount: 0, stopArrivals: [], legDurationSec: [dur], legPointCounts: [pts.length], roadNumbers: [], departAtIso: "2026-10-06T11:00:00Z", colorIndex: 0 };
};
const ALWAYS = [period("2026-10-01T00:00", "2026-10-20T00:00")];
const A = closure("A", "road-a", { activePeriods: ALWAYS });
const B = closure("B", "road-b", { activePeriods: ALWAYS });
const DS = dataset([A], [geometry("road-a", ROAD_A)]);
const DS_AB = dataset([A, B], [geometry("road-a", ROAD_A), geometry("road-b", ROAD_B)]);
const evaluate = (o: RoutePlanOption, d: RegulationDataset): ComplianceReport =>
  evaluateCompliance(d, { route: routeTimingInput(o.polyline, o.legPointCounts, o.legDurationSec, Date.parse(o.departAtIso!)), stops: [], facts: {} }, { timeToleranceMin: 0, sampleStepMin: 5 });
const provider = (f: (n: number) => RoutePlanOption): RoutingProvider & { n: number } => {
  const p = { name: "p", n: 0, describe: tomtomAvoidRequest, route: async () => f(++p.n) };
  return p;
};
const r = (outcome: RegulationResult["outcome"]): RegulationResult => ({ regulationId: outcome, regulationVersion: 1, title: "", outcome, reasons: [], caveats: [], evidenceIds: [] });
const raw = (glob: Record<string, string>) => Object.values(glob).join("\n");

describe("Phase 3C.5 — the 18 invariants (spec numbering)", () => {
  it("INV-1 UNKNOWN is never COMPLIANT", () => {
    expect(summarizeStatus([r("DOES_NOT_APPLY"), r("UNKNOWN")])).toBe("POTENTIALLY_AFFECTED");
    expect(summarizeStatus([r("UNKNOWN")])).not.toBe("ROUTE_COMPLIANT");
  });

  it("INV-2 an AFFECTED route cannot be confirmed (no decision record is produced)", () => {
    expect(createComplianceRecord({ liveReport: { status: "ROUTE_AFFECTED" } } as never)).toBeNull();
    expect(createComplianceRecord({ liveReport: { status: "EVALUATION_ERROR" } } as never)).toBeNull();
    // The planning logic lives in the shared session hook used by Dispatch and the studio.
    const planner = raw(import.meta.glob<string>("../../components/dispatch/useRoutePlanningSession.ts", { query: "?raw", import: "default", eager: true }));
    expect(planner).toMatch(/complianceBlocks = selectedCompliance\?\.status === "ROUTE_AFFECTED"/);
    expect(planner).toMatch(/canConfirmRoute =[\s\S]{0,120}!complianceBlocks/);
  });

  it("INV-3 every alternative is judged by the SAME evaluator as the baseline", async () => {
    const spy = vi.fn(evaluate);
    const { result } = await solveStrategy({ strategy: "FASTEST", provider: provider((n) => (n === 1 ? route("b", VIA_B) : route("c", VIA))), baseline: route("base", BASE), evaluate: spy, getDataset: async () => DS_AB, inputsKey: "k" });
    expect(result.outcome).toBe("CLEANED");
    expect(spy.mock.calls.map((c) => c[0].id)).toEqual(["base", "b", "c"]);
    expect(result.attempts).toHaveLength(3);
  });

  it("INV-4 decisions correspond to current inputs (reuse only on identical inputs + knowledge)", () => {
    expect(canReuseSolve({ inputsKey: "k1", datasetVersion: "v1" }, "k1", "v1")).toBe(true);
    expect(canReuseSolve({ inputsKey: "k1", datasetVersion: "v1" }, "k2", "v1")).toBe(false);
    // Full input table: closeoutTerritoryAvoidance.test.ts §11; saved decisions: persistenceTorture (STALE_INPUTS).
  });

  it("INV-5 failure never becomes green", async () => {
    const { result } = await solveStrategy({ strategy: "FASTEST", provider: provider(() => { throw new Error("down"); }), baseline: route("base", BASE), evaluate, getDataset: async () => DS, inputsKey: "k" });
    expect(["UNRESOLVED", "ERROR"]).toContain(result.outcome);
    expect(result.final).toBeNull();
    const none = await solveStrategy({ strategy: "FASTEST", provider: provider(() => { throw new Error("down"); }), evaluate, getDataset: async () => DS, inputsKey: "k" });
    expect(none.result.outcome).toBe("ERROR");
  });

  it("INV-6 every deviation is traceable to a constraint, its evidence and source", async () => {
    const { result } = await solveStrategy({ strategy: "FASTEST", provider: provider(() => route("via", VIA)), baseline: route("base", BASE), evaluate, getDataset: async () => DS, inputsKey: "k" });
    const t = result.deviations[0]!.triggers[0]!;
    expect(t.constraintId).toBe("A");
    expect(t.evidence.length).toBeGreaterThan(0);
    expect(t.evidence[0]).toMatchObject({ id: EV });
    expect(t.vehicleScope).toBe("todo o trânsito");
  });

  it("INV-7 reload preserves the result exactly, or it is not reused", async () => {
    const { result } = await solveStrategy({ strategy: "FASTEST", provider: provider(() => route("via", VIA)), baseline: route("base", BASE), evaluate, getDataset: async () => DS, inputsKey: "k" });
    const back = parseStrategyResult(JSON.parse(JSON.stringify(result)))!;
    expect(back).toEqual(JSON.parse(JSON.stringify(result)));
    expect(parseStrategyResult({ ...result, schemaVersion: 99 })).toBeNull(); // unknown shape ⇒ re-solve
    expect(parseStrategyResult({ ...result, inputsKey: undefined })).toBeNull();
  });

  it("INV-8 insufficient geometry never yields false confidence", () => {
    const unresolved: GeometryRecord = { id: "road-a", label: "u", legalDescriptionEvidence: [EV], status: "UNRESOLVED", screeningArea: { bbox: { south: 40.99, west: -8.63, north: 41.01, east: -8.59 }, method: "t", evidence: [EV] } };
    expect(evaluate(route("b", BASE), dataset([A], [unresolved])).status).toBe("POTENTIALLY_AFFECTED");
    const bad = route("bad", [[41.0, -8.7], [Number.NaN, -8.6], [41.0, -8.5]]);
    expect(evaluate(bad, DS).status).toBe("EVALUATION_ERROR");
  });

  it("INV-9 time uncertainty is progressive (narrow early, wider later)", () => {
    const pts = path([[40.0, -8.6], [37.5, -8.6]]);
    const t = routeTimingInput(pts, [pts.length], [4 * 3600], Date.parse("2026-10-06T06:00:00Z"), DEFAULT_TIMING_MODEL).timing!;
    const widths = [0.05, 0.25, 0.5, 0.75].map((f) => { const i = Math.floor(f * (pts.length - 1)); const w = getPassageWindow(t, i, i); return w.maxShiftMs - w.minShiftMs; });
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!);
    expect(widths[0]! / 60_000).toBeLessThan(15);
  });

  it("INV-10 future breaks never affect earlier segments", () => {
    const pts = path([[40.0, -8.6], [34.0, -8.6]]);
    const long = routeTimingInput(pts, [pts.length], [10 * 3600], Date.parse("2026-10-06T06:00:00Z"), DEFAULT_TIMING_MODEL).timing!;
    const cut = Math.floor((pts.length - 1) * 0.3);
    const short = routeTimingInput(pts.slice(0, cut + 1), [cut + 1], [(10 * 3600 * cut) / (pts.length - 1)], Date.parse("2026-10-06T06:00:00Z"), DEFAULT_TIMING_MODEL).timing!;
    for (let i = 0; i <= cut; i += 20) expect(Math.abs(long.latestMs[i]! - short.latestMs[i]!)).toBeLessThan(2000);
  });

  it("INV-11 strategies are independent (no shared avoidances or state)", async () => {
    const fast = provider(() => route("via", VIA));
    const noTolls = provider(() => route("x", VIA));
    const a = await solveStrategy({ strategy: "FASTEST", provider: fast, baseline: route("base", BASE), evaluate, getDataset: async () => DS, inputsKey: "kf" });
    const b = await solveStrategy({ strategy: "NO_TOLLS", provider: noTolls, baseline: route("nt", VIA_B), evaluate, getDataset: async () => DS, inputsKey: "kn" });
    expect(a.result.outcome).toBe("CLEANED");
    expect(b.result.outcome).toBe("UNCHANGED"); // its own clean baseline: no avoidance inherited from FASTEST
    expect(noTolls.n).toBe(0);
    // Real-route independence: routeMatrix.test.ts "FASTEST vs NO_TOLLS are independent".
  });

  it("INV-12 a dataset change invalidates stored results", () => {
    expect(canReuseSolve({ inputsKey: "k", datasetVersion: "v1" }, "k", "v1+ingest-x")).toBe(false);
    // Fingerprint changes on content / new / gone constraints: pipeline.test.ts "knowledge version".
  });

  it("INV-13 solver cycles terminate", async () => {
    let n = 0;
    const p = provider(() => route(`r${++n}`, n % 2 ? VIA_B : VIA));
    const regs = [A, B, closure("C", "road-c", { activePeriods: ALWAYS })];
    const d = dataset(regs, [geometry("road-a", ROAD_A), geometry("road-b", ROAD_B), geometry("road-c", [[41.09, -8.62], [41.09, -8.6]])]);
    const { result } = await solveStrategy({ strategy: "FASTEST", provider: p, baseline: route("base", BASE), evaluate, getDataset: async () => d, inputsKey: "k" });
    expect(result.outcome).toBe("UNRESOLVED");
    expect(p.n).toBeLessThanOrEqual(6);
  });

  it("INV-14 an avoidance that cannot be expressed is a failure, never success", async () => {
    const p = provider(() => route("via", VIA));
    p.describe = () => ({ ok: false, reason: "fora dos limites" });
    const { result, finalOption } = await solveStrategy({ strategy: "FASTEST", provider: p, baseline: route("base", BASE), evaluate, getDataset: async () => DS, inputsKey: "k" });
    expect(result.outcome).toBe("UNRESOLVED");
    expect(finalOption).toBeNull();
    expect(p.n).toBe(0);
  });

  it("INV-15 unsupported territory is never reported as covered (see closeoutTerritoryAvoidance §5/6)", () => {
    const cov = raw(import.meta.glob<string>("../../ingestion/coverage.ts", { query: "?raw", import: "default", eager: true }));
    expect(cov).toMatch(/ROUTE LEAVES SUPPORTED TERRITORY/);
    expect(cov).not.toMatch(/Portugal continental|mainland Portugal/); // derived from declared territories
  });

  it("INV-16 development fixtures cannot reach production (served only by the dev server, not in public/)", () => {
    const cfg = raw(import.meta.glob<string>("../../../vite.config.ts", { query: "?raw", import: "default", eager: true }));
    expect(cfg).toMatch(/apply: "serve"/);
    expect(cfg).toMatch(/dev-fixtures\/ingestion/);
    const publicFiles = Object.keys(import.meta.glob("../../../public/**/*", { query: "?url", import: "default", eager: false }));
    expect(publicFiles.some((f) => /synthetic|discovery-search|fixture/.test(f))).toBe(false);
  });

  const runtime = () => raw(import.meta.glob<string>(["../../discovery/*.ts", "../*.ts", "../../context/IngestionContext.tsx", "../../ingestion/*.ts", "../../regulations/*.ts"], { query: "?raw", import: "default", eager: true }));
  it("INV-17 no AI provider / key is wired in", () => {
    expect(runtime()).not.toMatch(/OPENAI|ANTHROPIC|api\.openai|api\.anthropic|claude-|gpt-|VITE_.*AI_KEY/i);
  });

  it("INV-18 no agentic / open-web search is wired in (only registered sources + local fixtures)", () => {
    const src = runtime();
    expect(src).not.toMatch(/google\.com\/search|bing\.com|serpapi|duckduckgo|brave\.com\/api|tavily/i);
    expect(src).not.toMatch(/https?:\/\/[^"'`\s]*(brisa|viaverde)/i); // internal endpoint not used (only mentioned as excluded)
  });
});

describe("12. route metrics — future AI fields stay 0 / null", () => {
  it("counts only; AI fields are zero and actual cost is null; persisted shape round-trips", async () => {
    const { result } = await solveStrategy({ strategy: "FASTEST", provider: provider(() => route("via", VIA)), baseline: route("base", BASE), evaluate, getDataset: async () => DS, inputsKey: "k" });
    const m = buildRouteMetrics({ jobId: "J1", result, runs: [], providerCalls: 1, reused: false });
    expect(m.solver).toMatchObject({ outcome: "CLEANED", iterations: 2, routingProviderCalls: 1, deviations: 1 });
    expect(m.future).toEqual({ webSearches: 0, pagesFetched: 0, modelCalls: 0, modelInputTokens: 0, modelOutputTokens: 0, estimatedAiCostEur: 0, actualAiCostEur: null });
    expect(m.discovery.tasksAvoidedByExistingKnowledge).toEqual({ count: 0, of: 0 });
    expect(parseRouteMetrics(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(parseRouteMetrics({ ...m, schemaVersion: 2 })).toBeNull();
    expect(JSON.stringify(m)).not.toMatch(/knowledge%|percent/i);
  });
});
