import type { SourceRecord } from "./types";

/*
 * Source registry — DATA. Every entry was checked during Phase 3A/3B research
 * (2026-09-30): URL reachable, licence, CORS behaviour and last publication seen.
 * Adding a source = adding a record here (and a parser if the format is new).
 *
 * Deliberately absent: Brisa/Via Verde internal endpoint (live but not licensed for
 * reuse — not used), Lisbon EMEL CSV (dead since 2024-10), ANEPC API (dead),
 * NAP Portugal (one stale 2021 element).
 */

const IP = "Infraestruturas de Portugal, S.A.";
const IP_ARCGIS =
  "https://utility.arcgis.com/usrsvcs/servers/98bffc4ef35b4e18a03641918c5d07dd/rest/services/webapps/viajar_na_estrada2024/MapServer";
const ipLayer = (layer: number) =>
  `${IP_ARCGIS}/${layer}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json`;
const IP_TRAFFIC_APP = "https://infraestruturas.maps.arcgis.com/apps/instant/basic/index.html?appid=4092ca606ea04621be26aa4ec784e069";

const PORTO = "Câmara Municipal do Porto";
const PORTO_HOST = "https://dadosabertos.cm-porto.pt";
/** Same-origin relay prefix (vite.config.ts proxy, vercel.json rewrite). */
export const PORTO_PROXY_PREFIX = "/api/src/porto-dados";
export const IP_NOTICE_PROXY_PREFIX = "/api/src/ip-alertas";
const IP_NOTICE_HOST = "https://servicos.infraestruturasdeportugal.pt/pt-pt/alertas/rodovia";

const PORTO_CODE = "1312"; // CAOP2025 DTMN — Porto

const IP_EVENTS_COVERAGE = {
  jurisdiction: { kind: "national" as const },
  network: "Rede rodoviária sob gestão da IP (não inclui autoestradas concessionadas)",
  gaps: [
    "Não inclui concessões (Brisa, Ascendi, etc.) nem vias municipais.",
    "Geometria só por ponto (PK inteiro) — extensão do troço afetado não indicada.",
    "Sem aplicabilidade por tipo de veículo.",
    "Registo mais recente observado na investigação: 2026-09-16 — aparenta estar parado.",
  ],
};

const IP_CADENCE = { checkEveryMin: 15, agingAfterMin: 6 * 60, staleAfterMin: 48 * 60 };

