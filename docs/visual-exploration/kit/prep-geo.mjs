// Detached: reads real route fixtures (read-only) and writes simplified geometry for the studies.
import fs from "node:fs"; import path from "node:path";
const root = path.resolve("../../../src/regulations");
const dir = path.join(root, "__fixtures__/routeMatrix");
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dl = (b[0]-a[0])*r, dn = (b[1]-a[1])*r;
  const h = Math.sin(dl/2)**2 + Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dn/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
const routes = {};
for (const f of fs.readdirSync(dir)) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const full = f.startsWith("faro__porto");
  const step = full ? 3 : 10; const pts = []; let km = 0, prev = null;
  j.points.forEach((p, i) => { if (prev) km += hav(prev, p); prev = p; if (i % step === 0 || i === j.points.length - 1) pts.push([+p[0].toFixed(5), +p[1].toFixed(5), +km.toFixed(2)]); });
  routes[j.id] = { id: j.id, roads: j.roads, km: +(j.lengthInMeters/1000).toFixed(1), min: Math.round(j.travelTimeInSeconds/60), pts };
}
const geoDir = path.join(root, "portugal/geometry"); const extra = {};
for (const f of fs.readdirSync(geoDir)) {
  const src = fs.readFileSync(path.join(geoDir, f), "utf8");
  const pairs = [...src.matchAll(/\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/g)].map(m => [+m[1], +m[2]]);
  if (pairs.length) extra[f.replace(".ts", "")] = pairs.filter((_, i) => i % 2 === 0);
}
fs.writeFileSync("geo.json", JSON.stringify({ routes, extra }));
console.log(Object.keys(routes).length, "routes;", Object.entries(extra).map(([k, v]) => k + ":" + v.length).join(" "));
