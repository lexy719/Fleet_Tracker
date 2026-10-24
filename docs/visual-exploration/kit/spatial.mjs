// Round 3 scene engine: a persistent map (camera = CSS transform) + layout blocks that move between states.
// Static frames: page.html?s=i   ·   Motion: page.html?play=0,1,2  (CSS transitions between states)
import fs from "node:fs";
import { GEO, R, CSS as BASECSS } from "./kit.mjs";
const G3 = JSON.parse(fs.readFileSync(new URL("geo3.json", import.meta.url), "utf8"));
export const PW = 1600, PH = 1000;

// world projection: 1 unit ≈ 1/1000 degree (lng scaled by cos 39.5°)
const KX = Math.cos(39.5 * Math.PI / 180) * 1000, KY = 1000;
export const X = ([lat, lng]) => [(lng + 10) * KX, (43 - lat) * KY];
const d = (pts) => pts.map((p, i) => (i ? "L" : "M") + X(p).map(v => v.toFixed(2)).join(" ")).join("");
export const ptAt = (id, km) => { const p = R(id).pts; return p.find(q => q[2] >= km) || p[p.length - 1]; };
export const seg = (id, a, b) => R(id).pts.filter(p => p[2] >= a && p[2] <= b);

// ---- camera ----
export function camera(map) { const c = map.cam; let bb = c.bbox;
  if (!bb && c.center) { const s = c.span / 111; bb = [c.center[0] - s / 2, c.center[1] - s, c.center[0] + s / 2, c.center[1] + s]; }
  const [a, b] = X([bb[2], bb[1]]), [e, f] = X([bb[0], bb[3]]); const pad = c.pad ?? 40;
  const z = Math.min((map.w - 2 * pad) / (e - a), (map.h - 2 * pad) / (f - b)) * (c.zoom || 1);
  const cx = (a + e) / 2 + (c.dx || 0) / z, cy = (b + f) / 2 + (c.dy || 0) / z; const tx = map.w / 2 - cx * z, ty = map.h / 2 - cy * z;
  const P = (ll) => { const [x, y] = X(ll); return [map.x + tx + x * z, map.y + ty + y * z]; }; P.z = z;
  return { z, tx, ty, P };
}

