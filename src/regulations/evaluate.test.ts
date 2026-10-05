import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/tomtomLeixoesEspinho.json";
import { easterSunday, localParts, matchCalendar } from "./calendar";
import { evaluateCompliance, evaluateRegulation, triAnd, triNot, triOr } from "./evaluate";
import { estimatePointTimes } from "./geometry";
import { PT_NATIONAL_MANDATORY_HOLIDAYS } from "./portugal/seededRestrictions";
import { REGULATION_DATASET, validateDataset } from "./repository";
import type { EvaluationInput, FactSet, RegulationDataset, RouteStopInput } from "./types";

const VCI_ID = "pt-dl155a2026-vci-pesados";
const vci = REGULATION_DATASET.regulations.find((r) => r.id === VCI_ID)!;

/* ─── Real TomTom routes (Routing API v1, retrieved 2026-09-30) ─── */

type FixtureRoute = { legs: { travelTimeInSeconds: number; points: number[][] }[] };

/** Build an evaluation route from a recorded TomTom response, departing at `departIso`. */
function tomtomRoute(r: FixtureRoute, departIso: string): EvaluationInput["route"] {
  const points = r.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number]));
  return {
    points,
    pointTimesMs: estimatePointTimes(
      points,
      r.legs.map((l) => l.points.length),
      r.legs.map((l) => l.travelTimeInSeconds),
      Date.parse(departIso),
    ),
    timesAreEstimates: true,
  };
}

const ORIGINAL = fixture.original as FixtureRoute;
const AVOIDING = fixture.avoidAreas as FixtureRoute;

/** Lisbon → Setúbal (far outside). */
const LISBON_ROUTE: [number, number][] = [
  [38.72, -9.14],
  [38.6, -9.0],
  [38.52, -8.89],
];

function route(points: [number, number][], startIso: string, minutesBetween = 10): EvaluationInput["route"] {
  const t0 = Date.parse(startIso);
  return { points, pointTimesMs: points.map((_, i) => t0 + i * minutesBetween * 60_000), timesAreEstimates: true };
}

/** Everything the VCI rule needs, except what a test removes. */
const FULL_FACTS: FactSet = {
  "vehicle.grossWeightKg": { status: "known", value: 26_000, source: "test" },
  "vehicle.axleCount": { status: "known", value: 5, source: "test" },
  "vehicle.firstAxleHeightM": { status: "known", value: 1.4, source: "test" },
  "vehicle.isGoodsVehicle": { status: "known", value: true, source: "test" },
  "vehicle.ownerCategory": { status: "known", value: "private", source: "test" },
  "authorization.pt-vci-habilitacao": { status: "known", value: false, source: "test" },
  "authorization.pt-imt-aet": { status: "known", value: false, source: "test" },
};

const STOPS_OUTSIDE_PORTO_GAIA: RouteStopInput[] = [
  { id: "s1", type: "pickup", lat: 41.185, lng: -8.696 },
  { id: "s2", type: "delivery", lat: 41.007, lng: -8.641 },
].map((s) => ({
  ...(s as RouteStopInput),
  areas: {
    "pt-municipio-porto": { status: "known", value: false, source: "test" },
    "pt-municipio-vila-nova-de-gaia": { status: "known", value: false, source: "test" },
  },
}));

const WED_10H = "2026-10-07T09:00:00Z"; // Wednesday 10:00 Europe/Lisbon

/* ─── Synthetic geometry — only for unit-testing generic engine behaviour ─── */

const SYNTH_ROUTE: [number, number][] = [
  [41.185, -8.696],
  [41.16, -8.64],
  [41.16, -8.6],
  [41.007, -8.641],
];

function syntheticDataset(verification: "INTERPRETED" | "UNVERIFIED" = "INTERPRETED"): RegulationDataset {
  return {
    ...REGULATION_DATASET,
    geometries: REGULATION_DATASET.geometries.map((g) =>
      g.id === vci.location.geometryId
        ? {
            ...g,
            status: "RESOLVED",
            resolved: {
              kind: "polylines",
              lines: [[[41.16, -8.625], [41.16, -8.615]]],
              toleranceM: 30,
              minMatchLengthM: 200,
              maxHeadingDiffDeg: 30,
              verification,
              mappingMethod: "synthetic test fixture",
              evidence: ["pt-dl155a2026-art1a"],
            },
          }
        : g,
    ),
  };
}

