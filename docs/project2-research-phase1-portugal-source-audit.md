# Project 2 — Portugal Road Intelligence Store
## Research Phase 1 — National Source Audit, Coverage, Rights, Freshness & Fuel Intelligence

Status: research only. No ingestion was built.
Audit date: **2026-10-10**. Every "observed" value below came from a live probe made that day (UTC times are given where they matter).
Scope: mainland Portugal (Continente). The Azores and Madeira were noted but not audited.

**Evidence convention.** Each claim is tagged:
- **[P]** probed directly: an HTTP request was made and the response inspected.
- **[D]** read in an official document or page.
- **[S]** secondary source (press or trade association), not yet verified against the primary source.
- **[U]** uncertain or inferred.

---

## 1. Executive summary

Five findings shape what Project 2 can do first.

1. **Portugal has no open, national, machine-readable feed of road conditions.**
   - The legally designated channel is the National Access Point (NAP), run by IMT. Its real-time traffic, safety-related traffic and truck-parking data (RTTI/SRTI/SSTP) need a registered account plus administrator approval [D/P].
   - The NAP's public map currently shows one event, an IP roadworks item dated 2021-07-15 [P].
   - IP's own "Trânsito em Tempo Real" map *is* machine-readable. It is a public ArcGIS MapServer with Accidents, Other Occurrences and Restrictions layers. But:
     - its newest observation on 2026-10-10 was **2026-09-16**, about 24 days old;
     - it contains items whose end date has passed that are still marked `ativo`;
     - IP's website terms **exclude commercial use without written consent** [P/D].
   - **Usable for research and validation, but not a commercial production source without an agreement.**
   - IP also runs a **separate works-notice portal ("Alertas · Rodovia")** on a Drupal CMS whose JSON:API is anonymously readable (§2.2b). It has 203 notices with stable UUID/nid/revision IDs. The newest was created 2026-10-09, and 35 were added in the last 30 days, so it is **much fresher than the ArcGIS layers**. But validity, location and restriction type are free text only, with no geometry, and the same commercial-use exclusion applies. The two IP channels share no identifier and must be treated as separate sources.

2. **Station-level fuel prices exist, are comprehensive and fresh, but are legally fenced.**
   - DGEG's *Preços dos Combustíveis Online* receives mandatory price notifications from every mainland station before each price change (DL 243/2008) [D].
   - Its undocumented JSON backend returned 2,859 stations selling *gasóleo simples*. All had coordinates, and 99.4% had a price timestamp within 7 days [P].
   - The portal states: *"É proibida a sua utilização para fins comerciais"* [D/P].
   - DGEG's separate station-**location** dataset (WFS, 3,367 stations) *is* CC BY 4.0 and flagged as an EU High-Value Dataset (HVD), but it carries **no prices** [P].
   - **Station-level price intelligence is technically solved and legally unsolved.**

3. **Permanent truck restrictions exist almost only as legal text.** None of these is published as geometry:
   - weights and dimensions: DL 132/2017 and amendments;
   - ADR road and time-window bans and the Ponte 25 de Abril window: Portaria 281/2019 and Portaria 163/2021;
   - tunnel categories: IMT deliberations;
   - the new Porto VCI HGV ban: DL 155-A/2026, in force 2026-09-15.

   Bridge-specific limits appear only as free text inside IP's live "Condicionamentos" layer. One example is a >3.5 t ban on the Vila Velha de Ródão bridge on the ER18 [P].
   OpenStreetMap is the only network-wide structured source, and coverage is thin: `maxweight` on 989 ways and `maxheight` on 4,667 ways, out of 1.61 M highway ways [P].

4. **Open, CC BY base layers exist and are the safest first ingest:**
   - IP's Rede Rodoviária Nacional (shapefile, CC BY 4.0, updated 2026-04-15);
   - the INSPIRE motorway WFS;
   - DGEG station locations;
   - Porto's DATEX II restriction feed, with stable URN IDs but no stated licence;
   - IPMA warnings.

5. **Tolls are published as HTML tables, not data.**
   - IMT lists 2026 section ("lanço") tariffs for Brisa, Oeste, Brisal, A21, Douro Litoral and Lusoponte in 19 HTML tables [P].
   - Other concessions are delegated to IP and Portugal Tolls pages. IP's link to the electronic-toll-points map returns "item does not exist" [P].
   - Lei 37/2024 removed tolls from the A4, A13/A13-1, A22, A23, A24, A25 and parts of the A28 from 2025-01-01 [S].

**Recommendation in one line.** Ingest the CC BY base layers and Porto DATEX now. Build the snapshot and provenance spine against the IP ArcGIS and DGEG price endpoints in **non-commercial research mode only**. In parallel, open two formal access tracks:
- a NAP registration for RTTI/SRTI from IP and the concessionaires;
- a written reuse request to DGEG for prices and to IP for its live layers.

Do not commercialise any price or live-condition record until those tracks resolve.

---

## 2. Full source inventory

Each source lists what was observed, the evidence for it, and its URLs.

### 2.1 National Access Point — NAP Portugal (IMT)

| | |
|---|---|
| Organisation | IMT, I.P. Platform built and run by Armis ("Designed By Armis Group") [P] |
| URL | https://www.nap-portugal.imt-ip.pt/nap/home |
| Backend (undocumented) | `https://www.nap-portugal.imt-ip.pt/API/api/…` (`dashboards/homepage`, `suppliers/all`, `informationTypes`, `mapElements/all/`, `MultimodalSupplies/Search`) [P] |
| Authority | Statutory NAP under Directive 2010/40/EU as amended by Directive (EU) 2023/2661. Delegated Regulations 2022/670 (RTTI), 886/2013 (SRTI), 885/2013 (truck parking) and 2017/1926 as amended by 2024/490 (MMTIS) [D, NAP home page] |
| Homepage counters (2026-10-10) | 15 active road suppliers, "18.9 M processed data", 451 users, 114 multimodal records [P] |
| Road suppliers (`suppliers/all`) | Ascendi, Infraestruturas de Portugal, Brisa, Lusoponte, Scutvias, AEA (Autoestradas do Atlântico), Norscut, plus a "Teste" entry [P] |
| Access to RTTI/SRTI/SSTP | FAQ: registration is *"the only way to access RTTI, SRTI and SSP data"*. Users then request access per data type and an administrator approves it [D, NAP FAQ in `assets/i18n/pt.json`] |
| Public map (`mapElements/all`) | **1 element**: IP, RTTI "Obras rodoviárias / Trabalhos de manutenção", dated 15-07-2021 [P] |
| Info-type flags | Only RTTI "Obras rodoviárias" is `active:true`. Accidents, traffic info, all SRTI types and all SSTP types are `active:false` [P]. Meaning uncertain: it may be a UI filter flag or mean no current publication [U] |
| Formats | DATEX II (supplier "Versão Datex" field exists) [P] |
| MMTIS catalogue | 233 records via `MultimodalSupplies/Search`. Mostly GTFS/NeTEx public transport. Contains obvious test records ("exp", "exp1", "bbn", "teste_toponimia", "a") [P] |
| Road-relevant MMTIS records | DGEG fuel stations (DATEX II); MOBI.E EV static and dynamic (DATEX II); Porto restrictions, unplanned restrictions, loading bays and ZAAC (DATEX II); EMEL tunnels and parking (DATEX II); TomTom traffic, SRTI and Map APIs (commercial) [P] |
| Licence field | Example DGEG record: "Sem licença – Sem contrato" [P]. RTTI/SRTI licensing terms were not visible without registration [U] |
| Freshness | Cannot be assessed without registration [U] |
| Project 2 relevance | **The legitimate route to IP and concessionaire DATEX II feeds.** Highest-value open question. |

Concern: several NAP records point to dead or moved hosts. Porto's links use `opendata.porto.digital`, which now redirects to `dadosabertos.cm-porto.pt` [P]. Catalogue hygiene is weak.

### 2.2 Infraestruturas de Portugal (IP) — live conditions ("Trânsito em Tempo Real")

