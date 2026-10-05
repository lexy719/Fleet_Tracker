import { curationFor } from "../ingestion/municipalRegistry";
import type { SourceRecord } from "../ingestion/types";
import { hashString } from "../regulations/decisionInputs";
import { cacheKey, cacheStatus, makeEntry, resultId, taskKey } from "./cache";
import { classifyUrl, operationallyEligible, sanitizeSnippet } from "./domainTrust";
import { ProviderUnavailableError, type DiscoveryProvider } from "./providers";
import { topicsFor, vehicleClassOf } from "./scope";
import type {
  Authority,
  CacheStatus,
  DiscoveryCacheEntry,
  DiscoveryGap,
  DiscoveryResult,
  DiscoveryRun,
  DiscoveryScope,
  DiscoveryTask,
  RawDiscoveryHit,
  SourceProposal,
} from "./types";

export type DiscoveryDeps = {
  authorities: Authority[];
  providers: DiscoveryProvider[];
  sources: SourceRecord[];
  cacheGet: (key: string) => Promise<DiscoveryCacheEntry | undefined>;
  cachePut: (e: DiscoveryCacheEntry) => Promise<void>;
  /** Existing proposals (to merge rather than duplicate). */
  proposals: SourceProposal[];
  /** Refresh a registered source through the 3B pipeline if due; false = not due (skipped). */
  refreshSource?: (sourceId: string) => Promise<boolean | void>;
  /** Whether synthetic development fixtures may be treated as official. */
  allowSynthetic: boolean;
  /** Ignore cached answers (explicit invalidation); results are re-cached. */
  forceRefresh?: boolean;
  now: Date;
  clock?: () => number;
};

export function buildTasks(scope: DiscoveryScope, authorities: Authority[]): DiscoveryTask[] {
  const vehicleClass = vehicleClassOf(scope.vehicle);
  const allCodes = scope.municipalities.map((m) => m.code);
  const roads = scope.roads.map((r) => r.ref);
  const tasks: DiscoveryTask[] = [];
  for (const sa of scope.authorities) {
    const a = authorities.find((x) => x.id === sa.authorityId);
    if (!a) continue;
    const perRoad = a.kind === "national_road_manager" || a.kind === "concessionaire" || a.kind === "synthetic_test";
    for (const topic of topicsFor(a.kind, scope.topics)) {
      if (perRoad && roads.length) {
        for (const road of roads) {
          const t = { authorityId: a.id, topic, vehicleClass, road };
          tasks.push({ ...t, key: taskKey(t), roads: [road], municipalityCodes: [] });
        }
      } else {
        const t = { authorityId: a.id, topic, vehicleClass };
        tasks.push({ ...t, key: taskKey(t), roads: a.jurisdiction.kind === "municipal" ? [] : roads, municipalityCodes: a.jurisdiction.kind === "municipal" ? a.jurisdiction.municipalityCodes : allCodes });
      }
    }
  }
  return tasks;
}

const gapId = (...parts: (string | undefined)[]) => `gap-${hashString(parts.join("|"))}`;

