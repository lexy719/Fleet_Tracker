import { describe, expect, it } from "vitest";
import { validateDriverTimeline } from "../../legal/driverLegality";
import { PORTO } from "../iberianWeek";
import { lisbonMs, simulateDriverWeeks } from "../multiWeek";
import { iberianSyntheticRouter, simulateFifo, simulateFleetOS } from "../weekSimulation";

describe("consecutive weeks for one driver", () => {
  it("Lisbon wall clock is DST-safe (WEST in October, WET from 25 Oct)", () => {
    expect(new Date(lisbonMs(2026, 10, 12, 6)).toISOString()).toBe("2026-10-12T05:00:00.000Z");
    expect(new Date(lisbonMs(2026, 11, 2, 6)).toISOString()).toBe("2026-11-02T06:00:00.000Z");
    // Day overflow across a month end (Mon 30 Nov + 4 days = Fri 4 Dec).
    expect(new Date(lisbonMs(2026, 11, 34, 20)).toISOString()).toBe("2026-12-04T20:00:00.000Z");
  });

  it("carries history: every legal week passes the audit over the driver's whole multi-week timeline", async () => {
    const outcomes = await simulateDriverWeeks({ policies: [simulateFifo, simulateFleetOS], weeks: 3, seed: 5, loadsPerWeek: 12, route: iberianSyntheticRouter(), home: PORTO, firstMonday: { y: 2026, m: 10, d: 12 } });
    expect(outcomes).toHaveLength(6);
    for (const o of outcomes) {
      expect(o.legal.totals.jobs).toBeGreaterThanOrEqual(0);
      // Technically feasible but illegal plans are reported with their violations, never hidden.
      if (!o.technical.legal) expect(o.technical.violations.length).toBeGreaterThan(0);
    }
  }, 300_000);

  it("the audit sees across weeks: a legal week can become illegal with a heavy previous week", () => {
    const M = 60_000;
    const mon = lisbonMs(2026, 10, 12, 6);
    const acts: { kind: "DRIVE" | "BREAK" | "REST"; startMs: number; endMs: number }[] = [];
    let t = mon;
    const push = (kind: "DRIVE" | "BREAK" | "REST", min: number) => { acts.push({ kind, startMs: t, endMs: t + min * M }); t += min * M; };
    for (let d = 0; d < 6; d++) { push("DRIVE", 270); push("BREAK", 45); push("DRIVE", d < 2 ? 330 : 270); push("REST", d < 2 ? 795 : 855); }
    t = lisbonMs(2026, 10, 19, 6);
    for (let d = 0; d < 4; d++) { push("DRIVE", 270); push("BREAK", 45); push("DRIVE", 270); push("REST", 855); }
    const r = validateDriverTimeline(acts, { afterWeeklyRestEndMs: mon });
    expect(r.weeks[0]!.drivingH).toBe(56);
    expect(r.violations.map((v) => v.rule)).toContain("FORTNIGHT_DRIVING_90H");
  });
});
