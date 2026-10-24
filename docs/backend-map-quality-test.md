# Map and address quality test — Portugal and Spain

21 October 2026 · one-off measurement for the backend rebuild (no TomTom routing)

## Question

If FleetOS stops using TomTom for maps and addresses, how good are the free alternatives — and how good is TomTom itself — at the two things the driver app and planner need: putting an address on the right spot, and naming the street a truck is on?

## Method

- **Truth set:** 100 random Portuguese fuel stations (DGEG, official address + official coordinate) and 100 random Spanish ones (MITECO). Stations sit where trucks go: roadsides, industrial areas, villages.
- **Forward test:** geocode the official address as free text (`street, postcode locality`) and measure the distance to the official coordinate.
- **Reverse test:** at the official coordinate, ask each source for the street name and compare it with the street in the official address (token match).
- **Sources:** OpenStreetMap (public Nominatim), TomTom Search, CartoCiudad (Spain's official geocoder, Spain only).

## Results

| | OSM | TomTom | CartoCiudad |
|---|---|---|---|
| **PT — address found** | 44% | 97% | — |
| PT — within 100 m | 8% | 20% | — |
| PT — within 500 m | 31% | 53% | — |
| PT — more than 5 km off | 4% | **16%** | — |
| PT — street name at the point matches the official address | 53% | 56% | — |
| **ES — address found** | 27% | 97% | 15% |
| ES — within 100 m | 11% | 38% | 4% |
| ES — within 500 m | 18% | 53% | 11% |
| ES — more than 5 km off | 2% | **14%** | 0% |
| ES — street name at the point matches the official address | 45% | 58% | 54% |

TomTom matched a house-number point for 15% of Portuguese addresses and 32% of Spanish ones; the rest matched a whole street or a range.

## What it means

1. **No source turns a typed address into a reliable truck stop.** TomTom almost always returns *something*, but about 1 in 7 answers is more than 5 km away — confidently wrong. OSM is right more often when it answers, but it fails to answer most real-world addresses.
2. **Street names disagree everywhere — even the official Spanish geocoder matches only 54%.** The same road has several names ("EN 16" / "Variante de Vouzela"; "N-342" / "Avenida de Andalucía"). Part of the "wrong street" problem in the driver app is this, not one bad map.
3. **What wins is a confirmed site, not a better geocoder.** Every customer site is pinned once at the truck gate, confirmed by the office or a driver, and reused by every job. The geocoder only proposes; confirmed pins become FleetOS's own data — something TomTom does not have.
4. **Driver display should show road number and name together** (e.g. "N-342 · Av. de Andalucía") and take the name from the route's own road, not from a reverse lookup of the GPS point.

## Limits of this test

- Official station coordinates are not perfect truth; some "errors" are in the official data.
- Station addresses are messy ("N-342 km 483", "Lugar X s/n"), harder than a warehouse's street address.
- CartoCiudad was given free text; it works much better with structured input (street, number, municipality), so its row understates it.
- 100 stations per country: good for direction, not for decimals.

## Test 2 — does a road reach a given coordinate? (22 October 2026)

396 official coordinates (fuel stations; 196 with an industrial-zone / polígono address). Distance to the nearest drivable road: OSM median 6–13 m, TomTom 11–15 m; farthest point 78 m in both; **no point without a road within 150 m in either**. Not tested: truck access tags, which side of a site the gate is on, private estate roads.

## Test 3 — same trips routed on OSM and on TomTom (22 October 2026)

240 trips between official station coordinates: 60 long (40–600 km) and 60 short (2–15 km) per country. OSM via the public OSRM server (car), TomTom car without traffic. Where distances differ by more than 5%, OSM is forced along TomTom's own path (8 points, with travel direction) to tell "different choice" from "road missing".

| | PT long | PT short | ES long | ES short |
|---|---|---|---|---|
| OSM distance vs TomTom (median) | −0.5% | −0.1% | −0.3% | −1.2% |
| Within ±3% | 73% | 55% | 87% | 48% |
| OSM more than 5% longer | 2% | 12% | 3% | 7% |
| OSM more than 5% shorter | 15% | 28% | 5% | 28% |
| Differ >5% but OSM can follow TomTom's path (roads exist) | 10 of 10 | 15 of 24 | 4 of 5 | 14 of 21 |

- The one long trip OSM "could not follow" is Madrid → Mallorca (a ferry) — a test artefact.
- Of the short trips OSM could not follow, the six worst were located stretch by stretch. Two turned out to be test artefacts (point snapped to the wrong carriageway). **Four remain real suspects**, each a short stretch where OSM detours: Afurada (Vila Nova de Gaia), Rua Francisco Verdugo (Rio Maior), El Puig (Valencia), and the M-50 by Polígono Los Gavilanes (Getafe) — at Getafe OSM has the M-50 ramps, so the gap is a connection or turn rule, not a whole road.
- Travel times: the public OSRM server's speeds are 15–19% slower than TomTom free-flow. That is its speed settings, not the roads; our engine sets its own speeds.

**Reading:** OSM has the roads for long-distance trucking. The weak points are local links — a ramp that does not connect, a one-way, a turn rule — about 4 spots in 240 trips. Each one is fixed once, for every client. During the transition every planned route is compared with TomTom automatically; a detour above a threshold flags the spot for fixing.

## Test 4 — Google place pins routed on OSM vs TomTom (22 October 2026)

17 real places looked up by hand on Google Maps (pin coordinates read from the place page): 10 industrial / logistics sites, 2 villages, 5 old-town streets, in PT and ES. Each routed from a nearby origin on OSM (public OSRM, car), TomTom car and TomTom 40 t truck; Google's own driving distance read for 5 of them.

| Place | OSM km | TomTom car | TomTom truck | Google | Route reaches pin (OSM / TomTom) |
|---|---|---|---|---|---|
| PROZIS Esposende | 38.8 | 38.8 | 38.8 | | 16 m / 15 m |
| Entreposto Sonae Azambuja | 41.1 | 40.7 | 41.6 | | 17 m / 20 m |
| Entreposto Sonae Maia — *entrada camiões* | 11.6 | 13.0 | 14.8 | ≈13.5, warns "restricted or private roads" | **139 m** / 8 m |
| Faurecia Bragança | 65.6 | 65.4 | 65.4 | | 0 m / 0 m |
| Entreposto Lidl Torres Novas | 53.4 | 53.4 | 53.4 | | 3 m / 7 m |
| Adega de Favaios (village) | 29.4 | 46.5 | 46.5 | ≈46.4 via A4, also warns private roads | 42 m / 41 m |
| R. de São Miguel, Alfama | 4.0 | 4.8 | 3.3 | | 2 m / 3 m |
| R. da Fonte Taurina, Ribeira Porto | 5.8 | 9.8 | 9.8 | | **68 m** (stops at the restricted street) / 4 m |
| Mercadona Bloque Logístico Riba-roja | 24.2 | 25.3 | **638.6** | | 186 m / 86 m (pin inside the site) |
| Inditex PLAZA Zaragoza | 12.1 | 15.5 | 18.7 | ≈15.5 (alternatives ≈12) | 25 m / 30 m |
| Mercabarna | 25.6 | 25.9 | 30.5 | | 5 m / 7 m |
| Polígono Cobo Calleja | 6.5 | 6.2 | 6.2 | | 24 m / 22 m |
| Inditex Arteixo | 13.0 | 12.1 | 13.9 | | 26 m / 26 m |
| Amazon MAD4 San Fernando | 14.2 | 16.8 | 20.6 | ≈20.2 via A-2 | 3 m / 3 m |
| Bodega Cooperativa Cigales (village) | 18.4 | 15.1 | 18.5 | 15.7 | 3 m / 6 m |
| Calle de la Plata, Toledo casco | 2.5 | 3.4 | 2.3 | | 11 m / 10 m |
| Casco histórico Albarracín | 38.2 | 38.7 | 37.8 | | 5 m / 4 m |

Google km values for Maia, Favaios, Zaragoza and Amazon were read from small screenshots — approximate.

**Reading:**
- **14 of 17 routes on OSM end within 45 m of Google's pin, at the same spot as TomTom** (end points ≤10 m apart in 12 cases).
- **The three that stop short are access, not missing roads:** the Sonae Maia truck entrance sits on a private road (Google itself warns about it) and the OSM car profile does not enter private roads; the Ribeira street is restricted, and OSM stops at its entry (correct for a truck); the Mercadona pin is inside the site, so every engine stops at the fence. Fix: the last metres to a confirmed site gate may use private/destination roads, and every site stores its gate.
- **Route choice differs, not the map:** OSM's car profile often takes shorter, smaller roads (Favaios 29 km vs 46 km by motorway; Amazon 14 km vs 20 km). Google and TomTom truck mostly pick the bigger roads. Our engine's truck profile and speeds decide this — a setting, not a data gap.
- **TomTom is not ground truth either:** its 40 t truck route to Mercadona Riba-roja came back as 638.6 km for a 25 km trip.
- **Google also misplaces ambiguous text:** "Calle de la Plata 10 Toledo" returned a street with that name in another town; with the postcode (45001) it found the right one.

## Test 5 — truck restrictions: OSM vs official signs (22 October 2026)

**OSM tag counts (Geofabrik taginfo):** Portugal has ~5,300 `maxheight`, ~1,000 `maxweight`, ~790 `hgv=no`, ~500 `maxwidth` over 1.6 million road segments. Spain has ~12,500 `maxheight`, ~11,400 `maxweight`, ~3,800 `hgv=no`, ~1,850 `maxwidth` over 5.9 million.

**Reference set:** Madrid's official vertical-sign inventory ([datos.madrid.es, 10 July 2026](https://datos.madrid.es/dataset/300273-0-senales-verticales)) — 491,000 sign records; 601 active truck-relevant signs (R-205 height, R-201/R-107 weight, R-106/M-30 truck bans, R-203 length, R-204 width, R-202 axle, R-108/109 dangerous goods). Each sign checked for a matching OSM tag within 40 m.

| Sign type | Official signs | Present in OSM |
|---|---|---|
| Height (R-205) | 215 | 64 (30%) |
| Weight (R-201, R-107) | 167 | 20 (12%) |
| No trucks (R-106, M-30) | 122 | 7 (6%) |
| Length (R-203) | 51 | 2 (4%) |
| Dangerous goods (R-108/109) | 31 | 1 (3%) |
| Axle (R-202) | 12 | 1 (8%) |
| Width (R-204) | 3 | 0 |
| **Total** | **601** | **95 (16%)** |

**Reading:** OSM cannot be trusted for truck restrictions — even in Madrid, one of the best-mapped cities, it holds about 1 in 6 official truck signs (the 40 m match is generous, so true coverage is at most this). Portugal has fewer tags still and almost no official sign inventories online (only Águeda, 2020, on dados.gov.pt). Spain has some: Madrid, Pamplona, Gipuzkoa and Valencia provincial roads (the last two on the DGT NAP).

**Where restriction data must come from instead:** official sign inventories where they exist; AI agents reading municipal traffic regulations (Diário da República 2.ª série parte H, Spanish provincial bulletins, municipal websites) that list streets with truck bans and weight limits; railway underpass clearances; signs detected by the driver app's camera (own data); driver reports. Mapillary's sign detections need a commercial licence for business use.

## Test 6 — our own engine (GraphHopper 11.1 on Portugal + Spain OSM) vs TomTom (22 October 2026)

Engine: GraphHopper 11.1, Geofabrik Portugal + Spain extracts of 20 Oct 2026 merged into one Iberia file; graph of 8.3 million nodes and 10.6 million edges (2.1 GB), built in 33 minutes on the founder's PC (`C:\Users\manue\fleetos-routing`). Profiles: `car` (comparison) and `truck` (FleetOS model: 40 t, 4 m, 2.55 m, 16.5 m, 11.5 t axle; motorways/national roads preferred; private roads only at very low priority for the last metres). Response time: median 44 ms per route.

**A) The 240 trips — our truck vs TomTom 40 t truck (distance):**

