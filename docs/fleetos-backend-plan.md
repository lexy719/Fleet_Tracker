# FleetOS backend plan — one backend for FleetOS, the driver app and the shipper portal

22 October 2026 · decision document · replaces the map and "Project 2" parts of `fleetos-platform-plan.md` and section 4–5 of `fleetos-visao-geral.md` (the name "Project 2" is retired: road and fuel intelligence is simply part of the backend). Evidence for every map/routing decision is in `backend-map-quality-test.md`.

## Promise

**The main promise is a better week, not a better single route.** Today a dispatcher assigns jobs one at a time, first come first served: the job near Madrid goes to whoever finished first, so the driver still in Madrid gets sent to Gibraltar because it is the only job left. Drivers stop with an hour of driving time unused, because the next job does not fit. Trucks run empty between jobs.

FleetOS plans **the whole week, for all drivers and all jobs together**, at the start of the week and again whenever something changes:

- **Fewer empty kilometres:** each job goes to the truck that will be nearest when it becomes free, and loads are chained with backhauls, so trucks drive from a drop to the next pickup instead of driving home empty.
- **Less lost time:** the plan knows every driver's remaining hours (day, week, fortnight) and fits jobs into them, so a driver is not left with 30–60 minutes nobody can use.
- **More jobs with the same fleet:** the time and kilometres saved become room for extra jobs, which the carrier can accept without adding trucks.
- **Less fuel:** fewer kilometres, plus filling at the cheapest pump on the route during the legal break.
- **Every route legal and exact:** legal for that truck on that date, ending **at the right truck gate**. The backend never sends a driver to a wrong place without saying so.

How much a carrier saves is measured on its own trip history, not promised in advance (simulator results are synthetic evidence only).

## Market focus: Iberian long-haul first

**First clients:** Portuguese-based carriers doing **Portugal ↔ Spain and long national trips** — usually the bigger companies (some, like Torrestir, also do local work). Long-haul runs on motorways, national roads and industrial zones, where our OSM routing is already proven.

**Not first:** local distribution (villages, town centres, many short drops). It needs better street-level routing and restriction data, which grows from the AI collectors and driver reports. Trailer swaps (drop and hook) come with that later stage.

**What these trucks carry** — Portuguese hauliers' international road freight 2024 (Eurostat, total minus national; 15.5 bn tonne-km, overwhelmingly to/from Spain):

| Goods (NST 2007) | Share of tonne-km | What it means for equipment |
|---|---|---|
| Food, beverages, tobacco | 14% | Reefers (fresh/frozen) and dry food on curtainsiders |
| Transport equipment (car parts) | 11% | Curtainsiders/megas, just-in-time slots at car plants, returnable racks |
| Agriculture, forestry, fish | 11% | Reefers, curtainsiders |
| Grouped goods (groupage) | 10% | Several jobs in one trailer — part loads |
| Unidentified goods | 8% | — |
| Wood, cork, paper | 7% | Curtainsiders, often weight-limited |
| Non-metallic minerals (tiles, glass, ceramics) | 6% | Heavy: weight runs out before space |
| Furniture and other manufactured | 5% | Volume-limited: megas |
| Chemicals, plastics, rubber | 5% | Some dangerous goods (ADR) |
| Basic metals (steel coils, profiles) | 4% | Coil-well trailers, flatbeds, axle-load care |
| Transport equipment returns (empty pallets, racks) | 4% | Return loads |

**Equipment model, in order:** standard curtainsider (13.6 m, 33 euro pallets) and reefer first; mega and coil-well trailers next; tankers and specialised later.

