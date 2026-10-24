import { describe, expect, it } from "vitest";
import { BENCH_WEEK_START, HUBS } from "../bench/bragancaInstance";
import { scorePlan } from "../bench/evaluate";
import { checkPins } from "../constraints";
import { scheduleRoute } from "../crewSchedule";
import { dispatcherPlan } from "../greedy";
import { syntheticTravel, type Crew, type Instance, type Load, type Pin, type Solution } from "../model";
import { replan, type ReplanEvent } from "../replan";
import { planObjective, solveWeek } from "../solver";
import { pastChanges } from "./replanHelpers";

/*
 * Random weeks, some with broken data, to try to break the search. Invariants on every plan:
 * no crash, each load at most once, every week feasible and legal, never worse than the
 * dispatcher it starts from, same plan for the same seed. Then the same weeks with random pins
 * (some contradictory or naming nothing) and contracted loads, and random replans (new loads,
 * cancellations, delays, breakdowns). FUZZ_N=<n> runs more weeks; FUZZ_SEED=<n> only that week.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const H = 3_600_000, D = 24 * H, W = BENCH_WEEK_START;
/** Seeds 1..n, or only FUZZ_SEED (to reproduce a failure). */
const seeds = (n: number) => (process.env.FUZZ_SEED ? [Number(process.env.FUZZ_SEED)] : Array.from({ length: n }, (_, i) => i + 1));

function randomLoad(r: () => number, id: string): Load {
  const travel = syntheticTravel();
  const place = () => (r() < 0.85 ? HUBS[Math.floor(r() * HUBS.length)]! : { name: "ponto", at: [36.5 + r() * 7, -9.3 + r() * 6.5] as [number, number], country: r() < 0.5 ? "PT" as const : "ES" as const });
  const a = place(), b = place();
  const ps = W + Math.floor(r() * 130) * H, pe = ps + Math.floor(r() * 12 - 1) * H; // sometimes inverted
  const ds = ps + Math.floor(r() * 30) * H;
  const broken = r() < 0.05;
  return { id, fromName: a.name, toName: b.name, from: broken ? [NaN, b.at[1]] : a.at, to: b.at, fromCountry: a.country, toCountry: b.country,
    pickupStartMs: ps, pickupEndMs: pe, deliveryStartMs: ds, deliveryEndMs: ds + Math.floor(r() * 40 - 2) * H,
    pickupServiceSec: Math.floor(r() * 3) * 1800, deliveryServiceSec: Math.floor(r() * 3) * 1800, equipment: r() < 0.25 ? "REEFER" : "CURTAIN",
    weightKg: 20_000, rateEur: r() < 0.03 ? -100 : Math.round(150 + 1.3 * travel(a.at, b.at).km * (0.5 + r())) };
}

function randomWeek(seed: number): Instance {
  const r = rng(seed), travel = syntheticTravel();
  const place = () => (r() < 0.85 ? HUBS[Math.floor(r() * HUBS.length)]! : { name: "ponto", at: [36.5 + r() * 7, -9.3 + r() * 6.5] as [number, number], country: r() < 0.5 ? "PT" as const : "ES" as const });
  const crews: Crew[] = Array.from({ length: Math.floor(r() * 12) }, (_, i) => {
    const home = place();
    const tired = r() < 0.2;
    return { id: `E${i}`, truckId: `T${i}`, driverId: `M${i}`, trailerId: `R${i}`, equipment: r() < 0.25 ? "REEFER" : "CURTAIN", homeName: home.name, home: home.at,
      start: r() < 0.8 ? home.at : place().at, availableFromMs: W + Math.floor(r() * 60) * H, homeByMs: W + (3 + r() * 3) * D,
      driving: tired ? { dayDriveSec: r() * 9 * 3600, continuousDriveSec: r() * 4.5 * 3600, weekDriveSec: r() * 56 * 3600, previousWeekDriveSec: r() * 34 * 3600 }
        : { dayDriveSec: 0, continuousDriveSec: 0, weekDriveSec: 0, previousWeekDriveSec: 0 } };
  });
  const loads: Load[] = Array.from({ length: Math.floor(r() * 50) }, (_, i) => randomLoad(r, `C${i}`));
  return { name: `fuzz-${seed}`, weekStartMs: W, crews, loads, travel, costEurPerKm: 0.5 + r() * 0.6 };
}

