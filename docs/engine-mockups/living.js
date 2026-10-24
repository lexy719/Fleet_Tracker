// Living environment — presence and morphing. Every thing (the map included) can be a signal in the
// top bar, a corner, a side block, the focus (owning the map when it is geographic), the whole
// screen, or absent. Focus changes make every thing renegotiate its place and morph continuously.
// Interactive (click a thing: focus; click it again: whole screen; Esc / empty space: back) and
// deterministic for video (window.render(t) plays a scripted day).
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const lerp = (a, b, k) => a + (b - a) * k;
const C = { ink: "#1b1d22", ink3: "#868a93", focus: "#e0502a", sea: "#2f6f8f", ok: "#2a7a57", warn: "#c2850c", bad: "#d2401f", paper: "#f6f2ea" };

const THINGS = {
  mapa: { label: "Mapa", geo: true },
  transportes: { label: "Transportes", dot: C.ink, n: "14" },
  combustivel: { label: "Combustível", dot: C.ok, n: "−412 €", geo: true },
  camioes: { label: "Camiões", dot: C.sea, n: "9", geo: true },
  motoristas: { label: "Motoristas", dot: C.ink, n: "11" },
  rotas: { label: "Rotas", dot: C.focus, n: "3", geo: true },
  documentos: { label: "Documentos", dot: C.warn, n: "3" },
  alertas: { label: "Alertas", dot: C.bad, n: "1" },
};
const ORDER = ["transportes", "combustivel", "camioes", "motoristas", "rotas", "documentos", "alertas"];
const RELATED = {
  combustivel: ["camioes", "transportes"], camioes: ["motoristas", "combustivel"], rotas: ["transportes", "alertas"],
  transportes: ["alertas", "motoristas"], motoristas: ["camioes", "transportes"], documentos: ["transportes"], alertas: ["camioes", "transportes"],
};

/* ─── Solver: state → presence + rectangle of every thing ─── */
const A = { x: 16, y: 76, w: 1408, h: 808 };
const R = (x, y, w, h, level, extra = {}) => ({ x, y, w, h, level, ...extra });
function layout(st) {
  const L = {};
  const F = st.focus;
  if (!F) {
    L.mapa = R(440, 76, 984, 808, "stage");
    L.transportes = R(16, 76, 408, st.alert ? 520 : 640, "side");
    if (st.alert) L.alertas = R(16, 610, 408, 274, "corner");
    else L.combustivel = R(16, 732, 408, 152, "corner");
  } else if (st.total) {
    L[F] = R(A.x, A.y, A.w, A.h, "total", { owns: !!THINGS[F].geo });
    if (THINGS[F].geo) L.mapa = R(A.x, A.y, A.w, A.h, "owned");
  } else if (THINGS[F].geo) {
    L[F] = R(440, 76, 984, 808, "stage", { owns: true });
    L.mapa = R(440, 76, 984, 808, "owned");
    const [a, b] = RELATED[F];
    L[a] = R(16, 76, 408, 470, "side");
    if (b) L[b] = R(16, 562, 408, 322, "corner");
  } else {
    L[F] = R(16, 76, 900, 808, "stage");
    const rel = RELATED[F];
    if (F !== "documentos") {
      L.mapa = R(932, 76, 492, 400, "side");
      rel.forEach((k, i) => (L[k] = R(932, 492 + i * 204, 492, 188, "corner")));
    } else L[rel[0]] = R(932, 76, 492, 808, "side");
  }
  // Signals: what is not on stage lives in the top bar, in a fixed order.
  let x = 330;
  for (const k of ORDER)
    if (!L[k]) {
      const w = 54 + THINGS[k].label.length * 7.4 + String(THINGS[k].n).length * 7.6;
      L[k] = R(x, 20, w, 36, "sig");
      x += w + 6;
    }
  if (!L.mapa) L.mapa = R(A.x + A.w / 2 - 40, A.y + A.h / 2 - 30, 80, 60, "hidden");
  return L;
}

/* ─── The map's view: which image, centre, zoom (interpolated like everything else) ─── */
function mapView(st) {
  if (st.focus === "combustivel") return { img: 0, cx: 780, cy: 460, z: st.total ? 1.05 : 1.25 };
  if (st.focus === "camioes" || st.focus === "alertas") return { img: 1, cx: 730, cy: 420, z: 1.15 };
  if (st.focus === "rotas") return { img: 0, cx: 760, cy: 500, z: st.total ? 1.0 : 1.1 };
  if (st.alert && !st.focus) return { img: 0, cx: 800, cy: 430, z: 1.05 };
  return { img: 0, cx: 760, cy: 470, z: 1.0 };
}
const IMGS = ["bg-overview.png", "bg-madrid.png"];