| | Median difference | Within ±3% | More than 5% longer |
|---|---|---|---|
| PT long | −3.5% | 47% | 0% |
| PT short | −5.5% | 35% | 2% |
| ES long | −3.9% | 37% | 0% |
| ES short | −10.3% | 20% | 3% |

Our engine never failed a route; our truck routes are almost never longer than TomTom's truck routes, and often shorter. Travel time: ours is 10–13% slower on long trips (our 85 km/h motorway cap) and about 20% faster on short ones (urban speeds too optimistic) — speeds will be calibrated with real trips.

**B) 46 Google place pins (17 earlier + 29 new: car plants, ports, logistics centres, villages, old towns):** truck route ends within 50 m of the Google pin — **ours 40 of 46, TomTom 40 of 46**. Notable:
- Our truck profile already avoids roads trucks cannot use, like TomTom's truck: Delta Cafés Campo Maior (our car 20.4 km, our truck 34.2 km, TomTom truck 34.3 km) and Terminal XXI Sines (our car 80.0, our truck 128.9, TomTom truck 127.1).
- The Sonae Maia truck entrance is now reached (15 m) — the private last-metres rule works.
- TomTom's truck routing again returned 638.6 km for the 22 km trip to Mercadona Riba-roja; ours 22.2 km.
- Where ours is much shorter than TomTom truck (Valencia port 32.6 vs 49.9, Vigo 33.0 vs 47.7, Abrera 33.9 vs 46.9, Favaios 31.6 vs 46.5), our truck uses smaller roads that TomTom avoids — some may be legal shortcuts, some may hide restrictions OSM lacks (Test 5). This is exactly what the restriction layers and real trips must settle.

