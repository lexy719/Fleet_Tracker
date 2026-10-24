import type { Activity } from "../legal/driverLegality";
import { isPlannableLoad, type Crew, type LatLng, type Load, type Travel } from "./model";

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
function lisbonOffsetMs(ms: number): number {
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
  };
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

/** Drives `sec`; false when the weekly or fortnightly limit would be broken. */
function drive(s: CrewState, sec: number, note: string): boolean {
  let left = sec;
  while (left > 1e-6) {
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
    let chunk = Math.min(left, MAX_CONTINUOUS - s.continuousSec, MAX_WORK_WITHOUT_BREAK - s.workSinceBreakSec, dayLimit - s.dayDriveSec, dutyLeftSec(s));
    if ((s.nightInDuty || touchesNight(s.t, chunk)) && s.dutyWorkSec + chunk > NIGHT_DUTY_WORK) {
      chunk = NIGHT_DUTY_WORK - s.dutyWorkSec;
      if (chunk <= 60) {
        takeDailyRest(s);
        continue;
      }
    }
    if (s.weekWorkSec + chunk > WEEK_WORK) return false;
    if (s.weekDriveSec + chunk > WEEK_DRIVE || s.weekDriveSec + s.previousWeekDriveSec + chunk > FORTNIGHT_DRIVE) return false;
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
  return true;
}

/** Loading or unloading; false when the weekly working time would be exceeded. */
function work(s: CrewState, sec: number, note: string): boolean {
  if (s.workSinceBreakSec + sec > MAX_WORK_WITHOUT_BREAK) takeBreak(s);
  if (dutyLeftSec(s) < sec || ((s.nightInDuty || touchesNight(s.t, sec)) && s.dutyWorkSec + sec > NIGHT_DUTY_WORK)) takeDailyRest(s);
  if (s.weekWorkSec + sec > WEEK_WORK) return false;
  if (touchesNight(s.t, sec)) s.nightInDuty = true;
  push(s, "WORK", sec, note);
  s.workSinceBreakSec += sec;
  s.dutyWorkSec += sec;
  s.weekWorkSec += sec;
  return true;
}

/** Idle until `ms`: a long wait is the daily rest, a wait past the duty window forces it now. */
function waitUntil(s: CrewState, ms: number) {
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
    waitUntil(s, ms);
    return;
  }
  if (gap >= BREAK) {
    push(s, "BREAK", gap, "espera");
    s.continuousSec = s.workSinceBreakSec = 0;
  } else push(s, "AVAILABLE", gap, "espera");
}

/** The crew does `load` next. Null when a window, a driving limit or the cabotage rule fails. */
export function appendLoad(prev: CrewState, load: Load, travel: Travel, crew: Crew): CrewState | null {
  if (load.equipment !== crew.equipment || !isPlannableLoad(load)) return null;
  const cabotage = load.fromCountry === "ES" && load.toCountry === "ES";
  if (cabotage && (!prev.inSpainAfterInternational || prev.cabotage >= CABOTAGE_PER_WEEK)) return null;
  const s = clone(prev);
  const empty = travel(s.pos, load.from);
  if (empty.km > 0.05 && !drive(s, empty.sec, `vazio para ${load.fromName}`)) return null;
  s.emptyKm += empty.km;
  s.legs.push({ to: load.from, km: empty.km, loaded: false });
  waitUntil(s, load.pickupStartMs);
  if (s.t > load.pickupEndMs) return null;
  // A rest forced before loading can push the start past the window: check when loading starts.
  if (!work(s, load.pickupServiceSec, `carga ${load.id}`) || s.t - load.pickupServiceSec * 1000 > load.pickupEndMs) return null;
  const loaded = travel(load.from, load.to);
  if (!drive(s, loaded.sec, `${load.fromName} → ${load.toName}`)) return null;
  s.loadedKm += loaded.km;
  s.legs.push({ to: load.to, km: loaded.km, loaded: true });
  waitUntil(s, load.deliveryStartMs);
  if (s.t > load.deliveryEndMs) return null;
  if (!work(s, load.deliveryServiceSec, `descarga ${load.id}`) || s.t - load.deliveryServiceSec * 1000 > load.deliveryEndMs) return null;
  s.pos = load.to;
  s.revenueEur += load.rateEur;
  if (cabotage) s.cabotage++;
  if (load.toCountry === "ES" && load.fromCountry === "PT") s.inSpainAfterInternational = true;
  if (load.toCountry === "PT") s.inSpainAfterInternational = false;
  s.loadIds.push(load.id);
  return s;
}

/** Drive home for the weekly rest; null when it cannot be home by `homeByMs`. */
export function returnHome(prev: CrewState, crew: Crew, travel: Travel): CrewState | null {
  const s = clone(prev);
  const leg = travel(s.pos, crew.home);
  if (leg.km > 0.05 && !drive(s, leg.sec, `regresso a ${crew.homeName}`)) return null;
  s.emptyKm += leg.km;
  s.legs.push({ to: crew.home, km: leg.km, loaded: false });
  s.pos = crew.home;
  return s.t <= crew.homeByMs ? s : null;
}

/** Whole route for a crew: loads in order, then home. Null when any step is infeasible. */
export function scheduleRoute(crew: Crew, loads: Load[], travel: Travel, record = false): CrewState | null {
  let s: CrewState | null = initialState(crew, record);
  for (const l of loads) {
    s = appendLoad(s, l, travel, crew);
    if (!s) return null;
  }
  return returnHome(s, crew, travel);
}
