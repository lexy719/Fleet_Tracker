import { describe, expect, it } from "vitest";
import { changeGuidedState, guidedLayout, initialGuidedState, mainLens, type GuidedLens, type GuidedState } from "./guidedWorkspace";

const LENSES: GuidedLens[] = ["Jobs", "Drivers", "Trucks", "Fuel", "Restrictions", "Documents"];
const content = (s: GuidedState, d: GuidedLens) => changeGuidedState(s, { type: "content", domain: d });
const main = (s: GuidedState, d: GuidedLens) => changeGuidedState(s, { type: "main", domain: d });
const visible = (s: GuidedState) => {
  const l = guidedLayout(s, 1440, 900);
  return JSON.stringify([s.anchor, mainLens(s), [...s.active].sort(), l.path, l.recipe ?? "", (l.regions ?? []).map((r) => r.rep), Object.keys(l.zones).sort(), l.map.visible]);
};

function starts() {
  const out: [string, GuidedState][] = [["operação", initialGuidedState()]];
  for (const d of LENSES) {
    const one = content(initialGuidedState(), d);
    out.push([`op ${d}`, one]);
    for (const e of LENSES.filter((x) => x !== d)) out.push([`op ${d}+${e}`, content(one, e)]);
  }
  for (const j of ["J-4217", "J-4219", "J-4222"]) {
    const job = changeGuidedState(initialGuidedState(), { type: "job", id: j });
    out.push([j, job]);
    for (const d of LENSES.filter((x) => x !== "Jobs")) {
      out.push([`${j} +${d}`, content(job, d)]);
      out.push([`${j} main ${d}`, main(job, d)]);
    }
  }
  for (const [k, id] of [["driver", "D-14"], ["truck", "T-08"], ["restriction", "RI-042"], ["document", "CMR-4217"]] as const) {
    const e = changeGuidedState(initialGuidedState(), { type: "entity", kind: k, id, job: "J-4217" });
    out.push([k, e]);
    out.push([`${k} +Drivers+Restrictions`, content(content(e, "Drivers"), "Restrictions")]);
  }
  return out;
}

describe("rail · two states: content (on/off) and main (perspective)", () => {
  const all = starts();
  it("a content click switches only that lens and never silently changes the main lens", () => {
    for (const [name, s] of all)
      for (const d of LENSES) {
        const n = content(s, d);
        const wasOn = s.active.includes(d) || mainLens(s) === d;
        if (!wasOn) {
          expect(n.active.includes(d) || mainLens(n) === d, `${name} +${d}`).toBe(true);
          // The main lens stays, unless there was none.
          if (mainLens(s)) expect(mainLens(n), `${name} +${d}`).toBe(mainLens(s));
        } else if (mainLens(s) !== d) {
          expect(n.active.includes(d), `${name} −${d}`).toBe(false);
          expect(mainLens(n), `${name} −${d}`).toBe(mainLens(s));
        }
      }
  });
  it("a main click changes the perspective (or opens the related entity) and keeps content on", () => {
    for (const [name, s] of all)
      for (const d of LENSES) {
        if (mainLens(s) === d) continue;
        const n = main(s, d);
        expect(visible(n), `${name} ◉${d}`).not.toBe(visible(s));
        if (s.anchor.kind !== "driver" && s.anchor.kind !== "truck" && s.anchor.kind !== "restriction" && s.anchor.kind !== "document")
          expect(mainLens(n), `${name} ◉${d}`).toBe(d);
      }
  });
  it("every content click has a visible consequence", () => {
    const dead: string[] = [];
    for (const [name, s] of all)
      for (const d of LENSES) if (visible(content(s, d)) === visible(s)) dead.push(`${name} → ${d}`);
    expect(dead).toEqual([]);
  });
  it("Transportes then Motorista keeps transports as the main and adds the driver as content", () => {
    let s = content(initialGuidedState(), "Jobs");
    s = content(s, "Drivers");
    expect(mainLens(s)).toBe("Jobs");
    expect(s.active).toEqual(["Jobs", "Drivers"]);
    s = main(s, "Drivers");
    expect(mainLens(s)).toBe("Drivers");
    expect(s.active).toEqual(["Drivers", "Jobs"]);
  });
});
