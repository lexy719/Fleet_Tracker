import { describe, expect, it } from "vitest";
import caopJson from "../../../public/data/caop2025-municipios.json";
import { assessRouteCoverage } from "../../ingestion/coverage";
import { MunicipalityIndex } from "../../ingestion/municipalities";
import { SOURCES } from "../../ingestion/sources";
import type { Municipality, MunicipalityDataset } from "../../ingestion/types";
import { buildDiscoveryScope } from "../../discovery/scope";
import { haversineM } from "../../regulations/geometry";
import { canonicalJson } from "../../regulations/decisionInputs";
import type { FactSet } from "../../regulations/types";
import { canReuseSolve, cleanRouteInputsKey, type CleanRouteInputs } from "../reuse";
import { parseStrategyResult } from "../solver";
import { adaptiveRectangles, avoidanceMetrics, MAX_RECT_AREA_KM2, tomtomAvoidRequest } from "../tomtomProvider";
import type { RouteStrategy } from "../types";

/*
 * Phase 3C.5 close-out: territory coverage as a first-class signal, provider avoidance
 * geometry limits, and the clean-route reuse rule. Tables are printed AND asserted.
 */

type MR = { id: string; strategy: RouteStrategy; roads: string[]; points: [number, number][]; legPointCounts: number[]; legDurationSec: number[]; lengthInMeters: number; travelTimeInSeconds: number };
const ALL = Object.values(import.meta.glob<MR>("../../regulations/__fixtures__/routeMatrix/*.json", { eager: true, import: "default" }));
const byId = new Map(ALL.map((r) => [r.id, r]));
const PT = caopJson as unknown as MunicipalityDataset;
const INDEX = new MunicipalityIndex(PT);
const cov = (route: [number, number][], index: MunicipalityIndex | null = INDEX) =>
  assessRouteCoverage({ route, index, sources: SOURCES, freshness: {}, candidates: [], status: "ROUTE_COMPLIANT" });
const table = (title: string, rows: Record<string, unknown>[]) => {
  console.log(`\n=== ${title} ===`);
  console.table(rows);
};

/**
 * SYNTHETIC second registry, clearly labelled: ONE rectangle "municipality" covering the
 * stretch of a recorded route outside the PT registry. Not real Spanish geography — it only
 * proves coverage is derived from DECLARED territories, with no country hard-coded.
 */
function syntheticRegistry(code: string, pts: [number, number][], declare = true): MunicipalityDataset {
  let s = 90, n = -90, w = 180, e = -180;
  for (const [a, b] of pts) { s = Math.min(s, a); n = Math.max(n, a); w = Math.min(w, b); e = Math.max(e, b); }
  s -= 0.05; n += 0.05; w -= 0.05; e += 0.05;
  const m: Municipality = { code: `${code}-0001`, name: "[SINTÉTICO] área de teste", district: "[SINTÉTICO]", nuts3: "[SINTÉTICO]", bbox: { south: s, west: w, north: n, east: e }, polygons: [[[[w, s], [e, s], [e, n], [w, n], [w, s]]]] };
  return {
    ...(declare ? { territory: { code, name: `[SINTÉTICO] território ${code}`, basis: "fixture de teste — não é cartografia oficial" } } : {}),
    dataset: `synthetic-${code}`, authority: "TEST", source: "test", license: "test", retrievedAt: "2026-10-01T00:00:00Z",
    simplification: { method: "none", toleranceM: 0, borderMarginM: PT.simplification.borderMarginM }, count: 1, municipalities: [m],
  };
}

const outsidePts = (pts: [number, number][]) => pts.filter(([a, b]) => INDEX.lookup(a, b).status === "outside_dataset");
function transitions(pts: [number, number][]): string {
  const seq: string[] = [];
  for (let i = 0; i < pts.length; i += 25) {
    const s = INDEX.lookup(pts[i]![0], pts[i]![1]).status;
    const t = s === "outside_dataset" ? "OUT" : s === "invalid" ? "?" : "PT";
    if (seq[seq.length - 1] !== t) seq.push(t);
  }
  return seq.join("→");
}