**Tuning trial (per-request penalties, no rebuild):** penalising secondary/tertiary/local roads more ("main roads ++": secondary ×0.8, tertiary ×0.6, local ×0.4) moves the median from −5.2% to −3.5% vs TomTom truck and the share within ±5% from 46% to 50%. Further tuning should use a carrier's real driven routes as ground truth, not TomTom.

## Test 7 — Google's own driving distance vs our engine vs TomTom (22 October 2026)

Google's best driving route read by hand on google.com/maps (no API key, 29 trips from the pin set). Google is a car router, so it is the reference for "the sensible road", not for truck legality.

| Engine | Median vs Google | Within ±5% | Within ±10% | >15% shorter | >15% longer |
|---|---|---|---|---|---|
| TomTom car | −0.1% | 59% | 72% | 3 | 3 |
| **Our truck** | **−4.5%** | 45% | 62% | 7 | 1 |
| TomTom 40 t truck (638 km bug excluded) | +6.3% | 45% | 52% | 1 | 13 |
| Our car | −10.2% | 28% | 48% | 11 | 0 |

- **Where our truck matches Google and TomTom's truck does not:** Mercadona Abrera (Google 33.8, ours 33.9, TomTom truck 46.9), MSC Valencia (34.1 / 32.6 / 49.9), SEAT Martorell (34.8 / 36.6 / 46.9), Stellantis Vigo (36.9 / 33.0 / 47.7), Cuenca (84.8 / 84.4 / 103.7). TomTom's truck routing often detours far more than needed.
- **Where our truck is too short:** Favaios (Google 45.7 via the A4, ours 31.6 over mountain roads), PROZIS Esposende (38.8 vs 32.7), Amazon MAD4 (20.2 vs 15.9), Inditex PLAZA (15.5 vs 12.1). Ours takes direct national/regional roads that are slow and winding; Google and TomTom go round by motorway.
- Tuning trial: lower truck speeds on secondary/tertiary roads per request changed nothing; stronger penalties on minor roads helped a little (median −3.4%, ±10% 66%). The fix needs a rebuild: add GraphHopper's `curvature` value (penalise winding roads for trucks) and replace OSM default speeds with speeds learned from real truck GPS.
- Delta Cafés Campo Maior: Google car 22.7 km, our truck 34.2, TomTom truck 34.3 — both truck routers avoid the same road, as expected.
- Google shows a "restricted or private roads" warning on 9 of the 29 trips, including the Sonae Maia truck entrance.

