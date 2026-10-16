# Project 2 — Research Phase 1b — Municipal Road-Restriction Audit (Portugal)

> **Partly superseded by [phase 1c — national municipal discovery](project2-research-phase1c-national-municipal-discovery.md)** (all 308 municipalities). Key corrections:
> - **Lisbon has a live public JSON closures API** (tier A).
> - **Gaia publishes a live HTML interruptions list.**
> - **Maia's municipal police publishes a dedicated list.**
> - **60 municipalities expose traffic notices via the WordPress REST API.**
>
> See phase 1c §9.

Companion to [project2-research-phase1-portugal-source-audit.md](project2-research-phase1-portugal-source-audit.md). This document replaces that document's §2.7 as the authoritative municipal section.

Audit date: **2026-10-10**. Research only; nothing ingested.
Evidence tags as before: **[P]** probed live · **[D]** official document or page · **[S]** secondary/press · **[U]** uncertain.

---

## 1. Executive summary

1. **Machine-readable municipal restriction data exists for very few of Portugal's 308 municipalities (278 mainland).** This audit found only **three** municipalities that publish *current, machine-readable* road-restriction or works data with geometry:
   - **Porto**: DATEX II v3 feed, stable URN IDs, licence field blank.
   - **Oeiras**: WFS + GeoJSON, CC BY, updated the day before the audit, history back to 2019.
   - **Matosinhos**: public ArcGIS service fed by its works-licensing system, current permits, polygons plus diversion lines. Licence unknown; contains requester names.

   **Lisbon** publishes several *adjacent* machine-readable layers:
   - works polygons;
   - licensed event occupations of public space, updated daily;
   - ZER and ZAAC zones.

   Its dedicated restrictions file, however, is **stale** (newest record 2024-10-16) [P].

2. **The other priority municipalities publish nothing machine-readable on restrictions** that this audit could find: Gaia, Maia, Braga, Guimarães, Aveiro, Coimbra, Leiria, Setúbal, Sines, Faro and Viseu.
   - Restrictions appear as PDF *editais* and *avisos* (e.g. Coimbra event editais, Leiria and Maia notices), press releases, or municipal regulations in PDF and Diário da República (e.g. Gaia Regulamento 290/2019) [P/D/S].

3. **Permanent municipal HGV, weight and height rules are essentially never published as data.** They live in municipal regulations, signage and *posturas*.
   - The only structured permanent-access layers found are access-zone polygons: Porto ZAAC (CC0), Lisbon ZAAC/ZER (CC BY), Porto bollards (CC0).
   - Each gives **geometry without the rule semantics** (who, when, which vehicles) [P].

4. **There is no national aggregator of municipal road restrictions.**
   - dados.gov.pt does not even carry Porto's DATEX feed. A "condicionamentos" search there returns only Lisbon's stale file [P].
   - The NAP lists Porto and EMEL but not Oeiras or Matosinhos [P].
   - SNIG (the national geodata catalogue) has nothing on traffic restrictions [P].
   - The de facto aggregator is **Waze for Cities**. Lisbon, Cascais, Oeiras, Sintra, Mangualde and others push closures to it [S/D]. It is a closed commercial platform, not a reusable source.
   - **Diário da República** is the only national aggregator of *legal* municipal traffic regulations, as text.

5. **Recommendation:**
   - Treat Porto, Oeiras and Matosinhos as the P0 municipal ingest set.
   - Treat Lisbon as P1, using its works and event layers plus a request for a current restrictions feed.
   - Treat every other municipality as **document-monitoring** (editais/avisos/regulations → curated records), prioritised by freight relevance.
   - Open licence clarification requests with Porto and Matosinhos before any commercial use.

---

## 2. Method

1. **dados.gov.pt (udata API):**
   - Enumerated organisations. 188 municipal or intermunicipal organisations were found, of which 92 have any dataset [P].
   - Pulled mobility-related dataset titles for 31 priority organisations and searched across 25 Portuguese keywords [P].
2. **Municipal CKAN portals:** Porto (`dadosabertos.cm-porto.pt`, 69 packages) and Cascais (`dadosabertos.cascais.pt`) [P].
3. **ArcGIS Online:**
   - Global item search across 12 Portuguese restriction terms, plus 44 city-name searches.
   - Owner-level listings for municipal GIS accounts: `geodados_CML`, `Matosinhos`, `SIGValongo` and others [P].
