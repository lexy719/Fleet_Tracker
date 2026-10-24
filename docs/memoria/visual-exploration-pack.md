---
name: visual-exploration-pack
description: Detached visual exploration (2026-10-07): 73 judged studies in docs/visual-exploration, top-10 + 13 primitives; how to regenerate
metadata:
  type: project
---

On 2026-10-07 the user asked for a pure visual exploration (no product or lab changes): 40–60+ studies judged KEEP/MAYBE/REJECT, harshly. Delivered to `docs/visual-exploration/` (studies/*.png, kit/ generator, 100-page PDF, also copied to Downloads). 15 KEEP / 31 MAYBE / 27 REJECT, including 14 existing lab states as the E-series.

Top 10: R-02 Marey km×time, D-05 legality→km, V-01 annotated elevation, X-01 logic wiring, R-03 strip-map corridor, O-09 portrait map+ledger, D-01 legal bands on clock, X-03 missing fact as gap, V-06 clearance portal, O-05 latitude schematic. Primitives P1–P13 are defined in kit/report.mjs. Avoid: landscape fullscreen Portugal maps, content-left/map-tile-right, white cards on map, tables as destinations.

**Why:** the user wants future integration to start from these primitives instead of the current panel layout.
**How to apply:** when integrating, reference study IDs; regenerate with `node build.mjs` / `node report.mjs` in docs/visual-exploration/kit. The user expects harsh judging (the first pass at 30/59 KEEP was too lenient). Related: [[fleetos-environment-lab]]

Round 2 (connections, 2026-10-07): docs/visual-exploration/connections (C-01..24 + M-01..04, kit/connect-*.mjs, build-connect.mjs, report-connect.mjs).
Round 3 (spatial workspace, 2026-10-07): docs/visual-exploration/spatial. Engine kit/spatial.mjs (persistent map: Natural Earth + OSM Porto/Santarém in geo-src → geo3.json; camera = CSS transform; blocks move by id; ?s=n static, ?from=a&to=b&ms=t deterministic scrubbed motion frame). Studies kit/spatial-studies.mjs; build-spatial.mjs; report-spatial.mjs. Gotchas: headless screenshots of live CSS transitions are stale (use getAnimations pause/seek); hide OSM while the camera moves; time axes must run in the direction of travel (north ⇒ up). Overpass needs a User-Agent; Coimbra fetch failed (busy).
Round 4 (zero-base, 2026-10-07): docs/visual-exploration/zero (66 studies ZD/ZR/ZV/ZT/ZF/ZX/ZO + 14 signature refinements ZS-*; kit/zb-*.mjs, build-zb.mjs, report-zero.mjs → FleetOS-Round4-Zero-Base.pdf). Winners: ZD-09 day-as-road, ZR-01 string chart (+vertical corridor), ZV-01 drawing sheet, ZT-08 decision fork, ZF-06 receipts of events, ZX-04 two futures of a missing fact, ZO-02 latitude metro. Shared axes: km / clock / latitude; grey normal, colour exception (ISA-101).
