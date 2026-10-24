import type { Activity } from "../legal/driverLegality";
import { isPlannableLoad, type Crew, type Delay, type FailCode, type LatLng, type Load, type Travel } from "./model";

/*
 * Fast, conservative timing of one crew doing loads in a given order. Used inside the search, so it
 * avoids allocations unless asked to record the activity timeline. Rules applied while simulating:
 *
 * - Reg. 561/2006: 45 min break after 4h30 driving (art. 7); 9 h daily driving, 10 h at most twice a
 *   week (art. 6(1)); 11 h daily rest within 24 h of the previous one, i.e. duty ends ≤ 13 h after it
 *   started (art. 8(2)); 56 h weekly and 90 h fortnightly driving (art. 6(2)(3)).
 * - Dir. 2002/15: no more than 6 h working without a break (art. 5) — a 45 min break covers it;
 *   60 h working time a week (art. 4); at most 10 h of work in a duty with night work, 00:00–05:00
 *   Lisbon (art. 7, same night period as the legality audit).
 * - Reg. 1072/2009 as amended: at most 3 cabotage loads (both ends in Spain) per week, only after an
 *   international delivery into Spain.
 *
 * Replanning extras: unplanned delays (`crew.delays`, applied when the clock reaches them, even in the
 * middle of a leg), a truck out of service from a moment on, and "nothing new starts before the
 * replan moment" (`crew.replan`). Every failure says why (FailCode), for the dispatcher.
 *
 * Simplifications (always on the safe side): only regular 11 h daily rests (no reduced or split
 * rests); breaks are always 45 min; a wait counts as a break only when ≥ 45 min. The full legality
 * audit (validateDriverTimeline) checks the recorded timeline independently.
 */

const MIN = 60;
const H = 3600;
const MAX_CONTINUOUS = 4.5 * H;
const MAX_WORK_WITHOUT_BREAK = 6 * H;
const BREAK = 45 * MIN;
const DAILY_REST = 11 * H;
const DUTY_WINDOW = 13 * H;
const DAY_DRIVE = 9 * H;
const DAY_DRIVE_EXTENDED = 10 * H;
const WEEK_DRIVE = 56 * H;
const FORTNIGHT_DRIVE = 90 * H;
const CABOTAGE_PER_WEEK = 3;
const WEEK_WORK = 60 * H;
const NIGHT_DUTY_WORK = 10 * H;
const NIGHT_END_H = 5;

/** Lisbon offset from UTC (WET/WEST): +1 h from the last Sunday of March to the last Sunday of October, 01:00 UTC. */
export function lisbonOffsetMs(ms: number): number {
  const y = new Date(ms).getUTCFullYear();
  const lastSunday = (month: number) => {
    const d = new Date(Date.UTC(y, month + 1, 0, 1));
    return d.getTime() - d.getUTCDay() * 86_400_000;
  };
  return ms >= lastSunday(2) && ms < lastSunday(9) ? 3_600_000 : 0;
}

/** Does [startMs, startMs + sec) touch the night period (00:00–05:00 Lisbon)? */
function touchesNight(startMs: number, sec: number): boolean {
  const D = 86_400_000;
  const local = startMs + lisbonOffsetMs(startMs), end = local + sec * 1000;
  for (let day = Math.floor(local / D) * D; day < end; day += D) if (local < day + NIGHT_END_H * 3_600_000 && end > day) return true;
  return false;
}

export type CrewState = {
  t: number; // ms
  pos: LatLng;
  continuousSec: number;
  workSinceBreakSec: number;
  dayDriveSec: number;
  dutyStartMs: number;
  extendedDays: number;
  extendedToday: boolean;
  weekDriveSec: number;
  previousWeekDriveSec: number;
  weekWorkSec: number;
  dutyWorkSec: number;
  nightInDuty: boolean;
  inSpainAfterInternational: boolean;
  cabotage: number;
  emptyKm: number;
  loadedKm: number;
  driveSec: number;
  revenueEur: number;
  loadIds: string[];
  /** Every leg driven, in order (from the crew's start): where it ends, how long, loaded or not. */
  legs: { to: LatLng; km: number; loaded: boolean }[];
  activities?: Activity[];
  /** Delays still to come, by time. */
  delays?: readonly Delay[];
};

