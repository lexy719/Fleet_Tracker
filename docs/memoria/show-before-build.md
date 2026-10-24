---
name: show-before-build
description: "For visual changes to the Studio, show images/PDF of the proposal before editing app code; never drop existing stuff on own interpretation"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ad5491a4-dffa-44db-83c9-02877e7fb9f6
  modified: 2026-10-19T12:47:43.082Z
---

Before putting a new visual behaviour into the real Studio, show it first as images or a PDF, and wait for the user's go-ahead. If a request is ambiguous ("aqueles zooms a preto e branco"), check the earlier artefact the user means (e.g. the first PDF) or ask; never reinterpret it as removing or replacing existing things (/combinar, the no-map palcos, the grey tone).

**Why:** on 2026-10-19 the user stopped an edit ("já ias foder tudo"). I had read "não a preto e branco" as "drop the no-map stages and the grey" when they only meant "bring the camera zooms from the first PDF into /mapa, in colour".

**How to apply:** for UI changes, first make mockups from the real app (headless Chrome + CDP; camera can be driven from outside by finding the MapLibre Map via Runtime.queryObjects on the vite maplibre-gl module), send a PDF, and only then edit code. Related: [[studio-keep-design-consult]], [[fleetos-cinema-direction]]
