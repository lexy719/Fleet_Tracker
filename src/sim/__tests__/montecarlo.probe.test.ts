import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { HOME_BY, PORTO, WEEK_START } from "../iberianWeek";
import { randomWeekJobs } from "../randomWeek";
import { iberianSyntheticRouter, simulateFifo, simulateFleetOS, simulateNearest } from "../weekSimulation";
/** Monte-Carlo weeks (~10 min). Opt-in: MC_OUT=<file.json> npx vitest run src/sim/__tests__/montecarlo.probe.test.ts */
it.skipIf(!process.env.MC_OUT)("montecarlo", async () => {
  const base = { home: PORTO, startMs: Date.parse(WEEK_START), homeByMs: Date.parse(HOME_BY), route: iberianSyntheticRouter() };
  const rows: unknown[] = [];
  for (const count of [16, 32]) for (let seed = 101; seed <= 112; seed++) {
    const jobs = randomWeekJobs(seed, base.startMs, count);
    for (const f of [simulateFifo, simulateNearest, simulateFleetOS]) {
      const r = await f({ ...base, jobs });
      rows.push({ count, seed, policy: r.policy, ...r.totals });
    }
    writeFileSync(process.env.MC_OUT!, JSON.stringify(rows, null, 1));
  }
}, 3_600_000);
