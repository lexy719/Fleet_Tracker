import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  evaluateCompliance,
  evaluateRegulation,
  triAnd,
  triNot,
  triOr,
} from "../evaluate";
import { REGULATION_DATASET, validateDataset } from "../repository";
import { buildTransportFacts } from "../fleetFacts";
import { demoJobs, demoTrucks } from "../../data/mockData";
import {
  acceptanceFixture,
  fixtureRoute,
  FIXTURE_DEPART,
} from "../../domain/routing/acceptanceFixtures";
import {
  decideRoutes,
  type DecisionCandidate,
} from "../../domain/routing/routeDecision";
import { operationalTimeline } from "../operationalTimeline";
import { createComplianceRecord } from "../decisionRecord";
import { assessPlannedJob } from "../reevaluate";
import { DEFAULT_TIMING_MODEL } from "../timeline";
import { makeJob, makeTruck } from "../../domain/__tests__/fixtures";
import { closure, dataset, geometry, ROAD_A, routeAlong, EV } from "./helpers";
import type {
  Condition,
  EvaluationInput,
  FactSet,
  RegulationRecord,
} from "../types";

const fact = (
  id: string,
  value: number | boolean | string = true,
  op: "eq" | "gt" | "gte" = "eq",
): Condition => ({
  kind: "fact",
  fact: id,
  value,
  op,
  label: id,
  evidence: [EV],
});
const known = (value: number | boolean | string) => ({
  status: "known" as const,
  value,
  source: "recorded test evidence",
});
const route = routeAlong(ROAD_A, "2026-10-07T10:00:00+01:00");
const exception = (
  id = "permit",
  condition = fact(id),
): RegulationRecord["exceptions"][number] => ({
  id,
  label: id,
  condition,
  evidence: [EV],
});
const reg = (extra: Partial<RegulationRecord> = {}) =>
  closure(
    "general",
    "A",
    {},
    { appliesTo: fact("hgv"), exceptions: [exception()], ...extra },
  );
const run = (
  rule = reg(),
  facts: FactSet = { hgv: known(true) },
  g = geometry("A", ROAD_A),
) =>
  evaluateRegulation(rule, dataset([rule], [g]), { route, facts, stops: [] });
const vci = REGULATION_DATASET.regulations[0]!;
const vciCase = acceptanceFixture("VCI: isenções por demonstrar");
const vciOption = vciCase.candidates[0]!.option;
const vciFacts: FactSet = {
  "vehicle.grossWeightKg": known(26000),
  "vehicle.axleCount": known(5),
  "vehicle.firstAxleHeightM": known(1.4),
  "vehicle.isGoodsVehicle": known(true),
};
const vciInput = (
  iso = "2026-10-07T09:00:00Z",
  facts = vciFacts,
): EvaluationInput => ({
  route: operationalTimeline(vciOption, Date.parse(iso)).routeInput,
  facts,
  stops: [],
});

function decisions(
  rules: RegulationRecord[],
  facts: FactSet,
): ReturnType<typeof decideRoutes> {
  const ds = dataset(rules, [geometry("A", ROAD_A)]);
  const option = fixtureRoute("candidate");
  const c: DecisionCandidate = {
    option,
    report: evaluateCompliance(ds, { route, facts, stops: [] }),
    elapsedSec: 42 * 60,
    window: "no_window",
    criticalHours: false,
    coverageComplete: false,
    provenance: ["synthetic domain fixture"],
  };
  return decideRoutes([c]);
}