## Test 8 — interior / difficult roads, new truck model (22–23 October 2026)

Engine rebuilt with GraphHopper `curvature` and `urban_density` (rural / residential / city). New profile `truck2` = old truck model plus: towns and cities penalised (residential ×0.85, city ×0.75, motorways exempt) and slowed (45 / 35 km/h); winding roads penalised (curvature < 0.85 ×0.9, < 0.7 ×0.8) and slowed (55 / 40 km/h). 24 interior trips in PT and ES (mountains, villages, roads with slightly longer alternatives); Google read by hand, TomTom via API. Ten origins (Vila Real, Bragança, Castelo Branco, Portalegre, León, Ourense, Teruel, Huesca, Zamora, Soria) are the district/province centre returned by the geocoder, not the city — every engine used the same points.

**Distance vs Google:**

| Engine | Median | Within ±5% | Within ±10% | >15% longer |
|---|---|---|---|---|
| TomTom car | +0.4% | 96% | 100% | 0 |
| TomTom 40 t truck | +4.8% | 54% | 71% | 4 |
| Our truck (old) | −0.1% | 83% | 92% | 1 |
| Our truck (new) | −0.1% | 79% | 88% | 1 |

- **Póvoa de Lanhoso → Cabeceiras de Basto:** Google 37.8 km, ours 38.1 km on the direct road, **TomTom truck 85.6 km** (48 km round). Our model stays on the road the trucks actually use. TomTom truck also detours on Vila Real region → Favaios (78.2 vs 54.1), Ourense region → A Pobra de Trives (89.5 vs 72.1) and Soria region → Medinaceli (85.7 vs 70.2).
- **Arganil → Pampilhosa da Serra:** ours 51.8 km vs Google 36.4 — OSM tags 4.3 km of the direct road as `track`, which the truck model avoids. A data error that one fix (or one driver report) corrects for everyone.
- **Teruel region → Mora de Rubielos:** the new model takes the direct primary road (72.7 km, same 98 min) instead of trunk + motorway (Google 87.3).
- The new model changes distances little; its main effect is on time (+5–10% on winding and town roads). **Times are still too optimistic on mountain roads** (Póvoa → Cabeceiras: ours 44 min vs TomTom car 50; Covilhã → Manteigas 36 vs 39) — curves need a stronger slowdown and, above all, real truck speeds from GPS.

