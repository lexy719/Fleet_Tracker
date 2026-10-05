import { describe, expect, it } from "vitest";
import fixture from "../__fixtures__/tomtomLeixoesEspinho.json";
import { evaluateCompliance, summarizeStatus } from "../evaluate";
import { estimatePointTimes } from "../geometry";
import { REGULATION_DATASET } from "../repository";
import type { RegulationResult, Tri } from "../types";
import { at, closure, dataset, geometry, input, period, ROAD_A, ROAD_B, routeAlong } from "./helpers";

const GA = geometry("road-a", ROAD_A);
const GB = geometry("road-b", ROAD_B);
const NOON = at("2026-10-01T12:00:00+01:00");
const ACTIVE = [period("2026-10-01T00:00", "2026-10-02T00:00")];
const EXPIRED = [period("2026-09-01T00:00", "2026-09-02T00:00")];
/** Starts 5 min after the passage ⇒ UNKNOWN under ±15 min. */
const BOUNDARY = [period("2026-10-01T12:05", "2026-10-01T18:00")];

const onA = input(routeAlong(ROAD_A, NOON));
const outcomes = (r: ReturnType<typeof evaluateCompliance>) => Object.fromEntries(r.results.map((x) => [x.regulationId, x.outcome]));

describe("aggregation over several constraints on one route", () => {
  it("one AFFECTED + one not applicable ⇒ ROUTE_AFFECTED; both results kept", () => {
    const r = evaluateCompliance(dataset([closure("a", "road-a", { activePeriods: ACTIVE }), closure("b", "road-b", { activePeriods: ACTIVE })], [GA, GB]), onA);
    expect(r.status).toBe("ROUTE_AFFECTED");
    expect(outcomes(r)).toEqual({ a: "APPLIES", b: "DOES_NOT_APPLY" });
  });
  it("one UNKNOWN + one not applicable ⇒ POTENTIALLY_AFFECTED (never green)", () => {
    const r = evaluateCompliance(dataset([closure("a", "road-a", { activePeriods: BOUNDARY }), closure("b", "road-b", { activePeriods: ACTIVE })], [GA, GB]), onA);
    expect(r.status).toBe("POTENTIALLY_AFFECTED");
    expect(outcomes(r)).toEqual({ a: "UNKNOWN", b: "DOES_NOT_APPLY" });
  });
  it("one UNKNOWN + one AFFECTED ⇒ ROUTE_AFFECTED, and the UNKNOWN is still reported", () => {
    const r = evaluateCompliance(dataset([closure("a1", "road-a", { activePeriods: BOUNDARY }), closure("a2", "road-a", { activePeriods: ACTIVE })], [GA]), onA);
    expect(r.status).toBe("ROUTE_AFFECTED");
    expect(outcomes(r)).toEqual({ a1: "UNKNOWN", a2: "APPLIES" });
  });
  it("two AFFECTED ⇒ both APPLIES listed", () => {
    const r = evaluateCompliance(dataset([closure("a1", "road-a", { activePeriods: ACTIVE }), closure("a2", "road-a", { activePeriods: ACTIVE })], [GA]), onA);
    expect(r.status).toBe("ROUTE_AFFECTED");
    expect(Object.values(outcomes(r))).toEqual(["APPLIES", "APPLIES"]);
  });
  it("one expired + one active ⇒ only the active one applies", () => {
    const r = evaluateCompliance(dataset([closure("old", "road-a", { activePeriods: EXPIRED }), closure("now", "road-a", { activePeriods: ACTIVE })], [GA]), onA);
    expect(outcomes(r)).toEqual({ old: "DOES_NOT_APPLY", now: "APPLIES" });
  });
  it("one erroring constraint + one clear ⇒ EVALUATION_ERROR (never green)", () => {
    const bad = closure("bad", "road-a", { timeZone: "Nowhere/Zone", activePeriods: ACTIVE });
    const r = evaluateCompliance(dataset([bad, closure("b", "road-b", { activePeriods: ACTIVE })], [GA, GB]), onA);
    expect(r.status).toBe("EVALUATION_ERROR");
  });
  it("one erroring constraint + one AFFECTED ⇒ ROUTE_AFFECTED, error still present", () => {
    const bad = closure("bad", "road-a", { timeZone: "Nowhere/Zone", activePeriods: ACTIVE });
    const r = evaluateCompliance(dataset([bad, closure("a", "road-a", { activePeriods: ACTIVE })], [GA]), onA);
    expect(r.status).toBe("ROUTE_AFFECTED");
    expect(r.results.find((x) => x.regulationId === "bad")!.error).toBeTruthy();
  });
  it("constraint pointing to a missing geometry ⇒ UNKNOWN, not clear", () => {
    const r = evaluateCompliance(dataset([closure("ghost", "no-such-geometry", { activePeriods: ACTIVE })], [GA]), onA);
    expect(r.status).toBe("POTENTIALLY_AFFECTED");
  });
});