/* ─── Content per presence (simple on purpose: the point is place and motion) ─── */
const rows = (list, n) => list.slice(0, Math.max(0, n)).map(([k, t, s]) => `<div class="r"><span class="k">${k}</span>${t}<span class="s">${s ?? ""}</span></div>`).join("");
const DATA = {
  transportes: [["J-4174", "Faro → Badajoz", "chega 09:26"], ["J-4171", "Azambuja → Madrid", "01:40"], ["J-4188", "Maia → Madrid", "14:30"], ["J-DEMO-PL", "Porto → Lisboa", "10:50"], ["J-4201", "Matosinhos → Guimarães", "por atribuir"], ["J-4199", "Setúbal → Faro", "por atribuir"], ["J-DEMO-SB", "Sines → Braga", "por atribuir"]],
  combustivel: [["J-4171", "abastecer em Talavera", "1,62 €/L"], ["J-4174", "abastecer em Badajoz", "1,64 €/L"], ["J-4188", "sem paragem", "chega 38%"], ["frota", "€ por 100 km", "33,1 L"]],
  camioes: [["11-ST-78", "a conduzir · A-4", "Talavera"], ["90-QR-45", "pausa 45 min", "Badajoz"], ["78-MN-90", "a conduzir · A-1", "Coimbra"], ["56-OP-23", "livre", "Porto"], ["23-AB-45", "livre", "Lisboa"]],
  motoristas: [["CM", "Carlos Mendes", "3 h 10 hoje"], ["TA", "Tomás Almeida", "pausa"], ["RC", "Rui Costa", "5 h 40 hoje"], ["AR", "Ana Ribeiro", "livre"], ["MC", "Miguel Costa", "folga"]],
  rotas: [["A-4", "Azambuja → Madrid", "620 km · 0 €"], ["A-1", "Maia → Madrid", "560 km · 38 €"], ["A-22", "Faro → Badajoz", "279 km · 12 €"]],
  documentos: [["CMR", "J-4174 · Faro → Badajoz", "emitido"], ["FT", "Fatura 2026/118 · Frulact", "por emitir"], ["CMR", "J-4171 · Azambuja → Madrid", "emitido"], ["FT", "Fatura 2026/119 · Makro", "por emitir"], ["GT", "Guia J-4188", "por emitir"]],
  alertas: [["J-4171", "chega 40 min depois da janela", "agora"]],
};
const BIG = { transportes: ["14", "transportes hoje"], combustivel: ["−412 €", "esta semana nas paragens propostas"], camioes: ["9", "camiões · 3 na estrada"], motoristas: ["11", "motoristas · 4 livres"], rotas: ["3", "rotas ativas · 1 460 km"], documentos: ["3", "documentos por emitir"], alertas: ["1", "precisa de ti agora"] };

