// node build-zb.mjs [prefix] → ../zero/<ID>.png + live html
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
import { page } from "./kit.mjs";
const all = []; for (const f of ["driver", "route", "vehicle", "transport", "docs", "restr", "op", "refine"]) if (fs.existsSync(`zb-${f}.mjs`)) all.push(...(await import(`./zb-${f}.mjs`)).default);
const only = process.argv[2], out = path.resolve("../zero"), live = path.join(out, "live"); fs.mkdirSync(live, { recursive: true });
for (const s of all) { if (only && !s.id.startsWith(only)) continue; const f = path.join(live, s.id + ".html"); fs.writeFileSync(f, page(s.id, s.name, s.html()));
  execFileSync("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1600,1000", "--virtual-time-budget=4000", `--screenshot=${path.join(out, s.id + ".png")}`, "file:///" + f.split(path.sep).join("/")], { stdio: "ignore" }); console.log(s.id); }
fs.writeFileSync("zero.json", JSON.stringify(all.map(({ html, ...r }) => r), null, 1));
