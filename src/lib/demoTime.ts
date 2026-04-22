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

/**
 * Format a shifted vehicle trail time label.
 * Input: seed ISO datetime like "2026-04-17T14:30:00"
 * Output: "14:30 · 19 Abr" (or whatever today's date is)
 */
const PT_MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
export function demoTimeLabel(isoSeed: string): string {
  const shifted = new Date(new Date(isoSeed).getTime() + DEMO_SHIFT_MS);
  const hhmm  = shifted.toTimeString().slice(0, 5);
  const day   = String(shifted.getDate()).padStart(2, "0");
  const month = PT_MONTHS[shifted.getMonth()];
  return `${hhmm} · ${day} ${month}`;
}

/** The "current" reference time — real now, kept in sync with shifted seed data. */
export const DEMO_NOW = new Date();
