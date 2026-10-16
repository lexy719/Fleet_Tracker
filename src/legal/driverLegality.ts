/*
 * Driver legality audit over a multi-week activity timeline.
 *
 * Driving time, breaks and rest: Regulation (EC) 561/2006 (arts. 4, 6, 7, 8).
 * Working time, breaks from work, night work: Directive 2002/15/EC (arts. 3, 4, 5, 7),
 * transposed in Portugal by DL 237/2007. Working time and driving time are checked separately.
 *
 * The audit is independent of the planner: it only sees what the driver does, minute by minute,
 * and reports every rule broken. Gaps between activities are treated as REST (driver off duty).
 *
 * Not modelled (reported as assumptions, never silently passed): ferry/train interruptions
 * (art. 9), multi-manning, the 12-day derogation (art. 8(6a)), two consecutive reduced weekly
 * rests in international transport (art. 8(6) as amended by Reg. 2020/1054), art. 12 deviations.
 */

export type ActivityKind = "DRIVE" | "WORK" | "AVAILABLE" | "BREAK" | "REST";
export type Activity = { kind: ActivityKind; startMs: number; endMs: number; note?: string };

export type RuleCode =
  | "BREAK_AFTER_4H30"
  | "DAILY_DRIVING_9H"
  | "DAILY_DRIVING_10H_MAX_TWICE"
  | "DAILY_REST"
  | "REDUCED_DAILY_REST_MAX_3"
  | "WEEKLY_DRIVING_56H"
  | "FORTNIGHT_DRIVING_90H"
  | "WEEKLY_REST_WITHIN_6_DAYS"
  | "WEEKLY_REST_TWO_REDUCED"
  | "WEEKLY_REST_COMPENSATION"
  | "WORKING_TIME_6H_WITHOUT_BREAK"
  | "WORKING_TIME_DAILY_BREAKS"
  | "WORKING_TIME_WEEKLY_60H"
  | "WORKING_TIME_AVERAGE_48H"
  | "NIGHT_WORK_10H";

export const RULE_BASIS: Record<RuleCode, string> = {
  BREAK_AFTER_4H30: "Reg. 561/2006 art. 7",
  DAILY_DRIVING_9H: "Reg. 561/2006 art. 6(1)",
  DAILY_DRIVING_10H_MAX_TWICE: "Reg. 561/2006 art. 6(1)",
  DAILY_REST: "Reg. 561/2006 art. 8(1)(2)",
  REDUCED_DAILY_REST_MAX_3: "Reg. 561/2006 art. 8(4)",
  WEEKLY_DRIVING_56H: "Reg. 561/2006 art. 6(2)",
  FORTNIGHT_DRIVING_90H: "Reg. 561/2006 art. 6(3)",
  WEEKLY_REST_WITHIN_6_DAYS: "Reg. 561/2006 art. 8(6)",
  WEEKLY_REST_TWO_REDUCED: "Reg. 561/2006 art. 8(6)",
  WEEKLY_REST_COMPENSATION: "Reg. 561/2006 art. 8(6)(7)",
  WORKING_TIME_6H_WITHOUT_BREAK: "Dir. 2002/15/CE art. 5(1)",
  WORKING_TIME_DAILY_BREAKS: "Dir. 2002/15/CE art. 5(1)",
  WORKING_TIME_WEEKLY_60H: "Dir. 2002/15/CE art. 4(a)",
  WORKING_TIME_AVERAGE_48H: "Dir. 2002/15/CE art. 4(a)",
  NIGHT_WORK_10H: "Dir. 2002/15/CE art. 7(1)",
};

export type Violation = { rule: RuleCode; basis: string; atMs: number; detail: string };

export type LegalityPolicy = {
  /** Calendar week (Mon 00:00 – Sun 24:00) and night period are read in this time zone. */
  timeZone: string;
  /** Night period for Dir. 2002/15 art. 7 (any 4 h between 00:00 and 07:00, set by national law). */
  nightStartH: number;
  nightEndH: number;
  /** Reference period for the 48 h average (Dir. 2002/15 art. 4(a): 4 months ≈ 17 weeks). */
  averageReferenceWeeks: number;
};

export const DEFAULT_LEGALITY_POLICY: LegalityPolicy = {
  timeZone: "Europe/Lisbon",
  // Conservative default (the wider window catches more): confirm against DL 237/2007.
  nightStartH: 0,
  nightEndH: 5,
  averageReferenceWeeks: 17,
};

export type WeekStats = {
  weekStartLocal: string;
  drivingH: number;
  otherWorkH: number;
  workingTimeH: number;
  availabilityH: number;
  extendedDrivingDays: number;
  reducedDailyRests: number;
};

