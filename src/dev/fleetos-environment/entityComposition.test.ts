import { describe, expect, it } from "vitest";
import {
  changeGuidedState,
  guidedLayout,
  initialGuidedState,
  type GuidedAction,
  type GuidedState,
} from "./guidedWorkspace";
import { createSyntheticProvider } from "./engine/synthetic";

const steps: [string, GuidedAction][] = [
  ["Motoristas", { type: "lens", domain: "Drivers" }],
  ["Miguel", { type: "entity", kind: "driver", id: "D-14", job: "J-4217" }],
  ["+ Viatura", { type: "lens", domain: "Trucks" }],
  ["+ Restrições", { type: "lens", domain: "Restrictions" }],
  ["− Viatura", { type: "lens", domain: "Trucks" }],
  ["Camião", { type: "entity", kind: "truck", id: "T-08", job: "J-4217" }],
  ["Mapa dominante", { type: "map", intent: "expand" }],
];
function run() {
  const states: GuidedState[] = [];
  let s = initialGuidedState();
  for (const [, a] of steps) states.push((s = changeGuidedState(s, a)));
  return states;
}
const shape = (s: GuidedState) => {
  const l = guidedLayout(s, 1440, 900);
  return {
    recipe: l.recipe ?? l.path,
    domains: l.composition.shared?.domains ?? s.active,
    reps: (l.regions ?? []).map((r) => `${r.id}:${r.rep}`).join(","),
    map: l.map.visible
      ? `${Math.round(l.map.width)}x${Math.round(l.map.height)}`
      : "hidden",
    lead:
      (l.regions ?? []).find((r) => r.role === "lead")?.rep ??
      l.composition.primary,
  };
};

describe("5.7L · the whole composition changes at every step of the flow", () => {
  const states = run();
  it("each step changes the shared question or its participating domains", () => {
    const shapes = states.map(shape);
    for (let i = 1; i < shapes.length; i++)
      expect(shapes[i], steps[i][0]).not.toEqual(shapes[i - 1]);
    expect(shapes.slice(1).map((x) => x.recipe)).toEqual([
      "DRIVER_DAY",
      "shared-matching",
      "shared-journey",
      "shared-journey",
      "shared-journey",
      "shared-journey",
    ]);
    // The lead representation itself changes, not just the number of boxes.
    expect(shapes.slice(1).map((x) => x.lead)).toEqual([
      "driver-day",
      "shared-work",
      "shared-work",
      "shared-work",
      "shared-work",
      "shared-work",
    ]);
  });
  it("keeps the route connected while changing the map's working proportion", () => {
    const maps = states.slice(1).map((s) => guidedLayout(s, 1440, 900).map);
    expect(maps.map((m) => m.visible)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(maps[0].width).toBeLessThan(500);
    expect(maps[3].width).toBeGreaterThan(450);
    // The map stays dominant while the combined content keeps a readable inspector.
    expect(maps[5].width).toBeGreaterThan(1440 * 0.55);
  });
  it("layers keep their order and the previous base becomes a layer of the new entity", () => {
    expect(states[3].active).toEqual(["Drivers", "Trucks", "Restrictions"]);
    expect(states[4].active).toEqual(["Drivers", "Restrictions"]);
    expect(states[5].anchor).toEqual({
      kind: "truck",
      id: "T-08",
      job: "J-4217",
    });
    expect(states[5].active).toEqual(["Trucks", "Drivers", "Restrictions"]);
  });
  it("the base lens of an entity returns to its collection with the layers", () => {
    const back = changeGuidedState(states[3], {
      type: "lens",
      domain: "Drivers",
    });
    expect(back.anchor.kind).toBe("jobs");
    expect(back.lead).toBe("Drivers");
    expect(back.active).toEqual(["Drivers", "Trucks", "Restrictions"]);
  });
});

describe("5.7L · DEV world adapter speaks the operational contracts", () => {
  const p = createSyntheticProvider(initialGuidedState());
  it("resource assignment, timeline and future state use the production envelopes", () => {
    expect(p.getResourceAssignment("J-4217")).toMatchObject({
      status: "CURRENT",
      assignment: { driverId: "D-14", truckId: "T-08" },
    });
    expect(p.getResourceAssignment("J-4222").issues).toContain(
      "TRAILER_MISSING",
    );
    const t = p.getOperationalTimeline("J-4217");
    expect(t.status).toBe("READY");
    expect(t.timeline!.stops.at(-1)!.arrival.status).toBe("KNOWN");
    expect(t.timeline!.spellLimit).toMatchObject({
      status: "KNOWN",
      source: "simulated",
    });
    expect(p.getResourceFutureState().drivers["D-40"].position.status).toBe(
      "UNKNOWN",
    );
  });
  it("restriction impact is tri-state and never «pass» on a missing fact", () => {
    const vci = p.getRestrictionImpact("J-4217", "RI-042");
    expect(vci.status).toBe("UNKNOWN");
    expect(vci.missingFacts).toContain("vehicle.firstAxleHeightM");
    expect(vci.passage).toMatchObject({ status: "KNOWN" });
  });
  it("route alternatives never invent a duration", () => {
    const alts = p.getRouteAlternatives("J-4217").alternatives;
    expect(alts.map((a) => a.intent)).toEqual([
      "fastest",
      "no_tolls",
      "restriction_avoiding",
    ]);
    expect(alts.every((a) => a.durationSec.status === "UNKNOWN")).toBe(true);
  });
  it("the graph links an entity to its transport and resources", () => {
    expect(p.currentJob({ kind: "driver", id: "D-14" })).toBe("J-4217");
    expect(
      p.related({ kind: "driver", id: "D-14" }).map((n) => n.ref.kind),
    ).toEqual([
      "job",
      "truck",
      "document",
      "stop",
      "restriction",
      "restriction",
      "restriction",
    ]);
    expect(p.list("driver").length).toBe(8);
  });
});
