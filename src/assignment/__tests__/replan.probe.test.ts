import { expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { BENCH_SIZES, BENCH_WEEK_START, bragancaInstance } from "../bench/bragancaInstance";
import { scorePlan } from "../bench/evaluate";
import { checkPins } from "../constraints";
import type { Instance, Load, Pin, Solution } from "../model";
import { replan, type ReplanEvent } from "../replan";
import { solveWeek } from "../solver";
import { pastChanges } from "./replanHelpers";

/**
 * Replanning on the Bragança weeks (generated data): from the v2 plan, on Tuesday 12:00, ten cases
 * of each event (a new load, a cancellation, a 3 h and a 6 h delay, a breakdown). Measures time,
 * how many crews and loads change, the margin and the legal audit.
 *   REPLAN=1 npx vitest run src/assignment/__tests__/replan.probe.test.ts
 * REPLAN_SIZES=S,M,L (default all), REPLAN_N=<cases per event> (10), REPLAN_OUT=<file.json>.
 * The second probe puts contracts (30 % of loads) and dispatcher pins on the same weeks.
 */
const H = 3_600_000, NOW = BENCH_WEEK_START + 30 * H;

/** Loads from another generated week of the same carrier that can still be picked up after now. */
function freshLoads(size: (typeof BENCH_SIZES)[number], n: number): Load[] {
  const other = bragancaInstance({ ...size, seed: size.seed + 1000 });
  return other.loads.filter((l) => l.pickupStartMs > NOW + 2 * H).slice(0, n).map((l, i) => ({ ...l, id: `N${String(i + 1).padStart(3, "0")}` }));
}

function cases(inst: Instance, base: Solution, n: number): { name: string; events: ReplanEvent[] }[] {
  const used = base.routes.filter((r) => r.loadIds.length);
  const pickEvery = <T,>(xs: T[]) => Array.from({ length: Math.min(n, xs.length) }, (_, i) => xs[Math.floor((i * xs.length) / Math.min(n, xs.length))]!);
  const leaveLater = inst.loads.filter((l) => l.pickupStartMs > NOW + 6 * H && base.routes.some((r) => r.loadIds.includes(l.id)));
  const size = BENCH_SIZES.find((s) => inst.name.startsWith(`Bragança ${s.name} `))!;
  return [
    ...freshLoads(size, n).map((load) => ({ name: "carga nova", events: [{ kind: "newLoad", load }] as ReplanEvent[] })),
    ...pickEvery(leaveLater).map((l) => ({ name: "cancelamento", events: [{ kind: "cancel", loadId: l.id }] as ReplanEvent[] })),
    ...pickEvery(used).map((r) => ({ name: "atraso 3 h", events: [{ kind: "delay", crewId: r.crewId, hours: 3 }] as ReplanEvent[] })),
    ...pickEvery(used).map((r) => ({ name: "atraso 6 h", events: [{ kind: "delay", crewId: r.crewId, hours: 6 }] as ReplanEvent[] })),
    ...pickEvery(used).map((r) => ({ name: "avaria", events: [{ kind: "breakdown", crewId: r.crewId }] as ReplanEvent[] })),
  ];
}

it.skipIf(!process.env.REPLAN)("replanning a running week", () => {
  const sizes = (process.env.REPLAN_SIZES ?? "S,M,L").split(",");
  const n = Number(process.env.REPLAN_N ?? 10);
  const rows: Record<string, unknown>[] = [];
  for (const size of BENCH_SIZES.filter((s) => sizes.includes(s.name))) {
    const inst = bragancaInstance(size);
    const base = solveWeek(inst);
    const before = scorePlan("v2", inst, base, 0);
    for (const c of cases(inst, base, n)) {
      const r = replan(inst, base, NOW, c.events);
      const score = scorePlan(c.name, r.instance, r.plan, r.runtimeMs);
      const label = `${size.name} ${c.name} ${JSON.stringify(c.events)}`;
      expect(score.infeasibleRoutes, label).toBe(0);
      expect(score.violations, label).toEqual({});
      expect(checkPins(r.instance, r.plan), label).toEqual([]);
      expect(pastChanges(inst, base, r.instance, r.plan, NOW), label).toEqual([]);
      const s = r.stability;
      rows.push({ size: size.name, event: c.name, detail: JSON.stringify(c.events.map((e) => ("crewId" in e ? e.crewId : e.kind === "newLoad" ? e.load.id : e.loadId))),
        ms: Math.round(r.runtimeMs), crewsTouched: s.crewsTouched.length, moved: s.moved.filter((m) => m.to).length, dropped: s.moved.filter((m) => !m.to).length,
        newlyDone: s.newlyDone.length, assigned: score.assigned, assignedBefore: before.assigned, marginEur: score.marginEur, marginBefore: before.marginEur,
        stranded: r.stranded.length, notes: r.notes.map((x) => x.code).join(" ") });
    }
  }
  console.table(rows);
  // Per size and event: median and worst.
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) groups.set(`${r.size} ${r.event}`, [...(groups.get(`${r.size} ${r.event}`) ?? []), r]);
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]!;
  const summary = [...groups].map(([k, rs]) => {
    const col = (f: string) => rs.map((r) => r[f] as number);
    return { caso: k, n: rs.length, "ms med": med(col("ms")), "ms máx": Math.max(...col("ms")), "equipas med": med(col("crewsTouched")), "equipas máx": Math.max(...col("crewsTouched")),
      "mudam med": med(col("moved")), "mudam máx": Math.max(...col("moved")), "ficam por fazer": col("dropped").reduce((a, b) => a + b, 0), "novas feitas": col("newlyDone").reduce((a, b) => a + b, 0),
      "Δ margem med": med(rs.map((r) => (r.marginEur as number) - (r.marginBefore as number))) };
  });
  console.table(summary);
  if (process.env.REPLAN_OUT) writeFileSync(process.env.REPLAN_OUT, JSON.stringify({ rows, summary }, null, 1));
}, 3_600_000);

