// Renders connection screens to ../connections/  (node build-connect.mjs [prefix])
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
import { page } from "./kit.mjs"; import A from "./connect-a.mjs"; import B from "./connect-b.mjs"; import M from "./connect-motion.mjs";
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const outDir = path.resolve("../connections"), live = path.join(outDir, "live"); fs.mkdirSync(live, { recursive: true });
const only = process.argv[2];
const shot = (file, png, budget = 4000) => execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1600,1000", `--virtual-time-budget=${budget}`, `--screenshot=${png}`, "file:///" + file.split(path.sep).join("/")], { stdio: "ignore" });
for (const s of [...A, ...B]) { if (only && !s.id.startsWith(only)) continue; const f = path.join(live, s.id + ".html"); fs.writeFileSync(f, page(s.id, s.name, s.html())); shot(f, path.join(outDir, s.id + ".png")); console.log(s.id); }
for (const m of M) { if (only && !m.id.startsWith(only)) continue; const f = path.join(live, m.id + ".html"); fs.writeFileSync(f, page(m.id, m.name, m.html(), m.css));
  // virtual time starts before fonts settle; frames sampled across the animation
  [300, 900, 1700, 3200, 6000].forEach((b, i) => shot(f, path.join(outDir, `${m.id}-f${i + 1}.png`), b)); console.log(m.id); }
fs.writeFileSync("connections.json", JSON.stringify([...A, ...B, ...M].map(({ html, css, ...r }) => r), null, 1));
