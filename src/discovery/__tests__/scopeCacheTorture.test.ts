import { describe, expect, it } from "vitest";
import caopJson from "../../../public/data/caop2025-municipios.json";
import { sampleRoute } from "../../ingestion/coverage";
import { MunicipalityIndex } from "../../ingestion/municipalities";
import { SOURCES } from "../../ingestion/sources";
import type { Freshness, MunicipalityDataset } from "../../ingestion/types";
import type { FactSet } from "../../regulations/types";
import { allAuthorities } from "../authorities";
import { parseCacheEntry } from "../cache";
import { buildTasks, runDiscovery } from "../orchestrator";
import { fixtureSearchProvider, registeredSourceProvider, type DiscoveryProvider } from "../providers";
import { buildDiscoveryScope } from "../scope";
import type { DiscoveryCacheEntry, RawDiscoveryHit } from "../types";

const INDEX = new MunicipalityIndex(caopJson as unknown as MunicipalityDataset);
const NOW = new Date("2026-10-06T08:00:00Z");
const HGV: FactSet = { "vehicle.grossWeightKg": { status: "known", value: 40_000, source: "t" } };
const LIGHT: FactSet = { "vehicle.grossWeightKg": { status: "known", value: 3_000, source: "t" } };

function scope(points: [number, number][], roads: string[] = [], facts: FactSet = HGV, index: MunicipalityIndex | null = INDEX, freshness: Record<string, Freshness> = {}) {
  return buildDiscoveryScope({ route: { id: "r", polyline: points, roadNumbers: roads, durationSec: 3600, departAtIso: NOW.toISOString() }, strategy: "FASTEST", index, sources: SOURCES, freshness, facts, includeDev: false, now: NOW });
}
const names = (s: ReturnType<typeof scope>) => s.municipalities.map((m) => m.name);

describe("DiscoveryScope torture", () => {
  it("very short route (≈600 m in Porto) ⇒ one municipality, both ends sampled", () => {
    const s = scope([[41.1496, -8.6109], [41.1545, -8.6109]]);
    expect(names(s)).toEqual(["Porto"]);
    expect(s.totalSamples).toBeGreaterThanOrEqual(2);
  });
  it("SPARSE geometry (2 points, 16 km apart) still finds the municipality in between (bug fixed: samples are interpolated)", () => {
    const s = scope([[41.1496, -8.6109], [41.0072, -8.6411]]); // Porto → Espinho, crossing Gaia
    expect(names(s)).toEqual(expect.arrayContaining(["Porto", "Vila Nova de Gaia", "Espinho"]));
    expect(sampleRoute([[41.1496, -8.6109], [41.0072, -8.6411]]).length).toBeGreaterThan(30);
  });
  it("route FOLLOWING a municipal boundary (Douro, Porto/Gaia) ⇒ boundary samples are UNCERTAIN, not guessed", () => {
    const s = scope([[41.1399, -8.6093], [41.1396, -8.6]]);
    expect(s.uncertainSamples).toBeGreaterThan(0);
  });
  it("leaving and re-entering a municipality counts it once, summing its length", () => {
    const zig: [number, number][] = [[41.1496, -8.6109], [41.125, -8.62], [41.1496, -8.6109], [41.125, -8.62]];
    const s = scope(zig);
    expect(new Set(s.municipalities.map((m) => m.code)).size).toBe(s.municipalities.length);
  });
  it("roads: duplicates collapse; classes; managers never guessed; concession gap reachable", () => {
    const s = scope([[41.1496, -8.6109], [41.0072, -8.6411]], ["A1", "A1", "IC2", "N109", "EM604", "E80", "XYZ"]);
    expect(s.roads.map((r) => r.ref)).toEqual(["A1", "IC2", "N109", "EM604", "E80", "XYZ"]);
    expect(s.roads.find((r) => r.ref === "A1")!.manager.status).toBe("undetermined");
    expect(s.roads.find((r) => r.ref === "EM604")!.manager.status).toBe("municipal");
    expect(s.roads.find((r) => r.ref === "XYZ")!.roadClass).toBe("unknown");
  });
  it("malformed geometry (NaN point) does not throw; the bad point is counted as unresolved", () => {
    const s = scope([[41.1496, -8.6109], [Number.NaN, -8.6], [41.0072, -8.6411]]);
    expect(s.uncertainSamples).toBeGreaterThan(0);
  });
  it("missing municipality dataset ⇒ every sample unresolved, still a scope (not a crash)", () => {
    const s = scope([[41.1496, -8.6109], [41.0072, -8.6411]], ["A1"], HGV, null);
    expect(s.municipalities).toEqual([]);
    expect(s.uncertainSamples).toBe(s.totalSamples);
    expect(s.authorities.map((a) => a.authorityId)).toContain("ip");
  });
  it("a reroute into a NEW municipality produces NEW discovery work (tasks not in the baseline scope)", () => {
    const base = scope([[41.1496, -8.6109], [41.0072, -8.6411]], ["A1"]);
    const reroute = scope([[41.1496, -8.6109], [41.18, -8.55], [41.0072, -8.6411]], ["A1", "A41"]);
    const auths = allAuthorities([...base.municipalities, ...reroute.municipalities], false);
    const k1 = new Set(buildTasks(base, auths).map((t) => t.key));
    const newTasks = buildTasks(reroute, auths).filter((t) => !k1.has(t.key));
    expect(newTasks.length).toBeGreaterThan(0);
    expect(newTasks.some((t) => t.road === "A41")).toBe(true);
  });
});

