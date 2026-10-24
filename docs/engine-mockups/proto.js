// Living page prototype: one day in fast-forward. Everything is a pure function of video time t,
// so frames can be captured deterministically (window.render(t)). The "engine" below decides each
// module's size and order from the clock and what is happening; heights and positions are smoothed
// over time, which is what makes the page breathe instead of switching screens.
const T = 40;
const CLOCK = [[0, 350], [7, 460], [10.5, 620], [13.5, 690], [14, 706], [22, 730], [27, 990], [30, 1025], [40, 1100]];
const lerpK = (k, x) => {
  for (let i = 1; i < k.length; i++)
    if (x <= k[i][0]) return k[i - 1][1] + ((x - k[i - 1][0]) / (k[i][0] - k[i - 1][0])) * (k[i][1] - k[i - 1][1]);
  return k.at(-1)[1];
};
const clockAt = (t) => lerpK(CLOCK, t);
const tOf = (m) => lerpK(CLOCK.map(([a, b]) => [b, a]), m);
const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
/** Average of a target over the last `w` seconds: the transition between two layouts. */
const smooth = (fn, t, w = 0.8) => {
  let s = 0;
  for (let k = 0; k <= 10; k++) s += fn(Math.max(0, t - (k * w) / 10));
  return s / 11;
};

/* ─── The day ─── */
const STOPS = [
  { m: 380, city: "Faro", kind: "carga", site: "Frulact — Faro Plant", ref: "J-4174" },
  { m: 390, city: "Maia", kind: "carga", site: "Frulact · Plataforma Maia", ref: "J-4188" },
  { m: 405, city: "Azambuja", kind: "carga", site: "Makro DC Azambuja", ref: "J-4171" },
  { m: 420, city: "Porto", kind: "carga", site: "DEMO — Porto", ref: "J-DEMO-PL" },
  { m: 580, city: "Badajoz", kind: "entrega", site: "Mercadona Badajoz CD", ref: "J-4174" },
  { m: 650, city: "Lisboa", kind: "entrega", site: "DEMO — Lisboa", ref: "J-DEMO-PL" },
  { m: 750, city: "Coimbra", kind: "paragem", site: "Armazém Eiras", ref: "J-4188" },
  { m: 870, city: "Madrid", kind: "entrega", site: "Mercamadrid", ref: "J-4188" },
];
const TRUCKS = [
  { ref: "J-4174", client: "Frulact", od: "Faro → Badajoz", dep: 380, arr: 580 },
  { ref: "J-4188", client: "Frulact", od: "Maia → Madrid", dep: 395, arr: 870 },
  { ref: "J-4171", client: "Makro Portugal", od: "Azambuja → Madrid", dep: 410, arr: 1420, late: 706 },
  { ref: "J-DEMO-PL", client: "DEMO", od: "Porto → Lisboa", dep: 425, arr: 650 },
];
const TOMORROW = [
  { m: "06:00", od: "Porto → Lisboa", sub: "J-DEMO-PL2 · 24 t", to: "56-OP-23" },
  { m: "06:00", od: "Sines → Braga", sub: "J-DEMO-SB · 24 t", to: "23-AB-45" },
  { m: "06:00", od: "Bragança → Faro", sub: "J-DEMO-BF · precisa de reboque", to: null },
  { m: "07:00", od: "Matosinhos → Guimarães", sub: "J-4201 · Sonae", to: "90-QR-45" },
  { m: "10:00", od: "Setúbal → Faro", sub: "J-4199 · ALDI", to: "11-ST-78" },
];
const FREE = [
  { p: "90-QR-45", sub: "Badajoz · volta vazio 220 km" },
  { p: "11-ST-78", sub: "Madrid · volta vazio 620 km" },
  { p: "56-OP-23", sub: "Porto · livre 05:30" },
  { p: "23-AB-45", sub: "Lisboa · livre 05:00" },
];

