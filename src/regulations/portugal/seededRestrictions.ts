import type { DateCalendar, Evidence, GeometryRecord, AreaRecord, RegulationRecord } from "../types";
import { CREP_LINES, CREP_OSM_SNAPSHOT } from "./geometry/crepA41";
import { VCI_RING_LINES, VCI_RING_OSM_EXCLUDED_LINK_WAY_IDS, VCI_RING_OSM_SNAPSHOT, VCI_RING_OSM_WAY_IDS } from "./geometry/vciPortoRing";

/*
 * Portugal — normalized restriction records.
 *
 * Every condition references evidence. Sources were read on the dates in
 * `retrievedAt`; re-verify before relying on them (regulations change).
 * Nothing here is AI-extracted without review: facts marked VERIFIED were read in
 * the official text; INTERPRETED / UNVERIFIED are labelled as such.
 */

const DL_155A_2026_PDF = "https://files.diariodarepublica.pt/1s/2026/07/14703/0000200005.pdf";
const DL_155A_2026_PAGE = "https://diariodarepublica.pt/dr/detalhe/decreto-lei/155-a-2026-1153967375";
const DR_RETIF_33_2026 = "https://diariodarepublica.pt/dr/detalhe/declaracao-retificacao/33-2026-1170726640";
const CT_ART_234 = "https://diariodarepublica.pt/dr/legislacao-consolidada/lei/2009-34546475-73982045";
const IMT_VCI_NEWS = "https://www.imt-ip.pt/noticias/novas-regras-para-veiculos-pesados-na-vci-entram-em-vigor-a-15-de-setembro/";
const IMT_VCI_MAP = "https://www.imt-ip.pt/wp-content/uploads/2026/09/Mapa-scaled.jpg";
const IP_VCI_PAGE = "https://www.infraestruturasdeportugal.pt/pt-pt/regime-circulacao-VCI-isencao-pagamento-taxas-portagem-CREP";

const PCM = "Presidência do Conselho de Ministros";
const DL = "Decreto-Lei n.º 155-A/2026, de 31 de julho";

