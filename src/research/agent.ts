import { hashString } from "../regulations/decisionInputs";
import type { Authority } from "../discovery/types";
import type { ParseOutput } from "../ingestion/types";
import { classifySearchHit, resolveAuthority, type AuthorityResolution, type ClassifiedHit } from "./authority";
import { BudgetTracker, DEFAULT_RESEARCH_BUDGET, type ResearchBudget } from "./budget";
import { extractionToCandidates } from "./candidates";
import { detectConflicts, factFromCandidate, type Conflict, type Fact } from "./conflicts";
import type { EvidenceStore } from "./evidence";
import type { ResearchEntrypoint } from "./entrypoints";
import { runExtraction, type SemanticExtractor } from "./extractors";
import type { ChainageReference, NamedSegmentReference } from "./geometryResolution";
import { base64ToBytes, preserveRetrieval, type DocumentRetriever } from "./retrieval";
import { diffCandidates, type FieldChange } from "./revision";
import { SearchUnavailableError, type SearchProvider } from "./search";
import type { DocumentSnapshot, ExtractionRun, ResearchGap, ResearchReason } from "./types";

/*
 * The research agent. Bounded, route-scoped, gap-driven:
 *
 *   scope + gaps → (skip healthy sources) → discover → retrieve → PRESERVE → extract
 *   → candidates (+ field evidence, versions, conflicts) → gaps
 *
 * It never activates a constraint and never approves anything: its output is candidates
 * for the existing trust gate / human review, and gaps. Every action records WHY.
 */

export const AGENT_VERSION = 1;

export type ResearchScope = {
  id: string;
  roads: string[];
  municipalities: { code: string; name: string }[];
  authorityIds: string[];
  gaps: { kind: string; authorityId?: string; sourceId?: string; road?: string; municipalityCode?: string }[];
};

export type ResearchState =
  | "RESEARCHING"
  | "SOURCE_FOUND"
  | "NEW_CANDIDATE"
  | "CANDIDATE_REVISED"
  | "UNCHANGED"
  | "REVIEW_REQUIRED"
  | "SOURCE_STALE"
  | "SOURCE_FAILED"
  | "NO_OFFICIAL_SOURCE_FOUND"
  | "SKIPPED_HEALTHY"
  | "IRRELEVANT"
  | "NO_LONGER_LISTED"
  | "BUDGET_EXHAUSTED";

export type ResearchStep = { at: string; state: ResearchState; url?: string; entrypointId?: string; why: ResearchReason; detail: string };

export type ResearchProposal = { id: string; url: string; status: "PROPOSED"; resolution: AuthorityResolution; query: string; why: ResearchReason; discoveredVia: string; note: string };

export type ResearchMetrics = {
  searchQueries: number;
  searchResultsConsidered: number;
  officialResultsAccepted: number;
  secondaryResultsRejected: number;
  pagesFetched: number;
  retrievalFailures: number;
  snapshotsCreated: number;
  snapshotsUnchanged: number;
  structuredParserRuns: number;
  semanticExtractionRuns: number;
  extractionReused: number;
  extractionLatencyMs: number;
  tokens: { input: number; output: number } | null;
  costEur: number | null;
  candidatesProduced: number;
  fieldsExtracted: number;
  fieldsUnknown: number;
  evidenceCoveragePct: number;
  candidatesRequiringReview: number;
  conflicts: number;
  gaps: number;
  cacheHits: number;
  totalLatencyMs: number;
};

export type ResearchRun = {
  id: string;
  agentVersion: number;
  startedAt: string;
  finishedAt: string;
  scope: ResearchScope;
  providers: { search: string; retrieval: string; extraction: string[] };
  steps: ResearchStep[];
  /** Candidates produced/refreshed (pre-gate; the trust gate is applied by the ingestion boundary). */
  candidates: ParseOutput["candidates"];
  /** Per candidate id: the research source it belongs to. */
  sourceOf: Record<string, string>;
  /** Candidate ids whose document disappeared from a fully retrieved listing (NOT cancelled). */
  noLongerListed: string[];
  revisions: { candidateId: string; previousSnapshotId: string; changes: FieldChange[] }[];
  conflicts: Conflict[];
  proposals: ResearchProposal[];
  gaps: ResearchGap[];
  listings: Record<string, { urls: string[]; complete: boolean; links: string[] }>;
  extractionRuns: string[];
  metrics: ResearchMetrics;
  budget: { limits: ResearchBudget; used: Record<string, number>; exhausted: string[] };
};

