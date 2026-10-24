/*
 * Records today's REAL road-diesel pump prices around each benchmark hub, from the official open
 * sources (DGEG Portugal, MITECO Spain) through the existing fuel collector and parsers: median
 * price of the stations within 15 km. Used by the assignment benchmark's fuel model.
 *   npx jiti scripts/build-hub-fuel-prices.mts
 */
import { writeFileSync } from "node:fs";
import { HUBS } from "../src/assignment/bench/bragancaInstance";
import { MemoryFuelStore, runFuelSource } from "../src/fuel/collector";
import { FUEL_SOURCES } from "../src/fuel/sources";
import { haversineM } from "../src/regulations/geometry";

const store = new MemoryFuelStore();
for (const source of FUEL_SOURCES) {
  const report = await runFuelSource(source, { store, fetch: (url, init) => fetch(url, init) });
  console.log(source.id, JSON.stringify(report).slice(0, 200));
}
const stations = (await Promise.all(FUEL_SOURCES.map((f) => store.getStations(f.id)))).flat();
const prices = (await Promise.all(FUEL_SOURCES.map((f) => store.getCurrentPrices(f.id)))).flat();
const at = new Map(stations.map((s) => [s.id, s]));
const diesel = prices.filter((p) => p.fuelType === "diesel" && p.unit === "EUR/L" && p.price > 0.8 && p.price < 3);
const out: Record<string, { eurPerL: number; stations: number }> = {};
for (const h of HUBS) {
  const near = diesel.filter((p) => { const s = at.get(p.stationId); return s && haversineM(h.at, [s.lat, s.lon]) <= 15_000; }).map((p) => p.price).sort((a, b) => a - b);
  out[h.name] = { eurPerL: near.length ? near[Math.floor(near.length / 2)]! : NaN, stations: near.length };
}
const all = (c: "PT" | "ES") => { const xs = diesel.filter((p) => at.get(p.stationId)?.country === c).map((p) => p.price).sort((a, b) => a - b); return xs[Math.floor(xs.length / 2)]; };
writeFileSync(new URL("../src/assignment/bench/hubFuelPrices.json", import.meta.url), JSON.stringify({ recordedAt: new Date().toISOString(), basis: "median road diesel (gasóleo simples / Gasóleo A) within 15 km, DGEG + MITECO", medianPT: all("PT"), medianES: all("ES"), hubs: out }, null, 1));
console.log(JSON.stringify(out), "PT", all("PT"), "ES", all("ES"));
