# FleetOS platform plan — own map, own truck routing, weekly planning

16 October 2026 · decision document · supersedes the 2026-10-11 strategy "Project 2 on top of TomTom routing"

## Goal

FleetOS becomes the carrier operating system for Iberia (Portugal + Spain): office staff plan a whole
week automatically with fewer empty kilometres, every route is legal for that truck on that date, and
every stop — customer gate, pump, parking — sits exactly where the truck has to go.

What makes it a product others cannot copy is not the map. It is **truck knowledge**: which roads a
40-tonne truck may use on a given date, where the truck gate of each warehouse is, which pumps a truck
can enter and at what price, and how long each leg really takes. Google and TomTom know where things
are; FleetOS knows how a truck gets there and when.

## What already exists (keep, do not rewrite)

| Layer | Where | State |
|---|---|---|
| Operations core (jobs, fleet, drivers, trailers, customers, sites, documents, events) | `src/application`, `src/domain`, `src/repositories` | Working, persisted (IndexedDB) |
| Fleet planner (assignment, empty/loaded km, cost, rests, restrictions) | `src/domain/planning` (`planFleet`) | Working; batch planning in the Studio |
| Driver-hours legality audit | `src/legal/driverLegality.ts` | Working; gates plans |
| Week simulator | `src/sim` | Synthetic evidence only (see claims policy) |
| Refuel engine + fuel prices | `src/fuel`, `src/domain/fuelPlanning` | Working; DGEG prices are research-only |
| Regulations / restrictions (PT seeded, timeline, re-evaluation) | `src/regulations` | Working on top of TomTom routes |
| Project 2 collectors (Lisbon closures, Oeiras WFS, IP alerts, municipal notices) | `src/ingestion` | Increment 1, uncommitted |
| FleetOS Studio (new design language) | `src/dev/fleetos-studio` | DEV route, connected to the real engines |

## Phases

### Phase 0 — One design language, one app (do first)

The Studio is the design language. The production app is rebuilt in it; the old labs are deleted.

1. **Snapshot.** Commit the current working tree on a branch so nothing below is irreversible.
2. **Extract the design system** from the Studio into `src/ui/studio/` (or similar):
   tokens (paper / ink / vermilion, Geist + Geist Mono, glass panels, shadows, easing), the map stage
   (`StageMap`, one MapLibre instance, overlays, tethers), FLIP morphing (`flip.ts`), panel / card /
   lens / fact / status components, and the layout rule "layout follows the task" (no layout toggles).
   Written down as a short design doc with do/don't examples.
3. **Move what the Studio borrows** from the old labs into proper homes before deleting:
   `world.ts` geometry helpers (`sliceKm`, `pointAtKm`, `haversineKm`, `kmOf`, types), `mapTypes`,
   `tomtomStyle`, `backend/runtime` (connected runtime), `fleetos-workspace/geo` (`PT_OUTLINE`).
4. **Delete the old labs**: `src/dev/fleetos-environment` (127 files incl. workspace) and
   `src/dev/fleetos-workspace`, their routes in `src/main.tsx`, their tests and CSS.
5. **Rebuild the app shell from scratch** in the Studio language: the map stage persists across the
   whole app; areas (Operação, Trabalhos, Expedição, Frota, Motoristas, Documentos, Conformidade,
   Inteligência, Definições) are lenses/panels on it, entity pages are panels that grow when the work
   needs room. Engines and application services are reused unchanged; only UI is rewritten.
6. **Port page by page**, each behind the same tests: Operação → Trabalhos/transport panel →
   Expedição/planning → Frota (truck, trailer) → Motoristas → Documentos (CMR, faturas) →
   Conformidade → Definições. Old pages are removed as each new one passes.

Done when: one app, one stylesheet system, no `src/dev/fleetos-environment` / `fleetos-workspace`,
all existing domain/application tests green, every old page's commands reachable in the new UI.

Effort (rough): 3–5 weeks for one developer with Claude; the riskiest part is keeping every command
(documents, archive, replan, cancel, invoice) reachable — checked with a command inventory.

### Phase 1 — Map and places foundation

1. **Own base map** from OpenStreetMap for Iberia (Protomaps/OpenMapTiles build → PMTiles), styled in
   the FleetOS language (paper default, a detailed "streets" style with full street names, satellite
   only from a licensed provider). Replaces the public OSM tile server (not allowed for commercial use).
