// Builds ../FleetOS-Visual-Exploration.html and prints it to PDF (A4 landscape) with headless Chrome.
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
import existing from "./existing.mjs";
const gen = JSON.parse(fs.readFileSync("studies.json", "utf8"));
const all = [...gen, ...existing]; const by = Object.fromEntries(all.map(s => [s.id, s]));
const FAMS = ["Operation", "Driver", "Vehicle", "Route", "Restrictions", "Documents", "Environment"];
const count = (arr, v) => arr.filter(s => s.verdict === v).length;
const img = (id) => `studies/${id}.png`;
const badge = (v) => `<span class="v v-${v}">${v}</span>`;
const thumb = (id, w = 64, cap = true) => { const s = by[id]; return `<figure class="th" style="width:${w}mm"><img src="${img(id)}" style="width:${w}mm;height:${w * .625}mm"><figcaption>${cap ? `<b>${id}</b> ${badge(s.verdict)}<br><span>${s.name}</span>` : `<b>${id}</b>`}</figcaption></figure>`; };

const TOP = [
  ["R-02", "Time–distance plane. Windows, pauses, speed and slack become geometry; the strongest single representation of a timed transport. Restrictions fold in as rectangles (R-09)."],
  ["D-05", "Legal clock converted into kilometres: 'stop before km 331'. Causally joins Driver, Route and the place to stop. The dispatcher's real question, answered physically."],
  ["V-01", "The machine is the interface. Facts pinned where they physically live, unknowns drawn as dashed gaps. No panel needed."],
  ["X-01", "Rules as wiring. Each condition carries its fact and source, and one unknown visibly propagates to an 'unknown' verdict. Honesty you can see."],
  ["R-03", "Strip map: real geometry unrolled onto a straight km axis. Geography and journey in one object; every route layer can ride on it."],
  ["O-09", "Portrait geography plus a dense ledger on one surface, bound by leader lines. Replaces content-left/map-right with no white panel."],
  ["D-01", "Legal counters as filling bands on the activity clock. The binding rule hits its wall at 10:50, visibly."],
  ["X-03", "The missing fact drawn as an empty dimension on the truck, with owner and consequence. Uncertainty becomes a physical task."],
  ["V-06", "Clearance portal: the truck front inside the structure at true scale. Understood in one second by anyone."],
  ["O-05", "Latitude schematic: Portugal's N–S shape becomes the axis, so every transport is a comparable vertical journey. Distinctively FleetOS."],
];
const WIN = [
  ["Temporal spine", "One shared horizontal clock carrying activity, legal counters, windows, rest and restriction validity.", ["D-01", "O-03", "D-08", "X-04"]],
  ["Distance × time plane", "Plan as trajectory, windows/restrictions as rectangles, slack and conflict as geometry.", ["R-02", "R-09"]],
  ["Route as corridor", "Real geometry unrolled onto a km axis; context roads projected into the band; layers ride along.", ["R-03", "V-09", "D-05"]],
  ["Physical object first", "Side elevation / load plan at true proportion with facts pinned where they live.", ["V-01", "E-06", "V-02"]],
  ["Unknown as a drawn gap", "Missing facts are dashed, located and owned, never silently 'OK'.", ["X-03", "X-01", "V-01"]],
  ["Cross-domain projection", "One domain's limit converted into another's units: legal time→km, fuel→km, validity→calendar.", ["D-05", "V-03", "F-08"]],
  ["Recommendation by ink, not colour", "Candidates on identical axes; the recommended one outlined and inked; the deciding difference annotated.", ["D-11", "V-05", "R-06"]],
  ["Portugal-native portrait geography", "Use the country's N–S shape instead of fighting a landscape screen.", ["O-09", "O-05", "R-04"]],
  ["Document-native marks", "Diffs, live fields and causes marked on the sheet itself, with causes in the margin.", ["F-02", "F-03", "F-05"]],
];
const AVOID = [
  ["Landscape fullscreen map of Portugal", "55–80% of the screen becomes sea and Spain; labels collide where operations are dense.", ["O-02", "R-07", "X-07", "E-12"]],
  ["Content left + map tile right", "The tile repeats the overview and answers nothing in the content beside it.", ["E-01", "E-02", "E-04", "E-07"]],
  ["White cards on a map", "Panels floating on a basemap: the map becomes a backdrop.", ["E-05", "E-14", "V-07"]],
  ["Registers and tables as destinations", "Facts lose their native form; looks like every ERP.", ["O-04", "D-10", "V-08", "X-08", "E-08"]],
  ["Skeuomorph and spectacle", "Tachograph discs, scopes, perspective roads, fanned paper: striking and unusable.", ["D-12", "R-11", "F-01", "V-07"]],
  ["Connector diagrams / node graphs", "Lines that only say 'related' carry no information.", ["F-07", "D-04", "V-11"]],
  ["Progress-bar dashboards", "Counters detached from the clock or the object.", ["V-04", "E-03"]],
  ["Card soup in lists", "Repeated mini-cards per row; feeds with equal weight per event.", ["E-13", "D-07", "O-06"]],
];
const DOMAIN = [
  ["Operation", ["O-09", "O-05", "O-03"], "Portrait map + ledger as the home; latitude schematic as the comparison mode; day board for time. O-07's sentence sits on top as the attention header."],
  ["Driver", ["D-05", "D-01", "D-11"], "Legality projected onto the road; legal bands on the clock; mirrored ribbons for reassignment."],
  ["Vehicle", ["V-01", "V-06", "V-05"], "Annotated elevation as the canvas; physical fact gauges for constraints; stacked elevations to compare equipment."],
  ["Route", ["R-02", "R-03", "R-09"], "Time–distance plane, strip-map corridor, and restriction rectangles folded into the same plane."],
  ["Restrictions", ["X-01", "X-03", "X-04"], "Logic wiring, the missing fact on the object, and impact as crossings on time."],
  ["Documents", ["F-02", "F-05", "F-03"], "Diff on the sheet; cause → document → consequence; live vs frozen fields."],
];
const PRIM = [
  ["P1 · Temporal spine", "A single horizontal clock shared by every time-bearing fact. Bands fill toward legal walls; windows are open boxes; restriction validity is a hatched band across rows.", ["D-01", "O-03", "X-04"]],
  ["P2 · Distance–time plane", "km × clock. The plan is a trajectory; stops are horizontal lines; windows and restrictions are rectangles; slack is the gap between line and box.", ["R-02", "R-09"]],
  ["P3 · Spatial corridor", "The real route unrolled onto a straight km axis with its true lateral wiggle and nearby roads. Every along-route layer (legal, fuel, gates) rides on it.", ["R-03", "V-09"]],
  ["P4 · Cross-domain projection", "Convert a limit into the units where the decision happens: hours→km, fuel→km, validity→calendar. Always shows its assumption.", ["D-05", "V-03"]],
  ["P5 · Technical object canvas", "Elevation / top plan at true proportion. Facts are pinned by leader to their physical location; unknowns are dashed gaps.", ["V-01", "E-06"]],
  ["P6 · Physical fact gauge", "A constraint drawn as its physical counterpart (portal, gate, axle force) next to the vehicle's own number.", ["V-06", "V-10"]],
  ["P7 · Logic wiring", "Conditions → AND/OR → verdict. Each condition carries fact + source; unknown propagates visibly; provenance folds out.", ["X-01", "X-06"]],
  ["P8 · Missing-fact task", "A missing fact becomes a located, owned task with its consequence, not a grey label.", ["X-03"]],
  ["P9 · Decision comparison layer", "Candidates on identical axes; recommendation by outline and ink weight; the deciding difference annotated in place.", ["D-11", "V-05"]],
  ["P10 · Document sheet", "Documents at reading scale. Diffs, live-bound fields and pending signatures marked on the sheet; causes in the margin.", ["F-02", "F-03"]],
  ["P11 · Portrait geography", "Portugal's N–S frame: portrait map bound to rows by leader lines, or the latitude schematic for comparison.", ["O-09", "O-05"]],
  ["P12 · Micro-journey row", "Each population row carries a compressed journey (position, stops, pause, restriction tick) instead of a status word.", ["O-01", "O-09"]],
  ["P13 · Attention headline", "One decision sentence with its consequence and inline micro-objects; sits atop any composition.", ["O-07", "D-09"]],
];