4. **SNIG national catalogue:** CSW `GetRecords` for "condicionamentos", "trânsito", "obras", "pesados" and "circulação" [P].
5. **Ubiwhere Urban Platform catalogue** (`map.mobility.ubiwhere.com`), which serves CIM Ave and CIM Cávado: 17 packages [P].
6. **Hostname probes** for likely SIG and open-data subdomains of the priority municipalities [P].
7. **Web search** for each priority municipality's traffic notices, regulations and portals [S].
8. **Not done:**
   - full crawl of every municipal website;
   - review of every municipal regulation in Diário da República;
   - registration-only portals;
   - Waze for Cities data (no access).

lisboa.pt could not be opened in the audit browser, so Lisbon's own restrictions web portal is **unverified** [U].

---

## 3. National aggregation — does it exist?

| Candidate aggregator | What it holds for municipalities | Verdict |
|---|---|---|
| **dados.gov.pt** (AMA) | Harvests some municipal catalogues. A "condicionamentos" search returns only Lisbon (stale). **Porto's DATEX feed is not on dados.gov.pt.** Oeiras's restrictions WFS is listed [P] | Partial and inconsistent. Not an aggregator of restrictions |
| **NAP Portugal** (IMT) | Porto (restrictions, unplanned restrictions, loading bays, ZAAC), EMEL Lisbon (tunnels, parking), CIM Ave/Cávado (parking, EV) [P]. Not Oeiras or Matosinhos. Porto links point to an outdated host | Partial. Some links dead |
| **SNIG / RNDG** (DGT) | No traffic-restriction records found. Planning and road-network layers only (e.g. Sintra, Praia da Vitória) [P] | No |
| **Ubiwhere Urban Platform** (CIM Ave/Cávado) | 17 packages: parking, EV, taxis, cycle lanes for Braga, Guimarães, Famalicão and Barcelos. **No restrictions** [P] | No |
| **Waze for Cities** | Municipal partners push closures, works and events. Named partners: Lisbon, Cascais, Oeiras, Sintra, Mangualde, Brisa [D: Mangualde press note; S: Time Out Lisboa]. Oeiras states it reports its *condicionalismos* to Waze [P: dataset description] | **De facto national aggregator, but closed and commercial.** Not a Project 2 source |
| **Diário da República** (2nd series) | Municipal regulations on traffic, loading and historic-centre access (e.g. Gaia Regulamento 290/2019, published 2019-03-28) [S] | National aggregator of **legal text** only. Searchable, not structured |

**Conclusion.** No aggregator of municipal road restrictions exists. Project 2 would be the first to build one, and it would have to integrate municipalities one by one.

---

## 4. Municipality matrix

Priority: **P0** ingest now · **P1** ingest next or request · **P2** monitor documents · **P3** low.
Tier: **A** live machine-readable restrictions · **B** machine-readable but adjacent, stale or partial · **C** web map only · **D** documents and press only · **E** nothing found.

