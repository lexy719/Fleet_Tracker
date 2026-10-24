// node build-spatial.mjs [prefix] → ../spatial/{ID}.png, {S-x}-f{n}.png, {M-x}-f{n}.png, live/*.html
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
import { scenePage } from "./spatial.mjs"; import { SINGLES, SEQUENCES, MOTIONS } from "./spatial-studies.mjs";
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe", out = path.resolve("../spatial"), live = path.join(out, "live"); fs.mkdirSync(live, { recursive: true });
const only = process.argv[2];
const shot = (f, q, png, budget = 3500) => execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1600,1000", `--virtual-time-budget=${budget}`, `--screenshot=${png}`, "file:///" + f.split(path.sep).join("/") + q], { stdio: "ignore" });
const { LINES: L } = await import("./spatial-studies.mjs");
for (const s of [...SINGLES, ...SEQUENCES]) { if (only && !s.id.startsWith(only)) continue;
  const f = path.join(live, s.id + ".html"); fs.writeFileSync(f, scenePage({ id: s.id, name: s.name, osm: ["porto", "santarem"], lines: L, states: s.states }));
  if (s.frames) s.states.forEach((_, i) => shot(f, `?s=${i}`, path.join(out, `${s.id}-f${i + 1}.png`))); else shot(f, "?s=0", path.join(out, `${s.id}.png`)); console.log(s.id); }
for (const m of MOTIONS) { if (only && !m.id.startsWith(only)) continue; const f = path.join(live, m.seq + ".html");
  fs.writeFileSync(path.join(live, m.id + ".html"), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${m.seq}.html?play=${m.play.join(",")}">`);
  const p = m.play, fr = p.length === 2 ? [[p[0], p[1], 0], [p[0], p[1], 250], [p[0], p[1], 500], [p[0], p[1], 750], [p[0], p[1], 2000]] : [[p[0], p[1], 0], [p[0], p[1], 450], [p[0], p[1], 2000], [p[1], p[2], 450], [p[1], p[2], 2000]];
  fr.forEach(([a, b, ms], i) => shot(f, `?from=${a}&to=${b}&ms=${ms}`, path.join(out, `${m.id}-f${i + 1}.png`), 2500)); console.log(m.id); }
fs.writeFileSync("spatial.json", JSON.stringify({ singles: SINGLES.map(({ states, ...r }) => r), sequences: SEQUENCES.map(({ states, ...r }) => r), motions: MOTIONS }, null, 1));
