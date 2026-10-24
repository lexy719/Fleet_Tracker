// FleetOS · o caminho. The screen is a pure function of the PATH the user built by clicking:
// compose(path, focus) → rectangles. Rules: focus gets most space; 1–2 open things share; 3–4 →
// focus big, linked medium, unlinked small; 5+ → focus + 2 linked on screen, the rest goes to the
// trail; the map is a thing that joins when the focus has a place; order on screen = path order
// (map just before the focus); Esc removes the last step; immersion = map alone, full screen.
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const C = { ink: "#1b1d22", ink3: "#868a93", focus: "#e0502a", sea: "#2f6f8f", ok: "#2a7a57", warn: "#c2850c", bad: "#d2401f" };

/* ─── Things, links, places ─── */
const T = {
  home: { label: "Precisa de ti", geo: false },
  "J-4171": { label: "J-4171", geo: true },
  CM: { label: "Carlos Mendes", geo: true },
  "11-ST-78": { label: "11-ST-78", geo: true },
  Talavera: { label: "Bomba Talavera", geo: true },
};
const LINK = [["J-4171", "CM"], ["J-4171", "11-ST-78"], ["J-4171", "Talavera"], ["CM", "11-ST-78"], ["11-ST-78", "Talavera"], ["home", "J-4171"], ["home", "CM"]];
const linked = (a, b) => LINK.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/* ─── The compositor ─── */
const A = { x: 16, y: 76, w: 1408, h: 808 };
const GAP = 12;
function compose(path, imm) {
  if (imm) return { blocks: { mapa: { x: 0, y: 0, w: 1440, h: 900, role: "imm" } }, trail: [], imm };
  const focus = path.at(-1);
  const others = path.slice(0, -1);
  const withMap = T[focus].geo || focus === "home";
  const total = path.length + (withMap ? 1 : 0);
  let onScreen, trail = [];
  if (total >= 5) {
    const rank = [...others].sort((a, b) => Number(linked(b, focus)) - Number(linked(a, focus)) || path.indexOf(b) - path.indexOf(a));
    const keep = rank.slice(0, withMap ? 1 : 2);
    onScreen = others.filter((x) => keep.includes(x));
    trail = others.filter((x) => !keep.includes(x));
  } else onScreen = others;
  const role = (id) => (id === focus ? "focus" : id === "mapa" ? "map" : total <= 2 || linked(id, focus) ? "linked" : "small");
  const order = [...onScreen];
  if (withMap) order.push("mapa");
  order.push(focus);
  if (focus === "home") { order.length = 0; order.push("home", "mapa"); }
  const W = { focus: 3, map: 2.4, linked: 2, small: 1 };
  const MIN = { focus: 420, map: 300, linked: 300, small: 210 };
  const ws = order.map((id) => (focus === "home" ? (id === "home" ? 0.27 : 0.73) : W[role(id)]));
  const tot = ws.reduce((a, b) => a + b, 0);
  const free = A.w - GAP * (order.length - 1);
  let px = ws.map((w) => (w / tot) * free);
  if (focus !== "home") {
    // honour minimum widths, taking the difference from the focus
    order.forEach((id, i) => { const m = MIN[role(id)]; if (px[i] < m) { const fi = order.indexOf(focus); px[fi] -= m - px[i]; px[i] = m; } });
  }
  const blocks = {};
  let x = A.x;
  order.forEach((id, i) => { blocks[id] = { x, y: A.y, w: px[i], h: A.h, role: focus === "home" ? (id === "home" ? "linked" : "map") : role(id) }; x += px[i] + GAP; });
  return { blocks, trail, focus };
}

/* ─── Map camera per focus ─── */
const ROUTE = [[548, 520], [610, 540], [705, 527], [800, 470], [900, 410], [940, 390], [1030, 350]];
function camera(focus, imm) {
  if (imm === "CM") return { cx: 1000, cy: 362, z: 3.2 };
  if (imm === "Talavera") return { cx: 940, cy: 390, z: 4.2 };
  if (focus === "home") return { cx: 760, cy: 470, z: 1 };
  if (focus === "J-4171") return { cx: 800, cy: 440, z: 1.45 };
  if (focus === "CM" || focus === "11-ST-78") return { cx: 990, cy: 370, z: 2.2 };
  if (focus === "Talavera") return { cx: 950, cy: 385, z: 2.8 };
  return { cx: 760, cy: 470, z: 1 };
}

