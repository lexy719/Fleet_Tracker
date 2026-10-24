// FleetOS · attention field. Nothing has a fixed place. Every thing carries energy (clicks, events,
// time of day, relations); energy spreads along relations and fades. Space is shared continuously
// by energy (stable-order treemap), every rectangle is a spring (inertia, slight overshoot), groups
// split into their members when they have room and fold back into a number — or into a signal in
// the top bar — when they don't. The map is one of the things: it grows with geographic energy and
// its camera drifts to where the energy is.
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const C = { ink: "#1b1d22", ink3: "#868a93", focus: "#e0502a", sea: "#2f6f8f", ok: "#2a7a57", warn: "#c2850c", bad: "#d2401f" };
const AREA = { x: 16, y: 76, w: 1408, h: 808 };
const GAP = 10;

/* ─── The world ─── */
const K = (id, title, sub, extra = {}) => ({ id, title, sub, ...extra });
const GROUPS = {
  transportes: { label: "Transportes", dot: C.ink, kids: [
    K("J-4171", "Azambuja → Madrid", "Makro · chega 01:40", { prog: 0.64, late: true, facts: [["01:40", "chegada"], ["23:10–01:00", "janela"], ["620 km", "rota A-4"], ["24 t", "carga"]] }),
    K("J-4174", "Faro → Badajoz", "Frulact · chega 09:26", { prog: 0.82, facts: [["09:26", "chegada"], ["279 km", "A-22 · A-6"], ["18 t", "carga"]] }),
    K("J-4188", "Maia → Madrid", "Frulact · chega 14:30", { prog: 0.31, facts: [["14:30", "chegada"], ["560 km", "A-1 · A-62"], ["22 t", "carga"]] }),
    K("J-DEMO-PL", "Porto → Lisboa", "DEMO · chega 10:50", { prog: 0.9, facts: [["10:50", "chegada"], ["313 km", "A-1"]] }),
    K("J-4201", "Matosinhos → Guimarães", "Sonae · por atribuir", { facts: [["07:00", "amanhã"], ["sem camião", ""]] }),
    K("J-4199", "Setúbal → Faro", "ALDI · por atribuir", { facts: [["10:00", "amanhã"]] }),
    K("J-DEMO-SB", "Sines → Braga", "DEMO · por atribuir"),
  ] },
  camioes: { label: "Camiões", dot: C.sea, kids: [
    K("11-ST-78", "a conduzir · A-4", "Talavera · 29% depósito", { geo: [1030, 350], facts: [["29%", "depósito"], ["80 km/h", "agora"], ["620 km", "vazio previsto"]] }),
    K("90-QR-45", "pausa 45 min", "Badajoz", { geo: [660, 545], facts: [["61%", "depósito"], ["220 km", "a casa"]] }),
    K("78-MN-90", "a conduzir · A-1", "Coimbra", { geo: [552, 230] }),
    K("56-OP-23", "livre", "Porto · desde 05:30", { geo: [548, 236] }),
    K("23-AB-45", "livre", "Lisboa · desde 05:00", { geo: [555, 560] }),
  ] },
  motoristas: { label: "Motoristas", dot: C.ink, kids: [
    K("CM", "Carlos Mendes", "3 h 10 de condução hoje", { facts: [["3 h 10", "hoje"], ["41 / 56 h", "semana"], ["12 dias", "tacógrafo caduca"]] }),
    K("TA", "Tomás Almeida", "em pausa · Badajoz", { facts: [["5 h", "hoje"], ["livre 09:30", ""]] }),
    K("RC", "Rui Costa", "5 h 40 de condução hoje", { facts: [["5 h 40", "hoje"], ["49 / 56 h", "semana"]] }),
    K("AR", "Ana Ribeiro", "livre · Porto"),
    K("MC", "Miguel Costa", "folga"),
  ] },
  combustivel: { label: "Combustível", dot: C.ok, kids: [
    K("Talavera", "Repsol · A-4", "1,62 €/L · paragem de J-4171", { geo: [940, 390], facts: [["1,62 €/L", "gasóleo"], ["266 L", "previstos"], ["km 410", "na rota"]] }),
    K("Badajoz", "Cepsa · A-5", "1,64 €/L · paragem de J-4174", { geo: [705, 527], facts: [["1,64 €/L", "gasóleo"], ["180 L", "previstos"]] }),
    K("Elvas", "Galp · A-6", "1,89 €/L", { geo: [690, 532] }),
    K("semana", "−412 € esta semana", "nas paragens propostas", { facts: [["−412 €", "poupança"], ["33,1 L", "/100 km"]] }),
  ] },
  rotas: { label: "Rotas", dot: C.focus, kids: [
    K("A-4", "Azambuja → Madrid", "620 km · sem portagens", { geo: [820, 450] }),
    K("A-1", "Maia → Madrid", "560 km · 38 €", { geo: [700, 300] }),
    K("A-22", "Faro → Badajoz", "279 km · 12 €", { geo: [640, 640] }),
  ] },
  documentos: { label: "Documentos", dot: C.warn, kids: [
    K("CMR-4171", "CMR · J-4171", "emitido"),
    K("FT-118", "Fatura 2026/118", "Frulact · por emitir"),
    K("FT-119", "Fatura 2026/119", "Makro · por emitir"),
    K("GT-4188", "Guia · J-4188", "por emitir"),
  ] },
  alertas: { label: "Agora", dot: C.bad, dark: true, kids: [
    K("atraso-4171", "J-4171 vai chegar 40 min tarde", "Pausa + trânsito na A-4 · janela 23:10–01:00", { facts: [["01:40", "previsto"], ["00:55", "se pausar em Talavera"], ["avisar Makro", "ação"]] }),
  ] },
  amanha: { label: "Amanhã", dot: C.sea, kids: [
    K("T1", "Porto → Lisboa", "06:00 → 56-OP-23"), K("T2", "Sines → Braga", "06:00 → 23-AB-45"), K("T3", "Bragança → Faro", "06:00 · falta reboque"),
    K("T4", "Matosinhos → Guimarães", "07:00 → 90-QR-45"), K("T5", "Setúbal → Faro", "10:00 → 11-ST-78"),
  ] },
};
const ORDER = ["alertas", "transportes", "mapa", "camioes", "combustivel", "motoristas", "rotas", "documentos", "amanha"];
const PARENT = {};
for (const [g, v] of Object.entries(GROUPS)) for (const k of v.kids) PARENT[k.id] = g;
const KID = Object.fromEntries(Object.values(GROUPS).flatMap((v) => v.kids.map((k) => [k.id, k])));
const LINKS = [
  ["J-4171", "11-ST-78"], ["J-4171", "CM"], ["J-4171", "Talavera"], ["J-4171", "A-4"], ["J-4171", "atraso-4171"], ["J-4171", "CMR-4171"], ["J-4171", "FT-119"],
  ["11-ST-78", "CM"], ["11-ST-78", "Talavera"], ["atraso-4171", "Talavera"], ["atraso-4171", "CM"],
  ["J-4174", "90-QR-45"], ["J-4174", "TA"], ["J-4174", "Badajoz"], ["J-4174", "A-22"], ["J-4174", "FT-118"],
  ["J-4188", "78-MN-90"], ["J-4188", "RC"], ["J-4188", "A-1"], ["J-4188", "GT-4188"],
  ["J-4201", "56-OP-23"], ["J-4201", "AR"], ["J-4199", "11-ST-78"], ["T5", "11-ST-78"], ["T1", "56-OP-23"], ["T2", "23-AB-45"], ["T4", "90-QR-45"],
  ["Talavera", "semana"], ["Badajoz", "semana"], ["RC", "78-MN-90"],
];
const REL = {};
for (const [a, b] of LINKS) { (REL[a] ??= []).push(b); (REL[b] ??= []).push(a); }

