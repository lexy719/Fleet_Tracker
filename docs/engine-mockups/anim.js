// Ten animatics of the same office moment — something needs you, you open the transport, then the
// driver, then the truck, then you go back — each with a different idea of space and movement.
// Blocks are deliberately neutral: judge the behaviour, not the components.
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

const LABEL = { map: "Mapa", need: "Precisa de ti", job: "Transporte J-4171", drv: "Motorista", truck: "Camião", pump: "Bomba", docs: "Documentos", client: "Cliente Makro" };
const DARK = { need: true };
const IDS = Object.keys(LABEL);
const CAPS = ["Algo precisa de ti", "Abres o transporte", "Abres o motorista", "Abres o camião", "Voltas"];
const CLICKS = [null, "job", "drv", "truck", null];
// r(x, y, w, h, opacity, blur, rotation)
const r = (x, y, w, h, o = 1, b = 0, rot = 0) => ({ x, y, w, h, o, b, rot });

/* ─── the ten ideas ─── */
const ring = (cx, cy, rad, ids, w = 190, h = 120, start = -90) =>
  Object.fromEntries(ids.map((id, i) => { const a = ((start + (360 / ids.length) * i) * Math.PI) / 180; return [id, r(cx + rad * Math.cos(a) - w / 2, cy + rad * Math.sin(a) - h / 2, w, h, 0.9)]; }));
