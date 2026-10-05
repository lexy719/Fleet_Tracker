import { describe, expect, it } from "vitest";
import { evaluateCompliance } from "../../regulations/evaluate";
import { buildRegulationDataset, validateDataset } from "../../regulations/repository";
import { at, input, ROAD_A, ROAD_B, routeAlong } from "../../regulations/__tests__/helpers";
import { assessFreshness } from "../freshness";
import { buildIngestedConstraints, runSource, type FetchImpl } from "../pipeline";
import { getSource } from "../sources";
import { MemoryIngestionStore, SNAPSHOT_BODIES_KEPT } from "../store";
import type { SourceRecord } from "../types";
import { fixture, scriptedFetch, syntheticDatex } from "./helpers";

const NOW = new Date("2026-09-30T18:00:00Z");
const later = (min: number) => new Date(NOW.getTime() + min * 60_000);

/** Porto source definition re-used for a SYNTHETIC closure feed (fresh publication). */
const SRC: SourceRecord = { ...getSource("porto-datex-programados")!, id: "synthetic-datex", cadence: { checkEveryMin: 10, agingAfterMin: 24 * 60, staleAfterMin: 3 * 24 * 60 } };

const closureFeed = (overrides: Partial<Parameters<typeof syntheticDatex>[0]["records"][number]> = {}, publicationTime = "2026-09-30T17:00:00Z") =>
  syntheticDatex({
    publicationTime,
    records: [{ id: "closure-1", mgmt: "roadClosed", start: "2026-09-30T00:00:00Z", end: "2026-10-03T00:00:00Z", line: ROAD_A, ...overrides }],
  });

async function ingest(store: MemoryIngestionStore, body: string | Parameters<typeof scriptedFetch>[0][number], now = NOW, src = SRC) {
  return runSource(src, { store, fetch: scriptedFetch([body]) as FetchImpl, now });
}

async function datasetFrom(store: MemoryIngestionStore, now = NOW, src = SRC) {
  const state = (await store.getSourceStates()).find((s) => s.sourceId === src.id);
  const ing = buildIngestedConstraints(await store.getAllCandidates(), [src], { [src.id]: assessFreshness(src, state, now) }, now);
  return { ing, ds: buildRegulationDataset([], ing) };
}

const NOON = at("2026-10-01T12:00:00+01:00");

describe("structured closure → trust gate → evaluator (synthetic DATEX, same format as Porto)", () => {
  it("fresh official linear closure ⇒ ACTIVE ⇒ route along it is ROUTE_AFFECTED; parallel road is compliant", async () => {
    const store = new MemoryIngestionStore();
    expect((await ingest(store, closureFeed())).outcome).toBe("CHANGED");
    const [c] = await store.getAllCandidates();
    expect(c!.gate.decision).toBe("ACTIVE");
    expect(c!.gate.reasons.join(" ")).toMatch(/interpretada/); // all-traffic read from DATEX absence
    const { ing, ds } = await datasetFrom(store);
    expect(validateDataset(ds)).toEqual([]);
    expect(ds.version).toMatch(/\+ingest-[0-9a-f]{16}$/);
    expect(evaluateCompliance(ds, input(routeAlong(ROAD_A, NOON))).status).toBe("ROUTE_AFFECTED");
    expect(evaluateCompliance(ds, input(routeAlong(ROAD_B, NOON))).status).toBe("ROUTE_COMPLIANT");
    expect(ing.constraints[0]!.evidence[0]!.url).toBe(SRC.landingUrl);
  });

  it("outside the validity window ⇒ does not apply", async () => {
    const store = new MemoryIngestionStore();
    await ingest(store, closureFeed());
    const { ds } = await datasetFrom(store);
    expect(evaluateCompliance(ds, input(routeAlong(ROAD_A, at("2026-10-04T12:00:00+01:00")))).status).toBe("ROUTE_COMPLIANT");
  });

  it("polygon closure ⇒ ACTIVE_SCREENING_ONLY ⇒ at most POTENTIALLY_AFFECTED, never AFFECTED", async () => {
    const store = new MemoryIngestionStore();
    const poly: [number, number][] = [[40.999, -8.615], [40.999, -8.605], [41.001, -8.605], [41.001, -8.615], [40.999, -8.615]];
    await ingest(store, closureFeed({ line: undefined, polygon: poly }));
    expect((await store.getAllCandidates())[0]!.gate.decision).toBe("ACTIVE_SCREENING_ONLY");
    const { ds } = await datasetFrom(store);
    expect(evaluateCompliance(ds, input(routeAlong(ROAD_A, NOON))).status).toBe("POTENTIALLY_AFFECTED");
    expect(evaluateCompliance(ds, input(routeAlong(ROAD_B, NOON))).status).toBe("ROUTE_COMPLIANT");
  });

  it("stale publication downgrades an ACTIVE closure to screening only", async () => {
    const store = new MemoryIngestionStore();
    await ingest(store, closureFeed({}, "2026-09-20T00:00:00Z"));
    expect((await store.getAllCandidates())[0]!.gate.decision).toBe("ACTIVE_SCREENING_ONLY");
    const { ds } = await datasetFrom(store);
    expect(evaluateCompliance(ds, input(routeAlong(ROAD_A, NOON))).status).toBe("POTENTIALLY_AFFECTED");
  });

  it.each([
    ["vehicle conditions in DATEX (not encodable)", { vehicles: "<sit:vehicleType>lorry</sit:vehicleType>" }],
    ["comment conflicts with the structured end date", { comment: "Prorrogação até 05/10/2026" }],
    ["comment-only schedule", { comment: "Corte 09H00/17H00" }],
    ["unsupported location", { line: undefined, polygon: [] }],
  ])("%s ⇒ REVIEW_REQUIRED (never evaluated)", async (_l, o) => {
    const store = new MemoryIngestionStore();
    await ingest(store, closureFeed(o as never));
    const [c] = await store.getAllCandidates();
    expect(c!.gate.decision).toBe("REVIEW_REQUIRED");
    const { ing } = await datasetFrom(store);
    expect(ing.constraints).toEqual([]);
  });

  it("expired closure ⇒ INFORMATIONAL", async () => {
    const store = new MemoryIngestionStore();
    await ingest(store, closureFeed({ start: "2026-09-01T00:00:00Z", end: "2026-09-10T00:00:00Z" }));
    expect((await store.getAllCandidates())[0]!.gate.decision).toBe("INFORMATIONAL");
  });

  it("time passing re-gates: a closure that ends later stops being built into the dataset", async () => {
    const store = new MemoryIngestionStore();
    await ingest(store, closureFeed());
    expect((await datasetFrom(store, later(0))).ing.constraints).toHaveLength(1);
    const after = new Date("2026-10-04T00:00:00Z");
    expect((await datasetFrom(store, after)).ing.constraints).toHaveLength(0);
  });
});

