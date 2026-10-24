---
name: google-maps-decision
description: Display map stays free OSM (MapLibre); Google only for address lookup, which the user handles in the backend elsewhere. Google Maps display was considered on 2026-10-22 and dropped the same day.
metadata:
  type: project
---

**Decision, 2026-10-22, final:** the map stays **free OSM** on MapLibre. The user briefly considered Google Maps for display, then reversed it the same day.

- Google is used only for **address lookup** (Google Addresses), which the user is building in the backend elsewhere. Don't touch it from here.
- **Why OSM:** with OSM "dá para editar visualmente de todas as maneiras" (it can be styled any way), and the user loves the OSM 3D building outlines when zooming.

**How to apply:**
- Keep the /v2 MapLibre work.
- Today the base style is still TomTom (`environmentTomTomStyle`). Only the buildings come from OpenFreeMap (OSM). Moving the base to an OSM/OpenFreeMap style is the natural next step; check with the user before swapping.

Related: [[backend-rebuild-no-tomtom]], [[design-v2-direction]]