describe("three-valued logic", () => {
  it("AND / OR / NOT propagate UNKNOWN safely", () => {
    expect(triAnd(["APPLIES", "UNKNOWN"])).toBe("UNKNOWN");
    expect(triAnd(["UNKNOWN", "DOES_NOT_APPLY"])).toBe("DOES_NOT_APPLY");
    expect(triAnd(["APPLIES", "APPLIES"])).toBe("APPLIES");
    expect(triOr(["DOES_NOT_APPLY", "UNKNOWN"])).toBe("UNKNOWN");
    expect(triOr(["UNKNOWN", "APPLIES"])).toBe("APPLIES");
    expect(triNot("UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("calendar", () => {
  it("computes Western Easter", () => {
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 });
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 });
  });

  it("matches fixed and Easter-relative national holidays (CT art. 234.º)", () => {
    expect(matchCalendar(PT_NATIONAL_MANDATORY_HOLIDAYS, 2026, 10, 5)).toContain("5 de outubro");
    expect(matchCalendar(PT_NATIONAL_MANDATORY_HOLIDAYS, 2026, 4, 3)).toContain("Sexta-Feira Santa");
    expect(matchCalendar(PT_NATIONAL_MANDATORY_HOLIDAYS, 2026, 6, 4)).toContain("Corpo de Deus");
    expect(matchCalendar(PT_NATIONAL_MANDATORY_HOLIDAYS, 2026, 10, 7)).toBeNull();
  });

  it("reads local civil time in Europe/Lisbon across DST", () => {
    expect(localParts(Date.parse("2026-10-07T09:00:00Z"), "Europe/Lisbon")).toMatchObject({ minutes: 600, weekday: 3 });
    expect(localParts(Date.parse("2026-12-02T10:00:00Z"), "Europe/Lisbon")).toMatchObject({ minutes: 600, weekday: 3 });
  });
});

describe("generic evaluator — missing facts never become a match", () => {
  const ds = syntheticDataset();
  const input = (facts: FactSet): EvaluationInput => ({ route: route(SYNTH_ROUTE, WED_10H), stops: STOPS_OUTSIDE_PORTO_GAIA, facts });

  it("26 t, 5 axles, goods vehicle, first-axle height UNKNOWN ⇒ UNKNOWN, not APPLIES", () => {
    const facts = { ...FULL_FACTS, "vehicle.firstAxleHeightM": { status: "unknown", reason: "not measured" } } as FactSet;
    const r = evaluateRegulation(vci, ds, input(facts));
    expect(r.outcome).toBe("UNKNOWN");
    expect(r.reasons.map((x) => x.text).join("\n")).toMatch(/primeiro eixo: valor desconhecid/);
  });

  it("an absent fact key is UNKNOWN", () => {
    const facts = { ...FULL_FACTS };
    delete facts["authorization.pt-imt-aet"];
    expect(evaluateRegulation(vci, ds, input(facts)).outcome).toBe("UNKNOWN");
  });

  it("a known non-matching fact decides DOES_NOT_APPLY even when others are unknown", () => {
    const facts = {
      ...FULL_FACTS,
      "vehicle.axleCount": { status: "known", value: 2, source: "test" },
      "vehicle.firstAxleHeightM": { status: "unknown", reason: "x" },
    } as FactSet;
    expect(evaluateRegulation(vci, ds, input(facts)).outcome).toBe("DOES_NOT_APPLY");
  });

  it("range facts decide only when the whole range agrees", () => {
    const withRange = (min: number) =>
      ({ ...FULL_FACTS, "vehicle.grossWeightKg": { status: "range", min, source: "≥ cargo" } }) as FactSet;
    expect(evaluateRegulation(vci, ds, input(withRange(24_800))).outcome).toBe("APPLIES");
    expect(evaluateRegulation(vci, ds, input(withRange(0))).outcome).toBe("UNKNOWN");
  });

  it("an exception that holds lifts the restriction", () => {
    const facts = { ...FULL_FACTS, "authorization.pt-imt-aet": { status: "known", value: true, source: "test" } } as FactSet;
    const r = evaluateRegulation(vci, ds, input(facts));
    expect(r.outcome).toBe("DOES_NOT_APPLY");
    expect(r.reasons.some((x) => x.text.includes("Exceção aplicável"))).toBe(true);
  });

  it("an unverified legal rule can never produce APPLIES", () => {
    const unverified = { ...vci, legalStatus: "UNVERIFIED" as const };
    expect(evaluateRegulation(unverified, ds, input(FULL_FACTS)).outcome).toBe("UNKNOWN");
  });

  it("geometry whose mapping is UNVERIFIED is never used to decide", () => {
    const r = evaluateRegulation(vci, syntheticDataset("UNVERIFIED"), input(FULL_FACTS));
    expect(r.outcome).toBe("UNKNOWN");
  });

  it("ETA near the 21h00 boundary ⇒ UNKNOWN (timing tolerance)", () => {
    const r = evaluateRegulation(vci, ds, {
      route: route(SYNTH_ROUTE, "2026-10-07T19:40:00Z"), // on the line ~20:50–21:00 Lisbon
      stops: STOPS_OUTSIDE_PORTO_GAIA,
      facts: FULL_FACTS,
    });
    expect(r.outcome).toBe("UNKNOWN");
    expect(r.reasons.some((x) => x.kind === "timing")).toBe(true);
  });
});

