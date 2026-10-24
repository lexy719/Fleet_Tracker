import fs from "node:fs"; import { scenePage } from "../spatial.mjs";
const lines = { j: { route: "faro__porto__fastest" }, done: { route: "faro__porto__fastest", k: [0, 282] }, vci: { geom: "vciPortoRing" } };
const sc = { id: "T", name: "test", osm: ["porto"], lines, states: [
 { map: { x: 0, y: 0, w: 1600, h: 1000, cam: { bbox: [36.9, -9.6, 42.2, -6.1] } }, lines: { j: "ahead", done: "done" }, pins: [{ route: "faro__porto__fastest", km: 282, mark: "truck", t: "J-4217", s: "km 282" }] },
 { map: { x: 0, y: 0, w: 1600, h: 1000, cam: { bbox: [41.13, -8.66, 41.19, -8.55] }, osm: ["porto"] }, lines: { j: "focus", vci: "restr" }, pins: [] }] };
fs.writeFileSync("../spatial/live/T.html", scenePage(sc));