/* ─── Engine: what each module wants at a given moment ─── */
const EVENT_IN = 14, EVENT_ACT = 18.4, EVENT_DONE = 21.2;
const TOMORROW_AT = 30;
const ROW_H = 58, HEAD = 50, GAP = 10;

const upcoming = (m) => STOPS.filter((s) => s.m >= m - 20 && s.m <= m + 120);
const onRoad = (m) => TRUCKS.filter((x) => m >= x.dep && m < x.arr);
const fuelNow = (m) => m >= 625 && m < 690;

function wants(t) {
  const m = clockAt(t);
  const up = upcoming(m).length;
  const road = onRoad(m).length;
  const ev = t >= EVENT_IN && t < EVENT_DONE + 0.8;
  const tomorrow = t >= TOMORROW_AT;
  // size: 0 = folded into the dock, n = rows shown
  return {
    event: ev ? 1 : 0,
    stops: tomorrow ? 0 : ev ? Math.min(1, up) : Math.min(up, up >= 3 ? 4 : 2),
    road: tomorrow ? Math.min(road, 1) : ev ? Math.min(road, 3) : Math.min(road, up >= 3 ? 2 : 3),
    fuel: fuelNow(m) && !ev ? 1 : 0,
    tomorrow: tomorrow ? 5 : 0,
    // order by phase of the day (no flicker between close scores)
    score: t < 7 ? { event: 9, stops: 5, road: 4, fuel: 3, tomorrow: 1 }
      : t < TOMORROW_AT ? { event: 9, road: 5, stops: 4, fuel: 3, tomorrow: 1 }
      : { event: 9, tomorrow: 6, road: 5, stops: 4, fuel: 3 },
  };
}

const ROWS = { stops: 63, road: 88, fuel: 63 };
const heightOf = (key, t) => {
  const w = wants(t);
  if (key === "event") return w.event ? (t >= EVENT_ACT ? 66 : 162) : 0;
  if (key === "tomorrow") return w.tomorrow ? 58 + 5 * 63 + 64 : 0;
  return w[key] <= 0 ? 0 : 56 + w[key] * ROWS[key];
};
const ORDER = ["event", "stops", "road", "fuel", "tomorrow"];
/** Stack position from the CURRENT (smoothed) heights in the order wanted at time `at`. */
function stackY(key, at, hs) {
  const w = wants(at);
  const ks = [...ORDER].sort((a, b) => w.score[b] - w.score[a]);
  let y = 0;
  for (const k of ks) {
    if (k === key) return y;
    y += hs[k] + GAP * clamp(hs[k] / 24);
  }
  return y;
}
const colWidth = (t) => 404 + 330 * ease((t - TOMORROW_AT) / 1.4);

/* ─── Render ─── */
const el = (h) => h;
function rowStop(s, m, t) {
  const done = m > s.m + 2;
  const age = t - tOf(s.m - 120);
  return el(`<div class="row rw" style="opacity:${clamp(age / 0.6)};transform:translateX(${(1 - ease(clamp(age / 0.6))) * -14}px)">
    <span class="t ${done ? "done" : ""}">${hm(s.m)}</span>
    <span class="c"><b>${s.city}</b><span class="tag">${s.kind}</span><small>${s.site}</small></span>
    ${done ? '<span class="ok">✓ feito</span>' : `<span class="ref">${s.ref}</span>`}
  </div>`);
}
function cardTruck(x, m, t) {
  const p = clamp((m - x.dep) / (x.arr - x.dep));
  const late = x.late && m >= x.late;
  const eta = late ? "01:40" : hm(x.arr);
  const age = t - tOf(x.dep);
  return el(`<div class="card ${late ? "bad" : ""}" style="opacity:${clamp(age / 0.6)}">
    <div class="top1"><span class="ref">${x.ref}</span>${x.client}<span class="st">Em trânsito</span></div>
    <div class="od">${x.od}<span class="eta">chega <b ${late ? 'style="color:var(--bad)"' : ""}>${eta}</b></span></div>
    <div class="bar"><i style="width:${p * 100}%"></i><s style="left:calc(${p * 100}% - 5px)"></s></div>
  </div>`);
}