// ---- world svg ----
const polyD = (rings) => rings.map(r => d(r) + "Z").join("");
function world(scene) {
  let s = `<g class="sea"><rect x="-2000" y="-2000" width="12000" height="12000"/></g>`;
  s += `<path class="es" d="${polyD(G3.countries.ES)}"/><path class="pt" d="${polyD(G3.countries.PT)}"/>`;
  for (const area of scene.osm || []) { s += `<g class="osm" id="osm-${area}">`; const order = ["lu", "wa", "rs", "te", "rl", "pr", "mw"];
    for (const c of order) s += `<path class="o-${c}" d="${G3.osm[area].filter(w => w.c === c).map(w => d(w.p)).join("")}"/>`; s += `</g>`; }
  s += `<g class="net">${Object.values(GEO.routes).filter((r, i) => i % 2 === 0).map(r => `<path d="${d(r.pts.filter((_, i) => i % 3 === 0))}"/>`).join("")}</g>`;
  for (const [k, L] of Object.entries(scene.lines || {})) { const pts = L.geom ? GEO.extra[L.geom] : L.k ? seg(L.route, ...L.k) : R(L.route).pts; s += `<path id="l-${k}" class="ln" d="${d(pts)}"/>`; }
  return s;
}
const WORLD_CSS = `
.map{position:absolute;overflow:hidden;transition:all .9s cubic-bezier(.3,.7,.2,1);background:#e3e7e4}
.map svg{position:absolute;inset:0;width:100%;height:100%}
.map .cam{transition:transform .9s cubic-bezier(.3,.7,.2,1);transform-origin:0 0}
.map path{vector-effect:non-scaling-stroke;transition:stroke .8s,stroke-width .8s,opacity .8s}.map.moving .osm{visibility:hidden}
.sea rect{fill:#e3e7e4;transition:fill .8s}.es{fill:#ebe9e2;stroke:#d4d0c4;stroke-width:.8}.pt{fill:#f4f2eb;stroke:#c9c4b5;stroke-width:1}
.net path{fill:none;stroke:#d9d4c6;stroke-width:1.1}
.osm{transition:opacity .8s}.o-mw{fill:none;stroke:#cdc6b2;stroke-width:3.2}.o-pr{fill:none;stroke:#d6d0bf;stroke-width:2.2}.o-te{fill:none;stroke:#dfdaca;stroke-width:1.3}.o-rs{fill:none;stroke:#e6e2d6;stroke-width:.8}
.o-rl{fill:none;stroke:#bdb8aa;stroke-width:1.2;stroke-dasharray:4 3}.o-wa{fill:none;stroke:#c6d3d6;stroke-width:9}.o-lu{fill:#ebe7db;stroke:none}
.ln{fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0}
.dark .sea rect{fill:#0d1714}.dark .es{fill:#111d19;stroke:#1d2e28}.dark .pt{fill:#15231e;stroke:#2a3f37}.dark .net path{stroke:#22352f}
.dark .o-mw{stroke:#2f4a42}.dark .o-pr{stroke:#2a4039}.dark .o-te,.dark .o-rs{stroke:#1f302a}.dark .o-wa{stroke:#1b2c33}.dark .o-lu{fill:#14211c}
.blk{position:absolute;transition:left .9s cubic-bezier(.3,.7,.2,1),top .9s cubic-bezier(.3,.7,.2,1),width .9s cubic-bezier(.3,.7,.2,1),height .9s cubic-bezier(.3,.7,.2,1),opacity .6s;overflow:hidden}
.blk>.v{position:absolute;inset:0;transition:opacity .5s}
.ov{position:absolute;inset:0;pointer-events:none;transition:opacity .45s;z-index:20}
.ov.on{transition-delay:.75s}
.notrans,.notrans *{transition:none!important}
.pin{position:absolute;font:600 12.5px/1.25 Inter,sans-serif;color:#141f1b;white-space:nowrap}.pin small{display:block;font-weight:400;color:#5b6761;font-size:11.5px}
.dark .pin,.pin.l{color:#e2ebe7}.pin.l small{color:#8fa59d}
.chip{background:#fffdf8;border:1px solid #c9c5b8;padding:4px 7px}
`;
const STYLE = { // named line styles
  focus: { stroke: "#1f4d45", "stroke-width": 4.5, opacity: 1 }, done: { stroke: "#1f4d45", "stroke-width": 6, opacity: 1 }, ahead: { stroke: "#1f4d45", "stroke-width": 3, opacity: .45 },
  thin: { stroke: "#1f4d45", "stroke-width": 2, opacity: .9 }, dim: { stroke: "#9aa39e", "stroke-width": 1.6, opacity: .55 }, ghost: { stroke: "#b8b2a3", "stroke-width": 1.4, opacity: .35, "stroke-dasharray": "4 4" },
  legal: { stroke: "#9c6410", "stroke-width": 8, opacity: .9 }, beyond: { stroke: "#8a928d", "stroke-width": 3, opacity: .6, "stroke-dasharray": "6 5" },
  restr: { stroke: "#8c1c1c", "stroke-width": 9, opacity: .35 }, restrLine: { stroke: "#8c1c1c", "stroke-width": 2.2, opacity: 1 }, works: { stroke: "#bb4119", "stroke-width": 10, opacity: .45 },
  alt: { stroke: "#34433d", "stroke-width": 3, opacity: .85, "stroke-dasharray": "7 5" }, lightFocus: { stroke: "#9fd3b8", "stroke-width": 3.5, opacity: 1 }, lightDim: { stroke: "#4f6b62", "stroke-width": 1.6, opacity: .7 },
  ember: { stroke: "#c8551f", "stroke-width": 8, opacity: .7 }, hidden: { opacity: 0 },
};
const styleStr = (s) => { const o = typeof s === "string" ? STYLE[s] : s; return Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";") + (o["stroke-dasharray"] ? "" : ";stroke-dasharray:none"); };

