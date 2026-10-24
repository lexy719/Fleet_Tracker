---
name: check-overlaps
description: "After any layout change in the Studio palcos, measure text overlaps in every layer/measure state before showing — not by eye"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ad5491a4-dffa-44db-83c9-02877e7fb9f6
  modified: 2026-10-21T21:33:30.248Z
---

When I add or move things in a palco (O dia / A estrada, Garagem, Combustível…), texts and elements often end up on top of each other. The user noticed this repeatedly (2026-10-21): "muitas vezes o texto ou certas coisas ficam em cima de outras… tens que verificar isso".

**Why:** each new layer adds labels in the same lanes; one screenshot of one state hides collisions in the others.

**How to apply (since 2026-10-21, palcos v2):** run `scripts/studio-overlaps.mjs`, a copy of the scratchpad `overlaps2.mjs`. It checks every text node and line mark in 17 states: the map with the sidebar and the names on the map, Viagens ×3 × Horas/Km, Garagem ×3, Perfil ×3. It needs headless Chrome on port 9333 and the dev server on 5174. Mockups use `mock/mockcheck.mjs` + `eng.js`.

Older method: run the CDP overlap checker (scratchpad `overlaps.mjs`: bounding rects of all visible text in `.dy-stage` for every combination of layers × Horas/Km) and fix until it reports zero, before sending prints. Related: [[show-before-build]], [[palcos-architecture]]