export function initialState(crew: Crew, record = false): CrewState {
  return {
    t: crew.availableFromMs,
    pos: crew.start,
    continuousSec: crew.driving.continuousDriveSec,
    workSinceBreakSec: crew.driving.continuousDriveSec,
    dayDriveSec: crew.driving.dayDriveSec,
    dutyStartMs: crew.availableFromMs,
    extendedDays: 0,
    extendedToday: false,
    weekDriveSec: crew.driving.weekDriveSec,
    previousWeekDriveSec: crew.driving.previousWeekDriveSec,
    weekWorkSec: crew.driving.weekDriveSec,
    dutyWorkSec: crew.driving.dayDriveSec,
    nightInDuty: false,
    inSpainAfterInternational: false,
    cabotage: 0,
    emptyKm: 0,
    loadedKm: 0,
    driveSec: 0,
    revenueEur: 0,
    loadIds: [],
    legs: [],
    ...(record ? { activities: [] } : {}),
    ...(crew.delays?.length ? { delays: [...crew.delays].sort((a, b) => a.atMs - b.atMs) } : {}),
  };
}

/** Where a step failed and when (for the reason shown to the dispatcher). */
export type FailDetail = { code?: FailCode; atMs?: number; limitMs?: number; loadId?: string };
function fail(why: FailDetail | undefined, code: FailCode, atMs?: number, limitMs?: number): FailCode {
  if (why) {
    why.code = code;
    why.atMs = atMs;
    why.limitMs = limitMs;
  }
  return code;
}

function clone(s: CrewState): CrewState {
  return { ...s, loadIds: [...s.loadIds], legs: [...s.legs], ...(s.activities ? { activities: [...s.activities] } : {}) };
}

function push(s: CrewState, kind: Activity["kind"], sec: number, note?: string) {
  if (sec <= 0) return;
  const end = s.t + sec * 1000;
  s.activities?.push({ kind, startMs: s.t, endMs: end, ...(note ? { note } : {}) });
  s.t = end;
}

function takeBreak(s: CrewState) {
  push(s, "BREAK", BREAK, "pausa");
  s.continuousSec = 0;
  s.workSinceBreakSec = 0;
}

function takeDailyRest(s: CrewState) {
  push(s, "REST", DAILY_REST, "descanso diário");
  s.continuousSec = 0;
  s.workSinceBreakSec = 0;
  s.dayDriveSec = 0;
  s.dutyWorkSec = 0;
  s.nightInDuty = false;
  s.extendedToday = false;
  s.dutyStartMs = s.t;
}

const dutyLeftSec = (s: CrewState) => (s.dutyStartMs + DUTY_WINDOW * 1000 - s.t) / 1000;
/** A delay is due by `ms` (1 ms tolerance for rounding). */
const delayDue = (s: CrewState, ms: number) => s.delays !== undefined && s.delays[0]!.atMs <= ms + 1;

/** The next delay happens now: lost as driving (the safe reading) or as idle time. */
function applyDelay(s: CrewState): FailCode | undefined {
  const [d, ...later] = s.delays!;
  s.delays = later.length ? later : undefined;
  return d!.as === "waiting" ? waitUntil(s, s.t + d!.sec * 1000) : drive(s, d!.sec, "atraso");
}

/** Drives `sec`; a code when the weekly or fortnightly limit would be broken. */
function drive(s: CrewState, sec: number, note: string): FailCode | undefined {
  const r = driveUntil(s, sec, note, Infinity);
  return typeof r === "string" ? r : undefined;
}