/* ─── Scenes (content depends on focus, on where you came from, and on width) ─── */
const formOf = (w) => (w < 260 ? "mini" : w < 430 ? "compact" : "full");
function scene(id, form, ctx) {
  const { from, isFocus } = ctx;
  if (id === "home") {
    const rows = [["J-4171", "vai chegar 40 min tarde", "agora", true], ["Carlos Mendes", "tacógrafo caduca", "12 dias"], ["J-4201", "por atribuir", "amanhã 07:00"], ["90-QR-45", "depósito", "18%"]];
    if (form === "mini") return `<div class="sc"><span class="kind">Precisa de ti</span><div class="ttl" style="font-size:30px">4</div>${rows.slice(0, 3).map((r) => `<div class="sub">${r[0]}</div>`).join("")}</div>`;
    return `<div class="sc"><span class="kind">Agora</span><div class="ttl">Precisa de ti</div>${rows.map((r) => `<div class="row link ${r[3] && ctx.hot ? "hot" : ""}"><span class="k">${r[0]}</span>${r[1]}<span class="s">${r[2]}</span></div>`).join("")}</div>`;
  }
  if (id === "J-4171") {
    if (form === "mini") return `<div class="sc"><span class="kind">Transporte</span><div class="ttl" style="font-size:20px">J-4171</div><div class="sub">Azambuja → Madrid</div><div class="sub" style="color:${C.bad}">chega 01:40</div></div>`;
    return `<div class="sc"><span class="kind">Transporte · em viagem</span><div class="ttl">J-4171</div><div class="sub">Makro · Azambuja → Madrid · 24 t</div>
      <div class="hero bad"><div class="k">${from === "home" ? "porque está aqui" : "estado"}</div><div class="v">Chega 01:40 · janela até 01:00</div><div class="s">40 min tarde · pausa de 45 min + trânsito na A-4</div></div>
      <div class="bar"><i style="width:64%"></i></div>
      <div class="row link ${ctx.hot === "CM" ? "hot" : ""}"><span class="k">CM</span>Carlos Mendes<span class="s">3 h 10 hoje</span></div>
      <div class="row link"><span class="k">11-ST-78</span>camião · 29% depósito<span class="s">A-4</span></div>
      ${form === "full" ? `<div class="row link"><span class="k">Talavera</span>bomba · paragem km 410<span class="s">1,62 €/L</span></div><div class="row"><span class="k">Madrid</span>Makro Vallecas<span class="s">23:10–01:00</span></div>` : ""}
      <div class="acts"><span class="act2 need">Avisar Makro</span><span class="act2">Registar exceção</span></div>
      <div class="sub">Em viagem · motorista, camião e reboque ficam fixos até à entrega</div></div>`;
  }
  if (id === "CM") {
    if (form === "mini") return `<div class="sc"><span class="kind">Motorista</span><div class="ttl" style="font-size:20px">Carlos Mendes</div><div class="sub">3 h 10 hoje</div></div>`;
    return `<div class="sc"><span class="kind">Motorista · ${from === "J-4171" ? "em J-4171" : "a conduzir"}</span><div class="ttl">Carlos Mendes</div><div class="sub">11-ST-78 · A-4 perto de Talavera · simulado</div>
      <div class="hero warn"><div class="k">${from === "J-4171" ? "consegue entregar a tempo?" : "hoje"}</div><div class="v">${from === "J-4171" ? "Não sem pausar em Talavera" : "3 h 10 de condução"}</div><div class="s">Faltam 3 h 10 de condução hoje · Madrid pede 2 h 40 + pausa de 45 min</div></div>
      <div class="facts"><div class="fact"><b>41/56 h</b><span>semana</span></div><div class="fact"><b>12 dias</b><span>tacógrafo caduca</span></div>${form === "full" ? `<div class="fact"><b>Coslada</b><span>dorme hoje</span></div>` : ""}</div>
      <div class="row link ${ctx.hot === "imm" ? "hot" : ""}"><span class="k">Onde está</span>A-4 · km 395<span class="s">ver no mapa</span></div>
      <div class="row link ${ctx.hot === "11-ST-78" ? "hot" : ""}"><span class="k">11-ST-78</span>o camião dele<span class="s">29%</span></div>
      <div class="acts"><span class="act2">Ligar</span><span class="act2">Registar exceção</span></div></div>`;
  }
  if (id === "11-ST-78") {
    if (form === "mini") return `<div class="sc"><span class="kind">Camião</span><div class="ttl" style="font-size:20px">11-ST-78</div><div class="sub">29% depósito</div></div>`;
    return `<div class="sc"><span class="kind">Camião · ${from === "CM" ? "conduzido por Carlos Mendes" : "em J-4171"}</span><div class="ttl">11-ST-78</div><div class="sub">a conduzir · A-4 · 80 km/h · simulado</div>
      <div class="hero"><div class="k">aguenta até Madrid?</div><div class="v">Sim, com 1 paragem</div><div class="s">29% · 116 L · Talavera km 410 · chega com 36%</div></div>
      <div class="facts"><div class="fact"><b>24 t</b><span>carga · 92%</span></div><div class="fact"><b>620 km</b><span>vazio previsto</span></div>${form === "full" ? `<div class="fact"><b>3 200 km</b><span>até revisão</span></div>` : ""}</div>
      <div class="row link ${ctx.hot === "Talavera" ? "hot" : ""}"><span class="k">Talavera</span>bomba da paragem<span class="s">1,62 €/L</span></div>
      <div class="acts"><span class="act2">Ver no mapa</span></div></div>`;
  }
  if (id === "Talavera") {
    return `<div class="sc"><span class="kind">Bomba · na rota de J-4171</span><div class="ttl">Repsol · Talavera</div><div class="sub">A-4 · km 410 · aberta 24 h</div>
      <div class="hero" style="background:#16352a"><div class="k">preço</div><div class="v">1,62 €/L</div><div class="s">−0,37 €/L face a Portugal · 98 € poupados neste depósito</div></div>
      <div class="facts"><div class="fact"><b>266 L</b><span>previstos</span></div><div class="fact"><b>431 €</b><span>total</span></div><div class="fact"><b>12:20</b><span>dentro da pausa</span></div></div>
      <div class="acts"><span class="act2">Ver de perto (satélite)</span></div></div>`;
  }
  return "";
}
function mapHTML(r, cam, path, imm) {
  const s = Math.max(r.w / 1440, r.h / 900) * cam.z;
  const P = ([x, y]) => [(x - cam.cx) * s + r.w / 2, (y - cam.cy) * s + r.h / 2];
  const hasJ = path.includes("J-4171") || imm;
  const route = hasJ ? `<polyline points="${ROUTE.map(P).map((p) => p.join(",")).join(" ")}" fill="none" stroke="${C.focus}" stroke-width="${imm ? 7 : 5}" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  const [tx, ty] = P([1000, 362]);
  const truck = `<circle cx="${tx}" cy="${ty}" r="${imm === "CM" ? 16 : 11}" fill="${C.ink}" stroke="#fff" stroke-width="4"/>
    ${imm === "CM" ? `<g><rect x="${tx + 24}" y="${ty - 46}" width="250" height="92" rx="14" fill="#f6f2ea"/><text x="${tx + 40}" y="${ty - 18}" font-family="Geist" font-weight="650" font-size="20">Carlos Mendes</text><text x="${tx + 40}" y="${ty + 6}" font-family="Geist Mono" font-size="13" fill="#474b55">11-ST-78 · 80 km/h · A-4</text><text x="${tx + 40}" y="${ty + 28}" font-family="Geist" font-size="13" fill="${C.bad}">Madrid 01:40 · 40 min tarde</text></g>` : ""}`;
  const [px, py] = P([940, 390]);
  const pump = path.includes("11-ST-78") || path.includes("Talavera") || imm ? `<circle cx="${px}" cy="${py}" r="${path.at(-1) === "Talavera" ? 12 : 8}" fill="${C.ok}" stroke="#fff" stroke-width="3"/><text x="${px + 14}" y="${py + 22}" font-family="Geist" font-weight="600" font-size="13">Talavera · 1,62 €/L</text>` : "";
  const homePts = path.length === 1 && !imm ? [[552, 230], [660, 545], [555, 560], [1000, 362]].map((p) => { const [x, y] = P(p); return `<circle cx="${x}" cy="${y}" r="8" fill="${C.ink}" stroke="#fff" stroke-width="3"/>`; }).join("") : "";
  return `<div class="mapimg" style="background-size:${1440 * s}px ${900 * s}px;background-position:${r.w / 2 - cam.cx * s}px ${r.h / 2 - cam.cy * s}px"></div><svg class="ov" width="${r.w}" height="${r.h}">${route}${pump}${truck}${homePts}</svg>${imm ? `<div class="immhint"><b>Esc</b>voltar para onde estavas</div>` : ""}`;
}

/* ─── The walk: each step is a click (or Esc) that changes the path ─── */
const STEPS = [
  { t: 0, path: ["home"], cap: "Início · o mapa e o que precisa de ti" },
  { t: 3, path: ["home", "J-4171"], click: ["home", 0.25], hot: { home: true }, cap: "Carregas no atraso · o transporte entra em foco, o mapa vai para a rota, a lista recua" },
  { t: 7.5, path: ["home", "J-4171", "CM"], click: ["J-4171", 0.47], hot: { "J-4171": "CM" }, cap: "Carregas no motorista · entra em foco, com a pergunta de onde vieste: consegue entregar?" },
  { t: 12, path: ["home", "J-4171", "CM"], imm: "CM", click: ["CM", 0.58], hot: { CM: "imm" }, cap: "Carregas em 'onde está' · só o mapa, ecrã inteiro" },
  { t: 16, path: ["home", "J-4171", "CM"], esc: true, cap: "Esc · voltas exatamente para onde estavas" },
  { t: 19.5, path: ["home", "J-4171", "CM", "11-ST-78"], click: ["CM", 0.66], hot: { CM: "11-ST-78" }, cap: "Carregas no camião dele · 5 coisas: o que não está ligado vai para o rasto" },
  { t: 24, path: ["home", "J-4171", "CM", "11-ST-78", "Talavera"], click: ["11-ST-78", 0.56], hot: { "11-ST-78": "Talavera" }, cap: "Carregas na bomba · foco na bomba, camião e mapa ao lado, o resto no rasto" },
  { t: 28.5, path: ["home", "J-4171", "CM", "11-ST-78", "Talavera"], imm: "Talavera", click: ["Talavera", 0.62], cap: "'Ver de perto' · a bomba no mapa, ecrã inteiro" },
  { t: 32, path: ["home", "J-4171", "CM", "11-ST-78", "Talavera"], esc: true, cap: "Esc" },
  { t: 34.5, path: ["home", "J-4171", "CM", "11-ST-78"], esc: true, cap: "Esc · passo atrás" },
  { t: 37, path: ["home", "J-4171", "CM"], esc: true, cap: "Esc · passo atrás" },
  { t: 39.5, path: ["home", "J-4171"], esc: true, cap: "Esc · e o caminho desfaz-se pela mesma ordem" },
  { t: 42, path: ["home"], esc: true, cap: "De volta ao início" },
];
window.TOTAL = 45;
const D = 0.55;
const layouts = STEPS.map((s) => compose(s.path, s.imm));

function trailRect(i) { return { x: 160 + i * 150, y: 22, w: 140, h: 32 }; }

window.render = (t) => {
  const si = Math.max(0, STEPS.findLastIndex((s) => t >= s.t));
  const cur = STEPS[si], prev = STEPS[Math.max(0, si - 1)];
  const L1 = layouts[si], L0 = layouts[Math.max(0, si - 1)];
  const k = si === 0 ? 1 : ease((t - cur.t) / D);
  const ids = new Set([...Object.keys(L0.blocks), ...Object.keys(L1.blocks)]);
  const cam0 = camera(prev.path.at(-1), prev.imm), cam1 = camera(cur.path.at(-1), cur.imm);
  const cam = { cx: lerp(cam0.cx, cam1.cx, k), cy: lerp(cam0.cy, cam1.cy, k), z: lerp(cam0.z, cam1.z, k) };
  let html = "";
  for (const id of ids) {
    const a = L0.blocks[id], b = L1.blocks[id];
    let r0 = a, r1 = b, op = 1;
    const ti = L1.trail.indexOf(id), ti0 = L0.trail.indexOf(id);
    if (!a) { r0 = ti0 >= 0 ? trailRect(ti0) : clickRect(prev, cur); op = k; }
    if (!b) { r1 = ti >= 0 ? trailRect(ti) : { x: a.x + a.w / 2, y: a.y + a.h / 2, w: 0, h: 0 }; op = 1 - k; }
    if (cur.imm && id !== "mapa") { r1 = a; op = 1 - k; }
    if (prev.imm && !cur.imm && id !== "mapa" && b) { r0 = b; op = k; }
    const r = { x: lerp(r0.x, r1.x, k), y: lerp(r0.y, r1.y, k), w: lerp(r0.w, r1.w, k), h: lerp(r0.h, r1.h, k) };
    if (op < 0.01 || r.w < 2) continue;
    const role = (b ?? a).role;
    const rad = role === "imm" ? lerp(20, 0, k) : prev.imm && id === "mapa" ? lerp(0, 20, k) : 20;
    let inner;
    if (id === "mapa") inner = mapHTML(r, cam, cur.path, cur.imm ?? (k < 0.5 ? prev.imm : null));
    else {
      const f = formOf(b ? b.w : a.w);
      const from = cur.path[cur.path.indexOf(id) - 1];
      inner = scene(id, f, { from, hot: (STEPS[si + 1]?.hot ?? {})[id] && t > (STEPS[si + 1]?.t ?? 99) - 0.9 ? STEPS[si + 1].hot[id] : null, isFocus: cur.path.at(-1) === id });
      const fPrev = formOf(a ? a.w : b.w);
      if (a && b && fPrev !== f && k < 1) {
        const fromP = prev.path[prev.path.indexOf(id) - 1];
        inner = `<div class="c" style="opacity:${1 - clamp(k * 2.4)}">${scene(id, fPrev, { from: fromP })}</div><div class="c" style="opacity:${clamp(k * 2.4 - 1)}">${inner}</div>`;
      }
    }
    const isFocus = cur.path.at(-1) === id && !cur.imm && cur.path.length > 1;
    html += `<div class="blk ${isFocus ? "focus" : ""}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;opacity:${op};border-radius:${rad}px;z-index:${id === "mapa" && cur.imm ? 20 : 2}">${inner.startsWith('<div class="c"') ? inner : `<div class="c">${inner}</div>`}</div>`;
  }
  document.getElementById("stage").innerHTML = html;
  // trail in the top bar
  document.getElementById("trail").innerHTML = L1.trail.length && !cur.imm ? `<span class="lbl">rasto</span>${L1.trail.map((id) => `<span class="tsig"><i></i>${T[id].label}</span>`).join("")}` : "";
  document.getElementById("top").style.opacity = cur.imm ? 1 - k : prev.imm ? k : 1;
  document.getElementById("cap").textContent = cur.cap;
  // cursor + key hint
  drawCursor(t, si);
};
function clickRect(prev, cur) {
  if (!cur.click) return { x: 700, y: 450, w: 40, h: 40 };
  const L = layouts[STEPS.indexOf(prev)];
  const b = L.blocks[cur.click[0]];
  return b ? { x: b.x + 30, y: b.y + b.h * cur.click[1] - 20, w: Math.min(260, b.w - 60), h: 40 } : { x: 700, y: 450, w: 40, h: 40 };
}
let cursorEl, keyEl;
function drawCursor(t, si) {
  if (!cursorEl) {
    cursorEl = document.createElement("div"); cursorEl.className = "cursor";
    cursorEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.5 L10 13 L16 13 Z" fill="#1b1d22" stroke="#fff" stroke-width="1.5"/></svg>`;
    document.body.appendChild(cursorEl);
    keyEl = document.createElement("div"); keyEl.className = "keyhint"; keyEl.textContent = "Esc"; document.body.appendChild(keyEl);
  }
  // where the cursor rests and where it goes next
  const target = (i) => {
    const s = STEPS[i];
    if (!s?.click) return null;
    const L = layouts[i - 1]; const b = L.blocks[s.click[0]];
    return b ? [b.x + Math.min(150, b.w * 0.4), b.y + b.h * s.click[1]] : null;
  };
  let pos = [1180, 760];
  for (let i = 1; i < STEPS.length; i++) {
    const tg = target(i);
    if (!tg) continue;
    if (t >= STEPS[i].t) pos = tg;
    else if (t > STEPS[i].t - 1.1) { const kk = ease((t - (STEPS[i].t - 1.1)) / 0.9); pos = [lerp(pos[0], tg[0], kk), lerp(pos[1], tg[1], kk)]; break; }
    else break;
  }
  cursorEl.style.left = pos[0] + "px"; cursorEl.style.top = pos[1] + "px";
  document.querySelectorAll(".ripple").forEach((x) => x.remove());
  const s = STEPS[si];
  const age = t - s.t;
  if (s.click && age < 0.6) {
    const d = 12 + age * 90; const r = document.createElement("div"); r.className = "ripple";
    r.style.cssText = `left:${pos[0] - d / 2}px;top:${pos[1] - d / 2}px;width:${d}px;height:${d}px;opacity:${1 - age / 0.6}`; document.body.appendChild(r);
  }
  keyEl.style.opacity = s.esc && age < 0.9 ? 1 - age / 0.9 : 0;
}
window.render(Number(new URLSearchParams(location.search).get("t") ?? 0));