/* ─── Energy ─── */
const E = {};
const e = (id) => E[id] ?? 0;
const IMPORT = { "J-4171": 0.6, "atraso-4171": 1.4, "11-ST-78": 0.3, semana: 0.3 };
function touch(id, amount = 1) {
  E[id] = Math.min(2.2, e(id) + amount);
  const g = GROUPS[id];
  if (g) { for (const k of g.kids) E[k.id] = e(k.id) + amount * 0.18; return; }
  E[PARENT[id]] = e(PARENT[id]) + amount * 0.35;
  for (const r of REL[id] ?? []) {
    E[r] = Math.min(2.2, e(r) + amount * 0.55);
    E[PARENT[r]] = e(PARENT[r]) + amount * 0.22;
    for (const r2 of REL[r] ?? []) if (r2 !== id) E[r2] = Math.min(2.2, e(r2) + amount * 0.12);
  }
}
const HALF_LIFE = 9;
function decay(dt) { const f = Math.pow(0.5, dt / HALF_LIFE); for (const k in E) E[k] *= f; }

/* ─── Weights (what deserves space now) ─── */
let clockMin = 480, alertOn = false;
function baseOf(g) {
  const late = clockMin > 1020;
  return { transportes: late ? 2.5 : 6, mapa: 9, camioes: 2.2, combustivel: 2.4, motoristas: 1.6, rotas: 1.2, documentos: late ? 2.6 : 1.3, alertas: alertOn ? 4.5 : 0, amanha: late ? 7 : 0.6 }[g];
}
const kidW = (k) => 1 + (IMPORT[k.id] ?? 0) + 5 * e(k.id) + (k.late ? 0.8 : 0);
const breath = (id, t) => 1 + 0.06 * Math.sin(t * 0.7 + id.length * 1.7) + 0.04 * Math.sin(t * 1.9 + id.charCodeAt(0));
function groupW(g, t) {
  if (g === "mapa") {
    let geo = 0;
    for (const k of Object.values(KID)) if (k.geo) geo += e(k.id);
    geo += 0.6 * (e("camioes") + e("combustivel") + e("rotas"));
    return (baseOf("mapa") + 5 * Math.min(2.5, geo)) * breath(g, t);
  }
  const kids = GROUPS[g].kids;
  const kidE = kids.reduce((a, k) => a + e(k.id), 0);
  const w = baseOf(g) + 3 * e(g) + 2.2 * Math.min(2.5, kidE);
  return w * breath(g, t);
}