export const SOURCES: SourceRecord[] = [
  {
    id: "ip-arcgis-condicionamentos",
    name: "IP — Viajar na Estrada: Condicionamentos",
    authority: IP,
    type: "ARCGIS_FEATURE_SERVICE",
    access: { kind: "DIRECT_CORS", url: ipLayer(2) },
    landingUrl: IP_TRAFFIC_APP,
    license: "Sem licença explícita no serviço; dados públicos do mapa de trânsito da IP",
    trustTier: 1,
    parser: "ip-arcgis-events",
    cadence: IP_CADENCE,
    coverage: { ...IP_EVENTS_COVERAGE, provides: ["temporary_events", "roadworks", "closures"] },
    enabled: true,
    notes: ["Camada 2 (Condicionamentos), pontos, campos datainicio/datafim/dataobservacao."],
  },
  {
    id: "ip-arcgis-ocorrencias",
    name: "IP — Viajar na Estrada: Outras ocorrências",
    authority: IP,
    type: "ARCGIS_FEATURE_SERVICE",
    access: { kind: "DIRECT_CORS", url: ipLayer(1) },
    landingUrl: IP_TRAFFIC_APP,
    license: "Sem licença explícita no serviço; dados públicos do mapa de trânsito da IP",
    trustTier: 1,
    parser: "ip-arcgis-events",
    cadence: IP_CADENCE,
    coverage: { ...IP_EVENTS_COVERAGE, provides: ["temporary_events", "incidents"] },
    enabled: true,
    notes: ["Camada 1 (Outras Ocorrências): obstruções (animais, veículos, ambiente…)."],
  },
  {
    id: "ip-arcgis-acidentes",
    name: "IP — Viajar na Estrada: Acidentes",
    authority: IP,
    type: "ARCGIS_FEATURE_SERVICE",
    access: { kind: "DIRECT_CORS", url: ipLayer(0) },
    landingUrl: IP_TRAFFIC_APP,
    license: "Sem licença explícita no serviço; dados públicos do mapa de trânsito da IP",
    trustTier: 1,
    parser: "ip-arcgis-events",
    cadence: IP_CADENCE,
    coverage: { ...IP_EVENTS_COVERAGE, provides: ["incidents"] },
    enabled: true,
    notes: ["Camada 0 (Acidentes)."],
  },
  {
    id: "porto-datex-programados",
    name: "Porto — Condicionamentos de trânsito programados (DATEX II v3)",
    authority: PORTO,
    type: "DATEX_II",
    access: {
      kind: "SAME_ORIGIN_PROXY",
      path: `${PORTO_PROXY_PREFIX}/dataset/538f30de-9e19-11f1-84ed-6abdb6d5cf34/resource/36f62a04-9168-4bc5-a499-a3101cd77168/download/condicionamentos_programados.xml`,
      upstreamUrl: `${PORTO_HOST}/dataset/538f30de-9e19-11f1-84ed-6abdb6d5cf34/resource/36f62a04-9168-4bc5-a499-a3101cd77168/download/condicionamentos_programados.xml`,
    },
    landingUrl: `${PORTO_HOST}/dataset/condicionamentos-de-transito`,
    license: "CC0 (Creative Commons CCZero) — metadados CKAN",
    trustTier: 1,
    parser: "datex2-situations",
    // CKAN metadata: frequency "biweekly".
    cadence: { checkEveryMin: 60, agingAfterMin: 15 * 24 * 60, staleAfterMin: 21 * 24 * 60 },
    coverage: {
      jurisdiction: { kind: "municipal", municipalityCodes: [PORTO_CODE] },
      network: "Arruamentos do Município do Porto",
      provides: ["temporary_events", "roadworks"],
      gaps: [
        "Só obras (roadworks) e fecho de vias de trânsito (laneClosures); nenhum registo de corte total (roadClosed) observado.",
        "Sem aplicabilidade por tipo de veículo.",
        "Não inclui restrições permanentes (ex.: ZAR — Código Regulamentar do Porto).",
        "Publicação observada: 2026-09-04 (frequência declarada: quinzenal).",
      ],
    },
    enabled: true,
    notes: ["Polígonos (loc:AreaLocation). Sem CORS — via proxy da própria origem."],
  },
  {
    id: "porto-datex-nao-programados",
    name: "Porto — Condicionamentos não programados (DATEX II v3)",
    authority: PORTO,
    type: "DATEX_II",
    access: {
      kind: "SAME_ORIGIN_PROXY",
      path: `${PORTO_PROXY_PREFIX}/dataset/539db002-9e19-11f1-84ed-6abdb6d5cf34/resource/75a3447c-bf9d-4c02-b3b7-aaecf5f00d2c/download/condicionamentos_nao_programados.xml`,
      upstreamUrl: `${PORTO_HOST}/dataset/539db002-9e19-11f1-84ed-6abdb6d5cf34/resource/75a3447c-bf9d-4c02-b3b7-aaecf5f00d2c/download/condicionamentos_nao_programados.xml`,
    },
    landingUrl: `${PORTO_HOST}/dataset/condicionamentos-nao-programados`,
    license: "CC0 (Creative Commons CCZero) — metadados CKAN",
    trustTier: 1,
    parser: "datex2-situations",
    cadence: { checkEveryMin: 30, agingAfterMin: 24 * 60, staleAfterMin: 7 * 24 * 60 },
    coverage: {
      jurisdiction: { kind: "municipal", municipalityCodes: [PORTO_CODE] },
      network: "Arruamentos do Município do Porto",
      provides: ["temporary_events", "incidents"],
      gaps: ["Publicação observada (2026-09-04) sem nenhuma situação."],
    },
    enabled: true,
    notes: ["Sem CORS — via proxy da própria origem."],
  },
  {
    id: "porto-ckan-condicionamentos",
    name: "Porto — metadados CKAN «Condicionamentos de trânsito»",
    authority: PORTO,
    type: "CKAN",
    access: {
      kind: "SAME_ORIGIN_PROXY",
      path: `${PORTO_PROXY_PREFIX}/api/3/action/package_show?id=condicionamentos-de-transito`,
      upstreamUrl: `${PORTO_HOST}/api/3/action/package_show?id=condicionamentos-de-transito`,
    },
    landingUrl: `${PORTO_HOST}/dataset/condicionamentos-de-transito`,
    license: "CC0",
    trustTier: 3,
    parser: "ckan-package",
    cadence: { checkEveryMin: 60, agingAfterMin: 15 * 24 * 60, staleAfterMin: 21 * 24 * 60 },
    coverage: {
      jurisdiction: { kind: "municipal", municipalityCodes: [PORTO_CODE] },
      network: "Arruamentos do Município do Porto",
      provides: [],
      gaps: ["Só metadados (data de modificação, licença, frequência) — não produz restrições."],
    },
    enabled: true,
    notes: [],
  },
  {
    id: "dr-serie1",
    name: "Diário da República — Série I (RSS do dia)",
    authority: "Imprensa Nacional-Casa da Moeda (Diário da República)",
    type: "RSS",
    access: { kind: "DIRECT_CORS", url: "https://files.diariodarepublica.pt/rss/serie1-html.xml" },
    landingUrl: "https://diariodarepublica.pt/dr/home",
    license: "Conteúdo oficial publicado; RSS público",
    trustTier: 3,
    parser: "dr-rss",
    // Published on working days; weekends/holidays age the feed without it being broken.
    cadence: { checkEveryMin: 60, agingAfterMin: 2 * 24 * 60, staleAfterMin: 5 * 24 * 60 },
    coverage: {
      jurisdiction: { kind: "national" },
      network: "Legislação nacional",
      provides: ["legal_acts"],
      gaps: ["Só índice (título/sumário): cada ato tem de ser lido e extraído; nunca gera restrições por si."],
    },
    enabled: true,
    notes: [],
  },
  {
    id: "dr-serie2-parte-h",
    name: "Diário da República — Série II, Parte H (autarquias)",
    authority: "Imprensa Nacional-Casa da Moeda (Diário da República)",
    type: "RSS",
    access: { kind: "DIRECT_CORS", url: "https://files.diariodarepublica.pt/rss/serie2&parte=h-html.xml" },
    landingUrl: "https://diariodarepublica.pt/dr/home",
    license: "Conteúdo oficial publicado; RSS público",
    trustTier: 3,
    parser: "dr-rss",
    cadence: { checkEveryMin: 60, agingAfterMin: 2 * 24 * 60, staleAfterMin: 5 * 24 * 60 },
    coverage: {
      jurisdiction: { kind: "national" },
      network: "Regulamentos e avisos municipais",
      provides: ["legal_acts"],
      gaps: ["Só índice do dia; regulamentos de trânsito municipais têm de ser lidos e mapeados manualmente."],
    },
    enabled: true,
    notes: [],
  },
  {
    id: "ip-aviso-ip3-duplicacao-17",
    name: "IP — Aviso «IP3 Coimbra/Viseu — Santa Comba Dão/Viseu» (série -17)",
    authority: IP,
    type: "HTML_NOTICE",
    access: {
      kind: "SAME_ORIGIN_PROXY",
      path: `${IP_NOTICE_PROXY_PREFIX}/ip3-coimbraviseu-troco-santa-comba-daoviseu-duplicacaorequalificacao-17`,
      upstreamUrl: `${IP_NOTICE_HOST}/ip3-coimbraviseu-troco-santa-comba-daoviseu-duplicacaorequalificacao-17`,
    },
    landingUrl: `${IP_NOTICE_HOST}/ip3-coimbraviseu-troco-santa-comba-daoviseu-duplicacaorequalificacao-17`,
    license: "Aviso público da IP",
    trustTier: 2,
    parser: "html-notice-ai",
    cadence: { checkEveryMin: 60, agingAfterMin: 24 * 60, staleAfterMin: 7 * 24 * 60 },
    coverage: {
      jurisdiction: { kind: "national" },
      network: "IP3 (troço Santa Comba Dão/Viseu)",
      provides: ["closures"],
      gaps: [
        "Página sem data de publicação — frescura não determinável pela fonte.",
        "Avisos novos não são descobertos automaticamente (a listagem de alertas rodoviários não é estática); cada aviso é registado à mão.",
      ],
    },
    enabled: true,
    notes: ["Sem CORS — via proxy da própria origem. Extração por IA: desligada (sem chave); só respostas gravadas em testes."],
  },
  {
    id: "fleetos-curated-pt",
    name: "FleetOS — restrições e eventos curados (Portugal)",
    authority: "FleetOS (curadoria sobre fontes oficiais citadas em cada registo)",
    type: "STATIC_LEGAL_RECORD",
    access: { kind: "STATIC" },
    landingUrl: "https://diariodarepublica.pt/dr/home",
    license: "Registos próprios com citações das fontes oficiais",
    trustTier: 2,
    parser: "static-curated",
    cadence: { checkEveryMin: 0, agingAfterMin: 0, staleAfterMin: 0 },
    coverage: {
      jurisdiction: { kind: "national" },
      network: "VCI (Porto) — DL 155-A/2026; IP3 — cortes noturnos (aviso IP -17)",
      provides: ["permanent_restrictions", "closures"],
      gaps: ["Curadoria manual de registos individuais — não é cobertura nacional."],
    },
    enabled: true,
    notes: ["Estes são os únicos registos usados para decidir conformidade com geometria resolvida."],
  },
];