describe("5/6. TERRITORY COVERAGE — first-class, derived from declared territories", () => {
  const bfN = byId.get("braganca__faro__no_tolls")!;
  const bfF = byId.get("braganca__faro__fastest")!;
  const pl = byId.get("porto__lisboa__fastest")!;
  // Brief crossing: a real domestic route with a short real-geometry excursion through the
  // first ~8 km of Bragança→Faro NO_TOLLS that lies outside the PT registry (out and back).
  const out = outsidePts(bfN.points);
  const excursion = out.slice(0, out.findIndex((p, i) => i > 0 && haversineM(out[0]!, p) > 4000) + 1);
  const brief = [...bfF.points.slice(0, 50), ...excursion, ...[...excursion].reverse(), ...bfF.points.slice(50)];
  const nearBorder: [number, number][] = [];
  for (let i = 0; i <= 40; i++) nearBorder.push([38.88 + i * 0.0005, -7.17]); // Elvas, ~10 km inside PT
  const malformed: [number, number][] = [...pl.points.slice(0, 200), [Number.NaN, -8.6], [999, 999], ...pl.points.slice(200)];

  it("table of cases (printed) — every row asserted", () => {
    const es = syntheticRegistry("SYNTH-ES-TEST", outsidePts(bfN.points));
    const both = new MunicipalityIndex([PT, es]);
    const cases = [
      { case: "domestic (Porto→Lisboa fastest)", route: pl.points, idx: INDEX },
      { case: "brief foreign excursion (~8 km out & back)", route: brief, idx: INDEX },
      { case: "mostly foreign (Bragança→Faro NO_TOLLS)", route: bfN.points, idx: INDEX },
      { case: "same route, + SYNTHETIC registry declaring that territory", route: bfN.points, idx: both },
      { case: "near the border, inside (Elvas)", route: nearBorder, idx: INDEX },
      { case: "malformed geometry (NaN, out-of-range)", route: malformed, idx: INDEX },
      { case: "missing geometry", route: [] as [number, number][], idx: INDEX },
      { case: "strategy: Bragança→Faro FASTEST", route: bfF.points, idx: INDEX },
    ].map((c) => ({ ...c, c: cov(c.route, c.idx) }));
    table(
      "Territory coverage",
      cases.map(({ case: name, route, c }) => ({
        case: name,
        path: route.length ? transitions(route) : "—",
        outsideKm: c.outsideTerritoryKm,
        territories: c.territories.map((t) => `${t.code}:${t.km}`).join(" "),
        invalid: c.invalidSamples,
        noGeom: c.noGeometry,
        complete: c.complete,
        headline: c.headline.slice(0, 90),
      })),
    );
    const [dom, br, foreign, withEs, nb, mal, none, fast] = cases.map((x) => x.c);
    expect(dom!.outsideTerritoryKm).toBeLessThan(1);
    expect(dom!.territories.map((t) => t.code)).toEqual(["PT-CONT"]);
    expect(br!.outsideTerritoryKm).toBeGreaterThan(5);
    expect(br!.outsideTerritoryKm).toBeLessThan(25);
    expect(br!.headline).toMatch(/ROUTE LEAVES SUPPORTED TERRITORY/);
    expect(foreign!.outsideTerritoryKm).toBeGreaterThan(200);
    expect(transitions(bfN.points)).toMatch(/^PT→OUT→PT/); // PT → ES → PT
    expect(withEs!.outsideTerritoryKm).toBeLessThan(1); // no code change: the declared territory made it supported
    expect(withEs!.territories.map((t) => t.code).sort()).toEqual(["PT-CONT", "SYNTH-ES-TEST"]);
    expect(withEs!.headline).not.toMatch(/LEAVES SUPPORTED TERRITORY/);
    expect(nb!.outsideTerritoryKm).toBe(0);
    expect(mal!.invalidSamples).toBeGreaterThan(0);
    expect(mal!.outsideTerritoryKm).toBe(dom!.outsideTerritoryKm); // invalid ≠ foreign
    expect(mal!.headline).toMatch(/INVALID ROUTE POINT/);
    expect(none!.noGeometry).toBe(true);
    expect(none!.headline).toMatch(/NO ROUTE GEOMETRY/);
    expect(fast!.outsideTerritoryKm).toBeLessThan(1);
    // Coverage is never "complete", and never a reason to call a route compliant or illegal:
    for (const x of [dom, br, foreign, withEs, nb, mal, none, fast]) expect(x!.complete).toBe(false);
    for (const x of [br, foreign, mal, none]) expect(x!.headline).not.toMatch(/ILLEGAL|PROHIBIDO|VIOLA/i);
  });

  it("a registry WITHOUT a declared territory is labelled UNDECLARED, never assumed to be a country", () => {
    const anon = new MunicipalityIndex([PT, syntheticRegistry("X", outsidePts(bfN.points), false)]);
    expect(anon.territories.map((t) => t.code)).toEqual(["PT-CONT", "UNDECLARED"]);
  });

  it("outside supported territory ⇒ discovery gap OUTSIDE_COVERED_TERRITORY (and scope counts it); inside a synthetic declared territory ⇒ no gap", () => {
    const facts: FactSet = {};
    const route = { id: bfN.id, title: "", subtitle: "", polyline: bfN.points, distanceM: bfN.lengthInMeters, durationSec: bfN.travelTimeInSeconds, legDurationSec: bfN.legDurationSec, legPointCounts: bfN.legPointCounts, roadNumbers: bfN.roads } as never;
    const s1 = buildDiscoveryScope({ route, strategy: "NO_TOLLS", index: INDEX, sources: SOURCES, freshness: {}, facts, includeDev: false, now: new Date("2026-10-06T06:00:00Z") });
    const s2 = buildDiscoveryScope({ route, strategy: "NO_TOLLS", index: new MunicipalityIndex([PT, syntheticRegistry("SYNTH-ES-TEST", outsidePts(bfN.points))]), sources: SOURCES, freshness: {}, facts, includeDev: false, now: new Date("2026-10-06T06:00:00Z") });
    expect(s1.outsideSamples).toBeGreaterThan(400);
    expect(s2.outsideSamples).toBe(0);
  });

  it("cached/reloaded: coverageAtSolve survives a JSON round-trip of the stored result", () => {
    const c = cov(bfN.points);
    const stored = { schemaVersion: 1, strategy: "NO_TOLLS", outcome: "COMPLIANT_BASELINE", attempts: [], deviations: [], baseline: { route: { polyline: [] }, report: {} }, final: null, inputsKey: "k", datasetVersion: "v", coverageAtSolve: { territories: c.territories, outsideTerritoryKm: c.outsideTerritoryKm, invalidSamples: c.invalidSamples, headline: c.headline } };
    const back = parseStrategyResult(JSON.parse(JSON.stringify(stored)))!;
    expect(back.coverageAtSolve!.outsideTerritoryKm).toBe(c.outsideTerritoryKm);
    expect(back.coverageAtSolve!.headline).toMatch(/ROUTE LEAVES SUPPORTED TERRITORY/);
  });
});