| Municipality | Source / portal | Machine-readable? | API / feed / file / web | Traffic / works data | Restriction categories | Geometry | Update frequency (observed) | Historical archive | Licence / reuse | Tier | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Porto** | `dadosabertos.cm-porto.pt` (CKAN) — `condicionamentos-de-transito`, `condicionamentos-nao-programados`, `zaac-implementado`, `cargas-e-descargas`, `arruamentos-classificados-para-condicionamentos`, `dissuasores-de-controlo-de-acessos` [P] | Yes | DATEX II v3 XML + GeoJSON + CSV (file download, CKAN API) | Planned works (1,061), lane/carriageway management (314). Unplanned feed effectively empty (2 KB) | Works, lane closures, closures. ZAAC zones. Loading bays. Bollards | Areas (DATEX `AreaLocation`); polygons for ZAAC | DATEX `publicationTime` **2026-09-04**; CKAN metadata 2026-10-09 | Versioned records (URN + version times) back to 2021 | Restrictions: **licence field empty**. ZAAC and other mobility layers: **CC0** | A | **P0** |
| **Oeiras** | `oeirasinterativa.oeiras.pt` — `w_condicionalismos_via_publica` (WFS), `obras_municipais` (GeoJSON/WFS), on dados.gov.pt [P] | Yes | OGC WFS 2.0 (GeoJSON output) + GeoJSON file | **8,127** restriction records; 168 municipal works | Works, traffic restrictions for events (e.g. "43.º Troféu CM Oeiras"), fibre/trench works, signage works, betonagens | Points (EPSG:3763) | `ultima_atualizacao` max **2026-10-09** (1 day old) | **Yes: 2019-02 →**, with state Concluído/Execução/Previsto | **CC BY 4.0** | A | **P0** |
| **Matosinhos** | ArcGIS `CONSERVACAO_CondicionamentosVias` MapServer (layers: Condicionamentos vias, Cortes de vias, Percurso alternativo por corte de via), via `utility.arcgis.com` proxy [P] | Yes (undocumented) | ArcGIS REST JSON/GeoJSON | 9 restrictions + 6 closures active; 29 diversion routes | Lane restrictions, full closures, **diversion routes**, crane and loading operations | Polygons (restrictions/closures), **polylines (diversions)** | Current: permits dated 2026-09-28 → 2027-01-08 | Not exposed (active only) [U] | **Not stated.** ⚠ Contains `Requerente` (requester names, incl. private individuals) and process numbers → GDPR minimisation needed | A | **P0** (request licence) |
| **Lisboa** | dados.gov.pt / `dados.cm-lisboa.pt` (403 to audit client); ArcGIS org `geodados_CML` [P] | Partly | CSV (restrictions); ArcGIS FeatureServer (works, events, zones) | (a) EMEL restrictions CSV: 3,414 rows, **newest 2024-10-16**. (b) `UCT_Intervenções`: 2,264 works polygons + 255 repaving. (c) `UCT_OcupacoesTemporariasEspacoPublico`: **1,031 licensed event occupations**, 27,704 history + 15,795 pre-2021, last edit **2026-10-09**. (d) ZER, ZAAC polygons | Works, repaving, events (sports, filming, demonstrations, cultural), access zones, LEZ | Lines/polygons (EMEL); polygons (works); points (events); polygons (zones) | Events daily; works layer 2026-09-21; restrictions stale | Yes (yearly 2018–2022 CSVs; event history since 2019) | Restrictions & ZAAC: CC BY. Works/repaving: CC0. Events layer: copyright text "CM Lisboa 2026", licence not checked [U] | B | **P1** (request current restrictions feed) |
| **Cascais** | `dadosabertos.cascais.pt` (CKAN), GeoCascais [P] | Yes | CSV/GeoJSON/SHP/GPKG | Parking, paid-parking zones only | Parking | Yes | Daily export (2026-10-09) | — | CC BY / CC0 | B | P2 (Waze partner; ask) |
| **Valongo** | ArcGIS `SIGValongo`: `Condicionamentos de Transito (Valongo Romano)`; municipal works hub [P] | Yes | ArcGIS REST | **Event-specific** (one festival): one-way, no-entry | Event closures, one-way changes | Points + lines | 2026-05-05 (event) | No | Not stated | B | P2 |
| **Ovar** | ArcGIS (`cmo`): `Plataforma de Trânsito` (signal deactivation, diversions, no-entry, direction changes, interrupted traffic, provisional diversions) [P] | Yes | ArcGIS REST | **Template with empty attributes** (fields blank) | Diversions, one-way changes, closures | Points + lines | 2023-11 | No | Not stated | B | P3 (structure good, content empty) |
| **Águeda** | dados.gov.pt [P] | Yes | GeoJSON/SHP/GPKG | Traffic-sign inventory (2020), coexistence zones (2021), traffic-count sites | **Signage** (could encode prohibitions), shared zones | Yes | 2020–2021 (stale) | No | CC BY / CC0 | B | P3 |
| **Castelo de Paiva** [U: owner `sigcpv`] | ArcGIS: `SENTIDO PROIBIDO`, `TRANSITO PROIBIDO _ C2`, `SENTIDO OBRIGATÓRIO`, `DESVIO _ PORTO PENAFIEL CINFÃES` [P] | Yes | ArcGIS REST | Signage-derived layers, one diversion | No-entry, prohibited traffic, mandatory direction | Yes | 2024-06 | No | Not stated | B | P3 |
| **Funchal** (Madeira) | `infomobilidade.funchal.pt` (Google Maps-based) [S: funchal.pt] | No (web map) | Web | Restricted roads, reason, duration | Works, events, tree works, closures | Map only | Unknown | Unknown | Not stated | C | P3 (islands out of scope) |
| **Mangualde** | Waze partnership, map button on site [D] | No | Waze | Closures, diversions, events | — | — | — | — | Waze | C | P3 |
| **Vila Nova de Gaia** | `cm-gaia.pt` regulation PDFs: `29_cargas_descargas.pdf`, `30_condic_transito_ch_zona_i.pdf`; Regulamento 290/2019 (DR) [S/D] | No | PDF | No feed found. Press-reported closures (Metro Rubi works, events) | **Loading/unloading rules, historic-centre access** (permanent) | No | Regulation 2019 | DR | Official text | D | **P1** (curate regulations; request feed). Freight-critical: VCI/Gaia exemption platform |
| **Maia** | `cm-maia.pt` PDF notices (e.g. Av. Luís de Camões works flyer) [S] | No | PDF | Works notices | Works | No | Ad hoc | No | — | D | P1 (industrial/logistics: monitor) |
| **Braga** | `sig.cm-braga.pt/geoserver` (planning: PDM 2025/2026, ortho) [P]; Ubiwhere (parking/EV) [P] | No (for restrictions) | WFS (planning only) | None found | — | — | — | — | — | D | P1 (monitor; request) |
| **Guimarães** | `sig.cm-guimaraes.pt` (no traffic layers found) [P]; Ubiwhere [P] | No | — | None found | — | — | — | — | — | E | P2 |
| **Aveiro** | Aveiro Tech City urban platform (sensors, radars; third-party access "foreseen") [S]; 1 dataset on dados.gov.pt [P] | No (for restrictions) | — | None found | — | — | — | — | — | E | P2 (ask about the urban platform) |
| **Coimbra** | `cm-coimbra.pt` **editais** (PDF), e.g. Edital 69/2023, 181/2024, 196/2024, 178/2025 (event closures under Lei 75/2013) [S] | No | PDF | Event closures, parking bans | Event closures, diversions | No (street lists) | Per event | Editais archive on site | Official acts | D | P1 (edital monitoring) |
| **Leiria** | `cm-leiria.pt` PDF notices (e.g. "corte de trânsito Há Música") [S] | No | PDF | Event closures, flood closures (press) | Events, weather | No | Ad hoc | — | — | D | P2 |
| **Setúbal** | `mun-setubal.pt`; press on the "Arrábida sem carros" access scheme (seasonal, 07–20 h) [S] | No | Web/press | Seasonal access restrictions | Access restriction, time windows | No | Seasonal | — | — | D | P2 (port access: ask APSS) |
| **Sines** | Municipality / APS (port authority) — nothing found [S] | No | — | None found | — | — | — | — | — | E | P1 (freight-critical: ask APS and municipality) |
| **Faro** | `cm-faro.pt` — nothing structured found; press on one-way changes [S] | No | — | Press only | One-way changes | No | — | — | — | E | P2 |
| **Viseu** | `cm-viseu.pt` — historic centre car-free periods (press) [S] | No | — | Press only | Historic-centre access | No | Seasonal | — | — | E | P2 |
| **Sintra, VFX, Palmela, Seixal, Loulé, Portimão, S.M. Feira, Estarreja, Amadora** | dados.gov.pt: 0–2 non-traffic datasets each [P]. Sintra is a Waze partner [D] | No (restrictions) | — | None found | — | — | — | — | — | E | P2 (VFX/Azambuja/Palmela logistics belt: P1 monitor) |
| **Remaining ~280 municipalities** | Not individually audited | — | — | Presumed editais/PDF/press at best | — | — | — | — | — | E (presumed) | P3 |