describe("seeded VCI record on REAL TomTom geometry (Leixões → Espinho)", () => {
  const run = (r: FixtureRoute, departIso: string, facts: FactSet = FULL_FACTS, stops = STOPS_OUTSIDE_PORTO_GAIA) =>
    evaluateRegulation(vci, REGULATION_DATASET, { route: tomtomRoute(r, departIso), stops, facts });

  it("original route on a Wednesday 10:00 ⇒ APPLIES / ROUTE_AFFECTED, with exposure and reasons", () => {
    const r = run(ORIGINAL, WED_10H);
    expect(r.outcome).toBe("APPLIES");
    expect(r.exposure!.lengthM).toBeGreaterThan(5_000);
    expect(r.exposure!.lengthM).toBeLessThan(9_000);
    const text = r.reasons.map((x) => x.text).join("\n");
    expect(text).toMatch(/segue VCI/);
    expect(text).toMatch(/Passagem estimada quarta-feira 2026-10-07, 10:/);
    expect(text).toMatch(/Exceção não aplicável/);
    const report = evaluateCompliance(REGULATION_DATASET, { route: tomtomRoute(ORIGINAL, WED_10H), stops: STOPS_OUTSIDE_PORTO_GAIA, facts: FULL_FACTS });
    expect(report.status).toBe("ROUTE_AFFECTED");
  });

  it("route returned by TomTom with avoidAreas does not use the VCI ⇒ DOES_NOT_APPLY", () => {
    const r = run(AVOIDING, WED_10H);
    expect(r.outcome).toBe("DOES_NOT_APPLY");
    expect(r.reasons[0]!.text).toMatch(/não passa em VCI/);
  });

  it("same original route at 22:40 ⇒ DOES_NOT_APPLY (outside restricted period)", () => {
    expect(run(ORIGINAL, "2026-10-07T21:40:00Z").outcome).toBe("DOES_NOT_APPLY");
  });

  it("Sunday ⇒ DOES_NOT_APPLY", () => {
    expect(run(ORIGINAL, "2026-10-11T09:00:00Z").outcome).toBe("DOES_NOT_APPLY");
  });

  it("national holiday on a weekday ⇒ UNKNOWN with a calendar reason", () => {
    const r = run(ORIGINAL, "2026-10-05T09:00:00Z");
    expect(r.outcome).toBe("UNKNOWN");
    expect(r.reasons.some((x) => x.kind === "calendar")).toBe(true);
  });

  it("before entry into force (15 Sep 2026) ⇒ DOES_NOT_APPLY", () => {
    expect(run(ORIGINAL, "2026-09-10T09:00:00Z").outcome).toBe("DOES_NOT_APPLY");
  });

  it("first-axle height unknown ⇒ UNKNOWN, never APPLIES", () => {
    const facts = { ...FULL_FACTS, "vehicle.firstAxleHeightM": { status: "unknown", reason: "x" } } as FactSet;
    expect(run(ORIGINAL, WED_10H, facts).outcome).toBe("UNKNOWN");
  });

  it("loading in Porto with habilitação recorded ⇒ exception holds", () => {
    const stops = STOPS_OUTSIDE_PORTO_GAIA.map((s, i) =>
      i === 0 ? { ...s, areas: { ...s.areas, "pt-municipio-porto": { status: "known", value: true, source: "test" } } } : s,
    ) as RouteStopInput[];
    const facts = { ...FULL_FACTS, "authorization.pt-vci-habilitacao": { status: "known", value: true, source: "test" } } as FactSet;
    expect(run(ORIGINAL, WED_10H, facts, stops).outcome).toBe("DOES_NOT_APPLY");
  });

  it("route that never enters the screening area ⇒ DOES_NOT_APPLY", () => {
    const r = evaluateRegulation(vci, REGULATION_DATASET, { route: route(LISBON_ROUTE, WED_10H), stops: STOPS_OUTSIDE_PORTO_GAIA, facts: FULL_FACTS });
    expect(r.outcome).toBe("DOES_NOT_APPLY");
  });

  it("no route geometry (estimate mode) ⇒ UNKNOWN during restricted hours", () => {
    const t0 = Date.parse(WED_10H);
    const r = evaluateRegulation(vci, REGULATION_DATASET, {
      route: { points: [], pointTimesMs: [], timesAreEstimates: true, tripWindowMs: [t0, t0 + 3_600_000] },
      stops: STOPS_OUTSIDE_PORTO_GAIA,
      facts: FULL_FACTS,
    });
    expect(r.outcome).toBe("UNKNOWN");
  });
});

