import { describe, expect, it } from "vitest";
import tomtomCoimbraViseu from "../../regulations/__fixtures__/tomtomCoimbraViseuIp3.json";
import { demoJobs as seedJobs, demoTrucks as trucks } from "../../data/mockData";
import type { Job } from "../../data/types";
import { createComplianceRecord } from "../../regulations/decisionRecord";
import { evaluateCompliance, type EvaluateOptions } from "../../regulations/evaluate";
import { buildRouteStops, buildTransportFacts } from "../../regulations/fleetFacts";
import { estimatePointTimes } from "../../regulations/geometry";
import { assessPlannedJob } from "../../regulations/reevaluate";
import { availableRoadEvents, buildRegulationDataset, REGULATION_DATASET, validateDataset } from "../../regulations/repository";
import type { GeometryRecord } from "../../regulations/types";
import type { RoutePlanOption } from "../../tomtom/planRoutes";
import { mergeCandidates } from "../changes";
import { assessFreshness } from "../freshness";
import { parseIpArcgis } from "../parsers/ipArcgis";
import { buildIngestedConstraints } from "../pipeline";
import {
  approveCandidate,
  checkApproval,
  parseReviewRecord,
  rejectCandidate,
  reviewedConstraint,
  reviewState,
  revokeApproval,
  type ReviewRecord,
  type ReviewResolution,
} from "../review";
import { activeSources, DEV_SOURCES, getSource, validateSources } from "../sources";
import { MemoryIngestionStore } from "../store";
import { applyTrustGate } from "../trustGate";
import type { CandidateConstraint, Freshness, SourceRecord } from "../types";
import { fixture, snapshot } from "./helpers";

const NOW = new Date("2026-09-30T18:00:00Z");
const FRESH: Freshness = { state: "FRESH", reason: "test" };
const STALE: Freshness = { state: "STALE", reason: "publicação há 15 dias" };
const CURATED: GeometryRecord[] = [...REGULATION_DATASET.geometries, ...availableRoadEvents().flatMap((e) => e.geometries)].filter(
  (g) => g.status === "RESOLVED" && g.resolved?.verification !== "UNVERIFIED",
);
const IP_SRC = getSource("ip-arcgis-condicionamentos")!;
const SYN_SRC = DEV_SOURCES.find((s) => s.id === "dev-test-ip-point-event")!;

/* ─── A saved plan (J-DEMO-IP3 on the real TomTom Coimbra→Viseu route) ─── */
type FR = { legs: { travelTimeInSeconds: number; points: number[][] }[]; lengthInMeters: number; travelTimeInSeconds: number };
const ORIG = (tomtomCoimbraViseu as unknown as { original: FR }).original;
const poly = ORIG.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number]));
const OPTS: EvaluateOptions = { timeToleranceMin: 15, sampleStepMin: 5 };
const truck = trucks.find((t) => t.id === "t-demo-vci")!;
const job: Job = { ...seedJobs.find((j) => j.id === "J-DEMO-IP3")!, status: "assigned", assignedTruckId: truck.id };
const depart = new Date(job.plannedDepartureAt!);
const opt: RoutePlanOption = {
  id: "route-0", title: "", subtitle: "", polyline: poly, distanceM: ORIG.lengthInMeters, durationSec: ORIG.travelTimeInSeconds, trafficDelaySec: 0,
  fuelCostEur: 0, tollCostEur: 0, tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none", tollSectionCount: 0, stopArrivals: [],
  legDurationSec: ORIG.legs.map((l) => l.travelTimeInSeconds), legPointCounts: ORIG.legs.map((l) => l.points.length), roadNumbers: [],
  departAtIso: depart.toISOString(), colorIndex: 0, routing: { role: "primary", params: {} },
};
const liveInput = {
  route: { points: poly, pointTimesMs: estimatePointTimes(poly, opt.legPointCounts, opt.legDurationSec, depart.getTime()), timesAreEstimates: true, tripWindowMs: [depart.getTime(), depart.getTime() + opt.durationSec * 1000] as [number, number] },
  stops: buildRouteStops(job, REGULATION_DATASET.areas),
  facts: buildTransportFacts(truck, job),
};
const PLANNED: Job = {
  ...job,
  routeCompliance: createComplianceRecord({ job, truck, dataset: REGULATION_DATASET, option: opt, title: "t", departAt: depart, liveInput, evaluationOptions: OPTS, liveReport: evaluateCompliance(REGULATION_DATASET, liveInput, OPTS), followsOfficialAlternatives: [] })!,
};
/** ~3 km of the saved route (reviewer-drawn operational geometry in the tests). */
const STRETCH = poly.slice(Math.floor(poly.length / 2), Math.floor(poly.length / 2) + 60);
const MID = STRETCH[30]!;