describe("real VCI + an additional closure on the same real route", () => {
  it("both constraints are evaluated and both reasons are available", () => {
    const vciGeom = REGULATION_DATASET.geometries.find((g) => g.id === "pt-vci-porto")!;
    const extra = closure("extra-closure-on-ring", "pt-vci-porto", { activePeriods: [period("2026-10-07T00:00", "2026-10-08T00:00")] });
    const ds = { ...REGULATION_DATASET, regulations: [...REGULATION_DATASET.regulations, extra], geometries: [...REGULATION_DATASET.geometries] };
    void vciGeom;
    const pts = fixture.original.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number]));
    const r = evaluateCompliance(ds, {
      route: { points: pts, pointTimesMs: estimatePointTimes(pts, fixture.original.legs.map((l) => l.points.length), fixture.original.legs.map((l) => l.travelTimeInSeconds), Date.parse("2026-10-07T09:00:00Z")), timesAreEstimates: true },
      stops: [],
      facts: {},
    });
    // VCI: vehicle facts missing ⇒ UNKNOWN; closure (all vehicles) ⇒ APPLIES.
    expect(r.status).toBe("ROUTE_AFFECTED");
    expect(outcomes(r)).toEqual({ "pt-dl155a2026-vci-pesados": "UNKNOWN", "extra-closure-on-ring": "APPLIES" });
  });
});

describe("aggregation invariant — every combination", () => {
  const values: (Tri | "ERROR")[] = ["APPLIES", "DOES_NOT_APPLY", "UNKNOWN", "ERROR"];
  const combos: (Tri | "ERROR")[][] = [];
  for (const a of values) for (const b of values) for (const c of values) combos.push([a, b, c]);
  it.each(combos)("%s / %s / %s", (...xs) => {
    const results = xs.map((x, i): RegulationResult => ({
      regulationId: `r${i}`, regulationVersion: 1, title: "", reasons: [], caveats: [], evidenceIds: [],
      outcome: x === "ERROR" ? "UNKNOWN" : x, error: x === "ERROR" ? "boom" : undefined,
    }));
    const s = summarizeStatus(results);
    // Green only if EVERY constraint is definitively not applicable.
    expect(s === "ROUTE_COMPLIANT").toBe(xs.every((x) => x === "DOES_NOT_APPLY"));
    // Any definitive violation dominates.
    if (xs.includes("APPLIES")) expect(s).toBe("ROUTE_AFFECTED");
    else if (xs.includes("ERROR")) expect(s).toBe("EVALUATION_ERROR");
    else if (xs.includes("UNKNOWN")) expect(s).toBe("POTENTIALLY_AFFECTED");
  });
  it("no constraints at all ⇒ compliant (nothing applies)", () => {
    expect(summarizeStatus([])).toBe("ROUTE_COMPLIANT");
  });
});