function module(key, t, m, hs) {
  const h = hs[key];
  if (h < 2) return "";
  const y = smooth((x) => stackY(key, x, hs), t, 0.7);
  const w = wants(t);
  let inner = "";
  if (key === "event") {
    const acted = t >= EVENT_ACT;
    inner = acted
      ? `<div class="done-line">✓ Makro avisada às 11:49 · nova chegada 01:40</div>`
      : `<span class="eyebrow" style="color:#ff9a7a">● agora · J-4171</span>
         <p style="margin:0;font-size:15px;font-weight:600">Vai chegar a Madrid 40 min depois da janela</p>
         <small style="color:rgba(246,242,234,.65);font-size:12px">Pausa de 45 min + trânsito na A-4 · chegada prevista 01:40</small>
         <div class="acts"><span class="act need" style="${t > EVENT_ACT - 0.5 ? "transform:scale(.94);filter:brightness(1.15)" : ""}">Avisar Makro</span><span class="act">Ver alternativas</span></div>`;
    return `<div class="m ${acted ? "glass" : "event"}" style="position:absolute;left:0;right:0;top:${y}px;height:${h}px;padding:0"><div class="in" style="${acted ? "" : "color:var(--paper)"}">${inner}</div></div>`;
  }
  if (key === "stops") {
    const list = upcoming(m).slice(0, Math.max(1, w.stops || 1));
    inner = `<h3 style="font-size:${w.stops >= 3 ? 26 : 17}px">Próximas 2 horas <span class="n">${upcoming(m).length} paragens</span></h3>` + list.map((s) => rowStop(s, m, t)).join("");
  }
  if (key === "road") {
    const list = onRoad(m).sort((a, b) => (t >= EVENT_IN ? Number(!!b.late) - Number(!!a.late) : a.dep - b.dep));
    inner = `<h3 style="font-size:${w.road >= 3 ? 24 : 17}px">Na estrada <span class="n">${list.length}</span>${t >= EVENT_IN && t < 26 ? '<span class="n" style="margin-left:auto;color:var(--sea)">por risco</span>' : ""}</h3>` + list.slice(0, Math.max(1, w.road || 1)).map((x) => cardTruck(x, m, t)).join("");
  }
  if (key === "fuel") {
    inner = `<h3 style="font-size:17px">Combustível <span class="n">1</span></h3>
      <div class="row"><span class="t" style="font-size:15px">11:10</span><span class="c"><b>J-4174 · abastecer em Badajoz</b><small>Repsol Badajoz · 1,58 €/L · antes da volta vazio</small></span></div>`;
  }
  if (key === "tomorrow") {
    const tt = t - TOMORROW_AT;
    inner = `<div class="duo">
      <div style="flex:1.45;display:flex;flex-direction:column;gap:8px">
        <h3 style="font-size:24px">Amanhã <span class="n">10 por atribuir</span></h3>
        ${TOMORROW.map((r, i) => {
          const a = clamp((tt - 0.6 - i * 0.25) / 0.5);
          const s = clamp((tt - 3 - i * 0.6) / 0.4);
          return `<div class="row" style="opacity:${a};transform:translateY(${(1 - ease(a)) * 10}px)"><span class="t" style="font-size:16px">${r.m}</span><span class="c"><b>${r.od}</b><small>${r.sub}</small></span>
            <span class="ref" style="opacity:${s};color:${r.to ? "var(--sea)" : "var(--warn)"}">${r.to ? "→ " + r.to : "sem reboque"}</span></div>`;
        }).join("")}
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px;opacity:${clamp((tt - 1) / 0.6)}">
        <h3 style="font-size:17px;margin-top:10px">Recursos <span class="n">amanhã</span></h3>
        ${FREE.map((f, i) => `<div class="row" style="opacity:${clamp((tt - 1.3 - i * 0.25) / 0.5)}"><span class="c"><b>${f.p}</b><small>${f.sub}</small></span></div>`).join("")}
      </div>
    </div>
    <div style="display:flex;gap:10px;align-items:center;opacity:${clamp((tt - 6) / 0.5)}"><span class="act need" style="color:#fff;background:var(--focus);padding:9px 14px;border-radius:10px;font-weight:600">Planear amanhã · 4 de 5</span><span style="font-size:12px;color:var(--ink-3)">1 sem solução: falta reboque</span></div>`;
  }
  return `<div class="m glass" style="position:absolute;left:0;right:0;top:${y}px;height:${h}px"><div class="in">${inner}</div></div>`;
}