### Publication-quality distribution (mainland, best estimate)

| Tier | Count | Municipalities |
|---|---|---|
| A — live machine-readable restrictions | **3** | Porto, Oeiras, Matosinhos |
| B — adjacent/stale/partial machine-readable | ~6 | Lisboa, Cascais, Valongo, Ovar, Águeda, Castelo de Paiva [U] |
| C — web map / Waze only | ≥2 | Mangualde, Funchal (Madeira); others unknown |
| D — PDFs/editais/regulations | most of the larger municipalities | e.g. Gaia, Maia, Coimbra, Leiria, Setúbal |
| E — nothing found | the rest | — |

The A and B counts are measured. The C, D and E split for unaudited municipalities is **inferred** [U]: about 92 municipal organisations publish anything at all on dados.gov.pt, and none besides those above publishes restrictions.

---

## 5. Category coverage across municipalities

| Category | Where it exists as data | Where only as text/press | Gap |
|---|---|---|---|
| Temporary road closures | Porto (DATEX), Oeiras (WFS), Matosinhos ("Cortes de vias") | Coimbra/Leiria editais; press everywhere | Rest of country |
| Municipal works | Porto, Oeiras (works + restrictions), Lisbon (UCT works, repaving), Matosinhos | Maia flyers | — |
| Event closures | Oeiras (event-tagged records), Lisbon event occupations (no road-impact field), Valongo (single event) | Coimbra editais, Leiria, Gaia press | Road-impact semantics missing in Lisbon |
| HGV access restrictions | — | Gaia regulations (PDF); VCI is national law (DL 155-A/2026) | **Gap everywhere** |
| Weight / height / width / length limits | — (Águeda / Castelo de Paiva signage layers could hold C-series signs [U]) | Signage on street | **Gap everywhere** |
| Historic-centre access | Porto ZAAC (CC0), Lisbon ZAAC (CC BY) polygons | Gaia Zona I regulation; Viseu press | Rule semantics (hours, permits) |
| Loading/unloading | Porto `cargas-e-descargas` (CC0) locations | Gaia regulation (PDF) | Time windows |
| One-way changes | Valongo (event), Ovar template, Castelo de Paiva signage | Faro press | — |
| Temporary diversions | **Matosinhos** (polylines), Ovar template (empty) | Press | — |
| Bridge/street-specific limits | — | — | **Gap** |
| Local traffic plans | Porto PAMU (CC0), Oeiras PMUS (docs) | PDM/PMUS PDFs | Planning documents, not operational |
| Low-emission zones | Lisbon ZER (CC BY) | — | Rule semantics |