/* ─── Stable-order treemap: split the ordered list where weights balance, along the long side ─── */
function treemap(items, r) {
  const out = {};
  const rec = (list, x, y, w, h) => {
    if (!list.length) return;
    if (list.length === 1) { out[list[0].id] = { x, y, w, h }; return; }
    const tot = list.reduce((a, b) => a + b.w, 0);
    let acc = 0, cut = 1, best = Infinity;
    for (let i = 1; i < list.length; i++) {
      acc += list[i - 1].w;
      const d = Math.abs(acc - tot / 2);
      if (d < best) { best = d; cut = i; }
    }
    const a = list.slice(0, cut), b = list.slice(cut);
    const fa = a.reduce((s, i) => s + i.w, 0) / tot;
    if (w >= h * 1.05) {
      const wa = (w - GAP) * fa;
      rec(a, x, y, wa, h); rec(b, x + wa + GAP, y, w - wa - GAP, h);
    } else {
      const ha = (h - GAP) * fa;
      rec(a, x, y, w, ha); rec(b, x, y + ha + GAP, w, h - ha - GAP);
    }
  };
  rec(items, r.x, r.y, r.w, r.h);
  return out;
}

/* ─── Layout of a moment ─── */
const SIG_IN = 1.9, SIG_OUT = 2.4;
const inField = {};
function targets(t) {
  const items = [];
  for (const g of ORDER) {
    const w = groupW(g, t);
    if (g !== "mapa") {
      if (inField[g] && w < SIG_IN) inField[g] = false;
      else if (!inField[g] && w > SIG_OUT) inField[g] = true;
      if (!inField[g]) continue;
    }
    items.push({ id: g, w });
  }
  const T = treemap(items, AREA);
  // signals: what is not in the field lives in the top bar
  let x = 170;
  for (const g of ORDER) if (g !== "mapa" && !inField[g]) {
    const n = GROUPS[g].kids.length;
    const w = 46 + GROUPS[g].label.length * 7.2 + String(n).length * 8;
    T[g] = { x, y: 20, w, h: 36, sig: true };
    x += w + 6;
  }
  // groups with room open into their members
  for (const g of ORDER) {
    if (g === "mapa" || T[g].sig) continue;
    const r = T[g];
    const open = r.w * r.h > 120000 && r.h > 200 && r.w > 260;
    T[g].open = open;
    if (!open) continue;
    const inner = { x: r.x + 10, y: r.y + 44, w: r.w - 20, h: r.h - 54 };
    const kids = GROUPS[g].kids.map((k) => ({ id: k.id, w: kidW(k) }));
    const room = Math.max(1, Math.floor((inner.w * inner.h) / 16000));
    const shown = [...kids].sort((a, b) => b.w - a.w).slice(0, room).map((k) => k.id);
    const ordered = kids.filter((k) => shown.includes(k.id));
    Object.assign(T, treemap(ordered, inner));
    for (const k of ordered) T[k.id].kid = g;
    T[g].hidden = kids.length - ordered.length;
  }
  return T;
}