describe("5.6D — stored VCI rule, same evaluator and route decisions", () => {
  it("reproduces the old exception negation defect and proves the corrected outcome", () => {
    expect(
      triAnd([
        "APPLIES",
        "APPLIES",
        triNot(triOr(["UNKNOWN", "UNKNOWN", "UNKNOWN"])),
      ]),
    ).toBe("UNKNOWN");
    const r = evaluateRegulation(vci, REGULATION_DATASET, vciInput());
    expect(r.outcome).toBe("APPLIES");
    expect(r.applicability?.base.outcome).toBe("APPLIES");
    expect(r.applicability?.exceptions.every((e) => !e.confirmed)).toBe(true);
    expect(r.applicability?.reasonCodes).toContain("EXEMPTION_FACT_UNKNOWN");
    expect(r.evidenceIds).toContain("pt-dl155a2026-art2-3");
    expect(r.exposure?.fromIso).toBeTruthy();
    expect(vciCase.result.excluded[0]?.routeId).toBe("VCI");
    expect(vciCase.result.decisions.map((d) => d.routeId)).toEqual(["Desvio"]);
  });
  it.each(["2026-10-07T22:00:00Z", "2026-10-11T09:00:00Z"])(
    "outside hours / Sunday does not apply: %s",
    (iso) => {
      expect(
        evaluateRegulation(vci, REGULATION_DATASET, vciInput(iso)).outcome,
      ).toBe("DOES_NOT_APPLY");
    },
  );
  it("holiday and ETA boundary remain genuinely unknown", () => {
    for (const iso of ["2026-10-05T09:00:00Z", "2026-10-07T05:50:00Z"])
      expect(
        evaluateRegulation(vci, REGULATION_DATASET, vciInput(iso)).outcome,
      ).toBe("UNKNOWN");
  });
  it("a recorded IMT permit exempts and preserves matched base reasoning", () => {
    const r = evaluateRegulation(
      vci,
      REGULATION_DATASET,
      vciInput(undefined, {
        ...vciFacts,
        "authorization.pt-imt-aet": known(true),
      }),
    );
    expect(r.outcome).toBe("DOES_NOT_APPLY");
    expect(r.applicability?.base.outcome).toBe("APPLIES");
    expect(
      r.applicability?.exceptions.find((e) => e.id === "aet-imt")?.confirmed,
    ).toBe(true);
    expect(r.reasons.some((r) => r.code === "EXEMPTION_CONFIRMED")).toBe(true);
    expect(r.evidenceIds).toContain("pt-dl155a2026-art2-4b");
    expect(r.evidenceIds).toContain("pt-dl155a2026-art2-3");
  });
  it.each([
    "vehicle.grossWeightKg",
    "vehicle.axleCount",
    "vehicle.firstAxleHeightM",
    "vehicle.isGoodsVehicle",
  ])("required base fact %s remains unknown", (id) => {
    const facts = { ...vciFacts };
    delete facts[id];
    const r = evaluateRegulation(
      vci,
      REGULATION_DATASET,
      vciInput(undefined, facts),
    );
    expect(r.outcome).toBe("UNKNOWN");
    expect(r.applicability?.base.outcome).toBe("UNKNOWN");
    expect(
      r.applicability?.base.predicates.find((p) => p.factId === id)?.outcome,
    ).toBe("UNKNOWN");
  });
  it("the actual demo Volvo facts are insufficient to establish the VCI vehicle definition", () => {
    const job = demoJobs.find((j) => j.id === "J-4198")!,
      truck = demoTrucks.find((t) => t.id === "t1")!;
    const facts = buildTransportFacts(truck, job);
    expect(facts["vehicle.axleCount"]?.status).toBe("unknown");
    expect(
      evaluateRegulation(vci, REGULATION_DATASET, vciInput(undefined, facts))
        .outcome,
    ).toBe("UNKNOWN");
    expect(
      acceptanceFixture("VCI: base por confirmar").candidates[0]?.report
        ?.status,
    ).toBe("POTENTIALLY_AFFECTED");
  });
  it("curated counter-rules retain valid authoritative evidence references", () => {
    expect(validateDataset(REGULATION_DATASET)).toEqual([]);
    expect(
      vci.exceptions.every(
        (e) =>
          e.proof === "affirmative" &&
          e.evidence.every((id) =>
            vci.evidence.some(
              (v) => v.id === id && v.verification === "VERIFIED",
            ),
          ),
      ),
    ).toBe(true);
  });
});