describe("dataset integrity & provenance", () => {
  it("all references resolve", () => {
    expect(validateDataset(REGULATION_DATASET)).toEqual([]);
  });

  it("VCI geometry is RESOLVED with an INTERPRETED (not VERIFIED) mapping", () => {
    const g = REGULATION_DATASET.geometries.find((x) => x.id === vci.location.geometryId)!;
    expect(g.status).toBe("RESOLVED");
    expect(g.resolved!.verification).toBe("INTERPRETED");
    const ev = g.resolved!.evidence.map((id) => vci.evidence.find((e) => e.id === id)!);
    expect(ev.map((e) => e.verification).sort()).toEqual(["INTERPRETED", "UNVERIFIED", "VERIFIED", "VERIFIED"]);
  });

  it("screening area and CREP geometry are labelled UNVERIFIED", () => {
    const g = REGULATION_DATASET.geometries.find((x) => x.id === vci.location.geometryId)!;
    for (const id of g.screeningArea!.evidence) expect(vci.evidence.find((e) => e.id === id)!.verification).toBe("UNVERIFIED");
    const crep = REGULATION_DATASET.geometries.find((x) => x.id === "pt-crep-a41")!;
    expect(crep.resolved!.verification).toBe("UNVERIFIED");
  });

  it("the official alternative is backed by VERIFIED authority evidence", () => {
    const alt = vci.officialAlternatives![0]!;
    const ev = alt.evidence.map((id) => vci.evidence.find((e) => e.id === id)!);
    expect(ev.every((e) => e.verification === "VERIFIED")).toBe(true);
  });

  it("every VERIFIED evidence item carries a locator and a verbatim quote", () => {
    for (const e of vci.evidence.filter((x) => x.verification === "VERIFIED")) {
      expect(e.locator, e.id).toBeTruthy();
      expect(e.quote, e.id).toBeTruthy();
    }
  });
});

describe("estimatePointTimes", () => {
  it("spreads each leg's duration by distance and chains legs", () => {
    const pts: [number, number][] = [[0, 0], [0, 1], [0, 2], [0, 3]];
    const times = estimatePointTimes(pts, [2, 2], [100, 50], 0);
    expect(times[0]).toBe(0);
    expect(times[1]).toBeCloseTo(100_000);
    expect(times[2]).toBe(100_000);
    expect(times[3]).toBeCloseTo(150_000);
  });
});
