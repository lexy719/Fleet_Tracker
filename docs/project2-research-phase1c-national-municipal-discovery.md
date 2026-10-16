# Project 2 — Research Phase 1c — National Municipal Discovery (all 308 concelhos)

Extends [phase1b (municipal audit)](project2-research-phase1b-municipal-audit.md), and **corrects it** (§9). Full per-municipality matrix (machine-readable): [project2-municipal-discovery-matrix.csv](project2-municipal-discovery-matrix.csv).

Audit date: **2026-10-10**. Research only; nothing ingested. All counts below are from live probes made that day unless marked [S] (secondary) or [U] (uncertain/estimate).

---

## 1. Executive summary

1. **National inventory: 308 municipalities.** The list comes from Wikidata (INE codes): 278 mainland, 11 Madeira, 19 Azores. 306 have a listed official website, and 300 of those answered (6 unreachable or misconfigured; Lisbon's and Oeiras's listed URLs redirect badly).

2. **Live machine-readable municipal restriction data: 4 municipalities, about 11% of population.**
   - **Lisboa**: newly found public JSON API with 707 restrictions, 407 active on the audit day.
   - **Porto**: DATEX II.
   - **Oeiras**: WFS, CC BY.
   - **Matosinhos**: ArcGIS.

3. **Semi-structured backends are far more common than expected.** 60 municipalities (19.5%; 14% of population) run WordPress with the **public REST API (`/wp-json/wp/v2/posts`) returning their traffic-restriction notices as JSON**. The titles, dates, IDs and links are structured; the body text is not. This is the largest machine-reachable channel for municipal notices in Portugal. It was not visible from the web pages.

4. **Publication-quality distribution (all 308, after deep-sample verification):**

   | Tier | Meaning | Municipalities | % of 308 | % of population |
   |---|---|---|---|---|
   | **A** | Live machine-readable restriction feed (API/WFS/DATEX/ArcGIS) | 4 | 1.3% | 11.0% |
   | **B** | Machine-readable but adjacent, stale, template-only or access-protected | 3 | 1.0% | 3.0% |
   | **C** | Dedicated HTML section/list of traffic restrictions | 21 | 6.8% | 16.2% |
   | **D** | Notices only (editais/avisos PDF, news posts) | 144 | 46.8% | 36.1% |
   | **E** | Nothing discoverable by automated + sampled manual search | 130 | 42.2% | 33.0% |
   | **X** | Site unreachable during audit | 6 | 1.9% | 0.7% |

   **Correction for false negatives.** In the 110-municipality deep sample, 7 of 34 "nothing found" results turned out to publish something. Applying that rate to the 94 non-sample E municipalities moves about 19 more into D. **Best estimate: about 62% of municipalities (about 70% of population) publish some road-restriction information; about 38% publish none discoverable.**

5. **Hidden GIS is widespread but almost never operational.**
   - 73 municipalities expose GIS links. **56 expose anonymous ArcGIS REST or GeoServer catalogues** on subdomains, which are not linked prominently from their websites.
   - Their content is planning (PDM), cartography, transport assets, signage and parking.
   - Only Lisbon (City Platform) and Matosinhos serve live restrictions.
   - Gondomar has restriction-type folders (events, public-road occupation, traffic signage) **behind a token**.
   - Gaia has a GeoServer "traffic alerts" layer that has been **abandoned since 2023**.

6. **Freguesias (parishes):** Of 286 parish websites known to Wikidata (about 9% of all parishes), 171 were reachable.
   - 18 mention traffic restrictions, 6 host traffic PDFs, 21 have WordPress traffic posts, and **none has GIS or feeds**.
   - Parish publication is **unstructured, sparse and mostly re-posts municipal notices**, concentrated in Lisbon and Porto-area urban parishes.
   - Parishes are **not** a viable systematic source.

7. **No aggregator.**
   - **CIMs (21) and AMP:** no restriction data. Several CIMs host shared GIS for member municipalities, holding planning and parking only.
   - **AML/TML:** a 178-layer GeoServer of mobility *planning* layers, no operational restrictions.
   - **ANMP and ANAFRE:** nothing.
   - **Port authorities (APDL, APL, APS, APSS, APA, APFF, APRAM, Portos dos Açores):** no road or truck-access data.
   - **ANEPC, PSP, GNR, ANSR:** no feeds.

---

## 2. Method

| Step | What was done | Volume |
|---|---|---|
| Inventory | Wikidata SPARQL: municipalities of Portugal (Q13217644) with INE code, website, population, parent | 308 |
| Website crawl | Homepage + up to 12 candidate pages per municipality (anchors/URLs matching trânsito, condicionamento, avisos, editais, obras, mobilidade, SIG, dados abertos, proteção civil, polícia). Regex for traffic-restriction phrases; extraction of PDF links, ArcGIS/GeoServer/OGC/Lizmap/Google My Maps/CKAN links | ~3,700 page requests |
| CMS APIs | `/wp-json/wp/v2/posts?search=condicionamento de trânsito` (fallback "trânsito"); Drupal `/jsonapi` | 308 |
| Hidden GIS | DNS + HTTP probes of `sig.`, `geo.`, `geoportal.`, `websig.`, `mapas.`, `gis.`, `sigweb.`, `dadosabertos.`, `opendata.` on each municipal domain. `/arcgis/rest/services?f=json` and GeoServer WFS `GetCapabilities` | 308 × 9 hosts |
| ArcGIS Online | Item search per municipality name × traffic/works terms | 308 queries |
| dados.gov.pt | Municipal organisations and dataset counts (from phase 1b) | 188 orgs |
| Recency | Latest date within ±400 chars of a traffic phrase on the traffic pages, plus WordPress post dates | — |
| Deep sample | 110 municipalities across 9 strata (§4). Evidence snippets, site-search probes (Joomla `com_search`, `/pesquisa?q=`, `/?s=`), manual review of every flagged page, deep enumeration of GIS services | 110 |
| Parishes | Wikidata parishes (Q1131296) with website: the same crawl | 286 |
| Other bodies | 21 CIMs + AML/AMP/TML, ANMP, ANAFRE, 9 port authorities, ANEPC, PSP, GNR, ANSR, municipal companies (EMEL, Gaiurb, Porto Digital, Cascais Próxima, Ambifaro, TUB, Lisboa E-Nova), regional governments | 48 |

