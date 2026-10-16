import type { Job } from "../data/types";
import { fixturePosition, planningDriver, planningTruck, syntheticOption } from "../domain/planning/fixtures";
import { planFleet } from "../domain/planning/planner";
import type { FleetState, JobExecution, MovementRequest, PlanningRequest } from "../domain/planning/types";
import { REGULATION_DATASET } from "../regulations/repository";
import { haversineM } from "../regulations/geometry";
import type { RoutePlanOption } from "../tomtom/planRoutes";
import type { Activity } from "../legal/driverLegality";
import { executionsTimeline, homeLegActivities, type WaitPolicy } from "./timeline";

/*
 * One-truck week simulation on the REAL FleetOS operational planner (planFleet: EU 561 breaks,
 * daily rests, weekly hours, time windows, service time, known restrictions). Each load is
 * added incrementally from the previous end state, so every policy is timed by the same engine.
 * Every week must bring the driver back home by HOME_BY.
 */

export type Router = (r: MovementRequest) => Promise<RoutePlanOption[]>;

/** Synthetic road model for repeatable tests: 25 % over straight line, 72 km/h truck average. */
export const ROAD_UPLIFT = 1.25;
export const TRUCK_AVG_KMH = 72;
export const SIM_L_PER_100KM = 34.5;
export const SIM_EUR_PER_L = 1.8;

export function iberianSyntheticRouter(): Router {
  return async (r) => {
    const base = syntheticOption(r);
    const distanceM = (base.distanceM / 1.15) * ROAD_UPLIFT;
    const durationSec = (distanceM / (TRUCK_AVG_KMH * 1000)) * 3600;
    const litres = (distanceM / 1000) * (SIM_L_PER_100KM / 100);
    return [{ ...base, distanceM, durationSec, legDurationSec: [durationSec], fuelConsumptionL: litres, fuelCostEur: litres * SIM_EUR_PER_L }];
  };
}

export type WeekInput = {
  jobs: Job[];
  home: [number, number];
  startMs: number;
  homeByMs: number;
  route: Router;
  /** Legal audit of the week's activity timeline (incl. drive home); absent ⇒ planner feasibility only. */
  accept?: (weekTimeline: Activity[]) => boolean;
  waitPolicy?: WaitPolicy;
};

type SimState = { executions: JobExecution[]; fleet: FleetState; freeAt: number; at: [number, number] };

export type WeekResult = {
  policy: string;
  jobIds: string[];
  executions: JobExecution[];
  returnHome: { km: number; drivingSec: number; arriveMs: number };
  /** What the driver does this week, minute by minute (incl. the drive home). */
  timeline: Activity[];
  totals: {
    jobs: number;
    loadedKm: number;
    emptyKm: number;
    emptyPct: number;
    drivingH: number;
    revenueEur: number;
    fuelEur: number;
    tollEur: number;
    /** Revenue − fuel − tolls (other costs not modelled). */
    marginEur: number;
    homeAt: string;
  };
};

const TRUCK = "CAMIAO-01";
const DRIVER = "MOTORISTA-01";
const truck = () => ({ ...planningTruck(TRUCK), payloadKg: 25_000, grossVehicleWeightKg: 40_000 });

function initial(w: WeekInput): SimState {
  const position = fixturePosition(w.home);
  return {
    executions: [],
    fleet: {
      trucks: { [TRUCK]: { availableAt: w.startMs, position } },
      drivers: { [DRIVER]: { availableAt: w.startMs, position, driving: { drivenTodaySec: 0, continuousSec: 0, weekSec: 0, known: true } } },
      trailers: {},
    },
    freeAt: w.startMs,
    at: w.home,
  };
}

/** Add one load after the current state, timed by planFleet. Null if it does not fit. */
async function step(w: WeekInput, s: SimState, jobId: string, memo: Map<string, SimState | null>): Promise<SimState | null> {
  const key = `${s.executions.map((e) => e.jobId).join(">")}>${jobId}`;
  if (memo.has(key)) return memo.get(key)!;
  if (s.freeAt >= w.homeByMs) return null;
  const req: PlanningRequest = {
    jobs: w.jobs,
    trucks: [truck()],
    drivers: [planningDriver(DRIVER, w.startMs)],
    trailers: [],
    scopeJobIds: [jobId],
    nowMs: s.freeAt,
    earliestStartMs: s.freeAt,
    horizonEndMs: w.homeByMs,
    dataset: REGULATION_DATASET,
    initialState: s.fleet,
    route: w.route,
    search: { beamWidth: 1, extensionsPerState: 4, maxRouteRequests: 64, maxAlternatives: 1 },
  };
  const plan = (await planFleet(req)).recommended;
  const e = plan?.executions[0];
  const job = w.jobs.find((j) => j.id === jobId)!;
  const end = job.stops.at(-1)!;
  const next = e && plan ? { executions: [...s.executions, e], fleet: plan.futureState, freeAt: plan.futureState.trucks[TRUCK]!.availableAt, at: [end.lat, end.lng] as [number, number] } : null;
  memo.set(key, next);
  return next;
}