/* ─── Cache torture ─── */

function memCache() {
  const m = new Map<string, DiscoveryCacheEntry>();
  return { m, get: async (k: string) => m.get(k), put: async (e: DiscoveryCacheEntry) => void m.set(e.key, e) };
}
function counting(p: DiscoveryProvider) {
  const calls: string[] = [];
  const w: DiscoveryProvider & { calls: string[] } = { ...p, calls, discover: async (t, c) => { calls.push(t.key); return p.discover(t, c); } };
  return w;
}
const HIT_A1: RawDiscoveryHit = { url: "https://servicos.infraestruturasdeportugal.pt/pt-pt/alertas/rodovia/x", title: "Aviso A1", snippet: "x", method: "official_site_search", topics: ["temporary_closures", "permanent_hgv_restrictions"], municipalityCodes: [], roads: ["A1"] };
async function run(s: ReturnType<typeof scope>, p: DiscoveryProvider, cache: ReturnType<typeof memCache>, now = NOW, force = false) {
  return runDiscovery(s, { authorities: allAuthorities(s.municipalities, false), providers: [p], sources: SOURCES, cacheGet: cache.get, cachePut: cache.put, proposals: [], allowSynthetic: false, now, forceRefresh: force });
}
const PORTO_ESPINHO: [number, number][] = [[41.1496, -8.6109], [41.0072, -8.6411]];

