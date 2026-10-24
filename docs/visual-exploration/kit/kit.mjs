// FleetOS detached visual exploration — shared primitives (pure SVG/HTML strings, no product code).
import fs from "node:fs";
const here = new URL(".", import.meta.url);
export const GEO = JSON.parse(fs.readFileSync(new URL("geo.json", here), "utf8"));

export const W = 1600, H = 1000;

// ---------- page shell ----------
export const CSS = `
:root{--paper:#f3f2ec;--paper-2:#eae8e0;--surface:#fbfaf6;--sheet:#fffdf8;--line:#dddad0;--line-2:#c9c5b8;
--ink:#141f1b;--ink-2:#34433d;--muted:#5b6761;--faint:#8a928d;--brand:#1f4d45;--brand-2:#2f6a5f;--ok:#3b7150;
--risk:#9c6410;--action:#bb4119;--blocker:#8c1c1c;--info:#3b5d78;--unknown:#6b706d;--ok-bg:#e2ece3;--risk-bg:#f5ead4;
--action-bg:#f7e1d7;--blocker-bg:#f2dcda;--info-bg:#e2e9ef;--d:"Inter Tight",Inter,"Segoe UI",sans-serif;--t:Inter,"Segoe UI",sans-serif;
--m:"JetBrains Mono",Consolas,monospace;--hatch:repeating-linear-gradient(135deg,rgba(107,112,109,.22) 0 2px,transparent 2px 6px)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:var(--paper);color:var(--ink);font:400 13px/1.4 var(--t);position:relative}
.abs{position:absolute}.mono{font-family:var(--m)}.disp{font-family:var(--d);letter-spacing:-.02em}
.mut{color:var(--muted)}.fnt{color:var(--faint)}.b{font-weight:600}
.cap{font:600 10.5px/1 var(--t);letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.code{font:500 11.5px/1 var(--m);background:var(--paper-2);padding:3px 5px;border-radius:2px;color:var(--ink-2)}
.plate{font:600 12px/1 var(--m);border:1.5px solid var(--ink);padding:3px 6px 3px 12px;border-radius:2px;position:relative;background:#fff}
.plate:before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:#2a49a0}
.hr{border-top:1px solid var(--line)}.vr{border-left:1px solid var(--line)}
.ok{color:var(--ok)}.risk{color:var(--risk)}.act{color:var(--action)}.blk{color:var(--blocker)}.unk{color:var(--unknown)}.info{color:var(--info)}
.tag{display:inline-block;font:600 10.5px/1 var(--t);padding:4px 6px;border-radius:2px;letter-spacing:.02em}
.t-ok{background:var(--ok-bg);color:var(--ok)}.t-risk{background:var(--risk-bg);color:var(--risk)}.t-act{background:var(--action-bg);color:var(--action)}
.t-blk{background:var(--blocker-bg);color:var(--blocker)}.t-unk{background:var(--paper-2);color:var(--unknown);border:1px dashed var(--line-2)}.t-info{background:var(--info-bg);color:var(--info)}
.sheet{background:var(--sheet);border:1px solid var(--line)}
.rec{outline:2px solid var(--brand);outline-offset:-2px}
table.g{border-collapse:collapse;width:100%}table.g td,table.g th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
table.g th{font:600 10.5px/1 var(--t);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line-2)}
.stamp{position:absolute;right:18px;bottom:12px;font:500 10.5px/1 var(--m);color:var(--faint);letter-spacing:.05em}
.hd{font:600 14px/1.2 var(--d)}.h1{font:600 34px/1.05 var(--d);letter-spacing:-.025em}.h2{font:600 22px/1.15 var(--d);letter-spacing:-.02em}
.huge{font:600 64px/1 var(--d);letter-spacing:-.035em}
.unknown-chip{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:1.3px dashed var(--unknown);border-radius:50%;font:700 10px/1 var(--t);color:var(--unknown)}
`;
export function page(id, name, body, extraCss = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${id} ${name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}${extraCss}</style></head><body>${body}<div class="stamp">${id} · ${name}</div></body></html>`;
}

// ---------- common data (the same operational world as the lab) ----------
export const NOW = "10:05";
export const JOB = { id: "J-4217", from: "Faro", to: "Porto", client: "Iberia Components", km: 556, posKm: 282 };
export const DRIVERS = [
  ["D-14", "Miguel Costa", "J-4217", "AA-42-ZP", "Em condução", "pausa até 10:50", "risk"],
  ["D-22", "Ana Ribeiro", "J-4218", "DE-18-RT", "Atribuída", "sai 11:30 · SLA em risco", "risk"],
  ["D-09", "Rui Santos", "—", "—", "Indisponível", "CQM caducado há 4 dias", "blk"],
  ["D-31", "Sofia Martins", "J-4219", "BX-07-LM", "Em condução", "A1 · Leiria", "ok"],
  ["D-17", "Pedro Lima", "J-4220", "CC-91-PA", "Em pausa", "retoma 10:40", "ok"],
  ["D-26", "Inês Duarte", "J-4221", "FT-33-NS", "Carregar", "Sines · cais 4", "ok"],
  ["D-40", "Carla Nunes", "J-4222", "GM-55-OR", "Em condução", "IP3 · obras nocturnas", "act"],
  ["D-41", "Jorge Pires", "—", "HL-02-AV", "Livre", "Maia · desde 08:00", "unk"],
];
export const JOBS = [
  ["J-4217", "Faro → Porto", "Iberia Components", "Em trânsito", "ok", 282, 556, "faro__porto__fastest", "D-14"],
  ["J-4218", "Porto → Lisboa", "Atlântico Retalho", "Atribuído", "risk", 0, 313, "porto__lisboa__fastest", "D-22"],
  ["J-4219", "Viana → Lisboa", "Minho Têxtil", "Em trânsito", "ok", 141, 383, "viana-do-castelo__lisboa__fastest", "D-31"],
  ["J-4220", "Évora → Porto", "Alentejo Agro", "Em pausa", "ok", 210, 390, "evora__porto__fastest", "D-17"],
  ["J-4221", "Sines → Braga", "Porto Químicos", "A carregar", "ok", 0, 420, "sines__braga__fastest", "D-26"],
  ["J-4222", "Viseu → Faro", "Beira Madeiras", "Em trânsito", "act", 96, 470, "viseu__faro__fastest", "D-40"],
  ["J-4223", "Coimbra → Lisboa", "Centro Farma", "Por planear", "unk", 0, 205, "coimbra__lisboa__fastest", "—"],
  ["J-4224", "Bragança → Porto", "Trás-os-Montes Frutas", "Por planear", "unk", 0, 210, "braganca__porto__fastest", "—"],
];
export const CITIES = { Porto: [41.15, -8.61], Lisboa: [38.72, -9.14], Faro: [37.02, -7.93], Coimbra: [40.21, -8.43], "Évora": [38.57, -7.91], Braga: [41.55, -8.42], Viseu: [40.66, -7.91], "Bragança": [41.81, -6.76], Guarda: [40.54, -7.27], Beja: [38.02, -7.86], Sines: [37.96, -8.87], Leiria: [39.74, -8.81], "Santarém": [39.24, -8.69], Aveiro: [40.64, -8.65], "Viana": [41.69, -8.83], "Castelo Branco": [39.82, -7.49], Setúbal: [38.52, -8.89] };
export const PT_OUTLINE = [[41.87,-8.87],[41.69,-8.84],[41.42,-8.78],[41.15,-8.68],[40.95,-8.65],[40.64,-8.75],[40.35,-8.8],[40.15,-8.87],[39.84,-8.94],[39.6,-9.07],[39.36,-9.38],[39.05,-9.42],[38.78,-9.5],[38.69,-9.32],[38.68,-9.17],[38.6,-9.2],[38.48,-9.05],[38.48,-8.9],[38.25,-8.78],[37.95,-8.87],[37.75,-8.8],[37.4,-8.82],[37.02,-8.99],[37.08,-8.67],[37.12,-8.5],[37.08,-8.2],[37.0,-7.93],[37.1,-7.6],[37.19,-7.41],[37.55,-7.5],[37.9,-7.25],[38.2,-6.95],[38.45,-7.3],[38.88,-7.16],[39.25,-7.25],[39.66,-7.53],[39.67,-7.0],[40.15,-6.88],[40.45,-6.8],[41.0,-6.93],[41.3,-6.5],[41.57,-6.2],[41.95,-6.55],[41.97,-7.2],[41.87,-7.9],[42.05,-8.2],[42.13,-8.2],[41.87,-8.87]];

// ---------- projection ----------
export function proj(bbox, w, h, pad = 0) {
  // bbox: [latMin, lngMin, latMax, lngMax]; equirectangular w/ cos(lat) correction, fit + center
  const [a, b, c, d] = bbox; const k = Math.cos(((a + c) / 2) * Math.PI / 180);
  const sx = (w - 2 * pad) / ((d - b) * k), sy = (h - 2 * pad) / (c - a); const s = Math.min(sx, sy);
  const ox = pad + (w - 2 * pad - (d - b) * k * s) / 2, oy = pad + (h - 2 * pad - (c - a) * s) / 2;
  const f = ([lat, lng]) => [ox + (lng - b) * k * s, oy + (c - lat) * s];
  f.scale = s; return f;
}
export const PT_BBOX = [36.9, -9.6, 42.2, -6.1];
export const pathD = (pts, P) => pts.map((p, i) => (i ? "L" : "M") + P(p).map(v => v.toFixed(1)).join(" ")).join("");
export const R = (id) => GEO.routes[id];
export function slice(id, k0, k1) { return R(id).pts.filter(p => p[2] >= k0 && p[2] <= k1); }
export function atKm(id, km) { const pts = R(id).pts; return pts.find(p => p[2] >= km) || pts[pts.length - 1]; }

// map: technical/cartographic base drawn from real fixtures
export function map({ w, h, bbox = PT_BBOX, pad = 20, tone = "paper", net = true, outline = true, cities = true, cityList, routes = [], marks = [], labels = [], extra = "", grid = false, rotate = 0 }) {
  const P = proj(bbox, w, h, pad);
  const bg = { paper: "#ece9df", white: "#fbfaf6", none: "transparent", sea: "#e6e9e6" }[tone];
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block">`;
  if (tone !== "none") s += `<rect width="${w}" height="${h}" fill="${tone === "paper" ? "#e4e6e1" : bg}"/>`;
  s += `<g transform="rotate(${rotate} ${w / 2} ${h / 2})">`;
  if (grid) { for (let x = 0; x < w; x += 40) s += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#d9d6cc" stroke-width=".5"/>`; for (let y = 0; y < h; y += 40) s += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#d9d6cc" stroke-width=".5"/>`; }
  if (outline) s += `<path d="${pathD(PT_OUTLINE, P)}Z" fill="${tone === "white" ? "#f4f2ea" : "#f1efe7"}" stroke="#cfcabb" stroke-width="1"/>`;
  if (net) for (const r of Object.values(GEO.routes)) s += `<path d="${pathD(r.pts.filter((_, i) => i % 2 === 0), P)}" fill="none" stroke="#d3cebf" stroke-width="${Math.max(.8, Math.min(2.2, P.scale / 160))}" stroke-linejoin="round"/>`;
  for (const r of routes) {
    const pts = r.pts || (r.k ? slice(r.id, r.k[0], r.k[1]) : R(r.id).pts);
    if (r.halo) s += `<path d="${pathD(pts, P)}" fill="none" stroke="${r.halo}" stroke-width="${(r.w || 3) + 8}" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`;
    s += `<path d="${pathD(pts, P)}" fill="none" stroke="${r.c || "#1f4d45"}" stroke-width="${r.w || 3}" stroke-linecap="round" stroke-linejoin="round" ${r.dash ? `stroke-dasharray="${r.dash}"` : ""} opacity="${r.o ?? 1}"/>`;
  }
  if (cities) for (const [n, ll] of Object.entries(CITIES)) { if (cityList && !cityList.includes(n)) continue; const [x, y] = P(ll); if (x < 0 || y < 0 || x > w || y > h) continue;
    s += `<circle cx="${x}" cy="${y}" r="2.3" fill="#fff" stroke="#6b706d"/><text x="${x + 6}" y="${y + 4}" font-family="Inter,Segoe UI" font-size="11" fill="#5b6761">${n}</text>`; }
  s += extra.replace ? (typeof extra === "function" ? extra(P) : extra) : "";
  for (const m of marks) { const [x, y] = P(m.ll || atKm(m.route, m.km)); s += mark(m.kind || "dot", x, y, m); }
  for (const l of labels) { const [x, y] = P(l.ll || atKm(l.route, l.km)); s += `<g font-family="Inter,Segoe UI">${l.line !== false ? `<line x1="${x}" y1="${y}" x2="${x + (l.dx || 30)}" y2="${y + (l.dy || -20)}" stroke="#141f1b" stroke-width=".8"/>` : ""}<text x="${x + (l.dx || 30) + 4}" y="${y + (l.dy || -20) + 4}" font-size="${l.size || 12}" font-weight="${l.bold ? 600 : 400}" fill="${l.c || "#141f1b"}">${l.t}</text>${l.sub ? `<text x="${x + (l.dx || 30) + 4}" y="${y + (l.dy || -20) + 18}" font-size="10.5" fill="#5b6761">${l.sub}</text>` : ""}</g>`; }
  return s + `</g></svg>`;
}
export function mapWithP(opts) { const P = proj(opts.bbox || PT_BBOX, opts.w, opts.h, opts.pad ?? 20); return { svg: map({ ...opts, extra: typeof opts.extra === "function" ? opts.extra(P) : (opts.extra || "") }), P }; }
export function mark(kind, x, y, m = {}) {
  const c = m.c || "#1f4d45";
  if (kind === "truck") return `<g><circle cx="${x}" cy="${y}" r="9" fill="#fff" stroke="${c}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="4.5" fill="${c}"/></g>`;
  if (kind === "stop") return `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" fill="#fff" stroke="#141f1b" stroke-width="2"/>`;
  if (kind === "end") return `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="#141f1b"/>`;
  if (kind === "start") return `<circle cx="${x}" cy="${y}" r="5" fill="#141f1b"/>`;
  if (kind === "restr") return `<g><path d="M${x} ${y - 10}L${x + 9} ${y + 6}H${x - 9}Z" fill="${m.fill || "#f2dcda"}" stroke="${c === "#1f4d45" ? "#8c1c1c" : c}" stroke-width="1.6"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${c === "#1f4d45" ? "#8c1c1c" : c}">!</text></g>`;
  if (kind === "unknown") return `<g><circle cx="${x}" cy="${y}" r="9" fill="#fff" stroke="#6b706d" stroke-width="1.4" stroke-dasharray="2.5 2"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#6b706d" font-family="Inter">?</text></g>`;
  if (kind === "fuel") return `<g><rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="2" fill="#fff" stroke="#3b5d78" stroke-width="1.5"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="#3b5d78" font-family="Inter">F</text></g>`;
  if (kind === "pause") return `<g><circle cx="${x}" cy="${y}" r="8" fill="#f5ead4" stroke="#9c6410" stroke-width="1.5"/><rect x="${x - 3}" y="${y - 3.5}" width="2" height="7" fill="#9c6410"/><rect x="${x + 1}" y="${y - 3.5}" width="2" height="7" fill="#9c6410"/></g>`;
  return `<circle cx="${x}" cy="${y}" r="${m.r || 4}" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;
}

// ---------- the physical truck (side elevation) ----------
export function truck({ w = 800, x = 0, y = 0, loadA = 18, loadB = 6, cap = 33, axleNote = true, ghostTrailer = false, trailerColor = "#f7f6f1", highlight = null, scale = 1, dims = true, tractorOnly = false } = {}) {
  const s = w / 800; const g = (n) => (n * s).toFixed(1);
  let o = `<g transform="translate(${x} ${y})" font-family="Inter,Segoe UI">`;
  // tractor
  o += `<path d="M${g(30)} ${g(250)}V${g(120)}Q${g(32)} ${g(70)} ${g(70)} ${g(66)}H${g(150)}Q${g(162)} ${g(66)} ${g(162)} ${g(80)}V${g(250)}Z" fill="#efeee8" stroke="#141f1b" stroke-width="1.4"/>`;
  o += `<path d="M${g(44)} ${g(90)}H${g(118)}V${g(140)}H${g(40)}Q${g(40)} ${g(100)} ${g(44)} ${g(90)}Z" fill="#dfe3df" stroke="#141f1b" stroke-width="1"/>`;
  o += `<rect x="${g(126)}" y="${g(92)}" width="${g(16)}" height="${g(26)}" fill="#fff" stroke="#141f1b"/>`;
  for (let i = 0; i < 6; i++) o += `<line x1="${g(36)}" y1="${g(178 + i * 8)}" x2="${g(60)}" y2="${g(178 + i * 8)}" stroke="#141f1b" stroke-width=".8"/>`;
  o += `<rect x="${g(30)}" y="${g(250)}" width="${g(250)}" height="${g(12)}" fill="#34433d"/>`;
  o += `<rect x="${g(120)}" y="${g(232)}" width="${g(70)}" height="${g(20)}" rx="${g(4)}" fill="#e7e5dd" stroke="#141f1b"/>`;
  if (!tractorOnly) {
    // trailer
    const tx = 170, tw = 600;
    o += `<rect x="${g(tx)}" y="${g(60)}" width="${g(tw)}" height="${g(180)}" fill="${trailerColor}" stroke="#141f1b" stroke-width="1.4" ${ghostTrailer ? `stroke-dasharray="6 4" fill-opacity=".4"` : ""}/>`;
    o += `<rect x="${g(tx)}" y="${g(240)}" width="${g(tw)}" height="${g(10)}" fill="#34433d"/>`;
    if (!ghostTrailer) {
      const slot = (tw - 20) / 11;
      for (let i = 0; i < 11; i++) {
        const filled = i < Math.ceil(loadA / 3) ? "A" : i < Math.ceil((loadA + loadB) / 3) ? "B" : null;
        const fill = filled === "A" ? "#dfe5e1" : filled === "B" ? "#1f4d45" : "none";
        const hl = highlight && highlight === filled;
        o += `<rect x="${g(tx + 10 + i * slot + 2)}" y="${g(150)}" width="${g(slot - 4)}" height="${g(88)}" fill="${fill}" fill-opacity="${filled === "B" ? (hl || !highlight ? .9 : .35) : 1}" stroke="${filled ? "#141f1b" : "#a8a397"}" stroke-width="${hl ? 1.8 : .7}" ${filled ? "" : `stroke-dasharray="3 3"`}/>`;
      }
    }
    // axles trailer
    for (const ax of [600, 660, 720]) o += wheel(g(ax), g(262), 28 * s);
    o += `<rect x="${g(385)}" y="${g(250)}" width="${g(10)}" height="${g(30)}" fill="#34433d"/>`;
  }
  for (const ax of [80, 230]) o += wheel(g(ax), g(262), 28 * s);
  if (dims && !tractorOnly) {
    o += `<line x1="${g(30)}" y1="${g(318)}" x2="${g(770)}" y2="${g(318)}" stroke="#5b6761" stroke-width=".8"/><line x1="${g(30)}" y1="${g(312)}" x2="${g(30)}" y2="${g(324)}" stroke="#5b6761"/><line x1="${g(770)}" y1="${g(312)}" x2="${g(770)}" y2="${g(324)}" stroke="#5b6761"/>`;
    o += `<text x="${g(400)}" y="${g(334)}" text-anchor="middle" font-size="${11 * Math.max(1, s * .9)}" fill="#5b6761">16,50 m · conjunto articulado · 40 t · 5 eixos</text>`;
    o += `<line x1="${g(790)}" y1="${g(60)}" x2="${g(790)}" y2="${g(290)}" stroke="#5b6761" stroke-width=".8"/><text x="${g(798)}" y="${g(180)}" font-size="${11 * Math.max(1, s * .9)}" fill="#5b6761">4,00 m</text>`;
  }
  o += `<line x1="0" y1="${g(290)}" x2="${g(800)}" y2="${g(290)}" stroke="#141f1b" stroke-width="1"/>`;
  return o + `</g>`;
}
function wheel(cx, cy, r) { return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="#141f1b"/><circle cx="${cx}" cy="${cy}" r="${r * .55}" fill="#d9d7cf"/><circle cx="${cx}" cy="${cy}" r="${r * .18}" fill="#141f1b"/></g>`; }

// top-down load plan
export function loadPlan({ w = 700, h = 90, a = 18, b = 6, cap = 33, hl = null }) {
  const cols = 11, cw = (w - 60) / cols, rh = (h - 12) / 3; let s = `<svg width="${w}" height="${h}" font-family="Inter"><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" fill="#fffdf8" stroke="#141f1b"/>`;
  s += `<text x="16" y="${h / 2}" font-size="9" fill="#5b6761" transform="rotate(-90 16 ${h / 2})" text-anchor="middle" letter-spacing="1">FRENTE</text><text x="${w - 14}" y="${h / 2}" font-size="9" fill="#5b6761" transform="rotate(-90 ${w - 14} ${h / 2})" text-anchor="middle" letter-spacing="1">PORTAS</text>`;
  let n = 0; for (let c = 0; c < cols; c++) for (let r = 0; r < 3; r++) { n++; const kind = n <= a ? "A" : n <= a + b ? "B" : null;
    const f = kind === "A" ? "#dfe5e1" : kind === "B" ? "#1f4d45" : "#fffdf8"; const op = hl && kind && hl !== kind ? .35 : 1;
    s += `<rect x="${30 + c * cw + 2}" y="${6 + r * rh + 2}" width="${cw - 4}" height="${rh - 4}" fill="${f}" fill-opacity="${op}" stroke="${kind ? "#34433d" : "#c9c5b8"}" stroke-width=".7" ${kind ? "" : `stroke-dasharray="3 2"`}/>`; }
  return s + `</svg>`;
}

