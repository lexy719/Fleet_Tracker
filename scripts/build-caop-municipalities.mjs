#!/usr/bin/env node
/*
 * Builds public/data/caop2025-municipios.json from the official DGT OGC API
 * (CAOP2025 — Municípios, Continente). Run: node scripts/build-caop-municipalities.mjs
 *
 * Geometry is simplified (Douglas–Peucker, SIMPLIFY_TOL_M) so the file stays small.
 * Consumers must treat points closer than BORDER_MARGIN_M to a simplified boundary as
 * UNKNOWN membership (the simplified line lies within SIMPLIFY_TOL_M of the official one).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://ogcapi.dgterritorio.gov.pt/collections/municipios/items";
const COLLECTION = "https://ogcapi.dgterritorio.gov.pt/collections/municipios";
const SIMPLIFY_TOL_M = 60;
const BORDER_MARGIN_M = 100;
const PAGE = 5;

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

/** Distance (m) from p to segment ab, equirectangular around p ([lng, lat] input). */
function segDist(p, a, b) {
  const k = Math.cos(rad(p[1]));
  const ax = rad(a[0] - p[0]) * k * R, ay = rad(a[1] - p[1]) * R;
  const bx = rad(b[0] - p[0]) * k * R, by = rad(b[1] - p[1]) * R;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let best = -1, bi = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e]);
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([s, bi], [bi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const round = (p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];

function simplifyRing(ring) {
  // Split closed ring in two halves so DP keeps a real polygon.
  const open = ring.slice(0, -1);
  const mid = Math.floor(open.length / 2);
  const a = dp(open.slice(0, mid + 1), SIMPLIFY_TOL_M);
  const b = dp([...open.slice(mid), open[0]], SIMPLIFY_TOL_M);
  const out = [...a, ...b.slice(1)].map(round);
  return out.length >= 4 ? out : null;
}

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const collection = await getJson(`${COLLECTION}?f=json`);
const features = [];
for (let offset = 0; ; offset += PAGE) {
  const page = await getJson(`${SOURCE}?f=json&limit=${PAGE}&offset=${offset}`);
  features.push(...page.features);
  process.stdout.write(`\r${features.length}/${page.numberMatched}`);
  if (features.length >= page.numberMatched || page.features.length === 0) break;
}
process.stdout.write("\n");

const municipalities = features.map((f) => {
  const p = f.properties;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const polygons = polys
    .map((poly) => poly.map(simplifyRing).filter(Boolean))
    .filter((poly) => poly.length > 0 && poly[0]);
  let south = 90, west = 180, north = -90, east = -180;
  for (const poly of polygons) for (const [lng, lat] of poly[0]) {
    south = Math.min(south, lat); north = Math.max(north, lat);
    west = Math.min(west, lng); east = Math.max(east, lng);
  }
  return {
    code: p.dtmn,
    name: p.municipio,
    district: p.distrito_ilha,
    nuts3: p.nuts3,
    bbox: { south, west, north, east },
    polygons,
  };
}).sort((a, b) => a.code.localeCompare(b.code));

const out = {
  dataset: "CAOP2025 — Municípios (Continente)",
  authority: "Direção-Geral do Território (DGT)",
  collectionTitle: collection.title ?? null,
  source: SOURCE,
  license: "CC-BY 4.0 (Direção-Geral do Território)",
  retrievedAt: new Date().toISOString(),
  crs: "CRS84 (lng, lat)",
  simplification: { method: "Douglas–Peucker", toleranceM: SIMPLIFY_TOL_M, borderMarginM: BORDER_MARGIN_M },
  // Declared territory this registry covers (Road Intelligence coverage is derived from this).
  territory: { code: "PT-CONT", name: "Portugal continental", basis: "CAOP2025 Municípios — coleção «municipios» da DGT (nuts1 = Continente); Açores e Madeira não incluídos" },
  count: municipalities.length,
  municipalities,
};

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "..", "public", "data", "caop2025-municipios.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out));
console.log(`wrote ${file} (${municipalities.length} municipalities)`);