**Other sets on the new model:** 29 Google pin trips — within ±10% of Google 62% → 66%; 240 station trips vs TomTom truck — median −5.0% → −4.2%.

## Test 9 — final truck model with curves, towns and slope (23 October 2026)

Engine rebuilt with elevation (SRTM 3″ from srtm.kurviger.de, bilinear interpolation, 150 m moving-average smoothing) → `average_slope` / `max_slope`. Profile `truck3` (`custom_models/fleetos_truck3.json`):
- **Speeds:** motorway/trunk 90 (legal truck limit), primary/secondary 70, other 50; outside motorways: city 30, town/village 40; curves < 0.95 → 60, < 0.9 → 50, < 0.8 → 40, < 0.65 → 30, < 0.5 → 20; uphill > 5% → 50, > 7% → 35, > 10% → 25; downhill < −8% → 40.
- **Penalties (capped):** towns ×0.85, cities ×0.75, winding ×0.9 / ×0.8 (none on motorways); slopes > 8% ×0.8, > 12% ×0.5.
- Fixes Test 8's error: town/curve limits no longer apply to motorways.

**Distance vs Google:**

| Set | Old truck | Final truck |
|---|---|---|
| 24 interior trips — within ±10% | 92% | **92%** (0 trips >15% longer) |
| 29 company/pin trips — median | −4.4% | **−0.2%** |
| 29 company/pin trips — within ±10% | 62% | **83%** |
| 240 station trips vs TomTom truck — median | −5.0% | −3.6% |

Fixed by the final model: Bragança region → Miranda do Douro (67.9 → 75.2 km; Google 74.4), Arganil → Pampilhosa da Serra (52.0 → 38.5; Google 36.4), León region → Riaño (132.7 → 138.3; Google 138), Huesca region → Aínsa (76.9 → 80.2; Google 80.2). Póvoa de Lanhoso → Cabeceiras de Basto stays on the direct road (38.2 km; TomTom truck 85.6).

**Travel time vs TomTom 40 t truck (trips where both take the same road, distance within 5%):**