// ---------- time ----------
export const hx = (t, x0, x1, h0 = 6, h1 = 18) => { const [hh, mm] = t.split(":").map(Number); return x0 + ((hh + mm / 60 - h0) / (h1 - h0)) * (x1 - x0); };
export function hourAxis(x0, x1, y, h0 = 6, h1 = 18, step = 1, color = "#8a928d") {
  let s = ""; for (let hh = h0; hh <= h1; hh += step) { const x = hx(`${hh}:00`, x0, x1, h0, h1); s += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 5}" stroke="${color}"/><text x="${x}" y="${y - 4}" font-family="JetBrains Mono,Consolas" font-size="10" fill="${color}" text-anchor="middle">${String(hh).padStart(2, "0")}</text>`; } return s;
}
// driver day segments for Miguel (J-4217)
export const DAY = [["06:00", "06:30", "outro", "Pré-partida"], ["06:30", "06:41", "carga", "Carga Faro"], ["06:41", "10:05", "cond", "A22 · A2 · A1"], ["10:05", "10:32", "cond", "→ Santarém"], ["10:32", "11:17", "pausa", "Pausa 45 min"], ["11:17", "12:57", "cond", "A1 → Coimbra"], ["12:57", "13:27", "carga", "Descarga Coimbra"], ["13:27", "15:12", "cond", "A1 → Porto"], ["15:12", "15:50", "carga", "Entrega Porto"]];
export const SEGC = { cond: "#1f4d45", pausa: "#f5ead4", carga: "#9aa8a2", outro: "#d9d7cf", livre: "#ece9df" };
export function dayBar(x0, x1, y, h, { segs = DAY, h0 = 6, h1 = 18, labels = true, now = NOW, future = true } = {}) {
  let s = ""; for (const [a, b, k, l] of segs) { const xa = hx(a, x0, x1, h0, h1), xb = hx(b, x0, x1, h0, h1); const fut = future && a >= now;
    s += `<rect x="${xa}" y="${y}" width="${Math.max(1, xb - xa - 1)}" height="${h}" fill="${SEGC[k]}" ${fut ? `fill-opacity="${k === "cond" ? .55 : .8}"` : ""} ${k === "pausa" ? `stroke="#9c6410" stroke-width="1"` : ""}/>`;
    if (labels && xb - xa > 60) s += `<text x="${xa + 6}" y="${y + h / 2 + 4}" font-family="Inter" font-size="11" fill="${k === "cond" ? "#fff" : "#34433d"}">${l}</text>`; }
  const xn = hx(now, x0, x1, h0, h1); s += `<line x1="${xn}" y1="${y - 14}" x2="${xn}" y2="${y + h + 6}" stroke="#141f1b" stroke-width="1.5"/><text x="${xn}" y="${y - 18}" text-anchor="middle" font-family="JetBrains Mono" font-size="10.5" font-weight="600" fill="#141f1b">${now}</text>`;
  return s;
}
export const svg = (w, h, inner, style = "") => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;${style}" font-family="Inter,Segoe UI">${inner}</svg>`;
export const T = (x, y, t, o = {}) => `<text x="${x}" y="${y}" font-size="${o.s || 12}" font-weight="${o.w || 400}" fill="${o.c || "#141f1b"}" text-anchor="${o.a || "start"}" font-family="${o.m ? "JetBrains Mono,Consolas" : o.d ? "Inter Tight,Inter" : "Inter,Segoe UI"}" ${o.ls ? `letter-spacing="${o.ls}"` : ""} ${o.tr ? `transform="${o.tr}"` : ""}>${t}</text>`;
export const L = (x1, y1, x2, y2, c = "#dddad0", w = 1, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
export const RECT = (x, y, w, h, f = "none", s = "#dddad0", o = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" stroke="${s}" ${o}/>`;
// header strip used by some studies
export const strip = (left, right = `<span class="mono">ter 6 out · <b>${NOW}</b></span>`) => `<div class="abs" style="left:40px;right:40px;top:18px;height:30px;display:flex;align-items:center;gap:16px;border-bottom:1px solid var(--line);padding-bottom:12px">${left}<div style="margin-left:auto;display:flex;gap:16px;align-items:center" class="mut">${right}</div></div>`;
export const jobChip = `<span class="code">J-4217</span><b>Faro → Porto</b><span class="mut">Iberia Components</span><span class="ok">● Em trânsito</span>`;
