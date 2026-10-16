import { describe, it, expect } from "vitest";
import {
  initialLivingState,
  enterFocus,
  leaveFocus,
  snapshotLiving,
} from "./livingEnvironment";
import { initialTopology, applyTopology } from "./representationEngine";
import { DOMAIN_LIBRARY, dataShape } from "./representationLibrary";
import {
  synthesize,
  generateCandidates,
  CANDIDATE_BUDGET,
  scoreComposition,
  captureRetained,
} from "./liquidSynthesis";
import { runSynthesisStress } from "./synthesisStress";
import { INITIAL_CAMERA } from "./composition";
import { createWorkspaceSpace } from "./workspaceGeometry";
const size = { width: 1440, height: 900 },
  space = createWorkspaceSpace(size, [], 24);
const state = () => {
  const s = { ...initialLivingState(), topology: initialTopology() };
  s.surfaces = s.surfaces.map((d) => ({
    ...d,
    enabled: ["Jobs", "Drivers", "Fuel"].includes(d.id),
  }));
  return s;
};
describe("liquid synthesis contracts", () => {
  it("provides fifteen distinct grammars per domain and a bounded deterministic design search", () => {
    for (const families of Object.values(DOMAIN_LIBRARY)) {
      expect(families).toHaveLength(15);
      expect(new Set(families.map((f) => f.form)).size).toBe(15);
      expect(new Set(families.map((f) => f.id)).size).toBe(15);
    }
    const s = state(),
      candidates = generateCandidates(s);
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.length).toBeLessThanOrEqual(CANDIDATE_BUDGET);
    expect(synthesize(s, size, space)).toEqual(synthesize(s, size, space));
  });
  it("data shape and semantic priorities produce distinct topologies for the same active contexts", () => {
    const signatures = new Set<string>();
    for (const actor of ["Jobs", "Drivers", "Fuel", "map"] as const)
      for (const intent of [
        "overview",
        "dispatch",
        "compare",
        "relations",
      ] as const) {
        let s = applyTopology(state(), { type: "CONTENT_FOCUS", actor });
        s = applyTopology(s, { type: "INTENT", intent });
        s = applyTopology(s, {
          type: "DATA_SHAPE",
          actor: "Jobs",
          values: {
            count: intent === "dispatch" ? 30 : 3,
            urgency: 0.8,
            selected: intent === "relations" ? "DEMO-J01" : null,
          },
        });
        signatures.add(synthesize(s, size, space).synthesis!.topologySignature);
      }
    expect(signatures.size).toBeGreaterThan(8);
  });
  it("focus changes facts/priority while preserving user geometry and real history", () => {
    const before = state();
    before.variables.mapX = 0.31;
    before.variables.mapHeight = 0.57;
    const focused = enterFocus(before, "Drivers", INITIAL_CAMERA);
    expect(focused.variables.mapX).toBe(0.31);
    expect(focused.variables.mapHeight).toBe(0.57);
    expect(focused.topology!.primary).toBe("Drivers");
    expect(snapshotLiving(leaveFocus(focused))).toEqual(snapshotLiving(before));
    const visible = synthesize(focused, size, space).representations.filter(
      (d) => d.bounds,
    );
    expect(
      visible.every((d) => d.actor === "Drivers" || d.actor === "map"),
    ).toBe(true);
    expect(visible.find((d) => d.actor === "Drivers")?.form).not.toBe(
      "indicator",
    );
  });
  it("quality scoring penalizes excess empty space, repeated morphology and movement", () => {
    const s = state(),
      model = synthesize(s, size, space),
      quality = scoreComposition(model, s);
    expect(quality.accepted).toBe(true);
    expect(model.utilizationRatio).toBeGreaterThan(0.5);
    const empty = { ...model, accidentalFreeRatio: 0.9, utilizationRatio: 0.1 };
    expect(scoreComposition(empty, s).score).toBeLessThan(quality.score);
    const outside = structuredClone(model);
    outside.representations.find((d) => d.bounds)!.bounds!.x = -500;
    expect(scoreComposition(outside, s).rejection).toContain(
      "outside-workspace",
    );
  });
  it("selected entities survive morphing and merge/split without mutating their facts", () => {
    let s = applyTopology(state(), {
      type: "DATA_SHAPE",
      actor: "Jobs",
      values: { selected: "DEMO-J02", count: 30 },
    });
    const facts = dataShape("Jobs", s.topology!.facts?.Jobs);
    s = applyTopology(s, { type: "MORPH", actor: "Jobs", form: "timeline" });
    s = applyTopology(s, { type: "MERGE", actors: ["Jobs", "Fuel"] });
    s = applyTopology(s, { type: "SPLIT", actor: "Jobs" });
    expect(s.topology!.facts!.Jobs).toEqual(facts);
    expect(s.topology!.autoMerge).toBe(false);
  });
  it("adding a context retains existing forms/geometry and map overlay restores exact history", () => {
    const before = state();
    before.surfaces = before.surfaces.map((s) => ({
      ...s,
      enabled: s.id === "Fuel" || s.id === "Drivers",
    }));
    before.variables.mapWidth = 0.38;
    before.variables.mapHeight = 0.65;
    const original = synthesize(before, size, space),
      retained = captureRetained(original)!;
    expect(Object.keys(retained).length).toBe(2);
    const added = {
      ...before,
      topology: { ...before.topology!, retained },
      surfaces: before.surfaces.map((s) => ({
        ...s,
        enabled: s.enabled || s.id === "Jobs",
      })),
    };
    const next = synthesize(added, size, space);
    for (const actor of ["Fuel", "Drivers"]) {
      const a = original.representations.find((d) => d.actor === actor)!,
        b = next.representations.find((d) => d.actor === actor)!;
      expect(b.form).toBe(a.form);
      for (const key of ["x", "y", "width", "height"] as const)
        expect(b.bounds![key]).toBeCloseTo(a.bounds![key], 8);
    }
    const full = applyTopology(added, { type: "MAP_OVERLAY", actor: "Jobs" }),
      overlay = synthesize(full, size, space);
    expect(
      overlay.representations
        .filter((d) => d.bounds)
        .map((d) => d.actor)
        .sort(),
    ).toEqual(["Jobs", "map"]);
    expect(overlay.representations.find((d) => d.actor === "Jobs")?.layer).toBe(
      "overlay",
    );
    expect(overlay.map.width).toBe(space.viewportBounds.width);
    expect(added.topology!.retained).toEqual(retained);
  });
  it("bounded stress has broad diversity, multiple map regions and no invalid winning geometry", () => {
    const report = runSynthesisStress(128);
    expect(report.topologies).toBeGreaterThan(90);
    expect(report.geometries).toBeGreaterThan(90);
    expect(report.representations).toBeGreaterThan(40);
    expect(report.sameSetTopologies).toBeGreaterThan(15);
    expect(Object.keys(report.mapRegions).length).toBeGreaterThan(4);
    expect(report.invalidWinners).toBe(0);
    expect(report.candidateCount).toBeLessThanOrEqual(128 * CANDIDATE_BUDGET);
  });
});
