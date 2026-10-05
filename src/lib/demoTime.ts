/**
 * All seed data is authored around 2026-04-17T12:00 (the "demo anchor").
 * At runtime we shift every date by the real elapsed time so the demo
 * always looks current — SLA countdowns, deadlines, alerts all stay
 * relative to "today" regardless of when the portfolio is viewed.
 */

const SEED_ANCHOR = new Date("2026-04-17T12:00:00");
export const DEMO_SHIFT_MS = Date.now() - SEED_ANCHOR.getTime();

/** Shift a seed ISO datetime string to feel like today. */
export function demoDate(iso: string): string {
  const base = iso.length === 10 ? iso + "T12:00:00" : iso;
  return new Date(new Date(base).getTime() + DEMO_SHIFT_MS)
    .toISOString()
    .slice(0, 19);
}

/** Shift a seed YYYY-MM-DD string to feel like today (returns YYYY-MM-DD). */
export function demoDateOnly(dateOnly: string): string {
  return demoDate(dateOnly).slice(0, 10);
}


/** The "current" reference time — real now, kept in sync with shifted seed data. */
export const DEMO_NOW = new Date();