describe("fuzz: random weeks cannot break the search", () => {
  const n = Number(process.env.FUZZ_N ?? 40);
  it(`${n} random weeks keep every invariant`, () => {
    for (const seed of seeds(n)) {
      const inst = randomWeek(seed);
      const sol = solveWeek(inst, { iterations: 60, seed });
      const ids = [...sol.routes.flatMap((x) => x.loadIds), ...sol.unassigned].sort();
      expect(ids, inst.name).toEqual(inst.loads.map((l) => l.id).sort());
      const score = scorePlan("v2", inst, sol, 0);
      expect(score.infeasibleRoutes, inst.name).toBe(0);
      expect(score.violations, inst.name).toEqual({});
      expect(planObjective(inst, sol), inst.name).toBeLessThanOrEqual(planObjective(inst, dispatcherPlan(inst, "nearest")) + 1e-6);
      expect(solveWeek(inst, { iterations: 60, seed }), inst.name).toEqual(sol);
    }
  }, 600_000);
});

/** Random pins on a week: assignments, prohibitions and orders, now and then contradictory or naming nothing. */
function randomPins(inst: Instance, r: () => number): Pin[] {
  const pins: Pin[] = [];
  const anyLoad = () => (r() < 0.05 ? "nada" : inst.loads[Math.floor(r() * inst.loads.length)]?.id ?? "nada");
  const anyCrew = () => (r() < 0.05 ? "ninguém" : inst.crews[Math.floor(r() * inst.crews.length)]?.id ?? "ninguém");
  for (let n = Math.floor(r() * 8); n > 0; n--) {
    const x = r();
    if (x < 0.45) pins.push({ kind: "assign", loadId: anyLoad(), crewId: anyCrew() });
    else if (x < 0.75) pins.push({ kind: "forbid", loadId: anyLoad(), crewId: anyCrew() });
    else pins.push({ kind: "sequence", crewId: anyCrew(), loadIds: Array.from({ length: 2 + Math.floor(r() * 2) }, anyLoad) });
  }
  return pins;
}

/** Independent check: an undone contracted load that some crew could take by dropping its spot loads. */
function mandatoryLeftWithRoom(inst: Instance, sol: Solution, pins: Pin[]): string[] {
  const byId = new Map(inst.loads.map((l) => [l.id, l]));
  const pinned = new Set(pins.flatMap((p) => (p.kind === "sequence" ? p.loadIds : [p.loadId])));
  const out: string[] = [];
  for (const id of sol.unassigned) {
    const m = byId.get(id)!;
    if (!m.mandatory || pinned.has(id)) continue;
    for (const c of inst.crews) {
      if (pins.some((p) => p.kind === "forbid" && p.crewId === c.id && p.loadId === id)) continue;
      const keep = (sol.routes.find((x) => x.crewId === c.id)?.loadIds ?? []).filter((x) => byId.get(x)!.mandatory || pins.some((p) => p.crewId === c.id && p.kind !== "forbid" && (p.kind === "sequence" ? p.loadIds : [p.loadId]).includes(x)));
      for (let pos = 0; pos <= keep.length; pos++)
        if (scheduleRoute(c, [...keep.slice(0, pos), id, ...keep.slice(pos)].map((x) => byId.get(x)!), inst.travel)) out.push(`${id} cabia em ${c.id}`);
    }
  }
  return out;
}