export type WeeklyRest = { startMs: number; endMs: number; hours: number; kind: "REGULAR" | "REDUCED" };
export type RestDebt = { fromRestStartMs: number; hours: number; dueByMs: number; paidAtMs?: number };

export type LegalityReport = {
  legal: boolean;
  violations: Violation[];
  weeks: WeekStats[];
  weeklyRests: WeeklyRest[];
  /** Weekly-rest compensation still owed at the end of the timeline (not yet overdue). */
  openDebts: RestDebt[];
  averageWorkingTimeH: number;
  assumptions: string[];
};

const H = 3_600_000;
const MIN = 60_000;

/* ── time zone helpers ─────────────────────────────────────────────── */

function partsFor(tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
  return (ms: number) => {
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour!, min: +p.minute!, wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday!) };
  };
}

/** Start (UTC ms) of the local day containing `ms`. */
function localMidnight(ms: number, parts: ReturnType<typeof partsFor>): number {
  const p = parts(ms);
  // Walk back the local clock time; DST shifts are corrected by re-reading the result.
  let t = ms - (p.h * 60 + p.min) * MIN - (ms % MIN);
  const q = parts(t);
  if (q.h !== 0 || q.min !== 0) t -= (q.h * 60 + q.min) * MIN;
  return t;
}

function weekStartOf(ms: number, parts: ReturnType<typeof partsFor>): number {
  const day = localMidnight(ms, parts);
  return localMidnight(day - parts(day).wd * 24 * H + 2 * H, parts);
}

/* ── normalisation ─────────────────────────────────────────────────── */

/** Sort, clip overlaps, fill gaps with REST, merge adjacent runs of the same kind. */
export function normaliseTimeline(acts: Activity[]): Activity[] {
  const sorted = acts.filter((a) => a.endMs > a.startMs).sort((a, b) => a.startMs - b.startMs);
  const out: Activity[] = [];
  for (const a of sorted) {
    const last = out.at(-1);
    let start = a.startMs;
    if (last && start < last.endMs) start = last.endMs; // overlap: earlier activity wins
    if (start >= a.endMs) continue;
    if (last && start > last.endMs) out.push({ kind: "REST", startMs: last.endMs, endMs: start, note: "gap" });
    const prev = out.at(-1);
    if (prev && prev.kind === a.kind && prev.endMs === start) prev.endMs = a.endMs;
    else out.push({ kind: a.kind, startMs: start, endMs: a.endMs, ...(a.note ? { note: a.note } : {}) });
  }
  return out;
}

/* ── validator ─────────────────────────────────────────────────────── */

type RestRun = { startMs: number; endMs: number; len: number };

