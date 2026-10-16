import { describe, expect, it } from "vitest";
import { MemoryFuelStore, runFuelSource, type FuelFetch } from "../collector";
import { stationsAlongRoute } from "../corridor";
import { combineParses, mergePrices } from "../history";
import { parseDgeg } from "../parsers/dgeg";
import { parseMiteco } from "../parsers/miteco";
import { FUEL_SOURCES, getFuelSource } from "../sources";
import type { FuelSource } from "../types";

/* Real payloads captured 2026-10-11 (subsets): MITECO Galicia + AdBlue sample; DGEG Braga/Viana. */
const RAW = import.meta.glob<string>("../__fixtures__/*", { query: "?raw", import: "default", eager: true });
const fx = (n: string) => {
  const b = RAW[`../__fixtures__/${n}`];
  if (b === undefined) throw new Error(`fixture ${n} missing`);
  return b;
};
const ctx = (sourceId: string) => ({ sourceId, snapshotId: `${sourceId}@test` });

/** fetch stub returning the given bodies in order. */
function stubFetch(bodies: string[]): FuelFetch & { calls: { url: string; accept: string }[] } {
  const calls: { url: string; accept: string }[] = [];
  const f = (async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, accept: init.headers.Accept ?? "" });
    const b = bodies.shift();
    if (b === undefined) throw new Error("no scripted body");
    return new Response(b, { status: 200 });
  }) as unknown as FuelFetch & { calls: typeof calls };
  f.calls = calls;
  return f;
}

describe("fuel source registry", () => {
  it("registers MITECO (ES) and DGEG (PT) with honest commercial-use status", () => {
    expect(getFuelSource("miteco-estaciones-terrestres")!.commercialUse).toBe("unknown");
    expect(getFuelSource("dgeg-precos-combustiveis")!.commercialUse).toBe("prohibited");
    expect(new Set(FUEL_SOURCES.map((s) => s.id)).size).toBe(FUEL_SOURCES.length);
  });
  it("asks MITECO for JSON explicitly (it answers XML otherwise)", () => {
    expect(getFuelSource("miteco-estaciones-terrestres")!.requests[0]!.accept).toBe("application/json");
  });
});

describe("MITECO parser (real subset)", () => {
  const out = parseMiteco(fx("mitecoSubset.json"), ctx("miteco-estaciones-terrestres"));

  it("parses stations with WGS84 coordinates (decimal comma) and per-product prices", () => {
    expect(out.errors).toEqual([]);
    expect(out.stations).toHaveLength(200);
    const s = out.stations[0]!;
    expect(s.country).toBe("ES");
    expect(s.lat).toBeGreaterThan(41);
    expect(s.lon).toBeLessThan(-6);
    const diesel = out.prices.filter((p) => p.fuelType === "diesel");
    expect(diesel.length).toBeGreaterThan(150);
    expect(diesel.every((p) => p.unit === "EUR/L" && p.price > 1 && p.price < 3)).toBe(true);
  });
  it("carries AdBlue prices (absent from the Portuguese source)", () => {
    expect(out.prices.filter((p) => p.fuelType === "adblue").length).toBeGreaterThanOrEqual(50);
  });
  it("reads the feed time as Madrid local time", () => {
    expect(out.publishedAt).toBe("2026-10-11T10:24:00.000Z"); // 12:24 CEST
  });
  it("an XML answer (missing Accept header) is a parse error, not empty data", () => {
    const e = parseMiteco("<?xml version='1.0'?><PreciosEESSTerrestres/>", ctx("x"));
    expect(e.prices).toEqual([]);
    expect(e.errors[0]).toMatch(/Accept: application\/json/);
  });
});

describe("DGEG parser (real subset, Braga + Viana do Castelo)", () => {
  const diesel = parseDgeg(fx("dgegDieselNorte.json"), ctx("dgeg-precos-combustiveis"));
  const lpg = parseDgeg(fx("dgegGplNorte.json"), ctx("dgeg-precos-combustiveis"));

  it("parses one price per station with the station's own change time", () => {
    expect(diesel.errors).toEqual([]);
    expect(diesel.prices).toHaveLength(diesel.stations.length);
    expect(diesel.prices.every((p) => p.fuelType === "diesel" && p.sourceValidFrom && p.price > 1)).toBe(true);
    expect(diesel.publishedAtBasis).toMatch(/DataAtualizacao/);
  });
  it("combining fuel responses merges stations and keeps every price", () => {
    const both = combineParses([diesel, lpg]);
    expect(both.stations.length).toBeLessThan(diesel.stations.length + lpg.stations.length);
    expect(both.prices).toHaveLength(diesel.prices.length + lpg.prices.length);
  });
  it("status=false / not JSON ⇒ error, nothing invented", () => {
    expect(parseDgeg('{"status":false,"mensagem":"erro"}', ctx("x")).errors[0]).toMatch(/sem resultado/);
    expect(parseDgeg("<html/>", ctx("x")).prices).toEqual([]);
  });
});

