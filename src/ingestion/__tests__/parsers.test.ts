import { describe, expect, it } from "vitest";
import { assessFreshness } from "../freshness";
import { classifyLegalItem } from "../legalClassifier";
import { parseCkanPackage } from "../parsers/ckan";
import { parseDatex2 } from "../parsers/datex2";
import { parseDrRss } from "../parsers/drRss";
import { parseIpArcgis } from "../parsers/ipArcgis";
import { getSource, SOURCES, validateSources } from "../sources";
import { applyTrustGate } from "../trustGate";
import type { SourceState } from "../types";
import { fixture, snapshot, syntheticDatex } from "./helpers";

const NOW = new Date("2026-09-30T18:00:00Z");
const stateWith = (sourceId: string, publishedAt?: string): SourceState => ({
  sourceId, lastAttemptAt: NOW.toISOString(), lastSuccessAt: NOW.toISOString(), unchangedFetches: 0, ...(publishedAt ? { publishedAt, publishedAtBasis: "test" } : {}),
});

describe("source registry", () => {
  it("is internally valid", () => {
    expect(validateSources()).toEqual([]);
  });
  it("never registers the unlicensed Brisa/Via Verde endpoint or non-official hosts", () => {
    const urls = SOURCES.map((s) => JSON.stringify(s.access)).join(" ");
    expect(urls).not.toMatch(/brisa|viaverde|via-verde|openstreetmap|overpass/i);
  });
  it("rejects a proxy path outside the registered relays", () => {
    const bad = { ...SOURCES[3]!, id: "x", access: { kind: "SAME_ORIGIN_PROXY" as const, path: "/api/tomtom/anything", upstreamUrl: "https://example.com" } };
    expect(validateSources([bad])).toEqual(["x: proxy path outside the registered relays"]);
  });
});

describe("IP ArcGIS (real snapshot, 2026-09-30)", () => {
  const src = getSource("ip-arcgis-condicionamentos")!;
  const out = parseIpArcgis(snapshot(src.id, fixture("ipArcgisCondicionamentos.json")));

  it("parses every feature with per-field evidence", () => {
    expect(out.recordCount).toBe(95);
    expect(out.candidates).toHaveLength(95);
    expect(out.errors).toEqual([]);
    const c = out.candidates.find((x) => x.fields.roads.value?.[0] === "EN211")!;
    expect(c.fields.category).toMatchObject({ state: "VERIFIED", value: "ROADWORKS" });
    expect(c.fields.geometry.value?.kind).toBe("point");
    expect(c.fields.vehicleApplicability.state).toBe("UNKNOWN");
  });
  it("declares the newest observation as publication time: 2026-09-16 ⇒ STALE on 2026-09-30", () => {
    expect(out.publishedAt?.slice(0, 10)).toBe("2026-09-16");
    const f = assessFreshness(src, stateWith(src.id, out.publishedAt), NOW);
    expect(f.state).toBe("STALE");
  });
  it("no IP event becomes ACTIVE (points only, no vehicle applicability)", () => {
    const f = assessFreshness(src, stateWith(src.id, out.publishedAt), NOW);
    const gates = out.candidates.map((c) => applyTrustGate({ ...c, lifecycle: "NEW" }, src, f, NOW).decision);
    expect(gates.filter((g) => g === "ACTIVE" || g === "ACTIVE_SCREENING_ONLY")).toEqual([]);
  });
  it("prose mentioning a closure on a non-closure type ⇒ REVIEW_REQUIRED, not silently informational", () => {
    const nazare = out.candidates.find((c) => c.fields.description.value?.includes("Farol da Nazaré"))!;
    expect(nazare.issues.join(" ")).toMatch(/corte/);
    const f = assessFreshness(src, stateWith(src.id, out.publishedAt), NOW);
    expect(applyTrustGate({ ...nazare, lifecycle: "NEW" }, src, f, NOW).decision).toBe("REVIEW_REQUIRED");
  });
  it("identity survives a regenerated objectid", () => {
    const j = JSON.parse(fixture("ipArcgisCondicionamentos.json"));
    for (const f of j.features) f.attributes.objectid += 1000;
    const again = parseIpArcgis(snapshot(src.id, JSON.stringify(j)));
    expect(again.candidates.map((c) => c.id)).toEqual(out.candidates.map((c) => c.id));
    expect(again.candidates.map((c) => c.contentHash)).toEqual(out.candidates.map((c) => c.contentHash));
  });
  it("service error / not JSON ⇒ PARSE_ERROR, nothing invented", () => {
    expect(parseIpArcgis(snapshot(src.id, '{"error":{"code":498,"message":"Invalid token"}}')).errors[0]!.kind).toBe("PARSE_ERROR");
    expect(parseIpArcgis(snapshot(src.id, "<html>maintenance</html>")).candidates).toEqual([]);
  });
  it("other layers parse too (accidents, obstructions)", () => {
    expect(parseIpArcgis(snapshot("ip-arcgis-acidentes", fixture("ipArcgisAcidentes.json"))).candidates.every((c) => c.fields.category.value === "INCIDENT")).toBe(true);
    expect(parseIpArcgis(snapshot("ip-arcgis-ocorrencias", fixture("ipArcgisOutrasOcorrencias.json"))).recordCount).toBe(87);
  });
});

