import type { Evidence, GeometryRecord, RegulationRecord } from "../types";
import {
  EN2_LINES,
  EN2_OSM_SNAPSHOT,
  IP3_OSM_SNAPSHOT,
  IP3_SEGMENT_21_22,
  IP3_SEGMENT_24_25,
} from "./geometry/ip3Works2026";

/*
 * Portugal — temporary road events, as normalized DATA for the same engine as legal
 * restrictions. Each event is introduced manually for now (no monitoring yet).
 */

const IP = "Infraestruturas de Portugal, S.A.";
const NOTICE_17 = "https://servicos.infraestruturasdeportugal.pt/pt-pt/alertas/rodovia/ip3-coimbraviseu-troco-santa-comba-daoviseu-duplicacaorequalificacao-17";
const NOTICE_6 = "https://servicos.infraestruturasdeportugal.pt/pt-pt/alertas/rodovia/ip3-coimbraviseu-troco-santa-comba-daoviseu-duplicacaorequalificacao-6";
const NOTICE_2 = "https://servicos.infraestruturasdeportugal.pt/pt-pt/alertas/rodovia/ip3-coimbraviseu-troco-santa-comba-daoviseu-duplicacaorequalificacao-2";
const NOTICE_TITLE = "Alerta «IP3 – Coimbra/Viseu - Troço Santa Comba Dão/Viseu – Duplicação/Requalificação»";