/** Empty drive home after the last load, with the breaks/rest the driver's state requires. */
async function homeLeg(w: WeekInput, s: SimState) {
  const d = s.fleet.drivers[DRIVER]!.driving!;
  if (haversineM(s.at, w.home) < 1000) return { km: 0, drivingSec: 0, arriveMs: s.freeAt, weekSec: d.weekSec, activities: [] as Activity[] };
  const [o] = await w.route({ job: w.jobs[0]!, truck: truck(), kind: "EMPTY", from: s.at, to: w.home, departMs: s.freeAt, evaluate: () => ({ status: "NOT_AFFECTED", results: [] }) as never });
  const activities = homeLegActivities(s.freeAt, o!.durationSec, { drivenTodaySec: d.drivenTodaySec, continuousSec: d.continuousSec ?? 0 });
  return { km: o!.distanceM / 1000, drivingSec: o!.durationSec, arriveMs: activities.at(-1)?.endMs ?? s.freeAt, weekSec: d.weekSec + o!.durationSec, activities };
}

const weekTimeline = (w: WeekInput, s: SimState, h: Awaited<ReturnType<typeof homeLeg>>) => [...executionsTimeline(s.executions, w.jobs, w.waitPolicy), ...h.activities];

/** Technically feasible: timed by the planner and home in time. Legally feasible: also passes `accept`. */
async function homeOk(w: WeekInput, s: SimState) {
  const h = await homeLeg(w, s);
  if (h.arriveMs > w.homeByMs || h.weekSec > 56 * 3600) return null;
  if (w.accept && !w.accept(weekTimeline(w, s, h))) return null;
  return h;
}

function money(w: WeekInput, s: SimState) {
  const mv = s.executions.flatMap((e) => e.movements);
  const revenue = s.executions.reduce((t, e) => t + (w.jobs.find((j) => j.id === e.jobId)?.rateEur ?? 0), 0);
  const cost = mv.reduce((t, m) => t + m.route.fuelCostEur + m.route.tollCostEur, 0);
  return { revenue, cost };
}

async function summarise(policy: string, w: WeekInput, s: SimState): Promise<WeekResult> {
  const h = await homeLeg(w, s);
  const mv = s.executions.flatMap((e) => e.movements);
  const km = (k: "LOADED" | "EMPTY") => mv.filter((m) => m.kind === k).reduce((t, m) => t + m.route.distanceM / 1000, 0);
  const loadedKm = km("LOADED");
  const emptyKm = km("EMPTY") + h.km;
  const homeFuel = h.km * (SIM_L_PER_100KM / 100) * SIM_EUR_PER_L;
  const fuelEur = mv.reduce((t, m) => t + m.route.fuelCostEur, 0) + homeFuel;
  const tollEur = mv.reduce((t, m) => t + m.route.tollCostEur, 0);
  const { revenue } = money(w, s);
  const r = Math.round;
  return {
    policy,
    jobIds: s.executions.map((e) => e.jobId),
    executions: s.executions,
    returnHome: h,
    timeline: weekTimeline(w, s, h),
    totals: {
      jobs: s.executions.length,
      loadedKm: r(loadedKm),
      emptyKm: r(emptyKm),
      emptyPct: loadedKm + emptyKm ? Math.round((emptyKm / (loadedKm + emptyKm)) * 1000) / 10 : 0,
      drivingH: Math.round(((mv.reduce((t, m) => t + m.route.durationSec, 0) + h.drivingSec) / 3600) * 10) / 10,
      revenueEur: r(revenue),
      fuelEur: r(fuelEur),
      tollEur: r(tollEur),
      marginEur: r(revenue - fuelEur - tollEur),
      homeAt: new Date(h.arriveMs).toISOString(),
    },
  };
}

const pickupStart = (j: Job) => Date.parse(j.stops[0]!.windowStartAt ?? "");

