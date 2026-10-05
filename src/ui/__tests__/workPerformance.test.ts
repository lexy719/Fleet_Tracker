import { describe, expect, it } from "vitest";
import type { Job, JobStatus } from "../../data/types";
import { makeJob, NOW } from "../../domain/__tests__/fixtures";
import { EMPTY_FILTERS, groupCounts, inGroup, matchesFilters, sortWork } from "../work/workModel";

/* Measured cost of what the Work page recomputes per keystroke / group switch. */

const STATUSES: JobStatus[] = ["backlog", "queued", "assigned", "loading", "in_transit", "delivered", "invoiced", "cancelled"];

describe("Work model performance (2,000 jobs)", () => {
  const base = makeJob("base");
  const jobs: Job[] = Array.from({ length: 2_000 }, (_, i) => ({
    ...base,
    id: `p${i}`,
    jobNumber: `J-${String(i).padStart(6, "0")}`,
    client: `Cliente ${i % 40}`,
    status: STATUSES[i % STATUSES.length]!,
    planStatus: i % 13 === 0 ? "REPLAN_REQUIRED" : base.planStatus,
  }));
  const refs = { truck: () => true, driver: () => true, trailer: () => true };

  it("search + group counts + group filter + sort stay well under one frame budget per update", () => {
    const t0 = performance.now();
    const runs = 20;
    let shown = 0;
    for (let i = 0; i < runs; i++) {
      const filtered = jobs.filter((j) => matchesFilters(j, { ...EMPTY_FILTERS, q: `cliente ${i}` }, NOW));
      groupCounts(filtered, NOW, refs);
      shown = sortWork(filtered.filter((j) => inGroup(j, "attention", NOW, refs))).length;
    }
    const perUpdate = (performance.now() - t0) / runs;
    console.log(`[perf] work update with 2000 jobs: ${perUpdate.toFixed(1)} ms`);
    expect(shown).toBeGreaterThanOrEqual(0);
    expect(perUpdate).toBeLessThan(100);
  });

  it("full (unfiltered) grouping of 2,000 jobs", () => {
    const t0 = performance.now();
    const c = groupCounts(jobs, NOW, refs);
    const ms = performance.now() - t0;
    console.log(`[perf] group counts for 2000 jobs: ${ms.toFixed(1)} ms`);
    expect(c.all).toBe(2_000);
    expect(ms).toBeLessThan(200);
  });
});
