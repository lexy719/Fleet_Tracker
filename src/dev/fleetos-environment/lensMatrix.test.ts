import { describe, expect, it } from "vitest";
import { changeGuidedState, guidedLayout, initialGuidedState, type GuidedLens, type GuidedState } from "./guidedWorkspace";
import { WORLD_JOBS } from "./world";

const LENSES: GuidedLens[] = ["Jobs", "Drivers", "Trucks", "Fuel", "Restrictions", "Documents"];
const front = (s: GuidedState) => (s.anchor.kind === "job" ? (s.lead ?? "Jobs") : (s.lead ?? (s.active.includes("Jobs") ? "Jobs" : null)));
const visible = (s: GuidedState) => {
  const l = guidedLayout(s, 1440, 900);
  return JSON.stringify([s.anchor, front(s), l.path, Object.keys(l.zones).sort(), l.map.visible]);
};

/** Every rail click, from every perspective, on every transport (and with stacked context). */
function starts(): { name: string; state: GuidedState }[] {
  const out: { name: string; state: GuidedState }[] = [];
  const op = initialGuidedState();
  out.push({ name: "operação", state: op });
  for (const l of LENSES) out.push({ name: `operação/${l}`, state: changeGuidedState(op, { type: "lens", domain: l }) });
  for (const job of WORLD_JOBS) {
    const base = changeGuidedState(op, { type: "job", id: job.id });
    out.push({ name: `${job.id}/visão`, state: base });
    for (const l of LENSES.filter((x) => x !== "Jobs")) {
      const one = changeGuidedState(base, { type: "lens", domain: l });
      out.push({ name: `${job.id}/${l}`, state: one });
      // Two lenses stacked: the second in front, the first as context.
      for (const m of LENSES.filter((x) => x !== "Jobs" && x !== l))
        out.push({ name: `${job.id}/${l}+${m}`, state: changeGuidedState(one, { type: "lens", domain: m }) });
    }
  }
  return out;
}

describe("rail · every lens click has a visible consequence", () => {
  const all = starts();
  it(`covers ${all.length} starting states × ${LENSES.length} lenses`, () => {
    const dead: string[] = [];
    for (const { name, state } of all)
      for (const l of LENSES) {
        const next = changeGuidedState(state, { type: "lens", domain: l });
        if (visible(next) === visible(state)) dead.push(`${name} → ${l}`);
      }
    expect(dead).toEqual([]);
  });
  it("the clicked lens comes to the front; clicking the front lens removes it", () => {
    for (const { name, state } of all) {
      if (state.anchor.kind !== "job") continue;
      for (const l of LENSES) {
        const next = changeGuidedState(state, { type: "lens", domain: l });
        if (front(state) === l) {
          if (l === "Jobs") expect(next.anchor.kind, name).toBe("jobs");
          else {
            expect(next.active, name).not.toContain(l);
            expect(front(next), name).not.toBe(l);
          }
        } else {
          expect(front(next), `${name} → ${l}`).toBe(l);
          // The previous perspective stays as context.
          if (front(state) !== "Jobs") expect(next.active, name).toContain(front(state));
        }
      }
    }
  });
  it("removing the front lens falls back to the most recent context lens", () => {
    let s = changeGuidedState(initialGuidedState(), { type: "job", id: "J-4217" });
    s = changeGuidedState(s, { type: "lens", domain: "Drivers" });
    s = changeGuidedState(s, { type: "lens", domain: "Documents" });
    s = changeGuidedState(s, { type: "lens", domain: "Trucks" });
    s = changeGuidedState(s, { type: "lens", domain: "Trucks" });
    expect(s.lead).toBe("Documents");
    s = changeGuidedState(s, { type: "lens", domain: "Documents" });
    expect(s.lead).toBe("Drivers");
    s = changeGuidedState(s, { type: "lens", domain: "Drivers" });
    expect(s.lead).toBeNull();
    s = changeGuidedState(s, { type: "lens", domain: "Jobs" });
    expect(s.anchor.kind).toBe("jobs");
  });
});
