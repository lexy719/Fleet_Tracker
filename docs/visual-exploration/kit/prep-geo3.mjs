// Natural Earth (world-atlas topojson) + OSM extracts -> compact geo3.json. Data only, nothing executed from it.
import fs from "node:fs";
const topo = JSON.parse(fs.readFileSync("../geo-src/countries-10m.json", "utf8"));
const { scale: [kx, ky], translate: [tx, ty] } = topo.transform;
const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [+(y * ky + ty).toFixed(4), +(x * kx + tx).toFixed(4)]; }); });
const arc = (i) => i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
const ring = (r) => r.flatMap((i, k) => { const a = arc(i); return k ? a.slice(1) : a; });
const countries = {};
for (const g of topo.objects.countries.geometries) { if (!["620", "724"].includes(g.id)) continue;
  const polys = g.type === "Polygon" ? [g.arcs] : g.arcs; countries[g.id === "620" ? "PT" : "ES"] = polys.map(p => ring(p[0])).filter(r => r.length > 8); }
const osm = {};
for (const n of ["porto", "santarem"]) { const j = JSON.parse(fs.readFileSync(`../geo-src/osm-${n}.json`, "utf8")); const out = [];
  for (const e of j.elements) { if (!e.geometry) continue; const t = e.tags || {}; const cls = t.highway ? (/motorway|trunk/.test(t.highway) ? "mw" : /primary|secondary/.test(t.highway) ? "pr" : /tertiary|unclassified/.test(t.highway) ? "te" : "rs") : t.waterway || t.natural === "water" ? "wa" : t.railway ? "rl" : t.landuse ? "lu" : null; if (!cls) continue;
    out.push({ c: cls, r: t.ref || "", n: t.name || "", p: e.geometry.filter((_, i, a) => i % (cls === "rs" ? 2 : 1) === 0 || i === a.length - 1).map(g => [+g.lat.toFixed(5), +g.lon.toFixed(5)]) }); }
  osm[n] = out; }
fs.writeFileSync("geo3.json", JSON.stringify({ countries, osm }));
console.log(Object.entries(countries).map(([k, v]) => k + ":" + v.length + "/" + v.reduce((a, r) => a + r.length, 0)).join(" "), Object.entries(osm).map(([k, v]) => k + ":" + v.length).join(" "), (fs.statSync("geo3.json").size / 1e6).toFixed(1) + "MB");