const CONCEPTS = [
  {
    name: "Lanterna",
    phrase: "Uma coisa de cada vez no centro; tudo o resto encolhe para as margens e espera.",
    frames: [
      { map: r(400, 120, 1000, 740), need: r(40, 120, 340, 740) },
      { job: r(330, 130, 780, 720), map: r(1150, 130, 250, 300, 0.75), need: r(40, 130, 250, 300, 0.75) },
      { drv: r(330, 130, 780, 720), job: r(40, 130, 250, 260, 0.7), map: r(1150, 130, 250, 260, 0.7), need: r(40, 410, 250, 160, 0.45) },
      { truck: r(330, 130, 780, 720), drv: r(40, 130, 250, 260, 0.7), job: r(40, 410, 250, 200, 0.5), map: r(1150, 130, 250, 260, 0.7) },
      { map: r(400, 120, 1000, 740), need: r(40, 120, 340, 740) },
    ],
  },
  {
    name: "Mesa infinita",
    phrase: "Tudo está espalhado numa mesa enorme; o ecrã é uma câmara que voa até ao que escolhes.",
    world: true,
    layout: { map: r(0, 0, 1400, 860), need: r(-560, 0, 500, 860), job: r(1500, 0, 820, 560), docs: r(1500, 620, 820, 240), drv: r(2400, 0, 560, 560), truck: r(2400, 620, 560, 560), pump: r(3020, 620, 420, 560), client: r(3020, 0, 420, 560) },
    cams: [[-600, -20, 2060], [1460, -20, 920], [2000, -20, 1320], [2360, 300, 1120], [-650, -60, 4200]],
  },
  {
    name: "Órbita",
    phrase: "O que escolhes vai para o centro; o que lhe está ligado orbita à volta, mais perto ou mais longe.",
    frames: [
      { map: r(470, 180, 500, 500), ...ring(720, 430, 360, ["need", "job", "truck", "docs"], 200, 120, -60) },
      { job: r(520, 230, 400, 400), ...ring(720, 430, 330, ["drv", "truck", "pump", "client", "docs", "map"], 180, 110) },
      { drv: r(520, 230, 400, 400), ...ring(720, 430, 300, ["job", "truck", "map"], 200, 120, -30) },
      { truck: r(520, 230, 400, 400), ...ring(720, 430, 300, ["drv", "pump", "map", "job"], 200, 120, 0) },
      { map: r(470, 180, 500, 500), ...ring(720, 430, 360, ["need", "job", "truck", "docs"], 200, 120, -60) },
    ],
  },
  {
    name: "Mosaico",
    phrase: "Cada clique divide o ecrã ao meio; o espaço reparte-se como azulejos.",
    frames: [
      { map: r(40, 120, 1360, 740) },
      { map: r(40, 120, 670, 740), job: r(730, 120, 670, 740) },
      { map: r(40, 120, 670, 740), job: r(730, 120, 670, 360), drv: r(730, 500, 670, 360) },
      { map: r(40, 120, 670, 360), job: r(40, 500, 670, 360), drv: r(730, 120, 670, 360), truck: r(730, 500, 670, 360) },
      { map: r(40, 120, 1360, 740) },
    ],
  },
  {
    name: "Cinema",
    phrase: "Cada clique é um novo plano em ecrã inteiro; os planos anteriores ficam numa fita em baixo.",
    frames: [
      { map: r(0, 0, 1440, 900) },
      { job: r(0, 0, 1440, 900), map: r(40, 780, 150, 90) },
      { drv: r(0, 0, 1440, 900), map: r(40, 780, 150, 90), job: r(200, 780, 150, 90) },
      { truck: r(0, 0, 1440, 900), map: r(40, 780, 150, 90), job: r(200, 780, 150, 90), drv: r(360, 780, 150, 90) },
      { map: r(0, 0, 1440, 900) },
    ],
    stripTop: true,
  },
  {
    name: "Rio do dia",
    phrase: "O dia corre em baixo como um rio; o que escolhes sobe do rio e ganha espaço; o resto continua a correr.",
    frames: [
      { map: r(40, 120, 1360, 470), need: r(40, 620, 220, 220), job: r(280, 640, 200, 180), drv: r(500, 650, 180, 160), truck: r(700, 640, 200, 180), pump: r(920, 660, 160, 140), docs: r(1100, 650, 180, 160), client: r(1300, 650, 100, 160, 0.7) },
      { job: r(40, 120, 880, 470), map: r(940, 120, 460, 470), need: r(40, 640, 200, 180), drv: r(400, 650, 180, 160), truck: r(620, 640, 200, 180), pump: r(840, 660, 160, 140), docs: r(1020, 650, 180, 160), client: r(1220, 650, 180, 160) },
      { job: r(40, 120, 560, 470), drv: r(620, 120, 560, 470), map: r(1200, 120, 200, 470), need: r(40, 650, 180, 160), truck: r(440, 640, 200, 180), pump: r(660, 660, 160, 140), docs: r(840, 650, 180, 160), client: r(1040, 650, 180, 160) },
      { drv: r(40, 120, 560, 470), truck: r(620, 120, 560, 470), map: r(1200, 120, 200, 470), job: r(240, 640, 200, 180), need: r(40, 650, 180, 160), pump: r(660, 660, 160, 140), docs: r(840, 650, 180, 160), client: r(1040, 650, 180, 160) },
      { map: r(40, 120, 1360, 470), need: r(40, 620, 220, 220), job: r(280, 640, 200, 180), drv: r(500, 650, 180, 160), truck: r(700, 640, 200, 180), pump: r(920, 660, 160, 140), docs: r(1100, 650, 180, 160), client: r(1300, 650, 100, 160, 0.7) },
    ],
  },
  {
    name: "Zoom infinito",
    phrase: "Tudo está dentro de tudo: entras no transporte, dentro dele está o motorista, dentro dele o camião.",
    world: true,
    layout: { map: r(0, 0, 1440, 860), need: r(60, 60, 220, 300), job: r(880, 330, 220, 140), drv: r(895, 395, 90, 60), truck: r(995, 395, 90, 60), pump: r(1000, 455, 60, 8) },
    cams: [[0, -20, 1440], [860, 310, 260], [884, 386, 112], [984, 386, 112], [0, -20, 1440]],
  },
  {
    name: "Profundidade",
    phrase: "As coisas empilham-se em profundidade: a mais recente à frente, nítida; as anteriores recuam, desfocadas.",
    frames: [
      { map: r(280, 150, 880, 680) },
      { job: r(330, 180, 840, 660), map: r(250, 120, 760, 580, 0.55, 3) },
      { drv: r(380, 210, 800, 640), job: r(300, 150, 720, 560, 0.55, 3), map: r(230, 100, 640, 480, 0.3, 6) },
      { truck: r(430, 240, 760, 620), drv: r(350, 180, 680, 540, 0.55, 3), job: r(280, 130, 600, 460, 0.3, 6), map: r(220, 90, 520, 400, 0.15, 9) },
      { map: r(280, 150, 880, 680) },
    ],
  },
  {
    name: "Grafo vivo",
    phrase: "As coisas são nós ligados; ao escolher uma, os vizinhos aproximam-se e o resto afasta-se.",
    links: [["map", "job"], ["need", "job"], ["job", "drv"], ["job", "truck"], ["drv", "truck"], ["truck", "pump"], ["job", "docs"], ["job", "client"]],
    frames: [
      { map: r(520, 260, 400, 280), need: r(160, 180, 200, 110), job: r(1000, 200, 200, 110), drv: r(1120, 520, 180, 100), truck: r(860, 640, 180, 100), pump: r(560, 700, 160, 90), docs: r(240, 560, 180, 100), client: r(1180, 360, 160, 90, 0.7) },
      { job: r(520, 300, 400, 260), map: r(180, 140, 240, 160), need: r(120, 620, 200, 110, 0.6), drv: r(1020, 160, 200, 110), truck: r(1060, 600, 200, 110), docs: r(560, 680, 200, 100), client: r(560, 130, 180, 100), pump: r(1280, 760, 120, 70, 0.4) },
      { drv: r(520, 300, 400, 260), job: r(160, 220, 240, 150), truck: r(1060, 380, 220, 130), map: r(120, 620, 200, 110, 0.5), docs: r(40, 760, 140, 80, 0.3), client: r(1260, 120, 140, 80, 0.3), need: r(40, 120, 120, 70, 0.25), pump: r(1220, 700, 160, 90, 0.6) },
      { truck: r(520, 300, 400, 260), drv: r(160, 200, 240, 150), pump: r(1060, 520, 220, 130), map: r(1040, 160, 240, 150), job: r(140, 620, 200, 110, 0.5), docs: r(40, 780, 120, 70, 0.25), client: r(1280, 780, 120, 70, 0.25), need: r(40, 120, 120, 70, 0.2) },
      { map: r(520, 260, 400, 280), need: r(160, 180, 200, 110), job: r(1000, 200, 200, 110), drv: r(1120, 520, 180, 100), truck: r(860, 640, 180, 100), pump: r(560, 700, 160, 90), docs: r(240, 560, 180, 100), client: r(1180, 360, 160, 90, 0.7) },
    ],
  },
  {
    name: "Conversa",
    phrase: "O ecrã é uma conversa: cada clique é uma pergunta, e a resposta compõe-se por baixo; o que ficou para trás sobe e encolhe.",
    frames: [
      { need: r(40, 130, 520, 720), map: r(580, 130, 820, 720) },
      { need: r(40, 120, 1360, 60, 0.6), job: r(40, 200, 900, 650), map: r(960, 200, 440, 650) },
      { job: r(40, 120, 1360, 60, 0.6), drv: r(40, 200, 700, 650), truck: r(760, 200, 300, 310, 0.8), map: r(760, 530, 640, 320) },
      { drv: r(40, 120, 1360, 60, 0.6), truck: r(40, 200, 900, 650), pump: r(960, 200, 440, 310), map: r(960, 530, 440, 320) },
      { need: r(40, 130, 520, 720), map: r(580, 130, 820, 720) },
    ],
  },
];

