import { describe, expect, it } from "vitest";
import { validateDriverTimeline, type Activity, type ActivityKind, type RuleCode } from "./driverLegality";

const M = 60_000;
/** Monday 12 Oct 2026 06:00 Lisbon (WEST, UTC+1). */
const MON = Date.parse("2026-10-12T06:00:00+01:00");

/** Build a timeline from [kind, minutes] steps starting at `t`. */
function tl(t: number, steps: [ActivityKind, number][]): Activity[] {
  const out: Activity[] = [];
  for (const [kind, min] of steps) { out.push({ kind, startMs: t, endMs: t + min * M }); t += min * M; }
  return out;
}
/** A normal legal day: 4h30 drive, 45 break, 4h drive, 1h work, then 11 h rest. */
const day: [ActivityKind, number][] = [["WORK", 30], ["DRIVE", 270], ["BREAK", 45], ["DRIVE", 240], ["WORK", 30], ["REST", 660]];
const rules = (a: Activity[], o = {}) => validateDriverTimeline(a, { afterWeeklyRestEndMs: a[0]!.startMs, ...o }).violations.map((v) => v.rule);
const has = (a: Activity[], r: RuleCode) => rules(a).includes(r);

describe("Reg. 561/2006 — driving and breaks", () => {
  it("a normal day is legal", () => expect(rules(tl(MON, day))).toEqual([]));

  it("4h30 without a break is flagged; 45 min or 15+30 split are valid", () => {
    expect(has(tl(MON, [["DRIVE", 300], ["REST", 660]]), "BREAK_AFTER_4H30")).toBe(true);
    expect(has(tl(MON, [["DRIVE", 200], ["BREAK", 15], ["DRIVE", 70], ["BREAK", 30], ["DRIVE", 200], ["REST", 660]]), "BREAK_AFTER_4H30")).toBe(false);
    // 30 then 15 is NOT a valid split (first part must be ≥ 15, second ≥ 30).
    expect(has(tl(MON, [["DRIVE", 200], ["BREAK", 30], ["DRIVE", 70], ["BREAK", 15], ["DRIVE", 60], ["REST", 660]]), "BREAK_AFTER_4H30")).toBe(true);
    // Waiting (availability) is not a break.
    expect(has(tl(MON, [["DRIVE", 200], ["AVAILABLE", 60], ["DRIVE", 100], ["REST", 660]]), "BREAK_AFTER_4H30")).toBe(true);
  });

  it("daily driving: 9 h normal, 10 h at most twice per week", () => {
    const ten: [ActivityKind, number][] = [["DRIVE", 270], ["BREAK", 45], ["DRIVE", 270], ["BREAK", 45], ["DRIVE", 60], ["REST", 660]];
    expect(rules(tl(MON, [...ten, ...ten]))).toEqual([]);
    expect(has(tl(MON, [...ten, ...ten, ...ten]), "DAILY_DRIVING_10H_MAX_TWICE")).toBe(true);
    expect(has(tl(MON, [["DRIVE", 270], ["BREAK", 45], ["DRIVE", 270], ["BREAK", 45], ["DRIVE", 90], ["REST", 660]]), "DAILY_DRIVING_9H")).toBe(true);
  });

  it("daily rest: 11 h regular, 9 h reduced (max 3), 3 + 9 split, within 24 h", () => {
    const short: [ActivityKind, number][] = [["DRIVE", 270], ["BREAK", 45], ["DRIVE", 180], ["REST", 540]];
    const r = validateDriverTimeline(tl(MON, [...short, ...short, ...short]), { afterWeeklyRestEndMs: MON });
    expect(r.violations).toEqual([]);
    expect(r.weeks[0]!.reducedDailyRests).toBe(3);
    expect(has(tl(MON, [...short, ...short, ...short, ...short]), "REDUCED_DAILY_REST_MAX_3")).toBe(true);
    // 8 h rest is not a daily rest.
    expect(has(tl(MON, [["DRIVE", 270], ["BREAK", 45], ["DRIVE", 180], ["REST", 480], ["DRIVE", 60], ["AVAILABLE", 480]]), "DAILY_REST")).toBe(true);
    // Split 3 h + 9 h within the 24 h window = regular rest (not counted as reduced).
    const split = validateDriverTimeline(tl(MON, [["DRIVE", 240], ["REST", 180], ["DRIVE", 240], ["BREAK", 45], ["DRIVE", 60], ["REST", 540], ["DRIVE", 60]]), { afterWeeklyRestEndMs: MON });
    expect(split.violations.map((v) => v.rule)).toEqual([]);
    expect(split.weeks[0]!.reducedDailyRests).toBe(0);
    // Rest started too late: 16 h on duty, then 11 h rest ⇒ only 8 h inside the 24 h window.
    expect(has(tl(MON, [["DRIVE", 270], ["BREAK", 45], ["DRIVE", 180], ["AVAILABLE", 465], ["REST", 660]]), "DAILY_REST")).toBe(true);
  });

  it("weekly driving 56 h and 90 h over two consecutive weeks, with carried history", () => {
    const tenDay: [ActivityKind, number][] = [["DRIVE", 270], ["BREAK", 45], ["DRIVE", 270], ["BREAK", 45], ["DRIVE", 60], ["REST", 750]];
    const nineDay: [ActivityKind, number][] = [["DRIVE", 270], ["BREAK", 45], ["DRIVE", 270], ["REST", 855]];
    // Week 1: 2 × 10 h + 4 × 9 h = 56 h (Mon–Sat), then a 45 h+ weekly rest.
    const w1 = tl(MON, [...tenDay, ...tenDay, ...nineDay, ...nineDay, ...nineDay, ...nineDay, ["REST", 2000]]);
    expect(rules(w1)).toEqual([]);
    // Week 2 continues the same driver: 4 × 9 h = 36 h ⇒ 92 h over the fortnight.
    const w2start = w1.at(-1)!.endMs;
    const w2 = tl(w2start, [...nineDay, ...nineDay, ...nineDay, ...nineDay]);
    expect(has([...w1, ...w2], "FORTNIGHT_DRIVING_90H")).toBe(true);
    // Validated alone (no history) the same week is legal — the carry is what catches it.
    expect(has(w2, "FORTNIGHT_DRIVING_90H")).toBe(false);
    expect(has(tl(MON, [...tenDay, ...tenDay, ...nineDay, ...nineDay, ...nineDay, ...nineDay, ...nineDay]), "WEEKLY_DRIVING_56H")).toBe(true);
  });

  it("weekly rest: within 6 × 24 h, no two reduced in a row, reduced is compensated within 3 weeks", () => {
    const d: [ActivityKind, number][] = [["DRIVE", 240], ["BREAK", 45], ["DRIVE", 240], ["REST", 795]];
    // Last day ends with work, so the weekly rest is not merged with a preceding daily rest.
    const week = (rest: number): [ActivityKind, number][] => [...d, ...d, ...d, ...d, ["DRIVE", 240], ["BREAK", 45], ["DRIVE", 240], ["REST", rest]];
    // 7 working days with no weekly rest.
    expect(has(tl(MON, [...d, ...d, ...d, ...d, ...d, ...d, ...d]), "WEEKLY_REST_WITHIN_6_DAYS")).toBe(true);
    // Reduced (30 h) then reduced again ⇒ flagged.
    expect(has(tl(MON, [...week(30 * 60), ...week(30 * 60), ...d]), "WEEKLY_REST_TWO_REDUCED")).toBe(true);
    // Reduced 30 h, never compensated over 4 weeks ⇒ flagged; compensated by a 60 h rest (15 h surplus) ⇒ legal.
    const unpaid = tl(MON, [...week(30 * 60), ...week(46 * 60), ...week(46 * 60), ...week(46 * 60), ...week(46 * 60)]);
    expect(has(unpaid, "WEEKLY_REST_COMPENSATION")).toBe(true);
    const paid = tl(MON, [...week(30 * 60), ...week(60 * 60), ...week(46 * 60), ...week(46 * 60), ...week(46 * 60)]);
    expect(has(paid, "WEEKLY_REST_COMPENSATION")).toBe(false);
    // A 30 h midweek stop followed by the weekend at home in time is a long daily rest, not a reduced weekly rest.
    const midweek = validateDriverTimeline(tl(MON, [...d, ...d, ["DRIVE", 240], ["REST", 30 * 60], ...d, ["DRIVE", 240], ["REST", 50 * 60]]), { afterWeeklyRestEndMs: MON });
    expect(midweek.violations).toEqual([]);
    expect(midweek.weeklyRests.map((w) => w.kind)).toEqual(["REGULAR"]);
    const open = validateDriverTimeline(tl(MON, [...week(30 * 60), ...d]), { afterWeeklyRestEndMs: MON });
    expect(open.openDebts).toHaveLength(1);
    expect(open.openDebts[0]!.hours).toBe(15);
  });
});

