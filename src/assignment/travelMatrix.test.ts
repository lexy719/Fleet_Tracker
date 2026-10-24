import { describe, expect, it } from "vitest";
import { BENCH_SIZES, bragancaInstance } from "./bench/bragancaInstance";
import { syntheticTravel } from "./model";
import { buildTravel, neededPairs, withSlack } from "./travelMatrix";

describe("travel table from the routing engine", () => {
  const inst = bragancaInstance(BENCH_SIZES[0]!);
  const syn = syntheticTravel();

  it("asks each needed pair once, and answers lookups from the table", async () => {
    let calls = 0;
    const t = await buildTravel(neededPairs(inst), async (a, b) => { calls++; return syn(a, b); });
    expect(calls).toBe(t.asked);
    const l = inst.loads[0]!;
    expect(t.travel(l.from, l.to)).toEqual(syn(l.from, l.to));
    expect(t.fallbacks()).toBe(0);
  });

  it("an engine failure falls back to a conservative estimate, and it is counted", async () => {
    const t = await buildTravel(neededPairs(inst), async () => { throw new Error("motor em baixo"); });
    expect(t.failed).toBe(t.asked);
    const l = inst.loads[0]!;
    expect(t.travel(l.from, l.to).sec).toBeGreaterThan(syn(l.from, l.to).sec);
    expect(t.fallbacks()).toBe(1);
  });

  it("slack makes every moving leg longer", () => {
    const l = inst.loads[0]!;
    const s = withSlack(syn, 0.1, 15)(l.from, l.to);
    expect(s.sec).toBeCloseTo(syn(l.from, l.to).sec * 1.1 + 900, 6);
    expect(withSlack(syn, 0.1, 15)(l.from, l.from).sec).toBe(0);
  });
});