/* ─── timeline ─── */
const INTRO = 2.4, HOLD0 = 1.4, MOVE = 1.1, HOLD = 1.3;
const LEN = INTRO + HOLD0 + 4 * (MOVE + HOLD);
window.TOTAL = CONCEPTS.length * LEN;

function camRect(c, k0, k1, k) {
  const a = c.cams[k0], b = c.cams[k1];
  const vx = lerp(a[0], b[0], k), vy = lerp(a[1], b[1], k), vw = lerp(a[2], b[2], k);
  const s = 1440 / vw;
  return { s, tx: -vx * s, ty: -vy * s + 60 };
}
function frameEls(c, i) {
  if (c.world) return c.layout;
  return c.frames[i];
}
function elRect(c, i, id) {
  const f = frameEls(c, i);
  return f[id] ?? null;
}
function interp(c, i0, i1, k, id) {
  let a = elRect(c, i0, id), b = elRect(c, i1, id);
  if (!a && !b) return null;
  if (!a) a = { ...b, o: 0 };
  if (!b) b = { ...a, o: 0 };
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k), o: lerp(a.o, b.o, k), b: lerp(a.b, b.b, k), rot: lerp(a.rot, b.rot, k) };
}
function elHTML(id, R, focus) {
  const lines = Math.max(0, Math.min(6, Math.floor((R.h - 50) / 26)));
  const ln = id === "map" ? "" : Array.from({ length: lines }, (_, i) => `<div class="ln" style="top:${50 + i * 26}px;right:${16 + ((i * 37) % 90)}px"></div>`).join("");
  const big = R.w > 500 && R.h > 300;
  return `<div class="el ${id === "map" ? "map" : ""} ${DARK[id] ? "dark" : ""}" style="left:${R.x}px;top:${R.y}px;width:${R.w}px;height:${R.h}px;opacity:${R.o};filter:${R.b > 0.1 ? `blur(${R.b}px)` : "none"};transform:rotate(${R.rot}deg);z-index:${R.w < 200 && R.y > 700 ? 8 : focus ? 5 : Math.round(R.o * 4)};${focus && id !== "map" ? "box-shadow:0 0 0 2px #1b1d22, 0 24px 50px -24px rgba(40,32,18,.45)" : ""}">
    <div class="lb" style="font-size:${big ? 22 : R.w < 170 ? 12 : 15}px">${LABEL[id]}</div>${ln}</div>`;
}

