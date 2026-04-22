/**
 * EU driving-hours rules simulator — Regulation (EC) 561/2006.
 * Not legal advice — for dispatch UI simulation only.
 *
 * Rules modelled:
 *  Art. 7  — Max 4h30 continuous driving → mandatory 45-min break
 *             (break may be split: 15 min + 30 min, in that order)
 *  Art. 6  — Max 9h driving per day; extendable to 10h ≤ twice/week
 *  Art. 8  — Minimum 11h daily rest between driving periods
 *             (daily rest subsumes any pending 45-min break)
 *  Art. 6  — Max 56h driving per week
 *
 * Hard blockers (severity "critical"):
 *  • Weekly limit already reached — driver cannot drive at all
 *  • Trip driving hours exceed the driver's remaining weekly allowance
 *
 * Everything else is a warning — multi-day trips, soft daily excess,
 * mandatory breaks — are legal and normal for international routes.
 */

const SEC_PER_H = 3_600;

export const MAX_CONTINUOUS_SEC    = 4.5 * SEC_PER_H;  // 4h30 before mandatory break
export const BREAK_DURATION_SEC    = 45  * 60;          // 45-min mandatory break
export const MAX_DAILY_SEC         = 9   * SEC_PER_H;   // standard daily driving max
export const MAX_DAILY_EXTENDED_SEC = 10 * SEC_PER_H;  // extendable (≤ 2×/week)
export const DAILY_REST_SEC        = 11  * SEC_PER_H;   // min daily rest between days
export const MAX_WEEKLY_H          = 56;                // weekly driving limit

export type DrivingIssueCode =
  | "MULTI_DAY"
  | "BREAKS_NEEDED"
  | "DAILY_LIMIT_SOFT"
  | "WEEKLY_LOW"
  | "WEEKLY_EXCEEDED"
  | "TRIP_EXCEEDS_WEEKLY";

export type EuDrivingIssue = {
  severity: "warning" | "critical";
  code: DrivingIssueCode;
  message: string;
};

/* ─── Schedule simulation ─────────────────────────────────────────────────── */

export type DrivingSchedule = {
  breakCount:      number;  // number of 45-min mandatory breaks
  restCount:       number;  // number of 11h daily rest stops
  totalElapsedSec: number;  // driving + breaks + rests combined
  drivingDays:     number;  // how many calendar driving days
};

/**
 * Simulate the minimal-time driving schedule for a trip of `tripDriveSec`
 * given that the driver has already driven `alreadyTodaySec` today.
 *
 * The algorithm steps through time in chunks:
 *   1. Drive until: a break is needed (4h30 continuous) OR daily limit (9h) —
 *      whichever comes first.
 *   2. If daily limit hit → daily rest (11h); this subsumes any pending break.
 *   3. If only break needed → 45-min break.
 *   4. Repeat until trip is complete.
 */
export function simulateDrivingSchedule(
  tripDriveSec: number,
  alreadyTodaySec: number,
): DrivingSchedule {
  let remaining    = Math.max(0, tripDriveSec);
  let todayDriven  = Math.max(0, alreadyTodaySec);
  let continuous   = 0;   // seconds since last break/rest
  let breakCount   = 0;
  let restCount    = 0;
  let drivingDays  = 1;

  while (remaining > 0) {
    // How far until we MUST stop for a break?
    const tillBreak = MAX_CONTINUOUS_SEC - continuous;
    // How far until we MUST stop for a daily rest?
    const tillRest  = MAX_DAILY_SEC - todayDriven;
    // How far can we actually go (whichever limit comes first)?
    const driveNow  = Math.min(remaining, tillBreak, tillRest);

    remaining   -= driveNow;
    continuous  += driveNow;
    todayDriven += driveNow;

    if (remaining <= 0) break; // trip finished

    const needsRest  = todayDriven >= MAX_DAILY_SEC;
    const needsBreak = continuous  >= MAX_CONTINUOUS_SEC;

    if (needsRest) {
      // Daily rest (11h) — subsumes any pending 45-min break requirement
      restCount++;
      drivingDays++;
      todayDriven = 0;
      continuous  = 0;
    } else if (needsBreak) {
      // Mandatory 45-min break mid-day
      breakCount++;
      continuous = 0;
      // todayDriven is NOT reset — break doesn't count toward daily rest
    }
  }

  const totalElapsedSec =
    tripDriveSec +
    breakCount * BREAK_DURATION_SEC +
    restCount  * DAILY_REST_SEC;

  return { breakCount, restCount, totalElapsedSec, drivingDays };
}

/* ─── Formatting helpers ──────────────────────────────────────────────────── */

