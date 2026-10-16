import { describe, expect, it } from "vitest";
import { representedDomains } from "./entityComposition";
import { entityVariations } from "./entityVariations";
import { FACETS, changeGuidedState, guidedLayout, initialGuidedState, type Rect } from "./guidedWorkspace";
import { createSyntheticProvider } from "./engine/synthetic";
import { sceneIdentity } from "./sceneIdentity";
import { mergeWorkspace, workspaceKey } from "./workspaceTabs";
import { defaultSpatial, spatialGeometry, spatialLabel } from "./spatialQuestions";

const overlap = (a: Rect, b: Rect) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
describe("finite entity variation inventory", () => {
  const variations = entityVariations();
  it("covers all 32 content sets for each of six anchors in normal and spatial layouts", () => {
    expect(variations).toHaveLength(384);
    expect(new Set(variations.map((v) => v.name)).size).toBe(384);
  });
  it("retains every active domain, one lead, bounded non-overlapping regions across five widths", () => {
    for (const { name, state } of variations) for (const width of [1920, 1440, 1199, 900, 390]) {
      const l = guidedLayout(state, width, 900);
      const regions = l.regions!;
      const shown = representedDomains(regions);
      expect(state.active.filter((d) => !shown.has(d)), `${name} @${width} participation`).toEqual([]);
      expect(regions.filter((r) => r.role === "lead"), name).toHaveLength(1);
      const rects = [...regions.map((r) => r.rect), ...(l.map.visible ? [l.map] : [])];
      for (const r of rects) expect(r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x + r.width <= width + 1 && r.y + r.height <= 901, `${name} @${width} bounds`).toBe(true);
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j]), `${name} @${width} overlap ${i}/${j}`).toBe(false);
      if (width < 1000) expect(regions.every((r) => r.rect.width > 250), `${name} compact readable width`).toBe(true);
    }
  });
  it("facet changes retain anchor and content; removals have deterministic reduced composition keys", () => {
    for (const { state } of variations.filter((v) => !v.state.mapFull)) {
      for (const [domain, facets] of Object.entries(FACETS)) {
        if (!state.active.includes(domain as keyof typeof FACETS)) continue;
        for (const facet of facets) {
          const next = changeGuidedState(state, { type: "facet", domain: domain as keyof typeof FACETS, facet });
          expect(next.anchor).toEqual(state.anchor);
          expect(next.active).toEqual(state.active);
          const shown = representedDomains(guidedLayout(next, 1440, 900).regions!);
          expect(next.active.filter((d) => !shown.has(d))).toEqual([]);
        }
      }
      for (const domain of state.active.slice(1)) {
        const before = structuredClone(state);
        const next = mergeWorkspace(state, domain);
        expect(next.active).toEqual(state.active.filter((d) => d !== domain));
        expect(workspaceKey(next)).not.toBe(workspaceKey(state));
        expect(state).toEqual(before);
      }
    }
  });
  it("missing resources are absent nodes and unassigned scene identities never borrow J-4217", () => {
    const p = createSyntheticProvider(initialGuidedState());
    expect(p.entity({ kind: "driver", id: "D-missing" })).toBeNull();
    expect(p.entity({ kind: "truck", id: "T-missing" })).toBeNull();
    const free = changeGuidedState(initialGuidedState(), { type: "entity", kind: "driver", id: "D-40", job: null });
    expect(sceneIdentity("driver-day", free)).toBe("driver:D-40");
    expect(sceneIdentity("vehicle-card", free)).not.toContain("T-08");
    for (const state of [free, changeGuidedState(free, { type: "entity", kind: "truck", id: "T-missing", job: "J-4217" }), changeGuidedState(free, { type: "entity", kind: "truck", id: "T-08", job: "J-missing" })]) {
      const expanded = changeGuidedState(state, { type: "map", intent: "expand" });
      expect(defaultSpatial(expanded).question).toBe("NONE");
      expect(spatialGeometry(expanded).scene.routes).toEqual([]);
      expect(spatialGeometry(expanded).scene.driver).toBeNull();
      expect(spatialLabel(expanded).title).toBe("Geografia indisponível");
    }
    const truck = changeGuidedState(initialGuidedState(), { type: "entity", kind: "truck", id: "T-08", job: "J-4217" });
    const withoutJob = { ...truck, anchor: { kind: "truck" as const, id: "T-08", job: null } };
    expect(sceneIdentity("vehicle-object", withoutJob)).toBe(sceneIdentity("vehicle-card", truck));
  });
});
