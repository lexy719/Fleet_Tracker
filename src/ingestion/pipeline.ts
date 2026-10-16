import { canonicalJson, hashString } from "../regulations/decisionInputs";
import type { GeometryRecord, RegulationRecord } from "../regulations/types";
import { extractNotice, UNAVAILABLE_EXTRACTOR, type NoticeExtractor } from "./ai/noticeExtraction";
import { mergeCandidates } from "./changes";
import { assessFreshness } from "./freshness";
import { parseCkanPackage } from "./parsers/ckan";
import { parseDatex2 } from "./parsers/datex2";
import { parseDrRss } from "./parsers/drRss";
import { parseIpAlertasJsonapi } from "./parsers/ipAlertasJsonapi";
import { parseIpArcgis } from "./parsers/ipArcgis";
import { parseLisboaClosures } from "./parsers/lisboaClosures";
import { parseOeirasWfs } from "./parsers/oeirasWfs";
import { parseWpNotices } from "./parsers/wpNotices";
import { fetchUrlFor } from "./sources";
import type { IngestionStore } from "./store";
import { sha256Hex } from "./text";
import { reviewedConstraint, type ReviewRecord } from "./review";
import { candidateToConstraint } from "./toConstraint";
import { applyTrustGate } from "./trustGate";
import type { CandidateConstraint, FetchAttempt, Freshness, LegalFeedItem, ParseOutput, RawSnapshot, SourceRecord, SourceState } from "./types";

export const FETCH_TIMEOUT_MS = 30_000;
export const MAX_BODY_BYTES = 15 * 1024 * 1024;

export type FetchImpl = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

/* ─── Fetch ─── */