**Classification rules.**
- **A**: verified live machine-readable restriction records.
- **B**: machine-readable, but adjacent, stale, empty or protected.
- **C**: verified dedicated section or list page (not a single news item).
- **D**: traffic-restriction notices found (HTML, PDF or WordPress posts).
- **E**: none found.
- **X**: unreachable.

Automatic tiers were overridden wherever the deep sample or the earlier audits gave verified evidence.

**Known biases and limits:**
1. Crawl depth is shallow: 12 pages, one level. Sites with JS-rendered menus or search-only access are under-detected (the measured false-negative rate is in §1).
2. WordPress search is relevance-sorted, so "latest" dates from it are a lower bound.
3. Facebook/Instagram-only publication, which is common for small municipalities [U], is invisible to this method.
4. Wikidata parish websites cover only about 9% of parishes and skew to urban, active ones.
5. Probes were low-volume and anonymous. Nothing was submitted or logged into, and access-protected services were not tested beyond the "Token Required" response.

---

## 3. National results

### 3.1 Feature prevalence (all 308)

| Feature | Municipalities | % |
|---|---|---|
| Website reachable | 300 | 97.4% |
| CMS: WordPress / Joomla / Drupal / Liferay / other or unknown | 87 / 42 / 5 / 1 / 173 | — |
| **WordPress REST API reachable** | 78 | 25.3% |
| **…returning traffic-restriction posts** | **60** | **19.5%** |
| Dedicated traffic/restrictions section (verified, tier C or A) | 25 | 8.1% |
| Dedicated roadworks page | ≥5 (Leiria works portal; others implicit) | ~2% |
| Any GIS link (ArcGIS/GeoServer/OGC/Lizmap) | 73 | 23.7% |
| **Anonymous ArcGIS REST or GeoServer catalogue on a municipal subdomain** | **56** | 18.2% |
| Google My Maps embeds | 7 | 2.3% |
| Open-data portal or dados.gov.pt datasets | 25 | 8.1% |
| DATEX II | 1 (Porto) | 0.3% |
| Traffic-restriction PDFs (editais/avisos) linked from crawled pages | 56 | 18.2% |
| Dated traffic notice found | 107 | 34.7% |

### 3.2 Recency of the 172 publishing municipalities (A–D)

| Latest traffic notice found | Municipalities |
|---|---|
| ≤ 30 days (or upcoming) | 42 |
| 31–90 days | 17 |
| 91–365 days | 15 |
| > 1 year | 23 |
| Undated (publishing, but no date extracted) | 75 |

### 3.3 By region

| Region | A | B | C | D | E | X |
|---|---|---|---|---|---|---|
| Mainland (278) | 4 | 3 | 18 | 135 | 113 | 5 |
| Islands (30) | 0 | 0 | 3 | 9 | 17 | 1 |

The per-district breakdown is in the §10 tables.

---

## 4. Deep sample (110 municipalities)

| Stratum | n | A | B | C | D | E | X |
|---|---|---|---|---|---|---|---|
| District capitals | 18 | 2 (Lisboa, Porto) | — | 5 | 8 | 3 | — |
| Island capitals | 4 | — | — | 2 | 2 | — | — |
| Logistics / industrial | 30 | 2 (Oeiras, Matosinhos) | 3 | 4 | 11 | 10 | — |
| Freight corridors (A1/A2/A3/A4/A6/A8/A22/IP/IC) | 24 | — | — | 2 | 11 | 9 | 2 |
| Ports | 5 | — | — | — | 1 | 4 | — |
| Border | 7 | — | — | 2 | 4 | 1 | — |
| Tourism | 6 | — | — | 2 | 3 | 1 | — |
| Rural / interior | 12 | — | — | 1 | 6 | 5 | — |
| Islands (other) | 4 | — | — | 1 | — | 3 | — |

(Strata overlap: e.g. Porto counts as both district capital and port. The table counts each municipality once, in its listed stratum.)

**Verified tier-C dedicated restriction pages:**

| Municipality | Page | Notes |
|---|---|---|
| Vila Nova de Gaia | https://www.cm-gaia.pt/pt/informacao/interrupcoes-de-transito/ | Live list (Oct 2026 entries), each item citing despacho date, process/alvará no., street, parish, dates. Server-rendered HTML; scrapable |
| Maia | `cm-maia.pt/institucional/seguranca-e-protecao/policia-municipal/transito-cortes-na-via-publica` | **Municipal police** list of interruptions |
| Matosinhos | `cm-matosinhos.pt/urbanismo/obras-e-projetos/condicionamentos-de-transito` | Plus the ArcGIS feed (tier A) |
| Torres Vedras | `cm-tvedras.pt/artigos/detalhes/avisos-de-transito-concelho-torres-vedras` | **Rolling daily summary** of restrictions per parish (updated 2026-10-09) |
| Viseu | `cm-viseu.pt` "Avisos & Alertas" category | Frequent (2026-10-09) |
| Tavira | `cm-tavira.pt/site/cortes-e-condicionamentos-de-transito/` | Subscription offered |
| Amarante | `cm-amarante.pt/servicos/avisos-e-editais/corte-condicionamento-de-transito/` | Category of editais |
| Bragança | "Condicionamentos de trânsito" section under Mobilidade | — |
| Castro Marim | Avisos e editais category | 2026-10-07 |
| Monção | "Condicionamento de Trânsito" information section | — |
| Santo Tirso | "Alertas" (interruptions, works) | — |
| Setúbal | `mun-setubal.pt/restricoes-de-transito/` | — |
| Beja | Avisos: "Interrupções e condicionamentos de trânsito" | 2026-10-13 |
| Leiria | Mobility / municipal works portal with traffic changes per works | — |
| Cascais | `cascais.pt/avisos` | Many restriction notices |
| Horta, Ponta Delgada, Ribeira Grande (Azores) | Avisos / "Condicionamento de trânsito" sections | — |
| Barcelos, Arruda dos Vinhos, Sardoal, Santa Maria da Feira | Mobility/communication sections | — |

**Typical tier-D patterns**, verified examples:
- Numbered *editais/avisos* lists: Almodôvar, Lagos, Montijo, Portalegre, Valença, Torres Novas, Mondim de Basto, Sabugal, Óbidos.
- News-feed items: Alcochete, Estremoz, Seixal, Miranda do Douro, Marinha Grande, Faro.
- Coimbra publishes event editais as PDFs.