describe("run-length price history", () => {
  const parsed = parseDgeg(fx("dgegDieselNorte.json"), ctx("dgeg-precos-combustiveis"));

  it("same price again only moves lastSeenAt; a new price supersedes, never overwrites", () => {
    const t1 = "2026-10-11T10:00:00.000Z";
    const t2 = "2026-10-11T11:00:00.000Z";
    const first = mergePrices([], parsed.prices, t1);
    expect(first.changes).toHaveLength(parsed.prices.length);
    const changed = parsed.prices.map((p, i) => (i === 0 ? { ...p, price: p.price + 0.05 } : p));
    const second = mergePrices(first.current, changed, t2);
    expect(second.changes).toEqual([{ key: expect.any(String), from: parsed.prices[0]!.price, to: parsed.prices[0]!.price + 0.05 }]);
    expect(second.superseded).toHaveLength(1);
    expect(second.superseded[0]).toMatchObject({ price: parsed.prices[0]!.price, firstSeenAt: t1, supersededAt: t2 });
    const unchanged = second.current.find((p) => p.stationId === parsed.prices[1]!.stationId)!;
    expect(unchanged).toMatchObject({ firstSeenAt: t1, lastSeenAt: t2 });
  });
});

describe("collector end-to-end (stubbed fetch)", () => {
  const dgeg: FuelSource = { ...getFuelSource("dgeg-precos-combustiveis")!, requests: getFuelSource("dgeg-precos-combustiveis")!.requests.slice(0, 2) };

  it("CHANGED → UNCHANGED (same bytes) → CHANGED with history when one price moves; missing stations flagged", async () => {
    const store = new MemoryFuelStore();
    const d = fx("dgegDieselNorte.json");
    const g = fx("dgegGplNorte.json");
    const r1 = await runFuelSource(dgeg, { store, fetch: stubFetch([d, g]), now: new Date("2026-10-11T10:00:00Z") });
    expect(r1.outcome).toBe("CHANGED");
    const r2 = await runFuelSource(dgeg, { store, fetch: stubFetch([d, g]), now: new Date("2026-10-11T11:00:00Z") });
    expect(r2.outcome).toBe("UNCHANGED");
    const j = JSON.parse(d);
    j.resultado[0].Preco = "9,999 €";
    const removed = j.resultado.pop();
    const r3 = await runFuelSource(dgeg, { store, fetch: stubFetch([JSON.stringify(j), g]), now: new Date("2026-10-11T12:00:00Z") });
    expect(r3.counts).toMatchObject({ priceChanges: 1, missingStations: expect.any(Number) });
    expect(store.history).toHaveLength(1);
    const stations = await store.getStations(dgeg.id);
    const gone = stations.find((s) => s.externalId === String(removed.Id))!;
    // Present in the LPG response or not: if absent from both, it is flagged, never deleted.
    if (!JSON.parse(g).resultado.some((x: { Id: number }) => x.Id === removed.Id)) expect(gone.missingSinceAt).toBe("2026-10-11T12:00:00.000Z");
  });
  it("a fetch failure keeps the previous data", async () => {
    const store = new MemoryFuelStore();
    await runFuelSource(dgeg, { store, fetch: stubFetch([fx("dgegDieselNorte.json"), fx("dgegGplNorte.json")]) });
    const before = (await store.getCurrentPrices(dgeg.id)).length;
    const r = await runFuelSource(dgeg, { store, fetch: stubFetch([]) });
    expect(r.outcome).toBe("FETCH_ERROR");
    expect((await store.getCurrentPrices(dgeg.id)).length).toBe(before);
  });
  it("sends the Accept header each source needs", async () => {
    const miteco = getFuelSource("miteco-estaciones-terrestres")!;
    const f = stubFetch([fx("mitecoSubset.json")]);
    await runFuelSource(miteco, { store: new MemoryFuelStore(), fetch: f });
    expect(f.calls[0]!.accept).toBe("application/json");
  });
});

describe("stations along a route", () => {
  const parsed = parseDgeg(fx("dgegDieselNorte.json"), ctx("dgeg-precos-combustiveis"));
  const t = "2026-10-11T10:00:00.000Z";
  const prices = mergePrices([], parsed.prices, t).current;
  const stations = parsed.stations.map((s) => ({ ...s, firstSeenAt: t, lastSeenAt: t }));
  // Braga centre → Viana do Castelo (straight polyline, screening only).
  const route: [number, number][] = [[41.5503, -8.4200], [41.6200, -8.5500], [41.6932, -8.8329]];

  it("returns only stations within the buffer, cheapest first, with a corridor spread", () => {
    const r = stationsAlongRoute(route, stations, prices, { fuelType: "diesel", bufferM: 1500, now: new Date(t) });
    expect(r.stations.length).toBeGreaterThan(0);
    expect(r.stations.every((s) => s.offRouteM <= 1500)).toBe(true);
    const ps = r.stations.map((s) => s.price.price);
    expect([...ps].sort((a, b) => a - b)).toEqual(ps);
    expect(r.spread).toBeGreaterThanOrEqual(0);
    expect(r.cheapest!.price.price).toBe(ps[0]);
  });
  it("a wider buffer never finds fewer stations; an unknown fuel finds none", () => {
    const narrow = stationsAlongRoute(route, stations, prices, { fuelType: "diesel", bufferM: 500, now: new Date(t) });
    const wide = stationsAlongRoute(route, stations, prices, { fuelType: "diesel", bufferM: 3000, now: new Date(t) });
    expect(wide.stations.length).toBeGreaterThanOrEqual(narrow.stations.length);
    expect(stationsAlongRoute(route, stations, prices, { fuelType: "adblue", bufferM: 3000, now: new Date(t) }).stations).toEqual([]);
  });
});