**Weight limits depend on the trip** (Orden PJC/780/2025; [ANTRAM](https://antram.pt/conteudo/4285-transporte-internacional-entre-portugal-e-espanha-mantem-limite-das-40-toneladas)): since 23 October 2025 Portugal and Spain both allow **44 t** for domestic trips (including Spanish cabotage by Portuguese carriers), but **Portugal ↔ Spain cross-border trips stay at 40 t** under EU Directive 96/53/EC. The planner applies the limit per leg.

What makes it hard to copy is not the map. It is truck knowledge that grows every day: municipal rules read by AI agents, official sign inventories, dated works and closures, and reports from every FleetOS driver.

## Decisions taken

| Topic | Decision | Why (evidence) |
|---|---|---|
| Map the user sees (office + driver app) | **Google Maps** roadmap (no satellite — blocked for EEA in Google's tile API); our routes, gates, pumps drawn on top | Current, complete-looking map; EEA terms since 8 July 2025 allow Google content with non-Google services (to confirm in contract) |
| Addresses and company search | **Google Places** (UI Kit where details sit next to a map); store `place_id` + our confirmed gate pin | TomTom put 1 in 7 addresses >5 km off; Google finds companies by name; Google also errs without postcode |
| Aerial view for confirming gates | DGT 25 cm orthophotos 2025 (PT, CC BY) and PNOA (ES, CC BY) | Free, commercial use allowed |
| Routing | **Our own truck routing on OpenStreetMap** (GraphHopper or similar), never Google/TomTom routing | Google sells no road graph and routes trucks as cars outside the US; OSM matched TomTom distance on long trips (−0.5% PT, −0.3% ES); 14 of 17 Google pins reached |
| Turn-by-turn in the driver app | **Our navigation** (our route, our rerouting) on the Google map, with **Google street names** fetched live per turn | Google's Navigation SDK only follows Google routes; reverse-geocoding the GPS point gives wrong street names |
| Truck restrictions | **Not trusted from OSM** — built from AI agents, official inventories and driver reports | OSM holds 16% of Madrid's 601 official truck signs |
| Driver reports | **Waze-style, voice first**: one button → speech → AI → app reads it back → driver confirms by voice | Phone is the navigation screen; camera sign detection dropped |
| AI engine for reading notices/rules | **Claude Haiku 5.5 via batch** for daily extraction; stronger model only for hard cases and source discovery; provider-swappable interface | ≈ $6–55/month at 500–5,000 notices/day (estimate); cost does not grow with clients |
| Live traffic | Later. TomTom traffic for testing; speeds learned from driver GPS; buy a feed only if same-day ETAs need it | No open flow data in PT; ES only incidents + city sensors |
| TomTom | Comparison and traffic test only, during the transition. **Never copy its geometry into our map** | Licence + EU database right; comparisons only point where to look |

## Dependencies and exit routes

Rule: **rent the commodity, own the knowledge.** No single supplier may be able to stop FleetOS, and everything that makes FleetOS valuable is stored in our own database. Every supplier sits behind our own interface, so swapping it does not touch the rest of the code.

| Dependency | What we use it for | Risk | What stays ours | Exit route |
|---|---|---|---|---|
| OpenStreetMap | Road data | Low: open licence, our own copy forever | Our copy, our fixes, our layers | Keep our copy; OSM stopping would only stop updates |
| GraphHopper | Route calculation | Low: open source, we keep the code | Truck profile, rules, layers | Valhalla or OSRM behind the same interface; fork if ever needed |
| Google Maps (display) | Map the user sees | **Medium-high:** price and terms can change (EEA terms changed July 2025) | Everything drawn on top | MapLibre renderer (already used in Studio and driver app) with Mapbox, TomTom or our own OSM tiles |
| Google Places (search) | Finding addresses and companies | **Medium-high** | Confirmed gate pins (our coordinates), site history | Mapbox / HERE search, or Photon on OSM; known sites never need search again |
| Google street names in instructions | Names matching the map | Medium | — | OSM names (same source as the route) |
| Claude (AI extraction) | Reading notices and rules | Medium | Extracted records, quotes, review history | Another model behind the same interface; text rules as fallback |
| TomTom | Comparison, traffic test | Low: transitional | — | Drop it; learned speeds from driver GPS |
| Public sources (IP, DGT, DGEG, MITECO, municipalities) | Rules, works, prices | Medium: terms change (DGEG changed Oct 2026) | Stored snapshots and history | Many sources, none critical alone; licensed feeds where needed |
| Server (EU VPS + Postgres) | Hosting | Low: standard, portable | Everything | Any EU provider |

**The real risk is Google.** It is used only where it is easy to replace: display and search. Routes, sites, restrictions, reports, plans and learned speeds never depend on it. Before launch, run one test with Google switched off (MapLibre + alternative search) to prove the exit route works.

## Architecture

```
                 ┌──────────────── Sources ────────────────┐
  IP works portal · DGT NAP (incidents, LEZ, panels) · SCT · DT-GV · Diário da República 1.ª/2.ª-H
  BOE + provincial bulletins · municipal sites (308 PT + ES cities) · official sign inventories
  DGEG + MITECO fuel · OSM (weekly) · driver reports + GPS
                 └───────────────────┬─────────────────────┘
                                     ▼
   Collectors (fetch, snapshot, change detection)  →  AI extraction (Haiku batch, quotes verified)
                                     ▼
   Trust gate + review queue  →  Road & fuel store (Postgres + PostGIS, provenance, freshness)
                                     ▼
   Routing engine (OSM graph + truck profile + restriction/closure/report layers by date & vehicle)
        │                    │                         │
   Planner (week,       Navigation service        Sites & places
   empty km, hours,     (route, instructions,     (Google place_id,
   fuel, tolls)         Google street names,      confirmed truck gate)
        │               rerouting)                     │
        ▼                    ▼                         ▼
   FleetOS office       Driver app               Shipper portal
                        (voice reports,          (order transport, live
                         GPS → learning)          truck position + ETA)
```

One server in the EU (VPS + PostgreSQL/PostGIS), multi-company, serves all three products.

## Code we keep (already working, moves to the server)

| Piece | Where today | What changes |
|---|---|---|
| Collectors, snapshots, freshness, trust gate, coverage by municipality (CAOP) | `src/ingestion` | Run on the server on a schedule; store in Postgres instead of browser IndexedDB |
| AI notice extraction with verbatim-quote checks | `src/ingestion/ai/noticeExtraction.ts` | Connect Haiku batch; never activates a rule without review |
| Fuel collectors, price history, corridor, refuel planner | `src/fuel`, `src/domain/fuelPlanning` | Server-side; update DGEG licence text (commercial ban removed Oct 2026) |
| Restrictions, timeline, compliance evaluation | `src/regulations` | Becomes routing input (blocked/penalised roads by date & vehicle), not only a post-check |
| Fleet planner, driver-hours legality | `src/domain/planning`, `src/legal` | Uses our engine's times/distances instead of TomTom |
| Driver routing endpoint | `server/driverRouting.ts` | Rebuilt on our engine |

## Phases

Each phase ends with a measured test, not an opinion.

### Phase A — Server foundation
1. EU VPS, PostgreSQL + PostGIS, backups, accounts per company.
2. Move collectors (road + fuel) to scheduled server jobs; one store for all products.
3. Fix the slow test suites (geometry tests time out under load).

**Done when:** collectors run unattended for a week; every record shows source, time and freshness.

### Phase B — Our truck routing on OSM
1. Iberia OSM imported weekly; truck profile: prefer motorways/national roads, avoid narrow and residential streets unless the destination is there, height/weight/width/length/axle/ADR inputs.
2. **Sites with truck gates**: the route ends at the gate; the last metres to a confirmed gate may use private roads (Sonae Maia case).
3. Our own speeds per road type, tuned against TomTom without traffic, later against driver GPS.
4. Regression harness from the map tests (240 trips + Google pins) runs on every engine change.
5. Automatic gap detection: detours far above normal for the trip, sites without a road near the gate.

**Done when:** on the test set and on a pilot carrier's history, distances are within an agreed margin of TomTom/Google, every site route ends at its gate, and no route crosses a known restriction.

### Phase C — Restrictions and works, by AI agents
1. National sources first: IP works portal (live, 50 notices today), DGT incidents (Spain except Catalonia/Basque), SCT, DT-GV, DGT low-emission zones, DGT annual truck calendar (BOE), VCI and other legal texts.
2. Official sign inventories: Madrid (tested), Barcelona, Pamplona, Navarra, Gipuzkoa, Valencia province, Santander, Cáceres, Águeda; check city portals outside the national catalogue (Zaragoza, Bilbao, Málaga, Sevilla…).
3. **Every municipality**: start from the 308-row PT discovery matrix; agents find each municipality's traffic notices and regulations (Diário da República 2.ª série parte H, municipal sites, PDFs) and turn them into *street + restriction + dates + source*. Spain: big cities and logistics areas first, then by where clients drive.
4. AI extraction: Haiku batch; text rules as fallback when the API is down (notices wait, clients are not affected); review queue for anything that would block a road.
5. Road works located on the map: road + km (e.g. "EN253 km 27–34") placed on IP's road network.

**Done when:** a weekly coverage report shows, per municipality, what is known, when it was last checked and what is missing — never "no restrictions" where we simply have no data.

### Phase D — Addresses, sites and the map
1. Google Maps (office + driver app), Places search, Street View for gate checks.
2. New address flow: Google proposes (with postcode) → municipality check → office taps the gate on map/aerial → stored as our site (place_id + gate pin). Known sites are recognised next time automatically.
3. Coordinates and pasted map links accepted directly.

**Done when:** no job can be dispatched to an unconfirmed gate; repeat stops need no manual step.

### Phase E — Driver app connection
1. Navigation service: our route, instructions with Google street names, rerouting on our server.
2. **Voice reports**: button (screen or steering-wheel Bluetooth) → speech → AI → spoken read-back → "sim/não". GPS taken at the button press.
3. Confirm-on-approach ("Altura 3,8 m ainda aqui?"), driver trust score, temporary reports expire.
4. Passive learning from GPS: detours/turn-backs, roads we lack, real speeds, real gate positions, real time at docks.
5. Reports kept as our own layer (point + direction + type), matched to roads at routing time (ODbL care).

**Done when:** reports from pilot drivers change routing within minutes after confirmation.

### Phase F — Weekly planning that saves money (the core product)
1. Planner on our engine plans **all drivers × all jobs for the week** at once, not job by job: who is free where and when, chained loads and backhauls, empty-km reduction.
2. Driver law across the week inside the plan (daily/weekly/fortnight hours, breaks, weekly rest, return home), so remaining hours are used, not wasted.
3. Spare capacity shown to the office: "these trucks have room for N more jobs on these days and lanes".
4. Fuel and tolls inside the cost of every option; refuel stops placed in legal breaks.
5. Re-plan when reality changes (delay, new job, cancelled job, closure), keeping locked jobs fixed.
6. Batch confirmation in the office (Studio pattern).

**Done when:** on the pilot carrier's real history the weekly plan is legal and its empty-km figure is measured against what they actually drove (synthetic simulator results are never presented as promises).

### Cargo, trailers and the real trucking day (part of Phase F)

A truck rarely does "one job, full trailer". It leaves Porto, picks up a part load, adds another, drops one, picks up again; on Monday it pulls a reefer, on Tuesday a curtainsider. The planner must plan what is **in the trailer**, not only where the truck is.

**Already in the planner** (`src/domain/planning/feasibility.ts`): job weight vs truck/trailer payload, gross vehicle weight, pallet count, dangerous goods (ADR class, driver certificate, tanker qualification), refrigerated cargo and temperature range, trailer type per job, trailers with their own position and availability.

**To add:**
1. **Several jobs in one trailer (part loads / groupage):** load on board after every stop; weight, pallets, load metres and volume never exceeded at any point of the trip.
2. **Loading order:** what is delivered first must be loaded last (unless side-loading); jobs that cannot share a trailer (food + chemicals, temperatures that differ, customer exclusivity).
3. **Cargo shape:** load metres, stackable or not, long goods, heavy point loads such as **steel coils** (need a coil-well trailer and proper securing), machinery, bulk.
4. **Axle weight and load position:** heavy cargo placed so no axle is overloaded, which also changes which roads (weight limits) the route may use.
5. **Weight limit per leg:** 40 t on Portugal ↔ Spain legs, 44 t on domestic legs (PT, ES cabotage).
6. *Later, with local distribution:* **trailer changes (drop and swap)** — the plan tracks where every trailer is, empty or loaded, and its next use.
7. **Equipment and documents per job:** tail-lift, straps/chains, pallet exchange, ADR kit, CMR, customs for non-EU legs, weighing.
8. **Customer rules:** time windows, booking slots, waiting time at docks (learned from GPS), who loads (driver or warehouse).

These rules come from real carriers, not guesses: see the questionnaire `perguntas-transportadora.md`.

### Phase G — Pilot and commercial readiness
1. Pilot carrier (Bragança, ~100 trucks): import 3–6 months of trips, route them all, fix every flagged spot **before** the demo.
2. Contracts and confirmations:
   - Google EEA terms for our use;
   - TomTom commercial terms if traffic is kept;
   - DGEG written confirmation of commercial reuse;
   - MITECO licence;
   - NAP Portugal registration;
   - ODbL attribution and share-alike handling;
   - GDPR (driver GPS, voice);
   - data-sharing clause: safety reports shared across clients.
3. Shipper portal on the same server: order transport, live truck position and ETA.

## Open items to confirm

| Item | With whom |
|---|---|
| Google EEA terms cover our map + navigation + Places use; cost at pilot volume | Google Maps Platform contract |
| Google street names per turn: allowed live use, cost | Google |
| DGEG commercial reuse in writing (portal text changed 10–17 Oct 2026) | precoscombustiveis@dgeg.gov.pt |
| MITECO dataset licence wording | MITECO / datos.gob.es |
| TomTom traffic commercial terms (only if kept) | TomTom sales |
| ODbL: our road fixes back to OSM; reports as separate layer | OSM licence guidance |
| Voice/GPS processing under GDPR; one-tap use while driving | Lawyer (PT + ES) |
| Pilot carrier's trip history | Pilot carrier |

## Next steps (this week)

1. Google Maps Platform key (EU billing) in `.env` as `GOOGLE_MAPS_API_KEY` — the founder creates it.
2. Server choice (EU VPS) and Postgres/PostGIS schema for sources, records, sites, reports.
3. GraphHopper on Iberia OSM locally with a first truck profile; run the 240-trip and Google-pin regression against it.
4. First 100 real IP notices through Haiku vs current text rules — measure accuracy and cost.