const vciEvidence: Evidence[] = [
  {
    id: "pt-dl155a2026-art1a",
    authority: PCM,
    instrument: DL,
    locator: "Art. 1.º, alínea a)",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    quote: "troços das autoestradas A1/IC1, A20/IC23, A28/IC1 e A44/IC23 que, em conjunto, constituem a designada Via de Cintura Interna do Porto (VCI)",
    verification: "VERIFIED",
    note: "O diploma não indica nós nem pontos quilométricos dos troços.",
  },
  {
    id: "pt-dl155a2026-art2-1",
    authority: PCM,
    instrument: DL,
    locator: "Art. 2.º, n.º 1",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    quote: "Os veículos pesados de mercadorias estão proibidos de circular na VCI nos dias úteis, entre as 07h00 e as 21h00.",
    verification: "VERIFIED",
  },
  {
    id: "pt-dl155a2026-art2-3",
    authority: PCM,
    instrument: DL,
    locator: "Art. 2.º, n.º 3",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    quote:
      "veículos com peso bruto superior a 3500 kg, com três ou mais eixos, e com altura, medida na vertical do primeiro eixo, igual ou superior a 1,1 m, que se destinam ao transporte de carga",
    verification: "VERIFIED",
  },
  {
    id: "pt-dl155a2026-art2-4a",
    authority: PCM,
    instrument: DL,
    locator: "Art. 2.º, n.º 4, alínea a)",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    quote:
      "que tenham como origem ou destino os municípios do Porto ou de Vila Nova de Gaia, para efeitos de carga ou descarga de mercadorias nesses municípios, desde que habilitados nos termos do artigo seguinte",
    verification: "VERIFIED",
  },
  {
    id: "pt-dl155a2026-art2-4b",
    authority: PCM,
    instrument: `${DL} (retificado pela Declaração de Retificação n.º 33/2026/1)`,
    locator: "Art. 2.º, n.º 4, alínea b)",
    url: DR_RETIF_33_2026,
    retrievedAt: "2026-09-30",
    quote:
      "objeto de autorização especial de trânsito, emitida pelo Instituto da Mobilidade e dos Transportes, I. P., ao abrigo do Regulamento de Autorizações Especiais de Trânsito, aprovado pela Portaria n.º 472/2007, de 22 de junho",
    verification: "VERIFIED",
    note: "Texto retificado: a versão original citava a Portaria n.º 387/99.",
  },
  {
    id: "pt-dl155a2026-art2-5",
    authority: PCM,
    instrument: DL,
    locator: "Art. 2.º, n.º 5",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    quote: "não se aplica aos veículos da propriedade do Estado ou dos municípios do Porto ou de Vila Nova de Gaia",
    verification: "VERIFIED",
  },
  {
    id: "pt-dl155a2026-art3-1",
    authority: PCM,
    instrument: DL,
    locator: "Art. 3.º, n.os 1 e 3",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    quote:
      "deve ser previamente obtida a habilitação de circulação, para cada movimento de transporte, através de plataforma digital disponibilizada pelos municípios do Porto e de Vila Nova de Gaia",
    verification: "VERIFIED",
    note: "Plataforma em vci.porto.pt; nenhuma API pública documentada encontrada (páginas oficiais da CM Porto e CM Gaia, 2026-09-30).",
  },
  {
    id: "pt-dl155a2026-art6",
    authority: PCM,
    instrument: DL,
    locator: "Art. 6.º",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    quote: "O presente decreto-lei entra em vigor no dia 15 de setembro de 2026.",
    verification: "VERIFIED",
  },
  {
    id: "pt-dl155a2026-status",
    authority: "Diário da República (INCM)",
    instrument: DL,
    locator: "Ficha do diploma — estado e retificações",
    url: DL_155A_2026_PAGE,
    retrievedAt: "2026-09-30",
    quote: "Retificado por Declaração de Retificação n.º 33/2026/1",
    verification: "VERIFIED",
    note: "Estado «Em vigor» na data de leitura; única retificação listada: 33/2026/1 (Art. 2.º, n.º 4, b)).",
  },
  {
    id: "pt-interp-dias-uteis",
    authority: "FleetOS",
    instrument: DL,
    locator: "Art. 2.º, n.º 1 — «dias úteis»",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    verification: "INTERPRETED",
    note:
      "«dias úteis» não é definido no diploma. Lido como segunda a sexta-feira, excluindo sábados e domingos; feriados nacionais obrigatórios tratados como INDETERMINADO.",
  },
  {
    id: "pt-interp-hora-legal",
    authority: "FleetOS",
    instrument: DL,
    locator: "Art. 2.º, n.º 1 — «entre as 07h00 e as 21h00»",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    verification: "INTERPRETED",
    note: "O diploma não indica fuso; lido como hora legal de Portugal continental (Europe/Lisbon), janela [07:00, 21:00).",
  },
  {
    id: "pt-ct-art234-1",
    authority: "Assembleia da República",
    instrument: "Código do Trabalho (Lei n.º 7/2009), versão consolidada",
    locator: "Art. 234.º, n.º 1",
    url: CT_ART_234,
    retrievedAt: "2026-09-30",
    quote:
      "São feriados obrigatórios os dias 1 de janeiro, de Sexta-Feira Santa, de Domingo de Páscoa, 25 de abril, 1 de maio, de Corpo de Deus, 10 de junho, 15 de agosto, 5 de outubro, 1 de novembro, 1, 8 e 25 de dezembro.",
    verification: "VERIFIED",
    note: "n.º 2: Sexta-Feira Santa pode ser observada noutro dia com significado local; n.º 3: alguns feriados podem ser observados na segunda-feira seguinte mediante legislação específica — não modelado.",
  },
  {
    id: "pt-osm-vci-screening",
    authority: "OpenStreetMap contributors (ODbL)",
    instrument: "Overpass API — vias com name~«Cintura Interna» e ref A 1/IC 1/A 20/IC 23/A 28/A 44 nos concelhos do Porto e Vila Nova de Gaia",
    locator: "Snapshots OSM 2026-07-15 (overpass.kumi.systems) e 2026-09-30 (overpass-api.de)",
    url: "https://www.openstreetmap.org/",
    retrievedAt: "2026-09-30",
    verification: "UNVERIFIED",
    note:
      "Caixa envolvente das vias candidatas (41.0795,-8.6897 a 41.2021,-8.5788) alargada ~3 km em cada direção. Dado geográfico, não legal: não identifica os troços da VCI, apenas delimita onde podem estar.",
  },  {
    id: "pt-imt-mapa-vci",
    authority: "IMT, I.P. / Infraestruturas de Portugal (mapa co-assinado por Governo, AMP, CM Porto e CM Gaia)",
    instrument: "Mapa informativo «Regime de proibição da circulação na VCI»",
    locator: "Mapa esquemático — cores: A28 verde, A20 azul, A44 rosa, A1 roxo",
    url: IMT_VCI_MAP,
    retrievedAt: "2026-09-30",
    quote: "VCI - PROIBIÇÃO DE PESADOS A PARTIR DE 15 SETEMBRO",
    verification: "VERIFIED",
    note:
      "Publicado em " + IMT_VCI_NEWS + " . Esquemático (não geodésico): anel fechado composto, por ordem, por A28 (noroeste), A20 (norte e nascente), A44 (sudeste, Gaia) e A1 (sudoeste, travessia do Douro).",
  },
  {
    id: "pt-ip-vci-sinalizacao",
    authority: "Infraestruturas de Portugal, S.A.",
    instrument: "Página «Regime de circulação na VCI e isenção de pagamento das taxas de portagem na CREP»",
    locator: "FAQ 9",
    url: IP_VCI_PAGE,
    retrievedAt: "2026-09-30",
    quote:
      "encontra-se instalada, nas vias de entrada na VCI, sinalização vertical de código (sinal C3d) e painéis adicionais, com a indicação: “Exceto veículos autorizados” e “Dias úteis, das 07h às 21h”",
    verification: "VERIFIED",
  },
  {
    id: "pt-osm-vci-anel",
    authority: "OpenStreetMap contributors (ODbL)",
    instrument: `Overpass API — highway=motorway, snapshot ${VCI_RING_OSM_SNAPSHOT}`,
    locator: `${VCI_RING_OSM_WAY_IDS.length} vias (faixas de rodagem) incluídas; ${VCI_RING_OSM_EXCLUDED_LINK_WAY_IDS.length} ramos de ligação excluídos`,
    url: "https://www.openstreetmap.org/",
    retrievedAt: "2026-09-30",
    verification: "UNVERIFIED",
    note:
      "Dado geográfico, não legal. Ciclo dirigido mais curto a partir de cada faixa da Ponte do Freixo, apenas por vias com ref A 1/A 20/A 28/A 44/IC 1/IC 23: anel fechado nos dois sentidos (20,12 km / 20,96 km) atravessando as pontes do Freixo e da Arrábida. Discrepância: o arco noroeste está etiquetado «IC 23» no OSM, onde as fontes oficiais indicam A28.",
  },
  {
    id: "pt-mapeamento-vci-anel",
    authority: "FleetOS",
    instrument: DL,
    locator: "Art. 1.º, alínea a) ↔ mapa oficial ↔ geometria OSM",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    verification: "INTERPRETED",
    note:
      "A VCI é identificada como o ANEL fechado (não como todas as vias com esses números): o diploma descreve troços que «em conjunto» formam um anel; o mapa oficial mostra a ordem A28→A20→A44→A1; o ciclo OSM reproduz essa ordem e atravessa as duas pontes. Troços de A1/A20/A28 fora do anel e ramos de ligação não incluídos. Correspondência de rota: ≥200 m contínuos a ≤30 m da linha e direção ±30°.",
  },
  {
    id: "pt-dl155a2026-preambulo-crep",
    authority: PCM,
    instrument: DL,
    locator: "Preâmbulo",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    quote:
      "a A41/IC24, designada por Circular Regional Exterior do Porto (CREP), que deve ser usada na distribuição de tráfego para os vários eixos rodoviários",
    verification: "VERIFIED",
  },
  {
    id: "pt-dl155a2026-art5",
    authority: PCM,
    instrument: DL,
    locator: "Art. 5.º",
    url: DL_155A_2026_PDF,
    retrievedAt: "2026-09-30",
    quote:
      "a) Lanço Freixieiro (A28/A41)/Ermida (A41/A42), que integra a Concessão do Grande Porto; e b) Lanço Ermida (A41/A42)/Picoto (IC2), que integra a Concessão do Douro Litoral.",
    verification: "VERIFIED",
    note: "Isenção de portagem na CREP para pesados com 3+ eixos e altura ≥ 1,1 m no primeiro eixo.",
  },
  {
    id: "pt-ip-alternativa-crep",
    authority: "Infraestruturas de Portugal, S.A.",
    instrument: "Página «Regime de circulação na VCI e isenção de pagamento das taxas de portagem na CREP»",
    locator: "FAQ 7",
    url: IP_VCI_PAGE,
    retrievedAt: "2026-09-30",
    quote: "A alternativa recomendada é a CREP (A41/IC24)",
    verification: "VERIFIED",
  },
  {
    id: "pt-osm-crep",
    authority: "OpenStreetMap contributors (ODbL)",
    instrument: `Overpass API — highway=motorway ref A 41, snapshot ${CREP_OSM_SNAPSHOT}`,
    locator: "Vias com name «Circular Regional Exterior do Porto (CREP)»",
    url: "https://www.openstreetmap.org/",
    retrievedAt: "2026-09-30",
    verification: "UNVERIFIED",
    note: "Usado apenas para descrever se uma rota segue a CREP. Limites dos lanços do art. 5.º não mapeados.",
  },
];