const ip3Evidence: Evidence[] = [
  {
    id: "ip-ip3-17-corte",
    authority: IP,
    instrument: NOTICE_TITLE,
    locator: "Alerta rodoviário (série «-17»), parágrafo 1",
    url: NOTICE_17,
    retrievedAt: "2026-09-30",
    quote:
      "será necessário proceder ao corte temporário da circulação no IP3, nas noites de 28 de setembro a 2 de outubro, entre as 21h00 e as 05h00",
    verification: "VERIFIED",
    note: "Sem data de publicação na página. Aplica-se à circulação em geral (sem distinção de veículos).",
  },
  {
    id: "ip-ip3-17-fases",
    authority: IP,
    instrument: NOTICE_TITLE,
    locator: "Alerta rodoviário (série «-17»), programação por noite",
    url: NOTICE_17,
    retrievedAt: "2026-09-30",
    quote:
      "Na noite de 28 para 29 de setembro, entre os Nós de Vila Pouca (Treixedo) e Tondela Sul; Na noite de 29 para 30 de setembro, entre os Nós de Canas de Santa Maria e de São Miguel de Outeiro; Na noite de 30 de setembro para 1 de outubro, entre os Nós de Canas de Santa Maria e de São Miguel de Outeiro; Na noite de 1 para 2 de outubro, entre os Nós de Vila Pouca (Treixedo) e Tondela Sul.",
    verification: "VERIFIED",
  },
  {
    id: "ip-ip3-17-desvio",
    authority: IP,
    instrument: NOTICE_TITLE,
    locator: "Alerta rodoviário (série «-17»), desvio",
    url: NOTICE_17,
    retrievedAt: "2026-09-30",
    quote:
      "Durante este período, a circulação será desviada para a antiga EN2, em ambos os sentidos, estando os percursos alternativos devidamente sinalizados no local.",
    verification: "VERIFIED",
    note: "Sem desvio específico para pesados. O percurso exato entre os nós do IP3 e a EN2 não é descrito.",
  },
  {
    id: "ip-ip3-6-ordem-nos",
    authority: IP,
    instrument: `${NOTICE_TITLE} (série «-6», julho 2026)`,
    locator: "Programação — ordem dos nós",
    url: NOTICE_6,
    retrievedAt: "2026-09-30",
    quote:
      "entre o Nó de Tondela Sul e o Nó de Canas de Santa Maria; Na noite de quinta-feira para sexta-feira (9 para 10 de julho): entre o Nó de Canas de Santa Maria e o Nó de São Miguel do Outeiro",
    verification: "VERIFIED",
    note: "Estabelece a sequência Tondela Sul → Canas de Santa Maria → São Miguel do Outeiro.",
  },
  {
    id: "ip-ip3-2-ordem-nos",
    authority: IP,
    instrument: `${NOTICE_TITLE} (série «-2»)`,
    locator: "Trabalhos prévios — ordem dos nós",
    url: NOTICE_2,
    retrievedAt: "2026-09-30",
    quote: "obrigarão ao corte de trânsito entre o Nó de São Miguel do Outeiro e o Nó de Vila Chã de Sá",
    verification: "VERIFIED",
    note: "Estabelece que Vila Chã de Sá é o nó seguinte a São Miguel do Outeiro. Esta série escreve «Vila Cova/Treixedo» noutro ponto; a atual escreve «Vila Pouca (Treixedo)».",
  },
  {
    id: "osm-ip3-nos",
    authority: "OpenStreetMap contributors (ODbL)",
    instrument: `Overpass API — IP3 (trunk/motorway ref "IP 3") e nós motorway_junction, snapshot ${IP3_OSM_SNAPSHOT}`,
    locator: "Saídas numeradas 21–26; ramos da saída 26 com destination «Viseu;Vila Chã de Sá» (ways 1231044174, 141699490)",
    url: "https://www.openstreetmap.org/",
    retrievedAt: "2026-09-30",
    verification: "UNVERIFIED",
    note:
      "Dado geográfico, não oficial. Os nós OSM só têm números; nomes de lugares OSM: Vila Pouca/Treixedo ~1 km da saída 21, Tondela (cidade) entre 22 e 23, Canas de Santa Maria ~2,5 km da 24, São Miguel do Outeiro ~1 km da 25.",
  },
  {
    id: "mapeamento-ip3-nos",
    authority: "FleetOS",
    instrument: NOTICE_TITLE,
    locator: "Nós nomeados ↔ saídas OSM ↔ geometria",
    url: NOTICE_17,
    retrievedAt: "2026-09-30",
    verification: "INTERPRETED",
    note:
      "Âncora: saída 26 = Vila Chã de Sá (destination OSM). Ordem oficial (séries -6/-2): Tondela Sul → Canas → São Miguel do Outeiro → Vila Chã de Sá; sem outras saídas OSM entre elas ⇒ São Miguel do Outeiro = 25, Canas de Santa Maria = 24. Tondela Sul = 22 por ser a saída a sul de Tondela (23 fica a norte) — inferência por proximidade; Vila Pouca (Treixedo) = 21 (sem saídas entre 21 e 22). Troço = caminho mais curto na faixa principal do IP3 entre os nós de saída, nos dois sentidos; limites exatos face aos ramos não indicados pela IP.",
  },
  {
    id: "interp-noite",
    authority: "FleetOS",
    instrument: NOTICE_TITLE,
    locator: "«Na noite de D para D+1 … entre as 21h00 e as 05h00»",
    url: NOTICE_17,
    retrievedAt: "2026-09-30",
    verification: "INTERPRETED",
    note: "Cada noite lida como o intervalo [D 21:00, D+1 05:00) em hora legal de Portugal continental (Europe/Lisbon); o aviso não indica fuso.",
  },
  {
    id: "osm-en2",
    authority: "OpenStreetMap contributors (ODbL)",
    instrument: `Overpass API — vias com ref "EN 2" (excluindo troços partilhados com o IP3 e em construção), snapshot ${EN2_OSM_SNAPSHOT}`,
    locator: "Corredor EN2 entre 40,38° e 40,66° N",
    url: "https://www.openstreetmap.org/",
    retrievedAt: "2026-09-30",
    verification: "UNVERIFIED",
    note: "Apenas descritivo: indica se uma rota segue a EN2. Não reproduz o percurso sinalizado.",
  },
];

export const IP3_GEOMETRIES: GeometryRecord[] = [
  {
    id: "ip3-troco-vila-pouca-tondela-sul",
    label: "IP3 — Nó de Vila Pouca (Treixedo) ↔ Nó de Tondela Sul",
    legalDescriptionEvidence: ["ip-ip3-17-fases"],
    status: "RESOLVED",
    resolved: {
      kind: "polylines",
      lines: IP3_SEGMENT_21_22,
      toleranceM: 30,
      minMatchLengthM: 200,
      maxHeadingDiffDeg: 30,
      verification: "INTERPRETED",
      mappingMethod: "saídas OSM 21↔22 (ver evidência de mapeamento)",
      evidence: ["ip-ip3-17-fases", "ip-ip3-6-ordem-nos", "ip-ip3-2-ordem-nos", "osm-ip3-nos", "mapeamento-ip3-nos"],
    },
  },
  {
    id: "ip3-troco-canas-sao-miguel-outeiro",
    label: "IP3 — Nó de Canas de Santa Maria ↔ Nó de São Miguel do Outeiro",
    legalDescriptionEvidence: ["ip-ip3-17-fases"],
    status: "RESOLVED",
    resolved: {
      kind: "polylines",
      lines: IP3_SEGMENT_24_25,
      toleranceM: 30,
      minMatchLengthM: 200,
      maxHeadingDiffDeg: 30,
      verification: "INTERPRETED",
      mappingMethod: "saídas OSM 24↔25 (ver evidência de mapeamento)",
      evidence: ["ip-ip3-17-fases", "ip-ip3-6-ordem-nos", "ip-ip3-2-ordem-nos", "osm-ip3-nos", "mapeamento-ip3-nos"],
    },
  },
  {
    id: "en2-corredor-ip3",
    label: "antiga EN2",
    legalDescriptionEvidence: ["ip-ip3-17-desvio"],
    status: "RESOLVED",
    resolved: {
      kind: "polylines",
      lines: EN2_LINES,
      toleranceM: 30,
      minMatchLengthM: 500,
      maxHeadingDiffDeg: 30,
      verification: "UNVERIFIED",
      mappingMethod: "vias OSM ref EN 2 — apenas descritivo",
      evidence: ["osm-en2"],
    },
  },
];