const css = `@page{size:297mm 210mm;margin:0}*{box-sizing:border-box;margin:0;padding:0}
body{font:9.5pt/1.4 Inter,"Segoe UI",sans-serif;color:#141f1b;background:#fff}
.pg{width:297mm;height:210mm;padding:12mm 14mm;position:relative;page-break-after:always;overflow:hidden;background:#fbfaf6}
.pg:last-child{page-break-after:auto}
h1{font:600 30pt/1.05 "Inter Tight",Inter;letter-spacing:-.02em}h2{font:600 18pt/1.1 "Inter Tight",Inter;letter-spacing:-.015em;margin-bottom:4mm}h3{font:600 11pt/1.2 Inter;margin-bottom:1.5mm}
.cap{font:600 7pt/1 Inter;letter-spacing:.1em;text-transform:uppercase;color:#5b6761}.mut{color:#5b6761}
.foot{position:absolute;left:14mm;right:14mm;bottom:6mm;display:flex;justify-content:space-between;font:7pt "JetBrains Mono",Consolas;color:#8a928d}
.v{display:inline-block;font:700 6.5pt/1 Inter;letter-spacing:.06em;padding:1.2mm 1.6mm;border-radius:.6mm;vertical-align:middle}
.v-KEEP{background:#1f4d45;color:#fff}.v-MAYBE{background:#f5ead4;color:#9c6410}.v-REJECT{background:#f2dcda;color:#8c1c1c}
.grid{display:flex;flex-wrap:wrap;gap:3.2mm}
.th{margin:0}.th img{display:block;border:.25mm solid #dddad0;object-fit:cover}.th figcaption{font-size:7pt;line-height:1.3;margin-top:1mm}.th figcaption span{color:#5b6761}
.study{display:grid;grid-template-columns:196mm 1fr;gap:6mm;height:100%}
.study img{width:196mm;height:122.5mm;border:.3mm solid #dddad0;display:block}
.kv{margin-top:3mm}.kv div{margin-bottom:2.4mm}.kv b{display:block;font:600 6.8pt/1 Inter;letter-spacing:.1em;text-transform:uppercase;color:#5b6761;margin-bottom:.8mm}
.big{font:600 22pt/1 "Inter Tight",Inter}
table.t{border-collapse:collapse;width:100%}table.t td,table.t th{border-bottom:.25mm solid #dddad0;padding:1.6mm 2mm;text-align:left;font-size:8.5pt}table.t th{font:600 6.8pt Inter;letter-spacing:.08em;text-transform:uppercase;color:#5b6761}
.row{display:grid;grid-template-columns:62mm 1fr;gap:5mm;align-items:start;padding:2.6mm 0;border-top:.25mm solid #dddad0}`;