| | |
|---|---|
| Organisation | Infraestruturas de Portugal, S.A. Road owner and manager of 13,781 km under direct management, 17,447 km in operation [D, IP "Rede Rodoviária" page] |
| Page | https://servicos.infraestruturasdeportugal.pt/pt-pt/viajar-na-estrada/transito-em-tempo-real |
| Embedded app | ArcGIS Instant App `4092ca606ea04621be26aa4ec784e069` → web map `8a5d874608234d73954a0cb58753dbd3` (both `access: public`) [P] |
| Service | `https://utility.arcgis.com/usrsvcs/servers/98bffc4ef35b4e18a03641918c5d07dd/rest/services/webapps/viajar_na_estrada2024/MapServer` (ArcGIS 11.3). Layers: 0 Acidentes, 1 Outras Ocorrências, 2 Condicionamentos, 3 Câmaras de Tráfego, 4/5 Serra da Estrela [P] |
| Access | Anonymous REST `query` returns JSON or GeoJSON, maxRecordCount 2000 [P]. Served through ArcGIS Online's credential proxy (`utility.arcgis.com/usrsvcs`). The URL is an ArcGIS Online proxy key and **could be rotated without notice** [U] |
| Schema (layers 0–2) | `objectid, tipo, estado, datainicio, dataobservacao, datafim, commentsummary, description (road ref), pkbegin (integer km), direction (Ambos/Crescente/Decrescente), distrito, concelho, latitude, longitude` + string copies of the dates [P] |
| `tipo` vocabulary | DATEX-like: Accident; EnvironmentalObstruction, VehicleObstruction, GeneralObstruction, EquipmentDamageObstruction, AnimalPresenceObstruction; MaintenanceWorks, ConstructionWorks, GenericIncident, PoorRoadInfrastructure, Activities [P] |
| Counts at 2026-10-10 12:17Z | Accidents 26, Other occurrences 87, Restrictions 95. All `estado = ativo` [P] |
| Observed freshness | **Newest `dataobservacao` in any layer = 2026-09-16.** Oldest active restriction started 2020-08-28. 61/95 restrictions have no end date; 3 end in 2050. At least one restriction (EN222, ending 2026-09-04) is still `ativo` after its end date [P] |
| Geometry | **Points only** (Web Mercator plus lat/lon). No segment or extent geometry. Extent is given only in free text ("entre o km 151,150 e …") [P] |
| IDs | `objectid` (≈23.4 M range). Stable across a 5-minute re-fetch (95/95 same, 0 changed) [P]. Multi-day stability **untested**. No IP-native event ID exposed [P] |
| Revision detection | Possible only by snapshot diffing. There is no version field [P] |
| HGV content | Free text only. Example: "interdita a circulação de veículos pesados, com tara superior a 3,5 toneladas, sobre a Ponte de Vila Velha de Ródão … Km 121+960 e … 122+220 da ER18" [P] |
| Coverage | IP-managed network (EN, IC, IP, ER, some A). 2–5 motorway references per layer. Concessionaire motorways are largely absent [P] |
| Licence | Website terms of use (https://www.infraestruturasdeportugal.pt/pt-pt/termos-de-utilizacao-ip), §C: content is for personal information; *"A utilização dos conteúdos para fins comerciais está excluída"*. No content may be reproduced, published, licensed or sold *"sem o prévio consentimento escrito da IP"* [D/P] |
| Project 2 priority | **P0 for research and validation, blocked for commercial use** pending NAP access or a written IP agreement. |

Related IP pages:
- The **Alertas (Rodovia) works-notice portal** is a *separate dataset with its own backend*. It is audited in §2.2b below.
- "Condições de circulação" (https://www.infraestruturasdeportugal.pt/pt-pt/node/2472) is a **2016** press note, not a feed [P].
- The IP 2026 storm-recovery page mentions a closures map [S, IP "Recuperação Intempéries 2026"]. Not probed.

### 2.2b IP — "Alertas · Rodovia" works and closures notices (separate from §2.2)

Audited separately at the user's request, on 2026-10-10 (~13:30–14:00 UTC). **It is not the same dataset as the "Trânsito em Tempo Real" ArcGIS layers.** It has a different backend, different IDs and a different update rhythm.

| | |
|---|---|
| Portal | Listing: https://servicos.infraestruturasdeportugal.pt/pt-pt/alertas-ips (road). Rail alerts are at `/pt-pt/alertas`. Item URLs: `/pt-pt/alertas/rodovia/<slug>` (e.g. `/pt-pt/alertas/rodovia/en4-estabilizacao-do-aterro`) [P] |
| Backend | **Drupal CMS** (multi-domain install shared with the corporate site; `field_domain_access`). Content type **`servicos_viajar_na_estrada`** [P] |
| Machine-readable access | **Drupal JSON:API enabled and anonymously readable**: `https://servicos.infraestruturasdeportugal.pt/jsonapi/node/servicos_viajar_na_estrada` (paginated, `page[limit]=50`, sortable, filterable, sparse fieldsets) [P]. Not documented or announced by IP. Likely a default module exposure rather than a published API [U]. No RSS: `/rss.xml` is an empty channel [P]. No sitemap [P]. `?_format=json` returns 406 [P]. robots.txt does not disallow `/jsonapi` [P] |
| HTML fallback | Listing paginated at 6 items per page (`?page=0…33`) [P] |
| Volume | **203 published road notices** (all `/alertas/rodovia/…`) [P] |
| IDs | Per notice: JSON:API UUID (e.g. `5ffefdb3-8d10-43f2-b765-552f807b17ef`), Drupal `nid` (e.g. 8495, shortlink `/pt-pt/node/8495`), revision `vid` (e.g. 44676), URL alias. **Stable, CMS-native identifiers**, unlike the ArcGIS `objectid` [P] |
| Timestamps | `created`, `changed`, `revision_timestamp` (UTC, second precision). HTTP `Last-Modified` and `ETag` on item pages [P] |
| Validity window | **Not structured.** `publish_on` and `unpublish_on` are null on all 203 [P]. Validity exists only as text: a summary field `field_alertas_destaque` (e.g. "Circulação alternada de 12 de outubro a 6 de novembro.") and the body `field_conteudos_alerta` (HTML) [P]. 177/203 contain parseable Portuguese dates. Years are usually implicit [P] |
| Location / geometry | **None structured.** No coordinates, no map, no geometry fields [P]. Location is in text: road reference (EN in 173 notices, IP 35, IC 32, ER 23, A2 19, EM 11, A1/A3 5 each), km range (140/203 mention km), municipality [P] |
| Categories | No taxonomy or type field on the notice. The type of work (pavement, geotechnical, drainage, lighting…) and the traffic measure (alternating traffic with signals, lane closure, total closure, diversion) are in the title and body text only [P] |
| HGV content | 8/203 mention pesados, tonnage, height or width, in text [P] |
| Freshness | Newest `created` **2026-10-09T13:20Z**; newest `changed` 2026-10-09T13:21Z. **35 notices created in the 30 days before the audit** [P]. By contrast, the ArcGIS layers' newest observation is still **2026-09-16** (re-checked 2026-10-10) [P] |
| History | Published notices go back to **2025-04-04** (24 from 2025, 179 from 2026) [P]. **Expired notices stay published.** About 163/203 have their last textual date before 2026-10-10 [P, heuristic date parse]. Nothing earlier than 2025-04 is published. Older IP notices exist only as corporate "notícias" (see below) [P] |
| Revisions | 21/203 were changed more than an hour after creation [P]. Revision IDs are exposed, but **revision content is not publicly retrievable** (`resourceVersion=id:…` → 404) [P]. Change detection must be done by Project 2 via `changed` and `vid` polling |
| Relationship to ArcGIS (§2.2) | **Separate datasets.** A crude road + municipality match finds 58/203 notices sharing a road and municipality with some ArcGIS restriction, and only 8 of the 28 notices created after 2026-09-16 [P]. That is a weak signal: same road does not mean same event. **No shared identifier exists.** The ArcGIS layer cannot be assumed to contain the notices, or vice versa. Deduplication must be probabilistic and reviewed |
| Third IP channel | Corporate news on `www.infraestruturasdeportugal.pt` (same Drupal, JSON:API `node--noticias`). Narrative press releases on works, reopenings and storm recovery (e.g. "EN109-4 em Santa Maria da Feira reabre ao trânsito", 2026-07-28) [P]. Legacy `noticias_ip` holds migrated older items (created 2021-04-24 in bulk) [P]. Useful as corroboration and history, not as a notice feed |
| Reuse rights | Same IP site terms of use as §2.2: personal use, **commercial use excluded without IP's prior written consent** [D]. The JSON:API being reachable is **not** a licence [U/⚖] |
| Privacy note | JSON:API relationships expose CMS author user UUIDs and internal domain names (e.g. a `wwwdev03…` domain). Project 2 must not store or enumerate CMS user data. Only notice content fields are needed |
| Assessment | **The freshest, best-identified official IP works feed found.** Text-only, so location, validity and restriction type need extraction and review. **P0 for research; commercial use blocked** like §2.2. Strongest candidate to ask IP to formalise (as open data or via the NAP) |

**What this changes in the audit:**
- IP road-works intelligence has **two independent official channels**:
  - the ArcGIS layers, which are structured (points, dates, `tipo`) but stale;
  - the Alertas CMS, which is fresh with stable IDs but has free-text validity and location.
- Project 2 should snapshot both, keep them as separate sources, and link records only through a reviewed `sameEventAs` relation.
- Proposed cadence for the Alertas JSON:API: every 15–30 min, keyed on (`uuid`, `vid`, `changed`). A full pull is 5 requests.

### 2.3 IP — Rede Rodoviária Nacional (base network)

| | |
|---|---|
| Dataset | "Rede Rodoviária Nacional" — https://dados.gov.pt/en/datasets/rede-rodoviaria-nacional (API: `https://dados.gov.pt/api/1/datasets/rede-rodoviaria-nacional/`) |
| Publisher, licence | Infraestruturas de Portugal, S.A.; **CC BY 4.0**; declared frequency quarterly; last modified **2026-04-15**; created 2020-06-25 [P] |
| Resource | `rede-rodoviaria.zip`, 15.5 MB shapefile, PT-TM06/ETRS89 [P] |
| Content | 4,077 line features [P] |
| Attributes | `roadnumber, categoria, distrito, road1–road4` (co-designations and E-routes), `estado` (Construído / Em Projeto / Em Construção), `gestao` (IP / Município / Concessão / Subconcessão / Outra), `n_vias` [P] |
| Missing | **No feature ID, no chainage/PK, no concessionaire name, no weight/height/ADR attributes, no validity dates** [P] |
| Companion | "Rede Nacional de Autoestradas à escala 1:10 000", INSPIRE WFS `https://dservices3.arcgis.com/0g3MTQbTPQUjziIf/arcgis/services/Road_Network_INSPIRE/WFSServer`, CC BY 4.0, annual, last modified 2025-01-21 [P] |
| Other IP open data | Rail network, stations, ecopistas (all CC BY 4.0) [P]. IP's 2020 page says IP was "evaluating" real-time publication with AMA [D] |
| Priority | **P0** as a referencing and attribution layer (road numbers, management type). Weak as a linear-referencing base because there is no chainage or ID. |

### 2.4 IMT — legal and regulatory sources (permanent restrictions and tolls)

| Topic | Source | What it proves | Machine-readable? |
|---|---|---|---|
| Weights and dimensions | DL 132/2017 (transposes Dir. 2015/719), amended by DL 59/2023 [S: APCMC, informador.pt; IMT news page https://www.imt-ip.pt/noticias/novo-regulamento-que-fixa-as-dimensoes-e-os-pesos-maximos-autorizados-para-os-veiculos-em-circulacao/] | National maxima (e.g. 44 t for 5+ axle combinations) | No. Legal text only |
| Euro-Modular 32 m / 72 t | DL 195/2026 of 25 Sep 2026 [S: APCMC only] | Only under an IMT special authorisation, on routes named in it | No. **Unverified in Diário da República** |
| ADR road and time bans | Portaria 281/2019 amended by Portaria 163/2021 [D: text via ANTRAM consolidated PDF; IMT page https://www.imt-ip.pt/rodoviario/transporte-de-mercadorias-perigosas/autorizacoes-especiais-de-circulacao/] | Tankers banned 00–24 h on Sundays and national holidays across the mainland (not holidays falling on a Saturday or Monday). Orange-panel HGVs banned 18–21 h Fri, Sun, holidays and holiday eves on 9 named sections. Monday 07–10 h inbound to Lisbon and Porto (14 sections, except July/August). **Ponte 25 de Abril: ADR only 02:00–05:00** | No. Roads described as "EN 6, entre Lisboa e Cascais" etc. Needs manual geocoding |
| ADR tunnels | Portaria 281/2019 art. 6: category assigned by IMT board deliberation on the tunnel manager's proposal [D] | Mechanism exists | **No consolidated tunnel-category list found** |
| Porto VCI HGV ban | DL 155-A/2026; IMT news https://www.imt-ip.pt/?p=17781 [D/S] | From 2026-09-15, weekdays 07:00–21:00: vehicles >3,500 kg, ≥3 axles, ≥1.1 m height at the first axle. Exemptions: Porto/Gaia loading (per-trip registration), IMT special authorisations, State and municipal vehicles. CREP/A41 toll-free for those vehicles | No. Press and legal text. DL date differs between sources (31 Jul vs 3 Aug 2026) [S] |
| Special transport | Autorização Especial de Trânsito (IMT, case by case) [D] | Exists | Not published |
| Tolls | IMT "Taxas de Portagem" https://www.imt-ip.pt/rodoviario/infraestruturas-rodoviarias/rede-rodoviaria/taxas-de-portagem/ [P] | 2026 section tariffs, classes 1–4, for Brisa (A1–A14), Oeste (A8, A15), Brisal (A17), IP (A21), Douro Litoral (A32, A41, A43), Lusoponte | HTML: **19 `<table>` elements, ~229 rows** [P]. No CSV. Other concessions delegated to IP |
| Toll report | "Relatório sobre Portagens 2025" (art. 28 DL 38/2025), PDF [D] | Annual narrative | PDF |
| Concession map | IMT concessions page; AMT concessions report (2019) [S] | Concessionaire ↔ motorway mapping | HTML/PDF |
| Ex-SCUT abolition | Lei 37/2024 [S: several press sources] | A4, A13/A13-1, A22, A23, A24, A25, A28 (Esposende–Antas, Neiva–Darque) toll-free from 2025-01-01 | No |

### 2.5 IP — electronic tolling

- The page https://servicos.infraestruturasdeportugal.pt/pt-pt/portagens-ips explains traditional and electronic-only systems [P].
- It links to `portugaltolls.com` and to an ArcGIS map `0d5c6ec74cd4485aaf78ec7ca75d6118`. That map returns *"Item does not exist or is inaccessible"* [P].
- No downloadable gantry or tariff file was found [P].

### 2.6 Concessionaires

| Operator | Evidence | Public machine-readable feed found? |
|---|---|---|
| Brisa (Via Verde) | NAP road supplier [P]. Historical iBrisa app and site alerts [S, 2013] | **No public feed found.** Unofficial camera-scraper library exists (PyPI `viaverde-traffic`). Not usable |
| Ascendi | NAP road supplier [P]. AI incident detection pushed to Waze [S] | No public feed found |
| Lusoponte, Scutvias, AEA, Norscut | NAP road suppliers [P] | Not found |
| Brisal, Douro Litoral, Rotas do Algarve Litoral, AEBT, SPER, AELO, Ascendi Pinhal Interior, Via Livre, etc. | AMT 2019 concessions report [S] | Not audited. **Gap** |

Conclusion: concessionaire live data is only reachable through the NAP (registration) or bilateral agreements. Websites and apps were not individually audited beyond search. This is an open item.

### 2.7 Municipal sources

> **Superseded by the full municipal audit:** [project2-research-phase1b-municipal-audit.md](project2-research-phase1b-municipal-audit.md). That audit adds Oeiras and Matosinhos (live machine-readable), the Lisbon works and event layers, the priority-city matrix and the national-aggregation analysis. The notes below are kept for history.

**Lisbon — Condicionamentos de trânsito (EMEL)**
- Dataset: https://dados.gov.pt/en/datasets/condicionamentos-de-transito. Resource: `https://coiapp2.cm-lisboa.pt/file/datahub/950792bf-…` [P].
- Licence CC BY. Format: CSV with GeoJSON geometry (MultiLineString/polygons) per row.
- IDs like `EMEL.condicionamentoTransito.COND-2024-1403-PA-17`. Multi-period validity windows (date and hour ranges) [P].
- **Stale:** 3,414 rows; newest `creation_date` is **2024-10-16**, although the resource is marked as modified 2025-02-04 [P].
- History: yearly CSVs 2018–2022 [P].
- Mostly kerbside and works items: lane narrowing 1,464, parking 972, total closure 178 [P].

**Lisbon — ZER (Zonas de Emissões Reduzidas)**
- Dataset `zonas-de-emissoes-reduzidas` (CC BY). GeoJSON from ArcGIS `services.arcgis.com/1dSrzEWVQn5kHHyK/.../POITransportes/FeatureServer/5` [P].
- Rule content (which vehicles, which hours) is not in the dataset [U].

**Porto — Condicionamentos de trânsito**
- https://dadosabertos.cm-porto.pt/dataset/condicionamentos-de-transito (CKAN). Formats: **DATEX II v3 `SituationPublication`**, GeoJSON (27 MB), CSV [P].
- Content: 1,375 situations (MaintenanceWorks 1,061; RoadOrCarriagewayOrLaneManagement 314).
- IDs are stable URNs (`urn:ngsi-ld:Alert:porto:RoadAlerts:cmp332985`) with `situationVersionTime` and `situationRecordVersionTime` [P].
- `publicationTime` was **2026-09-04T11:00**, while CKAN metadata was modified 2026-10-09. 923 situations are valid on 2026-10-10 by their dates [P].
- Geometry: `AreaLocation` for all records [P].
- **Licence field empty** for this dataset [P].

**Porto — other datasets**
- Condicionamentos não programados: DATEX II file of 2 KB, effectively empty [P].
- ZAAC (restricted-access zones): GeoJSON/CSV, **CC0** [P].
- Loading bays and other items are listed on the NAP [P].
- Porto also runs the VCI movement-registration platform [S].

**Others.** Oeiras (fuel-station layer), Águeda (traffic signs) and Cascais have small municipal layers [P]. Most of Portugal's 278 mainland municipalities publish **nothing** machine-readable on restrictions [U, inferred from dados.gov.pt search returning only Lisbon for "condicionamentos"].

### 2.8 Emergency, civil protection and weather

- **ANEPC**
  - No official live occurrences API or feed was found [P search].
  - dados.gov.pt lists only a community WhatsApp reuse [P].
  - dados.gov.pt also lists ANEPC "Risco de Colapso de Pontes e Túneis" (2019 national risk assessment; licence not specified). It points to a WFS on a **bare IP address over HTTP (`23.95.164.237:8080`)**. Treat this as untrusted or unofficial hosting until verified [P].
- **GNR/PSP.** Publish fire- and event-related closures through press and social media [S]. Not machine-readable.
- **IPMA weather warnings**
  - `https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json` is open JSON (area code, awareness type and level, start and end) [P].
  - It covers warnings, **not road closures**. Licence text not verified [U].

### 2.9 Fuel sources

#### F1 — DGEG "Preços dos Combustíveis Online" (station-level prices)

- **Legal basis.** DL 243/2008 of 18 Dec plus Despacho 3263/2008. Station licence holders must communicate every price change **before applying it**, with day and time [D: https://precoscombustiveis.dgeg.gov.pt/apresentacao/].
- **Coverage:** mainland only [D].
- **Backend (undocumented):** `https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/…` [P]. Endpoints:
  - `GetTiposCombustiveis`, `GetMarcas`, `GetDistritos`;
  - `PesquisarPostos?idsTiposComb=&idMarca=&idTipoPosto=&idDistrito=&idsMunicipios=&qtdPorPagina=&pagina=`;
  - `GetDadosPosto?id=`, `ListarDadosPostos`, `ListarTopPostos`;
  - `PMD` (daily average), `PMDGrafico`.
- **Fuel types** (14) [P]:
  - gasóleo simples / especial / colorido (agricultural, rebated);
  - gasolina simples 95 / especial 95 / 98 / especial 98, 2-stroke mix;
  - GPL Auto; GNC (€/kg and €/m³); GNL (€/kg); biodiesel B15; heating gasoil.
  - **No AdBlue** [P].
- **Station record:**
  - in search results: `Id`, `Nome`, `Marca`, `TipoPosto` (Outro / Auto-estrada / Área comercial), `Municipio`, `Distrito`, `Morada`, `Localidade`, `CodPostal`, `Latitude`, `Longitude`, `Preco` (string "1,999 €"), `DataAtualizacao` (minute precision, no timezone) [P];
  - in detail: `Utilizacao` (Pública), `Sentido` (motorway direction, often null), opening hours, services, payment methods, and **all fuels with a per-fuel timestamp** [P].
- **Completeness, gasóleo simples, 2026-10-10 ~13:00 local** [P]:
  - 2,859 stations; 0 without coordinates; 0 duplicate IDs; 121 typed "Auto-estrada".
  - Timestamp age: ≤1 day 718; ≤7 days 2,123; ≤30 days 18; oldest 17 days.
  - Price range €1.939–€2.399, median €2.224.
  - GPL Auto: 428 stations [P].
- **Timestamp semantics.** `DataAtualizacao` is most plausibly the time of the *last communicated change*, not a re-confirmation [U]. An unchanged price can therefore look "old" while still being current, because stations must notify only changes. Project 2 must model this as `validFrom`, not `observedAt`.
- **Price basis.** Retail public price (PVP) per litre. Inclusion of VAT and ISP is implied by "preço de venda ao público" but **not stated in the API** [U].
- **Station history:** **not exposed.** Only the current price per fuel [P]. Project 2 would have to build history by snapshotting.
- **National history.** `PMD` returns daily mainland averages back to 2015 (sparse in 2015) [P].
  - Fields: `NumPostos`, `PrecoMedio`, `PrecoMedioSDesc` (without discounts), `DescPadrao`, `PrecoMin`, `PrecoMax`.
  - On 2026-10-09: diesel average €2.146 over 1,795 stations [P].
  - Averages are weighted by recent sales and include fleet-card discounts [D].
- **Station identity.** Integer `Id` (e.g. 65840) appears stable and is the key for `GetDadosPosto` [P]. Multi-week stability untested.
- **Terms.** *"A informação disponível neste sítio é gratuita, podendo ser utilizada livremente. É proibida a sua utilização para fins comerciais."* Content protected by copyright and related rights [P, page footer].
- **Access, CORS, rate limits.**
  - No authentication; robots.txt disallows only `/media/*` and `/files/*` [P].
  - CORS headers not checked [U]. Rate limits undocumented [U].
  - The "Registo / Área Reservada" is for **reporting stations and LPG sellers**, not data consumers [P].
  - An older Waze forum post mentions an "Entidade Protocolada" access route [S, very old]. **Worth asking DGEG.**

#### F2 — DGEG station locations (open)

- Dataset: https://dados.gov.pt/en/datasets/postos-de-abastecimento-de-combustiveis-para-veiculos-rodoviarios. WFS: `https://servergeo.dgeg.gov.pt/arcgis/services/Visualizadores/PACVR/MapServer/WFSServer` [P].
- **CC BY 4.0.** Explicitly an **HVD** under Implementing Regulation (EU) 2023/138 [P].
- 3,367 features (mainland, public and cooperative use) [P].
- Fields: `OBJECTID`, `Marca`, `Latitude`, `Longitude`, `Inspire_ID` (`IDDGEG_PACVR_n`), `globalid` [P].
- **No name, no address, no prices, and no key shared with F1.** Joining F1 to F2 requires spatial matching plus brand [P].
- dados.gov.pt marks it "punctual", last modified 2024-12-30. WFS resource metadata says 2026-09-28 [P].

#### F3 — DGEG DATEX II alternative-fuel feed (via NAP)

- `https://ws-precoscombustiveis.dgeg.gov.pt/v1/PrecoComb/DatexCombustiveisAlternativos` [P].
- DATEX II v3 `EnergyInfrastructureTablePublication`, 1.56 MB, `publicationTime` = request time [P].
- 619 sites (fuelType lpg 428, biodiesel 216, liquidGas 14) [P].
- Name, address, coordinates, opening hours, payment method. **No prices** [P].
- Site IDs are sequential (`id="1"`, …). Stability unknown [U].
- NAP record licence: "Sem licença – Sem contrato" [P].

#### F4 — EU Weekly Oil Bulletin (European Commission)

- Weekly national average prices with and without taxes. History file from 2005 [S: EC newsroom notices; https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en].
- National granularity only. Third parties republish it under CC BY 4.0 with attribution [S: fuel-prices.eu]. The Commission's own reuse notice still needs direct verification [U].

#### F5 — INE

- Monthly fuel sales volumes and similar series (CC BY) [P].
- Statistical context only.

#### F6 — Azores and Madeira

- The Azores government dataset on fuels (`combustiveis-regiao-autonoma-dos-acores-raa`, licence not specified) [P].
- Islands use regulated maximum prices. Not audited.

#### F7 — Brand apps, aggregators and fleet cards

- Galp, Repsol, BP and others publish locators. Repsol advises checking AdBlue prices at the station [S].
- Third-party aggregators republish DGEG data [S]. That is a rights risk, not a source.
- Fleet-card networks (DKV, UTA, Galp Frota, etc.) hold transaction-level prices for their customers [U]. This is commercial and needs a contract.
- **These are the only plausible routes to AdBlue prices** [U].

#### F8 — EV charging (MOBI.E)

- DATEX II static and dynamic feeds via NAP: `https://ev-nap.mobie.pt/integration/nap/evChargingInfra` and `.../evActualStatus` [P, NAP records]. Payload not probed.
- Tariffs: the regulated ERSE component plus free CPO pricing. No public per-charger price feed found [S]. Low relevance for HGV diesel fleets.

### 2.10 Non-official comparators

**OpenStreetMap** (ODbL; Geofabrik taginfo, data until 2026-10-08) [P]. Counts are of highway ways unless stated:

| Tag | Count |
|---|---|
| `highway` | 1,612,830 |
| `maxweight` | 989 |
| `maxheight` | 4,667 (+623 nodes) |
| `maxwidth` | 454 |
| `maxlength` | 55 |
| `maxaxleload` | 6 |
| `hgv=no` | 770 |
| `hazmat` | 126 |
| `amenity=fuel` | 3,533 objects (close to DGEG's 3,367) |

- Useful as a **candidate-generation** layer, never as authority.
- ODbL share-alike creates obligations if mixed into a published database [D: ODbL].

**Commercial providers.** TomTom (Intermediate Traffic Service in DATEX II, SRTI API, Map API — listed on NAP), HERE and INRIX [P/U]. These are licensed products, not authoritative road-owner data.

---

## 3. Source matrix

Confidence = confidence in the *source as truth for its scope*, not in its completeness.

| # | Source | Authority | Category | Coverage | Granularity | Geometry | Format | Machine-readable? | Freshness (observed) | Historical? | Licence / reuse | Access method | Confidence | Major limitations | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 | NAP Portugal RTTI/SRTI/SSTP (IP + 7 concessionaires) | Statutory NAP (IMT) | Live conditions, safety events, truck parking | National, multi-operator | Event | Unknown (DATEX II) | DATEX II | Yes (after approval) | **Unknown**; public map stale (2021) | Unknown | Unknown (behind registration) | Register + admin approval | Unknown→High if live | Gatekeeping; opaque terms; 2021 public sample | **P0 (blocked, pursue)** |
| S2 | IP "Trânsito em Tempo Real" ArcGIS layers | Road owner | Accidents, occurrences, works/restrictions | IP network (EN/IC/IP/ER, few A) | Event | Point only | ArcGIS REST JSON/GeoJSON | Yes (undocumented) | Newest obs 2026-09-16 (~24 d) | No (snapshot to build) | **Commercial use excluded** (IP terms) | Anonymous REST via ArcGIS proxy | Medium | Stale-looking; expired items active; no extent geometry; proxy URL fragile | **P0 research / P1 commercial-blocked** |
| S2b | IP "Alertas · Rodovia" works notices (Drupal CMS) | Road owner | Planned works, closures, alternating traffic, diversions | IP network (mostly EN/IC/IP/ER, some A) | Notice | **None** (text: road + km + municipality) | Drupal JSON:API (JSON) + HTML | Yes (undocumented JSON:API) | **Newest 2026-10-09; 35 new in 30 d** | Published back to 2025-04-04; expired notices kept; revisions not public | **Commercial use excluded** (IP terms) | Anonymous JSON:API GET | Medium-High | Validity, location and type in free text only; no geometry; API not officially offered | **P0 research / P1 commercial-blocked** |
| S3 | IP Rede Rodoviária Nacional | Road owner | Base network | National RRN + municipal links | Road segment | Lines | Shapefile (zip) | Yes | Updated 2026-04-15 | Versions on dados.gov (resource URLs dated) | **CC BY 4.0** | Bulk download, udata API | High | No IDs, no chainage, no restrictions | **P0** |
| S4 | IP INSPIRE motorways 1:10k | Road owner | Base motorway network | National motorways | Segment | Lines | WFS (INSPIRE) | Yes | 2025-01-21 | No | **CC BY 4.0** | WFS | High | Motorways only | P1 |
| S5 | Portaria 281/2019 (+163/2021) ADR | Government (law) | ADR time/road bans, 25 de Abril, tunnels mechanism | Mainland | Named sections | None | Legal text (DR) | No | Stable (law) | Yes (DR history) | Official acts: no copyright on legislation (PT CDADC art. 8) [U, legal review] | Manual curation | High | Textual sections; manual geocoding | **P0 (curated)** |
| S6 | DL 132/2017 (+59/2023, 195/2026?) weights/dims | Government (law) | National vehicle limits | National | Rule | None | Legal text | No | Law | Yes | As S5 | Manual | High | National defaults, not per-road | P1 (curated) |
| S7 | DL 155-A/2026 Porto VCI ban | Government (law) | HGV access restriction | VCI Porto | Corridor + time | None | Legal text + IMT news | No | In force 2026-09-15 | Yes | As S5 | Manual | High | Exemptions require registration context | **P0 (curated)** |
| S8 | IMT tunnel-category deliberations | IMT | ADR tunnel categories | Per tunnel | Tunnel | None | DR deliberations | No | Unknown | Yes | As S5 | Manual search DR | High (if found) | **No consolidated list found** | P1 (find) |
| S9 | IMT toll tables 2026 | IMT (regulator) | Toll tariffs by section and class | 6 concession groups | Section × class | None | HTML tables | Partly (scrape) | 2026 tables | Yearly pages (web archive) | IMT site terms not reviewed [U] | Scrape HTML | High | Partial coverage; no plaza IDs or geometry | P1 |
| S10 | Lei 37/2024 ex-SCUT | Parliament (law) | Toll removal | 7 motorways | Motorway/section | None | Law | No | 2025-01-01 | Yes | As S5 | Manual | High | Section boundaries textual | P1 (curated) |
| S11 | Porto DATEX II restrictions | Municipality | Planned works/lane management | Porto municipality | Situation | Area | DATEX II v3, GeoJSON, CSV | Yes | publicationTime 2026-09-04 | Versioned records | **Not specified** | CKAN download | Medium-High | Weekly/monthly cadence?; licence blank | **P1** |
| S12 | Porto ZAAC | Municipality | Access-restricted zones | Porto | Zone | Polygon | GeoJSON/CSV | Yes | 2026-09-04 | No | **CC0** | CKAN | High | Rules text not in data | P2 |
| S13 | Lisbon condicionamentos (EMEL) | Municipality | Works/kerbside restrictions | Lisbon | Event, multi-period | Lines/polygons | CSV + GeoJSON col | Yes | **Newest 2024-10-16 (stale)** | Yearly 2018–2022 | CC BY | Download | Medium (historical) | Stale live file | P2 |
| S14 | Lisbon ZER | Municipality | Low-emission zones | Lisbon | Zone | Polygon | GeoJSON (ArcGIS) | Yes | Resource 2026-01-05 | No | CC BY | ArcGIS query | Medium | Rule semantics missing | P2 |
| F1 | DGEG Preços dos Combustíveis Online | National regulator (mandatory reporting) | **Station-level fuel prices** | Mainland, all public stations | Station × fuel | Point (lat/lon) | JSON (undocumented) | Yes (undocumented) | 99.4% ≤7 d; max 17 d | Station: **no**; national daily avg since 2015 | **Free use; commercial use prohibited** | Anonymous JSON GET | **High** (legal duty to report) | No AdBlue; no station history; ToS bar; undocumented API | **P0 (rights-blocked for commercial)** |
| F2 | DGEG station locations (WFS) | DGEG | Station registry | Mainland, 3,367 stations | Station | Point | WFS 2.0 (GML) | Yes | WFS 2026-09-28 | No | **CC BY 4.0, HVD** | WFS | High | Brand + coords only; no key to F1 | **P0** |
| F3 | DGEG DATEX II alt-fuels | DGEG via NAP | LPG/biodiesel/LNG station facilities | Mainland, 619 sites | Site | Point | DATEX II v3 | Yes | Generated on request | No | "Sem licença" | HTTP GET | Medium | No prices; sequential IDs | P2 |
| F4 | EU Weekly Oil Bulletin | European Commission | National average prices | PT national | Country × week | None | XLSX/PDF | Yes | Weekly | **Since 2005** | EC reuse policy (verify) | Download | High | National only | P1 (fallback/benchmark) |
| F7 | Fleet-card / brand data | Commercial | Transaction / station prices incl. AdBlue | Network-dependent | Station / transaction | Point | Contract | Contract | Contract | Contract | Commercial licence | API under contract | Medium | Cost; partial networks | P3 (later) |
| W1 | IPMA warnings | National met. authority | Weather warnings (context) | Mainland + islands by area | Warning area | Area codes | JSON | Yes | Live (probed) | Not via this endpoint | IPMA open data (verify) | GET | High | Not road closures | P2 |
| E1 | ANEPC risk of bridge/tunnel collapse | ANEPC | Hazard mapping (2019) | National | Feature | Unknown | WFS on bare IP | Unclear | 2021 | No | Not specified | WFS (untrusted host) | Low | Suspicious host; not operational limits | P3 |
| O1 | OpenStreetMap | Community | maxweight/maxheight/hgv/hazmat | National, sparse | Way | Lines | PBF/Overpass | Yes | Daily | Full history | **ODbL** (share-alike) | Download | Low-Medium | Sparse (989 maxweight ways); unofficial | P2 (candidates only) |
| C1 | TomTom / HERE / INRIX | Commercial | Traffic, incidents, restrictions | National | Event/segment | Lines (OpenLR) | DATEX II / proprietary | Yes | Real-time | Paid | Commercial licence | API under contract | Medium | Not authoritative; cost | P3 |

---

## 4. Road-intelligence category coverage

Legend: ● published and machine-readable · ◐ partial, free-text, stale or rights-blocked · ○ legal text only · ✕ not found.

### Temporary and dynamic conditions

| Category | Best official source | Coverage verdict |
|---|---|---|
| Road works | S2 (IP) ◐ points + text, commercial-blocked; S1 NAP (unknown); Porto S11 ● | IP network only, stale-looking. Concessionaire works only via NAP. Porto good; Lisbon stale |
| Closures | S2 ◐ (in restrictions/occurrences text) | Free text "corte total"; no extent geometry |
| Lane closures | S2 ◐ text; Porto S11 ● (`RoadOrCarriagewayOrLaneManagement`) | Partial |
| Alternating traffic | S2 ◐ text ("alternad…", 11 items) | Free text only |
| Incidents | S2 layers 0/1 ◐ | IP network; 26 accidents marked active, all with no end date. Lifecycle questionable |
| Temporary diversions | S2 ◐ text ("desvio", 16 items) | Diversion route not structured |
| Temporary speed limits | S2 ◐ text ("km/h", 4 items) | Rare, unstructured |
| Event restrictions | Municipal notices / IP pareceres ✕ | Not published as data (seen only as PDFs, e.g. Porto parish notices) |
| Weather-related closures | S2 ◐ (EnvironmentalObstruction, 38); IP storm pages ◐ | Warnings via IPMA ● (not closures) |
| Temporary HGV restrictions | S2 ◐ free text (4 items mention pesados/toneladas) | Must be NLP-extracted, then reviewed |

### Permanent restrictions

| Category | Source | Verdict |
|---|---|---|
| Max gross weight (national) | DL 132/2017 ○ | National rule only |
| Max weight per road/bridge | IP S2 free text ◐ (Ródão); OSM ◐ (989 ways) | **Major gap.** IP manages ~5,800 structures ("obras de arte") [D] but publishes no structural-limit list |
| Axle weight | DL 132/2017 ○ | No per-road data (OSM: 6 ways) |
| Height | OSM ◐ (4,667 ways); VCI height criterion ○ | No official clearance inventory found |
| Width / length | DL 132/2017 ○; OSM ◐ | Gap |
| Vehicle-class / HGV bans | DL 155-A/2026 (VCI) ○; municipal ZAAC/ZER ● zones; OSM `hgv=no` ◐ | Fragmented; municipal by-laws not collected |
| ADR / dangerous goods | Portaria 281/2019 ○ (roads, times, 25 de Abril) | Textual; geocoding required |
| ADR tunnel categories | IMT deliberations ○ | **No consolidated list found** |
| Time-of-day restrictions | Portaria 281/2019 ○; VCI ○; Lisbon/Porto loading rules ○ | Textual |
| Access / environmental zones | Lisbon ZER ●, Porto ZAAC ● (geometry only) | Rule semantics missing |
| Bridges / tunnels / structures | ANEPC 2019 hazard WFS (untrusted) ✕ for limits | Gap |
| Special authorisation | IMT AET ○ | Exists as a process; not published |

### Tolls and concessions

| Category | Source | Verdict |
|---|---|---|
| Toll roads / sections | IMT tables ◐ (6 groups), Lei 37/2024 ○ | Partial; HTML |
| Toll classes | Classes 1–4 used everywhere; **definition not on IMT page** [P] | Needs the legal source of the class definitions (open question) |
| Concession / operator | IMT concessions page, AMT report ◐; S3 `gestao` (type only) | Manual mapping |
| Toll changes | IMT yearly tables; press | Year-over-year diff by scraping |
| Plazas / gantries | portugaltolls.com HTML; IP map link dead | **Gap** |

---

## 5. Fuel-price and station-price research

### 5.1 Can Project 2 obtain price per station?

**Technically yes. Commercially not yet.**
- DGEG F1 is the authoritative source: legally mandated pre-notification, about 2,860 diesel stations, minute-precision change timestamps, stable station IDs, coordinates, brand, address and motorway type.
- It is the single source that meets the "price per fuel station" requirement for diesel, petrol, LPG, CNG and LNG.
- Two things block commercial use:
  1. the portal's explicit commercial-use prohibition [P];
  2. the lack of an official API or licence.
- Whether a ToS clause on a public-sector portal can restrict reuse of data subject to the Portuguese open-data/PSI law (Lei 68/2021, transposing Dir. 2019/1024) is a **legal question, not a technical one.** See §7.

### 5.2 Field-level assessment against the requested model

| Requirement | F1 DGEG prices | F2 DGEG locations | F4 EU bulletin |
|---|---|---|---|
| Official | Yes (mandatory reporting) | Yes | Yes |
| Station-level | **Yes** | Yes (no price) | No |
| Coordinates | Yes (WGS84 decimal) | Yes (WGS84 + PT-TM06) | — |
| Diesel / petrol | Yes (7 road grades) | — | Yes (averages) |
| AdBlue | **No** | — | No |
| LPG | Yes (428 stations) | — | Yes (avg) |
| CNG/LNG | Yes | — | — |
| Price incl. VAT | PVP, presumed incl. taxes [U] | — | With/without taxes |
| Update frequency | On every change (legal duty) | Irregular | Weekly |
| Price timestamp | `DataAtualizacao`, per fuel, minute precision, local time without zone | — | Week date |
| Historical | Station: no. National daily avg: 2015→ | No | 2005→ |
| API/feed | Undocumented JSON | WFS | XLSX |
| Reuse rights | **Non-commercial only (stated)** | CC BY 4.0 (HVD) | EC reuse (verify) |
| Cost | Free | Free | Free |
| Completeness | 2,859 diesel stations vs 3,367 registered stations (≈85%; not all stations sell gasóleo simples) | 3,367 | National |
| Latency | Pre-notified, so effectively zero at source [D] | — | ~1 week |
| Station ID | Integer `Id` | `Inspire_ID` / `globalid` | — |
| Track a station over time | Yes, by snapshotting `Id` | Yes | — |

### 5.3 Recommended fuel model (refines the brief)

```text
FuelStation
  id                      -- Project 2 stable ID (uuid)
  sourceIds[]             -- {source:'dgeg-prices', id:'65840'}, {source:'dgeg-pacvr', id:'IDDGEG_PACVR_1'}, {source:'osm', id:'n123'}
  name, brand, operator?, address, postcode, municipality, district
  lat, lon, locationSource, locationConfidence
  stationType             -- 'motorway' | 'hypermarket' | 'other' (DGEG TipoPosto)
  motorwayDirection?      -- DGEG 'Sentido'
  usage                   -- 'public' | 'cooperative'
  fuelsOffered[]
  matchEvidence           -- how F1↔F2↔OSM were joined (distance m, brand match, reviewer)

FuelPriceObservation
  stationId, fuelType (normalised + sourceFuelLabel)
  pricePerUnit, unit ('L' | 'kg' | 'm3'), currency 'EUR', taxBasis ('PVP-presumed-incl-VAT')
  sourceValidFrom         -- DGEG DataAtualizacao, interpreted as Europe/Lisbon, the "price since" time
  observedAt              -- when Project 2 saw it (fetchedAt)
  firstSeenAt / lastSeenAt -- run-length encoding: one row per distinct price, not per poll
  source, snapshotId, parserVersion
  confidence              -- derived from age since sourceValidFrom and source class
  supersededBy?           -- next observation; never overwrite
```

The key design point: DGEG gives a *validFrom* (time of the last change), not a re-observation. "Price change since last observation" is then a diff between consecutive `FuelPriceObservation` rows for the same `stationId` and `fuelType`. History accumulates only from Project 2's own snapshots.

### 5.4 Fallback hierarchy

1. **DGEG F1 station price** — authoritative; use only under granted rights.
2. **Contracted fleet-card or brand price feed** — commercial; the only plausible AdBlue source.
3. **DGEG `PMD` daily national average** — same licence question as F1; national benchmark.
4. **EU Weekly Oil Bulletin** — national, weekly; cleanest reuse status; benchmark and sanity check.
5. Never infer a station price from neighbours and present it as an observation. If it is estimated, label it `estimated` and keep it in a separate record class.

### 5.5 Feasibility of the target questions

| Question | Feasible? | Notes |
|---|---|---|
| Cheapest diesel stations along a corridor | Data yes (F1). Corridor intersection belongs to FleetOS | Project 2 publishes stations plus prices only |
| Latest known diesel price near a stop | Yes | With `sourceValidFrom` age shown |
| Expected refuelling cost at station X | Yes (price × litres) | Fleet-card discounts are not in F1 (`PrecoMedioSDesc` shows discounts exist) |
| Price change since last observation | Yes, after Project 2 has accumulated snapshots | No source history exists |
| AdBlue price | **No official source** | Commercial only |

---

## 6. Provenance recommendations

Every published record carries a provenance envelope. Nothing is ever overwritten in place.

```text
SourceRegistryEntry           -- one per source (S1…F4)
  sourceKey, organisation, authorityLevel ('road-owner'|'regulator'|'law'|'municipality'|'community'|'commercial')
  endpoint/URL, accessMethod, licence, licenceEvidenceUrl, licenceCheckedAt, termsSnapshotId
  commercialUseStatus ('permitted'|'prohibited'|'unknown'|'contracted')

Snapshot                      -- one per fetch
  snapshotId, sourceKey, requestUrl, fetchedAt (UTC), httpStatus, contentHash (sha256)
  rawBlobRef (immutable object store), byteSize, sourcePublishedAt? (e.g. DATEX publicationTime)

CandidateRecord               -- one per source record per snapshot
  sourceRecordId (DGEG Id, IP objectid, Porto URN, EMEL COND-…)
  snapshotId, parserVersion, normalisedPayload, rawFragmentPointer (byte range / JSON path)
  validFrom, validTo (source), observedAt, sourceVersionTime? (DATEX situationRecordVersionTime)

PublishedRecord (bitemporal)
  recordId, version, validFrom/validTo (real world), recordedFrom/recordedTo (Project 2 knowledge)
  derivedFrom[] candidateIds, reviewStatus ('auto'|'pending'|'approved'|'rejected'|'conflict')
  reviewer?, reviewNote?, confidence, supersedes?
```

**Versioning potential by source:**

| Source | Native version signal | Strategy |
|---|---|---|
| Porto DATEX II (S11) | `situationVersionTime`, `situationRecordVersionTime`, URN IDs | Use native versions. Best in Portugal |
| NAP DATEX II (S1) | DATEX II carries version and versionTime by design [D] | Native, if access is granted |
| IP ArcGIS (S2) | `objectid` + `dataobservacao`; no version field | Snapshot every N minutes; hash attributes per `objectid`; detect create, change and disappear. Test multi-day `objectid` stability first |
| DGEG prices (F1) | Per-fuel `DataAtualizacao` | Run-length price series keyed on (`Id`, fuel); a timestamp change marks a new version |
| DGEG WFS (F2), IP shapefile (S3) | Dataset-level modified date; dated resource URL (`/20260415-170612/`) | Whole-file snapshot; feature-level diff by geometry + attributes (no IDs in S3) |
| Lisbon EMEL (S13) | `entity_id` + `creation_date` | Snapshot diff; flag staleness |
| Laws (S5–S10) | Diário da República publication and consolidation | Manually curated records citing the DR URL, article and amending act, plus a PDF snapshot |

---

## 7. Licensing and reuse findings

This section identifies documented rights and risks. It is not legal advice. Items marked ⚖ need professional review.

| Source | Documented terms | Republish normalised? | Commercial API? | Attribution | Risks |
|---|---|---|---|---|---|
| IP RRN, INSPIRE motorways, DGEG station WFS (S3, S4, F2) | CC BY 4.0 (dados.gov.pt, WFS `Fees` field) | Yes | Yes | Required ("Infraestruturas de Portugal, S.A." / "DGEG", licence link, indicate changes) | DGEG WFS `AccessConstraints`: data property of DGEG, use at the user's responsibility. Compatible with CC BY [U] |
| Porto ZAAC | CC0 | Yes | Yes | Not required (courtesy) | — |
| Lisbon datasets | CC BY | Yes | Yes | Required | Staleness, not rights |
| Porto condicionamentos (S11) | **Licence field empty** | Unclear | Unclear | — | ⚖ Ask Porto Digital or the municipality for an explicit licence. The ZAAC CC0 precedent suggests they would grant one |
| IP live layers (S2) | IP website ToS: personal use; **commercial use excluded without prior written consent** | **No** (without consent) | **No** | — | ⚖ Possible tension with the EU RTTI/SRTI regulations, which require data via NAP under non-discriminatory conditions. **The NAP is the compliant path** |
| NAP RTTI/SRTI (S1) | Behind registration; terms unseen | Unknown | Unknown | Unknown | ⚖ Review the NAP user terms after registering. Reg. 886/2013 requires SRTI to be free *to end users*; Reg. 2022/670 allows licence conditions |
| DGEG prices (F1) | "Gratuita, podendo ser utilizada livremente. **É proibida a sua utilização para fins comerciais.**" Copyright and related rights claimed | **No** (stated) | **No** (stated) | — | ⚖ (a) whether the PSI/open-data law (Lei 68/2021) constrains this restriction; (b) EU sui-generis database right (Dir. 96/9/EC) may protect DGEG's collection; (c) aggregator precedent is not evidence of permission. **Action: formal reuse request to DGEG** |
| DGEG DATEX alt-fuels (F3) | NAP record: "Sem licença – Sem contrato" | Unclear | Unclear | — | ⚖ "No licence" is not "open". Request clarification |
| Legislation (S5–S10) | Official texts. PT copyright code excludes official texts from protection (CDADC art. 8) [U] | Facts and rule encodings: likely yes | Likely yes | Cite DR | ⚖ Confirm. DR's own website terms may govern the *site*, not the law |
| IMT toll tables (S9) | IMT site terms not reviewed | Facts (tariffs) likely; page copy unclear | Unclear | — | ⚖ Review IMT terms; scraping cadence |
| EU Weekly Oil Bulletin (F4) | EC reuse policy (Decision 2011/833/EU) generally permits reuse with attribution [U] | Likely yes | Likely yes | "Source: European Commission, Weekly Oil Bulletin" | Verify the page notice |
| IPMA (W1) | "open-data" path; licence text not checked | Likely | Unclear | — | Verify |
| OSM (O1) | ODbL 1.0 | Yes, with share-alike for derived databases | Yes | "© OpenStreetMap contributors" | ⚖ Keep OSM-derived records in a separately licensed layer to avoid share-alike contamination of official data |
| ANEPC WFS (E1) | Not specified; bare-IP host | Do not use | — | — | Provenance doubt |
| Commercial (C1, F7) | Contract | Per contract | Per contract | Per contract | Cost; redistribution usually forbidden |

Anti-scraping and rate limits:
- No robots.txt block on the DGEG API path. ArcGIS services have no published limits.
- Undocumented endpoints can change without notice.
- **Any production use of an undocumented endpoint without permission is both a stability risk and a terms risk.**

---

## 8. Coverage gaps

| Gap | Fragmentation | Evidence |
|---|---|---|
| Permanent truck **height** limits | No official inventory. OSM covers 4,667 ways out of 1.61 M | [P] taginfo; no IP or IMT dataset found |
| **Bridge and structure weight** limits | None structured. Individual bans surface as free text in IP's live layer (e.g. Ródão, ER18). IP manages ~5,800 structures [D] | [P] S2 text |
| **Municipal HGV access** rules | 278 mainland municipalities. Only Lisbon (ZER, stale restrictions) and Porto (ZAAC, DATEX) publish anything machine-readable. Rules (who, when) are in municipal regulations (PDF) | [P] dados.gov.pt search |
| **ADR** | National rules exist as text (Portaria 281/2019). **No consolidated tunnel-category list** | [D] |
| Temporary **local** restrictions | Municipal and parish notices are PDFs (e.g. Porto Campanhã). Not aggregated | [P] search result PDF |
| **Exact geometry** | IP live data is points only. No national linear referencing (RRN has no chainage or IDs). Porto uses areas; Lisbon uses lines | [P] |
| **Real-time status** | IP layer newest 2026-09-16 (~24 d). NAP public map last item 2021. Concessionaires not reachable without NAP | [P] |
| **Concessionaire** live data | ~7 operators on NAP. None found publicly | [P] |
| **Fuel completeness** | Prices: 2,859 diesel stations vs 3,367 registered (difference likely LPG-only or other-fuel sites [U]). **AdBlue absent.** Islands absent | [P] |
| **Historical** fuel | Station history absent. Must self-accumulate | [P] |
| **Toll** completeness | IMT tables cover 6 groups. Electronic-toll gantry map link broken. Class definitions not on IMT page | [P] |
| Toll classes legal basis | Not found in this audit | Open question |
| Event-related restrictions | Not published as data | — |

---

## 9. Conflict-resolution model

**Rules, in order of application:**

1. **Jurisdiction first.** The record from the authority that manages the road (IP for EN/IC/IP, the concessionaire for its motorway, the municipality for municipal roads, matched via RRN `gestao` plus the concession map) outranks others *for physical conditions on that road*.
2. **Law outranks operational notices for permanent rules** (e.g. Portaria 281/2019 for ADR windows). An operational notice can only *add* a temporary restriction. It never cancels a legal one.
3. **More recent official notice wins within the same authority.** Use `sourceVersionTime`, then `dataobservacao`, then `fetchedAt`. "Recent" means source time, not fetch time.
4. **Explicit beats inferred.** NLP-extracted limits from free text (e.g. "3,5 toneladas") stay `candidate`/`pending` until reviewed. OSM and commercial data never override official explicit data. They may only raise a `conflict` flag.
5. **Expiry does not equal removal.** A record whose `validTo` has passed but which the source still lists as `ativo` (observed on EN222) is published as `status: source-active-past-end`. It is not silently closed or kept as plainly active.
6. **Disappearance is an event.** A record missing from a snapshot becomes `not-seen-since <snapshot>`. Two consecutive misses → `presumed-ended` with low confidence. It is never deleted.
7. **Unresolved conflicts stay visible.** Both records are published, linked by a `ConflictCase`: the two record IDs, the rule that failed, and the reviewer queue. Consumers (FleetOS) receive both plus the conflict flag. There is no fake single answer.
8. **Staleness is surfaced, not hidden.** A per-source `freshnessStatus` (e.g. IP layer "newest observation 24 d old") is published alongside the records.

**Known overlap cases to expect:**
- IP vs concessionaire on interfaces (shared junctions, sections transferred to subconcessions).
- IP live layer vs NAP DATEX from IP (same organisation, two channels): deduplicate by location + time + road + type, and prefer DATEX for version semantics.
- Municipal (Porto) vs IP on EN crossings inside the city.
- Legal VCI ban vs IP/municipal operational notices.
- DGEG F1 vs F2 vs OSM station positions: matched with a distance threshold + brand; unmatched stations kept as separate candidates.
- Porto `publicationTime` (2026-09-04) vs CKAN modified (2026-10-09): trust the payload time.

---

## 10. Candidate ingestion architecture (research level)

```text
                 ┌────────────── Project 2 (owns) ───────────────────────────────┐
 official source │  Acquire        Snapshot          Parse            Normalise  │
 (S1…F4)  ─────▶ │  scheduler ─▶ immutable blob ─▶ parser vN ─▶ candidate record │
                 │  (per-source    + hash, fetchedAt  (per source,   (canonical  │
                 │   cadence,       sourcePublishedAt  versioned)     schema)    │
                 │   ToS gate)                                             │     │
                 │                                                         ▼     │
                 │  Dedup (within source by sourceRecordId; cross-source by      │
                 │         road+location+time+type) ─▶ Conflict detection (§9)   │
                 │                                       │                       │
                 │                    auto-publish ◀─────┤─────▶ review queue    │
                 │                    (explicit official │       (NLP-extracted, │
                 │                     structured data)  │        conflicts,     │
                 │                                       ▼        curated law)   │
                 │                   Published record (bitemporal, provenance)   │
                 │                   + per-source freshness & coverage reports   │
                 └───────────────────────────────┬───────────────────────────────┘
                                                 │  read-only API / export
                                                 ▼
                 ┌──────────── FleetOS (owns) ─────────────────────────────────┐
                 │ route intersection · vehicle/driver/job applicability ·      │
                 │ consequences · planning decisions                            │
                 └──────────────────────────────────────────────────────────────┘
```

**Design constraints that come out of this audit:**
- **ToS gate at acquisition.** Each source carries `commercialUseStatus`. Records from `prohibited` or `unknown` sources are tagged `research-only` and are excluded from any commercial export by construction.
- **Curated-law lane.** Permanent restrictions (Portaria 281/2019, DL 155-A/2026, DL 132/2017, Lei 37/2024) enter as hand-encoded rules. Each rule cites DR URL + article and stores a snapshot of the legal text. Section geometry is digitised against RRN or OSM and marked `geometrySource: digitised`.
- **NLP lane.** Free-text extraction from IP `commentsummary` (vehicle class, tonnage, km ranges, diversions) produces *candidates only*. Never auto-published.
- **Linear referencing.** RRN lacks chainage. Project 2 needs its own road-reference model (road number + km from IP text ↔ geometry) or must defer to OSM-based referencing in a separate licence layer.
- **Cadence (proposed, to validate):**
  - IP ArcGIS: every 5–15 min. A cadence finer than the source's real update rate (which looks slow) is wasteful.
  - DGEG prices: every 30–60 min. The full national pull is about 3 requests (one per main fuel at `qtdPorPagina=9999`).
  - Porto: daily.
  - RRN and WFS: weekly check of the `last_modified` header.
  - Laws: on-change watch.

---

## 11. Recommended first implementation order

1. **Source registry + snapshot store + provenance envelope.** No parsing yet. Every source in §3 is recorded with licence evidence and its `commercialUseStatus`.
2. **Base layers (CC BY):** IP RRN (S3), INSPIRE motorways (S4), DGEG station locations (F2). This gives the referencing frame and the station registry.
3. **Porto DATEX II (S11).** The only open, versioned, ID-stable restriction feed. Use it to prove the DATEX II parser and the bitemporal model. Request an explicit licence in parallel.
4. **Curated legal rules:** Portaria 281/2019 (ADR windows, 25 de Abril), DL 155-A/2026 (VCI), Lei 37/2024 (toll removal). Small, high-value and stable. This proves the curated-law lane.
5. **IP Alertas works notices (S2b), research-only.** Poll the JSON:API on (`uuid`, `vid`, `changed`). Extract road, km, municipality, dates and measure as *candidates* for review. Measure precision against a hand-labelled sample. **Not exportable.**
6. **IP live layers (S2), research-only.** Snapshot diffing, ID-stability test (≥14 days), staleness monitoring, free-text candidate extraction. **Not exportable.**
7. **DGEG prices (F1), research-only.** Run-length price series and F1↔F2 station matching. **Not exportable** until DGEG answers.
8. **Formal access tracks** (start in week 1; results gate steps 5–7 going commercial):
   - (a) NAP registration and RTTI/SRTI access request;
   - (b) written reuse request to DGEG (prices, F3 licence);
   - (c) written request to IP (live layers);
   - (d) Porto licence clarification.
9. **Tolls:** scrape and structure the IMT 2026 tables (S9) into section × class records. Concession mapping follows.

## 12. Top 5 datasets to ingest first

| Rank | Dataset | Why |
|---|---|---|
| 1 | **IP Rede Rodoviária Nacional** (S3) | CC BY, national, official owner. Referencing frame for every other record |
| 2 | **DGEG station locations WFS** (F2) | CC BY + HVD. Official station registry, the anchor for `FuelStation` |
| 3 | **Porto DATEX II condicionamentos** (S11) | Only open, versioned, ID-stable official restriction feed. Proves the DATEX pipeline (licence clarification pending) |
| 4 | **Portaria 281/2019 + DL 155-A/2026 curated rules** (S5, S7) | High consequence for HGV/ADR, stable, legally authoritative, small |
| 5 | **DGEG station prices** (F1), *research mode* | Highest value. Proves the price model and accumulates history now. Commercial release gated on DGEG |

The IP live layer (S2) is deliberately ranked below these. Its observed staleness and commercial-use exclusion make it a validation source, not a foundation, until NAP access is clarified.

## 13. What should NOT be attempted yet

- **Commercial publication** of DGEG price records or IP live-layer records.
- **Building on the IP ArcGIS proxy URL as if it were an API contract.** It is an undocumented ArcGIS Online proxy and can change silently.
- **Auto-publishing NLP-extracted restrictions** (tonnage, height, diversions) from free text.
- **A national bridge/height restriction layer.** No official source exists. Building one from OSM would present community data as authority.
- **Scraping concessionaire websites or apps.** Use the NAP instead.
- **AdBlue price intelligence.** No official source.
- **Inferring "current" status from absence or expiry** (see §9 rules 5–6).
- **Mixing OSM-derived data into the official-record layer** (ODbL share-alike).
- **Using the ANEPC bare-IP WFS.**
- **Anything FleetOS owns:** route intersection, applicability to a vehicle, EU 561, dispatch, cost optimisation.

## 14. Open questions requiring manual verification

1. **NAP:**
   - What do the RTTI/SRTI/SSTP feeds actually contain after registration (per supplier, freshness, geometry, DATEX version)?
   - What are the user terms, and is commercial reuse allowed?
   - What does `active:false` on most information types mean?
2. **IP Alertas portal (S2b):**
   - Is the public JSON:API intended?
   - Would IP publish the notices as open data or via the NAP, ideally with structured road, km, validity and geometry?
   - Are notices ever unpublished, and is there an archive before 2025-04?
   - How do notices relate to ArcGIS restriction records internally (same source system or not)?
3. **IP live layer:**
   - Why is the newest observation 2026-09-16? Is the public layer lagging the internal system?
   - Are `objectid`s stable across days?
   - Will IP grant written consent for reuse, or point to the NAP?
4. **DGEG:**
   - Will DGEG grant a reuse licence for station prices (including commercial)?
   - Does an "entidade protocolada" access route exist?
   - Is the price VAT-inclusive PVP?
   - Is `DataAtualizacao` the last change or the last confirmation?
   - What is the licence for the F3 DATEX feed?
5. **Legal (⚖):**
   - Does Lei 68/2021 (PSI) constrain DGEG's and IP's non-commercial clauses?
   - Does sui-generis database right apply to DGEG's price collection?
   - Confirm that legislation texts are free to encode and republish (CDADC art. 8).
6. **DL 195/2026 (Euro-Modular 32 m / 72 t):** verify in Diário da República. It is currently secondary-source only.
7. **DL 155-A/2026 (VCI):** confirm the publication date and the exact geometry and boundaries of the restricted VCI section.
8. **ADR tunnel categories:** locate the IMT deliberations that assign categories (e.g. Túnel do Marão and urban tunnels) and check whether a consolidated list exists.
9. **Toll classes:** legal source of the class 1–4 definitions. Tariffs for concessions not on the IMT page (Norte, Grande Lisboa, Grande Porto, Costa de Prata, Norte Litoral, subconcessions). Gantry locations (portugaltolls.com).
10. **Porto:** licence for `condicionamentos-de-transito`, actual publication cadence, and why `condicionamentos-nao-programados` is near-empty.
11. **Lisbon:** is there a current restrictions feed replacing the stale EMEL CSV (newest 2024-10-16)?
12. **Concessionaires:** individual audit of Brisa, Ascendi, Lusoponte, Scutvias, AEA, Norscut, Brisal, Douro Litoral and the subconcessions for public feeds or data-sharing programmes.
13. **IPMA and EU Weekly Oil Bulletin:** confirm the licence texts.
14. **ANEPC:** is there any official structured feed for road closures during civil-protection events?
15. **Azores and Madeira:** scope decision. Regulated island fuel prices and regional road authorities were not audited.

---

## Appendix A — Probe log (2026-10-10)

| Time (UTC, approx.) | Request | Result |
|---|---|---|
| ~12:00 | `dados.gov.pt/api/1/organizations/infraestruturas-de-portugal-s-a-1/datasets/` | 5 IP datasets, all CC BY |
| ~12:05 | `coiapp2.cm-lisboa.pt/file/datahub/950792bf…` | 3,414 rows, newest 2024-10-16 |
| ~12:12 | DGEG PACVR WFS `resultType=hits` | `numberMatched=3367` |
| ~12:13 | DGEG `api/PrecoComb/GetTiposCombustiveis`, `PesquisarPostos`, `GetDadosPosto` | 14 fuel types; per-station prices + timestamps |
| ~12:14 | `ws-precoscombustiveis.dgeg.gov.pt/v1/PrecoComb/DatexCombustiveisAlternativos` | DATEX II v3, 619 sites, no prices |
| ~12:10 | NAP `API/api/dashboards/homepage`, `suppliers/all`, `mapElements/all/`, `informationTypes`, `MultimodalSupplies/Search` | 15 suppliers; 1 map element (2021); 233 MMTIS records |
| 12:17 / 12:22 | IP ArcGIS `viajar_na_estrada2024/MapServer/{0,1,2}/query` | 26/87/95 records; newest obs 2026-09-16; IDs stable over 5 min |
| ~12:30 | IP RRN shapefile DBF | 4,077 features; 10 attributes |
| ~12:35 | Porto CKAN `package_show` + DATEX file | 1,375 situations; publicationTime 2026-09-04 |
| ~12:40 | Geofabrik taginfo (data until 2026-10-08) | OSM tag counts in §2.10 |
| ~12:45 | DGEG full diesel pull (`qtdPorPagina=9999`) | 2,859 stations; freshness profile in §2.9 |
| ~12:50 | DGEG `PMD` | Daily averages back to 2015 |
| ~12:50 | `api.ipma.pt/open-data/forecast/warnings/warnings_www.json` | Live JSON warnings |

Probes were single requests at low volume. No authentication was used, and nothing was submitted to any form or registration.

## Appendix B — Primary URLs

- NAP Portugal: https://www.nap-portugal.imt-ip.pt/nap/home
- IP Trânsito em Tempo Real: https://servicos.infraestruturasdeportugal.pt/pt-pt/viajar-na-estrada/transito-em-tempo-real
- IP terms of use: https://www.infraestruturasdeportugal.pt/pt-pt/termos-de-utilizacao-ip
- IP open data note (2020): https://www.infraestruturasdeportugal.pt/pt-pt/acesso-gratuito-dados-digitais-das-infraestruturas-rodoferroviarias
- IP road network page: https://www.infraestruturasdeportugal.pt/pt-pt/rede-rodoviaria-ip
- IP tolls page: https://servicos.infraestruturasdeportugal.pt/pt-pt/portagens-ips
- dados.gov.pt RRN: https://dados.gov.pt/en/datasets/rede-rodoviaria-nacional
- dados.gov.pt DGEG stations: https://dados.gov.pt/en/datasets/postos-de-abastecimento-de-combustiveis-para-veiculos-rodoviarios
- DGEG prices portal and terms: https://precoscombustiveis.dgeg.gov.pt/apresentacao/
- DGEG daily average: https://precoscombustiveis.dgeg.gov.pt/estatistica/preco-medio-diario/
- IMT tolls 2026: https://www.imt-ip.pt/rodoviario/infraestruturas-rodoviarias/rede-rodoviaria/taxas-de-portagem/
- IMT ADR restrictions: https://www.imt-ip.pt/rodoviario/transporte-de-mercadorias-perigosas/autorizacoes-especiais-de-circulacao/
- IMT VCI news: https://www.imt-ip.pt/?p=17781
- IMT concessions: https://www.imt-ip.pt/rodoviario/infraestruturas-rodoviarias/rede-rodoviaria/concessoes-rede-nacional-de-autoestradas-concessionada-mapa-de-concessoes/
- AMT concessions report: https://amt-autoridade.pt/media/5776/concessões_rodoviarias.pdf
- Portaria 281/2019 consolidated (ANTRAM copy): https://antram.pt/attachments/upload/Legisla%C3%A7%C3%A3o/Portaria%20281-2019_consolidada.pdf
- Porto open data: https://dadosabertos.cm-porto.pt/dataset/condicionamentos-de-transito
- Lisbon restrictions: https://dados.gov.pt/en/datasets/condicionamentos-de-transito
- IPMA warnings: https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json
- Geofabrik taginfo Portugal: https://taginfo.geofabrik.de/europe:portugal/
- EU Weekly Oil Bulletin: https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en
