// node build-r5.mjs [prefix] → ../layouts/<ID>.png (1440×900) + responsive @1199/@1920 + dynamic frames
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
import { pageAt } from "./r5-kit.mjs";
const L = []; for (const f of ["a", "b", "dyn"]) if (fs.existsSync(`r5-${f}.mjs`)) L.push(...(await import(`./r5-${f}.mjs`)).default);
const RESP = ["W-02", "W-08", "W-27"], SIZES = { 1199: 800, 1440: 900, 1920: 1080 };
const only = process.argv[2], out = path.resolve("../layouts"), live = path.join(out, "live"); fs.mkdirSync(live, { recursive: true });
const shot = (html, name, w, h) => { const f = path.join(live, name + ".html"); fs.writeFileSync(f, html); execFileSync("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--window-size=${w},${h}`, "--virtual-time-budget=4000", `--screenshot=${path.join(out, name + ".png")}`, "file:///" + f.split(path.sep).join("/")], { stdio: "ignore" }); };
for (const s of L) { if (only && !s.id.startsWith(only)) continue;
  if (s.frames) s.frames.forEach((fr, i) => shot(pageAt(1440, 900, s.id, `${s.name} · ${i + 1}/${s.frames.length}`, fr.html(1440, 900)), `${s.id}-f${i + 1}`, 1440, 900));
  else { shot(pageAt(1440, 900, s.id, s.name, s.html(1440, 900)), s.id, 1440, 900); if (RESP.includes(s.id)) for (const w of [1199, 1920]) shot(pageAt(w, SIZES[w], s.id, s.name, s.html(w, SIZES[w])), `${s.id}@${w}`, w, SIZES[w]); }
  console.log(s.id); }
fs.writeFileSync("layouts.json", JSON.stringify(L.map(({ html, frames, ...r }) => ({ ...r, frames: frames ? frames.map(f => f.label) : undefined })), null, 1));