/* ─── Candidates ─── */

function gated(c: Omit<CandidateConstraint, "gate" | "lifecycle" | "firstSeenAt" | "lastSeenAt">, src: SourceRecord, fr = FRESH): CandidateConstraint {
  const base = { ...c, lifecycle: "NEW" as const, firstSeenAt: NOW.toISOString(), lastSeenAt: NOW.toISOString() };
  return { ...base, gate: applyTrustGate(base, src, fr, NOW) };
}

/** A REAL IP candidate: EN9 Mafra, prose "Corte total de trânsito…", point only. */
const REAL = parseIpArcgis(snapshot(IP_SRC.id, fixture("ipArcgisCondicionamentos.json"))).candidates.find((c) =>
  c.fields.description.value?.startsWith("Corte total de trânsito da EN9"),
)!;
const REAL_C = gated(REAL, IP_SRC, STALE);

/**
 * TEST COPY: same ArcGIS structure as REAL (tipo/description/commentsummary/dates), but
 * placed on the saved route and labelled synthetic. Not a real event.
 */
const SYN_TEXT = "[TESTE SINTÉTICO] Corte total de trânsito entre os kms 10,0 e 13,0, devido a instabilidade de talude.";
function syntheticArcgis(text = SYN_TEXT, point = MID) {
  return JSON.stringify({
    features: [
      {
        attributes: {
          objectid: 1, tipo: "MaintenanceWorks", estado: "ativo", datainicio: Date.parse("2026-09-30T00:00:00Z"), dataobservacao: Date.parse("2026-09-30T12:00:00Z"),
          datafim: null, commentsummary: text, description: "IP3", pkbegin: 10, direction: "Ambos", distrito: "Viseu", concelho: "Tondela",
          latitude: point[0], longitude: point[1],
        },
        geometry: { x: point[1], y: point[0] },
      },
    ],
  });
}
const synCandidate = (src: SourceRecord = SYN_SRC, text?: string) => gated(parseIpArcgis(snapshot(src.id, syntheticArcgis(text))).candidates[0]!, src);

const QUOTE = "Corte total de trânsito entre os kms 10,0 e 13,0";
const FULL: ReviewResolution = {
  confirmClosure: true,
  evidenceQuote: QUOTE,
  geometry: { kind: "reviewer_lines", lines: [STRETCH] },
  vehicles: { kind: "all_traffic" },
  temporal: { kind: "periods", periods: [{ start: "2026-10-01T00:00", end: "2026-10-03T00:00" }] },
  note: "teste",
};

const build = (cands: CandidateConstraint[], records: ReviewRecord[], srcs: SourceRecord[], fr: Record<string, Freshness> = {}) =>
  buildIngestedConstraints(cands, srcs, Object.fromEntries(srcs.map((s) => [s.id, fr[s.id] ?? FRESH])), NOW, { records, curatedGeometries: CURATED });