const vciGeometry: GeometryRecord = {
  id: "pt-vci-porto",
  label: "VCI — Via de Cintura Interna do Porto",
  legalDescriptionEvidence: ["pt-dl155a2026-art1a", "pt-imt-mapa-vci"],
  status: "RESOLVED",
  resolved: {
    kind: "polylines",
    lines: VCI_RING_LINES,
    toleranceM: 30,
    minMatchLengthM: 200,
    maxHeadingDiffDeg: 30,
    verification: "INTERPRETED",
    mappingMethod: "anel fechado OSM mapeado para o art. 1.º a) através do mapa oficial IMT/IP",
    evidence: ["pt-dl155a2026-art1a", "pt-imt-mapa-vci", "pt-osm-vci-anel", "pt-mapeamento-vci-anel"],
  },
  screeningArea: {
    bbox: { south: 41.0495, west: -8.7297, north: 41.2321, east: -8.5388 },
    method: "envolvente derivada de OpenStreetMap, alargada ~3 km",
    evidence: ["pt-osm-vci-screening"],
  },
  diagnosticHints: {
    roadNumbers: ["A1", "IC1", "A20", "IC23", "A28", "A44"],
    note: "estas estradas também existem fora da VCI; não prova utilização da VCI",
  },
};

const crepGeometry: GeometryRecord = {
  id: "pt-crep-a41",
  label: "CREP — A41/IC24",
  legalDescriptionEvidence: ["pt-dl155a2026-art5"],
  status: "RESOLVED",
  resolved: {
    kind: "polylines",
    lines: CREP_LINES,
    toleranceM: 30,
    minMatchLengthM: 500,
    maxHeadingDiffDeg: 30,
    verification: "UNVERIFIED",
    mappingMethod: "vias OSM A41 com nome CREP (limites dos lanços não mapeados) — apenas descritivo",
    evidence: ["pt-osm-crep"],
  },
};

