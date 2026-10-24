import { W, H, map, mapWithP, R, atKm, slice, svg, T, L, RECT, hourAxis, hx, JOBS, DRIVERS, CITIES, PT_BBOX, proj, pathD, truck, strip, NOW, dayBar } from "./kit.mjs";

const stC = { ok: "#3b7150", risk: "#9c6410", act: "#bb4119", blk: "#8c1c1c", unk: "#6b706d" };
const microJourney = (j, w) => { const [id, , , , st, pos, km] = j; const x = (k) => 4 + (k / km) * (w - 8);
  let s = L(4, 10, w - 4, 10, "#c9c5b8", 2); if (pos) s += L(4, 10, x(pos), 10, "#1f4d45", 3);
  s += `<circle cx="4" cy="10" r="3" fill="#141f1b"/><rect x="${w - 8}" y="6" width="8" height="8" fill="#141f1b"/>`;
  if (id === "J-4217") s += `<rect x="${x(320) - 3}" y="6" width="6" height="8" fill="#f5ead4" stroke="#9c6410"/><rect x="${x(441) - 4}" y="6" width="8" height="8" fill="#fff" stroke="#141f1b" stroke-width="1.5"/><path d="M${x(540)} 1 l5 8 h-10z" fill="#f2dcda" stroke="#8c1c1c"/>`;
  if (id === "J-4222") s += `<rect x="${x(110)}" y="4" width="${x(150) - x(110)}" height="12" fill="url(#h)" stroke="#bb4119"/>`;
  if (id === "J-4218") s += `<path d="M${x(300)} 1 l5 8 h-10z" fill="#f2dcda" stroke="#8c1c1c"/>`;
  if (pos) s += `<circle cx="${x(pos)}" cy="10" r="5" fill="#fff" stroke="#1f4d45" stroke-width="2"/>`;
  return svg(w, 20, `<defs><pattern id="h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="5" fill="#bb4119" opacity=".5"/></pattern></defs>` + s); };