**Freight-relevant E/weak results:**
- **Ports:** Figueira da Foz, Ílhavo (Port of Aveiro), Portimão and Praia da Vitória show nothing discoverable. Sines has news only.
- **Logistics:** Palmela (Autoeuropa), Azambuja, Loures, Trofa, Ovar (beyond its empty template), Vila Nova de Famalicão, Guimarães, Braga, Amadora.
- **Corridors:** Mealhada and Condeixa-a-Nova were unreachable. Anadia, Grândola, Chaves, Mirandela, Penafiel and Cartaxo show nothing.

---

## 5. Hidden GIS / API services discovered

| Municipality / body | Service | Content | Restriction value |
|---|---|---|---|
| **Lisboa** | `https://lisboa.city-platform.com/percursos/ws/app/public/traffic/closures/` (GeoJSON), `/alternative/`, `/settings/`. Found via the backend of `condicionamentos-transito.cm-lisboa.pt` (linked from the Lumiar parish site); WMS `lisboa.city-platform.com/maps/wms` | **707 restrictions; 407 active 2026-10-10.** Fields: `id`, `pedido` (e.g. COND-2026-19464), `periodos_condicionamentos` [date_min, date_max, hour_min, hour_max, is_interrupted], `morada`, `freguesias`, `restricao_circulacao` (Estreitamento de via 286, Estacionamento 210, Passeio 86, Cortes temporários 54, Corte total 30, Corte num sentido 2…), `impacto`, `motivo`, `panfleto`; MultiLineString. Alternative routes: 0 | **High. Tier A.** Licence not stated (City Platform / CM Lisboa) → research-only until clarified |
| **Gondomar** | `gis.cm-gondomar.pt/arcgis/rest/services`: folders `FeirasEventos`, `OcupacaoViaPublica`, `SinalizacaoTransito`, `Obras_Municipais`, `RedeViaria`, `Outras_condicionantes` | **"Token Required"** (499) on restriction folders. Only a 1-feature transport layer is public | High if opened. **Outreach** |
| **Vila Nova de Gaia / Gaiurb** | `opendata.gaiurb.pt/geoserver`: `gaiaide_sinalizacao:mvw_alrt_transito` (fields: local, descricao, dt_inicio, dt_fim, hora, sentido, entre, alternativ, tipointerr, estado, freguesia, url) | Only **3 features, 2022–23, open-ended**. Abandoned; live data moved to the HTML page | Schema shows Gaia once intended a feed. **Outreach to revive** |
| Valongo | `sig.cm-valongo.pt/arcgis/rest/services` (folders FeirasEventos, Mobilidade, ObrasMunicipais are empty or anonymous-hidden); `OcupacaoPublicaPublicidadeVW` | Public-occupation layer: 11 records, latest 2019 | Low (stale) |
| Seixal | `sig.cm-seixal.pt/arcgis`: `SERV_DASH_INTERV_EXECUTIVO` (509 municipal interventions 2021–2025), `SERV_MOBIL_TRANSPORTES_INTER` (classified road network, bus stops, taxis) | Investment dashboard, no traffic impact | Low-medium |
| Pombal / São Pedro do Sul | `Transito/Sinalizacao_Pombal`, `SINAIS_TRANSITO` Feature/MapServer | Traffic-sign inventories (timed out) | Potential source for **permanent** prohibitions (C-series signs) if validated [U] |
| Fafe | `Publicidade_Ocupacao_Solo` (layer "Ocupação da via pública": 0 features) | Empty | Low |
| Faro | `mapas.cm-faro.pt/geoserver` `urbanismo:obras` (13,111 features) | **Building-permit processes**, not road works. Contains requester names | None (privacy risk) |
| Palmela, Vizela, Trofa, Santiago do Cacém, Nisa, Seia, Vila do Porto, Nordeste, Alcácer do Sal… | Anonymous ArcGIS/GeoServer catalogues | PDM constraints, cartography, transport assets, accidents (Palmela, to 2017), parking | None for live restrictions |
| CIM Alentejo Central | `geo.cimac.pt/arcgis` (19 folders, 56 services) | Member-municipality parking/PDM services | None |
| CIM Médio Tejo, Alto Minho, Região de Leiria (Lizmap), Região de Coimbra, Região de Aveiro, Cávado | Shared geoportals | Planning/cartography | None |
| AML / TML | `geoportal.tmlmobilidade.pt/geoserver` (178 layers) | Mobility-planning layers (road classification, congestion index, shared-mobility zones, HGV accident layer) | Planning context only |
| ArcGIS Online (per-name search) | Genuine PT items: Fronteira "Postura trânsito" survey (2026), Chamusca signage dashboard (2025), Cinfães occurrences form, Entroncamento road assets (2026), Ponte de Lima festival traffic (2015), Valongo traffic map (2021) | Mostly forms, internal or event-specific | Low |
| **WordPress REST** (60 municipalities) | `/wp-json/wp/v2/posts?search=…` | JSON posts with id, date, modified, link, title, content. 13 have a traffic post ≤30 days old in the top 10 results | **Medium.** Semi-structured notices; best national-scale channel |

---

## 6. Freguesias (parishes)

| Measure | Value |
|---|---|
| Parishes in Wikidata (current class) | 3,287 records, of which **286 list a website** (about 9%) |
| Reachable | 171 |
| Mention traffic restrictions | 18 (10.5% of reachable) |
| Host traffic-restriction PDFs | 6 |
| WordPress REST with traffic posts | 21 (mostly Lisbon parishes: Belém, Benfica, Lumiar, Alvalade, Areeiro, Avenidas Novas, Marvila, São Domingos de Benfica, Alcântara; and Porto-area: Ramalde, Ermesinde, Moreira, Mindelo, Leça da Palmeira) |
| GIS / feeds | **0** |

**Patterns:**
- Urban parishes re-post municipal notices (e.g. Belém "Corte de trânsito – Avenida da Índia", 2026-10-08) or link to the municipal portal (Lumiar → Lisbon).
- Some publish their own *editais* for local festivals, markets and processions: Caldelas (Guimarães), Aves (Santo Tirso), Monchique, Moita dos Ferreiros, Santo António dos Olivais (Coimbra), Arca e Ponte de Lima.
- Rural parishes rarely have working websites. 115 of 286 listed sites were unreachable.

**Verdict:** parish-level data is **unstructured, sparse, duplicative and unsuited to systematic ingestion**. The exception would be targeted monitoring of a few urban parishes that publish *independently* (local markets, festivals), and then only for coverage gaps.

---