describe("change detection", () => {
  it("NEW → UNCHANGED (same bytes) → UPDATED (fields) → NO_LONGER_REPORTED → reappears UPDATED", async () => {
    const store = new MemoryIngestionStore();
    expect((await ingest(store, closureFeed())).counts?.new).toBe(1);
    expect((await ingest(store, closureFeed(), later(15))).outcome).toBe("UNCHANGED");
    const r3 = await ingest(store, closureFeed({ end: "2026-10-05T00:00:00Z" }), later(30));
    expect(r3.counts?.updated).toBe(1);
    expect((await store.listChanges(1))[0]).toMatchObject({ change: "UPDATED", fields: ["validity"] });

    const empty = syntheticDatex({ publicationTime: "2026-09-30T18:30:00Z", records: [] });
    const r4 = await ingest(store, empty, later(45));
    expect(r4.counts?.noLongerReported).toBe(1);
    const [gone] = await store.getAllCandidates();
    expect(gone).toMatchObject({ lifecycle: "NO_LONGER_REPORTED", missingSinceAt: later(45).toISOString() });
    expect(gone!.gate.decision).toBe("REVIEW_REQUIRED"); // not "cancelled", not silently active
    expect((await datasetFrom(store, later(45))).ing.constraints).toEqual([]);

    const r5 = await ingest(store, closureFeed({ end: "2026-10-05T00:00:00Z" }), later(60));
    expect(r5.counts?.updated).toBe(1);
    expect((await store.getAllCandidates())[0]!.gate.decision).toBe("ACTIVE");
  });

  it("unchanged fetch stores no new snapshot; retention keeps only the newest bodies", async () => {
    const store = new MemoryIngestionStore();
    await ingest(store, closureFeed());
    await ingest(store, closureFeed(), later(10));
    expect(await store.listSnapshots(SRC.id)).toHaveLength(1);
    for (let i = 1; i <= 5; i++) await ingest(store, closureFeed({ end: `2026-10-0${i + 3}T00:00:00Z` }), later(10 * (i + 1)));
    const metas = await store.listSnapshots(SRC.id);
    expect(metas).toHaveLength(6);
    expect(metas.filter((m) => !m.bodyPruned)).toHaveLength(SNAPSHOT_BODIES_KEPT);
    expect(metas.every((m) => /^[0-9a-f]{64}$/.test(m.sha256))).toBe(true);
  });
});