export async function fetchSource(source: SourceRecord, fetchImpl: FetchImpl, now: Date): Promise<FetchAttempt> {
  const url = fetchUrlFor(source);
  const attemptedAt = now.toISOString();
  const fail = (error: string, httpStatus?: number): FetchAttempt => ({ ok: false, sourceId: source.id, attemptedAt, error, ...(httpStatus ? { httpStatus } : {}) });
  if (!url) return fail("fonte estática — nada a obter");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { Accept: "application/json, application/xml, text/xml, text/html;q=0.9, */*;q=0.5" } });
    if (!res.ok) return fail(`HTTP ${res.status}`, res.status);
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(`resposta demasiado grande (${declared} bytes)`, res.status);
    const body = await res.text();
    if (body.length > MAX_BODY_BYTES) return fail(`resposta demasiado grande (${body.length} caracteres)`, res.status);
    if (!body.trim()) return fail("resposta vazia", res.status);
    const sha256 = await sha256Hex(body);
    const snapshot: RawSnapshot = {
      id: `${source.id}@${attemptedAt}`,
      sourceId: source.id,
      fetchedAt: attemptedAt,
      httpStatus: res.status,
      contentType: res.headers.get("content-type") ?? "",
      byteLength: new TextEncoder().encode(body).length,
      sha256,
      body,
    };
    return { ok: true, snapshot };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return fail(aborted ? `tempo esgotado (${FETCH_TIMEOUT_MS / 1000} s)` : `falha de rede: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Parse ─── */

export async function parseSnapshot(
  source: SourceRecord,
  snapshot: RawSnapshot,
  extractor: NoticeExtractor,
): Promise<ParseOutput & { legalItems?: LegalFeedItem[] }> {
  try {
    switch (source.parser) {
      case "ip-arcgis-events":
        return parseIpArcgis(snapshot);
      case "datex2-situations":
        return parseDatex2(snapshot);
      case "ckan-package":
        return parseCkanPackage(snapshot);
      case "dr-rss":
        return parseDrRss(snapshot);
      case "lisboa-closures":
        return parseLisboaClosures(snapshot);
      case "oeiras-wfs":
        return parseOeirasWfs(snapshot);
      case "ip-alertas-jsonapi":
        return parseIpAlertasJsonapi(snapshot);
      case "wp-notices":
        return parseWpNotices(snapshot);
      case "html-notice-ai":
        return await extractNotice(snapshot, extractor);
      case "static-curated":
      case "research-agent":
        return { candidates: [], errors: [], recordCount: 0 };
    }
  } catch (e) {
    return {
      candidates: [],
      errors: [{ sourceId: source.id, snapshotId: snapshot.id, kind: "PARSE_ERROR", message: `parser falhou: ${e instanceof Error ? e.message : String(e)}` }],
      recordCount: 0,
    };
  }
}

/** A parse that produced nothing usable (whole-payload failure, not per-record issues). */
function parseFailed(out: ParseOutput): boolean {
  return out.candidates.length === 0 && out.recordCount === 0 && out.errors.length > 0;
}

/* ─── Run one source ─── */

export type RunOutcome = "FETCH_ERROR" | "PARSE_ERROR" | "UNCHANGED" | "CHANGED";

export type RunReport = {
  sourceId: string;
  outcome: RunOutcome;
  message?: string;
  counts?: { records: number; candidates: number; new: number; updated: number; noLongerReported: number; errors: number };
};

export async function runSource(
  source: SourceRecord,
  deps: { store: IngestionStore; fetch: FetchImpl; extractor?: NoticeExtractor; now?: Date },
): Promise<RunReport> {
  const now = deps.now ?? new Date();
  const { store } = deps;
  const prevState: SourceState =
    (await store.getSourceStates()).find((s) => s.sourceId === source.id) ?? { sourceId: source.id, unchangedFetches: 0 };

  const attempt = await fetchSource(source, deps.fetch, now);
  if (!attempt.ok) {
    await store.putSourceState({ ...prevState, lastAttemptAt: attempt.attemptedAt, lastError: attempt.error, ...(attempt.httpStatus ? { lastHttpStatus: attempt.httpStatus } : {}) });
    await regateSource(source, store, now);
    return { sourceId: source.id, outcome: "FETCH_ERROR", message: attempt.error };
  }
  const snap = attempt.snapshot;
  const at = snap.fetchedAt;

  // Same bytes as last time: nothing to parse; freshness may still move (by publication date).
  if (prevState.lastSha256 === snap.sha256 && prevState.lastSnapshotId) {
    const rest: SourceState = { ...prevState };
    delete rest.lastError;
    await store.putSourceState({ ...rest, lastAttemptAt: at, lastSuccessAt: at, lastHttpStatus: snap.httpStatus, unchangedFetches: prevState.unchangedFetches + 1 });
    await regateSource(source, store, now);
    return { sourceId: source.id, outcome: "UNCHANGED" };
  }

  const parsed = await parseSnapshot(source, snap, deps.extractor ?? UNAVAILABLE_EXTRACTOR);
  await store.putSnapshot(snap);
  if (parseFailed(parsed)) {
    // Keep previous candidates untouched: a broken payload is not "everything ended".
    const message = parsed.errors.map((e) => `${e.kind}: ${e.message}`).join("; ");
    await store.putSourceState({ ...prevState, lastAttemptAt: at, lastError: message, lastHttpStatus: snap.httpStatus, lastSnapshotId: snap.id, lastSha256: snap.sha256 });
    await store.putErrors(source.id, parsed.errors);
    await regateSource(source, store, now);
    return { sourceId: source.id, outcome: "PARSE_ERROR", message };
  }

  const state: SourceState = {
    sourceId: source.id,
    lastAttemptAt: at,
    lastSuccessAt: at,
    lastHttpStatus: snap.httpStatus,
    lastSnapshotId: snap.id,
    lastSha256: snap.sha256,
    recordCount: parsed.recordCount,
    unchangedFetches: 0,
    ...(parsed.publishedAt ? { publishedAt: parsed.publishedAt, publishedAtBasis: parsed.publishedAtBasis } : {}),
  };
  await store.putSourceState(state);
  const freshness = assessFreshness(source, state, now);
  const previous = await store.getCandidates(source.id);
  const merged = mergeCandidates(previous, parsed.candidates, at, (c) => applyTrustGate(c, source, freshness, now));
  await store.putCandidates(source.id, merged.candidates);
  await store.appendChanges(merged.changes);
  await store.putErrors(source.id, parsed.errors);
  if (parsed.legalItems) await store.putLegalItems(source.id, parsed.legalItems);

  const n = (k: string) => merged.changes.filter((c) => c.change === k).length;
  return {
    sourceId: source.id,
    outcome: "CHANGED",
    counts: {
      records: parsed.recordCount,
      candidates: merged.candidates.length,
      new: n("NEW"),
      updated: n("UPDATED"),
      noLongerReported: n("NO_LONGER_REPORTED"),
      errors: parsed.errors.length,
    },
  };
}

/** Re-apply the gate (time passes, freshness changes) without new data. */
async function regateSource(source: SourceRecord, store: IngestionStore, now: Date): Promise<void> {
  const state = (await store.getSourceStates()).find((s) => s.sourceId === source.id);
  const freshness = assessFreshness(source, state, now);
  const cands = await store.getCandidates(source.id);
  if (cands.length === 0) return;
  await store.putCandidates(source.id, regate(cands, source, freshness, now));
}

export function regate(cands: CandidateConstraint[], source: SourceRecord, freshness: Freshness, now: Date): CandidateConstraint[] {
  return cands.map((c) => ({ ...c, gate: applyTrustGate(c, source, freshness, now) }));
}

/* ─── Candidates → evaluator dataset ─── */

export type IngestedConstraints = {
  constraints: RegulationRecord[];
  geometries: GeometryRecord[];
  /** Changes whenever the set of active ingested constraints changes. Empty when none. */
  fingerprint: string;
};

export function buildIngestedConstraints(
  candidates: CandidateConstraint[],
  sources: SourceRecord[],
  freshness: Record<string, Freshness>,
  now: Date,
  reviews: { records: ReviewRecord[]; curatedGeometries: GeometryRecord[] } = { records: [], curatedGeometries: [] },
): IngestedConstraints & { reviewStatus: Record<string, string> } {
  const constraints: RegulationRecord[] = [];
  const geometries: GeometryRecord[] = [];
  const reviewStatus: Record<string, string> = {};
  for (const c of candidates) {
    const source = sources.find((s) => s.id === c.sourceId);
    if (!source) continue;
    const gated = { ...c, gate: applyTrustGate(c, source, freshness[source.id] ?? assessFreshness(source, undefined, now), now) };
    const r = candidateToConstraint(gated, source, c.lastSeenAt);
    if (!r) continue;
    constraints.push(r.constraint);
    geometries.push(r.geometry);
  }
  for (const rev of reviews.records) {
    const source = sources.find((s) => s.id === rev.sourceId);
    const current = candidates.find((c) => c.id === rev.candidateId);
    const res = reviewedConstraint(rev, current, source, source ? freshness[source.id] : undefined, reviews.curatedGeometries, now);
    if (!res.active) {
      reviewStatus[rev.candidateId] = res.reason;
      continue;
    }
    reviewStatus[rev.candidateId] = "ativo";
    constraints.push(res.constraint);
    if (res.geometry) geometries.push(res.geometry);
  }
  const fingerprint = constraints.length
    ? hashString(canonicalJson(constraints.map((c) => [c.id, c.version, c.location.geometryId, geometries.find((g) => g.id === c.location.geometryId)?.status])))
    : "";
  return { constraints, geometries, fingerprint, reviewStatus };
}
