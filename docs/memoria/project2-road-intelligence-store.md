---
name: project2-road-intelligence-store
description: Project 2 (Portugal Road Intelligence Store) is a separate product from FleetOS; Phase 1 source audit done 2026-10-10 with key rights findings
metadata:
  node_type: memory
  type: project
  originSessionId: c1f45b6e-5999-4d8f-aa29-16a703267b7a
  modified: 2026-10-11T11:31:37.175Z
---

Project 2 = part of the FleetOS backend (user corrected 2026-10-11, see [[product-lineup]]), publishing "what is true about PT road + fuel network" (provenance, freshness); FleetOS consumes it and owns route intersection/applicability/planning. Phase 1 research (no ingestion) delivered 2026-10-10 in docs/project2-research-phase1-portugal-source-audit.md.

Key findings to remember:
- DGEG station-level fuel prices: undocumented JSON at precoscombustiveis.dgeg.gov.pt/api/PrecoComb (~2,859 diesel stations, fresh) but portal ToS PROHIBITS commercial use; DGEG station-location WFS is CC BY 4.0 (no prices, no join key). No AdBlue anywhere official.
- IP live conditions: public ArcGIS MapServer behind servicos.infraestruturasdeportugal.pt "Trânsito em Tempo Real" (points only, looked ~24 days stale); IP website terms exclude commercial use.
- IP has a SEPARATE works-notice portal ("Alertas · Rodovia", servicos.infraestruturasdeportugal.pt/pt-pt/alertas-ips) on Drupal with anonymous JSON:API (/jsonapi/node/servicos_viajar_na_estrada): 203 notices, stable UUID/nid/vid, fresh (2026-10-09), but validity/location are free text, no geometry; same no-commercial ToS. Not the same data as the ArcGIS layers.
- NAP Portugal (IMT) RTTI/SRTI needs registration + admin approval — the compliant route; not yet pursued.
- Permanent HGV/ADR rules are legal text only (Portaria 281/2019, DL 155-A/2026 VCI ban, DL 132/2017).

- Municipal audit (docs/project2-research-phase1b-municipal-audit.md): only Porto (DATEX II, licence blank), Oeiras (WFS, CC BY, daily) and Matosinhos (ArcGIS, personal data exposed, no licence) have live machine-readable restrictions; Lisbon has works/events layers but stale restrictions CSV; no national aggregator (Waze for Cities is the closed de-facto one).

- National municipal discovery (docs/project2-research-phase1c-national-municipal-discovery.md + matrix CSV): tier A = Lisboa (live City Platform JSON API lisboa.city-platform.com/percursos/ws/app/public/traffic/closures/), Porto, Oeiras, Matosinhos (~11% pop); 60 munis expose traffic notices via WordPress REST; ~62% of munis publish something; parishes/CIMs/ports/AML-AMP not aggregators. Supersedes phase1b where they conflict.

- STRATEGY (decided 2026-10-11 with user): Project 2 = IBERIAN (PT+ES) road/fuel intelligence layered ON TOP of TomTom routing (FleetOS already sends truck dims + traffic=true). Value = what TomTom lacks: truck rules (VCI; Spain DGT annual >7.5t calendar in BOE PDF; ADR), DATED future closures (tested: TomTom only applies its closures for departure=now, ignores them for future departAt), closures TomTom misses (~60-64% overlap in Lisbon and Spain DGT), and per-station fuel prices (TomTom has 0 prices in PT). Empty-km reduction comes from FleetOS planning, not Project 2. TomTom ToS cl.11.4: no storing/DB from TomTom content — read live at routing time only.
- Spain sources: MITECO fuel REST API (11,516 stations, every 30 min, AdBlue ~2,955; licence to confirm); DGT NAP DATEX II v3.7 incidents (CC BY, no registration, 1-min, excludes Catalonia/Basque — SCT and DT-GV feeds on same NAP).
- Collector increment 1 built (uncommitted): parsers lisboaClosures/oeirasWfs/ipAlertasJsonapi/wpNotices + sources + relays; next agreed: generate sources from municipal matrix, auto geocoding, "soft avoid" gate tier (user approved concept), then ES fuel + DGT.
- Fuel Intelligence built 2026-10-11 (uncommitted): src/fuel (MITECO+DGEG parsers, run-length price history, IdbFuelStore "fleetos-fuel", corridor with segment grid, tripPrice, intelligence.ts), src/context/FuelContext.tsx (collects in-browser at checkEveryMin), src/domain/fuelPlanning/refuelPlanner.ts (DP over "virtual fuel" = fuel + consumed, merges stops into EU561 pauses, detour priced 30 €/h + 0.2 €/km disclosed). Wired into planningRouter (optional `fuel` arg) and JobRoutePlanner (RefuelPlanSummary in route details). Live Porto→Zaragoza→Madrid→Barcelona: corridor median 1.959 €/L vs old default 1.52 (default now 2.0); plan buys 490 L in ES during pauses, ~€259 vs naive fill-at-25%.

**Why:** rights, not tech, are the blocker; user wanted research strong enough to decide what to ingest first.
**How to apply:** treat DGEG prices and IP live layers as research-only until written permission; next steps are access requests (NAP, DGEG, IP, Porto licence) and CC BY base layers first. Related: [[road-intelligence-state]].