const EN2_DIVERSION = {
  id: "desvio-antiga-en2",
  type: "corridor" as const,
  label: "antiga EN2 (desvio sinalizado)",
  roads: ["EN2"],
  sections: ["em ambos os sentidos"],
  evidence: ["ip-ip3-17-desvio"],
  geometryId: "en2-corredor-ip3",
};

function ip3Closure(
  id: string,
  title: string,
  geometryId: string,
  nights: { start: string; end: string }[],
): RegulationRecord {
  return {
    id,
    kind: "ROAD_CLOSURE",
    version: 1,
    title,
    jurisdiction: "PT",
    authority: IP,
    instrument: NOTICE_TITLE,
    legalStatus: "VERIFIED",
    effect: "prohibited",
    effective: { from: "2026-09-28", to: "2026-10-03", evidence: ["ip-ip3-17-corte"] },
    // Closure of the carriageway: applies to all traffic (no vehicle conditions in the notice).
    appliesTo: { kind: "all", of: [] },
    location: { geometryId },
    when: {
      timeZone: "Europe/Lisbon",
      timeZoneEvidence: ["interp-noite"],
      activePeriods: nights.map((n) => ({ ...n, evidence: ["ip-ip3-17-corte", "ip-ip3-17-fases", "interp-noite"] })),
    },
    exceptions: [],
    officialAlternatives: [EN2_DIVERSION],
    evidence: ip3Evidence,
    openQuestions: [
      "Limites exatos do corte face aos ramos dos nós não indicados; troço mapeado entre nós de saída OSM (INTERPRETADO).",
      "Tondela Sul = saída 22 inferido por proximidade (a saída 23 fica entre Tondela Sul e Canas).",
      "Percurso sinalizado entre o IP3 e a antiga EN2 não descrito; sem desvio específico para pesados.",
    ],
  };
}

export const IP3_NIGHT_CLOSURES_2026: RegulationRecord[] = [
  ip3Closure(
    "ip-ip3-corte-noturno-2026-09-vila-pouca-tondela-sul",
    "IP3 cortado (noite) — Vila Pouca (Treixedo) ↔ Tondela Sul",
    "ip3-troco-vila-pouca-tondela-sul",
    [
      { start: "2026-09-28T21:00", end: "2026-09-29T05:00" },
      { start: "2026-10-01T21:00", end: "2026-10-02T05:00" },
    ],
  ),
  ip3Closure(
    "ip-ip3-corte-noturno-2026-09-canas-sao-miguel",
    "IP3 cortado (noite) — Canas de Santa Maria ↔ São Miguel do Outeiro",
    "ip3-troco-canas-sao-miguel-outeiro",
    [
      { start: "2026-09-29T21:00", end: "2026-09-30T05:00" },
      { start: "2026-09-30T21:00", end: "2026-10-01T05:00" },
    ],
  ),
];

/** Manually-introducible road events (id → records + geometry). */
export type RoadEventBundle = {
  id: string;
  label: string;
  sourceUrl: string;
  constraints: RegulationRecord[];
  geometries: GeometryRecord[];
};

export const PT_ROAD_EVENTS: RoadEventBundle[] = [
  {
    id: "ip3-duplicacao-cortes-noturnos-2026-09-28",
    label: "IP3 Santa Comba Dão/Viseu — cortes noturnos 28 set – 2 out (21h–05h)",
    sourceUrl: NOTICE_17,
    constraints: IP3_NIGHT_CLOSURES_2026,
    geometries: IP3_GEOMETRIES,
  },
];