/*
 * DEVELOPMENT/TEST sources — synthetic fixtures served only by the Vite dev server
 * (vite.config.ts, /__dev/ingestion/*). Never enabled in production builds; every record,
 * constraint and UI element derived from them is labelled «TESTE SINTÉTICO».
 */
export const DEV_FIXTURE_PREFIX = "/__dev/ingestion/";
const DEV_NOTE = "DADOS SINTÉTICOS DE TESTE — não é uma publicação oficial; existe só para provar o circuito ingestão → avaliação em desenvolvimento.";

export const DEV_SOURCES: SourceRecord[] = [
  {
    id: "dev-test-datex-closure",
    name: "[TESTE SINTÉTICO] Corte estruturado (formato DATEX II)",
    authority: "FleetOS — dados de teste sintéticos (NÃO OFICIAL)",
    type: "DATEX_II",
    access: { kind: "DEV_FIXTURE", path: `${DEV_FIXTURE_PREFIX}synthetic-datex-closure.xml` },
    landingUrl: "https://example.invalid/fleetos-dev-fixture",
    license: "Dados de teste gerados por FleetOS",
    trustTier: 1,
    parser: "datex2-situations",
    cadence: { checkEveryMin: 1, agingAfterMin: 24 * 60, staleAfterMin: 3 * 24 * 60 },
    coverage: { jurisdiction: { kind: "national" }, network: "Teste", provides: ["closures"], gaps: [DEV_NOTE] },
    enabled: true,
    notes: [DEV_NOTE],
    synthetic: true,
  },
  {
    id: "dev-test-ip-point-event",
    name: "[TESTE SINTÉTICO] Evento pontual em prosa (formato IP ArcGIS)",
    authority: "FleetOS — dados de teste sintéticos (NÃO OFICIAL)",
    type: "ARCGIS_FEATURE_SERVICE",
    access: { kind: "DEV_FIXTURE", path: `${DEV_FIXTURE_PREFIX}synthetic-ip-point-event.json` },
    landingUrl: "https://example.invalid/fleetos-dev-fixture",
    license: "Dados de teste gerados por FleetOS",
    trustTier: 1,
    parser: "ip-arcgis-events",
    cadence: { checkEveryMin: 1, agingAfterMin: 6 * 60, staleAfterMin: 48 * 60 },
    coverage: { jurisdiction: { kind: "national" }, network: "Teste", provides: ["closures"], gaps: [DEV_NOTE] },
    enabled: true,
    notes: [DEV_NOTE],
    synthetic: true,
  },
];