/* ─── 10. Avoidance geometry ─── */
function lateral(line: [number, number][], m: number): [number, number][] {
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(line.length - 1, i + 1)]!;
    const k = Math.cos((p[0] * Math.PI) / 180);
    const dy = b[0] - a[0], dx = (b[1] - a[1]) * k;
    const L = Math.hypot(dx, dy) || 1;
    return [p[0] + (-dx / L) * (m / 111_320), p[1] + (dy / L) * (m / (111_320 * k))];
  });
}
const lenKm = (l: [number, number][]) => l.slice(1).reduce((s, p, i) => s + haversineM(l[i]!, p), 0) / 1000;
const stretch = (pts: [number, number][], fromKm: number, km: number) => {
  const out: [number, number][] = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += haversineM(pts[i - 1]!, pts[i]!) / 1000;
    if (acc >= fromKm && acc <= fromKm + km) out.push(pts[i]!);
  }
  return out;
};
const covered = (rects: { south: number; north: number; west: number; east: number }[], pts: [number, number][]) =>
  pts.filter(([a, b]) => rects.some((r) => a >= r.south && a <= r.north && b >= r.west && b <= r.east)).length / pts.length;

describe("10. AVOIDANCE GEOMETRY — what a rectangle-based provider can and cannot express", () => {
  const pl = byId.get("porto__lisboa__fastest")!.points;
  const vf = byId.get("vieira-do-minho__faro__fastest")!.points;
  it("table (printed) — every row asserted", () => {
    const cases = [
      { case: "short (2 km, A1)", lines: [stretch(pl, 100, 2)] },
      { case: "long (60 km, A1)", lines: [stretch(pl, 100, 60)] },
      { case: "curved (15 km, winding section)", lines: [stretch(vf, 20, 15)] },
      { case: "multiple (3 separate closures)", lines: [stretch(pl, 50, 2), stretch(pl, 150, 2), stretch(pl, 250, 2)] },
      { case: "overlapping (same stretch reported twice + overlap)", lines: [stretch(pl, 100, 5), stretch(pl, 102, 5)] },
    ].map((c) => {
      const req = tomtomAvoidRequest(c.lines.map((l, i) => ({ id: `a${i}`, kind: "avoid_path" as const, lines: [l], constraintIds: [`c${i}`] })));
      const rects = req.ok ? req.request.rectangles : [];
      const all = c.lines.flat();
      return {
        ...c, req, rects,
        row: {
          case: c.case,
          km: c.lines.map(lenKm).map((x) => x.toFixed(1)).join("+"),
          ok: req.ok,
          rects: rects.length,
          rectKm2: avoidanceMetrics(rects, c.lines).rectAreaKm2.toFixed(1),
          falseKm2: avoidanceMetrics(rects, c.lines).falseAreaKm2.toFixed(1),
          lineCovered: covered(rects, all).toFixed(2),
          opposite30m: covered(rects, c.lines.flatMap((l) => lateral(l, 30))).toFixed(2),
          parallel100m: covered(rects, c.lines.flatMap((l) => lateral(l, 100))).toFixed(2),
          parallel400m: covered(rects, c.lines.flatMap((l) => lateral(l, 400))).toFixed(2),
          parallel2km: covered(rects, c.lines.flatMap((l) => lateral(l, 2000))).toFixed(2),
        },
      };
    });
    table("Avoidance rectangles (lineCovered must be 1.00; parallel* = share of a parallel road ALSO blocked)", cases.map((c) => c.row));
    for (const c of cases) {
      expect(c.req.ok).toBe(true);
      expect(covered(c.rects, c.lines.flat())).toBe(1);
      expect(c.rects.every((r) => avoidanceMetrics([r], []).rectAreaKm2 <= MAX_RECT_AREA_KM2)).toBe(true);
      expect(covered(c.rects, c.lines.flatMap((l) => lateral(l, 30)))).toBeGreaterThan(0.95); // LIMITATION: both carriageways blocked
    }
    const straightish = cases.slice(0, 2);
    for (const c of straightish) expect(covered(c.rects, c.lines.flatMap((l) => lateral(l, 2000)))).toBeLessThan(0.5);
    // Separate closures are never merged into one rectangle spanning the gap between them.
    for (const r of cases[3]!.rects) expect(cases[3]!.lines.filter((l) => covered([r], l) > 0).length).toBe(1);
    // Overlapping reports do not inflate the request beyond the provider limit or area bound.
    expect(cases[4]!.rects.length).toBeLessThanOrEqual(10);
    expect(avoidanceMetrics(cases[4]!.rects, []).rectAreaKm2).toBeLessThan(15);
  });

  it("closures beyond provider limits are REFUSED (not silently approximated) — avoidance failure ≠ success", () => {
    const far: [number, number][][] = [];
    for (let i = 0; i < 12; i++) far.push(stretch(vf, 20 + i * 50, 1.5));
    const req = tomtomAvoidRequest(far.map((l, i) => ({ id: `f${i}`, kind: "avoid_path" as const, lines: [l], constraintIds: [`f${i}`] })));
    expect(req.ok).toBe(false);
    expect(adaptiveRectangles(far, 10, 150).length).toBeLessThanOrEqual(10);
  });
});

