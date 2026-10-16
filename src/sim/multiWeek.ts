import { validateDriverTimeline, type Activity, type LegalityReport, type Violation } from "../legal/driverLegality";
import { randomWeekJobs } from "./randomWeek";
import type { WaitPolicy } from "./timeline";
import type { Router, WeekInput, WeekResult } from "./weekSimulation";

/*
 * Consecutive weeks for ONE driver: every counter and rest debt carries over, because the legal
 * audit always sees the driver's real history (last 4 weeks: enough for 90 h / two weeks and
 * the 3-week compensation deadline). Each week the driver leaves Porto Monday 06:00 and must be
 * home by Friday 20:00 (Lisbon time); the weekend at home is the weekly rest.
 *
 * Three results per week and policy, kept separate:
 *  1. technically feasible — the planner can time it and the truck gets home;
 *  2. legally feasible — the full driver timeline passes the Reg. 561 + Dir. 2002/15 audit;
 *  3. commercially best — highest margin among the legally feasible plans (best FOUND by the
 *     search, not proven optimal).
 */

export type Policy = (w: WeekInput) => Promise<WeekResult>;

export type WeekOutcome = {
  week: number;
  weekStart: string;
  policy: string;
  technical: { totals: WeekResult["totals"]; legal: boolean; violations: Violation[] };
  legal: { totals: WeekResult["totals"]; report: LegalityReport["weeks"][number] | undefined; openDebtH: number };
};

const H = 3_600_000;

const LISBON = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });

/** UTC ms of a Lisbon wall-clock time (DST-safe; day overflow such as 30 + 4 is normalised). */
export function lisbonMs(y: number, m: number, d: number, h: number): number {
  const target = Date.UTC(y, m - 1, d, h);
  let t = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(LISBON.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const local = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!);
    t -= local - target;
  }
  return t;
}

export async function simulateDriverWeeks(opts: {
  policies: Policy[];
  weeks: number;
  seed: number;
  loadsPerWeek: number;
  route: Router;
  home: [number, number];
  /** Monday of the first week (local date). */
  firstMonday: { y: number; m: number; d: number };
  waitPolicy?: WaitPolicy;
  onWeek?: (o: WeekOutcome) => void;
}): Promise<WeekOutcome[]> {
  const out: WeekOutcome[] = [];
  for (const policy of opts.policies) {
    const history: { weekStartMs: number; acts: Activity[] }[] = [];
    for (let k = 0; k < opts.weeks; k++) {
      const base = new Date(Date.UTC(opts.firstMonday.y, opts.firstMonday.m - 1, opts.firstMonday.d + 7 * k));
      const [y, m, d] = [base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate()];
      const startMs = lisbonMs(y, m, d, 6);
      const homeByMs = lisbonMs(y, m, d + 4, 20);
      const window = history.slice(-4);
      const hist = window.flatMap((x) => x.acts);
      const audit = (tl: Activity[]) => validateDriverTimeline([...hist, ...tl], { afterWeeklyRestEndMs: window[0]?.weekStartMs ?? startMs });
      const w: WeekInput = { jobs: randomWeekJobs(opts.seed * 100 + k, startMs, opts.loadsPerWeek), home: opts.home, startMs, homeByMs, route: opts.route, ...(opts.waitPolicy ? { waitPolicy: opts.waitPolicy } : {}) };
      const tech = await policy(w);
      const techReport = audit(tech.timeline);
      // History is legal by construction; a violation dated before this week means the audit window drifted.
      const drift = techReport.violations.filter((v) => v.atMs < startMs - 6 * H);
      if (drift.length) throw new Error(`auditoria inconsistente na semana ${k + 1}: ${drift.map((v) => v.rule).join(", ")}`);
      const leg = techReport.legal ? tech : await policy({ ...w, accept: (tl) => audit(tl).legal });
      const legReport = audit(leg.timeline);
      history.push({ weekStartMs: startMs, acts: leg.timeline });
      const o: WeekOutcome = {
        week: k + 1,
        weekStart: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        policy: tech.policy,
        technical: { totals: tech.totals, legal: techReport.legal, violations: techReport.violations },
        legal: { totals: leg.totals, report: legReport.weeks.at(-1), openDebtH: legReport.openDebts.reduce((s, x) => s + x.hours, 0) },
      };
      opts.onWeek?.(o);
      out.push(o);
    }
  }
  return out;
}