/** Greedy dispatcher: repeatedly takes the first load (in `order`) that fits and still gets the driver home. */
async function greedy(w: WeekInput, policy: string, order: (s: SimState, remaining: Job[]) => Job[]): Promise<WeekResult> {
  const memo = new Map<string, SimState | null>();
  let s = initial(w);
  for (;;) {
    const remaining = w.jobs.filter((j) => !s.executions.some((e) => e.jobId === j.id));
    let next: SimState | null = null;
    for (const j of order(s, remaining)) {
      const c = await step(w, s, j.id, memo);
      if (c && (await homeOk(w, c))) { next = c; break; }
    }
    if (!next) break;
    s = next;
  }
  return summarise(policy, w, s);
}

/** Dispatcher takes loads in the order they become available. */
export const simulateFifo = (w: WeekInput) =>
  greedy(w, "Ordem de chegada", (_s, rem) => [...rem].sort((a, b) => pickupStart(a) - pickupStart(b) || a.id.localeCompare(b.id)));

/** Dispatcher takes the nearest load opening in the next 24 h (then further ahead). */
export const simulateNearest = (w: WeekInput) =>
  greedy(w, "Mais perto primeiro", (s, rem) => {
    const dist = (j: Job) => haversineM(s.at, [j.stops[0]!.lat, j.stops[0]!.lng]);
    const soon = (j: Job) => (pickupStart(j) <= s.freeAt + 24 * 3600_000 ? 0 : 1);
    return [...rem].sort((a, b) => soon(a) - soon(b) || dist(a) - dist(b) || pickupStart(a) - pickupStart(b));
  });

export const LOAD_SELECTION_BEAM = 24;
/** Week time a sequence has used up is worth this much to the rest of the week (ranking only). */
export const WEEK_TIME_EUR_PER_H = 20;

/**
 * FleetOS load selection: beam search over load sequences, each step timed by planFleet.
 * Ranked by margin (revenue − fuel − tolls) minus the fuel of the empty drive home minus the
 * week time already used (a sequence that burns Tuesday waiting has less week left to earn);
 * kept diverse by end place and time; the final choice is the best real margin among
 * sequences that still get the driver home in time.
 */
export async function simulateFleetOS(w: WeekInput, beamWidth = LOAD_SELECTION_BEAM): Promise<WeekResult> {
  const memo = new Map<string, SimState | null>();
  const homeFuel = (s: SimState) => (haversineM(s.at, w.home) / 1000) * ROAD_UPLIFT * (SIM_L_PER_100KM / 100) * SIM_EUR_PER_L;
  const margin = (s: SimState) => { const m = money(w, s); return m.revenue - m.cost - homeFuel(s); };
  const rank = (s: SimState) => margin(s) - ((s.freeAt - w.startMs) / 3_600_000) * WEEK_TIME_EUR_PER_H;
  let beam: SimState[] = [initial(w)];
  let best = beam[0]!;
  for (let depth = 0; depth < w.jobs.length && beam.length; depth++) {
    const next: SimState[] = [];
    for (const s of beam) {
      for (const j of w.jobs) {
        if (s.executions.some((e) => e.jobId === j.id)) continue;
        const c = await step(w, s, j.id, memo);
        if (c && (await homeOk(w, c))) next.push(c);
      }
    }
    next.sort((a, b) => rank(b) - rank(a));
    // Diversity: at most 3 sequences ending at the same place within the same half-day.
    const seen = new Map<string, number>();
    beam = [];
    for (const s of next) {
      const k = `${s.at[0].toFixed(1)},${s.at[1].toFixed(1)}@${Math.floor(s.freeAt / 43_200_000)}`;
      const n = seen.get(k) ?? 0;
      if (n >= 3) continue;
      seen.set(k, n + 1);
      beam.push(s);
      if (beam.length >= beamWidth) break;
    }
    for (const s of beam) if (margin(s) > margin(best)) best = s;
  }
  return summarise("FleetOS", w, best);
}

/** Re-time a chosen load sequence with another router (e.g. live TomTom) — no re-selection. */
export async function replay(w: WeekInput, policy: string, jobIds: string[]): Promise<WeekResult | null> {
  const memo = new Map<string, SimState | null>();
  let s = initial(w);
  for (const id of jobIds) {
    const c = await step(w, s, id, memo);
    if (!c) return null;
    s = c;
  }
  return summarise(policy, w, s);
}
