import { describe, expect, it } from "vitest";
import { assessFreshness } from "../freshness";
import { parseIpAlertasJsonapi } from "../parsers/ipAlertasJsonapi";
import { MAX_EXPANDED_DAYS, parseLisboaClosures } from "../parsers/lisboaClosures";
import { parseOeirasWfs } from "../parsers/oeirasWfs";
import { parseWpNotices } from "../parsers/wpNotices";
import { getSource, validateSources } from "../sources";
import { candidateToConstraint } from "../toConstraint";
import { applyTrustGate } from "../trustGate";
import type { CandidateConstraint, SourceState } from "../types";
import { fixture, snapshot } from "./helpers";

/* Real payloads captured 2026-10-10/11 (Phase 1c national source audit). */
const NOW = new Date("2026-10-10T12:00:00Z");
const FETCHED = "2026-10-10T12:00:00.000Z";
const stateWith = (sourceId: string, publishedAt?: string): SourceState => ({
  sourceId, lastAttemptAt: FETCHED, lastSuccessAt: FETCHED, unchangedFetches: 0, ...(publishedAt ? { publishedAt, publishedAtBasis: "test" } : {}),
});

describe("phase 1c sources in the registry", () => {
  it("registry stays valid (new relays included)", () => {
    expect(validateSources()).toEqual([]);
  });
  it("every new source is registered with a parser and coverage", () => {
    for (const id of ["lisboa-cityplatform-closures", "oeiras-wfs-condicionalismos", "ip-alertas-jsonapi", "wp-povoa-de-lanhoso", "wp-santiago-do-cacem"]) {
      const s = getSource(id);
      expect(s, id).toBeDefined();
      expect(s!.coverage.gaps.length, id).toBeGreaterThan(0);
    }
  });
});

describe("Lisboa City Platform closures (real snapshot subset)", () => {
  const src = getSource("lisboa-cityplatform-closures")!;
  const out = parseLisboaClosures(snapshot(src.id, fixture("lisboaClosures.json"), FETCHED));
  const byId = (id: string) => out.candidates.find((c) => c.externalId === id)!;
  const fresh = assessFreshness(src, stateWith(src.id, out.publishedAt), NOW);
  const gate = (c: (typeof out.candidates)[number]) => applyTrustGate({ ...c, lifecycle: "NEW" }, src, fresh, NOW);

  it("parses every feature with a stable source id", () => {
    expect(out.errors).toEqual([]);
    expect(out.candidates).toHaveLength(out.recordCount);
    expect(out.recordCount).toBe(34);
  });
  it("discloses that the live service has no publication date (fetch time used)", () => {
    expect(out.publishedAt).toBe(FETCHED);
    expect(out.publishedAtBasis).toMatch(/hora da consulta/);
    expect(fresh.state).toBe("FRESH");
  });
  it("«Corte total» with a 24 h window ⇒ one continuous period, line geometry, ACTIVE", () => {
    const c = byId("132923"); // Rua Ferreira Borges, 2026-09-01 → 2026-10-31, 00:00–23:59
    expect(c.fields.category).toMatchObject({ state: "VERIFIED", value: "ROAD_CLOSURE" });
    expect(c.fields.geometry.value?.kind).toBe("lines");
    expect(c.fields.periods.value).toEqual([{ start: "2026-09-01T00:00", end: "2026-11-01T00:00" }]);
    expect(c.fields.vehicleApplicability).toMatchObject({ state: "INTERPRETED", value: { kind: "all_traffic" } });
    expect(gate(c).decision).toBe("ACTIVE");
  });
  it("an ACTIVE closure becomes a RESOLVED polyline constraint for the evaluator", () => {
    const c = byId("132923");
    const r = candidateToConstraint({ ...c, lifecycle: "NEW", firstSeenAt: FETCHED, lastSeenAt: FETCHED, gate: gate(c) } as CandidateConstraint, src, FETCHED)!;
    expect(r.geometry.status).toBe("RESOLVED");
    expect(r.constraint.kind).toBe("ROAD_CLOSURE");
    expect(r.constraint.when.activePeriods).toHaveLength(1);
  });
  it("daily windows are expanded into dated periods (publisher's own reading)", () => {
    const c = byId("133636"); // Rua do Mirante, 2026-09-22 → 2026-10-23, 08:00–17:00
    expect(c.fields.periods.state).toBe("INTERPRETED");
    expect(c.fields.periods.value).toHaveLength(32);
    expect(c.fields.periods.value![0]).toEqual({ start: "2026-09-22T08:00", end: "2026-09-22T17:00" });
  });
  it("long daily windows (≤ cap) are expanded; the cap is enforced", () => {
    const tunnel = byId("126658"); // Túnel da Av. João XXI, 2026-04-01 → 2027-01-31
    expect(tunnel.fields.periods.value!.length).toBeLessThanOrEqual(MAX_EXPANDED_DAYS);
    expect(tunnel.fields.periods.value!.length).toBe(306);
  });
  it("one-direction and intermittent closures go to review; narrowing / parking are informational", () => {
    const oneWay = out.candidates.find((c) => c.title.endsWith("Corte num sentido"))!;
    const intermittent = out.candidates.find((c) => c.title.endsWith("Cortes temporários"))!;
    expect(gate(oneWay).decision).toBe("REVIEW_REQUIRED");
    expect(gate(intermittent).decision).toBe("REVIEW_REQUIRED");
    const narrowing = out.candidates.filter((c) => c.title.endsWith("Estreitamento de via"));
    expect(narrowing.length).toBeGreaterThan(0);
    for (const c of narrowing) expect(gate(c).decision).toBe("INFORMATIONAL");
  });
  it("not JSON / no features ⇒ PARSE_ERROR, nothing invented", () => {
    expect(parseLisboaClosures(snapshot(src.id, "<html>erro</html>")).errors[0]!.kind).toBe("PARSE_ERROR");
    expect(parseLisboaClosures(snapshot(src.id, "{}")).candidates).toEqual([]);
  });
});

