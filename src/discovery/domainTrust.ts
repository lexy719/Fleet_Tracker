import type { Authority, TrustClassification } from "./types";

/*
 * Domain trust. Only hosts that are (sub)domains of a registry domain WITH evidence are
 * OFFICIAL. Look-alikes ("cm-porto.pt.example.com", "notinfraestruturasdeportugal.pt")
 * never match: comparison is on whole DNS labels.
 */

const GOV_SUFFIXES = [".gov.pt"];

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null; // "https://official.pt@evil.com" style tricks
    return u.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

/** host === domain or host ends with "." + domain (label boundary). */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

export function classifyUrl(url: string, authorities: Authority[]): TrustClassification {
  const host = hostOf(url);
  if (!host) return { url, domain: "", trust: "INVALID_URL", basis: "URL inválido ou esquema não suportado" };
  for (const a of authorities) {
    for (const d of a.domains) {
      if (!hostMatchesDomain(host, d.domain)) continue;
      return a.synthetic
        ? { url, domain: host, trust: "OFFICIAL_SYNTHETIC_TEST", authorityId: a.id, basis: `domínio de fixtures de teste (${d.domain})` }
        : { url, domain: host, trust: "OFFICIAL_VERIFIED", authorityId: a.id, basis: `${d.domain}: ${d.establishedBy}` };
    }
  }
  if (GOV_SUFFIXES.some((s) => host.endsWith(s))) {
    return { url, domain: host, trust: "UNVERIFIED_GOVERNMENT_SUFFIX", basis: "sufixo governamental, mas domínio não consta do registo de autoridades — requer validação" };
  }
  return { url, domain: host, trust: "NON_AUTHORITATIVE", basis: "domínio sem autoridade reconhecida — pode apenas ajudar a descobrir fontes oficiais" };
}

/** May a result from this domain ever become operational evidence (through the 3B pipeline)? */
export function operationallyEligible(t: TrustClassification, allowSynthetic: boolean): boolean {
  return t.trust === "OFFICIAL_VERIFIED" || (allowSynthetic && t.trust === "OFFICIAL_SYNTHETIC_TEST");
}

/** Invisible / bidi-control characters used to disguise text. */
// eslint-disable-next-line no-control-regex -- intentionally strips control characters from hostile text
const CONTROL_CHARS = new RegExp("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]", "g");

/** Plain-text, length-capped view of hostile page text (never rendered as HTML). */
export function sanitizeSnippet(s: string, max = 400): string {
  const text = s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