it.skipIf(!process.env.REPLAN)("contracts and pins on the bench weeks", () => {
  const sizes = (process.env.REPLAN_SIZES ?? "S,M,L").split(",");
  const rows: Record<string, unknown>[] = [];
  for (const size of BENCH_SIZES.filter((s) => sizes.includes(s.name))) {
    const inst = bragancaInstance(size);
    const t0 = performance.now();
    const free = solveWeek(inst);
    const freeScore = scorePlan("v2", inst, free, performance.now() - t0);
    // Contracts: every load whose number ends in 0, 1 or 2 (30 %), as generated data.
    const contracted: Instance = { ...inst, loads: inst.loads.map((l) => ({ ...l, mandatory: Number(l.id.slice(1)) % 10 < 3 })) };
    // Pins, from the free plan: every 10th done load pinned to the crew after its own, every 20th forbidden to its own, 3 two-load orders reversed.
    const pins: Pin[] = [];
    const crewIds = inst.crews.map((c) => c.id);
    free.routes.forEach((r, ri) => r.loadIds.forEach((id, i) => {
      const n = Number(id.slice(1));
      if (n % 10 === 5) pins.push({ kind: "assign", loadId: id, crewId: crewIds[(crewIds.indexOf(r.crewId) + 1) % crewIds.length]! });
      else if (n % 20 === 7) pins.push({ kind: "forbid", loadId: id, crewId: r.crewId });
      else if (ri % Math.max(1, Math.floor(free.routes.length / 3)) === 0 && i === 0 && r.loadIds.length >= 2) pins.push({ kind: "sequence", crewId: r.crewId, loadIds: [r.loadIds[1]!, r.loadIds[0]!] });
    }));
    for (const [name, week, ps] of [["30 % contratadas", contracted, []], ["30 % contratadas + fixações", contracted, pins]] as const) {
      const t1 = performance.now();
      const sol = solveWeek(week, { pins: ps as Pin[] });
      const score = scorePlan(name, week, sol, performance.now() - t1);
      expect(score.violations, name).toEqual({});
      expect(score.infeasibleRoutes, name).toBe(0);
      expect(checkPins(week, sol, ps as Pin[]), name).toEqual([]);
      const mandatory = week.loads.filter((l) => l.mandatory);
      const undoneM = sol.unassigned.filter((id) => mandatory.some((l) => l.id === id));
      const codes = (ids: string[]) => Object.entries(ids.reduce<Record<string, number>>((a, id) => ({ ...a, [sol.why![id]!.code]: (a[sol.why![id]!.code] ?? 0) + 1 }), {})).map(([k, v]) => `${k}:${v}`).join(" ");
      const issues = Object.entries((sol.pinIssues ?? []).reduce<Record<string, number>>((a, i) => ({ ...a, [i.code]: (a[i.code] ?? 0) + 1 }), {})).map(([k, v]) => `${k}:${v}`).join(" ");
      rows.push({ size: size.name, caso: name, pins: ps.length, "fixações impossíveis": issues, cargas: `${score.assigned}/${inst.loads.length}`, "sem nada": freeScore.assigned,
        contratadas: `${mandatory.length - undoneM.length}/${mandatory.length}`, "contratadas por fazer (porquê)": codes(undoneM), margem: score.marginEur, "margem sem nada": freeScore.marginEur, s: +(score.runtimeMs / 1000).toFixed(1) });
      if (ps.length) {
        // A new load on the pinned, contracted week.
        const nova = { ...freshLoads(size, 1)[0]!, id: "N001" };
        const r = replan(week, sol, NOW, [{ kind: "newLoad", load: nova }], { pins: ps as Pin[] });
        const rs = scorePlan("replan", r.instance, r.plan, r.runtimeMs);
        expect(rs.violations).toEqual({});
        expect(checkPins(r.instance, r.plan, ps as Pin[])).toEqual([]);
        expect(pastChanges(week, sol, r.instance, r.plan, NOW)).toEqual([]);
        rows.push({ size: size.name, caso: "  + carga nova (replanear)", cargas: `${rs.assigned}/${r.instance.loads.length}`, margem: rs.marginEur, s: +(r.runtimeMs / 1000).toFixed(1), "equipas mexidas": r.stability.crewsTouched.length });
      }
    }
  }
  console.table(rows);
  if (process.env.REPLAN_OUT) writeFileSync(process.env.REPLAN_OUT.replace(/\.json$/, "") + ".pins.json", JSON.stringify(rows, null, 1));
}, 3_600_000);