## 7. CIMs, metropolitan areas, associations, ports, civil protection, police, municipal companies

| Body | Finding |
|---|---|
| 21 CIMs | No restriction data. GIS geoportals (Alto Minho, Cávado, Região de Aveiro, Região de Coimbra, Região de Leiria, Médio Tejo, Oeste, Lezíria, Alentejo Central, Alto Alentejo, Ave) hold planning/cartography; CIMAC hosts member parking services. PDF hits on CIM sites were procurement editais, not traffic |
| AMP | Nothing found |
| AML / TML | Mobility-planning GeoServer (178 layers); no operational restrictions |
| ANMP, ANAFRE | Nothing; no aggregation |
| Ports: APDL (Leixões/Viana), APL, APS (Sines), APSS, APA (Aveiro: `sig.portodeaveiro.pt` unreachable), APFF, APRAM, Portos dos Açores | No road/truck-access restrictions published as data. APDL hosts PDFs (not traffic) |
| ANEPC (prociv), PSP, GNR, ANSR | No feeds of road closures |
| Municipal civil protection (SMPC) | Pages found within municipal sites. Restriction notices appear only as general avisos |
| Municipal police | Maia's Polícia Municipal page is a dedicated interruptions list (tier C). Viseu's municipal police executes cuts (press). Otherwise not separate publishers |
| Municipal companies | EMEL `opendata.emel.pt` returned 403 to the audit client. Porto Digital `opendata.portodigital.pt` unreachable (Porto data is now on `dadosabertos.cm-porto.pt`). **Gaiurb** (Gaia) runs `opendata.gaiurb.pt` GeoServer (see §5). Cascais Próxima unreachable. Ambifaro and TUB have nothing |
| Regional governments | Madeira: `dadosabertos.madeira.gov.pt` (105 datasets, none on roads). Azores portal 403 |
| Diário da República | Municipal traffic regulations as legal text. RSS indices and manual export only; no documented API [S] |

---

## 8. Municipalities worth direct outreach

**Group 1. Formalise and licence existing machine-readable data (highest return):**
1. **Lisboa**: licence and documented access for the City Platform closures API; uptime and terms.
2. **Porto**: licence for the DATEX feed; publication cadence.
3. **Matosinhos**: licence; a version without personal data.
4. **Oeiras**: stable IDs, end timestamps.
5. **Gondomar**: open the token-protected `OcupacaoViaPublica`, `FeirasEventos` and `SinalizacaoTransito` services.
6. **Vila Nova de Gaia / Gaiurb**: revive `mvw_alrt_transito` as the feed behind the live HTML list.

**Group 2. Dedicated pages that could become feeds (each already curates a list):**
Maia (municipal police), Torres Vedras (daily summary), Viseu, Tavira, Amarante, Bragança, Santo Tirso, Setúbal, Beja, Leiria (works portal), Cascais, Castro Marim, Monção, Ponta Delgada, Horta.

**Group 3. WordPress municipalities. Technically reachable today; request licence and a dedicated category or tag:**
Most active (traffic post ≤30 days old): Santiago do Cacém, Angra do Heroísmo, Mêda, Redondo, Nelas, Gondomar, Póvoa de Varzim, Reguengos de Monsaraz, Almodôvar, Vouzela, Arouca, Marco de Canaveses, Cuba. The full list of 60 is in the CSV (`wp_traffic_posts > 0`).

**Group 4. Freight-critical with nothing discoverable. Outreach for *what exists internally*:**
- Ports and logistics: Sines (with APS), Palmela, Azambuja, Vila Franca de Xira, Loures, Alcochete/Montijo, Setúbal port (APSS), Figueira da Foz (APFF), Ílhavo (APA), Viana do Castelo (APDL), Portimão.
- North industrial: Vila Nova de Famalicão, Guimarães, Braga, Trofa, Ovar, Estarreja, Santa Maria da Feira.
- Borders and corridors: Elvas/Caia (A6), Valença (A3), Chaves (A24), Almeida/Vilar Formoso (A25), Vila Real de Santo António (A22), Mealhada and Condeixa (A1).

---

## 9. Corrections to earlier phases

| Earlier statement (phase 1 / 1b) | Correction |
|---|---|
| Lisbon's restrictions are stale (CSV to 2024-10-16); live feed unverified | **Lisbon has a live public JSON API** (`lisboa.city-platform.com/percursos/ws/app/public/traffic/closures/`): 707 records, 407 active. Lisbon → **tier A** |
| Gaia: nothing machine-readable; PDFs/regulations only | Gaia has a **live HTML interruptions list** (tier C) and an abandoned GeoServer alerts layer |
| Maia: PDF notices only | Maia's **municipal police** publishes a dedicated interruptions list (tier C) |
| "Only three municipalities publish current machine-readable restrictions" | **Four** (adding Lisbon), plus **60 with machine-reachable WordPress notice backends** |
| Braga/Coimbra/Viseu/etc. "nothing machine-readable" | Still true for feeds. Viseu (tier C) and Coimbra (tier D, editais) publish regular HTML notices |

---

## 10. Estimate: how much of Portugal has usable machine-readable municipal road data?

| Definition of "usable machine-readable" | Municipalities | % of 308 | % of population |
|---|---|---|---|
| Live structured restriction feed with geometry and validity (tier A) | 4 | **1.3%** | **11.0%** |
| A + machine-readable adjacent/protected (B) | 7 | 2.3% | 14.0% |
| A/B + semi-structured JSON notice backends (WordPress REST with traffic posts) | 66 | **21.4%** | **~22.5%** |
| Any publication of restriction notices (A–D), measured | 172 | 55.8% | 66.3% |
| Any publication, false-negative-adjusted (estimate) | ~191 | **~62%** | **~70%** |
| No discoverable publication (estimate) | ~117 | ~38% | ~30% |

**Interpretation for Project 2:**
- Structured municipal restriction data with geometry covers only about 11% of the population and 1% of municipalities.
- Adding the WordPress notice backends gives about a fifth of municipalities a machine-reachable channel, but that channel needs text extraction and review: location, dates and restriction type are in prose.
- Roughly two-thirds of the population lives in municipalities that publish *something*. Everything outside tier A needs document- or text-level processing.
- About 30–38% of the country (mostly rural and interior, plus several freight-relevant municipalities) publishes nothing discoverable.