describe("development/test sources", () => {
  it("are valid, synthetic, dev-fixture only, and excluded unless explicitly enabled", () => {
    expect(validateSources(DEV_SOURCES)).toEqual([]);
    expect(DEV_SOURCES.every((s) => s.synthetic && s.access.kind === "DEV_FIXTURE" && /TESTE SINTÉTICO/.test(s.name))).toBe(true);
    expect(activeSources(false).some((s) => s.synthetic)).toBe(false);
    expect(activeSources(true).filter((s) => s.synthetic)).toHaveLength(2);
    expect(validateSources([{ ...SYN_SRC, access: { kind: "DIRECT_CORS", url: "https://x" } }])[0]).toMatch(/synthetic source must be a dev fixture/);
    expect(validateSources([{ ...IP_SRC, id: "y", access: { kind: "DEV_FIXTURE", path: "/__dev/ingestion/x.json" } }])[0]).toMatch(/must be synthetic/);
  });
});

describe("real IP candidate: stops at REVIEW_REQUIRED and cannot be approved on its evidence alone", () => {
  it("the gate explains why", () => {
    expect(REAL_C.gate.decision).toBe("REVIEW_REQUIRED");
    expect(REAL_C.gate.reasons.join(" ")).toMatch(/texto sugere um corte/);
  });
  it("an 'approve' with nothing resolved is blocked, listing every unresolved fact", () => {
    const r = approveCandidate(undefined, REAL_C, IP_SRC, { confirmClosure: false, evidenceQuote: "" }, "Revisora", CURATED, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toEqual(
      expect.arrayContaining([
        "por resolver: confirmar que o evento proíbe a passagem (corte)",
        "por resolver: citar o excerto da fonte que suporta a decisão",
        "por resolver: geometria operacional",
        "por resolver: aplicabilidade a veículos",
        "por resolver: período de vigência",
      ]),
    );
  });
  it("the source gives only a point: 'use source geometry' is refused; a line far from the point is refused", () => {
    const base = { ...FULL, evidenceQuote: "Corte total de trânsito da EN9", temporal: { kind: "source_validity" as const, confirmOpenEnded: true } };
    expect(checkApproval(REAL_C, IP_SRC, { ...base, geometry: { kind: "source_lines" } }, "R", CURATED, NOW).problems).toContain("a fonte não forneceu linhas — indique a geometria");
    // STRETCH is on the IP3 near Tondela — nowhere near the EN9 in Mafra.
    expect(checkApproval(REAL_C, IP_SRC, base, "R", CURATED, NOW).problems.join(" ")).toMatch(/do ponto indicado pela fonte/);
  });
});

describe("review → accepted RoadConstraint → planned-job reevaluation (test copy)", () => {
  const C = synCandidate();

  it("test copy enters REVIEW_REQUIRED for the same reasons as the real one", () => {
    expect(C.gate.decision).toBe("REVIEW_REQUIRED");
    expect(C.title).toMatch(/IP3/);
  });

  it("missing facts block; explicit resolution approves; constraint is built and labelled", () => {
    expect(approveCandidate(undefined, C, SYN_SRC, { ...FULL, vehicles: undefined }, "R", CURATED, NOW).ok).toBe(false);
    const r = approveCandidate(undefined, C, SYN_SRC, FULL, "Revisora Teste", CURATED, NOW, "ds-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const built = build([C], [r.record], [SYN_SRC]);
    expect(built.constraints).toHaveLength(1);
    const k = built.constraints[0]!;
    expect(k.id).toBe(`rev-${C.id}`);
    expect(k.title).toMatch(/^\[TESTE SINTÉTICO\]/);
    expect(k.origin).toMatchObject({ kind: "ingested_reviewed", synthetic: true, reviewedBy: "Revisora Teste" });
    expect(k.legalStatus).toBe("INTERPRETED"); // synthetic data never verifies anything
    expect(k.openQuestions.join(" ")).toMatch(/Conjunto de restrições à data da revisão: ds-1/);
    const ds = buildRegulationDataset([], built);
    expect(validateDataset(ds)).toEqual([]);
  });

  it("saved job is reevaluated on its SAVED route: synthetic ⇒ POTENTIALLY_AFFECTED (never a verified violation)", () => {
    expect(assessPlannedJob(PLANNED, truck, REGULATION_DATASET, NOW).state).toBe("CURRENT");
    const r = approveCandidate(undefined, C, SYN_SRC, FULL, "R", CURATED, NOW);
    if (!r.ok) throw new Error("approve failed");
    const ds = buildRegulationDataset([], build([C], [r.record], [SYN_SRC]));
    const s = assessPlannedJob(PLANNED, truck, ds, NOW);
    expect(s.state).toBe("CURRENT");
    if (s.state !== "CURRENT") return;
    expect(s.datasetChanged).toBe(true);
    expect(s.reevaluation.current.status).toBe("POTENTIALLY_AFFECTED");
    expect(s.reevaluation.newFindings.map((f) => f.regulationId)).toEqual([`rev-${C.id}`]);
    expect(s.reevaluation.previousStatus).toBe("ROUTE_COMPLIANT"); // saved decision untouched
  });

  it("the same review of an OFFICIAL-source record (test copy of the registry entry) ⇒ ROUTE_AFFECTED", () => {
    const official: SourceRecord = { ...IP_SRC, id: "test-copy-of-ip-source" };
    const OC = gated(parseIpArcgis(snapshot(official.id, syntheticArcgis(QUOTE + "."))).candidates[0]!, official);
    const r = approveCandidate(undefined, OC, official, FULL, "R", CURATED, NOW);
    if (!r.ok) throw new Error(r.problems.join());
    const built = build([OC], [r.record], [official]);
    expect(built.constraints[0]!.legalStatus).toBe("VERIFIED");
    expect(built.constraints[0]!.evidence[0]!.quote).toBe(QUOTE);
    const s = assessPlannedJob(PLANNED, truck, buildRegulationDataset([], built), NOW);
    expect(s.state === "CURRENT" && s.reevaluation.current.status).toBe("ROUTE_AFFECTED");
  });

  it("vehicle threshold resolved by the reviewer is evaluated against the truck's recorded facts", () => {
    const official: SourceRecord = { ...IP_SRC, id: "test-copy-of-ip-source" };
    const OC = gated(parseIpArcgis(snapshot(official.id, syntheticArcgis(QUOTE + "."))).candidates[0]!, official);
    const heavy = approveCandidate(undefined, OC, official, { ...FULL, vehicles: { kind: "gross_weight_over_kg", kg: 50_000 } }, "R", CURATED, NOW);
    if (!heavy.ok) throw new Error();
    const s = assessPlannedJob(PLANNED, truck, buildRegulationDataset([], build([OC], [heavy.record], [official])), NOW);
    // Demo truck is 40 t: a > 50 t restriction does not apply to it.
    expect(s.state === "CURRENT" && s.reevaluation.current.status).toBe("ROUTE_COMPLIANT");
  });
});

describe("rejection", () => {
  const C = synCandidate();
  it("REVIEW_REQUIRED → REJECTED: preserved for audit, never enters the evaluator, cannot be approved later", () => {
    expect(rejectCandidate(undefined, C, "R", "", NOW).ok).toBe(false); // reason required
    const r = rejectCandidate(undefined, C, "Revisor", "Evento sem base suficiente", NOW);
    if (!r.ok) throw new Error();
    expect(reviewState(r.record)).toBe("REJECTED");
    const built = build([C], [r.record], [SYN_SRC]);
    expect(built.constraints).toEqual([]);
    expect(built.reviewStatus[C.id]).toMatch(/REJECTED/);
    expect(approveCandidate(r.record, C, SYN_SRC, FULL, "R", CURATED, NOW)).toEqual({ ok: false, problems: ["candidato rejeitado — não pode ser ativado"] });
  });
  it("an automatically ACTIVE official constraint cannot be switched off by a reviewer", () => {
    const active = { ...synCandidate(), gate: { decision: "ACTIVE" as const, reasons: [] } };
    expect(rejectCandidate(undefined, active, "R", "não gosto", NOW).ok).toBe(false);
    expect(approveCandidate(undefined, active, SYN_SRC, FULL, "R", CURATED, NOW).ok).toBe(false);
  });
});

describe("approval safety", () => {
  const C = synCandidate();
  const blocked = (res: Partial<ReviewResolution>) => checkApproval(C, SYN_SRC, { ...FULL, ...res }, "R", CURATED, NOW);

  it.each<[string, Partial<ReviewResolution>, RegExp]>([
    ["no geometry", { geometry: undefined }, /geometria operacional/],
    ["single-point line", { geometry: { kind: "reviewer_lines", lines: [[MID]] } }, /pelo menos 2 pontos/],
    ["NaN coordinate", { geometry: { kind: "reviewer_lines", lines: [[MID, [Number.NaN, -8]]] } }, /coordenada inválida/],
    ["lat/lng swapped", { geometry: { kind: "reviewer_lines", lines: [STRETCH.map(([a, b]) => [b, a] as [number, number])] } }, /fora de Portugal continental/],
    ["vertex gap > 2 km", { geometry: { kind: "reviewer_lines", lines: [[STRETCH[0]!, [STRETCH[0]![0] + 0.05, STRETCH[0]![1]]]] } }, /máx\. 2000 m/],
    ["too short", { geometry: { kind: "reviewer_lines", lines: [[MID, [MID[0] + 0.0001, MID[1]]]] } }, /demasiado curta/],
    ["unknown curated id", { geometry: { kind: "curated", geometryId: "nope" } }, /não existe/],
    ["UNVERIFIED curated geometry (EN2 OSM)", { geometry: { kind: "curated", geometryId: "en2-corredor-ip3" } }, /não existe|não está resolvida/],
    ["bad period format", { temporal: { kind: "periods", periods: [{ start: "1/10/2026 21h", end: "2026-10-02T05:00" }] } }, /data\/hora inválida/],
    ["period ends before start", { temporal: { kind: "periods", periods: [{ start: "2026-10-02T05:00", end: "2026-10-01T21:00" }] } }, /termina antes de começar/],
    ["non-existent local time (DST gap)", { temporal: { kind: "periods", periods: [{ start: "2026-03-29T01:30", end: "2026-10-02T05:00" }] } }, /inexistente/],
    ["all periods in the past", { temporal: { kind: "periods", periods: [{ start: "2026-09-01T00:00", end: "2026-09-02T00:00" }] } }, /já terminaram/],
    ["open-ended source validity not confirmed", { temporal: { kind: "source_validity", confirmOpenEnded: false } }, /vigência sem fim/],
    ["invalid weight", { vehicles: { kind: "gross_weight_over_kg", kg: -1 } }, /peso bruto inválido/],
    ["quote not in the source", { evidenceQuote: "Proibida a circulação de pesados em permanência" }, /não existe no texto da fonte/],
    ["closure not confirmed", { confirmClosure: false }, /proíbe a passagem/],
  ])("%s ⇒ blocked", (_l, res, msg) => {
    const r = blocked(res);
    expect(r.ok).toBe(false);
    expect([...r.problems, ...r.unresolved].join(" | ")).toMatch(msg);
  });

  it("no reviewer name ⇒ blocked", () => {
    expect(checkApproval(C, SYN_SRC, FULL, "  ", CURATED, NOW).problems).toContain("indique o nome do revisor");
  });

  it("a curated resolved geometry can be selected", () => {
    expect(checkApproval(C, SYN_SRC, { ...FULL, geometry: { kind: "curated", geometryId: "ip3-troco-canas-sao-miguel-outeiro" } }, "R", CURATED, NOW).problems.join()).not.toMatch(/curada/);
  });
});

describe("provenance and evidence integrity", () => {
  const C = synCandidate();
  it("review never changes the candidate or its evidence; human-resolved fields are never VERIFIED", () => {
    const before = structuredClone(C);
    const r = approveCandidate(undefined, C, SYN_SRC, FULL, "R", CURATED, NOW);
    if (!r.ok) throw new Error();
    expect(C).toEqual(before);
    const ev = r.record.history[0]!;
    expect(ev.candidate).toEqual(before);
    expect(ev.provenance).toEqual({ category: "HUMAN_RESOLVED", geometry: "HUMAN_RESOLVED", vehicles: "HUMAN_RESOLVED", temporal: "HUMAN_RESOLVED" });
    const k = build([C], [r.record], [SYN_SRC]);
    const geom = k.geometries.find((g) => g.id === k.constraints[0]!.location.geometryId)!;
    expect(geom.resolved!.verification).toBe("INTERPRETED");
    expect(geom.resolved!.mappingMethod).toMatch(/traçada pelo revisor .* só indica um ponto/);
    expect(k.constraints[0]!.evidence.find((e) => e.id.endsWith("-revisao"))!.verification).toBe("INTERPRETED");
  });

  it("a source-verified field keeps its source provenance (source_validity with VERIFIED validity)", () => {
    const r = approveCandidate(undefined, C, SYN_SRC, { ...FULL, temporal: { kind: "source_validity", confirmOpenEnded: true } }, "R", CURATED, NOW);
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.record.history[0]!.provenance!.temporal).toBe("SOURCE_VERIFIED");
    expect(r.record.history[0]!.provenance!.vehicles).toBe("HUMAN_RESOLVED");
  });

  it("stale source stays visibly STALE after review (constraint carries it)", () => {
    const r = approveCandidate(undefined, C, SYN_SRC, FULL, "R", CURATED, NOW);
    if (!r.ok) throw new Error();
    const built = build([C], [r.record], [SYN_SRC], { [SYN_SRC.id]: STALE });
    expect(built.constraints[0]!.openQuestions.join(" ")).toMatch(/Fonte STALE/);
    expect(assessFreshness(SYN_SRC, { sourceId: SYN_SRC.id, lastAttemptAt: NOW.toISOString(), lastSuccessAt: NOW.toISOString(), publishedAt: "2026-09-15T00:00:00Z", unchangedFetches: 0 }, NOW).state).toBe("STALE");
  });
});

describe("idempotency, revocation, source changes", () => {
  const C = synCandidate();
  it("duplicate approval is a no-op and never duplicates the active constraint", () => {
    const a = approveCandidate(undefined, C, SYN_SRC, FULL, "R", CURATED, NOW);
    if (!a.ok) throw new Error();
    const b = approveCandidate(a.record, C, SYN_SRC, structuredClone(FULL), "R", CURATED, new Date(NOW.getTime() + 60_000));
    expect(b).toMatchObject({ ok: true, changed: false });
    if (!b.ok) return;
    expect(b.record.history).toHaveLength(1);
    expect(build([C], [b.record], [SYN_SRC]).constraints).toHaveLength(1);
    expect(approveCandidate(a.record, C, SYN_SRC, { ...FULL, note: "outra" }, "R", CURATED, NOW)).toMatchObject({ ok: false });
  });

  it("revocation deactivates, keeps full history, and does not touch the job's saved decision", () => {
    const a = approveCandidate(undefined, C, SYN_SRC, FULL, "R", CURATED, NOW);
    if (!a.ok) throw new Error();
    const savedBefore = structuredClone(PLANNED.routeCompliance);
    const v = revokeApproval(a.record, C, "R2", "aprovado por engano", NOW);
    if (!v.ok) throw new Error();
    expect(v.record.history.map((e) => e.action)).toEqual(["APPROVED", "REVOKED"]);
    const built = build([C], [v.record], [SYN_SRC]);
    expect(built.constraints).toEqual([]);
    const s = assessPlannedJob(PLANNED, truck, buildRegulationDataset([], built), NOW);
    expect(s.state === "CURRENT" && s.reevaluation.newFindings).toEqual([]);
    expect(PLANNED.routeCompliance).toEqual(savedBefore);
  });

  it("source updates the record after approval ⇒ approval no longer active (needs a new review)", () => {
    const a = approveCandidate(undefined, C, SYN_SRC, FULL, "R", CURATED, NOW);
    if (!a.ok) throw new Error();
    const changed = synCandidate(SYN_SRC, SYN_TEXT.replace("13,0", "14,0"));
    expect(changed.id).toBe(C.id);
    const built = build([changed], [a.record], [SYN_SRC]);
    expect(built.constraints).toEqual([]);
    expect(built.reviewStatus[C.id]).toMatch(/requer nova revisão/);
  });

  it("source stops reporting the record ⇒ approval stays active, flagged (disappearance ≠ cancellation)", () => {
    const a = approveCandidate(undefined, C, SYN_SRC, FULL, "R", CURATED, NOW);
    if (!a.ok) throw new Error();
    const gone = mergeCandidates([C], [], NOW.toISOString(), (x) => applyTrustGate(x, SYN_SRC, FRESH, NOW)).candidates;
    expect(gone[0]!.lifecycle).toBe("NO_LONGER_REPORTED");
    const built = build(gone, [a.record], [SYN_SRC]);
    expect(built.constraints).toHaveLength(1);
    expect(built.constraints[0]!.openQuestions.join(" ")).toMatch(/deixou de constar/);
  });

  it("source disabled (e.g. test fixtures switched off) ⇒ review kept, constraint inactive", () => {
    const a = approveCandidate(undefined, C, SYN_SRC, FULL, "R", CURATED, NOW);
    if (!a.ok) throw new Error();
    const built = build([], [a.record], activeSources(false));
    expect(built.constraints).toEqual([]);
    expect(built.reviewStatus[C.id]).toMatch(/fonte não disponível/);
  });
});

describe("persistence", () => {
  const C = synCandidate();
  it("reload (store + JSON round-trip) preserves review state and audit trail", async () => {
    const a = approveCandidate(undefined, C, SYN_SRC, FULL, "R", CURATED, NOW);
    if (!a.ok) throw new Error();
    const store = new MemoryIngestionStore();
    await store.putReview(a.record);
    await store.clear(); // clearing fetched data keeps audit records
    const [raw] = await store.getReviews();
    const parsed = parseReviewRecord(JSON.parse(JSON.stringify(raw)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record).toEqual(a.record);
    expect(build([C], [parsed.record], [SYN_SRC]).constraints).toHaveLength(1);
  });

  it.each<[string, (r: ReviewRecord) => unknown]>([
    ["not an object", () => "garbage"],
    ["unknown schema version", (r) => ({ ...r, schemaVersion: 99 })],
    ["empty history", (r) => ({ ...r, history: [] })],
    ["unknown action", (r) => ({ ...r, history: [{ ...r.history[0]!, action: "FORCE_ACTIVE" }] })],
    ["approval without resolution", (r) => ({ ...r, history: [{ ...r.history[0]!, resolution: undefined }] })],
    ["missing original candidate", (r) => ({ ...r, history: [{ ...r.history[0]!, candidate: null }] })],
    ["bad date", (r) => ({ ...r, history: [{ ...r.history[0]!, at: "yesterday" }] })],
  ])("corrupted persisted review (%s) fails safely", (_l, corrupt) => {
    const a = approveCandidate(undefined, C, SYN_SRC, FULL, "R", CURATED, NOW);
    if (!a.ok) throw new Error();
    const p = parseReviewRecord(corrupt(a.record));
    expect(p.ok).toBe(false);
  });

  it("structurally valid but tampered approval (geometry made invalid) is re-validated and not activated", () => {
    const a = approveCandidate(undefined, C, SYN_SRC, FULL, "R", CURATED, NOW);
    if (!a.ok) throw new Error();
    const tampered = structuredClone(a.record);
    tampered.history[0]!.resolution!.geometry = { kind: "reviewer_lines", lines: [[[0, 0], [0, 1]]] };
    const res = reviewedConstraint(tampered, C, SYN_SRC, FRESH, CURATED, NOW);
    expect(res.active).toBe(false);
  });
});
