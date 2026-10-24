// Content blocks for Round 3 (HTML/SVG sized to their block rects)
import { svg, T, L, RECT, hourAxis, hx, dayBar, truck, loadPlan, DAY, SEGC, NOW } from "./kit.mjs";
export const KM = 556, RID = "faro__porto__fastest";
export const STOPS = [[0, "Faro", "06:41 ✓"], [320, "Santarém", "pausa 10:32"], [441, "Coimbra", "12:57 · 12:30–13:30"], [556, "Porto", "15:12 · 15:30–17:00"]];
const ink = (dark) => dark ? "#e2ebe7" : "#141f1b", mut = (dark) => dark ? "#8fa59d" : "#5b6761";

export const head = (t, sub = "", { dark = false, size = 34, cap = "" } = {}) => `<div style="padding:4px 0;color:${ink(dark)}">${cap ? `<div class="cap" style="color:${mut(dark)}">${cap}</div>` : ""}<div class="disp" style="font-size:${size}px;font-weight:600;line-height:1.05;margin-top:${cap ? 8 : 0}px">${t}</div>${sub ? `<div style="color:${mut(dark)};font-size:${Math.max(13, size * .42)}px;margin-top:8px">${sub}</div>` : ""}</div>`;
export const crumbs = (items, dark) => `<div style="display:flex;gap:14px;align-items:center;font-size:13px;color:${mut(dark)}">${items.map((t, i) => `<span style="${i === items.length - 1 ? `color:${ink(dark)};font-weight:600` : ""}">${t}</span>`).join(`<span style="opacity:.5">/</span>`)}</div>`;