function content(k, lv, w, h, mapT) {
  const t = THINGS[k];
  if (k === "mapa") return "";
  if (lv === "sig") return `<div class="lv sig"><i style="background:${t.dot}"></i>${t.label} <b>${t.n}</b></div>`;
  if (k === "alertas" && lv !== "sig")
    return `<div class="lv" style="background:${C.ink};color:${C.paper}"><span class="lbl" style="color:#ff9a7a">● agora · J-4171</span>
      <div style="font-size:${lv === "stage" || lv === "total" ? 30 : 17}px;font-weight:650;letter-spacing:-.02em">Vai chegar a Madrid 40 min depois da janela</div>
      <div style="font-size:13px;color:rgba(246,242,234,.7)">Pausa de 45 min + trânsito na A-4 · chegada prevista 01:40 · janela 23:10–01:00</div>
      <div style="display:flex;gap:8px;margin-top:6px"><span class="act need">Avisar Makro</span><span class="act">Ver alternativas</span></div>
      ${lv === "stage" || lv === "total" ? `<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:14px">
        <div class="cell" style="background:rgba(246,242,234,.08)"><span class="lbl" style="color:rgba(246,242,234,.6)">futuro A · avisar</span><div class="bigN" style="font-size:52px">01:40</div><div style="font-size:13px">Makro aceita até 02:00</div></div>
        <div class="cell" style="background:rgba(246,242,234,.08)"><span class="lbl" style="color:rgba(246,242,234,.6)">futuro B · pausa em Talavera</span><div class="bigN" style="font-size:52px">00:55</div><div style="font-size:13px">dentro da janela · +12 km</div></div></div>` : ""}</div>`;
  if (lv === "corner")
    return `<div class="lv"><div class="ttl" style="font-size:16px">${t.label} <span class="n">${t.n}</span></div>${rows(DATA[k], Math.floor((h - 58) / 46))}</div>`;
  if (lv === "side")
    return `<div class="lv"><div class="ttl" style="font-size:22px">${t.label} <span class="n">${t.n}</span></div>${rows(DATA[k], Math.floor((h - 70) / 46))}</div>`;
  if ((lv === "stage" || lv === "total") && t.geo) {
    const [b, s] = BIG[k];
    return `<div class="strip"><span class="ttl" style="font-size:${lv === "total" ? 30 : 24}px">${t.label}</span><span class="bigN" style="font-size:${lv === "total" ? 30 : 24}px;color:${t.dot}">${b}</span><span style="font-size:13px;color:${C.ink3}">${s}</span></div>${overlay(k, mapT, w, h)}`;
  }
  const [b, s] = BIG[k];
  if (lv === "stage")
    return `<div class="lv" style="padding:24px 26px"><div class="ttl" style="font-size:34px">${t.label}</div>
      <div style="display:flex;align-items:baseline;gap:12px"><span class="bigN" style="font-size:64px">${b}</span><span style="color:${C.ink3}">${s}</span></div>${rows(DATA[k], Math.floor((h - 200) / 46))}</div>`;
  // total, not geographic: the thing takes the whole screen, no map
  return `<div class="lv" style="padding:26px 30px"><div class="ttl" style="font-size:40px">${t.label}<span class="x">clica outra vez para voltar</span></div>
    <div style="display:flex;align-items:baseline;gap:12px"><span class="bigN" style="font-size:72px">${b}</span><span style="color:${C.ink3}">${s}</span></div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr)">${DATA[k].concat(DATA[k]).slice(0, 6).map(([a, b2, c]) => `<div class="cell"><span class="lbl">${a}</span><b style="font-size:16px">${b2}</b><span class="num" style="font-size:13px;color:${C.ink3}">${c}</span></div>`).join("")}</div></div>`;
}

/* Things drawn ON the map when they own it (source-image coordinates → block coordinates). */
const PUMPS = [[530, 570], [560, 560], [600, 555], [650, 540], [705, 527], [745, 526], [790, 525], [830, 490], [870, 440], [900, 410], [940, 390], [985, 370], [1030, 350]];
const ROUTES = [[[620, 780], [700, 600], [705, 527]], [[560, 500], [705, 527], [900, 410], [1030, 350]], [[548, 230], [760, 300], [1030, 350]]];
const TRUCKS = [[552, 230, "78-MN-90"], [660, 545, "90-QR-45"], [1030, 350, "11-ST-78"]];
function overlay(k, T, w, h) {
  if (!T) return "";
  // points are placed on the MAP's own rectangle (which may differ from this block's mid-morph)
  const P = ([x, y]) => [(x - T.cx) * T.s + T.mw / 2 + T.dx, (y - T.cy) * T.s + T.mh / 2 + T.dy];
  if (k === "combustivel")
    return `<svg class="ov" width="${w}" height="${h}">${PUMPS.map((p, i) => { const [x, y] = P(p); const c = i < 4 ? C.bad : i < 7 ? C.warn : C.ok; return `<circle cx="${x}" cy="${y}" r="${i === 9 ? 11 : 7}" fill="${c}" stroke="#fff" stroke-width="2.5"/>`; }).join("")}
      ${(() => { const [x, y] = P(PUMPS[9]); return `<g><rect x="${x + 16}" y="${y - 18}" width="170" height="34" rx="10" fill="#f6f2ea"/><text x="${x + 28}" y="${y + 4}" font-family="Geist" font-weight="650" font-size="14">1,62 €/L · Talavera</text></g>`; })()}</svg>`;
  if (k === "rotas")
    return `<svg class="ov" width="${w}" height="${h}">${ROUTES.map((r, i) => `<polyline points="${r.map(P).map((p) => p.join(",")).join(" ")}" fill="none" stroke="${[C.focus, C.sea, C.ok][i]}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`).join("")}</svg>`;
  if (k === "camioes") {
    const pts = T.img === 1 ? [[712, 424, "11-ST-78"]] : TRUCKS;
    return `<svg class="ov" width="${w}" height="${h}">${pts.map(([x0, y0, p]) => { const [x, y] = P([x0, y0]); return `<circle cx="${x}" cy="${y}" r="13" fill="${C.ink}" stroke="#fff" stroke-width="4"/><rect x="${x + 18}" y="${y - 15}" width="96" height="30" rx="8" fill="#f6f2ea"/><text x="${x + 28}" y="${y + 5}" font-family="Geist Mono" font-weight="600" font-size="13">${p}</text>`; }).join("")}</svg>`;
  }
  return "";
}