export default [
{ id: "O-01", fam: "Operation", name: "Operation ledger with micro-journeys", intent: "What is every transport doing right now, scannable in one pass?",
  verdict: "MAYBE", strength: "Each row carries a true micro-journey (position, stops, pause, restriction) instead of a status word. Very dense and still calm, and it scans like a timetable.", weakness: "Without geography you can't see regional clustering. Row height limits how many signals fit.", reason: "The micro-journey row is excellent, but as a full composition it is subsumed by O-09, which adds geography at no cost. Keep the row and drop this page.",
  html: () => strip(`<b class="disp" style="font-size:15px">Operação</b><span class="mut">8 transportes · 6 em curso · 2 por planear</span>`) + `
  <div class="abs" style="left:40px;top:74px;right:40px"><table class="g" style="font-size:13px"><tr><th style="width:90px">Transporte</th><th>Percurso</th><th style="width:520px">Viagem · agora ${NOW}</th><th>Motorista</th><th>Horas</th><th>Próximo facto</th></tr>
  ${JOBS.map((j, i) => `<tr style="height:76px;${i === 0 ? "background:#fffdf8" : ""}"><td><span class="code">${j[0]}</span></td><td><b>${j[1]}</b><div class="mut" style="font-size:11.5px">${j[2]}</div></td>
  <td>${microJourney(j, 500)}<div class="mono fnt" style="font-size:10.5px;display:flex;justify-content:space-between;width:500px"><span>0</span><span>${j[5] ? j[5] + " km" : "não iniciado"}</span><span>${j[6]} km</span></div></td>
  <td>${j[8] === "—" ? '<span class="unk">— sem motorista</span>' : DRIVERS.find(d => d[0] === j[8])[1]}</td>
  <td>${j[8] === "—" ? "" : svg(90, 10, RECT(0, 2, 90, 6, "#ece9df", "none") + RECT(0, 2, [82, 20, 0, 60, 70, 5, 50, 0][i], 6, [ "#9c6410", "#3b7150", "", "#3b7150", "#3b7150", "#3b7150", "#3b7150"][i] || "#3b7150", "none"))}</td>
  <td style="white-space:normal;font-size:12px" class="${j[4]}">${["Pausa obrigatória até 10:50 · Santarém", "Sai 11:30 · VCI Porto 17–20h", "A1 Leiria · ETA 13:10", "Retoma 10:40", "Cais 4 · fecho de carga 10:30", "IP3 obras · desvio N2 decidido", "Atribuir motorista e viatura", "Atribuir · carga refrigerada"][i]}</td></tr>`).join("")}
  </table></div>` },

{ id: "O-02", fam: "Operation", name: "Country as the operation (fullscreen map, attached labels)", intent: "Where is everything, and what is attached to each moving object?",
  verdict: "REJECT", strength: "Labels attached directly to objects, no side panel. The country reads as the workspace, and the real road network gives it physical credibility.", weakness: "Portugal is tall and narrow, so a landscape screen wastes about 55% of its width on sea and Spain. The labels collide in the Porto/Coimbra cluster.", reason: "Map as landscape wallpaper: about 55% of the screen is sea and Spain, and the labels collide where the operation is densest. The attached-label idea survives elsewhere (O-09, R-07).",
  html: () => { const routes = JOBS.map(j => ({ id: j[7], c: j[4] === "unk" ? "#8a928d" : "#1f4d45", w: j[4] === "unk" ? 2 : 3, dash: j[4] === "unk" ? "5 5" : null, o: .9 }));
    const marks = JOBS.filter(j => j[5]).map(j => ({ route: j[7], km: j[5], kind: "truck", c: stC[j[4]] }));
    const labels = JOBS.filter(j => j[5]).map((j, i) => ({ route: j[7], km: j[5], t: `${j[0]} · ${DRIVERS.find(d => d[0] === j[8])[1]}`, sub: ["pausa até 10:50", "", "ETA 13:10", "retoma 10:40", "", "desvio N2"][i], dx: [60, 0, -230, 60, 0, 60][i] || 60, dy: [10, 0, -30, 30, 0, -10][i] || -10, bold: true }));
    return `<div class="abs" style="inset:0">${map({ w: W, h: H, pad: 40, routes, marks, labels, tone: "paper" })}</div>
    <div class="abs" style="left:40px;top:34px"><div class="h2">6 em curso · 2 por planear</div><div class="mut">ter 6 out · ${NOW}</div></div>
    <div class="abs mut" style="left:40px;bottom:40px;font-size:12px;line-height:1.8">━ planeado &nbsp; ┅ por planear &nbsp; ◉ posição simulada</div>`; } },

{ id: "O-03", fam: "Operation", name: "Day board (temporal, all transports)", intent: "When will each transport do what today, and where do restrictions fall in time?",
  verdict: "KEEP", strength: "Time is native here. Restriction validity windows show as hatched time bands crossing the rows they affect, and windows, pauses and now line up on one clock.", weakness: "Spatial context is gone entirely. Long transports compress badly when the day is wide.", reason: "The temporal spine for the whole operation. Restriction-as-time-band is a genuinely strong FleetOS idea.",
  html: () => { const x0 = 300, x1 = 1540; const rows = [
    [["06:41", "10:32", "c"], ["10:32", "11:17", "p"], ["11:17", "12:57", "c"], ["12:57", "13:27", "u"], ["13:27", "15:12", "c"], ["15:12", "15:50", "u"]],
    [["11:30", "13:45", "c"], ["13:45", "14:30", "p"], ["14:30", "15:20", "c"], ["15:20", "16:10", "u"]],
    [["07:20", "11:40", "c"], ["11:40", "12:25", "p"], ["12:25", "13:10", "c"], ["13:10", "13:50", "u"]],
    [["06:00", "09:55", "c"], ["09:55", "10:40", "p"], ["10:40", "13:00", "c"], ["13:00", "13:40", "u"]],
    [["09:30", "10:30", "u"], ["10:30", "14:30", "c"], ["14:30", "15:15", "p"], ["15:15", "16:10", "c"], ["16:10", "16:50", "u"]],
    [["07:00", "11:20", "c"], ["11:20", "12:05", "p"], ["12:05", "15:30", "c"], ["15:30", "16:10", "u"]],
    [], []];
    const col = { c: "#1f4d45", p: "#f5ead4", u: "#9aa8a2" };
    let s = hourAxis(x0, x1, 40, 6, 20) ; const rh = 92;
    // restriction bands
    s += `<defs><pattern id="hh" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="6" fill="#8c1c1c" opacity=".28"/></pattern></defs>`;
    s += RECT(hx("17:00", x0, x1, 6, 20), 52, hx("20:00", x0, x1, 6, 20) - hx("17:00", x0, x1, 6, 20), rh * 2, "url(#hh)", "#8c1c1c", 'stroke-dasharray="3 3"') + T(hx("17:00", x0, x1, 6, 20) + 6, 70, "VCI Porto · pesados 17–20h", { s: 11, c: "#8c1c1c", w: 600 });
    s += RECT(x0, 52 + rh * 5, hx("07:00", x0, x1, 6, 20) - x0, rh, "url(#hh)", "#bb4119", 'stroke-dasharray="3 3"') + RECT(hx("21:00", x0, x1, 6, 20), 0, 0, 0);
    JOBS.forEach((j, i) => { const y = 52 + i * rh; s += L(0, y + rh, x1, y + rh); s += T(0, y + 34, j[0], { m: 1, s: 11.5, c: "#5b6761" }) + T(70, y + 34, j[1], { w: 600, s: 14 }) + T(70, y + 54, j[8] === "—" ? "sem motorista" : DRIVERS.find(d => d[0] === j[8])[1], { s: 12, c: "#5b6761" });
      for (const [a, b, k] of rows[i]) { const xa = hx(a, x0, x1, 6, 20), xb = hx(b, x0, x1, 6, 20); s += RECT(xa, y + 30, xb - xa - 1, 24, col[k], k === "p" ? "#9c6410" : "none", a >= NOW ? 'fill-opacity=".6"' : ""); }
      if (!rows[i].length) s += RECT(x0, y + 30, x1 - x0, 24, "none", "#c9c5b8", 'stroke-dasharray="4 4"') + T(x0 + 12, y + 46, "janela de carga 08:00–18:00 · por planear", { s: 11.5, c: "#6b706d" }); });
    // windows
    const win = (i, a, b, l) => { const y = 52 + i * rh; return RECT(hx(a, x0, x1, 6, 20), y + 60, hx(b, x0, x1, 6, 20) - hx(a, x0, x1, 6, 20), 8, "none", "#141f1b") + T(hx(a, x0, x1, 6, 20), y + 82, l, { s: 10.5, c: "#34433d" }); };
    s += win(0, "12:30", "13:30", "Coimbra 12:30–13:30") + win(0, "15:30", "17:00", "Porto 15:30–17:00") + win(1, "15:00", "16:00", "Lisboa até 16:00 · ETA 16:10 ✕");
    s += RECT(hx("16:00", x0, x1, 6, 20), 52 + rh + 30, 4, 24, "#bb4119", "none");
    const xn = hx(NOW, x0, x1, 6, 20); s += L(xn, 30, xn, 52 + rh * 8, "#141f1b", 1.5) + T(xn, 24, NOW, { m: 1, w: 600, a: "middle", s: 11 });
    return `<div class="abs" style="left:40px;top:40px">${svg(1560, 840, s)}</div><div class="abs" style="left:40px;top:900px;font-size:12px" class="mut"><span class="mut">▇ condução &nbsp; ▢ pausa &nbsp; ▇ carga/descarga &nbsp; ▭ janela do cliente &nbsp; ▨ restrição em vigor</span></div>`; } },

{ id: "O-04", fam: "Operation", name: "Readiness matrix (transport × check)", intent: "Which transports are blocked, and by which dimension?",
  verdict: "REJECT", strength: "Very fast blocking diagnosis. Unknown gets a distinct glyph, and the columns read as the decision dimensions.", weakness: "It's a spreadsheet. Facts lose their native form (a restriction becomes a dot) and there's nothing physical or temporal left.", reason: "Spreadsheet. Facts lose their native form and there is nothing temporal or physical. The glyph vocabulary is worth keeping; the composition is not.",
  html: () => { const cols = ["Motorista · legalidade", "Motorista · habilitações", "Viatura", "Reboque", "Carga", "Restrições no percurso", "Janelas", "Documentos"];
    const g = { o: `<span class="ok" style="font-size:16px">✓</span>`, r: `<span class="tag t-risk">risco</span>`, x: `<span class="tag t-blk">bloqueia</span>`, u: `<span class="unknown-chip">?</span>`, n: `<span class="fnt">—</span>` };
    const m = ["roooooo​o", "ooooorro", "nxnnnnnn", "oooooooo", "ooouoooo", "rooooroo", "nnnnnuon", "nnnnnnnn"].map(r => r.replace("​", ""));
    const mm = [["r", "o", "o", "o", "o", "u", "o", "o"], ["o", "o", "o", "o", "o", "r", "x", "o"], ["o", "o", "o", "o", "o", "o", "o", "o"], ["o", "o", "o", "u", "o", "o", "o", "o"], ["o", "o", "o", "o", "u", "o", "o", "r"], ["r", "o", "o", "o", "o", "r", "o", "o"], ["n", "n", "n", "n", "o", "u", "o", "n"], ["n", "n", "n", "n", "u", "o", "o", "n"]];
    return strip(`<b class="disp" style="font-size:15px">Prontidão</b><span class="mut">o que impede cada transporte</span>`) + `<div class="abs" style="left:40px;right:40px;top:90px"><table class="g" style="font-size:13px"><tr><th></th>${cols.map(c => `<th style="white-space:normal;width:120px;line-height:1.3">${c}</th>`).join("")}</tr>
    ${JOBS.map((j, i) => `<tr style="height:84px"><td><span class="code">${j[0]}</span> <b>${j[1]}</b></td>${mm[i].map(c => `<td style="text-align:center">${g[c]}</td>`).join("")}</tr>`).join("")}</table></div>`; } },

{ id: "O-05", fam: "Operation", name: "Latitude schematic (Portugal as a metro line)", intent: "Can the country be straightened so every transport becomes a comparable vertical journey?",
  verdict: "KEEP", strength: "Latitude as the shared vertical axis turns Portugal's N–S shape into an advantage. Transports become parallel journeys you can compare at a glance, and Coimbra/Porto/Lisboa line up across all of them.", weakness: "It distorts east–west geography (Bragança and Sines look adjacent), and the schematic needs learning.", reason: "Strong, distinctively FleetOS, and native to Portugal's geometry. A candidate replacement for the landscape overview map.",
  html: () => { const y = (lat) => 70 + (42.1 - lat) * (850 / 5.2); const cities = ["Viana", "Braga", "Porto", "Aveiro", "Coimbra", "Leiria", "Santarém", "Lisboa", "Setúbal", "Sines", "Évora", "Beja", "Faro"];
    let s = ""; for (const c of cities) { const yy = y(CITIES[c][0]); s += L(150, yy, 1540, yy, "#e4e1d7") + T(140, yy + 4, c, { a: "end", s: 12, c: "#5b6761" }); }
    JOBS.forEach((j, i) => { const r = R(j[7]); const x = 230 + i * 165; const a = r.pts[0], b = r.pts[r.pts.length - 1]; const ya = y(a[0]), yb = y(b[0]); const p = atKm(j[7], j[5] || 0);
      const live = j[4] !== "unk"; s += L(x, ya, x, yb, live ? "#c9c5b8" : "#c9c5b8", 6, live ? null : "6 6");
      if (j[5]) s += L(x, ya, x, y(p[0]), "#1f4d45", 6); s += `<circle cx="${x}" cy="${ya}" r="6" fill="#141f1b"/><rect x="${x - 7}" y="${yb - 7}" width="14" height="14" fill="#141f1b"/>`;
      if (j[5]) s += `<circle cx="${x}" cy="${y(p[0])}" r="10" fill="#fff" stroke="${stC[j[4]]}" stroke-width="3"/>`;
      s += T(x, 40, j[0], { a: "middle", m: 1, s: 11, c: "#5b6761" }) + T(x, 58, j[1], { a: "middle", w: 600, s: 13 });
      if (i === 0) { s += `<rect x="${x - 8}" y="${y(39.24) - 4}" width="16" height="8" fill="#f5ead4" stroke="#9c6410"/>` + T(x + 16, y(39.24) + 4, "pausa 10:32", { s: 11, c: "#9c6410" }) + T(x + 16, y(40.21) + 4, "12:57 descarga", { s: 11 }) + `<path d="M${x} ${y(41.16) - 18} l7 11 h-14z" fill="#f2dcda" stroke="#8c1c1c"/>` + T(x + 14, y(41.16) - 10, "VCI", { s: 11, c: "#8c1c1c" }); }
      if (i === 5) s += `<rect x="${x - 9}" y="${y(40.55)}" width="18" height="${y(40.2) - y(40.55)}" fill="none" stroke="#bb4119" stroke-dasharray="3 2"/>` + T(x + 14, y(40.4), "IP3 obras", { s: 11, c: "#bb4119" });
      if (i === 1) s += `<path d="M${x} ${y(41.16) + 4} l7 11 h-14z" fill="#f2dcda" stroke="#8c1c1c"/>`;
    });
    return `<div class="abs" style="left:20px;top:10px">${svg(1560, 960, s)}</div>`; } },

{ id: "O-06", fam: "Operation", name: "Accordion instrument (list that opens into the object)", intent: "Can scanning and inspecting happen in the same place, without leaving the list?",
  verdict: "REJECT", strength: "The selected row grows into a real instrument (journey + day + truck) in situ, so continuity is perfect. No inspector needed.", weakness: "The other rows get pushed away and lose comparability, so it reads like a FAQ accordion. Hierarchy between the expanded row and the page title is muddled.", reason: "A generic accordion. Expanding one row destroys the comparability that made the list worth having. In-place growth belongs to a transition, not a layout.",
  html: () => { const row = (j, i) => `<div style="display:flex;align-items:center;gap:24px;height:52px;border-bottom:1px solid var(--line);padding:0 8px"><span class="code">${j[0]}</span><b style="width:170px">${j[1]}</b><span class="mut" style="width:180px">${j[2]}</span>${microJourney(j, 420)}<span class="${j[4]}" style="margin-left:auto">${j[3]}</span></div>`;
    const ex = `<div style="border:1.5px solid var(--ink);background:var(--sheet);padding:22px 26px;margin:6px 0"><div style="display:flex;gap:18px;align-items:baseline"><span class="code">J-4217</span><span class="h2">Faro → Porto</span><span class="mut">Miguel Costa · AA-42-ZP + PT-3821</span><span class="risk" style="margin-left:auto">pausa obrigatória até 10:50</span></div>
    ${svg(1440, 120, (() => { let s = L(20, 60, 1420, 60, "#c9c5b8", 4) + L(20, 60, 20 + 1400 * 282 / 556, 60, "#1f4d45", 4); [[0, "Faro", "06:41 ✓"], [320, "Santarém", "pausa 10:32"], [441, "Coimbra", "12:57 · 12:30–13:30"], [556, "Porto", "15:12 · 15:30–17:00"]].forEach(([k, n, t]) => { const x = 20 + 1400 * k / 556; s += `<rect x="${x - 6}" y="54" width="12" height="12" fill="${k === 320 ? "#f5ead4" : "#fff"}" stroke="${k === 320 ? "#9c6410" : "#141f1b"}" stroke-width="2"/>` + T(x, 36, n, { a: k === 556 ? "end" : k ? "middle" : "start", w: 600 }) + T(x, 92, t, { a: k === 556 ? "end" : k ? "middle" : "start", s: 11, c: "#5b6761" }); }); return s + `<circle cx="${20 + 1400 * 282 / 556}" cy="60" r="9" fill="#fff" stroke="#1f4d45" stroke-width="3"/>`; })())}
    <div style="display:flex;gap:40px;margin-top:6px"><div>${svg(700, 70, hourAxis(0, 700, 14, 6, 18) + dayBar(0, 700, 28, 26, { labels: false }))}</div><div>${svg(420, 150, truck({ w: 420, dims: false }))}</div></div></div>`;
    return strip(`<b class="disp" style="font-size:15px">Transportes</b><span class="mut">8</span>`) + `<div class="abs" style="left:40px;right:40px;top:70px">${row(JOBS[7], 7)}${ex}${JOBS.slice(1, 7).map(row).join("")}</div>`; } },

{ id: "O-07", fam: "Operation", name: "Three sentences (attention-only, typographic)", intent: "If the operator only reads one screen, what must change in the next hour?",
  verdict: "MAYBE", strength: "Ruthless prioritisation. Each sentence is a decision with its consequence and one inline physical hint. Calm and premium.", weakness: "No ambient awareness of the healthy transports, so it can feel empty on a quiet day. It's only as good as the ranking behind it.", reason: "Superb landing sentence, but a workspace can't be built from three sentences. On a calm day it is empty. Use as the attention header above O-09.",
  html: () => `<div class="abs" style="left:160px;top:110px;width:1200px">
  <div class="mut mono" style="font-size:12px;margin-bottom:46px">ter 6 out · ${NOW} · 6 transportes em curso, 3 precisam de si</div>
  ${[["10:50", "Miguel Costa tem de parar até às 10:50.", "Santarém, km 320, deixa 18 min de margem. Coimbra continua dentro da janela.", "risk", "J-4217"],
     ["11:30", "J-4218 chega a Lisboa às 16:10 — a janela fecha às 16:00.", "Sair 15 min mais cedo resolve; Ana Ribeiro tem horas para isso.", "act", "J-4218"],
     ["hoje", "Rui Santos não pode conduzir: CQM caducou há 4 dias.", "Não tem transporte hoje. J-4223 e J-4224 ainda não têm motorista.", "blk", "D-09"]].map(([t, h, sub, c, ref]) => `
  <div style="display:grid;grid-template-columns:120px 1fr;gap:20px;padding:30px 0;border-top:1px solid var(--line)"><div class="mono ${c}" style="font-size:20px;font-weight:600;padding-top:6px">${t}</div>
  <div><div class="h1" style="font-size:38px">${h}</div><div class="mut" style="font-size:17px;margin-top:10px">${sub} <span class="code" style="margin-left:6px">${ref} ↗</span></div></div></div>`).join("")}
  <div class="fnt" style="border-top:1px solid var(--line);padding-top:22px;font-size:14px">Os restantes 3 transportes seguem dentro do plano.</div></div>` },

{ id: "O-08", fam: "Operation", name: "The yard (fleet as physical silhouettes)", intent: "What physical capacity do I have, and where is it committed?",
  verdict: "REJECT", strength: "Load fill read through the silhouettes is immediate, and free trailers are visibly empty. Physical-object-first at population scale.", weakness: "Eight trucks fit; forty would not. The silhouettes repeat and turn decorative, and location and time are missing.", reason: "Decorative at population scale. Eight silhouettes look lovely and forty would be wallpaper. The load-fill glyph survives as a row micro-object.",
  html: () => { let s = ""; const T8 = [["AA-42-ZP", "PT-3821", 18, 6, "J-4217 · Miguel"], ["DE-18-RT", "PT-3910", 22, 0, "J-4218 · Ana"], ["BX-07-LM", "PT-3720", 30, 0, "J-4219 · Sofia"], ["CC-91-PA", "PT-4082", 12, 9, "J-4220 · Pedro"], ["FT-33-NS", "PT-3854", 9, 0, "J-4221 · a carregar"], ["GM-55-OR", "PT-9281", 27, 0, "J-4222 · Carla"], ["HL-02-AV", "PT-1021", 0, 0, "livre · Maia"], ["IK-80-BE", "PT-3390", 0, 0, "oficina até 8 out"]];
    T8.forEach(([p, t, a, b, l], i) => { const x = 40 + (i % 2) * 780, y = 70 + Math.floor(i / 2) * 225; s += `<g opacity="${i === 7 ? .45 : 1}">${truck({ w: 520, x, y, loadA: a, loadB: b, dims: false })}</g>` + T(x + 560, y + 80, p, { m: 1, w: 600, s: 14 }) + T(x + 560, y + 100, t, { m: 1, s: 12, c: "#5b6761" }) + T(x + 560, y + 128, l, { s: 13 }) + T(x + 560, y + 148, a + b ? `${a + b}/33 paletes` : i === 7 ? "manutenção" : "vazio", { s: 12, c: "#5b6761" }); });
    return `<div class="abs" style="left:0;top:0">${svg(1600, 1000, s)}</div><div class="abs" style="left:40px;top:24px"><b class="disp" style="font-size:15px">Parque · 8 conjuntos</b> <span class="mut">&nbsp;5 em viagem · 1 a carregar · 1 livre · 1 em oficina</span></div>`; } },

{ id: "O-09", fam: "Operation", name: "Portrait map spine + ledger (no white panel)", intent: "Can geography and the dense list coexist without a map-left/panel-right split?",
  verdict: "KEEP", strength: "A portrait map matches Portugal's shape. Rows sit on the same paper with leader lines from each row to its truck, so the map and the list are one surface.", weakness: "Leader lines get busy beyond about 10 rows, and the map is fixed-scale at country level.", reason: "Best answer so far to 'map plus list'. The portrait orientation and leader-line binding replace the generic side panel.",
  html: () => { const { svg: m, P } = mapWithP({ w: 520, h: 940, bbox: [36.9, -9.6, 42.2, -6.1], pad: 10, tone: "none", routes: JOBS.map(j => ({ id: j[7], c: j[4] === "unk" ? "#8a928d" : "#1f4d45", w: 2.5, dash: j[4] === "unk" ? "4 4" : null })), marks: JOBS.filter(j => j[5]).map(j => ({ route: j[7], km: j[5], kind: "truck", c: stC[j[4]] })), cityList: ["Porto", "Lisboa", "Faro", "Coimbra", "Viseu", "Évora", "Braga", "Sines"] });
    let lines = ""; JOBS.forEach((j, i) => { const [x, y] = P(atKm(j[7], j[5] || 0)); const ry = 92 + i * 108; lines += `<path d="M${x + 30} ${y + 30} C ${590} ${y + 30}, ${560} ${ry + 30}, 636 ${ry + 30}" fill="none" stroke="${i === 0 ? "#141f1b" : "#a8a397"}" stroke-width="${i === 0 ? 1.4 : 1}"/>`; });
    return `<div class="abs" style="left:30px;top:30px">${m}</div><div class="abs" style="left:0;top:0">${svg(700, 1000, lines)}</div>
    <div class="abs" style="left:640px;top:72px;right:40px">${JOBS.map((j, i) => `<div style="height:108px;border-top:1px solid ${i === 0 ? "var(--ink)" : "var(--line)"};padding-top:14px;display:grid;grid-template-columns:80px 230px 1fr;gap:16px">
      <span class="code" style="height:20px">${j[0]}</span><div><b style="font-size:15px">${j[1]}</b><div class="mut">${j[8] === "—" ? "sem motorista" : DRIVERS.find(d => d[0] === j[8])[1]}</div></div><div>${microJourney(j, 560)}<div class="${j[4]}" style="font-size:12.5px;margin-top:6px">${["Pausa até 10:50 · Santarém", "Janela Lisboa 16:00 · ETA 16:10", "A1 Leiria · ETA 13:10", "Pausa · retoma 10:40", "A carregar · Sines cais 4", "IP3 obras → N2", "Por planear", "Por planear · frio"][i]}</div></div></div>`).join("")}</div>`; } },
];
