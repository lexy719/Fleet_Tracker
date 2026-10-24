// Overlap checker for the Studio palcos v2: every text node in the active page (and the marks on the lines)
// is measured; pairs that intersect, text cut by an overflow box and text off the screen are reported.
// States: map (open sidebar, rail), Viagens ×3 variations × Horas/Km, Garagem ×3, Perfil ×3.
// Usage: node overlaps2.mjs [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = process.argv[2]; if (OUT) mkdirSync(OUT, { recursive: true });
for (const t of await (await fetch("http://127.0.0.1:9333/json")).json()) if (t.type === "page") await fetch("http://127.0.0.1:9333/json/close/" + t.id);
const target = await (await fetch("http://127.0.0.1:9333/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") console.log("EXC", JSON.stringify(d.params.exceptionDetails).slice(0, 300)); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, (d) => res(d.result ?? d)); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) console.log("ERR", JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result?.value; };
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:5174/" }); await sleep(16000);
const click = (sel, text) => ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => !${JSON.stringify(text ?? "")} || x.textContent.trim().startsWith(${JSON.stringify(text ?? "")})); if (!b) return "none"; b.click(); return "ok"; })()`);
const key = (k) => ev(`document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "${k}", bubbles: true })); 1`);

const MEASURE = (rootSel) => `(() => {
  const root = document.querySelector(${JSON.stringify(rootSel)});
  if (!root) return JSON.stringify([["SEM PÁGINA", ${JSON.stringify(rootSel)}]]);
  const hidden = (el) => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || e.hasAttribute("data-hide") || e.hidden) return true; o *= +s.opacity; } return o < 0.15; };
  const clip = (el, b) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const st = getComputedStyle(e); if (st.overflowX !== "visible" || st.overflowY !== "visible") { const c = e.getBoundingClientRect(); b = { left: Math.max(b.left, c.left), top: Math.max(b.top, c.top), right: Math.min(b.right, c.right), bottom: Math.min(b.bottom, c.bottom) }; } } return b; };
  const items = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (hidden(el)) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const b0 = r.getBoundingClientRect();
    if (b0.width < 2) continue;
    const b = clip(el, { left: b0.left, top: b0.top, right: b0.right, bottom: b0.bottom });
    if (b.right - b.left < 2 || b.bottom - b.top < 2) continue;
    if (b.right - b.left < b0.width - 3 && !el.closest(".dy-who, .gg-model, .sb-txt")) items.push({ cut: 1, t: n.textContent.trim().slice(0, 40) });
    items.push({ t: n.textContent.trim().slice(0, 40), el, b });
  }
  for (const el of root.querySelectorAll(".dy-arrive, .dy-pump, .dy-pause-node, .dy-now-dot, .gg-end, .gg-dia, .gg-bar, .pf-blk, .pf-doc, .pf-now, .gg-now, .dy-drive")) {
    if (hidden(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const ix = r.width > 6 ? 1 : 0, iy = r.height > 6 ? 1 : 0;
    items.push({ node: 1, t: el.className, el, b: { left: r.left + ix, top: r.top + iy, right: r.right - ix, bottom: r.bottom - iy } });
  }
  const hits = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.cut) { hits.push(["CORTADO", a.t]); continue; }
    if (!a.node && (a.b.right > 1430 || a.b.bottom > 890 || a.b.left < 0)) hits.push(["FORA DO ECRÃ", a.t]);
    for (let j = i + 1; j < items.length; j++) {
      const c = items[j];
      if (c.cut || (a.node && c.node)) continue;
      if (a.el === c.el) continue;
      if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
      const w = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left), h = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
      if (w > 1.5 && h > 1.5) hits.push([a.t, c.t, Math.round(Math.max(a.b.left, c.b.left)), Math.round(Math.max(a.b.top, c.b.top))]);
    }
  }
  return JSON.stringify(hits);
})()`;
let total = 0;
const check = async (label, rootSel) => {
  await sleep(1700);
  const hits = JSON.parse(await ev(MEASURE(rootSel)));
  total += hits.length;
  console.log(`${label}: ${hits.length}` + (hits.length ? "\n  " + hits.slice(0, 10).map((h) => h.join(" ✕ ")).join("\n  ") : ""));
  if (OUT) { const s = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${label.replace(/[^a-z0-9]+/gi, "-")}.png`, Buffer.from(s.data, "base64")); }
};
await check("mapa sidebar aberta", ".sb");
await key("m"); await check("mapa carril", ".sb"); await sleep(1500); await check("mapa motoristas (nomes)", ".stage"); await key("m"); await sleep(800);
await key("r"); await sleep(3000); await check("mapa rotas (nomes)", ".stage"); await key("r"); await sleep(800);
await click(".sb-row", "Viagens"); await sleep(3000);
for (const m of ["Horas", "Km"]) {
  await click(".dy-measure button", m);
  for (const v of ["A tempo", "Paragens", "Carga"]) { await click(".pv-vars button", v); await check(`viagens ${v} ${m}`, ".dy-stage"); }
}
await click(".dy-measure button", "Horas"); await click(".pv-vars button", "A tempo"); await sleep(1000);
await click(".dy-plate"); await sleep(2500);
for (const v of ["Ocupação", "Oficina", "Uso"]) { await click(".pv-vars button", v); await check(`garagem ${v}`, ".gg"); }
await key("Escape"); await sleep(1500);
await click(".dy-links .lnk"); await sleep(2500);
for (const v of ["Horas", "Disponibilidade", "Documentos"]) { await click(".pv-vars button", v); await check(`perfil ${v}`, ".pf-stage"); }
await key("Escape"); await key("Escape"); await sleep(1200);
await click(".sb-row", "Garagem"); await sleep(2500);
await check("garagem sem foco", ".gg");
await key("Escape"); await sleep(1200);
await click(".sb-row", "Combustível"); await sleep(400);
const r = await ev(`[...document.querySelectorAll(".sb-row")].filter(b => b.textContent.includes("Combustível")).length`);
await click(".sb-row[data-k=combustivel]"); await sleep(2500);
for (const v of ["Preço", "Depósitos", "Gasto"]) { await click(".pv-vars button", v); await check(`combustivel ${v}`, ".fu-stage"); }
await key("Escape"); await sleep(1200);
await click(".sb-row[data-k=fuel]"); await sleep(400); await click(".sb-row[data-k=fuel]"); await sleep(600);
await click(".sb-row[data-k=viagens]"); await sleep(3000); await click(".pv-vars button", "Paragens"); await sleep(1500);
console.log("tag", await click(".dy-tag[data-go]")); await sleep(2500);
await click(".pv-vars button", "Preço"); await check("combustivel paragem em foco", ".fu-stage");
await key("Escape"); await key("Escape"); await sleep(1200);
await click(".sb-row[data-k=clientes]"); await sleep(2500);
for (const v of ["Entregas", "Prazos", "Volume"]) { await click(".pv-vars button", v); await check(`clientes ${v}`, ".cl-stage"); }
await key("Escape"); await sleep(1200);
await click(".sb-row[data-k=viagens]"); await sleep(3000); await click(".pv-vars button", "A tempo"); await sleep(1200);
console.log("cliente", await click(".dy-who small .lnk:not(.dy-plate)")); await sleep(2500);
await click(".pv-vars button", "Entregas"); await check("cliente em foco", ".cl-stage");
console.log("TOTAL", total);
ws.close(); process.exit(0);