/* ─── Springs ─── */
const S = {};
const STIFF = 90, DAMP = 15.5;
function spring(s, target, dt) {
  for (const k of ["x", "y", "w", "h"]) {
    const a = STIFF * (target[k] - s[k]) - DAMP * s["v" + k];
    s["v" + k] += a * dt;
    s[k] += s["v" + k] * dt;
  }
  const ta = target.alpha ?? 1;
  s.alpha += (ta - s.alpha) * Math.min(1, dt * 6);
}

/* ─── Content: chosen by the size the thing has right now ─── */
const bucketOfGroup = (r) => (r.sig ? "sig" : r.open ? "open" : r.w * r.h < 26000 || r.h < 74 || r.w < 150 ? "xs" : r.w * r.h < 70000 || r.h < 150 ? "s" : "m");
const bucketOfKid = (r) => (r.w < 120 || r.h < 52 ? "xs" : r.w * r.h < 24000 || r.h < 92 ? "s" : r.w * r.h < 70000 ? "m" : "l");
const NUM = { transportes: "14", camioes: "9", motoristas: "11", combustivel: "−412 €", rotas: "3", documentos: "4", alertas: "1", amanha: "10" };
const SUBN = { transportes: "hoje · 3 na estrada", camioes: "3 na estrada · 2 livres", motoristas: "4 livres", combustivel: "esta semana", rotas: "ativas", documentos: "por emitir", alertas: "precisa de ti", amanha: "por atribuir" };
function groupHTML(g, b, r) {
  const G = GROUPS[g];
  if (b === "sig") return `<div class="sigp"><i style="background:${G.dot}"></i>${G.label} <b>${NUM[g]}</b></div>`;
  if (b === "xs") return `<div class="in" style="justify-content:center"><div class="h" style="font-size:14px">${G.label}</div><div class="id" style="font-size:16px">${NUM[g]}</div></div>`;
  if (b === "s") return `<div class="in"><div class="h" style="font-size:16px">${G.label}</div><div class="t1" style="font-size:${Math.min(44, r.h * 0.38)}px">${NUM[g]}</div><div class="mut">${SUBN[g]}</div></div>`;
  if (b === "open") return `<div class="in"><div class="h" style="font-size:18px">${G.label} <span class="n">${NUM[g]}</span><span class="n" style="margin-left:auto">${r.hidden ? "+" + r.hidden : ""}</span></div></div>`;
  const kids = [...G.kids].sort((a, b2) => kidW(b2) - kidW(a));
  const rows = Math.max(0, Math.floor((r.h - 64) / 34));
  return `<div class="in"><div class="h" style="font-size:18px">${G.label} <span class="n">${NUM[g]}</span></div>${kids.slice(0, rows).map((k) => `<div class="rw"><span class="id">${k.id}</span>${k.title}<span class="s">${k.sub.split(" · ").at(-1)}</span></div>`).join("")}</div>`;
}
function kidHTML(k, b, r) {
  if (b === "xs") return `<div class="in" style="justify-content:center;align-items:center;padding:4px"><span class="id" style="font-size:11.5px">${k.id}</span></div>`;
  if (b === "s") return `<div class="in" style="gap:2px;padding:9px 11px"><span class="id">${k.id}</span><span class="t1" style="font-size:13px">${k.title}</span></div>`;
  const prog = k.prog != null ? `<div class="pbar"><i style="width:${k.prog * 100}%;background:${k.late ? C.bad : C.ink}"></i></div>` : "";
  if (b === "m") return `<div class="in" style="gap:4px"><span class="id">${k.id}</span><span class="t1" style="font-size:16px">${k.title}</span><span class="mut">${k.sub}</span>${prog}</div>`;
  const big = Math.min(30, 14 + r.w / 40);
  return `<div class="in" style="gap:6px;padding:14px 16px"><span class="id">${k.id}</span><span class="t1" style="font-size:${big}px">${k.title}</span><span class="mut" style="font-size:13px">${k.sub}</span>${prog}
    ${k.facts ? `<div class="facts">${k.facts.slice(0, Math.max(1, Math.floor((r.h - 120) / 26) * Math.max(1, Math.floor((r.w - 30) / 128)))).map(([a, b2]) => `<div class="fact"><b>${a}</b><span>${b2}</span></div>`).join("")}</div>` : ""}</div>`;
}