/* ─── Interpolation between two layouts ─── */
// Choreography in three beats so blocks don't cross each other: what leaves folds away first,
// then the focus and the map take their new size, then what arrives grows into the free space.
const D = 0.95;
const delayOf = (k, st) => (k === st.focus ? 0 : k === "mapa" ? 0.05 : (RELATED[st.focus] ?? []).includes(k) ? 0.12 : 0.2);
function beat(a, b, k, nextSt) {
  if (b.level === "sig" || b.level === "hidden") return { d: 0, dur: 0.55 }; // leaving
  if (a.level === "sig" || a.level === "hidden") return { d: k === nextSt.focus ? 0.3 : 0.5, dur: 0.65 }; // arriving
  return { d: k === nextSt.focus || k === "mapa" ? 0.15 : 0.25, dur: 0.7 }; // moving
}
const radius = (lv) => (lv === "sig" ? 18 : lv === "owned" || lv === "total" ? 22 : 20);

function frame(prevSt, nextSt, since, prevL = layout(prevSt)) {
  const nextL = layout(nextSt);
  const pv = mapView(prevSt), nv = mapView(nextSt);
  const mk = ease((since - 0.15) / 0.7);
  const view = { cx: lerp(pv.cx, nv.cx, mk), cy: lerp(pv.cy, nv.cy, mk), z: lerp(pv.z, nv.z, mk), imgA: pv.img, imgB: nv.img, k: pv.img === nv.img ? 1 : mk };
  let html = "";
  const keys = ["mapa", ...ORDER];
  const mr = (() => {
    const a = prevL.mapa, b = nextL.mapa, bt = beat(a, b, "mapa", nextSt), p = ease((since - bt.d) / bt.dur);
    return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) };
  })();
  for (const k of keys) {
    const a = prevL[k], b = nextL[k];
    const bt = beat(a, b, k, nextSt);
    const p = ease((since - bt.d) / bt.dur);
    const x = lerp(a.x, b.x, p), y = lerp(a.y, b.y, p), w = lerp(a.w, b.w, p), h = lerp(a.h, b.h, p);
    const rr = lerp(radius(a.level), radius(b.level), p);
    const hiddenOp = (a.level === "hidden" ? p : 1) * (b.level === "hidden" ? 1 - p : 1);
    if (k === "mapa") {
      if (hiddenOp < 0.01) continue;
      const s0 = Math.max(w / 1440, h / 900) * view.z;
      const bg = (img) => `background-image:url(${IMGS[img]});background-size:${1440 * s0}px ${900 * s0}px;background-position:${w / 2 - view.cx * s0}px ${h / 2 - view.cy * s0}px`;
      html += `<div class="thing" data-k="mapa" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${rr}px;opacity:${hiddenOp};z-index:1;cursor:default">
        <div class="map" style="${bg(view.imgA)}"></div>${view.imgA !== view.imgB ? `<div class="map" style="${bg(view.imgB)};opacity:${view.k}"></div>` : ""}</div>`;
      continue;
    }
    const mapT = { cx: view.cx, cy: view.cy, s: Math.max(mr.w / 1440, mr.h / 900) * view.z, mw: mr.w, mh: mr.h, dx: mr.x - x, dy: mr.y - y, img: view.k > 0.5 ? view.imgB : view.imgA };
    const owns = (b.owns && p > 0.5) || (a.owns && p <= 0.5);
    const changed = a.level !== b.level || !!a.owns !== !!b.owns;
    const c1 = changed ? content(k, a.level, w, h, a.owns ? mapT : null) : "";
    const c2 = content(k, b.level, w, h, b.owns ? mapT : null);
    const op1 = changed ? 1 - clamp(p * 2.4) : 0, op2 = changed ? clamp(p * 2.4 - 1) : 1;
    const transparent = (a.owns ? 1 - p : 0) + (b.owns ? p : 0);
    const z = b.level === "sig" && p > 0.95 ? 55 : owns ? 3 : 4;
    html += `<div class="thing ${b.level === "sig" && p > 0.9 ? "pill" : ""}" data-k="${k}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${rr}px;z-index:${z};
      background:rgba(246,242,234,${1 - transparent});box-shadow:${transparent > 0.5 ? "none" : "var(--shadow)"}">
      ${op1 > 0.01 ? `<div class="cnt" style="opacity:${op1}">${c1}</div>` : ""}<div class="cnt" style="opacity:${op2}">${c2}</div></div>`;
  }
  return html;
}