---

## 6. Source details for the P0/P1 set

**Porto.**
- DATEX II v3 `SituationPublication`; 1,375 situations; URN IDs `urn:ngsi-ld:Alert:porto:RoadAlerts:cmp…`; `situationVersionTime` / `situationRecordVersionTime`.
- 923 situations valid by date on 2026-10-10; all `AreaLocation` [P].
- The DATEX file was published 2026-09-04, about 5 weeks before the audit, while the catalogue was touched 2026-10-09. **The real cadence is unclear** [U].
- Porto also runs the per-trip **VCI registration platform** for exempt HGVs [S]. This is operationally important, but it is a registration system, not published data.

**Oeiras.**
- WFS `dados_abertos:w_condicionalismos_via_publica`. Fields: `nome, local, morada, freguesia, requerente, estado_obra, data_prevista_inicio, data_prevista_conclusao, ultima_atualizacao`, point geometry (EPSG:3763).
- 8,127 records: 8,059 Concluído, 58 Execução, 10 Previsto. 57 are current by dates.
- Most frequent types: fibre-cable works (636), traffic restrictions for events (274 + 81 + 76), crossing painting (267), signage (139), trenching (96 + 103) [P].
- No explicit record ID beyond the WFS feature index (`w_condicionalismos_via_publica.N`). ID stability is **unknown** [U].
- `requerente` holds company names, some possibly private individuals [U].
- The dataset description states the data is also reported to Waze [P].

**Matosinhos.**
- Fields include `TipoLicenca`, `DescricaoTipoLic` (Condicionamento Temporário), `SubtipoLicenca` (e.g. Cargas/Descargas, Camião Grua), `CorteCondicionVia` (Corte de Via / Condicionamento de Via), `Morada`, `DataInicio`/`DataFim`, `HorarioInicio`/`HorarioFim`, `Dimensao`, `NProc`, `NEdoc`/`LinkEdoc`, `EstadoProc`, `Decisao`, plus internal workflow fields (`Tecnico`, `ResponsavelDecisao`) [P].
- **This is effectively the licensing back-office exposed publicly.** Personal data (requester names, staff names) must be dropped on ingest, and the exposure itself may be unintended [U]. Ask the municipality before ingesting.
- The diversion-route layer (polylines with `Edoc`, `DataInicio`/`DataFim`, `Estado`) is unique in Portugal among the sources found.
- Served via an ArcGIS Online credential proxy, so the URL is **fragile**.

