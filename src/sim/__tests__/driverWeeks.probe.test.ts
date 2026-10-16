import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { PORTO } from "../iberianWeek";
import { simulateDriverWeeks, type WeekOutcome } from "../multiWeek";
import { iberianSyntheticRouter, simulateFifo, simulateFleetOS, simulateNearest } from "../weekSimulation";

/** 12 consecutive weeks per driver (~15 min). Opt-in: DW_OUT=<file.json> npx vitest run src/sim/__tests__/driverWeeks.probe.test.ts */
it.skipIf(!process.env.DW_OUT)("12 consecutive weeks", async () => {
  const rows: WeekOutcome[] = [];
  await simulateDriverWeeks({
    policies: [simulateFifo, simulateNearest, simulateFleetOS],
    weeks: 12, seed: 42, loadsPerWeek: 24, route: iberianSyntheticRouter(), home: PORTO, firstMonday: { y: 2026, m: 10, d: 12 },
    onWeek: (o) => { rows.push(o); writeFileSync(process.env.DW_OUT!, JSON.stringify(rows, null, 1)); },
  });
}, 7_200_000);