export type ResearchDeps = {
  retriever: DocumentRetriever;
  extractors: SemanticExtractor[];
  search: SearchProvider;
  store: EvidenceStore;
  authorities: Authority[];
  entrypoints: ResearchEntrypoint[];
  refs: NamedSegmentReference[];
  chainage: ChainageReference | null;
  /** Existing knowledge (other candidates, curated constraints) for conflict detection. */
  knownFacts: Fact[];
  /** Registered structured sources: refresh stale/unknown ones through the deterministic 3B pipeline. */
  registered?: { sourceId: string; authorityId: string; freshness: string }[];
  refreshRegisteredSource?: (sourceId: string) => Promise<{ outcome: string; message?: string }>;
  budget?: ResearchBudget;
  /** Ignore source cadence (explicit refresh). */
  force?: boolean;
  now: Date;
  clock?: () => number;
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Road identifiers as they may appear in text/slugs ("N119" ⇔ "EN119"). */
function roadAliases(roads: string[]): string[] {
  const out = new Set<string>();
  for (const r of roads) {
    const x = r.toLowerCase().replace(/\s+/g, "");
    out.add(x);
    const m = x.match(/^e?n(\d.*)$/);
    if (m) {
      out.add(`n${m[1]}`);
      out.add(`en${m[1]}`);
    }
  }
  return [...out];
}

/**
 * Does a listed title/slug concern the scope? A road identifier is enough; a municipality name
 * only counts when qualified ("concelho de X", "município de X", "Câmara Municipal de X") —
 * "Porto de Abrigo de Sesimbra" is a harbour, not the municipality of Porto.
 */
export function mentions(text: string, aliases: string[], places: string[]): string | null {
  const t = fold(text).replace(/[^a-z0-9]+/g, " ");
  for (const a of aliases) if (new RegExp(`(^| )${a.replace(/-/g, " ")}( |$)`).test(t)) return a.toUpperCase();
  for (const p of places) {
    const name = fold(p).replace(/[^a-z0-9]+/g, " ").trim();
    if (name.length > 3 && new RegExp(`(concelho|municipio|camara municipal) d[aoe]s? ${name}( |$)`).test(t)) return p;
  }
  return null;
}

function listingLinks(html: string, base: string, pattern: RegExp): { url: string; text: string }[] {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let u: URL;
    try {
      u = new URL(m[1]!.replace(/&amp;/g, "&"), base);
    } catch {
      continue;
    }
    if (!pattern.test(u.pathname)) continue;
    const text = m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const prev = out.get(u.href) ?? "";
    if (text.length > prev.length) out.set(u.href, text);
    else if (!out.has(u.href)) out.set(u.href, text);
  }
  return [...out.entries()].map(([url, text]) => ({ url, text }));
}

/** Older revision first within a document series ("…-16" before "…-17"); interpretation of the URL scheme. */
const suffixOf = (url: string) => Number(url.match(/-(\d{1,3})$/)?.[1] ?? 0);