function crumbOf(st) {
  if (!st.focus) return st.alert ? "Operação · algo aconteceu" : "Operação";
  return `${THINGS[st.focus].label}${st.total ? " · ecrã inteiro" : " · em foco"}`;
}

/* ─── Video script ─── */
const S = (focus, total = false, alert = false, d = 4, help = "") => ({ focus, total, alert, d, help });
const SCRIPT = [
  S(null, false, false, 3.2, "Operação · o mapa é o palco, transportes ao lado, combustível num canto"),
  S("combustivel", false, false, 4.2, "Clica em Combustível · ele toma o mapa: o mapa passa a ser o mapa do combustível"),
  S("combustivel", true, false, 4.2, "Outra vez · o combustível ocupa o ecrã todo, os outros viram sinais lá em cima"),
  S(null, false, false, 3, "Esc · tudo volta ao seu lugar"),
  S(null, false, true, 3.4, "Algo acontece · o alerta entra e empurra os transportes"),
  S("alertas", false, true, 4.4, "Clica no alerta · ocupa o centro, o mapa encolhe para o lado e vai para Madrid"),
  S("camioes", false, true, 4.2, "Camiões · tomam o mapa; motoristas e combustível descem para o lado"),
  S("motoristas", false, true, 4.2, "Motoristas · não são geográficos: ocupam o centro, o mapa vira janela"),
  S("documentos", true, true, 4.4, "Documentos · não precisam de mapa: ecrã inteiro, o mapa desaparece"),
  S("rotas", true, true, 4.2, "Rotas · o mapa volta, inteiro, e é só delas"),
  S(null, false, true, 3.6, "De volta · cada coisa encontra o seu lugar"),
];
let acc = 0;
for (const s of SCRIPT) { s.t0 = acc; acc += s.d; }
window.TOTAL = acc;
const root = () => document.getElementById("stage");

window.render = (t) => {
  const i = Math.max(0, SCRIPT.findIndex((s) => t >= s.t0 && t < s.t0 + s.d));
  const idx = t >= acc ? SCRIPT.length - 1 : i;
  const cur = SCRIPT[idx], prev = SCRIPT[Math.max(0, idx - 1)];
  root().innerHTML = frame(idx === 0 ? cur : prev, cur, idx === 0 ? 9 : t - cur.t0);
  document.getElementById("crumb").textContent = crumbOf(cur);
  document.getElementById("help").textContent = cur.help;
};

/* ─── Interactive mode (?live): click to focus, again for whole screen, Esc to go back ─── */
if (location.search.includes("live")) {
  let st = S(null), prev = st, since = 9, last = performance.now(), snap = null;
  const go = (n) => { snap = currentRects(); prev = st; st = n; since = 0; };
  const currentRects = () => {
    const L = {};
    document.querySelectorAll(".thing").forEach((el) => {
      const k = el.dataset.k, lv = layoutCache[k]?.level ?? "sig";
      L[k] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, level: lv, owns: layoutCache[k]?.owns };
    });
    return L;
  };
  let layoutCache = layout(st);
  document.getElementById("help").textContent = "Clica numa coisa para a pôr em foco · outra vez para ecrã inteiro · Esc para voltar";
  root().addEventListener("click", (e) => {
    const el = e.target.closest(".thing");
    const k = el?.dataset.k;
    if (!k || k === "mapa") return go(S(null, false, st.alert));
    if (st.focus === k) go(S(k, !st.total, st.alert));
    else go(S(k, false, st.alert || k === "alertas"));
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape") go(S(null, false, st.alert)); if (e.key === "a") go({ ...st, alert: !st.alert }); });
  const loop = (now) => {
    since += (now - last) / 1000; last = now;
    const prevL = snap ? Object.fromEntries(Object.entries(layout(prev)).map(([k, v]) => [k, { ...v, ...(snap[k] ?? {}), level: v.level, owns: v.owns }])) : layout(prev);
    root().innerHTML = frame(prev, st, since, prevL);
    layoutCache = layout(st);
    document.getElementById("crumb").textContent = crumbOf(st);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} else window.render(Number(new URLSearchParams(location.search).get("t") ?? 0));
