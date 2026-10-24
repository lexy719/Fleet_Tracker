import fs from "node:fs";
const R = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const ex = (await import("./existing.mjs")).default;
const items = []; const add = (o) => items.push(o);
const exists = (p) => fs.existsSync("../" + p);
// Round 1
for (const s of [...R("studies.json"), ...ex]) add({ key: "r1-" + s.id, round: 1, group: s.fam, id: s.id, name: s.name, desc: s.reason, intent: s.intent, mine: s.verdict, imgs: ["studies/" + s.id + ".png"] });
// Round 2
for (const s of R("connections.json")) { const isM = s.id.startsWith("M"); add({ key: "r2-" + s.id, round: 2, group: s.pair, id: s.id, name: s.name, desc: s.idea, mine: null, imgs: isM ? [1, 2, 3, 4, 5].map(i => `connections/${s.id}-f${i}.png`) : [`connections/${s.id}.png`] }); }
// Round 3
const sp = R("spatial.json");
for (const s of sp.singles) add({ key: "r3-" + s.id, round: 3, group: s.fam, id: s.id, name: s.name, desc: s.reason, mine: s.v, sc: s.sc, imgs: [`spatial/${s.id}.png`] });
for (const s of sp.sequences) add({ key: "r3-" + s.id, round: 3, group: "Sequência " + s.arch, id: s.id, name: s.name, desc: s.reason, mine: s.v, sc: s.sc, frames: s.frames, imgs: s.frames.map((_, i) => `spatial/${s.id}-f${i + 1}.png`) });
for (const s of sp.motions) add({ key: "r3-" + s.id, round: 3, group: "Movimento", id: s.id, name: s.name, desc: s.idea + (s.reason ? " " + s.reason : ""), mine: s.v, sc: s.sc, imgs: [1, 2, 3, 4, 5].map(i => `spatial/${s.id}-f${i}.png`) });
// Round 4
for (const s of R("zero.json")) add({ key: "r4-" + s.id, round: 4, group: s.id.startsWith("ZS") ? "Ecrãs assinatura · " + s.dom : s.dom, id: s.id, name: s.name, desc: s.reason, mine: s.v, sc: s.sc, origin: s.origin, imgs: [`zero/${s.id}.png`] });
// Round 5
for (const s of R("layouts.json")) { const im = [`layouts/${s.id}.png`, `layouts/${s.id}@1199.png`, `layouts/${s.id}@1920.png`].filter(exists); add({ key: "r5-" + s.id, round: 5, group: s.fam, id: s.id, name: s.state + " · " + s.name, desc: s.reason, mine: s.v, sc: s.sc, imgs: im }); }
// Round 6
for (const s of R("office.json")) add({ key: "r6-" + s.id, round: 6, group: s.lang, id: s.id, name: s.name, desc: s.why + " " + s.model, mine: null, imgs: [`office/${s.id}.png`] });
const all = [...new Set(items.flatMap(i => i.imgs))];
const map = Object.fromEntries(all.map((p, i) => [p, `img/${p.replace(/[\/@]/g, "_").replace(".png", ".jpg")}`]));
for (const it of items) it.imgs = it.imgs.filter(exists).map(p => map[p]);
fs.writeFileSync("../site/manifest.json", JSON.stringify(items));
fs.writeFileSync("out/imgmap.json", JSON.stringify(Object.entries(map).filter(([p]) => exists(p))));
console.log(items.length, "items", all.length, "images");