describe("fuzz: the optional backhaul polish", () => {
  const n = Number(process.env.FUZZ_N ?? 40);
  it(`${n} random weeks: never fewer loads, less margin or more empty km home, always legal`, () => {
    for (const seed of seeds(n)) {
      const inst = randomWeek(seed);
      const a = scorePlan("v2", inst, solveWeek(inst, { iterations: 40, seed }), 0);
      const sol = solveWeek(inst, { iterations: 40, seed, backhaul: true });
      const b = scorePlan("v2 + retorno", inst, sol, 0);
      expect(b.infeasibleRoutes, inst.name).toBe(0);
      expect(b.violations, inst.name).toEqual({});
      expect(b.assigned, inst.name).toBeGreaterThanOrEqual(a.assigned);
      expect(b.marginEur, inst.name).toBeGreaterThanOrEqual(a.marginEur - 1);
      expect(b.homeEmptyKm, inst.name).toBeLessThanOrEqual(a.homeEmptyKm + 1);
      for (const id of sol.unassigned) expect(sol.why?.[id]?.text, `${inst.name} ${id}`).toBeTruthy();
    }
  }, 600_000);
});

describe("fuzz: random pins and contracted loads", () => {
  const n = Number(process.env.FUZZ_N ?? 40);
  it(`${n} random weeks: pins never broken, contracted loads only left when no crew has room`, () => {
    for (const seed of seeds(n)) {
      const inst = randomWeek(seed), r = rng(seed * 7919);
      for (const l of inst.loads) l.mandatory = r() < 0.3;
      const pins = randomPins(inst, r);
      const sol = solveWeek(inst, { iterations: 40, seed, pins });
      const ids = [...sol.routes.flatMap((x) => x.loadIds), ...sol.unassigned].sort();
      expect(ids, inst.name).toEqual(inst.loads.map((l) => l.id).sort());
      const score = scorePlan("v2", inst, sol, 0);
      expect(score.infeasibleRoutes, inst.name).toBe(0);
      expect(score.violations, inst.name).toEqual({});
      expect(checkPins(inst, sol, pins), inst.name).toEqual([]);
      for (const id of sol.unassigned) expect(sol.why?.[id]?.text, `${inst.name} ${id}`).toBeTruthy();
      expect(mandatoryLeftWithRoom(inst, sol, pins), inst.name).toEqual([]);
      expect(solveWeek(inst, { iterations: 40, seed, pins }), inst.name).toEqual(sol);
    }
  }, 600_000);
});

describe("fuzz: random replans of running weeks", () => {
  const n = Number(process.env.FUZZ_N ?? 40);
  it(`${n} random weeks replanned mid-week: the past stays, everything legal`, () => {
    for (const seed of seeds(n)) {
      const inst = randomWeek(seed), r = rng(seed * 104729);
      const base = solveWeek(inst, { iterations: 30, seed });
      const now = W + Math.floor(r() * 110) * H;
      const events: ReplanEvent[] = [];
      for (let k = 1 + Math.floor(r() * 3); k > 0; k--) {
        const x = r(), crewId = inst.crews[Math.floor(r() * inst.crews.length)]?.id;
        if (x < 0.3) events.push({ kind: "newLoad", load: randomLoad(r, `N${k}`) });
        else if (x < 0.5 && inst.loads.length) events.push({ kind: "cancel", loadId: inst.loads[Math.floor(r() * inst.loads.length)]!.id });
        else if (x < 0.8 && crewId && !events.some((e) => "crewId" in e && e.crewId === crewId)) events.push({ kind: "delay", crewId, hours: 0.5 + r() * 10, as: r() < 0.7 ? "driving" : "waiting" });
        else if (crewId && !events.some((e) => "crewId" in e && e.crewId === crewId)) events.push({ kind: "breakdown", crewId, fromMs: now + Math.floor(r() * 30) * H });
      }
      const res = replan(inst, base, now, events, { seed, iterations: 30 });
      const name = `${inst.name} ${JSON.stringify(events.map((e) => e.kind))}`;
      const ids = [...res.plan.routes.flatMap((x) => x.loadIds), ...res.plan.unassigned].sort();
      expect(ids, name).toEqual(res.instance.loads.map((l) => l.id).sort());
      const score = scorePlan("v2", res.instance, res.plan, 0);
      expect(score.infeasibleRoutes, name).toBe(0);
      expect(score.violations, name).toEqual({});
      expect(checkPins(res.instance, res.plan), name).toEqual([]);
      expect(pastChanges(inst, base, res.instance, res.plan, now), name).toEqual([]);
    }
  }, 600_000);
});