export async function runResearch(scope: ResearchScope, deps: ResearchDeps): Promise<ResearchRun> {
  const clock = deps.clock ?? (() => performance.now());
  const t0 = clock();
  const now = deps.now;
  const at = () => now.toISOString();
  const budget = new BudgetTracker(deps.budget ?? DEFAULT_RESEARCH_BUDGET, deps.clock);
  const steps: ResearchStep[] = [];
  const gaps: ResearchGap[] = [];
  const candidates = new Map<string, ParseOutput["candidates"][number]>();
  const sourceOf: Record<string, string> = {};
  const revisions: ResearchRun["revisions"] = [];
  const proposals: ResearchProposal[] = [];
  const listings: ResearchRun["listings"] = {};
  const extractionRuns: ExtractionRun[] = [];
  const noLongerListed: string[] = [];
  const m: ResearchMetrics = {
    searchQueries: 0, searchResultsConsidered: 0, officialResultsAccepted: 0, secondaryResultsRejected: 0, pagesFetched: 0, retrievalFailures: 0, snapshotsCreated: 0,
    snapshotsUnchanged: 0, structuredParserRuns: 0, semanticExtractionRuns: 0, extractionReused: 0, extractionLatencyMs: 0, tokens: null, costEur: 0, candidatesProduced: 0,
    fieldsExtracted: 0, fieldsUnknown: 0, evidenceCoveragePct: 0, candidatesRequiringReview: 0, conflicts: 0, gaps: 0, cacheHits: 0, totalLatencyMs: 0,
  };
  const step = (state: ResearchState, why: ResearchReason, detail: string, url?: string, entrypointId?: string) => steps.push({ at: at(), state, why, detail, ...(url ? { url } : {}), ...(entrypointId ? { entrypointId } : {}) });
  const gap = (g: ResearchGap) => {
    if (!gaps.some((x) => x.kind === g.kind && x.url === g.url && x.authorityId === g.authorityId && x.detail === g.detail)) gaps.push(g);
  };
  const aliases = roadAliases(scope.roads);
  const places = scope.municipalities.map((x) => x.name);
  const authorityName = (id: string) => deps.authorities.find((a) => a.id === id)?.name ?? id;
  const previousRuns = ((await deps.store.runs()) as ResearchRun[]).filter((r) => r && r.listings).sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  /* 1. Registered structured sources that are stale/unknown/failing → deterministic refresh (no AI). */
  for (const r of deps.registered ?? []) {
    if (!scope.authorityIds.includes(r.authorityId) || !deps.refreshRegisteredSource) continue;
    const g = scope.gaps.find((x) => x.sourceId === r.sourceId && /SOURCE_(STALE|FRESHNESS_UNKNOWN|FETCH_FAILED)/.test(x.kind));
    if (!g) continue;
    const why: ResearchReason = { gap: g.kind, authorityId: r.authorityId, scopeId: scope.id, detail: `fonte estruturada registada ${r.sourceId} (${r.freshness})` };
    if (!budget.take("pagesRetrieved")) {
      gap({ kind: "BUDGET_EXHAUSTED", detail: `atualização de ${r.sourceId} não feita (orçamento de páginas)`, why });
      continue;
    }
    m.structuredParserRuns++;
    const res = await deps.refreshRegisteredSource(r.sourceId).catch((e) => ({ outcome: "FETCH_ERROR", message: String(e) }));
    if (res.outcome === "FETCH_ERROR" || res.outcome === "PARSE_ERROR") {
      m.retrievalFailures++;
      step("SOURCE_FAILED", why, `atualização determinística falhou: ${res.message ?? res.outcome}`);
      gap({ kind: "SOURCE_UNREACHABLE", detail: `${r.sourceId}: ${res.message ?? res.outcome}`, authorityId: r.authorityId, why });
    } else step(res.outcome === "UNCHANGED" ? "UNCHANGED" : "SOURCE_FOUND", why, `fonte estruturada atualizada pelo parser determinístico (${res.outcome})`);
  }

  /* 2. Entry points of in-scope authorities. */
  const processDocument = async (url: string, ep: ResearchEntrypoint, why: ResearchReason): Promise<void> => {
    if (!budget.take("documents") || !budget.take("pagesRetrieved")) {
      gap({ kind: "BUDGET_EXHAUSTED", detail: `documento não obtido (orçamento esgotado)`, url, why });
      step("BUDGET_EXHAUSTED", why, "orçamento esgotado — documento não investigado", url, ep.id);
      return;
    }
    const raw = await deps.retriever.retrieve(url, (deps.budget ?? DEFAULT_RESEARCH_BUDGET).maxRedirects);
    m.pagesFetched++;
    const kept = await preserveRetrieval(raw, { store: deps.store, method: deps.retriever.method, now, why, sourceId: `research:${ep.id}`, authorityId: ep.authorityId });
    if (!kept.snapshot) {
      m.retrievalFailures++;
      step("SOURCE_FAILED", why, `obtenção falhou: ${kept.record.error?.kind} — ${kept.record.error?.message}`, url, ep.id);
      gap({ kind: "SOURCE_UNREACHABLE", detail: `${kept.record.error?.kind}: ${kept.record.error?.message}`, url, authorityId: ep.authorityId, why });
      return;
    }
    if (kept.created) m.snapshotsCreated++;
    else m.snapshotsUnchanged++;
    const resolution = resolveAuthority(kept.record.finalUrl!, deps.authorities);
    if (resolution.status !== "PRIMARY_OFFICIAL" || resolution.authorityId !== ep.authorityId) {
      step("SOURCE_FAILED", why, `documento final fora do domínio verificado da autoridade (${resolution.status})`, url, ep.id);
      gap({ kind: "AUTHORITY_UNRESOLVED", detail: resolution.basis, url, authorityId: ep.authorityId, why });
      return;
    }
    const snap = kept.snapshot;
    if (!snap.text || snap.text.status === "NO_TEXT" || snap.text.status === "UNSUPPORTED") {
      step("SOURCE_FAILED", why, snap.text?.note ?? "sem texto extraível", url, ep.id);
      gap({ kind: "PDF_UNSUPPORTED", detail: snap.text?.note ?? "documento sem texto extraível — não significa ausência de restrições", url, authorityId: ep.authorityId, why });
      return;
    }
    step("SOURCE_FOUND", why, `${kept.record.unchanged ? "documento inalterado" : "documento preservado"} (${snap.id.slice(0, 17)}…, ${snap.byteLength} bytes, ${snap.text.representation})`, url, ep.id);
    await extractDocument(snap, url, ep, why);
  };

  const extractDocument = async (snap: DocumentSnapshot, url: string, ep: ResearchEntrypoint, why: ResearchReason) => {
    for (const ex of deps.extractors) {
      const prior = await deps.store.findExtraction(snap.id, ex.id, ex.version, 1);
      if (!prior && !budget.take("extractionCalls")) {
        gap({ kind: "BUDGET_EXHAUSTED", detail: "extração não feita (orçamento de chamadas)", url, why });
        return;
      }
      const r = await runExtraction(ex, snap, { store: deps.store, now, refDate: new Date(snap.firstSeenAt), clock });
      extractionRuns.push(r.run);
      if (r.reused) {
        m.extractionReused++;
        m.cacheHits++;
      } else {
        m.semanticExtractionRuns++;
        m.extractionLatencyMs += r.run.latencyMs;
        if (r.run.tokens) m.tokens = { input: (m.tokens?.input ?? 0) + r.run.tokens.input, output: (m.tokens?.output ?? 0) + r.run.tokens.output };
        if (r.run.costEur === null) m.costEur = null;
        else if (m.costEur !== null) m.costEur += r.run.costEur ?? 0;
      }
      if (!r.extraction) {
        gap({ kind: r.run.status === "UNAVAILABLE" ? "EXTRACTION_UNAVAILABLE" : "EXTRACTION_FAILED", detail: `${ex.id}: ${r.run.error}`, url, authorityId: ep.authorityId, why });
        continue;
      }
      const x = r.extraction;
      if (!x.documentKind || x.documentKind.value === "NOT_ROAD_INFORMATION" || x.events.length === 0) {
        step("IRRELEVANT", why, "documento sem restrição/condicionamento rodoviário identificável — informativo, nenhum candidato", url, ep.id);
        return;
      }
      const title = snap.text!.pages[0]!.text.split("\n")[0]!.slice(0, 140);
      const sourceId = `research:${ep.id}`;
      const produced = extractionToCandidates({
        extraction: x, extractionRunId: r.run.reusedFrom ?? r.run.id, engine: ex.engine, sourceId, authorityId: ep.authorityId, documentUrl: url, snapshotId: snap.id,
        documentTitle: title, documentText: snap.text!.pages.map((p) => p.text).join("\n\n"), refs: deps.refs, chainage: deps.chainage,
        ...(r.run.model ? { model: r.run.model } : {}),
      });
      for (const c of produced) {
        const prev = (await deps.store.versionsOf(c.id)).at(-1);
        const { created } = await deps.store.addCandidateVersion({ candidateKey: c.id, contentHash: c.contentHash, snapshotId: snap.id, documentUrl: url, createdAt: at(), candidate: c });
        if (created && prev) {
          const changes = diffCandidates(prev.candidate as never, c as never).filter((ch) => ch.change !== "UNCHANGED");
          revisions.push({ candidateId: c.id, previousSnapshotId: prev.snapshotId, changes });
          step("CANDIDATE_REVISED", why, `nova versão (${changes.map((ch) => `${ch.label}: ${ch.old} → ${ch.new}`).join("; ").slice(0, 300)})`, url, ep.id);
        } else step(created ? "NEW_CANDIDATE" : "UNCHANGED", why, `${c.title.slice(0, 160)}`, url, ep.id);
        candidates.set(c.id, c);
        sourceOf[c.id] = sourceId;
        const g = c.research!.geometry;
        if (g.status !== "RESOLVED_REFERENCE") gap({ kind: "GEOMETRY_UNRESOLVED", detail: `${c.title.slice(0, 90)}: ${g.reason}`, url, authorityId: ep.authorityId, why });
        if (c.fields.vehicleApplicability.state === "UNKNOWN") gap({ kind: "VEHICLE_APPLICABILITY_UNKNOWN", detail: `${c.title.slice(0, 90)}: o texto não indica veículos`, url, why });
        if (c.research!.temporal.interpretation?.ambiguities.length) gap({ kind: "TEMPORAL_AMBIGUOUS", detail: `${c.title.slice(0, 90)}: ${c.research!.temporal.interpretation.ambiguities.join("; ")}`, url, why });
      }
      return;
    }
  };

  const freshEnough = async (ep: ResearchEntrypoint): Promise<boolean> => {
    if (deps.force) return false;
    const last = (await deps.store.observationsFor(ep.urls[0]!)).at(-1);
    return !!last && now.getTime() - Date.parse(last.observedAt) < ep.cadence.expectedEveryMin * 60_000;
  };

  for (const ep of deps.entrypoints) {
    const inScope = scope.authorityIds.includes(ep.authorityId) || (ep.jurisdiction.kind === "municipal" && ep.jurisdiction.municipalityCodes.some((c) => scope.municipalities.some((x) => x.code === c)));
    if (!inScope) continue;
    if (ep.underpins && !ep.underpins.some((id) => scope.gaps.some((g) => g.kind === "REVALIDATE" && g.sourceId === id))) continue;
    const why: ResearchReason = {
      gap: ep.underpins ? "REVALIDATE_LEGAL_BASIS" : scope.gaps.find((g) => g.authorityId === ep.authorityId)?.kind ?? "COVERAGE_REFRESH",
      authorityId: ep.authorityId,
      scopeId: scope.id,
      detail: ep.underpins ? `revalidar a base legal de ${ep.underpins.join(", ")}` : `estradas do âmbito: ${scope.roads.slice(0, 8).join(", ")}`,
    };
    if (ep.use.licence === "UNKNOWN") gap({ kind: "LICENCE_UNKNOWN", detail: `${ep.name}: ${ep.use.basis}`, authorityId: ep.authorityId });
    if (await freshEnough(ep)) {
      m.cacheHits++;
      step("SKIPPED_HEALTHY", why, `consultada há menos de ${Math.round(ep.cadence.expectedEveryMin / 60)} h — não repetida`, ep.urls[0], ep.id);
      continue;
    }
    step("RESEARCHING", why, ep.name, ep.urls[0], ep.id);
    if (ep.kind === "DOCUMENT") {
      for (const u of ep.urls) await processDocument(u, ep, why);
      continue;
    }
    // LISTING
    const pattern = new RegExp(ep.linkPattern ?? "^$");
    const links: { url: string; text: string }[] = [];
    let complete = true;
    for (const u of ep.urls) {
      if (!budget.take("pagesRetrieved")) {
        complete = false;
        gap({ kind: "BUDGET_EXHAUSTED", detail: `listagem incompleta (${u})`, url: u, why });
        break;
      }
      const raw = await deps.retriever.retrieve(u, (deps.budget ?? DEFAULT_RESEARCH_BUDGET).maxRedirects);
      m.pagesFetched++;
      const kept = await preserveRetrieval(raw, { store: deps.store, method: deps.retriever.method, now, why, sourceId: `research:${ep.id}`, authorityId: ep.authorityId });
      if (!kept.snapshot) {
        complete = false;
        m.retrievalFailures++;
        step("SOURCE_FAILED", why, `listagem falhou: ${kept.record.error?.message}`, u, ep.id);
        gap({ kind: "SOURCE_UNREACHABLE", detail: `${kept.record.error?.kind}: ${kept.record.error?.message}`, url: u, authorityId: ep.authorityId, why });
        continue;
      }
      if (kept.created) m.snapshotsCreated++;
      else m.snapshotsUnchanged++;
      const html = new TextDecoder().decode(base64ToBytes(kept.snapshot.bytesBase64));
      links.push(...listingLinks(html, kept.record.finalUrl!, pattern));
    }
    listings[ep.id] = { urls: ep.urls, complete, links: links.map((l) => l.url) };
    m.searchResultsConsidered += links.length;
    // Relevant documents: the link text or slug mentions a scope road or municipality.
    const relevant = links
      .map((l) => ({ ...l, hit: mentions(`${l.text} ${l.url.split("/").pop()}`, aliases, places) }))
      .filter((l) => l.hit)
      .sort((a, b) => a.url.localeCompare(b.url) || suffixOf(a.url) - suffixOf(b.url));
    for (const l of relevant) {
      const r = resolveAuthority(l.url, deps.authorities);
      if (r.status !== "PRIMARY_OFFICIAL") {
        m.secondaryResultsRejected++;
        continue;
      }
      m.officialResultsAccepted++;
    }
    step("SOURCE_FOUND", why, `${links.length} avisos listados; ${relevant.length} mencionam o âmbito (${[...new Set(relevant.map((l) => l.hit))].join(", ") || "nenhum"})`, ep.urls[0], ep.id);
    if (!relevant.length) gap({ kind: "NO_OFFICIAL_RESULT_FOUND", detail: `${ep.name}: nenhum aviso listado menciona as estradas/concelhos do âmbito`, authorityId: ep.authorityId, why });
    for (const l of relevant.sort((a, b) => suffixOf(a.url) - suffixOf(b.url))) {
      await processDocument(l.url, ep, { ...why, road: l.hit ?? undefined, detail: `aviso «${l.text.slice(0, 80)}» menciona ${l.hit}` });
    }
    // Disappeared from a COMPLETE listing ⇒ NO_LONGER_LISTED (never "cancelled"). A failed listing proves nothing.
    const prevListing = previousRuns.find((r) => r.listings[ep.id]?.complete)?.listings[ep.id];
    if (complete && prevListing) {
      const gone = prevListing.links.filter((u) => !links.some((l) => l.url === u));
      for (const u of gone) {
        const versions = ((await deps.store.runs()) as ResearchRun[]).flatMap((r) => r.candidates ?? []).filter((c) => c.research?.documentUrl === u);
        for (const id of new Set(versions.map((c) => c.id))) noLongerListed.push(id);
        if (versions.length) step("NO_LONGER_LISTED", why, "o aviso deixou de constar da listagem — NÃO se presume reaberto/cancelado", u, ep.id);
      }
    }
  }

  /* 3. Authorities in scope without a registered source or entry point → web search (if configured). */
  const uncovered = scope.gaps.filter((g) => g.kind === "NO_OPERATIONAL_SOURCE" && g.authorityId && !deps.entrypoints.some((e) => e.authorityId === g.authorityId));
  const unavailable: string[] = [];
  for (const g of uncovered) {
    const name = authorityName(g.authorityId!);
    const why: ResearchReason = { gap: g.kind, authorityId: g.authorityId, scopeId: scope.id, ...(g.municipalityCode ? { municipalityCode: g.municipalityCode } : {}), detail: `${name}: sem fonte operacional registada` };
    if (!budget.take("searchQueries")) {
      gap({ kind: "BUDGET_EXHAUSTED", detail: `pesquisa não feita para ${name} (orçamento de consultas)`, authorityId: g.authorityId, why });
      continue;
    }
    const query = `${name} condicionamento de trânsito corte de estrada`;
    m.searchQueries++;
    let hits: ClassifiedHit[] = [];
    try {
      const raw = await deps.search.search(query);
      m.searchResultsConsidered += raw.length;
      hits = raw.map((h) => classifySearchHit(h, deps.authorities, [name.replace(/^Município de /, ""), ...scope.roads]));
    } catch (e) {
      if (e instanceof SearchUnavailableError) {
        unavailable.push(name);
        continue;
      }
      gap({ kind: "SEARCH_UNAVAILABLE", detail: `${name}: ${e instanceof Error ? e.message : String(e)}`, authorityId: g.authorityId, why });
      continue;
    }
    const primary = hits.filter((h) => h.use === "RETRIEVE_PRIMARY");
    const follow = hits.filter((h) => h.use === "FOLLOW_TO_PRIMARY").flatMap((h) => h.primaryCandidates.map((u) => ({ u, from: h.url })));
    m.officialResultsAccepted += primary.length;
    m.secondaryResultsRejected += hits.filter((h) => h.use === "DISCOVERY_CLUE_ONLY" || h.use === "IGNORE").length;
    for (const h of primary) proposals.push({ id: `rprop-${hashString(h.url)}`, url: h.url, status: "PROPOSED", resolution: h.resolution, query, why, discoveredVia: "search", note: "fonte primária oficial encontrada por pesquisa — só é usada depois de validada" });
    for (const f of follow) proposals.push({ id: `rprop-${hashString(f.u)}`, url: f.u, status: "PROPOSED", resolution: resolveAuthority(f.u, deps.authorities), query, why, discoveredVia: `ligação em ${f.from}`, note: "fonte primária referida por resultado secundário — o secundário não herda autoridade" });
    if (!primary.length && !follow.length) {
      step("NO_OFFICIAL_SOURCE_FOUND", why, `${hits.length} resultados, nenhum oficial verificado`);
      gap({ kind: hits.some((h) => h.use === "DISCOVERY_CLUE_ONLY") ? "SECONDARY_ONLY" : "NO_OFFICIAL_RESULT_FOUND", detail: `${name}: sem resultado oficial verificado`, authorityId: g.authorityId, why });
    }
  }
  if (unavailable.length) {
    gap({ kind: "SEARCH_UNAVAILABLE", detail: `pesquisa web não configurada — ${unavailable.length} autoridade(s) sem fonte registada ficaram por investigar (${unavailable.slice(0, 6).join(", ")}${unavailable.length > 6 ? "…" : ""})` });
    for (const g of uncovered) if (!deps.authorities.find((a) => a.id === g.authorityId)?.domains.length) gap({ kind: "AUTHORITY_UNRESOLVED", detail: `${authorityName(g.authorityId!)}: domínio oficial desconhecido`, authorityId: g.authorityId });
  }

  /* 4. Conflicts with existing knowledge and within this run. */
  const out = [...candidates.values()];
  const facts = [...out.map((c) => factFromCandidate(c as never)), ...deps.knownFacts.filter((f) => !candidates.has(f.id))];
  const conflicts = detectConflicts(facts);
  for (const c of conflicts) {
    for (const id of [c.a.id, c.b.id]) {
      const cand = candidates.get(id);
      if (cand?.research && c.resolution === "REVIEWER_DECIDES") cand.research.conflicts = [...new Set([...(cand.research.conflicts ?? []), c.id])];
    }
    if (c.resolution === "REVIEWER_DECIDES") gap({ kind: "CONFLICT", detail: `${c.kind}: ${c.a.id} ↔ ${c.b.id} — ${c.detail}` });
  }

  /* 5. Metrics. */
  const fieldNames = ["category", "roads", "locationText", "geometry", "validity", "periods", "vehicleApplicability", "direction", "diversion"] as const;
  for (const c of out) {
    for (const f of fieldNames) {
      if (c.fields[f].state === "UNKNOWN") m.fieldsUnknown++;
      else m.fieldsExtracted++;
    }
  }
  const withEvidence = out.reduce((s, c) => s + new Set((c.evidence ?? []).map((e) => e.field)).size, 0);
  const expected = out.reduce((s, c) => s + fieldNames.filter((f) => c.fields[f].state !== "UNKNOWN" && f !== "geometry").length, 0);
  m.evidenceCoveragePct = expected ? Math.min(100, Math.round((withEvidence / expected) * 100)) : 0;
  m.candidatesProduced = out.length;
  m.candidatesRequiringReview = out.filter((c) => ["ROAD_CLOSURE"].includes(c.fields.category.value ?? "") || c.research?.eventKind === "VEHICLE_PROHIBITION").length;
  m.conflicts = conflicts.filter((c) => c.resolution === "REVIEWER_DECIDES").length;
  m.gaps = gaps.length;
  m.totalLatencyMs = Math.round(clock() - t0);

  const run: ResearchRun = {
    id: `research-${hashString(`${scope.id}|${at()}|${Math.random()}`)}`,
    agentVersion: AGENT_VERSION,
    startedAt: at(),
    finishedAt: new Date(now.getTime() + m.totalLatencyMs).toISOString(),
    scope,
    providers: { search: deps.search.id, retrieval: deps.retriever.id, extraction: deps.extractors.map((e) => `${e.id}@${e.version}`) },
    steps,
    candidates: out,
    sourceOf,
    noLongerListed,
    revisions,
    conflicts,
    proposals,
    gaps,
    listings,
    extractionRuns: extractionRuns.map((r) => r.id),
    metrics: m,
    budget: { limits: budget.budget, used: { ...budget.used }, exhausted: [...budget.exhausted] },
  };
  await deps.store.addRun(run);
  return run;
}