**Lisbon.**
- The restrictions CSV is stale (see Phase 1).
- **Event occupations** layer: `NOME_EVENTO, TIPO_EVENTO, FREGUESIA, DATA_INICIO, DATA_FIM, ATIVO, ID_EVENTO` (e.g. `187/2022`), `COD_SIG`, `GlobalID`. Updated daily, but there is **no road-impact attribute**. It cannot be published as a "closure" without corroboration [P].
- **Works** layer `UCT_Intervenções`: `ESTADO, INICIO_OBRA, CONCLUSAO_OBRA, TIPO_INTERVENCAO, NOME_ARRUAMENTO`, polygons [P].
- Press reports that Lisbon updates restrictions on its website and pushes them to Waze/Google [S]. The **feed behind that website was not verified**. This is the highest-value Lisbon open question.

**Gaia.**
- Permanent rules in PDF: the regulation on circulation and loading/unloading operations, and traffic and parking restrictions in Centro Histórico Zona I (revised by Regulamento 290/2019, in force 2019-03-29) [S].
- These are candidates for the curated-law lane.

---

## 7. Implications for Project 2

1. **Municipal ingestion has three lanes:**
   - **Feed lane**: Porto, Oeiras, Matosinhos, and the Lisbon works/events layers.
   - **Curated-regulation lane**: municipal regulations from Diário da República and municipal PDFs (Gaia first), encoded as permanent rules with citations.
   - **Document-monitoring lane**: editais/avisos PDFs for Coimbra, Leiria, Maia and others. Snapshot, extract candidates, human review; never auto-published.
2. **Normalisation targets.**
   - Map Porto DATEX `situationRecord` types, Oeiras free-text `nome`, Matosinhos `CorteCondicionVia`/`SubtipoLicenca`, and Lisbon `TIPO_EVENTO`/`TIPO_INTERVENCAO` onto one Project 2 restriction vocabulary.
   - Keep `sourceCategoryLabel` verbatim.
3. **Geometry is heterogeneous** (areas, points, polygons, polylines). Publish the source geometry as-is, add `geometryKind`, and **never** snap it to a road segment without marking that as derived.
4. **Privacy.** Oeiras `requerente` and Matosinhos `Requerente`/`Tecnico`/`ResponsavelDecisao` must be excluded at the parser, before storage of normalised records. Raw snapshots containing personal data need retention rules. ⚖ GDPR review.
5. **Licensing.**
   - Oeiras CC BY, Lisbon CC BY/CC0 and Porto ZAAC CC0 are usable with attribution.
   - Porto restrictions (licence blank) and Matosinhos (no licence) are **research-only until clarified**.
6. **Freshness monitoring per municipality is mandatory.** Lisbon's restriction file went stale without notice, and Porto's DATEX `publicationTime` lags its catalogue date.

## 8. Recommended municipal order

1. **Oeiras**: open licence, daily updates, history. Proves the WFS lane.
2. **Porto**: DATEX II with native versioning; licence request in parallel.
3. **Matosinhos**: after a licence request and with privacy stripping. Port of Leixões freight relevance; unique diversion geometry.
4. **Lisbon works + events layers**: published as "works" and "event occupation", not as closures. Request the live restrictions feed behind the Lisbon/Waze integration.
5. **Gaia regulations** (curated-law lane), alongside the VCI national rule already planned.
6. **Document monitoring pilots**: Coimbra (editais), Maia, Leiria.
7. **Outreach** (requests, not ingestion): Sines (with APS), Setúbal (with APSS), Braga, Aveiro (Tech City platform), Guimarães, and the Lisbon-north logistics belt (VFX, Azambuja), Palmela and Loures.

## 9. What should NOT be attempted yet

- Crawling all 308 municipal websites.
- Treating Lisbon event occupations as road closures.
- Ingesting Matosinhos personal-data fields, or redistributing Matosinhos data before the municipality confirms that public exposure is intended.
- Inferring HGV/weight/height restrictions from signage inventories (Águeda, Castelo de Paiva) without field validation.
- Using Waze or any app as a source.
- Auto-publishing anything extracted from PDF editais.