/** Drives `sec`, stopping at `stopMs` (the truck stops): the seconds left undriven, or a failure code. */
function driveUntil(s: CrewState, sec: number, note: string, stopMs: number): FailCode | number {
  let left = sec;
  while (left > 1e-6) {
    if (s.t >= stopMs - 1) return left;
    if (delayDue(s, s.t)) {
      const f = applyDelay(s);
      if (f) return f;
      continue;
    }
    if (s.continuousSec >= MAX_CONTINUOUS - 1e-6 || s.workSinceBreakSec >= MAX_WORK_WITHOUT_BREAK - 1e-6) takeBreak(s);
    // A 10 h day is used only when it finishes the leg (at most twice a week).
    let dayLimit = s.extendedToday ? DAY_DRIVE_EXTENDED : DAY_DRIVE;
    if (!s.extendedToday && s.dayDriveSec + left > DAY_DRIVE && s.dayDriveSec + left <= DAY_DRIVE_EXTENDED && s.extendedDays < 2) {
      dayLimit = DAY_DRIVE_EXTENDED;
    }
    if (s.dayDriveSec >= dayLimit - 1e-6 || dutyLeftSec(s) <= 1e-6) {
      takeDailyRest(s);
      continue;
    }
    let chunk = Math.min(left, MAX_CONTINUOUS - s.continuousSec, MAX_WORK_WITHOUT_BREAK - s.workSinceBreakSec, dayLimit - s.dayDriveSec, dutyLeftSec(s), (stopMs - s.t) / 1000);
    // A delay in the middle of the leg: drive up to it (a break just taken may already have reached it).
    if (s.delays) {
      const toDelaySec = (s.delays[0]!.atMs - s.t) / 1000;
      if (toDelaySec <= 1e-3) continue;
      chunk = Math.min(chunk, toDelaySec);
    }
    if ((s.nightInDuty || touchesNight(s.t, chunk)) && s.dutyWorkSec + chunk > NIGHT_DUTY_WORK) {
      chunk = NIGHT_DUTY_WORK - s.dutyWorkSec;
      if (chunk <= 60) {
        takeDailyRest(s);
        continue;
      }
    }
    if (s.weekWorkSec + chunk > WEEK_WORK) return "WEEK_WORK";
    if (s.weekDriveSec + chunk > WEEK_DRIVE) return "WEEK_DRIVE";
    if (s.weekDriveSec + s.previousWeekDriveSec + chunk > FORTNIGHT_DRIVE) return "FORTNIGHT_DRIVE";
    if (s.dayDriveSec + chunk > DAY_DRIVE + 1e-6 && !s.extendedToday) {
      s.extendedToday = true;
      s.extendedDays++;
    }
    if (touchesNight(s.t, chunk)) s.nightInDuty = true;
    push(s, "DRIVE", chunk, note);
    s.weekWorkSec += chunk;
    s.dutyWorkSec += chunk;
    s.continuousSec += chunk;
    s.workSinceBreakSec += chunk;
    s.dayDriveSec += chunk;
    s.weekDriveSec += chunk;
    s.driveSec += chunk;
    left -= chunk;
  }
  return 0;
}

/** Loading or unloading: when it started, or a code when the weekly working time would be exceeded. */
function work(s: CrewState, sec: number, note: string): number | FailCode {
  if (delayDue(s, s.t)) {
    const f = applyDelay(s);
    if (f) return f;
  }
  if (s.workSinceBreakSec + sec > MAX_WORK_WITHOUT_BREAK) takeBreak(s);
  if (dutyLeftSec(s) < sec || ((s.nightInDuty || touchesNight(s.t, sec)) && s.dutyWorkSec + sec > NIGHT_DUTY_WORK)) takeDailyRest(s);
  if (s.weekWorkSec + sec > WEEK_WORK) return "WEEK_WORK";
  const startedAt = s.t;
  if (touchesNight(s.t, sec)) s.nightInDuty = true;
  push(s, "WORK", sec, note);
  s.workSinceBreakSec += sec;
  s.dutyWorkSec += sec;
  s.weekWorkSec += sec;
  // A delay during the service (a slow customer) comes after it.
  if (delayDue(s, s.t - 1)) {
    const f = applyDelay(s);
    if (f) return f;
  }
  return startedAt;
}

/** Idle until `ms`: a long wait is the daily rest, a wait past the duty window forces it now. */
function idleUntil(s: CrewState, ms: number) {
  const gap = (ms - s.t) / 1000;
  if (gap <= 0) return;
  if (gap >= DAILY_REST) {
    push(s, "REST", gap, "espera (descanso)");
    s.continuousSec = s.workSinceBreakSec = s.dayDriveSec = s.dutyWorkSec = 0;
    s.nightInDuty = false;
    s.extendedToday = false;
    s.dutyStartMs = s.t;
    return;
  }
  if (gap > dutyLeftSec(s)) {
    takeDailyRest(s);
    idleUntil(s, ms);
    return;
  }
  if (gap >= BREAK) {
    push(s, "BREAK", gap, "espera");
    s.continuousSec = s.workSinceBreakSec = 0;
  } else push(s, "AVAILABLE", gap, "espera");
}

