import type { DiscoveryTopic } from "../discovery/types";
import type { Cadence } from "./freshness";
import type { SourceUseMetadata } from "./types";

/*
 * Research entry points — DATA, not code paths. Each says where an authority publishes a
 * kind of information and how to read it. Adding a municipality or authority means adding
 * an entry (after verifying it), never adding `if (source === …)` logic.
 */

export type ResearchEntrypoint = {
  id: string;
  authorityId: string;
  name: string;
  kind: "LISTING" | "DOCUMENT";
  /** First page(s) to retrieve. */
  urls: string[];
  /** Listing only: links to documents (regex on the href path). */
  linkPattern?: string;
  documentType: "HTML_NOTICE" | "PDF_DOCUMENT";
  topics: DiscoveryTopic[];
  jurisdiction: { kind: "national" } | { kind: "municipal"; municipalityCodes: string[] };
  cadence: Cadence;
  use: SourceUseMetadata;
  /** Knowledge this document underpins (revalidation of curated constraints). */
  underpins?: string[];
  verifiedAt: string;
  notes: string[];
};

const IP = "https://servicos.infraestruturasdeportugal.pt";

export const RESEARCH_ENTRYPOINTS: ResearchEntrypoint[] = [
  {
    id: "ip-alertas-rodovia",
    authorityId: "ip",
    name: "IP — Alertas rodoviários (avisos em texto)",
    kind: "LISTING",
    urls: [`${IP}/pt-pt/alertas-ips`, `${IP}/pt-pt/alertas-ips?page=1`, `${IP}/pt-pt/alertas-ips?page=2`, `${IP}/pt-pt/alertas-ips?page=3`],
    linkPattern: "^/pt-pt/alertas/rodovia/[a-z0-9-]+$",
    documentType: "HTML_NOTICE",
    topics: ["temporary_closures", "temporary_restrictions", "roadworks"],
    jurisdiction: { kind: "national" },
    // IP publishes notices irregularly (several per week); the listing itself has no publication date.
    cadence: { expectedEveryMin: 24 * 60, agingAfterMin: 3 * 24 * 60, staleAfterMin: 7 * 24 * 60 },
    use: {
      licence: "UNKNOWN",
      commercialUse: "UNKNOWN",
      redistribution: "UNKNOWN",
      attributionRequired: "UNKNOWN",
      snapshotRetention: "UNKNOWN",
      evidenceDisplay: "UNKNOWN",
      basis: "página pública da IP; termos de utilização do sítio não analisados — nada se conclui da ausência de licença explícita",
    },
    verifiedAt: "2026-10-01",
    notes: [
      "Verificado em 2026-10-01: /pt-pt/alertas-ips lista avisos rodoviários (/pt-pt/alertas/rodovia/…); /pt-pt/alertas lista avisos ferroviários.",
      "robots.txt de servicos.infraestruturasdeportugal.pt não proíbe estes caminhos.",
      "As páginas dos avisos não declaram data de publicação.",
    ],
  },
];

/**
 * Legal bases of curated knowledge, derived from the curated records themselves: every PDF
 * evidence URL on a verified official domain becomes a DOCUMENT entry point to revalidate.
 */
export function legalBasisEntrypoints(
  regs: { id: string; evidence: { url: string; authority: string }[] }[],
  authorityOfUrl: (url: string) => string | undefined,
): ResearchEntrypoint[] {
  const byUrl = new Map<string, ResearchEntrypoint>();
  for (const r of regs) {
    for (const e of r.evidence) {
      if (!/\.pdf($|\?)/i.test(e.url)) continue;
      const authorityId = authorityOfUrl(e.url);
      if (!authorityId) continue;
      const ex = byUrl.get(e.url);
      if (ex) {
        if (!ex.underpins!.includes(r.id)) ex.underpins!.push(r.id);
        continue;
      }
      byUrl.set(e.url, {
        id: `basis:${e.url.split("/").slice(-1)[0]}`,
        authorityId,
        name: `Base legal: ${e.authority}`,
        kind: "DOCUMENT",
        urls: [e.url],
        documentType: "PDF_DOCUMENT",
        topics: ["legal_acts", "permanent_hgv_restrictions"],
        jurisdiction: { kind: "national" },
        // A published act does not change; re-check monthly for rectifications.
        cadence: { expectedEveryMin: 30 * 24 * 60, agingAfterMin: 90 * 24 * 60, staleAfterMin: 365 * 24 * 60 },
        use: {
          licence: "UNKNOWN",
          commercialUse: "UNKNOWN",
          redistribution: "UNKNOWN",
          attributionRequired: "UNKNOWN",
          snapshotRetention: "UNKNOWN",
          evidenceDisplay: "UNKNOWN",
          basis: "diploma oficial publicado; termos de reutilização do Diário da República não analisados",
        },
        underpins: [r.id],
        verifiedAt: "2026-10-01",
        notes: ["Derivado das evidências citadas pelos registos curados."],
      });
    }
  }
  return [...byUrl.values()];
}
