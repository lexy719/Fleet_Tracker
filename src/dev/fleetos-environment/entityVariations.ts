import { ANCHOR_LENS, type EntityAnchorKind } from "./entityRecipes";
import { changeGuidedState, initialGuidedState, type GuidedLens, type GuidedState } from "./guidedWorkspace";

/** Finite inventory of supported content sets, not a claim about every data permutation. */
export const CORE_CONTENT: GuidedLens[] = ["Jobs", "Drivers", "Trucks", "Fuel", "Documents", "Restrictions"];
export const ENTITY_FIXTURES: [EntityAnchorKind, string, string][] = [
  ["driver", "D-14", "J-4217"], ["truck", "T-08", "J-4217"],
  ["trailer", "PT-3821", "J-4217"], ["document", "CMR-4217", "J-4217"],
  ["restriction", "RI-042", "J-4217"], ["stop", "F-07", "J-4217"],
];
export function entityVariations(): { name: string; state: GuidedState }[] {
  return ENTITY_FIXTURES.flatMap(([kind, id, job]) => {
    const base = ANCHOR_LENS[kind];
    const others = CORE_CONTENT.filter((l) => l !== base);
    return Array.from({ length: 1 << others.length }, (_, mask) => {
      const opened = changeGuidedState(initialGuidedState(), { type: "entity", kind, id, job });
      const normal = others.filter((_, bit) => mask & (1 << bit)).reduce(
        (state, domain) => changeGuidedState(state, { type: "content", domain }), opened,
      );
      return [false, true].map((mapFull) => ({
        name: `${kind}:${normal.active.join("+")}:${mapFull ? "spatial" : "normal"}`,
        state: mapFull ? changeGuidedState(normal, { type: "map", intent: "expand" }) : normal,
      }));
    }).flat();
  });
}