/* ─── 11. Reuse rule ─── */
describe("11. REUSE — only identical inputs AND identical knowledge version", () => {
  const facts: FactSet = { "vehicle.grossWeightKg": { status: "known", value: 40_000, source: "fleet" } };
  const base: CleanRouteInputs = { jobId: "J-1", stops: [{ sequence: 1, lat: 41.1, lng: -8.6 }, { sequence: 2, lat: 38.7, lng: -9.1 }], truckId: "t1", cargoKg: 12_000, departAtIso: "2026-10-06T05:00:00.000Z", strategy: "FASTEST", facts };
  const k0 = cleanRouteInputsKey(base);
  const saved = { inputsKey: k0, datasetVersion: "2026-09-30.2+ingest-abc" };
  it("table (printed): which changes force a re-solve", () => {
    const cases: [string, CleanRouteInputs | null, string, boolean][] = [
      ["same inputs, same dataset (warm reload)", base, saved.datasetVersion, true],
      ["stops given in different order (same sequence)", { ...base, stops: [...base.stops].reverse() }, saved.datasetVersion, true],
      ["dataset version changed (new/expired constraint)", base, "2026-09-30.2+ingest-def", false],
      ["curated dataset bumped", base, "2026-10-01.1+ingest-abc", false],
      ["departure changed", { ...base, departAtIso: "2026-10-06T06:00:00.000Z" }, saved.datasetVersion, false],
      ["truck changed", { ...base, truckId: "t2" }, saved.datasetVersion, false],
      ["cargo changed", { ...base, cargoKg: 18_000 }, saved.datasetVersion, false],
      ["vehicle fact changed", { ...base, facts: { "vehicle.grossWeightKg": { status: "unknown", reason: "x" } } as FactSet }, saved.datasetVersion, false],
      ["other strategy (NO_TOLLS)", { ...base, strategy: "NO_TOLLS" }, saved.datasetVersion, false],
      ["stop moved", { ...base, stops: [base.stops[0]!, { sequence: 2, lat: 38.71, lng: -9.1 }] }, saved.datasetVersion, false],
    ];
    const rows = cases.map(([name, inp, ver, expected]) => {
      const reuse = canReuseSolve(saved, cleanRouteInputsKey(inp!), ver);
      expect(reuse).toBe(expected);
      return { change: name, reuse };
    });
    expect(canReuseSolve(null, k0, saved.datasetVersion)).toBe(false); // cold / missing / corrupt (parser returned null)
    rows.push({ change: "nothing stored / corrupt record (parser ⇒ null)", reuse: false });
    table("Reuse decisions", rows);
    expect(canonicalJson(base.facts)).toBe(canonicalJson({ ...base.facts }));
  });
});