describe("Dir. 2002/15/CE — working time, separate from driving", () => {
  it("loading/unloading counts as working time: 6 h without a 15-min break is flagged", () => {
    expect(has(tl(MON, [["WORK", 90], ["DRIVE", 240], ["WORK", 60], ["REST", 660]]), "WORKING_TIME_6H_WITHOUT_BREAK")).toBe(true);
    // Same work with a 15-min break: legal for working time.
    expect(has(tl(MON, [["WORK", 90], ["DRIVE", 200], ["BREAK", 15], ["DRIVE", 40], ["WORK", 60], ["BREAK", 15], ["REST", 660]]), "WORKING_TIME_6H_WITHOUT_BREAK")).toBe(false);
  });

  it("> 9 h of working time needs ≥ 45 min of breaks; 6–9 h needs ≥ 30 min", () => {
    expect(has(tl(MON, [["WORK", 120], ["BREAK", 20], ["DRIVE", 240], ["BREAK", 20], ["WORK", 240], ["REST", 660]]), "WORKING_TIME_DAILY_BREAKS")).toBe(true);
    expect(has(tl(MON, [["WORK", 120], ["BREAK", 25], ["DRIVE", 240], ["BREAK", 20], ["WORK", 240], ["REST", 660]]), "WORKING_TIME_DAILY_BREAKS")).toBe(false);
  });

  it("weekly working time max 60 h, even when driving is within 56 h", () => {
    const longDay: [ActivityKind, number][] = [["WORK", 120], ["BREAK", 15], ["DRIVE", 270], ["BREAK", 45], ["DRIVE", 270], ["BREAK", 15], ["WORK", 60], ["REST", 645]];
    const r = validateDriverTimeline(tl(MON, [...longDay, ...longDay, ...longDay, ...longDay, ...longDay, ...longDay]), { afterWeeklyRestEndMs: MON });
    expect(r.weeks[0]!.drivingH).toBe(54);
    expect(r.violations.map((v) => v.rule)).toContain("WORKING_TIME_WEEKLY_60H");
    expect(r.violations.map((v) => v.rule)).not.toContain("WEEKLY_DRIVING_56H");
  });

  it("availability is reported separately and is neither working time nor a break", () => {
    const r = validateDriverTimeline(tl(MON, [["DRIVE", 240], ["AVAILABLE", 120], ["DRIVE", 40], ["BREAK", 45], ["WORK", 30], ["REST", 660]]), { afterWeeklyRestEndMs: MON });
    expect(r.weeks[0]!.availabilityH).toBe(2);
    expect(r.weeks[0]!.workingTimeH).toBe(5.2);
    expect(r.violations.map((v) => v.rule)).toContain("BREAK_AFTER_4H30");
  });

  it("night work: a duty period touching 00:00–05:00 is limited to 10 h of working time", () => {
    const evening = Date.parse("2026-10-12T19:00:00+01:00");
    const night = tl(evening, [["WORK", 60], ["DRIVE", 270], ["BREAK", 45], ["DRIVE", 270], ["BREAK", 15], ["WORK", 60], ["REST", 660]]);
    expect(has(night, "NIGHT_WORK_10H")).toBe(true);
    // The same 11 h of work in daytime is not night work.
    expect(has(tl(MON, [["WORK", 60], ["DRIVE", 270], ["BREAK", 45], ["DRIVE", 270], ["BREAK", 15], ["WORK", 60], ["REST", 660]]), "NIGHT_WORK_10H")).toBe(false);
  });
});
