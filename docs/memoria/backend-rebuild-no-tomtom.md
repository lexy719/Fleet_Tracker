---
name: backend-rebuild-no-tomtom
description: "2026-10-21 — \"Project 2\" name retired; road/fuel intelligence fused into one FleetOS backend rebuilt from scratch, no TomTom routing (TomTom at most for live traffic)"
metadata:
  node_type: memory
  type: project
  originSessionId: ab400f4d-5bf5-4827-bc7a-00e48cce52d1
  modified: 2026-10-23T17:32:29.859Z
---

On 2026-10-21 the user retired the name "Project 2". Road + fuel intelligence is now just part of the FleetOS backend, and the backend is to be developed again from the start: own routing (no TomTom routing), TomTom allowed only for live traffic if no alternative exists. A separate chat does the frontend (src/studio); this backend chat must not touch studio files.

Licence facts checked 2026-10-21:
- DGEG station prices: commercial ban ("É proibida a sua utilização para fins comerciais") was REMOVED between 2026-10-10 and 2026-10-17 (Wayback snapshots). Current text: free use; reuse must credit DGEG, show date-time of last price update, reproduce faithfully. Contact precoscombustiveis@dgeg.gov.pt. src/fuel/sources.ts still quotes the old ban.
- MITECO (Spain prices): Ley 37/2007 general reuse conditions (commercial OK): don't alter, don't distort, cite source, give last-update date; ministry may block abusive/robotic access.
- Traffic: no open live flow data for PT; ES only DGT incidents/panels (CC BY) + city sensors (Madrid CC BY). Network-wide flow = buy (TomTom/HERE/INRIX) or learn from own driver-app GPS.

Architecture decided 2026-10-22 (evidence in docs/backend-map-quality-test.md): Google Maps for display (roadmap, no satellite in EEA), Places/addresses, Street View, and street names in our turn-by-turn; OUR truck routing on OSM (Google sells no road graph; its Navigation SDK only follows Google routes; Google truck routing US-only). OSM roads fine (long trips = TomTom distance; 4 local gaps / 240 trips) but OSM truck restrictions are NOT trusted: only 16% of Madrid's 601 official truck signs. Restrictions come from: AI agents reading every municipality's rules + official sign inventories (Madrid, Barcelona, Pamplona, Navarra, Gipuzkoa, Valencia prov., Santander, Cáceres; PT only Águeda 2020) + a Waze-like driver report system (user's idea: continuously grows our own OSM-based Iberian truck map = the moat). Driver-app camera sign detection REJECTED by user (phone is the nav screen by the windscreen). Never copy TomTom/Google geometry into our map (user asked; declined) — comparisons only point where to look.

Scope decided 2026-10-22: first clients = Portuguese-based carriers doing PT↔ES + long national trips (bigger companies); local distribution (villages, many drops) and trailer swaps come later. Planner must add: several jobs per trailer, loading order, cargo shape, axle weight, per-leg weight limit (40 t PT↔ES, 44 t domestic since 23 Oct 2025). Equipment first: curtainsider + reefer. Plan: docs/fleetos-backend-plan.md; carrier questionnaire docs/perguntas-transportadora.md.

Own engine running 2026-10-22: GraphHopper 11.1 in C:\Users\manue\fleetos-routing (outside repo), Java 21 in jdk/, Iberia = Geofabrik PT+ES merged with Osmosis (iberia.osm.pbf), graph-iberia/ (8.3M nodes), profiles car + truck (custom_models/fleetos_truck.json, LM, no CH; per-request custom models may only increase weights, distance_influence ≥ 40). Start: java -Xmx8g -jar graphhopper-web-11.1.jar server config.yml → localhost:8989. Current graph = graph-iberia-v3 (curvature, urban_density, SRTM slope); best profile = truck3 (custom_models/fleetos_truck3.json, Test 9: pins ±10% of Google 83%, mountain times ≈ TomTom truck). Rebuild ~45 min awake time; PC sleep pauses it — use request_keep_awake. Older graphs graph-iberia / -v2 can be deleted to free ~5 GB. Results in docs/backend-map-quality-test.md Test 6. Founder now leans to OSM display map (MapLibre) + Google Places pins (2026-10-22, PT message) — frontend chat had saved "Google Maps display"; flag the conflict.

**Why:** user wants one backend, own routing, fewer third-party dependencies.
**How to apply:** say "backend" / "road & fuel intelligence", not "Project 2". Supersedes the TomTom-based parts of [[project2-road-intelligence-store]]; see [[fleetos-studio]] for the platform plan.