/** Areas matched against the municipality RECORDED on each stop (no geocoding, no inference). */
const areas: AreaRecord[] = [
  { id: "pt-municipio-porto", label: "município do Porto", status: "UNRESOLVED", match: { attribute: "municipality", equals: "Porto" }, evidence: ["pt-dl155a2026-art2-4a"] },
  { id: "pt-municipio-vila-nova-de-gaia", label: "município de Vila Nova de Gaia", status: "UNRESOLVED", match: { attribute: "municipality", equals: "Vila Nova de Gaia" }, evidence: ["pt-dl155a2026-art2-4a"] },
];

export const PT_NATIONAL_MANDATORY_HOLIDAYS: DateCalendar = {
  id: "pt-feriados-obrigatorios",
  label: "Feriados obrigatórios (Código do Trabalho, art. 234.º, n.º 1)",
  fixed: [
    { month: 1, day: 1, label: "feriado nacional (1 de janeiro)" },
    { month: 4, day: 25, label: "feriado nacional (25 de abril)" },
    { month: 5, day: 1, label: "feriado nacional (1 de maio)" },
    { month: 6, day: 10, label: "feriado nacional (10 de junho)" },
    { month: 8, day: 15, label: "feriado nacional (15 de agosto)" },
    { month: 10, day: 5, label: "feriado nacional (5 de outubro)" },
    { month: 11, day: 1, label: "feriado nacional (1 de novembro)" },
    { month: 12, day: 1, label: "feriado nacional (1 de dezembro)" },
    { month: 12, day: 8, label: "feriado nacional (8 de dezembro)" },
    { month: 12, day: 25, label: "feriado nacional (25 de dezembro)" },
  ],
  easterOffsets: [
    { days: -2, label: "feriado nacional (Sexta-Feira Santa)" },
    { days: 0, label: "feriado nacional (Domingo de Páscoa)" },
    { days: 60, label: "feriado nacional (Corpo de Deus)" },
  ],
  evidence: ["pt-ct-art234-1"],
};

