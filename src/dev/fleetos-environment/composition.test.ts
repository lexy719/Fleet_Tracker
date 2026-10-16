import { describe, expect, it } from "vitest";
import {
  BASE_VARIABLES,
  chooseIntent,
  composeWorkspace,
  nextSeed,
  randomComposition,
  stressComposition,
  type SemanticIntent,
} from "./composition";

describe("continuous composition constraints", () => {
  it.each([
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1024, height: 768 },
    { width: 320, height: 480 },
  ])(
    "contains 500 conflicting variable combinations at $width × $height",
    (size) => {
      let seed = 42;
      for (let index = 0; index < 500; index++) {
        seed = nextSeed(seed);
        const variables =
          index % 2
            ? randomComposition(seed, BASE_VARIABLES)
            : stressComposition(index, BASE_VARIABLES);
        if (index % 11 === 0)
          Object.assign(variables, {
            reservedLeft: 0.45,
            reservedRight: 0.45,
            reservedTop: 0.45,
            reservedBottom: 0.45,
            pressureLeft: 1,
            pressureRight: 1,
            pressureTop: 1,
            pressureBottom: 1,
          });
        const { map, frame } = composeWorkspace("BALANCED", variables, size);
        expect(map.width).toBeGreaterThanOrEqual(
          Math.min(240, frame.width) - 0.001,
        );
        expect(map.height).toBeGreaterThanOrEqual(
          Math.min(180, frame.height) - 0.001,
        );
        expect(map.x).toBeGreaterThanOrEqual(frame.x - 0.001);
        expect(map.y).toBeGreaterThanOrEqual(frame.y - 0.001);
        expect(map.x + map.width).toBeLessThanOrEqual(
          frame.x + frame.width + 0.001,
        );
        expect(map.y + map.height).toBeLessThanOrEqual(
          frame.y + frame.height + 0.001,
        );
      }
    },
  );
  it("supports semantic intent without turning camera or domain data into layout state", () => {
    for (const intent of [
      "JOB_FOCUS",
      "DRIVER_FOCUS",
      "FUEL_CONTEXT",
      "DOCUMENT_TAKEOVER",
    ] as SemanticIntent[]) {
      const variables = chooseIntent(intent, { ...BASE_VARIABLES });
      const base = composeWorkspace(intent, variables, {
        width: 1440,
        height: 900,
      });
      const changed = composeWorkspace(
        intent,
        { ...variables, mapWidth: 0.3, mapX: 0.72, dominance: 0 },
        { width: 1440, height: 900 },
      );
      expect(changed.map.width).not.toBe(base.map.width);
      expect(changed.map.x).not.toBe(base.map.x);
      expect(changed.map.visible).toBe(intent !== "DOCUMENT_TAKEOVER");
    }
  });
  it("keeps sub-pixel parameter changes continuous away from constraints", () => {
    const first = composeWorkspace(
      "BALANCED",
      { ...BASE_VARIABLES },
      { width: 1440, height: 900 },
    );
    const second = composeWorkspace(
      "BALANCED",
      { ...BASE_VARIABLES, mapX: 0.5001, mapWidth: 0.6201 },
      { width: 1440, height: 900 },
    );
    expect(Math.abs(second.map.width - first.map.width)).toBeGreaterThan(0);
    expect(Math.abs(second.map.width - first.map.width)).toBeLessThan(1);
    expect(Math.abs(second.map.x - first.map.x)).toBeLessThan(1);
  });
});
