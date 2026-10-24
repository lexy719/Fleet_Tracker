// Renders every study to out/html + ../studies/<ID>.png with headless Chrome.  node build.mjs [ID-prefix]
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
import { page } from "./kit.mjs";
const fams = ["op", "driver", "vehicle", "route", "restr", "docs"];
const all = [];
for (const f of fams) { if (fs.existsSync(new URL(`studies-${f}.mjs`, import.meta.url))) all.push(...(await import(`./studies-${f}.mjs`)).default); }
const only = process.argv[2];
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const htmlDir = path.resolve("out/html"), pngDir = path.resolve("../studies"); fs.mkdirSync(htmlDir, { recursive: true }); fs.mkdirSync(pngDir, { recursive: true });
const meta = [];
for (const s of all) {
  meta.push({ ...s, html: undefined });
  if (only && !s.id.startsWith(only)) continue;
  const file = path.join(htmlDir, `${s.id}.html`); fs.writeFileSync(file, page(s.id, s.name, s.html()));
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1600,1000", "--virtual-time-budget=4000", `--screenshot=${path.join(pngDir, s.id + ".png")}`, "file:///" + file.replace(/\\/g, "/")], { stdio: "ignore" });
  console.log("rendered", s.id, s.name);
}
fs.writeFileSync("studies.json", JSON.stringify(meta, null, 1));
console.log(all.length, "studies");