let cursorEl;
window.render = (t) => {
  const ci = Math.min(CONCEPTS.length - 1, Math.floor(t / LEN));
  const c = CONCEPTS[ci];
  const lt = t - ci * LEN;
  // intro card
  const intro = document.getElementById("intro");
  if (lt < INTRO) {
    const op = clamp(lt / 0.3) * clamp((INTRO - lt) / 0.35);
    intro.innerHTML = `<div class="card0" style="opacity:${op}"><span class="n">${String(ci + 1).padStart(2, "0")} / ${CONCEPTS.length}</span><h1>${c.name}</h1><p>${c.phrase}</p></div>`;
  } else intro.innerHTML = lt < INTRO + 0.4 ? `<div class="card0" style="opacity:0"></div>` : "";
  // which step
  let st = lt - INTRO - HOLD0, i0 = 0, i1 = 0, k = 1;
  if (st >= 0) {
    const n = Math.min(3, Math.floor(st / (MOVE + HOLD)));
    const inner = st - n * (MOVE + HOLD);
    i0 = n; i1 = n + 1; k = ease(inner / MOVE);
    if (inner >= MOVE + HOLD) { i0 = 4; i1 = 4; k = 1; }
  }
  const world = document.getElementById("world");
  let html = "";
  const focusId = (i) => (i === 0 || i === 4 ? (c.world ? null : "map") : CLICKS[i]);
  const fId = k > 0.5 ? focusId(i1) : focusId(i0);
  let cam = { s: 1, tx: 0, ty: 0 };
  if (c.world) { cam = camRect(c, i0, i1, k); world.style.transform = `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`; } else world.style.transform = "none";
  const rects = {};
  for (const id of IDS) {
    const R = interp(c, i0, i1, k, id);
    if (!R || R.o < 0.01) continue;
    rects[id] = R;
    html += elHTML(id, R, id === fId && i1 > 0 && i1 < 4);
  }
  if (c.links) {
    const L = c.links.filter(([a, b]) => rects[a] && rects[b]).map(([a, b]) => {
      const A = rects[a], B = rects[b];
      return `<line x1="${A.x + A.w / 2}" y1="${A.y + A.h / 2}" x2="${B.x + B.w / 2}" y2="${B.y + B.h / 2}" stroke="#1b1d22" stroke-opacity="${0.25 * Math.min(A.o, B.o)}" stroke-width="2"/>`;
    }).join("");
    html = `<svg class="links" width="1440" height="900">${L}</svg>` + html;
  }
  world.innerHTML = html;
  document.getElementById("title").innerHTML = lt >= INTRO ? `<span class="n">${String(ci + 1).padStart(2, "0")} · ${c.name.toUpperCase()}</span>` : "";
  document.getElementById("cap").textContent = lt >= INTRO ? CAPS[st < 0 ? 0 : i1 === i0 ? i1 : k < 0.5 ? i0 : i1] : "";
  document.getElementById("cap").style.opacity = lt >= INTRO ? 1 : 0;
  // cursor: travels to the thing about to be clicked
  if (!cursorEl) {
    cursorEl = document.createElement("div"); cursorEl.className = "cursor";
    cursorEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.5 L10 13 L16 13 Z" fill="#1b1d22" stroke="#fff" stroke-width="1.5"/></svg>`;
    document.body.appendChild(cursorEl);
  }
  document.querySelectorAll(".ripple").forEach((x) => x.remove());
  const n = st < 0 ? 0 : Math.min(3, Math.floor(st / (MOVE + HOLD)));
  const inner = st < 0 ? st : st - n * (MOVE + HOLD);
  const nextIdx = st < 0 ? 1 : inner < MOVE ? n + 1 : n + 2;
  const target = CLICKS[nextIdx] ?? null;
  const screen = (R) => [R.x * cam.s + cam.tx + Math.min(R.w * cam.s * 0.4, 120), R.y * cam.s + cam.ty + Math.min(R.h * cam.s * 0.4, 60)];
  let pos = [1300, 820];
  const curRects = rects;
  if (target && curRects[target] && lt >= INTRO) {
    const timeToClick = st < 0 ? -st : (MOVE + HOLD) - inner;
    const kk = ease(1 - clamp((timeToClick - 0.15) / 1.0));
    const [tx, ty] = screen(curRects[target]);
    pos = [lerp(1300, tx, kk), lerp(820, ty, kk)];
  }
  if (lt >= INTRO && st >= 0 && inner < 0.5 && CLICKS[n + 1]) {
    const R = elRect(c, n, CLICKS[n + 1]) ?? elRect(c, n + 1, CLICKS[n + 1]);
    if (R) {
      const c0 = c.world ? camRect(c, n, n, 0) : { s: 1, tx: 0, ty: 0 };
      const p = [R.x * c0.s + c0.tx + Math.min(R.w * c0.s * 0.4, 120), R.y * c0.s + c0.ty + Math.min(R.h * c0.s * 0.4, 60)];
      pos = p;
      const d = 12 + inner * 110;
      const rp = document.createElement("div"); rp.className = "ripple";
      rp.style.cssText = `left:${p[0] - d / 2}px;top:${p[1] - d / 2}px;width:${d}px;height:${d}px;opacity:${1 - inner / 0.5}`;
      document.body.appendChild(rp);
    }
  }
  cursorEl.style.left = pos[0] + "px"; cursorEl.style.top = pos[1] + "px";
  cursorEl.style.opacity = lt >= INTRO ? 1 : 0;
};
window.render(Number(new URLSearchParams(location.search).get("t") ?? 0));
