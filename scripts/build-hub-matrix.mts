/*
 * Records truck travel between the benchmark hubs from OUR routing engine (GraphHopper, profile
 * truck3, OSM data), so the assignment benchmark can run on real roads without the engine.
 *   npx jiti scripts/build-hub-matrix.mts     (engine running on localhost:8989)
 */
import { writeFileSync } from "node:fs";
import { HUBS } from "../src/assignment/bench/bragancaInstance";

const url = process.env.GH_URL ?? "http://localhost:8989";
const out: Record<string, { km: number; sec: number }> = {};
for (const a of HUBS)
  for (const b of HUBS) {
    if (a === b) continue;
    const r = await fetch(`${url}/route?point=${a.at[0]},${a.at[1]}&point=${b.at[0]},${b.at[1]}&profile=truck3&instructions=false&calc_points=false`);
    const j = (await r.json()) as { paths?: { distance: number; time: number }[]; message?: string };
    if (!j.paths?.[0]) throw new Error(`${a.name} → ${b.name}: ${j.message}`);
    out[`${a.name}|${b.name}`] = { km: Math.round(j.paths[0].distance / 10) / 100, sec: Math.round(j.paths[0].time / 1000) };
  }
writeFileSync(new URL("../src/assignment/bench/hubMatrix.truck3.json", import.meta.url), JSON.stringify({ engine: "GraphHopper 11.1 truck3, OSM Iberia 2026-10-20", pairs: out }, null, 0));
console.log(Object.keys(out).length, "pares");