| | Old truck | Final truck |
|---|---|---|
| Median difference | +2.4% (but spread −13% to +13%) | +7.6% (spread −2% to +11%) |
| Within ±10% of TomTom | 30% | **51%** |
| Interior / mountain | −12% | **+2%** |
| Short trips PT / ES | −19% / −9% | **−2% / −1%** |
| Long trips PT / ES | +12% / +14% | +11% / +10% |

Mountain and short-trip times now match TomTom's truck. Long motorway trips are ~10% slower than TomTom's estimate; which one is closer to reality can only be settled with real truck GPS. Póvoa → Cabeceiras: 50 min (old model 39); Covilhã → Manteigas: 45 min (TomTom truck 44).

## Test 10 — FleetOS rules inside our own routing (23 October 2026)

New code: `src/routing/graphhopperProvider.ts` (our engine as a solver provider; avoided paths become 15 m corridor polygons blocked in a per-request custom model) and `src/routing/truckRoute.ts` (`routeTruck`: truck + departure time → the existing evaluator decides which rules apply to this truck when it passes → the existing clean-route solver asks the engine to avoid them; stop municipalities from CAOP 2025 so area exceptions can be decided). Engine profile `truck3`, VCI rule from `src/regulations/portugal/seededRestrictions.ts`.

| Trip / departure | Result | Route |
|---|---|---|
| Leixões → Espinho, Wednesday 10:00 | VCI ban applies → avoided | 26.7 km / 29 min with 3.0 km on the VCI → **59.2 km / 52 min, 0 km on the VCI**, via A28 → A4 → **A41/IC24 (CREP, the official alternative)** |
| Leixões → Espinho, Wednesday 22:00 | Ban not active | 26.7 km / 29 min through the VCI |
| Leixões → Espinho, Sunday 10:00 | Ban not active | 26.7 km / 29 min through the VCI |
| Leixões → Gaia (Grijó), Wednesday 10:00, no authorisation | Ban applies → avoided | 27.2 km → 56.0 km, 0 km on the VCI |
| Leixões → Gaia (Grijó), Wednesday 10:00, **with** VCI authorisation | Exception (unloading in Gaia, authorised) | 27.2 km through the VCI |

A route with a rule takes 2 engine requests (~2 s); without, 1 request (~0.1 s). Known limit: a road crossing an avoided corridor (bridge / underpass) is blocked for the crossing edge; exact blocking by OSM way id needs `osm_way_id` in the next engine build.

## Test 11 — live IP road works: does TomTom know, and is the detour worth it? (23 October 2026)

Source: IP "Trânsito em Tempo Real" ArcGIS layers, fetched today — now live with GPS points (66 maintenance works, 30 environmental obstructions, 26 accidents…; several started today). New code `src/routing/roadWorks.ts`: classifies IP wording (closure / alternating lights / lane closed / conditioned), reads the stated stretch ("entre o pk 104 e o 111"), and `decideAroundWorks` decides per work: closure → go around; partial → go around only if the detour costs less than the expected wait. Expected wait: lights 8, conditioned 5, lane closed 3 min by default; with a live traffic reading (TomTom flow, test use) the measured delay counts, with a floor of 3 min for lights and 1 min otherwise. For each work a trip through it was found automatically (6 of 9; no natural through-trip found for EN378, EN109 Vagos, IC8 Sertã, IC19).

| Works (IP) | TomTom incident there? | TomTom 40 t truck | Our engine |
|---|---|---|---|
| EN15 km 46 Amarante, "ambas as vias e ambos os sentidos" (today) → closure | **None** | Takes another road (23.4 km) — not because of the works | **Goes around**: 17.1 → 23.2 km, same 24 min |
| IP3 km 104–111 Tondela, "corte total da via" | Only "Trabalhos na estrada" (works, not closed) | **Goes through the closed IP3** (19.4 km) | **Goes around** the 7 km stretch: 19.4 km / 23 min → 17.7 km / 28 min |
| EN18 km 150 Alpanhão, works traffic lights | None | Different road (30.6 km) | **Goes through**: wait ~3 min < detour +9 min / +10.1 km |
| EN105 km 13 Santo Tirso (works) | None | Different road (35.9 km) | **Goes through**: wait ~1 min (traffic flowing) < detour +1 min |
| EN14 km 0 Carvalhido, Maia/Porto (today) | None | Goes through | **Goes through**: wait ~1 min < detour +3 min |

