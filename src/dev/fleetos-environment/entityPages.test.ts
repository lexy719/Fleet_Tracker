import { describe, expect, it } from "vitest";
import {
  changeGuidedState,
  guidedLayout,
  initialGuidedState,
  type GuidedAction,
  type GuidedLens,
  type GuidedState,
} from "./guidedWorkspace";
import { ENTITY_KINDS, type EntityAnchorKind } from "./entityRecipes";

const open = (
  kind: EntityAnchorKind,
  id: string,
  job: string | null,
): GuidedState =>
  changeGuidedState(initialGuidedState(), { type: "entity", kind, id, job });
const lens = (s: GuidedState, ...ls: GuidedLens[]) =>
  ls.reduce(
    (x, l) => changeGuidedState(x, { type: "lens", domain: l } as GuidedAction),
    s,
  );
const sig = (s: GuidedState) => {
  const l = guidedLayout(s, 1440, 900);
  return `${l.recipe}|${(l.regions ?? []).map((r) => r.rep).join(",")}|${l.map.visible}`;
};
const ENTITIES: [EntityAnchorKind, string, string | null][] = [
  ["driver", "D-14", "J-4217"],
  ["truck", "T-08", "J-4217"],
  ["trailer", "PT-3821", "J-4217"],
  ["document", "CMR-4217", "J-4217"],
  ["restriction", "RI-042", "J-4217"],
  ["stop", "F-07", "J-4217"],
];

describe("5.7L · every entity has its own page, and layers recompose it", () => {
  it("each entity kind opens a different composition", () => {
    const sigs = ENTITIES.map(
      ([k, id, job]) => guidedLayout(open(k, id, job), 1440, 900).recipe,
    );
    expect(new Set(sigs).size).toBe(ENTITY_KINDS.length);
  });
  it("the opened object is the selection its instruments read", () => {
    expect(open("restriction", "RI-058", "J-4217").selection.restriction).toBe(
      "RI-058",
    );
    expect(open("document", "CMR-4218", "J-4218").selection.document).toBe(
      "CMR-4218",
    );
    expect(open("stop", "F-03", "J-4217").selection.fuel).toBe("F-03");
  });
  it("documents expel the map; restrictions and stops ask a geographic question", () => {
    expect(
      guidedLayout(open("document", "CMR-4217", "J-4217"), 1440, 900).map
        .visible,
    ).toBe(false);
    expect(
      guidedLayout(open("restriction", "RI-042", "J-4217"), 1440, 900).map
        .visible,
    ).toBe(true);
    expect(
      guidedLayout(open("stop", "F-07", "J-4217"), 1440, 900).map.visible,
    ).toBe(true);
    // A free trailer has no position: no map rather than an invented one.
    expect(
      guidedLayout(open("trailer", "PT-1021", null), 1440, 900).map.visible,
    ).toBe(false);
  });
  it("single added layers change each entity composition", () => {
    const LAYERS: GuidedLens[] = [
      "Drivers",
      "Trucks",
      "Restrictions",
      "Documents",
      "Fuel",
      "Jobs",
    ];
    for (const [k, id, job] of ENTITIES) {
      const base = open(k, id, job);
      const seen = new Set<string>([sig(base)]);
      for (const l of LAYERS) {
        const next = lens(base, l);
        // Every click changes something visible (or returns to the collection for the base lens).
        expect(
          sig(next) !== sig(base) ||
            next.anchor.kind === "jobs" ||
            next.active.length !== base.active.length,
          `${k} + ${l}`,
        ).toBe(true);
        seen.add(sig(next));
      }
      expect(seen.size, k).toBeGreaterThan(2);
    }
  });
  it("restriction relationships form shared passage work instead of another domain's lead page", () => {
    const r = open("restriction", "RI-042", "J-4217");
    const lead = (s: GuidedState) =>
      guidedLayout(s, 1440, 900).regions!.find((x) => x.role === "lead")!.rep;
    expect([
      lead(r),
      lead(lens(r, "Trucks")),
      lead(lens(r, "Drivers")),
      lead(lens(r, "Jobs")),
    ]).toEqual([
      "restriction-full",
      "shared-work",
      "shared-work",
      "shared-work",
    ]);
    for (const domain of ["Trucks", "Drivers", "Jobs"] as const) {
      const layout = guidedLayout(lens(r, domain), 1440, 900);
      expect(layout.composition.shared?.domains).toContain(domain);
      expect(layout.composition.primary).toBeNull();
    }
  });
});
