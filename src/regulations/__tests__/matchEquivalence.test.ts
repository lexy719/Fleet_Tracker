import { describe, expect, it } from "vitest";
import { haversineM, matchRouteAlongLines, pointToSegmentM, type LineMatchOptions } from "../geometry";
import { buildRegulationDataset } from "../repository";

/*
 * The optimised matcher (route index + envelope skip + segment grid) must return EXACTLY
 * what the original brute-force matcher returned. Reference below = the original code.
 */

const toRad = (d: number) => (d * Math.PI) / 180;
const M_PER_DEG = 111_320;
type Seg = { a: [number, number]; b: [number, number] };
const bearing360 = (a: [number, number], b: [number, number]) => {
  const k = Math.cos(toRad(a[0]));
  return ((Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI + 360) % 360;
};
const headingDiff = (a: number, b: number, directional: boolean) => {
  const d = Math.abs(a - b) % 360;
  const full = Math.min(d, 360 - d);
  return directional ? full : Math.min(full, 180 - full);
};
function nearestSeg(p: [number, number], segs: Seg[], maxM: number) {
  const k = Math.cos(toRad(p[0]));
  const padLat = maxM / M_PER_DEG, padLon = maxM / (M_PER_DEG * k);
  let best: { d: number; heading: number } | null = null;
  for (const s of segs) {
    if (p[0] < Math.min(s.a[0], s.b[0]) - padLat || p[0] > Math.max(s.a[0], s.b[0]) + padLat) continue;
    if (p[1] < Math.min(s.a[1], s.b[1]) - padLon || p[1] > Math.max(s.a[1], s.b[1]) + padLon) continue;
    const d = pointToSegmentM(p, s.a, s.b);
    if (d <= maxM && (!best || d < best.d)) best = { d, heading: bearing360(s.a, s.b) };
  }
  return best;
}
function referenceMatch(points: [number, number][], lines: [number, number][][], opts: LineMatchOptions) {
  const segs: Seg[] = [];
  for (const l of lines) for (let i = 1; i < l.length; i++) segs.push({ a: l[i - 1]!, b: l[i]! });
  const step = opts.sampleStepM ?? 20;
  const runs: { fromIndex: number; toIndex: number; fromPos: number; toPos: number; lengthM: number }[] = [];
  let run: (typeof runs)[number] | null = null;
  const close = () => { if (run && run.lengthM >= opts.minMatchLengthM) runs.push(run); run = null; };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const segLen = haversineM(a, b);
    if (segLen === 0) continue;
    const heading = bearing360(a, b);
    const n = Math.max(1, Math.ceil(segLen / step));
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      const p: [number, number] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      const near = nearestSeg(p, segs, opts.toleranceM);
      if (near && headingDiff(near.heading, heading, opts.directional === true) <= opts.maxHeadingDiffDeg) {
        if (!run) run = { fromIndex: i - 1, toIndex: i, fromPos: i - 1 + s / n, toPos: i - 1 + (s + 1) / n, lengthM: 0 };
        run.toIndex = i; run.toPos = i - 1 + (s + 1) / n; run.lengthM += segLen / n;
      } else close();
    }
  }
  close();
  return runs;
}

type MR = { id: string; points: [number, number][] };
const ROUTES = Object.values(import.meta.glob<MR>("../__fixtures__/routeMatrix/*.json", { eager: true, import: "default" }));
const DS = buildRegulationDataset(["ip3-duplicacao-cortes-noturnos-2026-09-28"]);
const GEOMS = DS.geometries.filter((g) => g.resolved);

describe("optimised corridor matcher ≡ original brute-force matcher", () => {
  it("fixtures are present (36 recorded routes)", () => expect(ROUTES.length).toBe(36));
  it.each(ROUTES.map((r) => [r.id, r] as const))("%s — every curated geometry, both directional modes", (_id, r) => {
    let matched = 0;
    for (const g of GEOMS) {
      for (const directional of [false, true]) {
        const opts = { toleranceM: g.resolved!.toleranceM, minMatchLengthM: g.resolved!.minMatchLengthM, maxHeadingDiffDeg: g.resolved!.maxHeadingDiffDeg, directional };
        const got = matchRouteAlongLines(r.points, g.resolved!.lines, opts).runs;
        expect(got).toEqual(referenceMatch(r.points, g.resolved!.lines, opts));
        matched += got.length;
      }
    }
    expect(matched).toBeGreaterThanOrEqual(0);
  });
  it("route-own sub-stretches (guaranteed matches) are identical too", () => {
    for (const r of ROUTES.slice(0, 12)) {
      const mid = Math.floor(r.points.length / 2);
      const line = r.points.slice(mid, mid + 30);
      const opts = { toleranceM: 30, minMatchLengthM: 200, maxHeadingDiffDeg: 30 };
      const got = matchRouteAlongLines(r.points, [line], opts).runs;
      expect(got.length).toBeGreaterThan(0);
      expect(got).toEqual(referenceMatch(r.points, [line], opts));
    }
  });
});