**Recommended municipal ingestion design:**
1. **Feed lane:** Lisbon, Porto, Oeiras, Matosinhos.
2. **WordPress-REST notice lane:** 60 municipalities. Poll posts on (`id`, `modified`), extract candidates, review.
3. **HTML-list lane:** the tier-C pages. Snapshot and diff.
4. **PDF edital lane:** sampled; lowest priority.
5. **Outreach** (§8).

---

## 11. Per-district classification (all 308)

Columns:
- **Tier** — A–E/X as defined in §1.
- **Ded. page** — dedicated traffic/restriction section, verified for tier C.
- **GIS** — any GIS link or service.
- **REST/WFS** — anonymous ArcGIS REST or GeoServer catalogue on a municipal subdomain.
- **Open data** — open-data portal or dados.gov.pt datasets.
- **WP-JSON traffic** — number of traffic posts returned (top 10).
- **Traffic PDFs** — traffic-restriction PDFs linked from crawled pages.
- **Latest notice** — latest dated traffic notice found (future dates are announced restrictions).

The full field set (website, CMS, hosts, evidence URL, licence) is in the CSV.

#### Aveiro (19) — tiers: B 1, C 1, D 8, E 8, X 1

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Albergaria-a-Velha | E | · | · | · | · | · | · | — |
| Anadia | E | · | · | · | · | · | · | — |
| Arouca | D | ✓ | · | · | · | 10 | · | 2026-09-11 |
| Aveiro | D | ✓ | · | · | · | · | · | — |
| Castelo de Paiva | E | · | ✓ | · | · | · | · | — |
| Espinho | D | · | · | · | · | · | · | 2026-10-07 |
| Estarreja | D | ✓ | · | · | · | · | 1 | — |
| Mealhada | X | · | · | · | · | · | · | — |
| Murtosa | E | · | · | · | · | · | · | — |
| Oliveira de Azeméis | E | · | · | · | · | · | · | — |
| Oliveira do Bairro | E | · | ✓ | ✓ | · | · | · | — |
| Ovar | B | · | ✓ | ✓ | · | · | · | — |
| Santa Maria da Feira | C | ✓ | · | · | · | · | · | 2027-03-19 |
| Sever do Vouga | E | · | · | · | · | · | · | — |
| São João da Madeira | D | · | · | · | · | · | · | 2026-09-02 |
| Vagos | D | · | ✓ | ✓ | · | · | · | — |
| Vale de Cambra | D | · | · | · | · | · | · | 2026-10-11 |
| Águeda | D | · | · | · | ✓ | · | · | 2027-01-10 |
| Ílhavo | E | · | · | · | · | · | · | — |

#### Açores (19) — tiers: C 3, D 6, E 9, X 1

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Angra do Heroísmo | D | ✓ | · | · | · | 10 | 1 | 2026-10-12 |
| Calheta | E | · | · | · | · | · | · | — |
| Horta | C | ✓ | ✓ | ✓ | · | · | · | 2026-10-08 |
| Lagoa | E | · | · | · | · | · | · | — |
| Lajes das Flores | X | · | · | · | · | · | · | — |
| Lajes do Pico | E | · | · | · | · | · | · | — |
| Madalena | E | · | · | · | · | · | · | — |
| Município do Corvo | D | · | · | · | · | · | · | 2026-09-21 |
| Nordeste | D | · | ✓ | ✓ | · | 1 | 61 | 2026-06-05 |
| Ponta Delgada | C | ✓ | · | · | · | · | · | — |
| Povoação | E | · | · | · | · | · | · | — |
| Praia da Vitória | E | · | ✓ | · | ✓ | · | · | — |
| Ribeira Grande | C | ✓ | · | · | · | · | · | — |
| Santa Cruz da Graciosa | E | · | · | · | ✓ | · | · | — |
| Santa Cruz das Flores | E | · | · | · | · | · | · | — |
| São Roque do Pico | D | · | ✓ | ✓ | · | · | · | — |
| Velas | D | · | · | · | · | 1 | · | 2019-09-02 |
| Vila Franca do Campo | D | · | · | · | · | · | 9 | — |
| Vila do Porto | E | · | ✓ | ✓ | · | · | · | — |

#### Beja (14) — tiers: C 1, D 4, E 9

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Aljustrel | E | · | · | · | · | · | · | — |
| Almodôvar | D | · | ✓ | ✓ | · | 10 | · | 2026-09-23 |
| Alvito | E | · | · | · | · | · | · | — |
| Barrancos | E | · | · | · | · | · | · | — |
| Beja | C | ✓ | ✓ | ✓ | · | · | · | 2026-10-13 |
| Castro Verde | E | · | ✓ | ✓ | · | · | · | — |
| Cuba | D | ✓ | · | · | · | 10 | · | 2026-09-15 |
| Ferreira do Alentejo | E | · | ✓ | ✓ | · | · | · | — |
| Moura | D | · | · | · | · | · | 4 | 2023-11-02 |
| Mértola | E | · | ✓ | ✓ | · | · | · | — |
| Odemira | D | · | · | · | · | · | · | — |
| Ourique | E | · | · | · | · | · | · | — |
| Serpa | E | · | · | · | · | · | · | — |
| Vidigueira | E | · | · | · | · | · | · | — |

#### Braga (14) — tiers: C 1, D 6, E 6, X 1

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Amares | D | · | · | · | · | · | · | — |
| Barcelos | C | ✓ | · | · | · | 10 | · | 2026-09-03 |
| Braga | E | · | ✓ | ✓ | · | · | · | — |
| Cabeceiras de Basto | E | · | ✓ | ✓ | · | · | · | — |
| Celorico de Basto | D | · | · | · | · | · | · | — |
| Esposende | E | · | · | · | · | · | · | — |
| Fafe | D | ✓ | ✓ | ✓ | · | · | 37 | 2026-01-12 |
| Guimarães | E | · | · | · | ✓ | · | · | — |
| Póvoa de Lanhoso | X | · | · | · | · | · | · | — |
| Terras de Bouro | D | · | · | · | · | · | 2 | — |
| Vieira do Minho | E | · | · | · | · | · | · | — |
| Vila Nova de Famalicão | E | · | · | · | · | · | · | — |
| Vila Verde | D | · | · | · | · | 3 | · | 2024-08-30 |
| Vizela | D | · | ✓ | ✓ | · | 10 | · | 2026-07-29 |