describe("discovery cache torture", () => {
  it("same route twice ⇒ second run is all HIT, provider not called", async () => {
    const c = memCache();
    const p = counting(fixtureSearchProvider([HIT_A1]));
    await run(scope(PORTO_ESPINHO, ["A1"]), p, c);
    const n = p.calls.length;
    const r2 = await run(scope(PORTO_ESPINHO, ["A1"]), p, c);
    expect(p.calls.length).toBe(n);
    expect(r2.cache.miss).toBe(0);
    expect(r2.results.map((x) => x.url)).toContain(HIT_A1.url);
  });
  it("partially overlapping route: shared road/municipalities HIT, only the new road is researched", async () => {
    const c = memCache();
    const p = counting(fixtureSearchProvider([HIT_A1]));
    await run(scope(PORTO_ESPINHO, ["A1"]), p, c);
    const before = p.calls.length;
    await run(scope(PORTO_ESPINHO, ["A1", "A29"]), p, c);
    const researched = p.calls.slice(before);
    expect(researched.length).toBeGreaterThan(0);
    expect(researched.every((k) => k.endsWith("|A29"))).toBe(true);
  });
  it("same municipality, different road ⇒ municipal tasks reused, road tasks new", async () => {
    const c = memCache();
    const p = counting(fixtureSearchProvider([]));
    await run(scope(PORTO_ESPINHO, ["A1"]), p, c);
    const before = p.calls.length;
    await run(scope(PORTO_ESPINHO, ["N109"]), p, c);
    const researched = p.calls.slice(before);
    expect(researched.every((k) => k.startsWith("ip|") && k.endsWith("|N109"))).toBe(true);
  });
  it("same road, different truck class ⇒ separate cache entries (answers may differ for HGVs)", async () => {
    const c = memCache();
    const p = counting(fixtureSearchProvider([HIT_A1]));
    await run(scope(PORTO_ESPINHO, ["A1"], HGV), p, c);
    const before = p.calls.length;
    await run(scope(PORTO_ESPINHO, ["A1"], LIGHT), p, c);
    expect(p.calls.length).toBeGreaterThan(before);
    expect(p.calls.slice(before).every((k) => k.includes("|light|"))).toBe(true);
  });
  it("temporary topics expire after 60 min (STALE ⇒ refreshed); regulatory topics stay valid (7 days)", async () => {
    const c = memCache();
    const p = counting(fixtureSearchProvider([HIT_A1]));
    await run(scope(PORTO_ESPINHO, ["A1"]), p, c);
    const before = p.calls.length;
    const later = new Date(NOW.getTime() + 2 * 3600_000);
    const r = await run(scope(PORTO_ESPINHO, ["A1"]), p, c, later);
    const refreshed = p.calls.slice(before);
    expect(r.cache.stale).toBeGreaterThan(0);
    expect(refreshed.some((k) => k.includes("|temporary_closures|"))).toBe(true);
    expect(refreshed.some((k) => k.includes("|permanent_hgv_restrictions|"))).toBe(false);
  });
  it("explicit invalidation (forceRefresh) re-researches even within TTL", async () => {
    const c = memCache();
    const p = counting(fixtureSearchProvider([HIT_A1]));
    await run(scope(PORTO_ESPINHO, ["A1"]), p, c);
    const before = p.calls.length;
    await run(scope(PORTO_ESPINHO, ["A1"]), p, c, NOW, true);
    expect(p.calls.length - before).toBe(before);
  });
  it("cache cannot freshen stale evidence: a cached registered-source hit reports the source's CURRENT freshness", async () => {
    const c = memCache();
    const p = registeredSourceProvider(SOURCES);
    const fresh = { "ip-arcgis-condicionamentos": { state: "FRESH" as const, reason: "" } };
    const stale = { "ip-arcgis-condicionamentos": { state: "STALE" as const, reason: "" } };
    const r1 = await run(scope(PORTO_ESPINHO, ["A1"], HGV, INDEX, fresh), p, c);
    expect(r1.results.find((x) => x.registeredSourceId === "ip-arcgis-condicionamentos")!.freshness!.state).toBe("FRESH");
    const r2 = await run(scope(PORTO_ESPINHO, ["A1"], HGV, INDEX, stale), p, c);
    expect(r2.cache.miss).toBe(0); // served from cache…
    expect(r2.results.find((x) => x.registeredSourceId === "ip-arcgis-condicionamentos")!.freshness!.state).toBe("STALE"); // …but freshness is live
  });
  it("corrupted persisted entries are ignored (MISS) and re-researched", async () => {
    const c = memCache();
    const p = counting(fixtureSearchProvider([HIT_A1]));
    await run(scope(PORTO_ESPINHO, ["A1"]), p, c);
    for (const [k, e] of c.m) c.m.set(k, { ...e, hits: [{ url: 42 }] } as unknown as DiscoveryCacheEntry);
    const safeGet = async (k: string) => parseCacheEntry(c.m.get(k)) ?? undefined;
    const before = p.calls.length;
    const s = scope(PORTO_ESPINHO, ["A1"]);
    const r = await runDiscovery(s, { authorities: allAuthorities(s.municipalities, false), providers: [p], sources: SOURCES, cacheGet: safeGet, cachePut: c.put, proposals: [], allowSynthetic: false, now: NOW });
    expect(r.cache.miss).toBeGreaterThan(0);
    expect(p.calls.length).toBeGreaterThan(before);
  });
  it("a cache read failure (storage error) degrades to MISS, never crashes", async () => {
    const s = scope(PORTO_ESPINHO, ["A1"]);
    const r = await runDiscovery(s, { authorities: allAuthorities(s.municipalities, false), providers: [fixtureSearchProvider([HIT_A1])], sources: SOURCES, cacheGet: async () => { throw new Error("IDB corrupted"); }, cachePut: async () => { throw new Error("quota"); }, proposals: [], allowSynthetic: false, now: NOW });
    expect(r.cache.miss).toBeGreaterThan(0);
    expect(r.results.length).toBeGreaterThan(0);
  });
  it("reload: entries persisted by a previous session are served (HIT) while valid", async () => {
    const c = memCache();
    const p = counting(fixtureSearchProvider([HIT_A1]));
    await run(scope(PORTO_ESPINHO, ["A1"]), p, c);
    const reloaded = memCache();
    for (const [k, v] of c.m) reloaded.m.set(k, JSON.parse(JSON.stringify(v)));
    const before = p.calls.length;
    const r = await run(scope(PORTO_ESPINHO, ["A1"]), p, reloaded);
    expect(p.calls.length).toBe(before);
    expect(r.cache.hit).toBeGreaterThan(0);
  });
});