/** Idle until `ms`, with any delay that falls in the wait (a delay while waiting only matters if it outlasts it). */
function waitUntil(s: CrewState, ms: number): FailCode | undefined {
  while (s.delays && s.delays[0]!.atMs < ms) {
    idleUntil(s, s.delays[0]!.atMs);
    const f = applyDelay(s);
    if (f) return f;
  }
  idleUntil(s, ms);
  return undefined;
}

/**
 * The crew does `load` next: the new state, or why it cannot (a window, a driving limit, cabotage,
 * the truck out of service…). `why` gets the detail (when it would arrive, what the limit was).
 */
export function appendLoadWhy(prev: CrewState, load: Load, travel: Travel, crew: Crew, why?: FailDetail): CrewState | FailCode {
  if (!isPlannableLoad(load)) return fail(why, "INVALID_DATA");
  if (load.equipment !== crew.equipment) return fail(why, "EQUIPMENT");
  const out = crew.outOfServiceFromMs;
  if (out !== undefined && prev.t >= out) return fail(why, "OUT_OF_SERVICE", prev.t, out);
  const cabotage = load.fromCountry === "ES" && load.toCountry === "ES";
  if (cabotage && (!prev.inSpainAfterInternational || prev.cabotage >= CABOTAGE_PER_WEEK)) return fail(why, "CABOTAGE");
  const s = clone(prev);
  let f: FailCode | undefined;
  // Replanning, first load not already under way: finish the trip already begun, and start nothing before the replan moment.
  if (crew.replan && s.loadIds.length === crew.replan.frozenLoadIds.length) {
    if ((f = finishTripUnderWay(s, crew, travel))) return fail(why, f, s.t);
    if (s.t < crew.replan.fromMs && (f = waitUntil(s, crew.replan.fromMs))) return fail(why, f, s.t);
  }
  const empty = travel(s.pos, load.from);
  if (empty.km > 0.05 && (f = drive(s, empty.sec, `vazio para ${load.fromName}`))) return fail(why, f, s.t);
  s.emptyKm += empty.km;
  s.legs.push({ to: load.from, km: empty.km, loaded: false });
  if ((f = waitUntil(s, load.pickupStartMs))) return fail(why, f, s.t);
  if (s.t > load.pickupEndMs) return fail(why, "PICKUP_LATE", s.t, load.pickupEndMs);
  // A rest forced before loading can push the start past the window: check when loading starts.
  const loadedAt = work(s, load.pickupServiceSec, `carga ${load.id}`);
  if (typeof loadedAt === "string") return fail(why, loadedAt, s.t);
  if (loadedAt > load.pickupEndMs) return fail(why, "PICKUP_LATE", loadedAt, load.pickupEndMs);
  const loaded = travel(load.from, load.to);
  if ((f = drive(s, loaded.sec, `${load.fromName} → ${load.toName}`))) return fail(why, f, s.t);
  s.loadedKm += loaded.km;
  s.legs.push({ to: load.to, km: loaded.km, loaded: true });
  if ((f = waitUntil(s, load.deliveryStartMs))) return fail(why, f, s.t);
  if (s.t > load.deliveryEndMs) return fail(why, "DELIVERY_LATE", s.t, load.deliveryEndMs);
  const unloadedAt = work(s, load.deliveryServiceSec, `descarga ${load.id}`);
  if (typeof unloadedAt === "string") return fail(why, unloadedAt, s.t);
  if (unloadedAt > load.deliveryEndMs) return fail(why, "DELIVERY_LATE", unloadedAt, load.deliveryEndMs);
  if (out !== undefined && s.t > out) return fail(why, "OUT_OF_SERVICE", s.t, out);
  s.pos = load.to;
  s.revenueEur += load.rateEur;
  if (cabotage) s.cabotage++;
  if (load.toCountry === "ES" && load.fromCountry === "PT") s.inSpainAfterInternational = true;
  if (load.toCountry === "PT") s.inSpainAfterInternational = false;
  s.loadIds.push(load.id);
  return s;
}

