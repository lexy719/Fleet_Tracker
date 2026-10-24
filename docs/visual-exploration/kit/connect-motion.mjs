// Motion studies: live HTML (open in a browser) + frames captured at several virtual times.
import A from "./connect-a.mjs"; import B from "./connect-b.mjs";
import { svg, T, L, RECT, truck } from "./kit.mjs";
import { stripMap } from "./studies-route.mjs";
const by = Object.fromEntries([...A, ...B].map(s => [s.id, s]));
const EASE = "cubic-bezier(.2,.7,.2,1)";

export default [
{ id: "M-01", pair: "Driver × Documents", name: "Threads draw into the day", base: "C-11", idea: "The threads unspool from each document and land on the moments they touch, staggered. The eye learns the relation as the sequence plays.",
  css: `svg path{stroke-dasharray:1400;stroke-dashoffset:1400;animation:draw 1.6s ${EASE} forwards}${Array.from({ length: 12 }, (_, i) => `svg path:nth-of-type(${i + 1}){animation-delay:${.2 + i * .18}s}`).join("")}@keyframes draw{to{stroke-dashoffset:0}}`,
  html: () => by["C-11"].html() },
{ id: "M-02", pair: "Job × Driver", name: "Magnetic pull settles", base: "C-02", idea: "The candidates fade in and the pull lines draw from the job outward. The strongest pull completes first and the rest follow by fit, so the ranking is felt before it is read.",
  css: `svg path{stroke-dasharray:1600;stroke-dashoffset:1600;animation:draw 1.8s ${EASE} forwards}svg path:nth-of-type(1){animation-delay:.1s}svg path:nth-of-type(2){animation-delay:.6s}svg path:nth-of-type(3){animation-delay:1s}svg path:nth-of-type(4){animation-delay:1.3s}svg path:nth-of-type(5){animation-delay:1.5s}svg path:nth-of-type(6){animation-delay:1.7s}svg circle{opacity:0;animation:fade .6s ease forwards;animation-delay:1.2s}@keyframes draw{to{stroke-dashoffset:0}}@keyframes fade{to{opacity:1}}`,
  html: () => by["C-02"].html() },
{ id: "M-03", pair: "Everything", name: "Skewer assembles", base: "C-19", idea: "The planes drop into the stack one by one, then the pin pierces all six. The relation is literally assembled in front of the operator.",
  css: `svg g{translate:0 -260px;opacity:0;animation:drop .7s ${EASE} forwards}${Array.from({ length: 6 }, (_, i) => `svg g:nth-of-type(${i + 1}){animation-delay:${i * .25}s}`).join("")}svg line,svg ellipse,svg circle{opacity:0;animation:fade .4s ease forwards;animation-delay:1.9s}@keyframes drop{to{translate:0 0;opacity:1}}@keyframes fade{to{opacity:1}}`,
  html: () => by["C-19"].html() },
{ id: "M-04", pair: "Job × Truck", name: "Truck rides the corridor", base: null, idea: "The truck glides along the unrolled corridor while the fuel and legal gauges drain and reset at Santarém. It's dynamism carrying meaning: the pause is visibly the moment both refill.",
  css: "",
  html: () => { const { s: sm, X, Y } = stripMap(80, 1520, 420, 150); const d = (sm.match(/<path d="([^"]+)"[^>]*stroke="#1f4d45"/) || [])[1];
    let s = RECT(80, 300, 1440, 240, "#ece9df", "none") + sm;
    [[0, "Faro"], [320, "Santarém"], [441, "Coimbra"], [556, "Porto"]].forEach(([k, n]) => s += `<rect x="${X(k) - 7}" y="${Y(k) - 7}" width="14" height="14" fill="#fff" stroke="#141f1b" stroke-width="2"/>` + T(X(k), 580, n, { a: "middle", w: 600, s: 14 }));
    s += `<g><circle r="13" fill="#fff" stroke="#1f4d45" stroke-width="4"/><animateMotion dur="5s" fill="freeze" path="${d}" keyPoints="0;0.575;0.575;1" keyTimes="0;0.45;0.6;1" calcMode="linear"/></g>`;
    const gauge = (y, label, c, vals) => RECT(240, y, 1000, 26, "#ece9df", "none") + `<rect x="240" y="${y}" height="26" fill="${c}" width="${vals[0]}"><animate attributeName="width" dur="5s" fill="freeze" values="${vals.join(";")}" keyTimes="0;0.45;0.6;1"/></rect>` + T(80, y + 18, label, { w: 600, s: 14 });
    s += gauge(700, "Combustível", "#3b5d78", [780, 230, 850, 410]) + gauge(760, "Condução contínua", "#9c6410", [0, 1000, 0, 860]) + L(1240, 690, 1240, 800, "#141f1b", 2) + T(1250, 778, "4h30", { m: 1, s: 12 });
    return `<div class="abs" style="inset:0">${svg(1600, 1000, s)}</div><div class="abs" style="left:80px;top:60px"><div class="cap">J-4217 · em movimento</div><div class="disp" style="font-size:40px;font-weight:600;margin-top:8px">Em Santarém os dois indicadores reiniciam juntos.</div></div>`; } },
];