describe("Porto DATEX II (real snapshot subset)", () => {
  const src = getSource("porto-datex-programados")!;
  const out = parseDatex2(snapshot(src.id, fixture("portoDatexProgramados.xml")));

  it("parses situation records: roadworks and lane closures only (no roadClosed in the real feed)", () => {
    expect(out.recordCount).toBe(36);
    expect(out.errors).toEqual([]);
    const cats = new Set(out.candidates.map((c) => c.fields.category.value));
    expect([...cats].sort()).toEqual(["LANE_CLOSURE", "ROADWORKS"]);
    expect(out.candidates.every((c) => c.fields.geometry.value?.kind === "polygons")).toBe(true);
  });
  it("publication time has no zone ⇒ flagged; 2026-09-04 with biweekly cadence ⇒ STALE", () => {
    expect(out.publishedAtBasis).toMatch(/sem fuso/);
    expect(assessFreshness(src, stateWith(src.id, out.publishedAt), NOW).state).toBe("STALE");
  });
  it("detects the real conflict between comment («até 30/09/2026») and structured end (2026-09-29)", () => {
    const c = out.candidates.find((x) => x.externalId.endsWith("cmp904973"))!;
    expect(c.issues.join(" ")).toMatch(/Conflito: o comentário indica 2026-09-30, a validade estruturada termina em 2026-09-29/);
  });
  it("comment-only schedules (e.g. «09H00/17H00») are flagged, not parsed as a time rule", () => {
    const c = out.candidates.find((x) => /09H00\/17H00/.test(x.fields.description.value ?? ""))!;
    expect(c.issues.join(" ")).toMatch(/horário/);
    expect(c.fields.periods.state).toBe("UNKNOWN");
  });
  it("nothing from Porto is evaluated: works/lane closures are INFORMATIONAL", () => {
    const f = assessFreshness(src, stateWith(src.id, out.publishedAt), NOW);
    const d = new Set(out.candidates.map((c) => applyTrustGate({ ...c, lifecycle: "NEW" }, src, f, NOW).decision));
    expect([...d].every((x) => x === "INFORMATIONAL" || x === "REVIEW_REQUIRED")).toBe(true);
    expect(d.has("ACTIVE")).toBe(false);
  });
  it("empty unplanned feed ⇒ zero candidates, publication still read", () => {
    const e = parseDatex2(snapshot("porto-datex-nao-programados", fixture("portoDatexNaoProgramados.xml")));
    expect(e.candidates).toEqual([]);
    expect(e.publishedAt?.slice(0, 10)).toBe("2026-09-04");
  });
  it("non-DATEX payload ⇒ PARSE_ERROR", () => {
    expect(parseDatex2(snapshot(src.id, "<html><body>502 Bad Gateway</body></html>")).errors[0]!.kind).toBe("PARSE_ERROR");
  });
  it("record with unsupported location / broken posList keeps the record and reports the issue", () => {
    const xml = syntheticDatex({ publicationTime: "2026-09-30T10:00:00Z", records: [{ id: "bad", mgmt: "roadClosed", start: "2026-09-30T00:00:00Z", polygon: [[41, -8]] }] });
    const r = parseDatex2(snapshot(src.id, xml));
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.fields.geometry.state).toBe("UNKNOWN");
    expect(r.candidates[0]!.issues.join(" ")).toMatch(/posList inválida/);
  });
});

describe("CKAN metadata", () => {
  it("reads modification time, licence and declared frequency", () => {
    const r = parseCkanPackage(snapshot("porto-ckan-condicionamentos", fixture("portoCkanPackage.json")));
    expect(r.publishedAt?.slice(0, 10)).toBe("2026-09-04");
    expect(r.meta).toMatchObject({ license: "Creative Commons CCZero", frequency: "biweekly" });
  });
});

describe("Diário da República classification (index only)", () => {
  const out = parseDrRss(snapshot("dr-serie2-parte-h", fixture("drSerie2ParteH.xml")));
  it("parses today's items and dates the feed", () => {
    expect(out.legalItems.length).toBe(113);
    expect(out.publishedAt?.slice(0, 10)).toBe("2026-09-30");
    expect(out.candidates).toEqual([]);
  });
  it("driver recruitment notices are NOT relevant despite 'pesados'", () => {
    const nisa = out.legalItems.find((i) => /Nisa/.test(i.description))!;
    expect(nisa.relevance).toBe("NOT_RELEVANT");
  });
  it.each([
    ["Regulamento Municipal de Trânsito e Estacionamento do Município de X", "POTENTIALLY_RELEVANT"],
    ["Aprova as restrições à circulação de veículos pesados no centro histórico", "POTENTIALLY_RELEVANT"],
    ["Alteração da postura de trânsito — zona de cargas e descargas", "POTENTIALLY_RELEVANT"],
    ["Ocupação da via pública para obras na Estrada Municipal 501", "UNCERTAIN"],
    ["Regulamento Municipal Prémio Literário", "NOT_RELEVANT"],
  ])("%s ⇒ %s", (text, rel) => {
    const c = classifyLegalItem(text, "");
    expect(c.relevance).toBe(rel);
    if (rel === "POTENTIALLY_RELEVANT") expect(c.label).toBe("POTENTIALLY RELEVANT — REVIEW/EXTRACT");
  });
});