#### Bragança (12) — tiers: C 1, D 6, E 5

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Alfândega da Fé | E | · | · | · | · | · | · | — |
| Bragança | C | ✓ | · | · | ✓ | · | · | 2026-10-07 |
| Carrazeda de Ansiães | D | · | · | · | · | · | 2 | — |
| Freixo de Espada à Cinta | E | · | · | · | · | · | · | — |
| Macedo de Cavaleiros | D | · | · | · | · | · | · | — |
| Miranda do Douro | D | · | · | · | · | · | · | — |
| Mirandela | E | · | · | · | · | · | · | — |
| Mogadouro | D | · | · | · | · | · | · | — |
| Torre de Moncorvo | E | · | · | · | · | · | · | — |
| Vila Flor | D | · | · | · | · | · | · | 2026-07-28 |
| Vimioso | D | · | · | · | ✓ | · | · | — |
| Vinhais | E | · | · | · | · | · | · | — |

#### Castelo Branco (11) — tiers: D 8, E 3

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Belmonte | D | · | · | · | · | 10 | · | 2026-08-13 |
| Castelo Branco | E | · | ✓ | ✓ | · | · | · | — |
| Covilhã | D | · | · | · | · | · | · | — |
| Fundão | D | ✓ | ✓ | ✓ | · | · | · | 2026-01-26 |
| Idanha-a-Nova | D | · | · | · | · | · | · | — |
| Oleiros | D | · | ✓ | ✓ | · | 7 | · | 2022-09-07 |
| Penamacor | D | · | · | · | · | · | 1 | — |
| Proença-a-Nova | E | · | · | · | · | · | · | — |
| Sertã | D | · | · | · | · | · | 1 | — |
| Vila Velha de Ródão | D | · | · | · | · | · | 1 | — |
| Vila de Rei | E | · | · | · | · | · | · | — |

#### Coimbra (17) — tiers: D 8, E 7, X 2

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Arganil | D | · | ✓ | ✓ | · | 10 | · | 2025-04-16 |
| Cantanhede | E | · | · | · | · | · | · | — |
| Coimbra | D | · | ✓ | ✓ | ✓ | · | · | — |
| Condeixa-a-Nova | X | · | · | · | · | · | · | — |
| Figueira da Foz | E | · | ✓ | ✓ | · | · | · | — |
| Góis | E | · | · | · | · | · | · | — |
| Lousã | D | · | ✓ | ✓ | · | 7 | · | 2026-04-23 |
| Mira | X | · | · | · | · | · | · | — |
| Miranda do Corvo | E | · | · | · | · | · | · | — |
| Montemor-o-Velho | D | ✓ | · | · | · | · | · | — |
| Oliveira do Hospital | D | · | · | · | · | 6 | · | 2022-06-17 |
| Pampilhosa da Serra | D | · | · | · | · | · | 1 | — |
| Penacova | E | · | ✓ | ✓ | · | · | · | — |
| Penela | E | · | ✓ | ✓ | · | · | · | — |
| Soure | D | · | · | · | · | 4 | 5 | 2026-06-19 |
| Tábua | D | · | · | · | · | · | · | — |
| Vila Nova de Poiares | E | · | · | · | · | · | · | — |

#### Faro (16) — tiers: C 2, D 4, E 10

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Albufeira | E | · | · | · | · | · | 11 | — |
| Alcoutim | E | · | · | · | · | · | · | — |
| Aljezur | D | · | · | · | · | · | · | 2026-07-16 |
| Castro Marim | C | ✓ | · | · | · | · | 1 | 2026-10-07 |
| Faro | D | ✓ | ✓ | ✓ | · | · | · | 2026-10-07 |
| Lagoa | E | · | · | · | · | · | · | — |
| Lagos | D | · | · | · | · | · | · | — |
| Loulé | E | · | · | · | · | · | · | — |
| Monchique | E | · | ✓ | · | · | · | · | — |
| Olhão | E | · | ✓ | ✓ | · | · | · | — |
| Portimão | E | · | · | · | ✓ | · | · | — |
| Silves | E | · | · | · | · | · | · | — |
| São Brás de Alportel | E | · | · | · | · | · | · | — |
| Tavira | C | ✓ | · | · | · | · | · | — |
| Vila Real de Santo António | D | · | · | · | · | · | · | — |
| Vila do Bispo | E | · | · | · | · | · | · | — |

#### Guarda (14) — tiers: D 11, E 3

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Aguiar da Beira | E | · | · | · | · | · | · | — |
| Almeida | D | · | · | · | · | 10 | · | 2026-08-11 |
| Celorico da Beira | D | · | · | · | · | 6 | · | 2026-08-26 |
| Figueira de Castelo Rodrigo | E | · | · | · | · | · | · | — |
| Fornos de Algodres | D | · | · | · | · | 1 | 2 | 2017-08-18 |
| Gouveia | D | ✓ | · | · | · | · | 1 | — |
| Guarda | D | · | · | · | · | 1 | · | 2026-06-25 |
| Manteigas | D | · | · | · | · | 2 | · | 2019-09-23 |
| Mêda | D | · | · | · | · | 5 | · | 2026-10-02 |
| Pinhel | D | · | · | · | · | 1 | · | 2023-04-21 |
| Sabugal | D | · | · | · | · | 10 | · | 2025-10-20 |
| Seia | D | ✓ | ✓ | ✓ | · | · | 1 | — |
| Trancoso | D | · | · | · | · | 2 | · | 2022-10-18 |
| Vila Nova de Foz Côa | E | · | · | · | · | · | · | — |

#### Leiria (16) — tiers: C 1, D 11, E 4

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Alcobaça | E | · | ✓ | ✓ | · | · | · | — |
| Alvaiázere | D | · | · | · | · | · | · | — |
| Ansião | D | · | ✓ | ✓ | · | · | · | — |
| Batalha | D | · | · | · | · | · | · | — |
| Bombarral | D | · | · | · | · | · | · | — |
| Caldas da Rainha | D | · | · | · | · | · | · | — |
| Castanheira de Pera | D | · | ✓ | · | · | · | 124 | 2024-12-16 |
| Figueiró dos Vinhos | D | · | · | · | · | · | 111 | 2026-09-19 |
| Leiria | C | ✓ | · | · | · | · | · | — |
| Marinha Grande | D | · | · | · | · | · | · | 2026-10-03 |
| Nazaré | E | · | · | · | · | · | · | — |
| Pedrógão Grande | E | · | ✓ | ✓ | ✓ | · | · | — |
| Peniche | E | · | · | · | · | · | · | — |
| Pombal | D | · | ✓ | ✓ | · | · | 1 | — |
| Porto de Mós | D | · | ✓ | · | · | · | · | — |
| Óbidos | D | · | · | · | · | · | 1 | 2026-09-30 |

