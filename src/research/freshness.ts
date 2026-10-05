import type { RetrievalRecord } from "./types";

/*
 * Freshness is NOT `now − fetchTime`. Five separate dimensions:
 *  - retrieval health: did the last attempts succeed?
 *  - publication freshness: how old is the source's OWN latest publication (by its cadence)?
 *  - event validity: is the event current, future, expired or open-ended?
 *  - candidate freshness: when was the candidate last seen in the source?
 *  - knowledge release age: how old is the dataset version the decision used?
 * A source fetched today that only contains a six-month-old event is healthy but not
 * current; a fortnightly source unchanged for ten days can still be FRESH.
 */

export type Cadence = { expectedEveryMin: number; agingAfterMin: number; staleAfterMin: number };

export type ResearchFreshness = {
  retrievalHealth: { state: "OK" | "FAILING" | "NEVER"; lastSuccessAt?: string; lastFailure?: string; consecutiveFailures: number };
  publication: { state: "FRESH" | "AGING" | "STALE" | "UNKNOWN"; publishedAt?: string; basis: string };
  eventValidity: "CURRENT" | "FUTURE" | "EXPIRED" | "OPEN_ENDED" | "UNKNOWN";
  candidate: { lastSeenAt?: string; ageMin?: number };
  knowledgeReleaseAgeMin?: number;
  summary: string;
};

const MIN = 60_000;

/** Publication time from preserved metadata: in-document date first, else HTTP Last-Modified (labelled). */
export function publicationOf(r: RetrievalRecord | undefined, inDocument?: string): { publishedAt?: string; basis: string } {
  if (inDocument) return { publishedAt: inDocument, basis: "data declarada no documento" };
  const lm = r?.headers["last-modified"];
  if (lm && Number.isFinite(Date.parse(lm))) return { publishedAt: new Date(Date.parse(lm)).toISOString(), basis: "cabeçalho HTTP Last-Modified (servidor; pode não ser a data de publicação)" };
  return { basis: "a fonte não declara data de publicação" };
}

export function assessResearchFreshness(args: {
  retrievals: RetrievalRecord[];
  cadence: Cadence;
  inDocumentPublishedAt?: string;
  periods?: { startMs: number; endMs: number | null }[];
  candidateLastSeenAt?: string;
  knowledgeReleasedAt?: string;
  now: Date;
}): ResearchFreshness {
  const now = args.now.getTime();
  const sorted = [...args.retrievals].sort((a, b) => b.retrievedAt.localeCompare(a.retrievedAt));
  const lastOk = sorted.find((r) => !r.error);
  let failures = 0;
  for (const r of sorted) {
    if (!r.error) break;
    failures++;
  }
  const retrievalHealth: ResearchFreshness["retrievalHealth"] = !sorted.length
    ? { state: "NEVER", consecutiveFailures: 0 }
    : { state: failures > 0 ? "FAILING" : "OK", ...(lastOk ? { lastSuccessAt: lastOk.retrievedAt } : {}), ...(failures ? { lastFailure: sorted[0]!.error!.message } : {}), consecutiveFailures: failures };

  const pub = publicationOf(lastOk, args.inDocumentPublishedAt);
  let pubState: ResearchFreshness["publication"]["state"] = "UNKNOWN";
  if (pub.publishedAt) {
    const age = (now - Date.parse(pub.publishedAt)) / MIN;
    pubState = age >= args.cadence.staleAfterMin ? "STALE" : age >= args.cadence.agingAfterMin ? "AGING" : "FRESH";
  }
  let eventValidity: ResearchFreshness["eventValidity"] = "UNKNOWN";
  if (args.periods?.length) {
    if (args.periods.some((p) => p.endMs === null && p.startMs <= now)) eventValidity = "OPEN_ENDED";
    else if (args.periods.some((p) => p.startMs <= now && (p.endMs ?? Infinity) > now)) eventValidity = "CURRENT";
    else if (args.periods.some((p) => p.startMs > now)) eventValidity = "FUTURE";
    else eventValidity = "EXPIRED";
  }
  const candidate = args.candidateLastSeenAt ? { lastSeenAt: args.candidateLastSeenAt, ageMin: Math.round((now - Date.parse(args.candidateLastSeenAt)) / MIN) } : {};
  const knowledgeReleaseAgeMin = args.knowledgeReleasedAt ? Math.round((now - Date.parse(args.knowledgeReleasedAt)) / MIN) : undefined;
  const summary = [
    `obtenção ${retrievalHealth.state}`,
    `publicação ${pubState}${pub.publishedAt ? "" : " (sem data)"}`,
    `evento ${eventValidity}`,
  ].join(" · ");
  return { retrievalHealth, publication: { state: pubState, ...(pub.publishedAt ? { publishedAt: pub.publishedAt } : {}), basis: pub.basis }, eventValidity, candidate, ...(knowledgeReleaseAgeMin !== undefined ? { knowledgeReleaseAgeMin } : {}), summary };
}