describe("generic base facts and affirmative exemptions", () => {
  it.each([
    undefined,
    { status: "unknown" as const, reason: "not recorded" },
    known(false),
  ])("no affirmative permit does not suspend the base: %j", (permit) => {
    const facts: FactSet = { hgv: known(true) };
    if (permit) facts.permit = permit;
    const before = JSON.stringify(facts),
      r = run(reg(), facts);
    expect(r.outcome).toBe("APPLIES");
    expect(JSON.stringify(facts)).toBe(before);
    expect(r.applicability?.exceptions[0]?.outcome).toBe(
      permit?.status === "known" ? "DOES_NOT_APPLY" : "UNKNOWN",
    );
  });
  it("positive permit evidence is needed and correctly exempts", () => {
    expect(run(reg(), { hgv: known(true), permit: known(true) }).outcome).toBe(
      "DOES_NOT_APPLY",
    );
  });
  it("unknown mandatory class stays unknown even when an exemption is confirmed", () => {
    const r = run(reg(), { permit: known(true) });
    expect(r.outcome).toBe("UNKNOWN");
    expect(r.applicability?.base.outcome).toBe("UNKNOWN");
  });
  it("a failed base predicate is definitive with other base and exemption facts missing", () => {
    expect(
      run(
        reg({
          appliesTo: {
            kind: "all",
            of: [fact("hgv"), fact("weight", 3500, "gt")],
          },
        }),
        { hgv: known(false) },
      ).outcome,
    ).toBe("DOES_NOT_APPLY");
  });
  it.each(["weight", "height", "width", "length"])(
    "%s threshold remains generic and unknown without required measurements",
    (id) => {
      const r = reg({ appliesTo: fact(id, 3, "gt") });
      expect(run(r, { [id]: known(4) }).outcome).toBe("APPLIES");
      expect(run(r, { [id]: known(2) }).outcome).toBe("DOES_NOT_APPLY");
      expect(run(r, {}).outcome).toBe("UNKNOWN");
    },
  );
  it("numeric ranges prove only predicates they fully satisfy", () => {
    const r = reg({ appliesTo: fact("weight", 3500, "gt") });
    expect(
      run(r, { weight: { status: "range", min: 4000, source: "cargo" } })
        .outcome,
    ).toBe("APPLIES");
    expect(
      run(r, {
        weight: { status: "range", min: 2000, max: 5000, source: "uncertain" },
      }).outcome,
    ).toBe("UNKNOWN");
  });
  it("ADR applies / does not apply / unknown stay separate", () => {
    const r = reg({ appliesTo: fact("adr") });
    expect(run(r, { adr: known(true) }).outcome).toBe("APPLIES");
    expect(run(r, { adr: known(false) }).outcome).toBe("DOES_NOT_APPLY");
    expect(run(r, {}).outcome).toBe("UNKNOWN");
  });
  it.each(["resident", "local_access", "service", "delivery", "vehicle_class"])(
    "%s exception needs a recorded positive fact",
    (id) => {
      const r = reg({ exceptions: [exception(id)] });
      expect(run(r, { hgv: known(true) }).outcome).toBe("APPLIES");
      expect(run(r, { hgv: known(true), [id]: known(true) }).outcome).toBe(
        "DOES_NOT_APPLY",
      );
    },
  );
  it("a municipal delivery exemption needs both area membership and permit", () => {
    const rule = reg({
      exceptions: [
        exception("local", {
          kind: "all",
          of: [
            {
              kind: "stopInArea",
              areaId: "municipality",
              stops: "destination",
              stopTypes: ["delivery"],
              label: "delivery inside zone",
              evidence: [EV],
            },
            fact("permit"),
          ],
        }),
      ],
    });
    const ds = {
      ...dataset([rule], [geometry("A", ROAD_A)]),
      areas: [
        {
          id: "municipality",
          label: "synthetic zone",
          status: "RESOLVED" as const,
          evidence: [EV],
        },
      ],
    };
    const evalAt = (inside?: boolean, permit?: boolean) =>
      evaluateRegulation(rule, ds, {
        route,
        facts: {
          hgv: known(true),
          ...(permit !== undefined ? { permit: known(permit) } : {}),
        },
        stops: [
          {
            id: "s",
            lat: ROAD_A[0][0],
            lng: ROAD_A[0][1],
            type: "delivery",
            areas: inside === undefined ? {} : { municipality: known(inside) },
          },
        ],
      });
    expect(evalAt().outcome).toBe("APPLIES");
    expect(evalAt(true).outcome).toBe("APPLIES");
    expect(evalAt(true, true).outcome).toBe("DOES_NOT_APPLY");
    expect(evalAt(false, true).outcome).toBe("APPLIES");
  });
  it("AND/OR exemptions cannot acquire truth from unknown subconditions", () => {
    for (const kind of ["all", "any"] as const) {
      const rule = reg({
        exceptions: [
          exception("compound", {
            kind,
            of: [fact("permit"), fact("resident")],
          }),
        ],
      });
      expect(run(rule, { hgv: known(true) }).outcome).toBe("APPLIES");
      expect(run(rule, { hgv: known(true), permit: known(true) }).outcome).toBe(
        kind === "any" ? "DOES_NOT_APPLY" : "APPLIES",
      );
    }
  });
  it("negated conditions retain their leaf meaning and cannot negate an unknown into proof", () => {
    const r = reg({
      exceptions: [
        exception("non-commercial", { kind: "not", of: fact("commercial") }),
      ],
    });
    expect(run(r, { hgv: known(true) }).outcome).toBe("APPLIES");
    const exempt = run(r, { hgv: known(true), commercial: known(false) });
    expect(exempt.outcome).toBe("DOES_NOT_APPLY");
    expect(exempt.applicability?.exceptions[0]?.predicates[0]?.negated).toBe(
      true,
    );
  });
  it("vacuous exemption predicates do not supply affirmative evidence", () => {
    const r = run(
      reg({ exceptions: [exception("empty", { kind: "all", of: [] })] }),
    );
    expect(r.outcome).toBe("APPLIES");
    expect(r.applicability?.exceptions[0]?.confirmed).toBe(false);
  });
  it.each(["INTERPRETED", "UNVERIFIED"] as const)(
    "legal %s is genuinely uncertain",
    (legalStatus) => {
      expect(run(reg({ legalStatus })).outcome).toBe("UNKNOWN");
    },
  );
  it("an explicitly indeterminate exception classification stays unknown, even with its fact recorded", () => {
    for (const facts of [
      { hgv: known(true) },
      { hgv: known(true), permit: known(true) },
    ] as FactSet[]) {
      const r = run(
        reg({ exceptions: [{ ...exception(), proof: "indeterminate" }] }),
        facts,
      );
      expect(r.outcome).toBe("UNKNOWN");
      expect(r.applicability?.reasonCodes).toContain("LEGAL_SEMANTICS_UNKNOWN");
    }
  });
  it("uncited or unverified legal exemption evidence cannot manufacture exemption certainty", () => {
    const uncited = reg({ exceptions: [{ ...exception(), evidence: [] }] });
    const unverified = reg({
      evidence: [{ ...reg().evidence[0]!, verification: "UNVERIFIED" }],
    });
    for (const rule of [uncited, unverified])
      expect(run(rule, { hgv: known(true), permit: known(true) }).outcome).toBe(
        "UNKNOWN",
      );
  });
  it("direction is still determined by the mapped directed geometry", () => {
    const r = reg(),
      g = geometry("A", ROAD_A, { directional: true }),
      ds = dataset([r], [g]);
    expect(
      evaluateRegulation(r, ds, {
        route,
        facts: { hgv: known(true) },
        stops: [],
      }).outcome,
    ).toBe("APPLIES");
    expect(
      evaluateRegulation(r, ds, {
        route: routeAlong(ROAD_A, "2026-10-07T10:00:00+01:00", 60, true),
        facts: { hgv: known(true) },
        stops: [],
      }).outcome,
    ).toBe("DOES_NOT_APPLY");
    expect(
      run(r, { hgv: known(true) }, { ...g, status: "UNRESOLVED" }).outcome,
    ).toBe("UNKNOWN");
  });
});