export async function runDiscovery(scope: DiscoveryScope, deps: DiscoveryDeps): Promise<DiscoveryRun> {
  const clock = deps.clock ?? (() => performance.now());
  const t0 = clock();
  const { now } = deps;
  const ctx = { scope, authorities: deps.authorities, now };
  const tasks = buildTasks(scope, deps.authorities);

  const cacheDetails: DiscoveryRun["cache"]["details"] = [];
  const providerErrors: DiscoveryRun["providerErrors"] = [];
  const hits: { hit: RawDiscoveryHit; task: DiscoveryTask }[] = [];
  let externalMs = 0;
  let cacheMs = 0;
  let searchUnavailable: string | null = null;

  for (const task of tasks) {
    for (const p of deps.providers) {
      if (!p.handles(task, ctx)) continue;
      const key = cacheKey(p.id, task);
      const tc = clock();
      const entry = await deps.cacheGet(key).catch(() => undefined);
      const status: CacheStatus = deps.forceRefresh && entry ? "STALE" : cacheStatus(entry, now);
      cacheMs += clock() - tc;
      cacheDetails.push({ key, providerId: p.id, status });
      if (status === "HIT" && entry) {
        entry.hits.forEach((hit) => hits.push({ hit, task }));
        continue;
      }
      if (status === "ERROR" && entry) {
        // Recent failure: don't hammer the provider; report it.
        if (entry.error && /fornecedor de pesquisa/.test(entry.error)) searchUnavailable = entry.error;
        else providerErrors.push({ providerId: p.id, message: entry.error ?? "erro" });
        continue;
      }
      const te = clock();
      try {
        const found = await p.discover(task, ctx);
        externalMs += clock() - te;
        await deps.cachePut(makeEntry(p.id, task, now, { ok: true, hits: found })).catch(() => undefined);
        found.forEach((hit) => hits.push({ hit, task }));
      } catch (e) {
        externalMs += clock() - te;
        const message = e instanceof Error ? e.message : String(e);
        await deps.cachePut(makeEntry(p.id, task, now, { ok: false, error: message })).catch(() => undefined);
        if (e instanceof ProviderUnavailableError) searchUnavailable = message;
        else providerErrors.push({ providerId: p.id, message });
      }
    }
  }

  /* ─── Classify + de-duplicate (hits are hostile input) ─── */
  const tcl = clock();
  const results = new Map<string, DiscoveryResult>();
  const proposals = new Map(deps.proposals.map((p) => [p.url, structuredClone(p)]));
  const refreshed: string[] = [];
  const attempted = new Set<string>();

  const upsert = (r: DiscoveryResult) => {
    const ex = results.get(r.url);
    if (!ex) return void results.set(r.url, r);
    ex.methods = [...new Set([...ex.methods, ...r.methods])];
    ex.relevance = {
      municipalityCodes: [...new Set([...ex.relevance.municipalityCodes, ...r.relevance.municipalityCodes])],
      roads: [...new Set([...ex.relevance.roads, ...r.relevance.roads])],
      topics: [...new Set([...ex.relevance.topics, ...r.relevance.topics])],
    };
    // A structured/official reading wins over a weaker one for the same URL.
    const rank = { registered_source: 0, candidate_source: 1, document_pending_extraction: 2, hint: 3, non_authoritative: 4 } as const;
    if (rank[r.kind] < rank[ex.kind]) Object.assign(ex, { kind: r.kind, proposalId: r.proposalId, registeredSourceId: r.registeredSourceId, sourceType: r.sourceType ?? ex.sourceType });
  };

  for (const { hit, task } of hits) {
    const trust = classifyUrl(hit.url, deps.authorities);
    const eligible = operationallyEligible(trust, deps.allowSynthetic);
    const base = {
      id: resultId(hit.url),
      url: hit.url,
      domain: trust.domain,
      title: sanitizeSnippet(hit.title, 160),
      snippet: sanitizeSnippet(hit.snippet),
      methods: [hit.method],
      discoveredAt: now.toISOString(),
      relevance: { municipalityCodes: hit.municipalityCodes, roads: hit.roads, topics: hit.topics },
      trust,
      operationalEligible: eligible,
      ...(hit.sourceType ? { sourceType: hit.sourceType } : {}),
      ...(hit.publishedAt ? { freshness: { publishedAt: hit.publishedAt } } : {}),
    };
    const authorityId = trust.authorityId ?? task.authorityId;

    if (hit.registeredSourceId) {
      const src = deps.sources.find((s) => s.id === hit.registeredSourceId);
      const st = scope.registeredSources.find((s) => s.sourceId === hit.registeredSourceId);
      // Trust of a registered source comes from the registry (validated there), not from its landing-page host.
      const regTrust = src
        ? {
            url: hit.url,
            domain: trust.domain,
            trust: src.synthetic ? ("OFFICIAL_SYNTHETIC_TEST" as const) : ("OFFICIAL_VERIFIED" as const),
            authorityId: task.authorityId,
            basis: `fonte registada no registo FleetOS (${src.authority}; nível ${src.trustTier})`,
          }
        : trust;
      upsert({
        ...base,
        trust: regTrust,
        kind: "registered_source",
        authorityId: task.authorityId,
        registeredSourceId: hit.registeredSourceId,
        operationalEligible: !!src && (!src.synthetic || deps.allowSynthetic),
        freshness: { state: st?.freshness },
      });
      if (deps.refreshSource && src && st && st.freshness !== "FRESH" && !attempted.has(src.id)) {
        attempted.add(src.id);
        const te = clock();
        const did = await deps.refreshSource(src.id).catch((e) => {
          providerErrors.push({ providerId: `refresh:${src.id}`, message: String(e) });
          return false;
        });
        if (did !== false) refreshed.push(src.id);
        externalMs += clock() - te;
      }
      continue;
    }
    if (!eligible) {
      upsert({ ...base, kind: "non_authoritative", note: `Não é evidência operacional (${trust.trust}).` });
      if (hit.pointsTo) {
        const t2 = classifyUrl(hit.pointsTo, deps.authorities);
        if (operationallyEligible(t2, deps.allowSynthetic)) {
          upsert({
            ...base,
            id: resultId(hit.pointsTo),
            url: hit.pointsTo,
            domain: t2.domain,
            trust: t2,
            operationalEligible: true,
            methods: ["official_page_link"],
            kind: "hint",
            authorityId: t2.authorityId ?? task.authorityId,
            note: `Ligação oficial encontrada a partir de ${trust.domain} (não oficial). O conteúdo oficial tem de ser obtido e extraído.`,
          });
        }
      }
      continue;
    }
    if (hit.structured) {
      const id = `prop-${hashString(hit.url)}`;
      const ex = proposals.get(hit.url);
      const authority = deps.authorities.find((a) => a.id === authorityId);
      const via = { method: hit.method, at: now.toISOString() };
      if (ex) {
        if (!ex.discoveredVia.some((v) => v.method === via.method)) ex.discoveredVia.push(via);
      } else {
        proposals.set(hit.url, {
          id,
          status: "PROPOSED",
          authorityId,
          authorityName: authority?.name ?? authorityId,
          url: hit.url,
          domain: trust.domain,
          trust,
          sourceType: hit.sourceType ?? "HTML_NOTICE",
          parser: hit.structured.parser,
          fetchPath: hit.structured.fetchPath,
          geographicScope: { municipalityCodes: hit.municipalityCodes, roads: hit.roads },
          topics: hit.topics,
          ...(hit.structured.expectedCadenceMin ? { expectedCadenceMin: hit.structured.expectedCadenceMin } : {}),
          ...(hit.structured.license ? { license: hit.structured.license } : {}),
          discoveredVia: [via],
          synthetic: trust.trust === "OFFICIAL_SYNTHETIC_TEST",
          ...(!hit.structured.fetchPath.startsWith("/") ? { ingestBlocker: "só fontes acessíveis pela própria origem (proxy/fixture) podem ser ingeridas neste ambiente" } : {}),
        });
      }
      const prop = proposals.get(hit.url)!;
      upsert({ ...base, kind: "candidate_source", authorityId, proposalId: prop.id, note: `Proposta de fonte ${prop.status}.` });
      continue;
    }
    upsert({ ...base, kind: "document_pending_extraction", authorityId, note: "Documento oficial em texto — requer extração (IA não configurada)." });
  }
  const classifyMs = clock() - tcl;

  /* ─── Gaps ─── */
  const gaps = new Map<string, DiscoveryGap>();
  const gap = (g: Omit<DiscoveryGap, "id">) => {
    const id = gapId(g.kind, g.authorityId, g.road, g.sourceId, g.municipalityCode);
    if (!gaps.has(id)) gaps.set(id, { id, ...g });
  };
  const nameOf = (id: string) => scope.authorities.find((a) => a.authorityId === id)?.name ?? id;
  for (const id of scope.uncoveredAuthorityIds) {
    const approved = [...proposals.values()].some((p) => p.authorityId === id && p.status === "APPROVED");
    if (approved) continue;
    gap({ kind: "NO_OPERATIONAL_SOURCE", authorityId: id, authorityName: nameOf(id), need: "eventos temporários e cortes", reason: "nenhuma fonte operacional registada para esta autoridade" });
    const a = deps.authorities.find((x) => x.id === id);
    if (a && a.domains.length === 0) gap({ kind: "OFFICIAL_DOMAIN_UNKNOWN", authorityId: id, authorityName: nameOf(id), need: "domínio oficial verificado", reason: "domínio oficial desconhecido — não é inferido pelo nome" });
  }
  for (const m of scope.municipalities) {
    for (const k of curationFor(m.code).knownNotEncoded) {
      gap({ kind: "LEGAL_RULE_NOT_ENCODED", municipalityCode: m.code, authorityName: `Município de ${m.name}`, need: k.label, reason: `regra conhecida (${k.source}) ainda não codificada` });
    }
  }
  for (const s of scope.registeredSources) {
    if (s.freshness === "STALE") gap({ kind: "SOURCE_STALE", sourceId: s.sourceId, authorityId: s.authorityId, authorityName: nameOf(s.authorityId), need: `dados atuais de ${s.name}`, reason: "fonte registada desatualizada" });
    if (s.freshness === "FETCH_ERROR") gap({ kind: "SOURCE_FETCH_FAILED", sourceId: s.sourceId, authorityId: s.authorityId, authorityName: nameOf(s.authorityId), need: `dados de ${s.name}`, reason: "última consulta falhou" });
    if (s.freshness === "UNKNOWN") gap({ kind: "SOURCE_FRESHNESS_UNKNOWN", sourceId: s.sourceId, authorityId: s.authorityId, authorityName: nameOf(s.authorityId), need: `data de publicação de ${s.name}`, reason: "a fonte não declara data, ou ainda não foi consultada" });
  }
  const motorways = scope.roads.filter((r) => r.roadClass === "motorway").map((r) => r.ref);
  if (motorways.length) {
    gap({ kind: "CONCESSION_DATA_UNAVAILABLE", road: motorways.join(", "), need: "eventos e restrições das concessionárias", reason: "sem fonte pública licenciada de eventos de concessões" });
  }
  const undetermined = scope.roads.filter((r) => r.manager.status === "undetermined" && r.roadClass !== "european").map((r) => r.ref);
  if (undetermined.length) gap({ kind: "ROAD_MANAGER_UNDETERMINED", road: undetermined.join(", "), need: "gestor de cada troço", reason: "o número da via não determina o gestor (IP, concessão ou subconcessão)" });
  if (scope.vehicle.missing.length) gap({ kind: "VEHICLE_FACT_MISSING", need: scope.vehicle.missing.join(", "), reason: "factos do veículo não registados — restrições que deles dependam ficam INCERTAS" });
  for (const r of results.values()) {
    if (r.kind === "document_pending_extraction" || r.kind === "hint") {
      gap({ kind: "EXTRACTION_UNAVAILABLE", authorityId: r.authorityId, authorityName: r.authorityId ? nameOf(r.authorityId) : undefined, sourceId: r.url, need: `conteúdo de ${r.title}`, reason: "documento oficial em texto — extração por IA não configurada; nada foi inventado" });
    }
  }
  for (const p of proposals.values()) {
    if (p.status === "PROPOSED" && results.has(p.url)) gap({ kind: "SOURCE_PENDING_VALIDATION", authorityId: p.authorityId, authorityName: p.authorityName, sourceId: p.url, need: "validação da fonte proposta", reason: "fonte descoberta — não é usada até ser validada" });
  }
  if (scope.outsideSamples > 0) {
    gap({
      kind: "OUTSIDE_COVERED_TERRITORY",
      need: `restrições e eventos em ~${Math.round(scope.outsideSamples * 0.5)} km fora do território suportado pelos registos carregados`,
      reason: "a rota sai do território coberto (CAOP Continente) — FleetOS não tem fontes nem regras fora de Portugal",
    });
  }
  if (searchUnavailable) gap({ kind: "SEARCH_UNAVAILABLE", need: "descoberta de fontes/avisos para autoridades sem fonte registada", reason: searchUnavailable });
  for (const e of providerErrors) gap({ kind: "PROVIDER_ERROR", sourceId: e.providerId, need: "resultado do fornecedor", reason: e.message });

  const count = (s: CacheStatus) => cacheDetails.filter((d) => d.status === s).length;
  const t1 = clock();
  return {
    id: `run-${hashString(`${scope.id}|${now.toISOString()}`)}`,
    startedAt: now.toISOString(),
    finishedAt: new Date(now.getTime() + (t1 - t0)).toISOString(),
    scope,
    results: [...results.values()],
    gaps: [...gaps.values()],
    proposals: [...proposals.values()].filter((p) => results.has(p.url) || deps.proposals.some((x) => x.id === p.id)),
    cache: { hit: count("HIT"), miss: count("MISS"), stale: count("STALE"), error: count("ERROR"), details: cacheDetails },
    refreshedSourceIds: refreshed,
    providerErrors,
    timings: { scopeMs: 0, cacheMs, classifyMs, totalMs: t1 - t0, externalMs },
  };
}