describe("failures never change what is known (and never make anything green)", () => {
  it.each<[string, Parameters<typeof scriptedFetch>[0][number], RegExp]>([
    ["HTTP 500", { status: 500 }, /HTTP 500/],
    ["HTTP 404 (URL moved)", { status: 404 }, /HTTP 404/],
    ["network error / CORS", new TypeError("Failed to fetch"), /falha de rede/],
    ["empty body", "", /vazia/],
  ])("%s ⇒ FETCH_ERROR, candidates untouched, freshness FETCH_ERROR", async (_l, step, msg) => {
    const store = new MemoryIngestionStore();
    await ingest(store, closureFeed());
    const before = await store.getAllCandidates();
    const r = await ingest(store, step, later(20));
    expect(r.outcome).toBe("FETCH_ERROR");
    expect(r.message).toMatch(msg);
    const after = await store.getAllCandidates();
    expect(after.map((c) => [c.id, c.lifecycle])).toEqual(before.map((c) => [c.id, c.lifecycle]));
    const state = (await store.getSourceStates())[0];
    expect(assessFreshness(SRC, state, later(20)).state).toBe("FETCH_ERROR");
    // gate: FETCH_ERROR source ⇒ screening only (the closure is not dropped, not trusted fully)
    expect(after[0]!.gate.decision).toBe("ACTIVE_SCREENING_ONLY");
  });

  it("timeout ⇒ FETCH_ERROR", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();
    try {
      const store = new MemoryIngestionStore();
      const p = runSource(SRC, { store, fetch: scriptedFetch(["hang"]) as FetchImpl, now: NOW });
      await vi.advanceTimersByTimeAsync(31_000);
      expect((await p).message).toMatch(/tempo esgotado/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an HTML error page served with 200 ⇒ PARSE_ERROR; previous candidates are NOT marked no-longer-reported", async () => {
    const store = new MemoryIngestionStore();
    await ingest(store, closureFeed());
    const r = await ingest(store, "<html><body>Serviço em manutenção</body></html>", later(20));
    expect(r.outcome).toBe("PARSE_ERROR");
    expect((await store.getAllCandidates())[0]!.lifecycle).toBe("NEW");
    expect((await store.getErrors())[0]!.kind).toBe("PARSE_ERROR");
  });

  it("a truncated XML body keeps the records that parsed and does not invent the rest", async () => {
    const store = new MemoryIngestionStore();
    const full = syntheticDatex({
      publicationTime: "2026-09-30T17:00:00Z",
      records: [
        { id: "a", mgmt: "roadClosed", start: "2026-09-30T00:00:00Z", end: "2026-10-03T00:00:00Z", line: ROAD_A },
        { id: "b", mgmt: "roadClosed", start: "2026-09-30T00:00:00Z", end: "2026-10-03T00:00:00Z", line: ROAD_B },
      ],
    });
    const truncated = full.slice(0, full.lastIndexOf("<loc:posList>") + 20);
    await ingest(store, truncated);
    const cands = await store.getAllCandidates();
    const b = cands.find((c) => c.externalId === "b");
    expect(cands.find((c) => c.externalId === "a")!.gate.decision).toBe("ACTIVE");
    expect(b?.gate.decision ?? "absent").not.toBe("ACTIVE");
  });

  it("real Porto snapshot through the whole pipeline: nothing active, source STALE", async () => {
    const store = new MemoryIngestionStore();
    const porto = getSource("porto-datex-programados")!;
    const r = await runSource(porto, { store, fetch: scriptedFetch([fixture("portoDatexProgramados.xml")]) as FetchImpl, now: NOW });
    expect(r.outcome).toBe("CHANGED");
    const state = (await store.getSourceStates())[0];
    expect(assessFreshness(porto, state, NOW).state).toBe("STALE");
    const { ing } = await datasetFrom(store, NOW, porto);
    expect(ing.constraints).toEqual([]);
  });
});

describe("knowledge version (fingerprint) drives clean-route reuse", () => {
  it("unchanged bytes ⇒ same version; changed content / new closure / closure gone ⇒ new version", async () => {
    const store = new MemoryIngestionStore();
    await ingest(store, closureFeed());
    const v1 = (await datasetFrom(store, later(0))).ds.version;
    await ingest(store, closureFeed(), later(15));
    expect((await datasetFrom(store, later(15))).ds.version).toBe(v1); // same knowledge ⇒ reuse allowed
    await ingest(store, closureFeed({ end: "2026-10-05T00:00:00Z" }), later(30));
    const v2 = (await datasetFrom(store, later(30))).ds.version;
    expect(v2).not.toBe(v1); // content changed ⇒ re-solve
    await ingest(store, syntheticDatex({ publicationTime: "2026-09-30T17:00:00Z", records: [
      { id: "closure-1", mgmt: "roadClosed", start: "2026-09-30T00:00:00Z", end: "2026-10-05T00:00:00Z", line: ROAD_A },
      { id: "closure-2", mgmt: "roadClosed", start: "2026-09-30T00:00:00Z", end: "2026-10-05T00:00:00Z", line: ROAD_B },
    ] }), later(40));
    const v3 = (await datasetFrom(store, later(40))).ds.version;
    expect(new Set([v1, v2, v3]).size).toBe(3);
    await ingest(store, syntheticDatex({ publicationTime: "2026-09-30T18:30:00Z", records: [] }), later(50));
    const v4 = (await datasetFrom(store, later(50))).ds.version;
    expect([v1, v2, v3]).not.toContain(v4); // no ingested constraints left ⇒ back to the curated version
  });
});