- TomTom had an incident for **1 of 5** works tested, and as "works", not as the closure IP announces; its truck route drives into the closed IP3.
- Caveats: "ambas as vias e ambos os sentidos" was read as a closure (it may mean works on both lanes with traffic still passing) — wording needs AI reading and review; works hours (e.g. 08:00–18:00) are not yet read; the stretch of a stated closure is blocked on both sides of the point because its direction along the road is unknown.

Script and raw rows: one-off, kept outside the repository (scratchpad `works/`).

## Test 12 — IP notices with text only: place them, then route (23 October 2026)

Many IP notices (JSON:API "alertas") have no point or line, only text. Three near Póvoa de Lanhoso and Braga were placed on the road from their own words, routed with the 40 t `truck3` profile at a time inside the works hours, outside them, and now, then checked against TomTom (API, now) and Google Maps (by hand, now). All three notices are already over (Jun–Oct 2026), so "inside the hours" is a replay on the notice's own dates.

New in `src/routing/roadWorks.ts`: works hours from the text (`hoursFromText`, incl. overnight 22h00–06h00) and `activeAt` in Lisbon time; a work can carry its placed stretch (`line`); the stretch is blocked without its two ends (the junctions where the diversion starts stay open); a route counts as driving through only if it shares ≥ 150 m of the stretch (or half of a shorter one), not when it only crosses it or passes a ramp beside it.

| Notice (IP text) | Placed from | Inside hours | Outside hours / now | TomTom now | Google now |
|---|---|---|---|---|---|
| ER205 Póvoa de Lanhoso, closed km 63.100–64.200, 09h30–18h00, 14 Sep, ~5 days, "desvio pela EM593" | Junction EN103/ER205 = km 62.792 (from the same notice) → 0.31–1.41 km along the ER205: 1.01 km | Braga → Póvoa: 20.4 km / 28 min → **goes around: 21.5 km / 30 min** | Through, 20.4 km / 28 min | No incident; truck 20.8 km, through | 20.0 km / 27 min via N103, no alert |
| EN14 Braga (by the Meliá / Braga Parque), full closure km 47.560 (Nó da BP) – 49.160 (Nó de Infias), 22h00–06h00, 15–20 Jun | IP live point EN14 km 49 (Av. Padre Júlio Fragata, EN14/EN101) → 1.44 km to Nó da BP: 1.58 km | Infias side → Nó da BP side: 5.3 km / 6 min → **goes around: 4.9 km / 7 min** | Through | **"Trabalhos na estrada" + "Trânsito parado" there now**; truck 5.4 km, through | 4.7 km / 10 min via N101, "trânsito mais intenso que o normal", no works alert |
| EN201 Ponte Medieval de Prado, closed km 59.150–59.370, 22h00 20 Oct – 06h00 21 Oct | The bridge itself (OSM name): 0.25 km | Truck Braga → Prado (11.7 km) **does not use the old bridge anyway**; car: 10.0 km / 12 min → **goes around: 11.7 km / 11 min** | Through (car) | No incident; truck 12.5 km, not over the bridge | — |

- Placing text-only notices works when the text names something on the road: a junction with its km (ER205), an IP live point on the same road (EN14), or a named structure (Prado bridge). Notices with only a parish name still need AI reading and review.
- IP's live map also has a point "Braga – Infias" at EN14 km 49 since 25 Aug with no text; TomTom shows works and stopped traffic there now; Google shows only heavier traffic.
- Two fixes came from this test: a detour that joins the road right where the works end is not "through" (ER205, the official diversion joins there), and a ramp passing 33 m from the stretch at Nó da BP is not "through" (EN14).
- Known limit still open: avoided corridors are 2D, so a bridge or underpass crossing the stretch is blocked too; exact blocking by OSM way id needs `osm_way_id` in the next engine build.

Script: one-off, kept outside the repository (scratchpad `works/text-works.ts`).