/**
 * Replanning: the trip the crew had already begun after its frozen loads (`crew.replan.thenTo`).
 * A truck that stops on the way stops there (position taken along the straight line).
 */
function finishTripUnderWay(s: CrewState, crew: Crew, travel: Travel): FailCode | undefined {
  const to = crew.replan?.thenTo;
  if (!to) return undefined;
  const leg = travel(s.pos, to.at);
  if (leg.km <= 0.05) return undefined;
  const left = driveUntil(s, leg.sec, to.note, crew.outOfServiceFromMs ?? Infinity);
  if (typeof left === "string") return left;
  const done = leg.sec > 0 ? 1 - left / leg.sec : 1;
  const at: LatLng = done >= 1 ? to.at : [s.pos[0] + (to.at[0] - s.pos[0]) * done, s.pos[1] + (to.at[1] - s.pos[1]) * done];
  s.emptyKm += leg.km * done;
  s.legs.push({ to: at, km: leg.km * done, loaded: false });
  s.pos = at;
  return undefined;
}

/** The crew does `load` next. Null when a window, a driving limit or the cabotage rule fails. */
export function appendLoad(prev: CrewState, load: Load, travel: Travel, crew: Crew): CrewState | null {
  const s = appendLoadWhy(prev, load, travel, crew);
  return typeof s === "string" ? null : s;
}

/** Drive home for the weekly rest, or why it cannot be home by `homeByMs`. A truck out of service stays where it is. */
export function returnHomeWhy(prev: CrewState, crew: Crew, travel: Travel, why?: FailDetail): CrewState | FailCode {
  const s = clone(prev);
  let f: FailCode | undefined;
  if (crew.replan && s.loadIds.length === crew.replan.frozenLoadIds.length) {
    if ((f = finishTripUnderWay(s, crew, travel))) return fail(why, f, s.t);
    if (crew.outOfServiceFromMs !== undefined) return s;
    // Heading home from somewhere else is a new decision too.
    if (s.t < crew.replan.fromMs && travel(s.pos, crew.home).km > 0.05 && (f = waitUntil(s, crew.replan.fromMs))) return fail(why, f, s.t);
  }
  if (crew.outOfServiceFromMs !== undefined) return s;
  const leg = travel(s.pos, crew.home);
  if (leg.km > 0.05 && (f = drive(s, leg.sec, `regresso a ${crew.homeName}`))) return fail(why, f, s.t);
  s.emptyKm += leg.km;
  s.legs.push({ to: crew.home, km: leg.km, loaded: false });
  s.pos = crew.home;
  return s.t <= crew.homeByMs ? s : fail(why, "NOT_HOME", s.t, crew.homeByMs);
}

/** Drive home for the weekly rest; null when it cannot be home by `homeByMs`. */
export function returnHome(prev: CrewState, crew: Crew, travel: Travel): CrewState | null {
  const s = returnHomeWhy(prev, crew, travel);
  return typeof s === "string" ? null : s;
}

/** Whole route, or the first step that fails (index = loads.length for the trip home) and why. */
export function scheduleRouteWhy(crew: Crew, loads: Load[], travel: Travel, record = false): { state: CrewState } | { fail: FailDetail & { code: FailCode }; index: number } {
  let s: CrewState = initialState(crew, record);
  const why: FailDetail = {};
  for (let i = 0; i < loads.length; i++) {
    const next = appendLoadWhy(s, loads[i]!, travel, crew, why);
    if (typeof next === "string") return { fail: { ...why, code: next, loadId: loads[i]!.id }, index: i };
    s = next;
  }
  const home = returnHomeWhy(s, crew, travel, why);
  return typeof home === "string" ? { fail: { ...why, code: home }, index: loads.length } : { state: home };
}

/** Whole route for a crew: loads in order, then home. Null when any step is infeasible. */
export function scheduleRoute(crew: Crew, loads: Load[], travel: Travel, record = false): CrewState | null {
  const r = scheduleRouteWhy(crew, loads, travel, record);
  return "state" in r ? r.state : null;
}
