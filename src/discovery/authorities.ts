import type { Municipality } from "../ingestion/types";
import type { Authority } from "./types";

/*
 * Authority registry — DATA. A domain is listed only with the evidence that ties it to
 * the authority (a registered, verified source it publishes). Municipal domains are NOT
 * guessed from naming patterns: a municipality without a verified domain has an
 * OFFICIAL_DOMAIN_UNKNOWN gap, which is itself a discovery task.
 */

const CHECKED = "2026-09-30";

export const NATIONAL_AUTHORITIES: Authority[] = [
  {
    id: "ip",
    name: "Infraestruturas de Portugal, S.A.",
    kind: "national_road_manager",
    jurisdiction: { kind: "national" },
    domains: [
      {
        domain: "infraestruturasdeportugal.pt",
        establishedBy: "Publica os avisos rodoviários registados (servicos.infraestruturasdeportugal.pt/pt-pt/alertas/rodovia/…) usados nas fontes curadas do IP3.",
        checkedAt: CHECKED,
      },
    ],
    sourceIds: ["ip-arcgis-condicionamentos", "ip-arcgis-ocorrencias", "ip-arcgis-acidentes", "ip-aviso-ip3-duplicacao-17"],
  },
  {
    id: "incm-dr",
    name: "Diário da República (INCM)",
    kind: "legal_publisher",
    jurisdiction: { kind: "national" },
    domains: [
      {
        domain: "diariodarepublica.pt",
        establishedBy: "Jornal oficial; os diplomas citados nas restrições curadas (DL 155-A/2026) estão publicados em files.diariodarepublica.pt.",
        checkedAt: CHECKED,
      },
    ],
    sourceIds: ["dr-serie1", "dr-serie2-parte-h"],
  },
  {
    id: "dgt",
    name: "Direção-Geral do Território",
    kind: "geodata_authority",
    jurisdiction: { kind: "national" },
    domains: [
      {
        domain: "dgterritorio.gov.pt",
        establishedBy: "Publica a CAOP2025 (API OGC ogcapi.dgterritorio.gov.pt) usada no registo municipal.",
        checkedAt: CHECKED,
      },
    ],
    sourceIds: [],
  },
];

/** Verified municipal domains (by CAOP code). Absent ⇒ unknown, never inferred. */
const MUNICIPAL_DOMAINS: Record<string, Authority["domains"]> = {
  "1312": [
    {
      domain: "cm-porto.pt",
      establishedBy: "Portal de dados abertos dadosabertos.cm-porto.pt publica os conjuntos «Condicionamentos de trânsito» com organização/editor «Câmara Municipal do Porto» (fonte registada porto-datex-programados).",
      checkedAt: CHECKED,
    },
  ],
};

const MUNICIPAL_SOURCES: Record<string, string[]> = {
  "1312": ["porto-datex-programados", "porto-datex-nao-programados", "porto-ckan-condicionamentos"],
};

export const municipalAuthorityId = (code: string) => `municipio:${code}`;

export function municipalAuthority(m: Pick<Municipality, "code" | "name">): Authority {
  return {
    id: municipalAuthorityId(m.code),
    name: `Município de ${m.name}`,
    kind: "municipality",
    jurisdiction: { kind: "municipal", municipalityCodes: [m.code] },
    domains: MUNICIPAL_DOMAINS[m.code] ?? [],
    sourceIds: MUNICIPAL_SOURCES[m.code] ?? [],
  };
}

/**
 * Development-only synthetic authority (fixtures). Its domain uses the reserved
 * `.invalid` TLD so it can never collide with a real site.
 */
export const DEV_TEST_AUTHORITY: Authority = {
  id: "dev-test-authority",
  name: "[TESTE SINTÉTICO] Gestor de via fictício (fixture FleetOS)",
  kind: "synthetic_test",
  jurisdiction: { kind: "national" },
  domains: [{ domain: "fleetos-dev-fixtures.invalid", establishedBy: "Domínio reservado de fixtures de desenvolvimento FleetOS.", checkedAt: CHECKED }],
  sourceIds: [],
  synthetic: true,
};

export function allAuthorities(municipalities: Pick<Municipality, "code" | "name">[], includeDev: boolean): Authority[] {
  return [...NATIONAL_AUTHORITIES, ...municipalities.map(municipalAuthority), ...(includeDev ? [DEV_TEST_AUTHORITY] : [])];
}

/**
 * Every verified official domain in the registry (national + municipal). The research
 * retrieval boundary only fetches from these — an allow-list derived from evidence, never
 * from how a host name looks.
 */
export function registryDomains(): { domain: string; authorityId: string }[] {
  return [
    ...NATIONAL_AUTHORITIES.flatMap((a) => a.domains.map((d) => ({ domain: d.domain, authorityId: a.id }))),
    ...Object.entries(MUNICIPAL_DOMAINS).flatMap(([code, ds]) => ds.map((d) => ({ domain: d.domain, authorityId: municipalAuthorityId(code) }))),
  ];
}

