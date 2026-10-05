import { describe, expect, it } from "vitest";
import ipArcgisCondicionamentos from "../../ingestion/__fixtures__/ipArcgisCondicionamentos.json";
import cv from "../../regulations/__fixtures__/routeMatrix/coimbra__viseu__fastest.json";
import { allAuthorities } from "../../discovery/authorities";
import { assessFreshness } from "../../ingestion/freshness";
import { buildIngestedConstraints, runSource, type FetchImpl } from "../../ingestion/pipeline";
import { applyResearchRun, researchSourceRecord } from "../../ingestion/researchIngest";
import { approveCandidate } from "../../ingestion/review";
import { getSource } from "../../ingestion/sources";
import { MemoryIngestionStore } from "../../ingestion/store";
import { parseDatex2 } from "../../ingestion/parsers/datex2";
import { evaluateCompliance } from "../../regulations/evaluate";
import { availableRoadEvents, buildRegulationDataset, REGULATION_DATASET } from "../../regulations/repository";
import { DEFAULT_TIMING_MODEL, routeTimingInput } from "../../regulations/timeline";
import type { GeometryRecord } from "../../regulations/types";
import { runResearch, type ResearchDeps, type ResearchScope } from "../agent";
import { structuredFieldEvidence } from "../candidates";
import { factFromCandidate, factFromRegulation } from "../conflicts";
import { legalBasisEntrypoints, RESEARCH_ENTRYPOINTS } from "../entrypoints";
import { EvidenceStore } from "../evidence";
import { rulesExtractor } from "../extractors";
import { assessResearchFreshness } from "../freshness";
import type { NamedSegmentReference } from "../geometryResolution";
import { recordedRetriever, type RecordedDocument } from "../retrieval";
import { NO_SEARCH } from "../search";
import { spanVerifies } from "../semantic/textView";
import { allRealDocuments, entry, MANIFEST, realBytes, realDocument } from "./realFixtures";

/*
 * Phase 4 acceptance on REAL official documents (recorded, unedited; replayed offline).
 * Cases A–F of the specification, route-driven research and the route proof.
 */

const NOW = new Date("2026-10-01T10:00:00Z");
const IP_NAME = "Infraestruturas de Portugal, S.A.";
const IP_SOURCE = researchSourceRecord(RESEARCH_ENTRYPOINTS[0]!, IP_NAME);
const CURATED_GEOMS: GeometryRecord[] = [...REGULATION_DATASET.geometries, ...availableRoadEvents().flatMap((e) => e.geometries)].filter((g) => g.status === "RESOLVED");
const CURATED_REGS = [...REGULATION_DATASET.regulations, ...availableRoadEvents().flatMap((e) => e.constraints)];
const REFS: NamedSegmentReference[] = CURATED_GEOMS.flatMap((g) => {
  const m = g.label.match(/^(\S+) — Nó de .+ ↔ Nó de .+$/);
  return m ? [{ road: m[1]!, label: g.label, geometryId: g.id, dataset: "curated" }] : [];
});
const IP3_SCOPE: ResearchScope = {
  id: "scope-coimbra-viseu",
  roads: cv.roads,
  municipalities: [{ code: "0613", name: "Penacova" }, { code: "0611", name: "Mortágua" }],
  authorityIds: ["ip", "municipio:0613"],
  gaps: [{ kind: "NO_OPERATIONAL_SOURCE", authorityId: "municipio:0613" }],
};
const authorities = allAuthorities([{ code: "0613", name: "Penacova" }], false);

function deps(store: EvidenceStore, docs: RecordedDocument[] = allRealDocuments(), extra: Partial<ResearchDeps> = {}): ResearchDeps {
  return {
    retriever: recordedRetriever(docs),
    extractors: [rulesExtractor],
    search: NO_SEARCH,
    store,
    authorities,
    entrypoints: RESEARCH_ENTRYPOINTS,
    refs: REFS,
    chainage: null,
    knownFacts: CURATED_REGS.map((r) => factFromRegulation(r, CURATED_GEOMS)),
    now: NOW,
    ...extra,
  };
}