/* ─── Map content: camera follows geographic energy ─── */
const cam = { cx: 760, cy: 470, z: 1, vx: 0, vy: 0, vz: 0 };
function camTarget() {
  let sx = 0, sy = 0, sw = 0;
  for (const k of Object.values(KID)) if (k.geo) { const w = e(k.id); sx += k.geo[0] * w; sy += k.geo[1] * w; sw += w; }
  if (sw < 0.15) return { cx: 760, cy: 470, z: 1 };
  const k = clamp((sw - 0.15) / 1.2);
  return { cx: lerp(760, sx / sw, k), cy: lerp(470, sy / sw, k), z: 1 + 0.9 * k };
}
function camStep(dt) {
  const t = camTarget();
  for (const [p, v] of [["cx", "vx"], ["cy", "vy"], ["z", "vz"]]) {
    const a = 22 * (t[p] - cam[p]) - 9 * cam[v];
    cam[v] += a * dt; cam[p] += cam[v] * dt;
  }
}
function mapHTML(r) {
  const s = Math.max(r.w / 1440, r.h / 900) * cam.z;
  const P = ([x, y]) => [(x - cam.cx) * s + r.w / 2, (y - cam.cy) * s + r.h / 2];
  const pts = Object.values(KID).filter((k) => k.geo).map((k) => {
    const en = e(k.id), [x, y] = P(k.geo);
    const g = PARENT[k.id];
    const col = g === "combustivel" ? C.ok : g === "rotas" ? C.focus : C.ink;
    if (g === "rotas" && en < 0.08) return "";
    const rad = 5 + 13 * clamp(en / 1.4);
    return `<circle cx="${x}" cy="${y}" r="${rad + 6}" fill="${col}" opacity="${0.12 * clamp(en)}"/>
      <circle cx="${x}" cy="${y}" r="${rad}" fill="${col}" stroke="#fff" stroke-width="2.5" opacity="${0.5 + 0.5 * clamp(en * 2)}"/>
      ${en > 0.35 ? `<g opacity="${clamp((en - 0.35) * 3)}"><rect x="${x + rad + 6}" y="${y - 13}" width="${k.id.length * 8 + 20}" height="26" rx="8" fill="#f6f2ea"/><text x="${x + rad + 16}" y="${y + 5}" font-family="Geist Mono" font-weight="600" font-size="12.5">${k.id}</text></g>` : ""}`;
  }).join("");
  // links between energised geographic things
  const lines = LINKS.filter(([a, b]) => KID[a]?.geo && KID[b]?.geo && e(a) > 0.25 && e(b) > 0.25).map(([a, b]) => {
    const [x1, y1] = P(KID[a].geo), [x2, y2] = P(KID[b].geo);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.focus}" stroke-width="2" stroke-dasharray="5 5" opacity="${clamp(Math.min(e(a), e(b)))}"/>`;
  }).join("");
  return `<div class="mapimg" style="background-size:${1440 * s}px ${900 * s}px;background-position:${r.w / 2 - cam.cx * s}px ${r.h / 2 - cam.cy * s}px"></div>
    <svg class="ov" width="${r.w}" height="${r.h}">${lines}${pts}</svg>`;
}