#### Lisboa (16) — tiers: A 2, C 3, D 2, E 9

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Alenquer | E | · | · | · | · | · | · | — |
| Amadora | E | · | ✓ | ✓ | · | · | · | — |
| Arruda dos Vinhos | C | ✓ | · | · | · | · | · | — |
| Azambuja | E | · | · | · | · | · | · | — |
| Cadaval | E | · | · | · | · | · | · | — |
| Cascais | C | ✓ | · | · | ✓ | · | · | — |
| Lisboa | A | ✓ | ✓ | ✓ | ✓ | · | · | 2026-10-10 |
| Loures | E | · | · | · | · | · | · | — |
| Lourinhã | E | · | · | · | · | · | · | — |
| Mafra | E | · | ✓ | · | ✓ | · | · | — |
| Odivelas | D | · | ✓ | ✓ | · | · | · | — |
| Oeiras | A | · | ✓ | ✓ | ✓ | · | · | 2026-10-09 |
| Sintra | E | · | ✓ | ✓ | · | · | · | — |
| Sobral de Monte Agraço | E | · | ✓ | ✓ | ✓ | · | · | — |
| Torres Vedras | C | ✓ | · | · | · | · | · | 2026-10-09 |
| Vila Franca de Xira | D | · | · | · | · | · | · | — |

#### Madeira (11) — tiers: D 3, E 8

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Calheta | E | · | · | · | · | · | · | — |
| Câmara de Lobos | E | · | · | · | · | · | · | — |
| Funchal | D | · | ✓ | · | · | 10 | · | 2026-07-06 |
| Machico | E | · | · | · | · | · | · | — |
| Ponta do Sol | E | · | · | · | · | · | · | — |
| Porto Moniz | E | · | · | · | · | · | · | — |
| Porto Santo | D | · | ✓ | · | · | 5 | · | 2023-09-21 |
| Ribeira Brava | D | · | · | · | · | 6 | 32 | 2026-07-31 |
| Santa Cruz | E | · | · | · | · | · | · | — |
| Santana | E | · | · | · | ✓ | · | · | — |
| São Vicente | E | · | · | · | · | · | · | — |

#### Portalegre (15) — tiers: D 10, E 5

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Alter do Chão | E | · | · | · | · | · | · | — |
| Arronches | E | · | · | · | · | · | · | — |
| Avis | D | · | ✓ | · | · | 10 | · | 2026-09-24 |
| Campo Maior | E | · | · | · | · | · | · | — |
| Castelo de Vide | E | · | · | · | · | · | · | — |
| Crato | D | · | · | · | · | 5 | 65 | 2026-03-30 |
| Elvas | D | · | · | · | · | 7 | · | 2024-01-10 |
| Fronteira | D | · | ✓ | ✓ | · | 4 | 7 | 2026-08-07 |
| Gavião | D | · | · | · | · | 8 | · | 2026-02-05 |
| Marvão | D | · | · | · | · | 10 | · | 2026-09-02 |
| Monforte | D | · | · | · | · | · | 188 | 2021-10-07 |
| Nisa | D | · | ✓ | ✓ | · | · | · | — |
| Ponte de Sor | E | · | · | · | · | · | · | — |
| Portalegre | D | · | · | · | · | 10 | 50 | 2026-10-09 |
| Sousel | D | · | · | · | · | 10 | · | 2025-10-16 |

#### Porto (18) — tiers: A 2, B 2, C 4, D 7, E 3

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Amarante | C | ✓ | · | · | ✓ | 1 | · | 2027-02-20 |
| Baião | D | · | · | · | · | 4 | · | 2026-08-26 |
| Felgueiras | D | · | · | · | · | 8 | 1 | 2025-08-07 |
| Gondomar | B | · | ✓ | ✓ | · | 6 | 3 | 2026-09-25 |
| Lousada | E | · | · | · | · | · | · | — |
| Maia | C | ✓ | · | · | ✓ | · | · | — |
| Marco de Canaveses | D | · | · | · | · | 10 | · | 2026-09-10 |
| Matosinhos | A | ✓ | ✓ | ✓ | · | · | · | 2026-10-26 |
| Paredes | D | · | ✓ | ✓ | · | · | · | — |
| Paços de Ferreira | D | ✓ | · | · | · | · | · | 2026-10-16 |
| Penafiel | E | · | · | · | · | · | · | — |
| Porto | A | · | ✓ | · | ✓ | · | · | 2026-09-04 |
| Póvoa de Varzim | D | · | ✓ | · | · | 10 | · | 2026-09-25 |
| Santo Tirso | C | ✓ | · | · | · | · | 2 | — |
| Trofa | E | · | ✓ | ✓ | · | · | · | — |
| Valongo | B | · | ✓ | ✓ | · | · | 1 | — |
| Vila Nova de Gaia | C | ✓ | · | · | · | · | · | 2027-10-24 |
| Vila do Conde | D | · | ✓ | · | ✓ | · | · | — |

#### Santarém (21) — tiers: C 1, D 12, E 8

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Abrantes | E | · | ✓ | ✓ | · | · | · | — |
| Alcanena | D | · | · | · | · | · | 209 | 2026-11-04 |
| Almeirim | D | ✓ | · | · | · | · | · | — |
| Alpiarça | E | · | · | · | · | · | · | — |
| Benavente | D | · | · | · | · | 10 | · | 2026-06-23 |
| Cartaxo | E | · | · | · | · | · | · | — |
| Chamusca | D | · | · | · | · | · | 3 | — |
| Constância | D | · | · | · | · | · | 3 | 2023-06-21 |
| Coruche | D | · | · | · | · | · | · | — |
| Entroncamento | D | ✓ | ✓ | · | · | · | 4 | — |
| Ferreira do Zêzere | E | · | · | · | · | · | · | — |
| Golegã | E | · | · | · | · | · | · | — |
| Mação | D | · | · | · | · | · | · | 2026-09-09 |
| Ourém | D | · | · | · | ✓ | 7 | · | 2024-08-13 |
| Rio Maior | E | · | · | · | · | · | · | — |
| Salvaterra de Magos | E | · | · | · | · | · | · | — |
| Santarém | D | · | · | · | · | · | · | 2026-09-28 |
| Sardoal | C | ✓ | · | · | · | · | 25 | 2025-05-02 |
| Tomar | E | · | ✓ | · | · | · | · | — |
| Torres Novas | D | · | ✓ | ✓ | · | · | 70 | — |
| Vila Nova da Barquinha | D | · | · | · | · | · | 36 | 2026-09-23 |