export function validateDriverTimeline(
  input: Activity[],
  opts: { policy?: Partial<LegalityPolicy>; /** Timeline begins right after a regular weekly rest ending here. */ afterWeeklyRestEndMs?: number } = {},
): LegalityReport {
  const policy = { ...DEFAULT_LEGALITY_POLICY, ...opts.policy };
  const parts = partsFor(policy.timeZone);
  const acts = normaliseTimeline(input);
  const violations: Violation[] = [];
  const flag = (rule: RuleCode, atMs: number, detail: string) => violations.push({ rule, basis: RULE_BASIS[rule], atMs, detail });
  const assumptions = [
    "Intervalos sem atividade registada contam como descanso.",
    "Disponibilidade (espera conhecida) não conta como pausa nem como tempo de trabalho.",
    `Semana e período noturno lidos em ${policy.timeZone}; período noturno ${policy.nightStartH}h–${policy.nightEndH}h (confirmar com o DL 237/2007).`,
    "Não modelado: ferry/comboio (art. 9), tripulação múltipla, derrogação de 12 dias, dois descansos semanais reduzidos consecutivos em transporte internacional (Reg. 2020/1054).",
  ];
  if (!acts.length) return { legal: true, violations, weeks: [], weeklyRests: [], openDebts: [], averageWorkingTimeH: 0, assumptions };
  const t0 = acts[0]!.startMs;
  const tEnd = acts.at(-1)!.endMs;
  // The driver was resting (weekly rest) until the first activity, so that rest ends at t0 at the earliest.
  const weeklyRestEnd0 = Math.max(opts.afterWeeklyRestEndMs ?? t0, t0);

  // Rest runs: maximal stretches of REST (BREAK inside does not join a rest run).
  const rests: RestRun[] = [];
  for (const a of acts) if (a.kind === "REST") rests.push({ startMs: a.startMs, endMs: a.endMs, len: a.endMs - a.startMs });

  /* Weekly rests (≥ 24 h) and compensation. */
  // A rest ≥ 45 h is a regular weekly rest. A 24–45 h rest is designated a (reduced) weekly rest
  // only when it is needed: if the next weekly-rest candidate still starts within 6 × 24 h of the
  // previous weekly rest, the driver can treat it as a long daily rest (no compensation owed).
  const candidates = rests.filter((r) => r.len >= 24 * H);
  const weeklyRests: WeeklyRest[] = [];
  {
    let lastEnd = weeklyRestEnd0;
    candidates.forEach((r, i) => {
      if (r.len < 45 * H) {
        const next = candidates[i + 1];
        const nextStartsInTime = next ? next.startMs - lastEnd <= 6 * 24 * H : tEnd - lastEnd <= 6 * 24 * H;
        if (nextStartsInTime) return;
      }
      weeklyRests.push({ startMs: r.startMs, endMs: r.endMs, hours: r.len / H, kind: r.len >= 45 * H ? "REGULAR" : "REDUCED" });
      lastEnd = r.endMs;
    });
  }
  {
    let lastEnd = weeklyRestEnd0;
    for (const w of weeklyRests) {
      if (w.startMs - lastEnd > 6 * 24 * H) flag("WEEKLY_REST_WITHIN_6_DAYS", lastEnd + 6 * 24 * H, `descanso semanal começou ${((w.startMs - lastEnd) / H - 144).toFixed(1)} h depois do fim do sexto período de 24 h`);
      lastEnd = w.endMs;
    }
    if (tEnd - lastEnd > 6 * 24 * H) flag("WEEKLY_REST_WITHIN_6_DAYS", lastEnd + 6 * 24 * H, "sem descanso semanal ao fim de seis períodos de 24 h");
    for (let i = 1; i < weeklyRests.length; i++) {
      if (weeklyRests[i]!.kind === "REDUCED" && weeklyRests[i - 1]!.kind === "REDUCED") flag("WEEKLY_REST_TWO_REDUCED", weeklyRests[i]!.startMs, "dois descansos semanais reduzidos seguidos");
    }
  }
  const debts: RestDebt[] = [];
  for (const w of weeklyRests) {
    if (w.kind !== "REDUCED") continue;
    const weekEnd = weekStartOf(w.startMs, parts) + 7 * 24 * H;
    debts.push({ fromRestStartMs: w.startMs, hours: 45 - w.hours, dueByMs: weekEnd + 3 * 7 * 24 * H });
  }
  // Repay en bloc, attached to a rest of ≥ 9 h, from that rest's surplus over its own requirement.
  for (const r of rests) {
    if (r.len < 9 * H) continue;
    const own = r.len >= 24 * H ? (r.len >= 45 * H ? 45 * H : r.len) : r.len >= 11 * H ? 11 * H : 9 * H;
    let surplus = r.len - own;
    for (const d of debts) {
      if (d.paidAtMs !== undefined || r.startMs <= d.fromRestStartMs || r.startMs > d.dueByMs) continue;
      if (surplus >= d.hours * H) {
        d.paidAtMs = r.startMs;
        surplus -= d.hours * H;
      }
    }
  }
  for (const d of debts) if (d.paidAtMs === undefined && d.dueByMs < tEnd) flag("WEEKLY_REST_COMPENSATION", d.dueByMs, `compensação de ${d.hours.toFixed(1)} h do descanso semanal reduzido não gozada no prazo`);

  /* Breaks from driving (561 art. 7, with 15 + 30 split). */
  {
    let cont = 0;
    let splitFirst = false;
    let flagged = false;
    let runStart = -1;
    const closeRun = (endMs: number) => {
      if (runStart < 0) return;
      const len = endMs - runStart;
      runStart = -1;
      if (len >= 45 * MIN || (splitFirst && len >= 30 * MIN)) { cont = 0; splitFirst = false; flagged = false; }
      else if (len >= 15 * MIN) splitFirst = true;
    };
    for (const a of acts) {
      if (a.kind === "BREAK" || a.kind === "REST") { if (runStart < 0) runStart = a.startMs; continue; }
      closeRun(a.startMs);
      if (a.kind !== "DRIVE") continue;
      const before = cont;
      cont += a.endMs - a.startMs;
      if (!flagged && cont > 4.5 * H + MIN) {
        flagged = true;
        flag("BREAK_AFTER_4H30", a.startMs + (4.5 * H - before), `${(cont / H).toFixed(2)} h de condução sem pausa válida (45 min, ou 15 + 30)`);
      }
    }
  }

  /* Duty periods between daily/weekly rests; daily rest timing and daily driving. */
  type Shift = { startMs: number; endMs: number; driveMs: number; workMs: number; breaks: number[]; night: boolean; weekStart: number };
  const shifts: Shift[] = [];
  {
    // A qualifying daily rest is a REST run ≥ 9 h; a ≥ 3 h run followed by a ≥ 9 h run is a split rest.
    const qualifying = rests.filter((r) => r.len >= 9 * H);
    let start = t0;
    const reducedPerWeeklyGap: number[] = [0];
    for (const q of [...qualifying, { startMs: tEnd, endMs: tEnd, len: 0 }]) {
      if (q.startMs <= start) { start = Math.max(start, q.endMs); continue; }
      const inShift = acts.filter((a) => a.endMs > start && a.startMs < q.startMs);
      const clip = (a: Activity) => Math.min(a.endMs, q.startMs) - Math.max(a.startMs, start);
      const shift: Shift = {
        startMs: start,
        endMs: q.startMs,
        driveMs: inShift.filter((a) => a.kind === "DRIVE").reduce((s, a) => s + clip(a), 0),
        workMs: inShift.filter((a) => a.kind === "WORK").reduce((s, a) => s + clip(a), 0),
        breaks: [],
        night: false,
        weekStart: weekStartOf(start, parts),
      };
      shifts.push(shift);
      const isEnd = q.len === 0;
      if (!isEnd) {
        // Rest timing: the rest must be completed within 24 h of the previous rest's end.
        const window = start + 24 * H;
        const split3 = rests.find((r) => r.startMs >= start && r.endMs <= q.startMs && r.len >= 3 * H);
        const inWindow = Math.max(0, Math.min(q.endMs, window) - q.startMs);
        const regular = inWindow >= 11 * H || (split3 !== undefined && split3.endMs <= window && inWindow >= 9 * H && q.endMs <= window);
        const reduced = !regular && inWindow >= 9 * H;
        if (!regular && !reduced) flag("DAILY_REST", q.startMs, `só ${(inWindow / H).toFixed(1)} h de descanso dentro das 24 h após o descanso anterior`);
        if (q.len >= 24 * H) reducedPerWeeklyGap.push(0);
        else if (reduced) {
          reducedPerWeeklyGap[reducedPerWeeklyGap.length - 1]!++;
          if (reducedPerWeeklyGap.at(-1)! > 3) flag("REDUCED_DAILY_REST_MAX_3", q.startMs, "mais de três descansos diários reduzidos entre dois descansos semanais");
        }
        (shift as Shift & { reducedRest?: boolean }).reducedRest = reduced;
      } else if (tEnd - start > 24 * H) {
        flag("DAILY_REST", start + 24 * H, "sem descanso diário nas 24 h após o descanso anterior");
      }
      start = q.endMs;
    }
  }

  /* Daily driving 9 h / 10 h twice a week. */
  const extendedByWeek = new Map<number, number>();
  for (const s of shifts) {
    if (s.driveMs > 10 * H + MIN) flag("DAILY_DRIVING_9H", s.startMs, `${(s.driveMs / H).toFixed(2)} h de condução num dia (máx. 10 h, 2× por semana)`);
    else if (s.driveMs > 9 * H + MIN) {
      const n = (extendedByWeek.get(s.weekStart) ?? 0) + 1;
      extendedByWeek.set(s.weekStart, n);
      if (n > 2) flag("DAILY_DRIVING_10H_MAX_TWICE", s.startMs, `${n}.º dia de condução acima de 9 h na mesma semana`);
    }
  }

  /* Working time: 6 h without a break, daily breaks, night work (per duty period). */
  {
    let cont = 0;
    let flagged = false;
    for (const a of acts) {
      const len = a.endMs - a.startMs;
      if (a.kind === "BREAK" || a.kind === "REST") { if (len >= 15 * MIN) { cont = 0; flagged = false; } continue; }
      if (a.kind === "AVAILABLE") continue;
      const before = cont;
      cont += len;
      if (!flagged && cont > 6 * H + MIN) {
        flagged = true;
        flag("WORKING_TIME_6H_WITHOUT_BREAK", a.startMs + (6 * H - before), `${(cont / H).toFixed(2)} h de trabalho seguido sem pausa de 15 min`);
      }
    }
    const isNight = (ms: number) => { const h = parts(ms).h; return h >= policy.nightStartH && h < policy.nightEndH; };
    for (const s of shifts) {
      const inShift = acts.filter((a) => a.endMs > s.startMs && a.startMs < s.endMs);
      const breakMs = inShift.filter((a) => (a.kind === "BREAK" || a.kind === "REST") && a.endMs - a.startMs >= 15 * MIN).reduce((t, a) => t + Math.min(a.endMs, s.endMs) - Math.max(a.startMs, s.startMs), 0);
      const wt = s.driveMs + s.workMs;
      if (wt > 9 * H && breakMs < 45 * MIN) flag("WORKING_TIME_DAILY_BREAKS", s.startMs, `${(wt / H).toFixed(1)} h de trabalho com só ${Math.round(breakMs / MIN)} min de pausa (mín. 45)`);
      else if (wt > 6 * H && breakMs < 30 * MIN) flag("WORKING_TIME_DAILY_BREAKS", s.startMs, `${(wt / H).toFixed(1)} h de trabalho com só ${Math.round(breakMs / MIN)} min de pausa (mín. 30)`);
      s.night = inShift.some((a) => (a.kind === "DRIVE" || a.kind === "WORK") && sampleAny(Math.max(a.startMs, s.startMs), Math.min(a.endMs, s.endMs), isNight));
      if (s.night && wt > 10 * H + MIN) flag("NIGHT_WORK_10H", s.startMs, `${(wt / H).toFixed(1)} h de trabalho num dia com trabalho noturno (máx. 10 h)`);
    }
  }

  /* Calendar weeks: 56 h, 90 h / 2 weeks, 60 h working time, availability. */
  const weeks: WeekStats[] = [];
  const weekMs: { start: number; drive: number; work: number; avail: number }[] = [];
  for (let w = weekStartOf(t0, parts); w < tEnd; w = weekStartOf(w + 8 * 24 * H, parts)) {
    const wEnd = weekStartOf(w + 8 * 24 * H, parts);
    const sum = (k: ActivityKind) => acts.filter((a) => a.kind === k).reduce((t, a) => t + Math.max(0, Math.min(a.endMs, wEnd) - Math.max(a.startMs, w)), 0);
    weekMs.push({ start: w, drive: sum("DRIVE"), work: sum("WORK"), avail: sum("AVAILABLE") });
  }
  weekMs.forEach((wk, i) => {
    if (wk.drive > 56 * H + MIN) flag("WEEKLY_DRIVING_56H", wk.start, `${(wk.drive / H).toFixed(1)} h de condução na semana`);
    const prev = weekMs[i - 1];
    if (prev && prev.start === weekStartOf(wk.start - 2 * H, parts) && prev.drive + wk.drive > 90 * H + MIN) flag("FORTNIGHT_DRIVING_90H", wk.start, `${((prev.drive + wk.drive) / H).toFixed(1)} h em duas semanas seguidas`);
    if (wk.drive + wk.work > 60 * H + MIN) flag("WORKING_TIME_WEEKLY_60H", wk.start, `${((wk.drive + wk.work) / H).toFixed(1)} h de tempo de trabalho na semana`);
    const p = parts(wk.start);
    weeks.push({
      weekStartLocal: `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`,
      drivingH: round1(wk.drive / H),
      otherWorkH: round1(wk.work / H),
      workingTimeH: round1((wk.drive + wk.work) / H),
      availabilityH: round1(wk.avail / H),
      extendedDrivingDays: extendedByWeek.get(wk.start) ?? 0,
      reducedDailyRests: shifts.filter((s) => s.weekStart === wk.start && (s as Shift & { reducedRest?: boolean }).reducedRest).length,
    });
  });
  const averageWorkingTimeH = weeks.length ? round1(weeks.reduce((t, w) => t + w.workingTimeH, 0) / weeks.length) : 0;
  if (weeks.length >= policy.averageReferenceWeeks && averageWorkingTimeH > 48) flag("WORKING_TIME_AVERAGE_48H", tEnd, `média de ${averageWorkingTimeH} h/semana no período de referência`);
  if (weeks.length < policy.averageReferenceWeeks) assumptions.push(`Média de 48 h só verificável com ${policy.averageReferenceWeeks} semanas; a linha do tempo tem ${weeks.length} (média ${averageWorkingTimeH} h reportada, não avaliada).`);

  violations.sort((a, b) => a.atMs - b.atMs);
  return {
    legal: violations.length === 0,
    violations,
    weeks,
    weeklyRests,
    openDebts: debts.filter((d) => d.paidAtMs === undefined && d.dueByMs >= tEnd),
    averageWorkingTimeH,
    assumptions,
  };
}

function round1(x: number) { return Math.round(x * 10) / 10; }

/** Does any 10-min sample of [a, b) satisfy `f`? (Night overlap check.) */
function sampleAny(a: number, b: number, f: (ms: number) => boolean): boolean {
  for (let t = a; t < b; t += 10 * MIN) if (f(t)) return true;
  return b > a && f(b - 1);
}
