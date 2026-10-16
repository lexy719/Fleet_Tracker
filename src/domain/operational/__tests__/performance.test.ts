import { it, expect } from "vitest";
import { buildRouteTiming } from "../../../regulations/timeline";
import { evaluateCompliance } from "../../../regulations/evaluate";
import {
  dataset,
  closure,
  geometry,
} from "../../../regulations/__tests__/helpers";
import { buildExecutionTimeline } from "../executionTimeline";
import { generated } from "./fixtures";
import { planFleet } from "../../planning/planner";
import { fleetFixture } from "../../planning/fixtures";
import { writeFileSync } from "node:fs";

it("records repeatable domain benchmarks without wall-clock pass thresholds", async () => {
  const points: [number, number][] = Array.from({ length: 10000 }, (_, i) => [
    41,
    -8.9 + i * 0.00001,
  ]);
  const regs = Array.from({ length: 40 }, (_, i) =>
    closure(`r${i}`, `g${i}`, {}),
  );
  const geoms = Array.from({ length: 40 }, (_, i) =>
    geometry(`g${i}`, [
      [41.02 + i * 0.002, -8.9],
      [41.02 + i * 0.002, -8.8],
    ]),
  );
  const ds = dataset(regs, geoms),
    timing = buildRouteTiming(points, [points.length], [6 * 3600], 0);
  const measurements: {
    name: string;
    iterations: number;
    meanMs: number;
    p95Ms: number;
  }[] = [];
  function measure(name: string, count: number, fn: () => void) {
    fn();
    const samples: number[] = [];
    for (let i = 0; i < count; i++) {
      const start = performance.now();
      fn();
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    measurements.push({
      name,
      iterations: count,
      meanMs: samples.reduce((a, b) => a + b, 0) / count,
      p95Ms: samples[Math.ceil(count * 0.95) - 1],
    });
  }
  measure("route_timing_10000_points", 30, () => {
    const t = buildRouteTiming(points, [points.length], [6 * 3600], 0);
    expect(t.expectedMs.length).toBe(10000);
  });
  measure("compliance_10000_points_40_remote_restrictions", 20, () => {
    const r = evaluateCompliance(ds, {
      route: {
        points,
        pointTimesMs: timing.expectedMs,
        timesAreEstimates: true,
        timing,
      },
      stops: [],
      facts: {},
    });
    expect(r.status).toBe("ROUTE_COMPLIANT");
  });
  const { request, plan } = await generated();
  measure("execution_replay_amadora_porto", 30, () =>
    expect(
      buildExecutionTimeline(request.jobs[0], plan.executions[0]).status,
    ).toBe("READY"),
  );
  const fleet = { ...fleetFixture(), dataset: dataset([], []) };
  const start = performance.now();
  const result = await planFleet(fleet);
  const elapsedMs = performance.now() - start;
  expect(result.recommended!.executions.length).toBe(20);
  const resultData = {
    measurements,
    fleet: { jobs: 20, resources: 5, elapsedMs, search: result.search },
  };
  console.log("OPERATIONAL_BENCHMARK", JSON.stringify(resultData));
  if (process.env.FLEETOS_BENCHMARK_OUTPUT)
    writeFileSync(
      process.env.FLEETOS_BENCHMARK_OUTPUT,
      JSON.stringify(resultData, null, 2),
    );
}, 60000);