const vciRestriction: RegulationRecord = {
  id: "pt-dl155a2026-vci-pesados",
  kind: "LEGAL_RESTRICTION",
  version: 2,
  title: "VCI Porto — proibição de pesados de mercadorias em dias úteis (07h00–21h00)",
  jurisdiction: "PT",
  authority: PCM,
  instrument: `${DL}, retificado pela Declaração de Retificação n.º 33/2026/1`,
  legalStatus: "VERIFIED",
  effect: "prohibited",
  effective: { from: "2026-09-15", evidence: ["pt-dl155a2026-art6"] },
  appliesTo: {
    kind: "all",
    of: [
      { kind: "fact", fact: "vehicle.grossWeightKg", op: "gt", value: 3500, label: "peso bruto > 3500 kg", evidence: ["pt-dl155a2026-art2-3"] },
      { kind: "fact", fact: "vehicle.axleCount", op: "gte", value: 3, label: "três ou mais eixos", evidence: ["pt-dl155a2026-art2-3"] },
      { kind: "fact", fact: "vehicle.firstAxleHeightM", op: "gte", value: 1.1, label: "altura no primeiro eixo ≥ 1,1 m", evidence: ["pt-dl155a2026-art2-3"] },
      { kind: "fact", fact: "vehicle.isGoodsVehicle", op: "eq", value: true, label: "destina-se ao transporte de carga", evidence: ["pt-dl155a2026-art2-3"] },
    ],
  },
  location: { geometryId: vciGeometry.id },
  when: {
    timeZone: "Europe/Lisbon",
    timeZoneEvidence: ["pt-interp-hora-legal"],
    windows: [{ start: "07:00", end: "21:00", evidence: ["pt-dl155a2026-art2-1", "pt-interp-hora-legal"] }],
    days: {
      label: "dias úteis",
      weekdays: { 1: "APPLIES", 2: "APPLIES", 3: "APPLIES", 4: "APPLIES", 5: "APPLIES", 6: "DOES_NOT_APPLY", 7: "DOES_NOT_APPLY" },
      weekdaysEvidence: ["pt-dl155a2026-art2-1", "pt-interp-dias-uteis"],
      dateOverrides: [{ calendarId: PT_NATIONAL_MANDATORY_HOLIDAYS.id, outcome: "UNKNOWN", evidence: ["pt-ct-art234-1", "pt-interp-dias-uteis"] }],
    },
  },
  exceptions: [
    {
      id: "carga-descarga-porto-gaia",
      label: "Origem/destino no Porto ou Gaia para carga/descarga, com habilitação na plataforma",
      evidence: ["pt-dl155a2026-art2-4a", "pt-dl155a2026-art3-1"],
      condition: {
        kind: "all",
        of: [
          {
            kind: "any",
            of: [
              { kind: "stopInArea", stops: "originOrDestination", areaId: "pt-municipio-porto", stopTypes: ["pickup", "delivery"], label: "origem/destino no município do Porto", evidence: ["pt-dl155a2026-art2-4a"] },
              { kind: "stopInArea", stops: "originOrDestination", areaId: "pt-municipio-vila-nova-de-gaia", stopTypes: ["pickup", "delivery"], label: "origem/destino no município de Vila Nova de Gaia", evidence: ["pt-dl155a2026-art2-4a"] },
            ],
          },
          { kind: "fact", fact: "authorization.pt-vci-habilitacao", op: "eq", value: true, label: "habilitação de circulação obtida para este movimento", evidence: ["pt-dl155a2026-art3-1"] },
        ],
      },
    },
    {
      id: "aet-imt",
      label: "Autorização especial de trânsito emitida pelo IMT (Portaria n.º 472/2007)",
      evidence: ["pt-dl155a2026-art2-4b"],
      condition: { kind: "fact", fact: "authorization.pt-imt-aet", op: "eq", value: true, label: "autorização especial de trânsito IMT", evidence: ["pt-dl155a2026-art2-4b"] },
    },
    {
      id: "propriedade-publica",
      label: "Viatura propriedade do Estado ou dos municípios do Porto/Gaia",
      evidence: ["pt-dl155a2026-art2-5"],
      condition: {
        kind: "fact",
        fact: "vehicle.ownerCategory",
        op: "in",
        value: ["state", "municipality:porto", "municipality:vila-nova-de-gaia"],
        label: "proprietário Estado / CM Porto / CM Gaia",
        evidence: ["pt-dl155a2026-art2-5"],
      },
    },
  ],
  officialAlternatives: [
    {
      id: "crep-a41-ic24",
      type: "corridor",
      label: "CREP (A41/IC24)",
      roads: ["A41", "IC24"],
      sections: ["Freixieiro (A28/A41) – Ermida (A41/A42)", "Ermida (A41/A42) – Picoto (IC2)"],
      evidence: ["pt-ip-alternativa-crep", "pt-dl155a2026-preambulo-crep", "pt-dl155a2026-art5"],
      geometryId: crepGeometry.id,
    },
  ],
  evidence: vciEvidence,
  openQuestions: [
    "Geometria da VCI: anel mapeado a partir de OSM + mapa oficial esquemático (INTERPRETADO); o diploma não indica nós/PK; ramos de ligação não incluídos.",
    "«Dias úteis» não definido no diploma; feriados facultativos/municipais e art. 234.º, n.os 2–3 do Código do Trabalho não modelados.",
    "«Origem ou destino» em trabalhos com várias paragens: interpretado como primeira/última paragem.",
  ],
};

export const PT_GEOMETRIES: GeometryRecord[] = [vciGeometry, crepGeometry];
export const PT_AREAS: AreaRecord[] = areas;
export const PT_CALENDARS: DateCalendar[] = [PT_NATIONAL_MANDATORY_HOLIDAYS];
export const PT_REGULATIONS: RegulationRecord[] = [vciRestriction];
