#!/usr/bin/env node
/*
 * Records the Phase 3C.5 real-route matrix ONCE from the TomTom Routing API (truck 40 t),
 * so tests replay deterministic geometry without network access or repeated cost.
 *   node scripts/fetch-route-matrix.mjs          (skips routes already recorded)
 * The API key is read from .env.local (VITE_TOMTOM_API_KEY) and never written anywhere.
 * Geometry is simplified (Douglas–Peucker 5 m, max 250 m between kept points) per leg.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "src", "regulations", "__fixtures__", "routeMatrix");
const key = (readFileSync(join(root, ".env.local"), "utf8").match(/VITE_TOMTOM_API_KEY=(.*)/) || [])[1]?.trim();
if (!key) throw new Error("VITE_TOMTOM_API_KEY missing in .env.local");

const P = {
  "vieira-do-minho": [41.6352, -8.1431], faro: [37.0355, -7.918], porto: [41.1496, -8.6109], lisboa: [38.7223, -9.1393],
  braga: [41.5454, -8.4265], "viana-do-castelo": [41.6932, -8.8329], braganca: [41.8061, -6.7567], viseu: [40.6566, -7.9125],
  coimbra: [40.2033, -8.4103], guarda: [40.5373, -7.2676], "castelo-branco": [39.8222, -7.4909], evora: [38.5714, -7.9135],
  beja: [38.0151, -7.8632], sines: [37.9561, -8.8698],
};
export const MATRIX = [
  ["vieira-do-minho", "faro"], ["porto", "lisboa"], ["braga", "faro"], ["viana-do-castelo", "lisboa"], ["braganca", "porto"],
  ["braganca", "faro"], ["viseu", "porto"], ["viseu", "faro"], ["coimbra", "viseu"], ["coimbra", "lisboa"], ["guarda", "porto"],
  ["guarda", "faro"], ["castelo-branco", "lisboa"], ["evora", "porto"], ["evora", "faro"], ["beja", "porto"], ["sines", "braga"], ["faro", "porto"],
];

const R = 6371008.8, rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => { const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
function segDist(p, a, b) {
  const k = Math.cos(rad(p[0]));
  const ax = rad(a[1] - p[1]) * k * R, ay = rad(a[0] - p[0]) * R, bx = rad(b[1] - p[1]) * k * R, by = rad(b[0] - p[0]) * R;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
function simplify(pts, tol = 5, maxSeg = 250) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) { const [s, e] = st.pop(); let best = -1, bi = -1; for (let i = s + 1; i < e; i++) { const d = segDist(pts[i], pts[s], pts[e]); if (d > best) { best = d; bi = i; } } if (best > tol) { keep[bi] = 1; st.push([s, bi], [bi, e]); } }
  const out = []; let last = null;
  for (let i = 0; i < pts.length; i++) {
    if (!keep[i]) continue;
    if (last !== null) { // re-insert original points so no kept segment exceeds maxSeg
      let prev = last;
      for (let j = last + 1; j < i; j++) if (hav(pts[prev], pts[j + 1]) > maxSeg) { out.push(pts[j]); prev = j; }
    }
    out.push(pts[i]); last = i;
  }
  return out.map((p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]);
}

const base = "travelMode=truck&vehicleWeight=40000&vehicleAxleWeight=8000&vehicleNumberOfAxles=5&vehicleLength=16.5&vehicleWidth=2.55&vehicleHeight=4&vehicleCommercial=true&traffic=false&routeType=fastest&sectionType=roadShields&departAt=2026-10-06T05:00:00Z&maxAlternatives=0";
mkdirSync(outDir, { recursive: true });
let calls = 0;
for (const [a, b] of MATRIX) {
  for (const strategy of ["FASTEST", "NO_TOLLS"]) {
    const id = `${a}__${b}__${strategy.toLowerCase()}`;
    const file = join(outDir, `${id}.json`);
    if (existsSync(file)) continue;
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${P[a].join(",")}:${P[b].join(",")}/json?${base}${strategy === "NO_TOLLS" ? "&avoid=tollRoads" : ""}&key=${key}`;
    calls++;
    const res = await fetch(url);
    if (!res.ok) { console.error(id, res.status); continue; }
    const j = await res.json();
    const r = j.routes[0];
    const roads = [];
    for (const s of r.sections ?? []) if (s.sectionType === "ROAD_SHIELDS") for (const x of s.roadShieldReferences ?? []) if (x.shieldContent && !roads.includes(x.shieldContent)) roads.push(x.shieldContent);
    const legs = r.legs.map((l) => simplify(l.points.map((p) => [p.latitude, p.longitude])));
    writeFileSync(file, JSON.stringify({
      id, from: a, to: b, strategy, retrievedAt: new Date().toISOString().slice(0, 10),
      request: "TomTom Routing v1, truck 40 t, 5 axles, 4 m, traffic=false, departAt 2026-10-06T05:00Z",
      lengthInMeters: r.summary.lengthInMeters, travelTimeInSeconds: r.summary.travelTimeInSeconds,
      roads, legPointCounts: legs.map((l) => l.length), legDurationSec: r.legs.map((l) => l.summary.travelTimeInSeconds), points: legs.flat(),
    }));
    console.log(id, (r.summary.lengthInMeters / 1000).toFixed(0), "km", legs.flat().length, "pts");
    await new Promise((s) => setTimeout(s, 250));
  }
}
console.log("requests made:", calls);
