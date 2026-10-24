// Round 4 "zero-base" helpers. Reuses only primitives (type, colour DNA, truck drawing, real geometry).
import fs from "node:fs";
export { svg, T, L, RECT, truck, loadPlan, hx, hourAxis, dayBar, DAY, SEGC, GEO, R, atKm, proj, pathD, NOW, CITIES, JOBS, DRIVERS } from "./kit.mjs";
import { svg, T, L, RECT, proj, pathD, GEO, R, atKm } from "./kit.mjs";
const G3 = JSON.parse(fs.readFileSync(new URL("geo3.json", import.meta.url), "utf8"));
export const W = 1600, H = 1000, RID = "faro__porto__fastest", KM = 556;
export const C = { ink: "#141f1b", ink2: "#34433d", mut: "#5b6761", fnt: "#8a928d", line: "#dddad0", line2: "#c9c5b8", paper: "#f3f2ec", sheet: "#fffdf8", brand: "#1f4d45", ok: "#3b7150", risk: "#9c6410", act: "#bb4119", blk: "#8c1c1c", info: "#3b5d78", unk: "#6b706d", dark: "#0f1a17", dark2: "#16241f", mint: "#9fd3b8", acc: "#c8551f" };
export const STOPS = [[0, "Faro", "06:41", "06:00–07:00", "carga 24 p."], [320, "Santarém", "10:32", "—", "pausa 45 min"], [441, "Coimbra", "12:57", "12:30–13:30", "descarga 6 p."], [556, "Porto", "15:12", "15:30–17:00", "entrega 18 p."]];
export const PLAN = [["06:41", 0], ["10:32", 320], ["11:17", 320], ["12:57", 441], ["13:27", 441], ["15:12", 556]];
export const full = (bg) => `<div class="abs" style="inset:0;background:${bg}"></div>`;
export const at = (x, y, html, style = "") => `<div class="abs" style="left:${x}px;top:${y}px;${style}">${html}</div>`;
export const big = (t, size = 64, style = "") => `<div class="disp" style="font-size:${size}px;font-weight:600;line-height:1;letter-spacing:-.035em;${style}">${t}</div>`;
export const cap = (t, c = C.mut) => `<div class="cap" style="color:${c}">${t}</div>`;
export const tmin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
// Natural Earth Portugal (+Spain) in any frame
export function country({ w, h, bbox = [36.9, -9.6, 42.2, -6.1], pad = 10, routes = [], tone = "paper", spain = true, net = true, extra = "" }) {
  const P = proj(bbox, w, h, pad); const poly = (rs) => rs.map(r => pathD(r, P) + "Z").join("");
  const cols = tone === "dark" ? { sea: "#0d1714", es: "#111d19", pt: "#15231e", st: "#2a3f37", net: "#22352f" } : tone === "none" ? { sea: "none", es: "none", pt: "#f1efe7", st: "#cfcabb", net: "#ddd8ca" } : { sea: "#e3e7e4", es: "#ebe9e2", pt: "#f4f2eb", st: "#c9c4b5", net: "#d9d4c6" };
  let s = cols.sea !== "none" ? `<rect width="${w}" height="${h}" fill="${cols.sea}"/>` : "";
  if (spain) s += `<path d="${poly(G3.countries.ES)}" fill="${cols.es}" stroke="${cols.st}" stroke-width=".6"/>`;
  s += `<path d="${poly(G3.countries.PT)}" fill="${cols.pt}" stroke="${cols.st}" stroke-width=".9"/>`;
  if (net) for (const r of Object.values(GEO.routes)) s += `<path d="${pathD(r.pts.filter((_, i) => i % 3 === 0), P)}" fill="none" stroke="${cols.net}" stroke-width="1"/>`;
  for (const r of routes) { const pts = r.k ? r.k && R(r.id).pts.filter(p => p[2] >= r.k[0] && p[2] <= r.k[1]) : R(r.id).pts; s += `<path d="${pathD(pts, P)}" fill="none" stroke="${r.c || C.brand}" stroke-width="${r.w || 3}" stroke-linecap="round" stroke-linejoin="round" ${r.dash ? `stroke-dasharray="${r.dash}"` : ""} opacity="${r.o ?? 1}"/>`; }
  s += typeof extra === "function" ? extra(P) : extra;
  return { svg: svg(w, h, s), P };
}
export const street = (area) => G3.osm[area];
export function streetMap({ w, h, bbox, area, tone = "paper", extra = "" }) {
  const P = proj(bbox, w, h, 0); const st = { mw: [3, "#cdc6b2"], pr: [2.2, "#d6d0bf"], te: [1.2, "#dfdaca"], rs: [.7, "#e6e2d6"], rl: [1.1, "#bdb8aa"], wa: [8, "#c6d3d6"], lu: [0, "#ebe7db"] };
  const dk = { mw: "#2f4a42", pr: "#2a4039", te: "#1f302a", rs: "#1b2b25", rl: "#2a3f37", wa: "#1b2c33", lu: "#14211c" };
  let s = `<rect width="${w}" height="${h}" fill="${tone === "dark" ? "#0f1a17" : "#f4f2eb"}"/>`;
  for (const c of ["lu", "wa", "rs", "te", "rl", "pr", "mw"]) { const d = G3.osm[area].filter(x => x.c === c).map(x => pathD(x.p, P)).join(""); const col = tone === "dark" ? dk[c] : st[c][1]; s += c === "lu" ? `<path d="${d}" fill="${col}"/>` : `<path d="${d}" fill="none" stroke="${col}" stroke-width="${st[c][0]}" ${c === "rl" ? 'stroke-dasharray="4 3"' : ""}/>`; }
  s += typeof extra === "function" ? extra(P) : extra; return { svg: svg(w, h, s), P };
}
export const geo = (id) => GEO.extra[id];
// straightened corridor helper (lateral wiggle kept)
export function unroll(id, x0, x1, yc, amp, k0 = 0, k1) { const pts = R(id).pts; k1 = k1 ?? pts[pts.length - 1][2]; const a = pts[0], b = pts[pts.length - 1], kx = Math.cos(39.5 * Math.PI / 180);
  const dx = (b[1] - a[1]) * kx, dy = b[0] - a[0], len = Math.hypot(dx, dy); const lat = (p) => (((p[1] - a[1]) * kx) * -dy + (p[0] - a[0]) * dx) / len;
  const X = (k) => x0 + ((k - k0) / (k1 - k0)) * (x1 - x0); const sel = pts.filter(p => p[2] >= k0 && p[2] <= k1);
  return { d: sel.map((p, i) => (i ? "L" : "M") + X(p[2]).toFixed(1) + " " + (yc - lat(p) * amp).toFixed(1)).join(""), X, Y: (k) => { const p = pts.find(q => q[2] >= k) || b; return yc - lat(p) * amp; } }; }