describe("route exclusions and confirmed review use the same semantics", () => {
  it.each(["exempt", "unknown", "advisory"])(
    "restriction A %s never defeats mandatory B",
    (kind) => {
      const a = reg({
        id: "A",
        appliesTo: fact("a"),
        exceptions: kind === "exempt" ? [exception("permitA")] : [],
        ...(kind === "advisory"
          ? { kind: "OPERATIONAL_IMPACT", effect: "advisory" }
          : {}),
      });
      const b = reg({
        id: "B",
        title: "B",
        exceptions: [exception("permitB")],
      });
      const facts: FactSet = {
        hgv: known(true),
        permitA: known(true),
        ...(kind !== "unknown" ? { a: known(true) } : {}),
      };
      const result = decisions([a, b], facts);
      expect(result.decisions).toEqual([]);
      expect(result.excludedCandidateCount).toBe(1);
      expect(result.excluded[0]?.reasons).toContain("B");
      expect(result.decisionStatus).toBe("NO_EXECUTABLE_ROUTE");
    },
  );
  it("advisory alone remains executable without invented duration", () => {
    const r = reg({ effect: "advisory", kind: "OPERATIONAL_IMPACT" }),
      result = decisions([r], { hgv: known(true) });
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.elapsedSec).toBe(42 * 60);
  });
  it("unknown base remains potentially affected and is never upgraded to applies", () => {
    const result = decisions([reg()], {});
    expect(result.decisions[0]?.report?.status).toBe("POTENTIALLY_AFFECTED");
    expect(result.excludedCandidateCount).toBe(0);
  });
  it("every selectable decision excludes mandatory APPLIES and preserves excluded diagnostics", () => {
    const result = decisions([reg()], { hgv: known(true) });
    expect(result.decisions).toEqual([]);
    expect(result.excluded[0]).toMatchObject({
      routeId: "candidate",
      reasons: ["general"],
      provenance: ["synthetic domain fixture"],
    });
  });
  it("saved historical reasoning remains immutable when the accepted exception semantics are corrected", () => {
    const option = fixtureRoute("saved"),
      job = {
        ...makeJob(),
        status: "in_transit" as const,
        plannedDepartureAt: new Date(FIXTURE_DEPART).toISOString(),
      },
      truck = makeTruck();
    const oldRule = reg({
        exceptions: [{ ...exception(), proof: "indeterminate" }],
      }),
      oldDs = {
        ...dataset([oldRule], [geometry("A", ROAD_A)]),
        version: "old",
      };
    const liveInput = {
      route: operationalTimeline(option, FIXTURE_DEPART).routeInput,
      facts: { hgv: known(true) },
      stops: [],
    };
    const oldReport = evaluateCompliance(oldDs, liveInput);
    expect(oldReport.status).toBe("POTENTIALLY_AFFECTED");
    job.routeCompliance = createComplianceRecord({
      job,
      truck,
      dataset: oldDs,
      option,
      title: "saved",
      departAt: new Date(FIXTURE_DEPART),
      liveInput,
      evaluationOptions: {
        timeToleranceMin: 15,
        sampleStepMin: 5,
        timing: DEFAULT_TIMING_MODEL,
      },
      liveReport: oldReport,
      followsOfficialAlternatives: [],
    })!;
    expect(job.routeCompliance).toBeTruthy();
    const before = JSON.stringify(job),
      fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const state = assessPlannedJob(job, truck, {
        ...dataset([reg()], [geometry("A", ROAD_A)]),
        version: "new",
      });
      expect(state.state).toBe("CURRENT");
      if (state.state === "CURRENT") {
        expect(state.reevaluation.current.status).toBe("ROUTE_AFFECTED");
        expect(state.reevaluation.previousStatus).toBe("POTENTIALLY_AFFECTED");
      }
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(JSON.stringify(job)).toBe(before);
      expect(job.routeCompliance.report.status).toBe("POTENTIALLY_AFFECTED");
    } finally {
      fetchSpy.mockRestore();
    }
  });
  it("confirmation refuses an applicable base without exemption proof", () => {
    const option = fixtureRoute("invalid"),
      job = makeJob(),
      truck = makeTruck(),
      ds = dataset([reg()], [geometry("A", ROAD_A)]);
    const liveInput = {
      route: operationalTimeline(option, FIXTURE_DEPART).routeInput,
      facts: { hgv: known(true) },
      stops: [],
    };
    expect(
      createComplianceRecord({
        job,
        truck,
        dataset: ds,
        option,
        title: "invalid",
        departAt: new Date(FIXTURE_DEPART),
        liveInput,
        evaluationOptions: { timeToleranceMin: 15, sampleStepMin: 5 },
        liveReport: evaluateCompliance(ds, liveInput),
        followsOfficialAlternatives: [],
      }),
    ).toBeNull();
  });
  it("production evaluator and combiner have no VCI/Porto/job/route special branch", () => {
    for (const path of [
      "src/regulations/evaluate.ts",
      "src/regulations/applicability.ts",
      "src/domain/routing/routeDecision.ts",
    ]) {
      expect(readFileSync(path, "utf8")).not.toMatch(
        /VCI|Porto|J-4198|Amadora|pt-vci|pt-dl155a/,
      );
    }
  });
});