/** Registry in use: official sources, plus synthetic ones only when explicitly enabled in development. */
export function activeSources(includeDevFixtures: boolean): SourceRecord[] {
  return includeDevFixtures ? [...SOURCES, ...DEV_SOURCES] : SOURCES;
}

export function getSource(id: string, sources: SourceRecord[] = SOURCES): SourceRecord | undefined {
  return sources.find((s) => s.id === id);
}

/** URL the browser fetches for a source (never a non-registered upstream). */
export function fetchUrlFor(source: SourceRecord): string | null {
  switch (source.access.kind) {
    case "DIRECT_CORS":
      return source.access.url;
    case "SAME_ORIGIN_PROXY":
      return source.access.path;
    case "DEV_FIXTURE":
      return source.access.path;
    case "STATIC":
    case "RESEARCH":
      return null;
  }
}

/** Registry integrity: unique ids, proxy paths under the known relay prefixes. */
export function validateSources(sources: SourceRecord[] = SOURCES): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const s of sources) {
    if (ids.has(s.id)) problems.push(`${s.id}: duplicate id`);
    ids.add(s.id);
    if (s.access.kind === "SAME_ORIGIN_PROXY" && ![PORTO_PROXY_PREFIX, IP_NOTICE_PROXY_PREFIX].some((p) => s.access.kind === "SAME_ORIGIN_PROXY" && s.access.path.startsWith(`${p}/`))) {
      problems.push(`${s.id}: proxy path outside the registered relays`);
    }
    if (s.access.kind === "DEV_FIXTURE" && (!s.synthetic || !s.access.path.startsWith(DEV_FIXTURE_PREFIX))) {
      problems.push(`${s.id}: dev fixture must be synthetic and under ${DEV_FIXTURE_PREFIX}`);
    }
    if (s.synthetic && s.access.kind !== "DEV_FIXTURE") problems.push(`${s.id}: synthetic source must be a dev fixture`);
    if (s.access.kind !== "STATIC" && s.access.kind !== "RESEARCH" && s.cadence.checkEveryMin <= 0) problems.push(`${s.id}: no check cadence`);
    if (s.cadence.agingAfterMin > s.cadence.staleAfterMin) problems.push(`${s.id}: aging after stale`);
  }
  return problems;
}