2. **Station register**: official station lists (DGEG PT, MITECO ES) for completeness and names, matched
   to OSM `amenity=fuel` (Geofabrik extracts, not the public Overpass server) for exact position and
   forecourt outline, later fuel-card networks (DKV, UTA, AS24, Galp Frota…) for truck access and net
   prices. Each station gets a position confidence (`verified` / `osm` / `official only`). On the map:
   pump symbol, brand colour, name — stops land on the forecourt.
3. **Sites with truck gates**: every customer site pinned once at the truck gate (not the office door),
   with access notes; reused by every job. First-time addresses: own geocoder (Photon/Nominatim on the
   same OSM data) + Portuguese postcode database (CTT CP7, licensed — to confirm) for street-segment
   precision; the office confirms the pin once.

Done when: no TomTom or public-OSM dependency for display, search or stations; every pump on the map
is named and positioned with a stated confidence.

### Phase 2 — Own truck routing, with Project 2 inside it

1. **Routing engine**: GraphHopper (Apache-2.0) on Iberia OSM with truck profiles (height, width,
   length, weight, axle load, axles, ADR tunnel codes).
2. **Project 2 becomes routing input**, not a post-check: VCI ban (DL 155-A/2026), Spanish DGT heavy-
   vehicle calendar, ADR rules, dated future closures (TomTom ignored them for future departures),
   municipal restrictions → blocked or penalised edges by date and vehicle.
3. **Tolls**: own tables by vehicle class (PT concessions; ES remaining tolls).
4. **Speeds**: OSM defaults calibrated with recorded trips; later learned from driver-app GPS.
5. **Proof before switch**: compare against the TomTom routes saved with confirmed plans (distance,
   time, restriction violations). TomTom stays as a second opinion until the numbers say otherwise.

Done when: on the comparison set our routes are legal for every truck and date and within an agreed
time/distance tolerance of TomTom; planner runs on our engine with no per-request cost.

### Phase 3 — Weekly automatic planning (less empty km)

1. Horizon 5–7 days instead of one: chain loads, find backhauls, reposition empty only when it pays.
2. Driver law across the week: 56 h/week, 90 h/fortnight, weekly rest, return home, night work.
   Every plan passes `driverLegality` before it is shown.
3. Fuel and tolls inside the cost (refuel engine on our routes, own toll tables).
4. Office control: lock jobs/assignments, compare plans, confirm in batches (Studio pattern).
5. Results reported per the claims policy: synthetic until a carrier's real load history validates.

Done when: on a real carrier's history (Bragança pilot, ~100 trucks) the weekly plan is legal and its
empty-km figure is measured against what they actually drove.

### Phase 4 — Execution loop (driver app, shipper portal)

Driver app: route, stops, which pump and how much, real GPS, arrival times; drivers report truck gates,
pump access, restrictions, blocked roads → feeds the station register, sites and routing. GPS traces
become learned speeds (own traffic). Shipper portal: live ETA for receivers (the Prozis problem).

### Phase 5 — Commercial readiness

Server (EU VPS + Postgres), multiple companies, accounts and roles, backups, monitoring; licensed data
in place of research-only sources; ODbL attribution; contracts for fuel-card data and postcodes.

## Data rights (blockers are legal, not technical)

| Data | Source | Commercial use | Plan |
|---|---|---|---|
| Base map, streets, roads, fuel POIs | OpenStreetMap | Yes (ODbL, attribution; share-alike only for distributed databases) | Phase 1–2 base |
| Station prices PT | DGEG API | **No** (portal ToS) | Research only; fuel cards / licensed feed |
| Station locations PT | DGEG WFS | CC BY 4.0 | Usable with attribution |
| Station list + prices ES | MITECO | To confirm | Check licence before release |
| IP live conditions / alerts | Infraestruturas de Portugal | **No** (site terms) | NAP Portugal registration |
| Municipal closures | Lisboa, Porto, Oeiras, … | Mixed (CC BY to blank) | Per source |
| Postcodes | CTT CP7 | Licensed | Buy |
| Satellite imagery | Esri / Mapbox / TomTom | Licensed | Buy or omit |
| Live traffic | TomTom / HERE / Google / PTV | Licensed | Optional; own learned speeds later |
| TomTom content | TomTom | Display/route live only, no storing (ToS 11.4) | Transitional |

## Open decisions

1. Phase 0 scope: delete both old labs (`fleetos-environment`, `fleetos-workspace`)? — proposed yes.
2. App rebuild shape: the Studio becomes the app shell (map stage persists, areas are lenses/panels) —
   proposed; alternative is restyling existing pages (less work, less coherent).
3. Satellite provider and whether it is needed at launch.
4. Pilot carrier data access (load history) for Phase 3 validation.
