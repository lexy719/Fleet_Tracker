---
name: driver-app-mockups
description: "Driver app (../fleetos-driver) mockup round 1, 2026-10-23 — which screens loved/rejected, how the mockups are rendered"
metadata:
  node_type: memory
  type: project
  originSessionId: ad5491a4-dffa-44db-83c9-02877e7fb9f6
  modified: 2026-10-24T00:24:54.850Z
---

Driver app mockups were done before the palcos/categories, at the founder's request. Brief: docs/app-motorista-brief.md plus docs/driver-app-spec.md.

**Round 1 (2026-10-23)**, 8 phones, verdict "fixe" overall:
- **Loved:** Navegação.
- **Liked:** the "a ouvir" orb, voice confirm, ask-on-pass, review-at-stop.
- **Rejected:** Chegada/portão, Abastecer and Horas, all fact-cards on an empty map.

**Why:** the founder wants the map and road to tell the story, with one strong UI gesture; see [[fleetos-design-taste]] and .claude/founder-taste.md.

**2026-10-23, later: app rebuilt from zero** in ../fleetos-driver.
- The old screens were moved to archive/old-ui-2026-10-23; src/ was untracked, so nothing was deleted.
- The new app is one DOM component, src/drive/DriveApp.tsx, rendered by src/app/index.tsx. It has 9 map scenes (nav, listen, confirm, arrive, review, drive, hours, fuel, ask) and the camera flies between them.
- The theme follows the scene clock.
- A small "◦" demo menu in the top-right corner switches scenes and theme.
- The `?scene=` URL parameter works on web.

**2026-10-24: turn by turn + a second route.**
- The navigation scene drives any NavRoute (story.navs), with maneuvers from the route's own guidance.
- Lamaçães → Brunhais (job j-demo-lamacaes-brunhais, src/api/demoBragaRoute.json) came from our own GraphHopper truck3 engine (localhost:8989).
- The /lab page has a "Rota de navegação" selector.
- The rules are in fleetos-driver/docs/design-language.md, which the reviewers read.

**2026-10-24, late: stops mockups (paragens), 6 phones.**
- Verdict: "tem que ser melhorado, mas tens algumas ideias interessantes", continued the next day.
- The board is drvmock/stopsmock.html in the old scratchpad (ad5491a4…).
- Next: ask which ideas are worth keeping, then redo. Not in the app yet.

**How to apply:**
- Redo the rejected three first, one at a time, before changing app code.
- Mockups are a live MapLibre board in the scratchpad (drvmock/index.html). It uses the exported FleetOS style and the app's real demo route (src/api/demoLocalRoute.json, Esperança → Lanhoso).
- Shots are rendered with shootmock.mjs via headless Chrome on port 9333.
- If the scratchpad is gone, rebuild:
  - export the style with `window.__liveMap.getStyle()` on /v2;
  - read road names from the OSM tiles (`querySourceFeatures` on transportation_name).