/* ─── Render: keyed elements, style every frame, content when the bucket changes ─── */
const EL = {};
const stage = () => document.getElementById("stage");
function ensure(id, cls) {
  if (EL[id]) return EL[id];
  const el = document.createElement("div");
  el.className = "tile " + cls;
  el.dataset.id = id;
  el.innerHTML = `<div class="c old"></div><div class="c cur"></div><div class="glow"></div>`;
  stage().appendChild(el);
  EL[id] = { el, bucket: null, fade: 1 };
  return EL[id];
}
let lastT = {};
function step(t, dt) {
  decay(dt);
  camStep(dt);
  const T = targets(t);
  // births start from the parent (members) or the top bar (groups)
  for (const id in T) if (!S[id]) {
    const from = T[id].kid && S[T[id].kid] ? S[T[id].kid] : T[id];
    S[id] = { x: from.x + from.w / 2 - 20, y: from.y + from.h / 2 - 20, w: 40, h: 40, vx: 0, vy: 0, vw: 0, vh: 0, alpha: 0 };
    if (!T[id].kid && T[id].sig) Object.assign(S[id], { ...T[id], x: T[id].x, y: T[id].y, w: T[id].w, h: T[id].h });
  }
  for (const id in S) {
    const tgt = T[id] ?? (lastT[id]?.kid && T[lastT[id].kid] ? { ...T[lastT[id].kid], x: T[lastT[id].kid].x + T[lastT[id].kid].w / 2 - 20, y: T[lastT[id].kid].y + T[lastT[id].kid].h / 2 - 20, w: 40, h: 40, alpha: 0 } : { ...S[id], alpha: 0 });
    spring(S[id], tgt, dt);
    if (!T[id] && S[id].alpha < 0.02) { delete S[id]; EL[id]?.el.remove(); delete EL[id]; }
  }
  lastT = { ...lastT, ...T };
}
function draw(t) {
  for (const id in S) {
    const s = S[id], info = lastT[id] ?? {};
    const isKid = !!info.kid || !!PARENT[id] && !GROUPS[id];
    const g = isKid ? PARENT[id] : id;
    const rec = ensure(id, (isKid ? "kid " : "") + (id === "mapa" ? "map " : "") + (GROUPS[g]?.dark ? "dark" : ""));
    const r = { x: s.x, y: s.y, w: Math.max(8, s.w), h: Math.max(8, s.h), sig: info.sig, open: info.open, hidden: info.hidden };
    const el = rec.el;
    el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;opacity:${s.alpha};z-index:${info.sig ? 40 : isKid ? 6 : id === "mapa" ? 1 : 3};border-radius:${info.sig ? 999 : isKid ? 13 : 18}px`;
    const en = e(id);
    el.querySelector(".glow").style.opacity = clamp((en - 0.25) * 1.4) * (id === "mapa" ? 0 : 1);
    if (id === "mapa") { el.querySelector(".cur").innerHTML = mapHTML(r); continue; }
    const b = isKid ? bucketOfKid(r) : bucketOfGroup(r);
    const key = b + (b === "m" && !isKid ? Math.floor((r.h - 64) / 34) : "") + (b === "l" ? Math.round(r.w / 128) + "x" + Math.round(r.h / 26) : "") + (b === "open" ? r.hidden : "");
    if (key !== rec.bucket) {
      el.querySelector(".old").innerHTML = el.querySelector(".cur").innerHTML;
      el.querySelector(".cur").innerHTML = isKid ? kidHTML(KID[id], b, r) : groupHTML(id, b, r);
      rec.fade = rec.bucket ? (rec.bucket.slice(0, 2) !== key.slice(0, 2) ? 0 : 0.38) : 1;
      rec.bucket = key;
    }
    // sequential crossfade: the old content leaves before the new one arrives (never two texts at once)
    rec.fade = Math.min(1, rec.fade + 1 / 8);
    el.querySelector(".old").style.opacity = Math.max(0, 1 - rec.fade * 2.6);
    el.querySelector(".cur").style.opacity = clamp((rec.fade - 0.38) / 0.62);
    el.querySelector(".cur").style.transform = `translateY(${(1 - clamp((rec.fade - 0.38) / 0.62)) * 6}px)`;
  }
}

/* ─── A day, scripted only as inputs (clicks and events); everything else emerges ─── */
const SCRIPT = [
  [0, "cap", "08:00 · a página parte do que é normal a esta hora"],
  [3.2, "click", "J-4171"], [3.2, "cap", "Toque num transporte · a energia corre pelo camião, motorista, bomba, rota e documentos"],
  [10, "event", "alert"], [10, "cap", "Um acontecimento · o atraso entra sozinho e puxa o que lhe está ligado"],
  [15.5, "click", "combustivel"], [15.5, "cap", "Toque em Combustível · mistura-se com o que já lá estava"],
  [19, "click", "Talavera"],
  [24, "cap", "Sem toques · a página acalma devagar"],
  [31, "clock", 1030], [31, "cap", "17:10 · o dia muda o peso das coisas: amanhã e documentos sobem"],
  [36, "click", "RC"], [36, "cap", "Toque no Rui · os seus camiões e transportes acordam"],
  [41, "click", "documentos"],
  [46, "end"],
];
window.TOTAL = 46;
const clickAt = {};
let capText = "";
const cursor = { x: 1200, y: 800, el: null };
function cursorTo(id) {
  const s = S[id];
  return s ? [s.x + Math.min(s.w / 2, 70), s.y + Math.min(s.h / 2, 26)] : [cursor.x, cursor.y];
}
let simT = 0;
const DT = 1 / 24;
const ripples = [];
function advance(to) {
  while (simT + DT <= to + 1e-6) {
    const t0 = simT, t1 = simT + DT;
    for (const [at, kind, arg] of SCRIPT) if (at >= t0 && at < t1) {
      if (kind === "click") { touch(arg, 1.3); ripples.push({ id: arg, t: at }); }
      if (kind === "event") { alertOn = true; touch("atraso-4171", 1.6); }
      if (kind === "cap") capText = arg;
      if (kind === "clock") clockTarget = arg;
    }
    clockMin = lerp(clockMin, clockTarget, 0.006) + DT * 2;
    step(t1, DT);
    simT = t1;
  }
}
let clockTarget = 480;
function drawCursor(t) {
  if (!cursor.el) {
    cursor.el = document.createElement("div");
    cursor.el.className = "cursor";
    cursor.el.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.5 L10 13 L16 13 Z" fill="#1b1d22" stroke="#fff" stroke-width="1.5"/></svg>`;
    document.body.appendChild(cursor.el);
  }
  const next = SCRIPT.find(([at, kind]) => kind === "click" && at >= t - 0.25 && at - t < 1.1);
  if (next) {
    const [tx, ty] = cursorTo(next[2]);
    const k = ease(1 - (next[0] - t) / 1.1);
    cursor.x = lerp(cursor.x, tx, Math.min(1, k * 0.35 + 0.05));
    cursor.y = lerp(cursor.y, ty, Math.min(1, k * 0.35 + 0.05));
  }
  cursor.el.style.left = cursor.x + "px";
  cursor.el.style.top = cursor.y + "px";
  document.querySelectorAll(".ripple").forEach((r) => r.remove());
  for (const rp of ripples) {
    const age = t - rp.t;
    if (age < 0 || age > 0.7) continue;
    const d = 10 + age * 90;
    const r = document.createElement("div");
    r.className = "ripple";
    r.style.cssText = `left:${cursor.x - d / 2}px;top:${cursor.y - d / 2}px;width:${d}px;height:${d}px;opacity:${1 - age / 0.7}`;
    document.body.appendChild(r);
  }
}
const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
window.render = (t) => {
  advance(t);
  draw(t);
  drawCursor(t);
  document.getElementById("clk").textContent = hm(clockMin);
  document.getElementById("cap").textContent = capText;
};

/* ─── Live mode (?live): real clicks inject energy; time keeps running ─── */
if (location.search.includes("live")) {
  window.render(0.01);
  document.getElementById("cap").textContent = "Toca em qualquer coisa · tecla a: acontecimento · tecla t: avançar o relógio";
  let last = performance.now(), tt = 0;
  stage().addEventListener("click", (ev) => { const el = ev.target.closest(".tile"); if (el && el.dataset.id !== "mapa") touch(el.dataset.id, 1.3); });
  addEventListener("keydown", (ev) => { if (ev.key === "a") { alertOn = true; touch("atraso-4171", 1.6); } if (ev.key === "t") clockTarget += 120; });
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; tt += dt;
    clockMin = lerp(clockMin, clockTarget, 0.02) + dt * 2;
    step(tt, dt); draw(tt);
    document.getElementById("clk").textContent = hm(clockMin);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} else window.render(0);
