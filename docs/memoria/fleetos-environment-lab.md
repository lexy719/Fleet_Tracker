---
name: fleetos-environment-lab
description: DEV lab /__dev/fleetos-environment — 5.7I/5.7J/5.7K delivered by 2026-10-07; capture recipe; PDF report format; open items
metadata:
  node_type: memory
  type: project
  originSessionId: 2f155f1a-a07c-4588-ae3c-84b7480b6930
  modified: 2026-10-07T17:12:04.277Z
---

Phase 5.7I (instrument-driven workspace, attention-first base) was implemented by Claude on 2026-10-06/07 in `src/dev/fleetos-environment/fx/` + `world.ts`; report `docs/phase-5.7i-instrument-workspace.md`, screenshots `docs/phase-5.7i-review/`. User drives phases by pasting long Portuguese/English phase requests; save each verbatim-ish to `docs/phase-5.7x-*-request.txt` and prepend the contract to the lab `AGENTS.md`.

5.7J (2026-10-07) added fidelity: fx/VehicleDrawing.tsx (technical truck elevation + load plan), continuous Driver day, layered route journey, causal restrictions, object continuity (fx/continuity.ts), vehicle focus state. Report docs/phase-5.7j-instrument-fidelity.md.

After each phase the user wants a Portuguese A4 PDF report in Downloads like `FleetOS-5.7H-Relatorio-Visual-Completo.pdf` (cover + evidence table, contract/architecture/review pages, scene guide, one page per screenshot with description + metadata line + filename/SHA, galleries). Generator scripts: scratchpad report.py / report_j.py (reportlab, Segoe UI + seguisym for ✓✕→); metadata computed by replaying scene actions through guidedLayout in a temp vitest file.

Non-obvious working knowledge:
- Motion review: DEV `window.__fleetosLab.slow(6)` + timed CDP screenshots (headless screenshots are too slow for real-time frames).
- Screenshot capture: in-app Browser pane is usually hidden, so rAF/camera never runs there. Use headless Chrome via CDP: Chrome must be launched with PowerShell `Start-Process` (Node `spawn` fails to open the debug port); Node 22 global WebSocket drives `window.__fleetosLab.act/settled/specimen` (DEV-only hook in GuidedEnvironment).
- Map camera stalls if the rendered map radius differs from `layout.map.radius` (settle check) — never override map radius in CSS.
- Real road geometry lives in `src/regulations/__fixtures__/routeMatrix/*.json` ([lat,lng]) and `regulations/portugal/geometry/*` (VCI, CREP, IP3).

5.7K (2026-10-07) living workspace: facets per lens (state.facet), followable objects (relations.ts), in-place editing with previewed proposals (edits.ts, fx/Editors.tsx, fx/impact.ts; labWorld(state, preview=true)), spatial mode state.mapFull with lens-shaped inspectors (fx/Spatial.tsx), data-ix interaction classes (fx/living.css). Report docs/phase-5.7k-living-workspace.md + Downloads FleetOS-5.7K-Espaco-de-Trabalho-Vivo.pdf. Capture script: scratchpad capk.mjs (adds meta + retries + CDP timeouts).

- Never edit lab files while a headless capture runs: Vite reload yields blank screenshots/hangs. Production files are sometimes edited in parallel by others (also triggers reloads; 4 unrelated solver/perf test failures seen then).
- User rejects any dead click ("clico e nada muda"). Dead-click audit: scratchpad audit.mjs + seeds.json (clicks every visible clickable from seed states, diffs state/layout/text/camera); 579 clicks → 0 dead on 2026-10-07. Rail uses `{type:"lens"}` perspective rule (lensMatrix.test.ts). Re-run the audit after UI changes.
- User asked (2026-10-07) to go deeper next on real routes/timing (fixtures fastest/no_tolls, buildRouteTiming) — not yet done.

Open items: 5.7A–D files + most of GuidedSurfaces/ProductSurfaces are dead; real-time motion review pending; Driver/Truck anchors, URL state, Plan lens not built.

**Why:** next sessions continue visual/product work in this lab.
**How to apply:** follow lab AGENTS.md (5.7I contract on top); never integrate production state or commit unless asked. Related: [[phase-56b-architecture]]