// ---- page ----
export function scenePage(scene) {
  const states = scene.states; const cams = states.map(st => camera(st.map));
  const blockIds = [...new Set(states.flatMap(st => (st.blocks || []).map(b => b.id)))];
  const variants = {}; for (const id of blockIds) { variants[id] = []; for (const st of states) { const b = (st.blocks || []).find(b => b.id === id); if (b && !variants[id].includes(b.html)) variants[id].push(b.html); } }
  let body = `<div id="map" class="map"><svg><g class="cam">${world(scene)}</g></svg></div>`;
  for (const id of blockIds) body += `<div class="blk" id="b-${id}">${variants[id].map((h, i) => `<div class="v" data-v="${i}">${h}</div>`).join("")}</div>`;
  states.forEach((st, i) => { const { P } = cams[i]; const pins = (st.pins || []).map(p => { const ll = p.ll || ptAt(p.route, p.km); const [x, y] = P(ll); return { ...p, x, y }; });
    let svg = typeof st.overlay === "function" ? st.overlay(P, cams[i]) : (st.overlay || "");
    for (const p of pins) { if (p.mark) svg += markSvg(p.mark, p.x, p.y, p); if (p.t && p.lead !== false) svg += `<line x1="${p.x}" y1="${p.y}" x2="${p.x + (p.dx ?? 24)}" y2="${p.y + (p.dy ?? -18)}" stroke="${p.lc || (st.map.tone === "dark" ? "#8fa59d" : "#141f1b")}" stroke-width=".9"/>`; }
    const html = pins.filter(p => p.t).map(p => { const dx = p.dx ?? 24, dy = p.dy ?? -18; const left = dx < 0; return `<div class="pin ${p.cls || ""}" style="left:${p.x + dx + (left ? -4 : 4)}px;top:${p.y + dy - 9}px;${left ? "transform:translateX(-100%);text-align:right" : ""}">${p.t}${p.s ? `<small>${p.s}</small>` : ""}</div>`; }).join("");
    body += `<div class="ov" id="ov-${i}"><svg width="${PW}" height="${PH}" style="position:absolute;inset:0;overflow:visible" font-family="Inter,Segoe UI">${svg}</svg>${html}${st.html || ""}</div>`; });
  const data = states.map((st, i) => ({ map: { x: st.map.x, y: st.map.y, w: st.map.w, h: st.map.h, tone: st.map.tone || "paper", t: `matrix(${cams[i].z},0,0,${cams[i].z},${cams[i].tx},${cams[i].ty})`, osm: st.map.osm || [], radius: st.map.radius || 0, opacity: st.map.opacity ?? 1, clip: st.map.clip || "" },
    lines: Object.fromEntries(Object.keys(scene.lines || {}).map(k => [k, styleStr(st.lines?.[k] || "hidden")])), net: st.map.net ?? 1, bg: st.bg || "#f3f2ec",
    blocks: Object.fromEntries(blockIds.map(id => { const b = (st.blocks || []).find(b => b.id === id); return [id, b ? { x: b.x, y: b.y, w: b.w, h: b.h, v: variants[id].indexOf(b.html), o: b.o ?? 1, z: b.z || 5, st: b.style || "" } : null]; })) }));
  const js = `const S=${JSON.stringify(data)};const $=id=>document.getElementById(id);
let mv;function apply(i,anim){const s=S[i];if(anim){const mm=document.getElementById("map");mm.classList.add("moving");clearTimeout(mv);mv=setTimeout(()=>mm.classList.remove("moving"),950);}document.body.style.background=s.bg;const m=$("map");Object.assign(m.style,{left:s.map.x+"px",top:s.map.y+"px",width:s.map.w+"px",height:s.map.h+"px",borderRadius:s.map.radius+"px",opacity:s.map.opacity,clipPath:s.map.clip});
m.classList.toggle("dark",s.map.tone==="dark");m.querySelector(".cam").style.transform=s.map.t;m.querySelector(".net").style.opacity=s.net;
document.querySelectorAll(".osm").forEach(g=>g.style.opacity=s.map.osm.includes(g.id.slice(4))?1:0);
for(const k in s.lines){const el=$("l-"+k);el.setAttribute("style",s.lines[k]);}
for(const id in s.blocks){const b=s.blocks[id],el=$("b-"+id);if(!b){el.style.opacity=0;continue;}Object.assign(el.style,{left:b.x+"px",top:b.y+"px",width:b.w+"px",height:b.h+"px",opacity:b.o,zIndex:b.z});if(b.st)el.style.cssText+=b.st;el.querySelectorAll(":scope>.v").forEach(v=>v.style.opacity=(+v.dataset.v===b.v)?1:0);}
document.querySelectorAll(".ov").forEach((o,j)=>{o.classList.toggle("on",j===i);o.style.opacity=j===i?1:0;});}
const q=new URLSearchParams(location.search);
if(q.has("play")){const seq=q.get("play").split(",").map(Number),dw=+(q.get("dwell")||1700);document.body.classList.add("notrans");apply(seq[0]);document.body.offsetHeight;requestAnimationFrame(()=>{document.body.classList.remove("notrans");seq.slice(1).forEach((s,k)=>setTimeout(()=>apply(s,1),400+k*dw));});}
else if(q.has("from")){const ms=+q.get("ms");document.body.classList.add("notrans");apply(+q.get("from"));document.body.offsetHeight;document.body.classList.remove("notrans");apply(+q.get("to"));if(ms<900)$("map").classList.add("moving");else $("map").classList.remove("moving");clearTimeout(mv);document.getAnimations().forEach(a=>{a.pause();a.currentTime=ms;});}
else{document.body.classList.add("notrans");apply(+(q.get("s")||0));}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${scene.id}</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${BASECSS}${WORLD_CSS}body{transition:background .8s}</style></head><body>${body}<div class="stamp" style="z-index:50">${scene.id} · ${scene.name}</div><script>${js}</script></body></html>`;
}
export function markSvg(kind, x, y, m = {}) {
  const c = m.c || "#1f4d45";
  if (kind === "truck") return `<circle cx="${x}" cy="${y}" r="10" fill="${m.fill || "#fff"}" stroke="${c}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="4" fill="${c}"/>`;
  if (kind === "stop") return `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="#fff" stroke="#141f1b" stroke-width="2.2"/>`;
  if (kind === "end") return `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" fill="#141f1b"/>`;
  if (kind === "start") return `<circle cx="${x}" cy="${y}" r="5.5" fill="#141f1b"/>`;
  if (kind === "pause") return `<rect x="${x - 8}" y="${y - 6}" width="16" height="12" fill="#f5ead4" stroke="#9c6410" stroke-width="2"/>`;
  if (kind === "restr") return `<path d="M${x} ${y - 11}L${x + 10} ${y + 7}H${x - 10}Z" fill="#f2dcda" stroke="#8c1c1c" stroke-width="1.8"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="#8c1c1c">!</text>`;
  if (kind === "unknown") return `<circle cx="${x}" cy="${y}" r="10" fill="#fff" stroke="#6b706d" stroke-width="1.6" stroke-dasharray="3 2"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#6b706d">?</text>`;
  if (kind === "dot") return `<circle cx="${x}" cy="${y}" r="${m.r || 4}" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;
  if (kind === "ring") return `<circle cx="${x}" cy="${y}" r="${m.r || 30}" fill="none" stroke="${c}" stroke-width="1" stroke-dasharray="3 4"/>`;
  return "";
}