describe("Oeiras WFS condicionalismos (real snapshot, estado ≠ Concluído)", () => {
  const src = getSource("oeiras-wfs-condicionalismos")!;
  const out = parseOeirasWfs(snapshot(src.id, fixture("oeirasWfs.json"), FETCHED));

  it("parses every point, with publication time from ultima_atualizacao", () => {
    expect(out.errors).toEqual([]);
    expect(out.candidates).toHaveLength(68);
    expect(out.candidates.every((c) => c.fields.geometry.value?.kind === "point")).toBe(true);
    expect(out.publishedAtBasis).toMatch(/ultima_atualizacao/);
  });
  it("category is read from prose ⇒ INTERPRETED, and nothing becomes ACTIVE (points only)", () => {
    const f = assessFreshness(src, stateWith(src.id, out.publishedAt), NOW);
    for (const c of out.candidates) {
      expect(c.fields.category.state).toBe("INTERPRETED");
      expect(["REVIEW_REQUIRED", "INFORMATIONAL"]).toContain(applyTrustGate({ ...c, lifecycle: "NEW" }, src, f, NOW).decision);
    }
  });
  it("never carries the applicant (requerente) field", () => {
    expect(JSON.stringify(out.candidates)).not.toMatch(/requerente/i);
  });
});

describe("IP Alertas · Rodovia via JSON:API (real snapshot, 50 newest)", () => {
  const src = getSource("ip-alertas-jsonapi")!;
  const out = parseIpAlertasJsonapi(snapshot(src.id, fixture("ipAlertasJsonapi.json"), FETCHED));

  it("one candidate per road notice, keyed by the Drupal uuid", () => {
    expect(out.errors).toEqual([]);
    expect(out.candidates.length).toBeGreaterThan(40);
    expect(out.candidates.every((c) => /^[0-9a-f-]{36}$/.test(c.externalId))).toBe(true);
    expect(out.publishedAtBasis).toMatch(/changed/);
  });
  it("reads road, km range and dates from prose as INTERPRETED (EN4, Alcochete)", () => {
    const c = out.candidates.find((x) => x.title.startsWith("EN4: Estabilização do aterro"))!;
    expect(c.fields.roads).toMatchObject({ state: "INTERPRETED", value: ["EN4"] });
    expect(c.fields.locationText.value).toBe("EN4 km 19,900 a 20,400");
    expect(c.fields.validity.value).toEqual({ start: "2026-10-12T00:00:00.000Z", end: "2026-11-06T23:59:00.000Z" });
    expect(c.fields.category).toMatchObject({ state: "INTERPRETED", value: "LANE_CLOSURE" });
  });
  it("no notice ever becomes ACTIVE (prose only, no geometry)", () => {
    const f = assessFreshness(src, stateWith(src.id, out.publishedAt), NOW);
    const decisions = out.candidates.map((c) => applyTrustGate({ ...c, lifecycle: "NEW" }, src, f, NOW).decision);
    expect(decisions.filter((d) => d === "ACTIVE" || d === "ACTIVE_SCREENING_ONLY")).toEqual([]);
    expect(decisions).toContain("REVIEW_REQUIRED");
  });
});

describe("WordPress municipal notices (Póvoa de Lanhoso, real snapshot)", () => {
  const src = getSource("wp-povoa-de-lanhoso")!;
  const out = parseWpNotices(snapshot(src.id, fixture("wpPovoaDeLanhoso.json"), FETCHED));

  it("keeps traffic notices and skips news that only mention traffic", () => {
    expect(out.errors).toEqual([]);
    expect(out.recordCount).toBe(50);
    expect(out.candidates.length).toBeGreaterThan(5);
    expect(out.candidates.length).toBeLessThan(50);
    expect(out.candidates.some((c) => /Rua do Horto/.test(c.title))).toBe(true);
    expect(out.candidates.some((c) => /Semana Europeia da Mobilidade/.test(c.title))).toBe(false);
  });
  it("everything read from prose is INTERPRETED and nothing becomes ACTIVE", () => {
    const f = assessFreshness(src, stateWith(src.id, out.publishedAt), NOW);
    for (const c of out.candidates) {
      expect(c.fields.category.state).toBe("INTERPRETED");
      expect(c.fields.geometry.state).toBe("UNKNOWN");
      expect(["REVIEW_REQUIRED", "INFORMATIONAL"]).toContain(applyTrustGate({ ...c, lifecycle: "NEW" }, src, f, NOW).decision);
    }
  });
  it("a WordPress error object ⇒ PARSE_ERROR", () => {
    const e = parseWpNotices(snapshot(src.id, '{"code":"rest_no_route","message":"x"}'));
    expect(e.errors[0]!.message).toMatch(/rest_no_route/);
  });
});
