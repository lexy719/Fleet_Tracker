import { classifyUrl } from "../discovery/domainTrust";
import type { Authority } from "../discovery/types";

/*
 * Authority resolution BEFORE trust. A result being relevant (or ranked first by a search
 * engine) never makes it authoritative. We establish: the organisation the page claims,
 * whether its host is a verified official domain in the registry, which registry
 * authority that is, and the relationship between the document and that authority.
 */

export type SecondaryKind = "news" | "social" | "forum" | "blog" | "seo_or_aggregator" | "unknown_site";

export type AuthorityResolution = {
  status: "PRIMARY_OFFICIAL" | "UNVERIFIED_GOVERNMENT" | "SECONDARY" | "INVALID";
  url: string;
  host: string;
  /** Registry authority whose verified domain the host belongs to. */
  authorityId?: string;
  verifiedDomain?: string;
  domainEvidence?: string;
  /** Organisation the text claims (data only — never used to establish authority). */
  claimedOrganization?: string;
  /** Does the claim agree with the registry authority? Unknown when there is no claim. */
  claimMatchesRegistry: boolean | null;
  relationship: "PUBLISHER" | "SECONDARY_MENTION" | "UNKNOWN";
  secondaryKind?: SecondaryKind;
  geographicResponsibility?: Authority["jurisdiction"];
  basis: string;
};

const SOCIAL = ["facebook.com", "fb.com", "instagram.com", "x.com", "twitter.com", "tiktok.com", "linkedin.com", "youtube.com", "threads.net"];
const FORUM = ["reddit.com", "forum", "forumauto"];
const NEWS = ["publico.pt", "jn.pt", "dn.pt", "observador.pt", "cmjornal.pt", "rtp.pt", "sicnoticias.pt", "tsf.pt", "expresso.pt", "noticiasaominuto.com", "sapo.pt", "lusa.pt", "nit.pt", "tvi.pt", "cnnportugal.iol.pt"];
const BLOG = ["blogspot.", "wordpress.", "medium.com", "substack.com"];

function hostMatches(host: string, d: string): boolean {
  return host === d || host.endsWith(`.${d}`) || (d.endsWith(".") && host.startsWith(d)) || (!d.includes(".") && host.includes(d));
}

export function secondaryKindOf(host: string): SecondaryKind {
  if (SOCIAL.some((d) => hostMatches(host, d))) return "social";
  if (FORUM.some((d) => hostMatches(host, d))) return "forum";
  if (NEWS.some((d) => hostMatches(host, d))) return "news";
  if (BLOG.some((d) => host.includes(d))) return "blog";
  return "unknown_site";
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function resolveAuthority(url: string, authorities: Authority[], claimedOrganization?: string): AuthorityResolution {
  const t = classifyUrl(url, authorities);
  const claim = claimedOrganization?.trim() || undefined;
  if (t.trust === "INVALID_URL") return { status: "INVALID", url, host: "", claimMatchesRegistry: null, relationship: "UNKNOWN", basis: t.basis, ...(claim ? { claimedOrganization: claim } : {}) };
  if (t.trust === "OFFICIAL_VERIFIED" || t.trust === "OFFICIAL_SYNTHETIC_TEST") {
    const a = authorities.find((x) => x.id === t.authorityId)!;
    const d = a.domains.find((x) => t.domain === x.domain || t.domain.endsWith(`.${x.domain}`));
    const claimMatches = claim ? fold(a.name).split(/[\s,.]+/).filter((w) => w.length > 3).some((w) => fold(claim).includes(w)) : null;
    return {
      status: "PRIMARY_OFFICIAL",
      url,
      host: t.domain,
      authorityId: a.id,
      verifiedDomain: d?.domain,
      domainEvidence: d?.establishedBy,
      ...(claim ? { claimedOrganization: claim } : {}),
      claimMatchesRegistry: claimMatches,
      relationship: "PUBLISHER",
      geographicResponsibility: a.jurisdiction,
      basis: `domínio verificado de ${a.name}: ${t.basis}${claimMatches === false ? " — ATENÇÃO: a organização declarada no texto não coincide com a autoridade do domínio" : ""}`,
    };
  }
  if (t.trust === "UNVERIFIED_GOVERNMENT_SUFFIX") {
    return { status: "UNVERIFIED_GOVERNMENT", url, host: t.domain, ...(claim ? { claimedOrganization: claim } : {}), claimMatchesRegistry: null, relationship: "UNKNOWN", basis: t.basis };
  }
  return {
    status: "SECONDARY",
    url,
    host: t.domain,
    ...(claim ? { claimedOrganization: claim } : {}),
    claimMatchesRegistry: null,
    relationship: "SECONDARY_MENTION",
    secondaryKind: secondaryKindOf(t.domain),
    basis: `${t.basis}${claim ? ` — a página afirma ser/citar «${claim}», o que não é prova de autoridade` : ""}`,
  };
}

/* ─── Search results ─── */

export type SearchHit = { url: string; title: string; snippet: string; rank?: number };

export type ClassifiedHit = SearchHit & {
  resolution: AuthorityResolution;
  /** What the agent may do with it. */
  use: "RETRIEVE_PRIMARY" | "FOLLOW_TO_PRIMARY" | "DISCOVERY_CLUE_ONLY" | "IGNORE";
  /** Official URLs mentioned in a secondary result (to look for the primary source). */
  primaryCandidates: string[];
  reason: string;
};

/**
 * Classify a search hit. Rank is recorded but never used as authority evidence. Secondary
 * hits can only point to a primary source; they never inherit its authority.
 */
export function classifySearchHit(h: SearchHit, authorities: Authority[], relevantTerms: string[]): ClassifiedHit {
  const resolution = resolveAuthority(h.url, authorities);
  const text = fold(`${h.title} ${h.snippet}`);
  const relevant = relevantTerms.length === 0 || relevantTerms.some((t) => text.includes(fold(t)));
  const linked = [...`${h.snippet}`.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]).filter((u) => resolveAuthority(u, authorities).status === "PRIMARY_OFFICIAL");
  if (resolution.status === "INVALID") return { ...h, resolution, use: "IGNORE", primaryCandidates: [], reason: "URL inválido" };
  if (!relevant) return { ...h, resolution, use: "IGNORE", primaryCandidates: [], reason: "não menciona estradas/concelhos do âmbito" };
  if (resolution.status === "PRIMARY_OFFICIAL") return { ...h, resolution, use: "RETRIEVE_PRIMARY", primaryCandidates: [], reason: `fonte primária oficial (${resolution.verifiedDomain})` };
  if (linked.length) return { ...h, resolution, use: "FOLLOW_TO_PRIMARY", primaryCandidates: linked, reason: "resultado secundário com ligação para fonte oficial — obter a fonte primária" };
  return { ...h, resolution, use: "DISCOVERY_CLUE_ONLY", primaryCandidates: [], reason: `resultado ${resolution.status === "SECONDARY" ? `secundário (${resolution.secondaryKind})` : "governamental não verificado"} — pista de descoberta apenas, nunca evidência` };
}
