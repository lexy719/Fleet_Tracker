import { beforeAll, describe, expect, it } from "vitest";
import { HOME_BY, PORTO, WEEK_START, weekJobs } from "../iberianWeek";
import { randomWeekJobs } from "../randomWeek";
import { iberianSyntheticRouter, simulateFifo, simulateFleetOS, simulateNearest, type WeekResult } from "../weekSimulation";

const homeBy = Date.parse(HOME_BY);
const input = () => ({ jobs: weekJobs(), home: PORTO, startMs: Date.parse(WEEK_START), homeByMs: homeBy, route: iberianSyntheticRouter() });

describe("Iberian week from Porto (synthetic roads, real planner)", () => {
  let fifo: WeekResult, nearest: WeekResult, fleetos: WeekResult;
  beforeAll(async () => {
    [fifo, nearest, fleetos] = [await simulateFifo(input()), await simulateNearest(input()), await simulateFleetOS(input())];
  }, 120_000);

  it("every policy brings the driver home by Friday evening within 56 h of weekly driving", () => {
    for (const r of [fifo, nearest, fleetos]) {
      expect(r.returnHome.arriveMs).toBeLessThanOrEqual(homeBy);
      expect(r.totals.drivingH).toBeLessThanOrEqual(56);
      expect(r.totals.jobs).toBeGreaterThan(0);
    }
  });

  it("loads are executed in time order with legal breaks/rests (planner timeline)", () => {
    for (const r of [fifo, nearest, fleetos]) {
      for (let i = 1; i < r.executions.length; i++) expect(r.executions[i]!.startMs).toBeGreaterThanOrEqual(r.executions[i - 1]!.endMs);
      for (const e of r.executions) for (const m of e.movements) if (m.route.durationSec > 4.5 * 3600) expect(m.breakSec + m.restSec, `${e.jobId} ${m.kind} ${Math.round(m.route.durationSec / 60)} min`).toBeGreaterThan(0);
    }
  });

  it("FleetOS load selection earns more and drives fewer empty km than both dispatcher heuristics", () => {
    expect(fleetos.totals.marginEur).toBeGreaterThan(Math.max(fifo.totals.marginEur, nearest.totals.marginEur));
    expect(fleetos.totals.emptyKm).toBeLessThan(Math.min(fifo.totals.emptyKm, nearest.totals.emptyKm));
  });

  it("random pools are deterministic per seed", () => {
    const a = randomWeekJobs(7, Date.parse(WEEK_START), 10).map((j) => [j.id, j.rateEur, j.stops[0]!.windowStartAt]);
    const b = randomWeekJobs(7, Date.parse(WEEK_START), 10).map((j) => [j.id, j.rateEur, j.stops[0]!.windowStartAt]);
    expect(a).toEqual(b);
  });
});