function dock(t, m, hs) {
  const w = wants(t);
  const pills = [];
  if (!w.tomorrow) pills.push(["Por atribuir", 10, t > 26.5 ? "warn pulse" : "warn"]);
  if (!w.stops) pills.push(["Paragens", upcoming(m).length, ""]);
  if (!w.fuel) pills.push(["Combustível", "✓", ""]);
  pills.push(["Recursos livres", t >= TOMORROW_AT ? 4 : 2, ""]);
  pills.push(["Documentos", m > 660 ? 3 : 2, ""]);
  pills.push(["Atenção", t >= EVENT_IN && t < EVENT_ACT ? 1 : 0, t >= EVENT_IN && t < EVENT_ACT ? "bad" : ""]);
  const y = ORDER.reduce((a, k) => a + hs[k] + GAP * clamp(hs[k] / 24), 0);
  return `<div class="dock glass" style="position:absolute;left:0;right:0;top:${y}px">${pills
    .map(([l, n, c]) => `<span class="pill ${c}"><i></i>${l} <b>${n}</b></span>`)
    .join("")}</div>`;
}

const CAPS = [
  [0, "Manhã · as primeiras cargas pedem espaço"],
  [7, "Manhã a meio · quem está na estrada ganha espaço"],
  [10.8, "Combustível sobe sozinho quando há uma decisão para tomar"],
  [EVENT_IN, "Um camião vai chegar tarde · o problema vem ter contigo"],
  [22, "Tarde · tudo dentro do previsto, a página acalma"],
  [TOMORROW_AT, "17:00 · amanhã ocupa o lugar de hoje, o mapa abre espaço"],
];

window.render = (t) => {
  const m = clockAt(t);
  document.getElementById("clk").textContent = hm(m);
  const W = smooth(colWidth, t, 1);
  const col = document.getElementById("col");
  col.style.width = W + "px";
  const hs = Object.fromEntries(ORDER.map((k) => [k, smooth((x) => heightOf(k, x), t)]));
  col.innerHTML = ["stops", "road", "fuel", "tomorrow", "event"].map((k) => module(k, t, m, hs)).join("") + dock(t, m, hs);
  // map: Madrid while the event lasts; the map slides right when the column grows; slow drift
  const b = clamp((t - EVENT_IN) / 0.9) * (1 - clamp((t - (EVENT_DONE + 0.6)) / 0.9));
  const shift = (W - 404) * 0.55;
  const drift = 1 + 0.015 * Math.sin(t / 6);
  document.getElementById("mapA").style.cssText = `opacity:${1 - ease(b)};transform:translateX(${shift}px) scale(${drift})`;
  document.getElementById("mapB").style.cssText = `opacity:${ease(b)};transform:scale(${1 + 0.06 * ease(b)})`;
  document.getElementById("pins").innerHTML = b > 0.05 ? `<div class="ring" style="left:728px;top:420px;opacity:${b * (0.6 + 0.4 * Math.sin(t * 6))};transform:scale(${1 + 0.3 * ((t * 1.5) % 1)})"></div>` : "";
  document.getElementById("cap").textContent = CAPS.filter(([a]) => t >= a).at(-1)[1];
};

// Live playback when opened in a browser (?play); captures call render(t) directly.
if (location.search.includes("play")) {
  const t0 = performance.now();
  const loop = (now) => {
    window.render(((now - t0) / 1000) % T);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} else window.render(0);