// horizontal journey strip
export function jStrip(w, h, { now = 282, dark = false, stops = STOPS, k0 = 0, k1 = KM, legal = false, fuel = false, label = true } = {}) {
  const x = (k) => 20 + ((k - k0) / (k1 - k0)) * (w - 40), y = Math.min(h / 2, 40); let s = L(x(k0), y, x(k1), y, dark ? "#2f4a42" : "#c9c5b8", 5) + L(x(k0), y, x(Math.min(now, k1)), y, dark ? "#9fd3b8" : "#1f4d45", 5);
  if (legal) s += RECT(x(now), y - 9, x(331) - x(now), 18, "#9c6410", "none", 'opacity=".35"') + L(x(331), y - 16, x(331), y + 16, "#9c6410", 2);
  for (const [k, n, t] of stops) { if (k < k0 || k > k1) continue; const X = x(k), a = k === k0 ? "start" : k === k1 ? "end" : "middle"; s += `<rect x="${X - 6}" y="${y - 6}" width="12" height="12" fill="${k === 320 ? "#f5ead4" : dark ? "#0f1a17" : "#fff"}" stroke="${k === 320 ? "#9c6410" : ink(dark)}" stroke-width="2"/>`; if (label) s += T(X, y + 26, n, { a, w: 600, s: 13, c: ink(dark) }) + T(X, y + 42, t, { a, s: 11, m: 1, c: mut(dark) }); }
  if (now >= k0 && now <= k1) s += `<circle cx="${x(now)}" cy="${y}" r="8" fill="${dark ? "#0f1a17" : "#fff"}" stroke="${dark ? "#9fd3b8" : "#1f4d45"}" stroke-width="3"/>`;
  return svg(w, h, s);
}
// vertical journey column (north up: Porto top)
export function jColumn(w, h, { now = 282, dark = false, times = true } = {}) {
  const y = (k) => h - 30 - (k / KM) * (h - 60), x = w - 24; let s = L(x, y(0), x, y(KM), dark ? "#2f4a42" : "#c9c5b8", 5) + L(x, y(0), x, y(now), dark ? "#9fd3b8" : "#1f4d45", 5);
  for (const [k, n, t] of STOPS) s += `<rect x="${x - 7}" y="${y(k) - 7}" width="14" height="14" fill="${k === 320 ? "#f5ead4" : dark ? "#0f1a17" : "#fff"}" stroke="${k === 320 ? "#9c6410" : ink(dark)}" stroke-width="2"/>` + T(x - 18, y(k) - 2, n, { a: "end", w: 600, s: 14, c: ink(dark) }) + (times ? T(x - 18, y(k) + 15, t, { a: "end", s: 11, m: 1, c: mut(dark) }) : "");
  s += `<circle cx="${x}" cy="${y(now)}" r="9" fill="${dark ? "#0f1a17" : "#fff"}" stroke="${dark ? "#9fd3b8" : "#1f4d45"}" stroke-width="3"/>` + T(x - 18, y(now) + 4, "agora · 10:05", { a: "end", s: 12, w: 600, c: ink(dark) });
  return svg(w, h, s);
}
// driver day ribbon (horizontal), optionally with legal band
export function dayRibbon(w, h, { dark = false, legal = true, h0 = 6, h1 = 18, title = true } = {}) {
  const x0 = title ? 150 : 10, x1 = w - 10; let s = hourAxis(x0, x1, 16, h0, h1, 1, dark ? "#8fa59d" : "#8a928d") + dayBar(x0, x1, 30, Math.min(26, h * .3), { labels: h > 60, h0, h1 });
  if (title) s += T(0, 46, "Miguel Costa", { w: 600, s: 14, c: ink(dark) }) + T(0, 63, "legal até 10:50", { s: 11.5, c: "#9c6410" });
  if (legal && h > 70) { const y = 30 + Math.min(26, h * .3) + 14; s += RECT(x0, y, x1 - x0, 12, dark ? "#16241f" : "#ece9df", "none") + `<path d="M${hx("06:41", x0, x1, h0, h1)} ${y + 12} L${hx("10:05", x0, x1, h0, h1)} ${y} V${y + 12}Z" fill="#9c6410"/>` + L(hx("10:50", x0, x1, h0, h1), y - 4, hx("10:50", x0, x1, h0, h1), y + 16, ink(dark), 2) + T(hx("10:50", x0, x1, h0, h1) + 5, y + 11, "4h30 · 10:50", { s: 10.5, m: 1, c: ink(dark) }); }
  if (dark) s = s.replace(/fill="#34433d"/g, 'fill="#cfe0d9"');
  return svg(w, h, s);
}
// vertical day (time runs down) — edge timeline
export function dayColumn(w, h, { dark = false, events = true } = {}) {
  const y = (t) => h - 20 - ((+t.split(":")[0] + t.split(":")[1] / 60 - 6) / 11) * (h - 40); let s = "";
  for (let hh = 6; hh <= 17; hh++) s += L(w - 46, y(`${hh}:00`), w - 40, y(`${hh}:00`), mut(dark)) + T(w - 50, y(`${hh}:00`) + 4, String(hh).padStart(2, "0"), { a: "end", m: 1, s: 10, c: mut(dark) });
  for (const [a, b, k] of DAY) s += RECT(w - 36, y(b), 22, Math.max(1, y(a) - y(b) - 1), SEGC[k], k === "pausa" ? "#9c6410" : "none", a >= NOW ? `fill-opacity=".55"` : "");
  s += L(w - 44, y(NOW), w - 8, y(NOW), ink(dark), 2) + T(w - 50, y(NOW) + 4, NOW, { a: "end", m: 1, s: 11, w: 700, c: ink(dark) });
  s += L(w - 44, y("10:50"), w - 8, y("10:50"), "#9c6410", 2, "3 2");
  if (events) [["10:32", "pausa · Santarém"], ["12:57", "Coimbra"], ["15:12", "Porto"]].forEach(([t, n]) => s += T(w - 60, y(t) + 4, n, { a: "end", s: 12, c: ink(dark) }));
  return svg(w, h, s);
}
export const truckBlock = (w, h, { dark = false, label = true, a = 18, b = 6 } = {}) => { let s = truck({ w: Math.min(w - 20, (h - (label ? 40 : 0)) * 2.3), x: 10, y: label ? 30 : 4, loadA: a, loadB: b, dims: false });
  if (dark) s = s.replace(/#141f1b/g, "#cfe0d9").replace(/#efeee8|#f7f6f1|#dfe3df|#e7e5dd/g, "#16241f");
  return svg(w, h, (label ? `<text x="10" y="18" font-family="JetBrains Mono" font-size="13" font-weight="600" fill="${ink(dark)}">AA-42-ZP + PT-3821</text>` : "") + s); };
export const chip = (t, s = "", { c = "#141f1b", dark = false, dash = false } = {}) => `<div style="background:${dark ? "#0f1a17" : "#fffdf8"};border:1.4px ${dash ? "dashed" : "solid"} ${c};padding:8px 12px;height:100%"><div style="font:600 13px Inter;color:${c}">${t}</div>${s ? `<div style="font-size:11.5px;color:${mut(dark)};margin-top:2px">${s}</div>` : ""}</div>`;
export function logic(w, h, { compact = false } = {}) {
  const cs = [["ok", "Peso > 3,5 t", "40 t"], ["ok", "≥ 3 eixos", "5"], ["unk", "1.º eixo ≥ 1,1 m", "não registado"], ["ok", "Mercadorias", "sim"], ["no", "Horário 07–10 / 17–20", "passa 15:05"]];
  if (compact) return `<div style="font-size:12px;line-height:1.75;padding:10px 12px;background:#fffdf8;border:1.4px dashed #6b706d;height:100%"><b style="color:#6b706d">VCI · aplica-se? desconhecido</b>${cs.map(([s, t, f]) => `<div><span style="color:${s === "ok" ? "#3b7150" : s === "unk" ? "#6b706d" : "#8c1c1c"}">${s === "ok" ? "✓" : s === "unk" ? "?" : "✕"}</span> ${t} <span style="color:#8a928d">· ${f}</span></div>`).join("")}</div>`;
  let s = ""; cs.forEach(([st, t, f], i) => { const y = 10 + i * ((h - 20) / 5), c = st === "ok" ? "#3b7150" : st === "unk" ? "#6b706d" : "#8c1c1c"; s += RECT(0, y, w * .55, (h - 20) / 5 - 10, "#fffdf8", c, st === "unk" ? 'stroke-dasharray="4 3"' : "") + T(10, y + 20, (st === "ok" ? "✓ " : st === "unk" ? "? " : "✕ ") + t, { s: 12.5, w: 600, c }) + T(10, y + 36, f, { s: 11, c: "#5b6761" }) + `<path d="M${w * .55} ${y + 20} C ${w * .68} ${y + 20}, ${w * .68} ${h / 2}, ${w * .75} ${h / 2}" fill="none" stroke="${c}" stroke-width="1.3"/>`; });
  s += `<circle cx="${w * .78}" cy="${h / 2}" r="16" fill="#fff" stroke="#141f1b" stroke-width="1.5"/>` + T(w * .78, h / 2 + 5, "E", { a: "middle", w: 700 }) + T(w * .78, h / 2 + 40, "não se aplica hoje", { a: "middle", s: 12, w: 600, c: "#3b7150" });
  return svg(w, h, s);
}
export function portal(w, h, { dark = false } = {}) { const sc = Math.min(w / 8, h / 5.6), gx = w / 2, gy = h - 20, m = (v) => v * sc; let s = "";
  s += `<path d="M${gx - m(3.2)} ${gy} V${gy - m(4.3) - 20} H${gx + m(3.2)} V${gy} H${gx + m(2.3)} V${gy - m(4.3)} H${gx - m(2.3)} V${gy}Z" fill="${dark ? "#2f4a42" : "#d9d6cc"}" stroke="${ink(dark)}"/>`;
  s += `<rect x="${gx - m(1.275)}" y="${gy - m(4)}" width="${m(2.55)}" height="${m(4) - 10}" fill="${dark ? "#16241f" : "#fffdf8"}" stroke="${ink(dark)}" stroke-width="1.4"/><rect x="${gx - m(1.275)}" y="${gy - m(4.3)}" width="${m(2.55)}" height="${m(.3)}" fill="#e2ece3"/>` + T(gx, gy - m(4.15) + 4, "30 cm", { a: "middle", s: 11, w: 700, c: "#3b7150" }) + L(gx - m(3.6), gy, gx + m(3.6), gy, ink(dark), 1.5);
  s += T(gx, 16, "Campanhã · 4,30 m sinalizado · PT-3821 4,00 m", { a: "middle", s: 12, w: 600, c: ink(dark) });
  return svg(w, h, s); }
export function marey(w, h, { dark = false } = {}) { const x0 = 70, x1 = w - 10, y0 = h - 20, y1 = 24, X = (t) => hx(t, x0, x1, 6, 18), Y = (k) => y0 - k / KM * (y0 - y1); let s = hourAxis(x0, x1, 14, 6, 18, 2, mut(dark));
  STOPS.forEach(([k, n]) => s += L(x0, Y(k), x1, Y(k), dark ? "#22352f" : "#e4e1d7") + T(x0 - 6, Y(k) + 4, n, { a: "end", s: 11, c: ink(dark) }));
  s += RECT(X("12:30"), Y(441) - 6, X("13:30") - X("12:30"), 12, "#e2ece3", "#3b7150") + RECT(X("15:30"), Y(556) - 6, X("17:00") - X("15:30"), 12, "#e2ece3", "#3b7150");
  const p = [["06:41", 0], ["10:32", 320], ["11:17", 320], ["12:57", 441], ["13:27", 441], ["15:12", 556]]; s += `<path d="${p.map(([t, k], i) => (i ? "L" : "M") + X(t) + " " + Y(k)).join("")}" fill="none" stroke="${dark ? "#9fd3b8" : "#1f4d45"}" stroke-width="2.5"/>` + L(X(NOW), y1, X(NOW), y0, ink(dark), 1);
  return svg(w, h, s); }
export const rows = (items, { dark = false, sel = 0 } = {}) => `<div style="font-size:13px;color:${ink(dark)}">${items.map(([id, r, d, st, c], i) => `<div style="display:grid;grid-template-columns:70px 1fr;gap:10px;padding:11px 0;border-top:1px solid ${i === sel ? ink(dark) : dark ? "#22352f" : "#dddad0"};${i === sel ? "font-weight:600" : ""}"><span class="mono" style="font-size:11.5px;color:${mut(dark)}">${id}</span><div><div>${r}</div><div style="font-size:11.5px;font-weight:400;color:${c || mut(dark)}">${d} · ${st}</div></div></div>`).join("")}</div>`;
export const OPS = [["J-4217", "Faro → Porto", "Miguel Costa", "pausa até 10:50", "#9c6410"], ["J-4218", "Porto → Lisboa", "Ana Ribeiro", "janela 16:00 em risco", "#bb4119"], ["J-4219", "Viana → Lisboa", "Sofia Martins", "ETA 13:10"], ["J-4220", "Évora → Porto", "Pedro Lima", "retoma 10:40"], ["J-4221", "Sines → Braga", "Inês Duarte", "a carregar"], ["J-4222", "Viseu → Faro", "Carla Nunes", "IP3 → N2", "#bb4119"], ["J-4223", "Coimbra → Lisboa", "sem motorista", "por planear", "#8c1c1c"], ["J-4224", "Bragança → Porto", "sem motorista", "por planear", "#8c1c1c"]];
export const JR = { "J-4217": ["faro__porto__fastest", 282], "J-4218": ["porto__lisboa__fastest", 0], "J-4219": ["viana-do-castelo__lisboa__fastest", 141], "J-4220": ["evora__porto__fastest", 210], "J-4221": ["sines__braga__fastest", 0], "J-4222": ["viseu__faro__fastest", 96], "J-4223": ["coimbra__lisboa__fastest", 0], "J-4224": ["braganca__porto__fastest", 0] };
export const docLine = (dark) => `<div style="font-size:12.5px;line-height:1.8;color:${ink(dark)}"><div><b>CMR rev. 7</b> <span style="color:${mut(dark)}">Faro ✓ · Coimbra ☐ · Porto ☐</span></div><div><b>CQM</b> <span style="color:#9c6410">expira 16 nov</span></div><div><b>IPO PT-3821</b> <span style="color:#8c1c1c">caducou 2 out</span></div></div>`;