describe("real fixtures are real and unedited", () => {
  it("every recorded document matches the SHA-256 recorded at retrieval", async () => {
    for (const m of MANIFEST) {
      const buf = await globalThis.crypto.subtle.digest("SHA-256", realBytes(m.name).slice());
      expect([...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")).toBe(m.sha256);
      expect(m.httpStatus).toBe(200);
    }
  });
});

describe("Case A — structured official source (IP ArcGIS, deterministic parser)", () => {
  it("real retrieval → parser → snapshot → candidates with AUTHORITY_SUPPLIED field evidence → deterministic trust result", async () => {
    const store = new MemoryIngestionStore();
    const src = getSource("ip-arcgis-condicionamentos")!;
    const fetch: FetchImpl = async () => new Response(JSON.stringify(ipArcgisCondicionamentos), { status: 200, headers: { "content-type": "application/json" } });
    const r = await runSource(src, { store, fetch, now: new Date("2026-09-30T18:00:00Z") });
    expect(r.outcome).toBe("CHANGED");
    const cands = await store.getAllCandidates();
    expect(cands.length).toBeGreaterThan(5);
    const snaps = await store.listSnapshots(src.id);
    expect(snaps[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    const ev = structuredFieldEvidence(cands[0]!);
    expect(ev.length).toBeGreaterThan(2);
    expect(ev.every((e) => (e.provenance === "AUTHORITY_SUPPLIED" || e.provenance === "DETERMINISTIC") && e.evidence[0]!.location.path)).toBe(true);
    // No LLM ran: every candidate came from the deterministic parser.
    expect(cands.every((c) => c.extraction.kind === "parser")).toBe(true);
    expect(new Set(cands.map((c) => c.gate.decision)).size).toBeGreaterThan(0);
  });
});

describe("Case B — official prose (IP notice), deterministic Portuguese extraction", () => {
  it("IP3 vegetation notice → 2 direction-specific candidates, every evidence span verifies against the preserved snapshot", async () => {
    const store = new EvidenceStore(new MemoryIngestionStore());
    const run = await runResearch(IP3_SCOPE, deps(store));
    const veg = run.candidates.filter((c) => c.research!.documentUrl.endsWith("ip3-trabalhos-de-gestao-da-vegetacao"));
    expect(veg.map((c) => c.fields.direction.value)).toEqual(["sentido Coimbra", "sentido Viseu"]);
    for (const c of veg) {
      expect(c.research!.eventKind).toBe("CARRIAGEWAY_CLOSURE");
      expect(c.extraction).toMatchObject({ kind: "semantic", engine: "RULES" });
      expect(c.fields.vehicleApplicability.state).toBe("INTERPRETED"); // "o trânsito será desviado" — not "todo o trânsito" verbatim
      expect(c.research!.temporal.interpretation!.ambiguities.join()).toMatch(/horário não indicado/);
      const snap = (await store.getSnapshot(c.snapshotId))!;
      for (const e of c.evidence!) for (const s of e.evidence) expect(spanVerifies(snap.text!, s)).toBe(true);
    }
    expect(veg[1]!.fields.periods.value).toEqual([{ start: "2026-10-01T00:00", end: "2026-10-02T00:00" }]);
  });

  it("through the EXISTING trust gate: machine-extracted closures are REVIEW_REQUIRED — never ACTIVE, whatever the certainty", async () => {
    const ev = new EvidenceStore(new MemoryIngestionStore());
    const run = await runResearch(IP3_SCOPE, deps(ev));
    const store = new MemoryIngestionStore();
    await applyResearchRun(store, run, [IP_SOURCE], NOW);
    const cands = await store.getCandidates(IP_SOURCE.id);
    expect(cands.length).toBe(run.candidates.length);
    expect(cands.some((c) => c.gate.decision === "ACTIVE" || c.gate.decision === "ACTIVE_SCREENING_ONLY")).toBe(false);
    const closures = cands.filter((c) => c.fields.category.value === "ROAD_CLOSURE");
    for (const c of closures) {
      const ended = c.fields.validity.value?.end && Date.parse(c.fields.validity.value.end) <= NOW.getTime();
      // Current/future closures await a human; nights already past are informational (validity ended).
      expect(c.gate.decision).toBe(ended ? "INFORMATIONAL" : "REVIEW_REQUIRED");
      if (!ended) expect(c.gate.reasons.join()).toMatch(/MACHINE_EXTRACTED/);
    }
    expect(closures.some((c) => c.gate.decision === "REVIEW_REQUIRED")).toBe(true);
    const ing = buildIngestedConstraints(cands, [IP_SOURCE], { [IP_SOURCE.id]: assessFreshness(IP_SOURCE, (await store.getSourceStates())[0], NOW) }, NOW);
    expect(ing.constraints).toEqual([]); // nothing reaches the evaluator without review
  });
});

describe("Case C — official PDF (DL 155-A/2026, Diário da República)", () => {
  const eps = legalBasisEntrypoints(CURATED_REGS, (u) => (u.includes("diariodarepublica.pt") ? "incm-dr" : undefined));
  it("legal-basis entry point is DERIVED from the curated VCI evidence (not hand-listed)", () => {
    const ep = eps.find((e) => e.urls[0] === entry("dr-dl-155-a-2026.pdf").requestedUrl)!;
    expect(ep.underpins).toContain("pt-dl155a2026-vci-pesados");
  });
  it("PDF → page-level evidence → VEHICLE_PROHIBITION candidate (REVIEW_REQUIRED), vehicle classes NOT collapsed", async () => {
    const store = new EvidenceStore(new MemoryIngestionStore());
    const run = await runResearch(
      { id: "s-vci", roads: ["VCI"], municipalities: [], authorityIds: ["incm-dr"], gaps: [{ kind: "REVALIDATE", sourceId: "pt-dl155a2026-vci-pesados" }] },
      deps(store, allRealDocuments(), { entrypoints: eps }),
    );
    const c = run.candidates[0]!;
    expect(c.research!.eventKind).toBe("VEHICLE_PROHIBITION");
    expect(c.fields.roads.value).toEqual(["VCI"]);
    expect(c.research!.vehicles!.scope).toBe("GOODS_HGV"); // "pesados de mercadorias", not generic "pesados"
    expect(c.research!.vehicles!.conditions.map((x) => x.condition)).toEqual([
      { kind: "gross_weight_over_kg", kg: 3500 },
      { kind: "axles_at_least", n: 3 },
      { kind: "first_axle_height_at_least_m", m: 1.1 },
      { kind: "goods_transport" },
    ]);
    expect(c.research!.temporal.spec).toEqual({ kind: "weekly", days: "WORKDAYS", window: { start: "07:00", end: "21:00" }, inForceFrom: "2026-09-15" });
    expect(c.fields.periods.state).toBe("UNKNOWN"); // a permanent weekly rule is NOT flattened into dates
    const pages = c.evidence!.flatMap((e) => e.evidence.map((s) => s.location.page));
    expect(pages).toContain(2);
    const snap = (await store.getSnapshot(c.snapshotId))!;
    expect(snap.contentType).toMatch(/pdf/);
    for (const e of c.evidence!) for (const s of e.evidence) expect(spanVerifies(snap.text!, s)).toBe(true);
    const store2 = new MemoryIngestionStore();
    const src = researchSourceRecord(eps[0]!, "Diário da República (INCM)");
    await applyResearchRun(store2, { ...run, sourceOf: Object.fromEntries(run.candidates.map((x) => [x.id, src.id])) }, [src], NOW);
    expect((await store2.getCandidates(src.id))[0]!.gate.decision).toBe("REVIEW_REQUIRED");
  });
});

describe("Case D — road-related result with no restriction", () => {
  it("IC2 lane suppression / EN119 alternating traffic → INFORMATIONAL, daily windows kept separate", async () => {
    const store = new EvidenceStore(new MemoryIngestionStore());
    const run = await runResearch({ ...IP3_SCOPE, roads: ["IC2", "N119"], municipalities: [] }, deps(store));
    const ic2 = run.candidates.find((c) => c.fields.roads.value?.includes("IC2"))!;
    const en119 = run.candidates.find((c) => c.fields.roads.value?.includes("EN119"))!;
    expect(ic2.research!.eventKind).toBe("LANE_RESTRICTION");
    expect(en119.research!.eventKind).toBe("ALTERNATING_TRAFFIC");
    expect(en119.fields.periods.value).toHaveLength(19); // 5–23 Oct, 08:00–18:00 each day — not one continuous block
    const s = new MemoryIngestionStore();
    await applyResearchRun(s, run, [IP_SOURCE], NOW);
    for (const c of await s.getCandidates(IP_SOURCE.id)) if (c.research?.eventKind !== "ROAD_CLOSURE") expect(c.gate.decision).toBe("INFORMATIONAL");
  });
});

describe("Case E — stale source: retrieval succeeds, publication is old", () => {
  it("Porto 'não programados' (real): fetched today, published 2026-09-04 ⇒ STALE; zero records is NOT 'no restrictions'", () => {
    const body = new TextDecoder().decode(realBytes("porto-datex-nao-programados.xml"));
    const parsed = parseDatex2({ id: "s", sourceId: "porto-datex-nao-programados", fetchedAt: NOW.toISOString(), httpStatus: 200, contentType: "application/xml", byteLength: body.length, sha256: "x", body });
    expect(parsed.candidates).toHaveLength(0);
    const f = assessResearchFreshness({
      retrievals: [{ id: "r", requestedUrl: "u", redirects: [], retrievedAt: NOW.toISOString(), headers: {}, method: "recorded", retrieverVersion: 1, latencyMs: 0, why: { gap: "SOURCE_STALE", detail: "" } }],
      cadence: { expectedEveryMin: 60, agingAfterMin: 24 * 60, staleAfterMin: 3 * 24 * 60 },
      inDocumentPublishedAt: parsed.publishedAt,
      now: NOW,
    });
    expect(f.retrievalHealth.state).toBe("OK");
    expect(f.publication.state).toBe("STALE");
    expect(f.eventValidity).toBe("UNKNOWN");
    const src = getSource("porto-datex-nao-programados")!;
    expect(assessFreshness(src, { sourceId: src.id, unchangedFetches: 0, lastAttemptAt: NOW.toISOString(), lastSuccessAt: NOW.toISOString(), publishedAt: parsed.publishedAt }, NOW).state).toBe("STALE");
  });
  it("IP notice pages declare no publication date ⇒ publication UNKNOWN (never 'fresh' because fetched now)", () => {
    const f = assessResearchFreshness({ retrievals: [], cadence: RESEARCH_ENTRYPOINTS[0]!.cadence, now: NOW });
    expect(f.publication.state).toBe("UNKNOWN");
    expect(f.retrievalHealth.state).toBe("NEVER");
  });
});

describe("Case F — the same source changes: new snapshot, new version, diff, history preserved", () => {
  // Replay of two REAL IP3 notice revisions (-16 then -17) served at ONE URL, to exercise
  // same-URL revision handling with real wording (the live site published them as -16/-17).
  const URL_ = "https://servicos.infraestruturasdeportugal.pt/pt-pt/alertas/rodovia/ip3-coimbraviseu-troco-santa-comba-daoviseu-duplicacaorequalificacao-17";
  const ep = { ...RESEARCH_ENTRYPOINTS[0]!, id: "rev-test", kind: "DOCUMENT" as const, urls: [URL_] };
  it("v1 → v2: two snapshots kept, candidate versions chained, OLD → NEW diff at field level; re-observing v2 adds only an observation", async () => {
    const store = new EvidenceStore(new MemoryIngestionStore());
    const scope = { ...IP3_SCOPE, gaps: [] };
    const r1 = await runResearch(scope, deps(store, [realDocument("ip-ip3-duplicacao-16.html", URL_)], { entrypoints: [ep], force: true }));
    const r2 = await runResearch(scope, deps(store, [realDocument("ip-ip3-duplicacao-17.html", URL_)], { entrypoints: [ep], force: true }));
    expect(r1.candidates).toHaveLength(3);
    expect(r2.revisions.length).toBe(3);
    const canas1 = r2.revisions.find((x) => x.changes.some((c) => c.field === "periods" && c.old.startsWith("22/09")))!;
    expect(canas1.changes.find((c) => c.field === "periods")).toMatchObject({ old: "22/09 21:00–23/09 05:00", new: "29/09 21:00–30/09 05:00", change: "CHANGED" });
    const obs = await store.observationsFor(URL_);
    expect(obs.map((o) => o.unchanged)).toEqual([false, false]);
    expect(new Set(obs.map((o) => o.snapshotId)).size).toBe(2);
    const v1 = (await store.getSnapshot(obs[0]!.snapshotId))!;
    expect(v1.text!.pages[0]!.text).toMatch(/22 de setembro/); // the old evidence is intact, not rewritten
    const versions = await store.versionsOf(r2.candidates[1]!.id);
    expect(versions.length).toBe(2);
    expect(versions[1]!.previous).toBe(versions[0]!.id);
    // Same bytes again: no new snapshot, no new extraction call (reused), one more observation.
    const r3 = await runResearch(scope, deps(store, [realDocument("ip-ip3-duplicacao-17.html", URL_)], { entrypoints: [ep], force: true }));
    expect(r3.metrics.snapshotsCreated).toBe(0);
    expect(r3.metrics.extractionReused).toBe(1);
    expect(r3.metrics.semanticExtractionRuns).toBe(0);
    expect((await store.observationsFor(URL_)).at(-1)!.unchanged).toBe(true);
  });
});

describe("route-driven research", () => {
  it("only documents relevant to the route scope are retrieved (IP3 route ⇒ IP3 notices, not EN378/EN119)", async () => {
    const store = new EvidenceStore(new MemoryIngestionStore());
    const d = deps(store);
    const run = await runResearch(IP3_SCOPE, d);
    const fetched = (d.retriever as ReturnType<typeof recordedRetriever>).calls;
    expect(fetched.some((u) => u.includes("ip3-trabalhos-de-gestao-da-vegetacao"))).toBe(true);
    expect(fetched.some((u) => u.includes("en378") || u.includes("en119"))).toBe(false);
    expect(run.steps.every((s) => s.why.detail.length > 0)).toBe(true);
    expect(run.gaps.map((g) => g.kind)).toEqual(expect.arrayContaining(["SEARCH_UNAVAILABLE", "LICENCE_UNKNOWN", "GEOMETRY_UNRESOLVED"]));
  });
  it("healthy sources are not re-researched within their cadence (cache) unless forced", async () => {
    const store = new EvidenceStore(new MemoryIngestionStore());
    await runResearch(IP3_SCOPE, deps(store));
    const d2 = deps(store, allRealDocuments(), { now: new Date(NOW.getTime() + 3_600_000) });
    const r2 = await runResearch(IP3_SCOPE, d2);
    expect(r2.steps.some((s) => s.state === "SKIPPED_HEALTHY")).toBe(true);
    expect((d2.retriever as ReturnType<typeof recordedRetriever>).calls).toEqual([]);
  });
  it("a notice that disappears from a COMPLETE listing is NO_LONGER_LISTED (not cancelled); a failed listing proves nothing", async () => {
    const store = new EvidenceStore(new MemoryIngestionStore());
    await runResearch(IP3_SCOPE, deps(store, allRealDocuments(), { force: true }));
    // Replay: page 0 now serves the (real) bytes of page 1 → the vegetation notice is no longer listed.
    const swapped = allRealDocuments().map((d) => (d.url.endsWith("/alertas-ips") ? realDocument("ip-alertas-ips-p1.html", d.url) : d));
    const r2 = await runResearch(IP3_SCOPE, deps(store, swapped, { force: true }));
    expect(r2.noLongerListed.some((id) => id.includes("vegetacao"))).toBe(true);
    const failing = allRealDocuments().map((d) => (d.url.endsWith("/alertas-ips") ? { url: d.url, error: { kind: "HTTP_ERROR" as const, message: "HTTP 500" }, status: 500 } : d));
    const r3 = await runResearch(IP3_SCOPE, deps(store, failing, { force: true }));
    expect(r3.noLongerListed).toEqual([]);
    expect(r3.listings["ip-alertas-rodovia"]!.complete).toBe(false);
  });
});

describe("ROUTE PROOF — real notice → candidate → human review → knowledge version → evaluator", () => {
  it("only a human approval changes the dataset; the real Coimbra→Viseu route is then affected on the closure night", async () => {
    const t0 = new Date("2026-09-30T12:00:00Z");
    const ev = new EvidenceStore(new MemoryIngestionStore());
    const run = await runResearch({ ...IP3_SCOPE }, deps(ev, allRealDocuments(), { now: t0 }));
    const store = new MemoryIngestionStore();
    await applyResearchRun(store, run, [IP_SOURCE], t0);
    const cands = await store.getCandidates(IP_SOURCE.id);
    const fr = { [IP_SOURCE.id]: assessFreshness(IP_SOURCE, (await store.getSourceStates())[0], t0) };
    const before = buildRegulationDataset([], buildIngestedConstraints(cands, [IP_SOURCE], fr, t0));
    expect(before.version).toBe(REGULATION_DATASET.version); // research alone changes nothing

    const canas = cands.find((c) => c.fields.locationText.value === "Canas de Santa Maria ↔ São Miguel de Outeiro" && c.fields.periods.value?.[0]?.start === "2026-09-30T21:00")!;
    expect(canas.research!.geometry).toMatchObject({ status: "INTERPRETED_CANDIDATE", geometryIds: ["ip3-troco-canas-sao-miguel-outeiro"] });
    // Agrees with the curated knowledge (same nights, same segment): not a conflict.
    const curated = CURATED_REGS.find((r) => r.location.geometryId === "ip3-troco-canas-sao-miguel-outeiro")!;
    expect(factFromCandidate(canas).roads).toContain("IP3");
    expect(run.conflicts.find((c) => [c.a.id, c.b.id].includes(canas.id) && [c.a.id, c.b.id].includes(curated.id))?.kind).toMatch(/IDENTICAL|CONSISTENT/);

    const approval = approveCandidate(undefined, canas, IP_SOURCE, {
      confirmClosure: true,
      evidenceQuote: "Na noite de 30 de setembro para 1 de outubro, entre os Nós de Canas de Santa Maria e de São Miguel de Outeiro",
      geometry: { kind: "curated", geometryId: "ip3-troco-canas-sao-miguel-outeiro" },
      vehicles: { kind: "all_traffic" },
      temporal: { kind: "periods", periods: canas.fields.periods.value! },
    }, "Revisor de teste", CURATED_GEOMS, t0, before.version);
    expect(approval.ok).toBe(true);
    if (!approval.ok) return;
    expect(Object.values(approval.record.history[0]!.provenance!)).not.toContain("SOURCE_VERIFIED"); // machine text never becomes "source verified"
    const ing = buildIngestedConstraints(cands, [IP_SOURCE], fr, t0, { records: [approval.record], curatedGeometries: CURATED_GEOMS });
    const after = buildRegulationDataset([], ing);
    expect(after.version).not.toBe(before.version); // knowledge version changed ⇒ saved routes become stale

    const depart = Date.parse("2026-09-30T21:15:00+01:00");
    const input = { route: routeTimingInput(cv.points as [number, number][], cv.legPointCounts, cv.legDurationSec, depart, DEFAULT_TIMING_MODEL), stops: [], facts: {} };
    const opts = { timeToleranceMin: 15, sampleStepMin: 5, timing: DEFAULT_TIMING_MODEL };
    const resBefore = evaluateCompliance(before, input, opts).results.find((r) => r.regulationId.startsWith("rev-"));
    const resAfter = evaluateCompliance(after, input, opts).results.find((r) => r.regulationId.startsWith("rev-"))!;
    expect(resBefore).toBeUndefined();
    expect(resAfter.outcome).toBe("APPLIES");
  });
});