## 10. Open questions requiring manual verification

1. **Lisbon:** What feed powers the municipal restrictions page and the Waze/Google integration? Is it available as open data? Why did the EMEL CSV stop at 2024-10-16?
2. **Porto:**
   - What licence applies to `condicionamentos-de-transito`?
   - What is the actual DATEX publication cadence?
   - Why is `condicionamentos-nao-programados` near-empty?
   - Is the dados.gov.pt and NAP harvest of the new host planned?
3. **Matosinhos:** Is the public ArcGIS exposure intentional, under what licence, and can a version without personal data be published?
4. **Oeiras:** Are WFS feature IDs stable? Is there an end-of-restriction timestamp beyond the planned dates?
5. **Gaia, Maia, Braga, Coimbra, Aveiro:** Do internal GIS layers for licensed street occupations exist that could be published (as in Matosinhos and Oeiras)?
6. **Sines/APS and Setúbal/APSS:** Are there port-access truck routing rules, time windows or appointment systems that are published anywhere?
7. **Waze for Cities:** Does the programme's data-sharing agreement allow partner municipalities to republish the same data openly? This matters for asking municipalities to "also publish what you send Waze".
8. **Diário da República:** Is there an efficient way to enumerate all municipal traffic regulations (2nd series, "Regulamento" + "trânsito"/"circulação")? Is there any structured export?
9. **Remaining municipalities:** A sampled crawl of maybe 30 more municipalities, weighted by freight volume, to validate the D/E tier estimate.

---

## Appendix — Key URLs (probed 2026-10-10)

- Porto CKAN: https://dadosabertos.cm-porto.pt/dataset/condicionamentos-de-transito
- Oeiras restrictions WFS: https://oeirasinterativa.oeiras.pt/gis/services/dados_abertos/w_condicionalismos_via_publica/wfs
- Oeiras dataset page: https://dados.gov.pt/en/datasets/condicionalismos-na-via-publica
- Oeiras works: https://dados.gov.pt/en/datasets/obras-municipais
- Matosinhos ArcGIS (proxy): https://utility.arcgis.com/usrsvcs/servers/781b7ff959d744c0bac1925f6d62383e/rest/services/CONSERVACAO/CONSERVACAO_CondicionamentosVias/MapServer
- Lisbon events: https://services.arcgis.com/1dSrzEWVQn5kHHyK/arcgis/rest/services/UCT_OcupacoesTemporariasEspacoPublico/FeatureServer
- Lisbon works: https://services.arcgis.com/1dSrzEWVQn5kHHyK/arcgis/rest/services/UCT_Interven%C3%A7%C3%B5es/FeatureServer
- Lisbon ZAAC: https://dados.gov.pt/en/datasets/zonas-de-acesso-automovel-condicionado
- Lisbon restrictions (stale): https://dados.gov.pt/en/datasets/condicionamentos-de-transito
- Valongo event layer: https://services3.arcgis.com/gzHFHeOJPa4lZ033/arcgis/rest/services/Condicionamentos_de_Transito_(Valongo_Romano)_-_View/FeatureServer
- Ovar platform: https://services5.arcgis.com/wug0kPCB99MOGUta/arcgis/rest/services/Plataforma_de_Tr%C3%A2nsito/FeatureServer
- Gaia regulations: https://www.cm-gaia.pt/fotos/editor2/documentos_municipais/regulamentos/29_cargas_descargas.pdf · https://www.cm-gaia.pt/fotos/editor2/documentos_municipais/regulamentos/30_condic_transito_ch_zona_i.pdf
- Coimbra edital example: https://www.cm-coimbra.pt/wp-content/uploads/2025/07/Edital-n.o-178_2025.pdf
- Funchal infomobilidade (press): https://funchal.pt/?p=20759
- Mangualde Waze partnership: https://www.cmmangualde.pt/atividade-municipal/comunicacao-social/notas-de-impresa/ni-camara-municipal-de-mangualde-ja-e-parceira-waze/
- SNIG CSW: https://snig.dgterritorio.gov.pt/rndg/srv/por/csw
- Ubiwhere catalogue: https://map.mobility.ubiwhere.com/