let n = 0; const P = (body, title = "") => `<section class="pg">${body}<div class="foot"><span>FleetOS · Detached visual exploration · 7 out 2026</span><span>${title} · ${++n}</span></div></section>`;
let html = "";
// cover
html += P(`<div style="display:grid;grid-template-columns:104mm 1fr;gap:6mm;height:100%"><div><div class="cap">FleetOS · visual research pack</div><h1 style="margin-top:6mm">What FleetOS should visually become</h1>
<p class="mut" style="margin-top:5mm;font-size:10.5pt">${all.length} detached composition studies of one operational world (Tue 6 Oct, 10:05, J-4217 Faro → Porto and 7 other transports) in seven families. ${gen.length} were made new for this pack and ${existing.length} were picked from the existing environment lab. Each one is judged KEEP / MAYBE / REJECT.</p>
<div style="display:flex;gap:8mm;margin-top:10mm">${["KEEP", "MAYBE", "REJECT"].map(v => `<div><div class="big">${count(all, v)}</div>${badge(v)}</div>`).join("")}</div>
<table class="t" style="margin-top:10mm"><tr><th>Family</th><th>n</th><th>Keep</th><th>Maybe</th><th>Reject</th></tr>${FAMS.map(f => { const a = all.filter(s => s.fam === f); return `<tr><td>${f}</td><td>${a.length}</td><td>${count(a, "KEEP")}</td><td>${count(a, "MAYBE")}</td><td>${count(a, "REJECT")}</td></tr>`; }).join("")}</table>
<p class="mut" style="margin-top:6mm;font-size:8pt">Nothing in the product, lab or state model was changed. Studies are static HTML/SVG drawn from the lab's world data and real route geometry (TomTom fixtures, OSM VCI/IP3), rendered with headless Chrome at 1600×1000.</p></div>
<div class="grid" style="gap:1.6mm;align-content:start">${all.map(s => `<div style="position:relative"><img src="${img(s.id)}" style="width:19.4mm;height:12.1mm;display:block;border:.2mm solid #dddad0;${s.verdict === "REJECT" ? "opacity:.45" : ""}"><span style="position:absolute;left:.6mm;top:.6mm;font:700 5pt Inter;background:${s.verdict === "KEEP" ? "#1f4d45" : s.verdict === "MAYBE" ? "#f5ead4" : "#f2dcda"};color:${s.verdict === "KEEP" ? "#fff" : s.verdict === "MAYBE" ? "#9c6410" : "#8c1c1c"};padding:.4mm .7mm">${s.id}</span></div>`).join("")}</div></div>`, "Cover");
// how to read
html += P(`<h2>How the studies were made and judged</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:10mm">
<div><h3>One world, many questions</h3><p>Every study shows the same moment: Miguel Costa (D-14) on the A1 at km 282 with AA-42-ZP + PT-3821, a pause due by 10:50, Coimbra 12:30–13:30, Porto 15:30–17:00, the VCI rule with one unknown fact, and seven other transports. Only the composition changes, so comparisons are fair.</p>
<h3 style="margin-top:5mm">Variety enforced</h3><p>No map / tiny / 25% / 50% / portrait / corridor / fullscreen / map with embedded axis; horizontal, vertical and km×time planes; object-centred, edge, bottom and margin inspectors; typography-only states. Whenever three studies drifted toward content-left / map-right, the next one changed family.</p>
<h3 style="margin-top:5mm">Picked from the environment (E-series)</h3><p>14 existing lab states (5.7K / 5.7L captures) were judged by the same rules, so the current direction competes on equal terms with the new ideas.</p></div>
<div><h3>Verdicts</h3><table class="t"><tr><td>${badge("KEEP")}</td><td>A strong FleetOS direction worth integrating as a whole composition.</td></tr><tr><td>${badge("MAYBE")}</td><td>One or more strong ideas, but not a complete composition.</td></tr><tr><td>${badge("REJECT")}</td><td>Not suitable for FleetOS (wrong form, decorative, generic, or misleading).</td></tr></table>
<h3 style="margin-top:5mm">Harshness</h3><p>The first pass produced 30 KEEP out of 59, which wasn't critical enough. A second pass downgraded anything that was a layer rather than a view, duplicated a better study, depended on data FleetOS doesn't own, or framed Portugal in landscape. Final: ${count(all, "KEEP")} KEEP · ${count(all, "MAYBE")} MAYBE · ${count(all, "REJECT")} REJECT.</p>
<h3 style="margin-top:5mm">Values held constant</h3><p>Off-white surfaces, ink selection, restrained colour (risk amber, blocker red, unknown dashed grey), strong type, technical tone. No neon, glass, gradients, KPI cards or decorative motion.</p></div></div>`, "Method");
// families
for (const f of FAMS) {
  const list = all.filter(s => s.fam === f);
  for (let i = 0; i < list.length; i += 12) html += P(`<div class="cap">${f} · contact sheet${list.length > 12 ? ` ${i / 12 + 1}/${Math.ceil(list.length / 12)}` : ""}</div><h2 style="margin-top:2mm">${f} — ${list.length} studies <span class="mut" style="font-size:10pt;font-weight:400">· ${count(list, "KEEP")} keep · ${count(list, "MAYBE")} maybe · ${count(list, "REJECT")} reject</span></h2><div class="grid">${list.slice(i, i + 12).map(s => thumb(s.id, 64)).join("")}</div>`, f);
  for (const s of list) html += P(`<div class="study"><div><img src="${img(s.id)}"><div style="margin-top:3mm;display:flex;gap:4mm;align-items:baseline"><span style="font:600 14pt 'JetBrains Mono',Consolas">${s.id}</span><span style="font:600 14pt 'Inter Tight',Inter">${s.name}</span></div>${s.src ? `<div class="mut" style="font-size:7.5pt;margin-top:1mm">from the environment: docs/${s.src}</div>` : ""}</div>
  <div><div class="cap">${s.fam}</div><div style="margin-top:3mm">${badge(s.verdict)}</div><div class="kv" style="margin-top:4mm"><div><b>Intent</b>${s.intent}</div><div><b>Strength</b>${s.strength}</div><div><b>Weakness</b>${s.weakness}</div><div><b>Reason</b><span style="font-weight:500">${s.reason}</span></div></div></div></div>`, `${f} · ${s.id}`);
}
// top 10
for (let p = 0; p < 2; p++) html += P(`<div class="cap">Synthesis</div><h2 style="margin-top:2mm">Top 10 strongest studies ${p ? "(6–10)" : "(1–5)"}</h2>${TOP.slice(p * 5, p * 5 + 5).map(([id, why], i) => `<div class="row" style="grid-template-columns:46mm 1fr;padding:2mm 0"><img src="${img(id)}" style="width:46mm;height:28.75mm;border:.25mm solid #dddad0"><div><div style="font:600 13pt 'Inter Tight',Inter"><span class="mut" style="font-family:'JetBrains Mono'">${p * 5 + i + 1}.</span> ${id} · ${by[id].name}</div><p style="margin-top:1.5mm;font-size:9.5pt">${why}</p></div></div>`).join("")}`, "Top 10");
// patterns
const patPage = (title, items, from, to) => P(`<div class="cap">Synthesis</div><h2 style="margin-top:2mm">${title}</h2>${items.slice(from, to).map(([t, d, ids]) => `<div class="row" style="grid-template-columns:70mm 1fr"><div><h3>${t}</h3><p class="mut" style="font-size:8.5pt">${d}</p></div><div class="grid" style="gap:2mm">${ids.map(id => thumb(id, 38, false)).join("")}</div></div>`).join("")}`, title);
html += patPage("Strongest recurring patterns (1/2)", WIN, 0, 5) + patPage("Strongest recurring patterns (2/2)", WIN, 5, 9) + patPage("Patterns to avoid (1/2)", AVOID, 0, 4) + patPage("Patterns to avoid (2/2)", AVOID, 4, 8);
// domains
for (let p = 0; p < 2; p++) html += P(`<div class="cap">Synthesis</div><h2 style="margin-top:2mm">Best ideas by domain ${p ? "(2/2)" : "(1/2)"}</h2>${DOMAIN.slice(p * 3, p * 3 + 3).map(([d, ids, txt]) => `<div class="row" style="grid-template-columns:40mm 1fr"><div><h3>${d}</h3><p class="mut" style="font-size:8pt">${txt}</p></div><div class="grid" style="gap:3mm">${ids.map(id => thumb(id, 66)).join("")}</div></div>`).join("")}`, "By domain");
// primitives
for (let p = 0; p < 3; p++) html += P(`<div class="cap">Cross-combination</div><h2 style="margin-top:2mm">Visual primitives for a future FleetOS language ${p + 1}/3</h2><p class="mut" style="margin-bottom:3mm">Identified, not integrated. Each is a building block that survived across families; the final language should combine them, not pick one page.</p>${PRIM.slice(p * 5, p * 5 + 5).map(([t, d, ids]) => `<div class="row" style="grid-template-columns:82mm 1fr;padding:2mm 0"><div><h3>${t}</h3><p style="font-size:8.5pt">${d}</p></div><div class="grid" style="gap:2mm">${ids.map(id => thumb(id, 36, false)).join("")}</div></div>`).join("")}`, "Primitives");
// combination sketch
html += P(`<div class="cap">Cross-combination</div><h2 style="margin-top:2mm">How the primitives might stack (not integrated)</h2>
<table class="t" style="margin-top:4mm"><tr><th>Question / lens</th><th>Primary canvas</th><th>Attached layers</th><th>Decision layer</th><th>Header</th></tr>
<tr><td>Operation</td><td>P11 portrait geography + P12 rows</td><td>P1 restriction bands (day board mode)</td><td>—</td><td>P13</td></tr>
<tr><td>Driver</td><td>P1 temporal spine</td><td>P4 legal→km on P3 corridor</td><td>P9 mirrored ribbons</td><td>P13</td></tr>
<tr><td>Vehicle</td><td>P5 object canvas</td><td>P6 gauges · P8 missing-fact task</td><td>P9 stacked elevations</td><td>P13</td></tr>
<tr><td>Route</td><td>P2 distance–time plane</td><td>P3 corridor below, sharing the km axis; fuel/legal (P4)</td><td>P9 alternative trajectory</td><td>P13</td></tr>
<tr><td>Restriction</td><td>P7 logic wiring</td><td>P2 rectangle on the route's plane · P8</td><td>alternative on P3</td><td>P13</td></tr>
<tr><td>Document</td><td>P10 document sheet</td><td>margin causes · live-field marks</td><td>reissue consequences</td><td>P13</td></tr></table>
<p style="margin-top:6mm;font-size:10pt"><b>The shared skeleton:</b> one canvas in the semantic type's native form, layers that share its axis (time, km or the object's geometry), the decision layer drawn on the same axes, and a single decision sentence on top. Maps appear only when the question is spatial, and then in portrait or corridor form.</p>
<p class="mut" style="margin-top:4mm">Open risks: P2 needs an onboarding moment; P3 needs a fallback for E–W routes and urban detours; P5 depends on vehicle dimension data the fleet doesn't fully hold; projections (P4) must always show their assumptions.</p>`, "Combination");
// galleries
const gal = (v) => { const l = all.filter(s => s.verdict === v); let o = ""; for (let i = 0; i < l.length; i += 20) o += P(`<div class="cap">Gallery</div><h2 style="margin-top:2mm">All ${v} (${l.length})${l.length > 20 ? ` · ${i / 20 + 1}/${Math.ceil(l.length / 20)}` : ""}</h2><div class="grid" style="gap:2.4mm">${l.slice(i, i + 20).map(s => thumb(s.id, 51.5)).join("")}</div>`, `Gallery ${v}`); return o; };
html += gal("KEEP") + gal("MAYBE") + gal("REJECT");

const out = path.resolve("../FleetOS-Visual-Exploration.html");
fs.writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><title>FleetOS — Detached Visual Exploration</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet"><style>${css}</style></head><body>${html}</body></html>`);
const pdf = path.resolve("../FleetOS-Visual-Exploration.pdf");
execFileSync("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=8000", `--print-to-pdf=${pdf}`, "file:///" + out.replace(/\\/g, "/")], { stdio: "ignore" });
console.log("pages", n, "→", pdf);
