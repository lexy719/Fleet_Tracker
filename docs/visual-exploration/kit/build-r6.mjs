import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
const L = (await import("./r6.mjs")).default; const out = path.resolve("../office"), live = path.join(out, "live"); fs.mkdirSync(live, { recursive: true });
for (const s of L) { if (process.argv[2] && !s.id.startsWith(process.argv[2])) continue; const f = path.join(live, s.id + ".html"); fs.writeFileSync(f, s.html());
  execFileSync("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1440,900", "--virtual-time-budget=4000", `--screenshot=${path.join(out, s.id + ".png")}`, "file:///" + f.split(path.sep).join("/")], { stdio: "ignore" }); console.log(s.id); }
fs.writeFileSync("office.json", JSON.stringify(L.map(({ html, ...r }) => r), null, 1));
