import { describe, expect, it } from "vitest";
import { coverageShareReference, routesEquivalent } from "../geometry";

/*
 * Solver cycle detection (routesEquivalent) is grid-accelerated with an early exit. It must
 * give exactly the exhaustive answer on real recorded routes (it decides "same route again").
 */
type MR = { id: string; points: [number, number][] };
const ALL = Object.values(import.meta.glob<MR>("../__fixtures__/routeMatrix/*.json", { eager: true, import: "default" }));
const ref = (a: [number, number][], b: [number, number][]) => coverageShareReference(a, b, 30) >= 0.98 && coverageShareReference(b, a, 30) >= 0.98;
const shift = (pts: [number, number][], m: number) => pts.map(([a, b]) => [a + m / 111_320, b] as [number, number]);

describe("routesEquivalent (grid + early exit) ≡ exhaustive reference", () => {
  const pairs: [string, [number, number][], [number, number][]][] = [];
  for (let i = 0; i < ALL.length; i += 2) {
    const f = ALL[i]!, n = ALL[i + 1]!;
    pairs.push([`${f.id} vs ${n.id}`, f.points, n.points]);
    pairs.push([`${f.id} vs itself`, f.points, f.points.slice()]);
  }
  const pl = ALL.find((r) => r.id === "porto__lisboa__fastest")!.points;
  pairs.push(["shifted 20 m (same road)", pl, shift(pl, 20)]);
  pairs.push(["shifted 45 m (beyond 30 m tolerance)", pl, shift(pl, 45)]);
  pairs.push(["truncated by 5%", pl, pl.slice(0, Math.floor(pl.length * 0.95))]);
  pairs.push(["truncated by 1%", pl, pl.slice(0, Math.floor(pl.length * 0.99))]);
  it.each(pairs)("%s", (_n, a, b) => {
    expect(routesEquivalent(a, b)).toBe(ref(a, b));
  });
  it("is fast on long routes (was ~0.7 s per comparison in the browser trace)", () => {
    const vf = ALL.find((r) => r.id === "vieira-do-minho__faro__fastest")!.points;
    const t0 = performance.now();
    for (let k = 0; k < 3; k++) routesEquivalent(vf, shift(vf, 10));
    const fast = (performance.now() - t0) / 3;
    const t1 = performance.now();
    ref(vf, shift(vf, 10));
    const slow = performance.now() - t1;
    console.log(`routesEquivalent 638 km: grid ${fast.toFixed(1)} ms vs exhaustive ${slow.toFixed(1)} ms`);
    expect(fast).toBeLessThan(slow);
  });
});