#### Setúbal (13) — tiers: C 1, D 10, E 2

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Alcochete | D | · | · | · | ✓ | · | · | 2026-10-14 |
| Alcácer do Sal | D | · | ✓ | ✓ | · | 10 | · | 2026-07-28 |
| Almada | D | ✓ | · | · | ✓ | · | · | 2026-10-21 |
| Barreiro | D | · | · | · | · | · | · | — |
| Grândola | E | · | · | · | · | · | · | — |
| Moita | D | · | · | · | · | · | 8 | — |
| Montijo | D | · | · | · | · | · | 6 | 2026-10-16 |
| Palmela | E | · | ✓ | ✓ | · | · | · | — |
| Santiago do Cacém | D | · | ✓ | ✓ | · | 10 | 4 | 2026-10-09 |
| Seixal | D | · | ✓ | ✓ | · | · | · | — |
| Sesimbra | D | · | · | · | · | · | · | — |
| Setúbal | C | ✓ | · | · | · | 1 | · | 2025-11-06 |
| Sines | D | · | · | · | · | · | 3 | 2026-10-18 |

#### Viana do Castelo (10) — tiers: C 1, D 5, E 4

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Arcos de Valdevez | E | · | · | · | · | · | · | — |
| Caminha | E | · | ✓ | ✓ | · | · | · | — |
| Melgaço | D | · | · | · | · | 1 | · | 2017-11-30 |
| Monção | C | ✓ | · | · | · | · | · | — |
| Paredes de Coura | E | · | · | · | · | · | · | — |
| Ponte da Barca | D | · | · | · | · | · | 1 | — |
| Ponte de Lima | D | · | · | · | · | · | 1 | — |
| Valença | D | · | · | · | · | 10 | 9 | 2026-08-01 |
| Viana do Castelo | D | · | ✓ | · | · | · | · | — |
| Vila Nova de Cerveira | E | · | · | · | · | · | · | — |

#### Vila Real (14) — tiers: D 6, E 8

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Alijó | D | · | · | · | · | · | 9 | — |
| Boticas | E | · | · | · | · | · | · | — |
| Chaves | E | · | · | · | · | · | · | — |
| Mesão Frio | D | · | · | · | · | · | · | 2027-03-31 |
| Mondim de Basto | D | · | · | · | · | · | 35 | 2026-08-06 |
| Montalegre | E | · | · | · | · | · | · | — |
| Murça | E | · | ✓ | · | ✓ | · | · | — |
| Peso da Régua | D | · | · | · | · | · | 2 | — |
| Ribeira de Pena | E | · | · | · | · | · | · | — |
| Sabrosa | E | · | · | · | · | · | · | — |
| Santa Marta de Penaguião | E | · | · | · | · | · | · | — |
| Valpaços | D | · | · | · | · | · | 2 | — |
| Vila Pouca de Aguiar | D | · | · | · | · | · | 21 | — |
| Vila Real | E | · | ✓ | · | · | · | · | — |

#### Viseu (24) — tiers: C 1, D 7, E 16

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Armamar | D | · | · | · | · | · | · | — |
| Carregal do Sal | E | · | ✓ | ✓ | · | · | · | — |
| Castro Daire | E | · | ✓ | ✓ | · | · | · | — |
| Cinfães | D | · | ✓ | ✓ | · | · | · | — |
| Lamego | E | · | ✓ | ✓ | · | · | · | — |
| Mangualde | E | · | ✓ | ✓ | · | · | · | — |
| Moimenta da Beira | E | · | ✓ | ✓ | ✓ | · | · | — |
| Mortágua | E | · | · | · | · | · | · | — |
| Nelas | D | · | · | · | · | 10 | 3 | 2026-09-29 |
| Oliveira de Frades | E | · | · | · | · | · | · | — |
| Penalva do Castelo | D | · | · | · | · | 4 | · | 2026-08-07 |
| Penedono | E | · | · | · | ✓ | · | · | — |
| Resende | E | · | · | · | · | · | · | — |
| Santa Comba Dão | E | · | · | · | · | · | · | — |
| Sernancelhe | E | · | · | · | ✓ | · | · | — |
| Sátão | E | · | · | · | ✓ | · | · | — |
| São João da Pesqueira | E | · | · | · | · | · | · | — |
| São Pedro do Sul | D | · | ✓ | ✓ | · | · | · | — |
| Tabuaço | E | · | · | · | · | · | · | — |
| Tarouca | E | · | · | · | · | · | · | — |
| Tondela | D | · | · | · | · | · | · | — |
| Vila Nova de Paiva | E | · | · | · | · | · | · | — |
| Viseu | C | ✓ | · | · | · | · | · | 2026-10-09 |
| Vouzela | D | · | · | · | · | 10 | · | 2026-09-13 |

#### Évora (14) — tiers: D 10, E 3, X 1

| Municipality | Tier | Ded. page | GIS | REST/WFS | Open data | WP-JSON traffic | Traffic PDFs | Latest notice |
|---|---|---|---|---|---|---|---|---|
| Alandroal | E | · | · | · | · | · | · | — |
| Arraiolos | E | · | · | · | · | · | · | — |
| Borba | D | ✓ | · | · | · | 10 | 1 | 2026-10-09 |
| Estremoz | D | · | · | · | · | · | · | — |
| Montemor-o-Novo | D | · | · | · | · | 10 | 1 | 2023-08-01 |
| Mora | D | · | · | · | · | 4 | 3 | 2023-07-12 |
| Mourão | D | · | · | · | · | 1 | · | 2026-04-20 |
| Portel | E | · | · | · | · | · | · | — |
| Redondo | D | · | · | · | · | 3 | · | 2026-10-02 |
| Reguengos de Monsaraz | D | ✓ | · | · | · | 6 | 2 | 2026-09-25 |
| Vendas Novas | D | · | · | · | · | 6 | · | 2026-05-27 |
| Viana do Alentejo | X | · | · | · | · | · | · | — |
| Vila Viçosa | D | ✓ | · | · | · | 1 | 3 | 2021-01-26 |
| Évora | D | · | · | · | · | 6 | · | 2025-06-03 |