function fmtH(sec: number): string {
  const h   = Math.floor(sec / SEC_PER_H);
  const min = Math.round((sec % SEC_PER_H) / 60);
  if (min === 0) return `${h}h`;
  if (h  === 0) return `${min} min`;
  return `${h}h ${min}m`;
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${pluralForm ?? singular + "s"}`;
}

/* ─── Main evaluation function ────────────────────────────────────────────── */

export function evaluateEuDrivingRules(
  legDurationSec: number[],
  hoursAlreadyDrivingToday: number,
  hoursThisWeek?: number,
): EuDrivingIssue[] {
  const issues: EuDrivingIssue[] = [];

  const alreadyTodaySec = Math.max(0, hoursAlreadyDrivingToday) * SEC_PER_H;
  const tripDriveSec    = legDurationSec.reduce((a, b) => a + b, 0);
  const weekSecsLeft    = hoursThisWeek != null
    ? Math.max(0, MAX_WEEKLY_H - hoursThisWeek) * SEC_PER_H
    : Infinity;

  /* ── 1. Weekly — HARD blockers ───────────────────────── */
  if (hoursThisWeek != null) {
    if (hoursThisWeek >= MAX_WEEKLY_H) {
      issues.push({
        severity: "critical",
        code: "WEEKLY_EXCEEDED",
        message:
          `Limite semanal atingido (${hoursThisWeek.toFixed(1)}h / 56h) — ` +
          `o motorista não pode conduzir antes do descanso semanal obrigatório.`,
      });
      return issues; // nothing else is relevant
    }

    if (tripDriveSec > weekSecsLeft) {
      issues.push({
        severity: "critical",
        code: "TRIP_EXCEEDS_WEEKLY",
        message:
          `Esta viagem requer ${fmtH(tripDriveSec)} de condução, mas o motorista ` +
          `só tem ${fmtH(weekSecsLeft)} disponíveis até ao fim da semana — ` +
          `não é possível completar dentro dos limites semanais (Reg. CE 561/2006 Art. 6).`,
      });
      return issues;
    }

    if (hoursThisWeek >= MAX_WEEKLY_H - 6) {
      issues.push({
        severity: "warning",
        code: "WEEKLY_LOW",
        message:
          `O motorista tem ${hoursThisWeek.toFixed(1)}h esta semana — ` +
          `aproxima-se do limite semanal de 56h. Verificar disponibilidade nos próximos dias.`,
      });
    }
  }

  /* ── 2. Simulate the full driving schedule ───────────── */
  const sched = simulateDrivingSchedule(tripDriveSec, alreadyTodaySec);

  /* ── 3. Multi-day trip (requires at least one daily rest) */
  if (sched.restCount > 0) {
    const elapsed = fmtH(sched.totalElapsedSec);
    const restText = plural(sched.restCount, "descanso noturno", "descansos noturnos");
    const breakText = plural(sched.breakCount, "pausa de 45 min", "pausas de 45 min");
    issues.push({
      severity: "warning",
      code: "MULTI_DAY",
      message:
        `Viagem de ${plural(sched.drivingDays, "dia de condução", "dias de condução")} ` +
        `(${fmtH(tripDriveSec)} condução total) — ` +
        `${restText} de 11h + ${breakText} obrigatórias após cada 4h30. ` +
        `Duração total estimada com paragens: ${elapsed}.`,
    });
  } else if (sched.breakCount > 0) {
    /* ── 4. Single-day trip that still needs one or more breaks */
    const breakText = plural(sched.breakCount, "pausa de 45 min", "pausas de 45 min");
    issues.push({
      severity: "warning",
      code: "BREAKS_NEEDED",
      message:
        `Esta viagem requer ${breakText} obrigatórias ` +
        `(regulamento EU: pausa após cada 4h30 de condução). ` +
        `Duração total com pausas: ${fmtH(sched.totalElapsedSec)}.`,
    });
  }

  /* ── 5. Check if today's total exceeds daily limits ─── */
  const totalDaySec = alreadyTodaySec + Math.min(tripDriveSec, MAX_DAILY_SEC - alreadyTodaySec);
  if (sched.restCount === 0) {
    // Only relevant for single-day trips
    const combinedToday = alreadyTodaySec + tripDriveSec;
    if (combinedToday > MAX_DAILY_EXTENDED_SEC) {
      issues.push({
        severity: "warning",
        code: "DAILY_LIMIT_SOFT",
        message:
          `Total de condução hoje: ${fmtH(combinedToday)} — ` +
          `excede o limite alargado de 10h. Considerar motorista com mais horas disponíveis.`,
      });
    } else if (combinedToday > MAX_DAILY_SEC) {
      issues.push({
        severity: "warning",
        code: "DAILY_LIMIT_SOFT",
        message:
          `Total de condução hoje: ${fmtH(combinedToday)} — ` +
          `acima do limite padrão de 9h. Aplicável o limite alargado de 10h (máx. 2×/semana).`,
      });
    }
  }

  void totalDaySec; // suppress unused warning

  return issues;
}
