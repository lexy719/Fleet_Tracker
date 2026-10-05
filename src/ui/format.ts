import { isoToLocal, isoToLocalDate, OPS_TIME_ZONE } from "../domain/time";

/*
 * Presentation formatting — always Europe/Lisbon wall-clock time (never raw UTC),
 * Portuguese ordering, tabular-friendly output.
 */

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function dayDiff(iso: string, now: Date): number {
  const a = Date.parse(`${isoToLocalDate(Date.parse(iso))}T12:00:00Z`);
  const b = Date.parse(`${isoToLocalDate(now.getTime())}T12:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

/** "06 out" */
export function fmtDay(iso: string): string {
  const l = isoToLocal(iso);
  return l ? `${l.slice(8, 10)} ${MONTHS[Number(l.slice(5, 7)) - 1]}` : "—";
}

/** "08:30" */
export function fmtClock(iso: string | undefined): string {
  const l = isoToLocal(iso);
  return l ? l.slice(11, 16) : "—";
}

/** Day label relative to now: "Hoje", "Amanhã", "Ontem", else "07 out". */
export function fmtDayLabel(iso: string, now: Date = new Date()): string {
  const d = dayDiff(iso, now);
  return d === 0 ? "Hoje" : d === 1 ? "Amanhã" : d === -1 ? "Ontem" : fmtDay(iso);
}

/** Today → "08:30"; tomorrow → "Amanhã · 08:30"; other → "07 out · 08:30". */
export function fmtWhen(iso: string | undefined, now: Date = new Date()): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "—";
  const d = dayDiff(iso, now);
  const t = fmtClock(iso);
  return d === 0 ? t : `${fmtDayLabel(iso, now)} · ${t}`;
}

/** Window "08:00–09:00" with day prefix when not today; "a partir de 08:00" / "até 09:00" when open. */
export function fmtWindow(start: string | undefined, end: string | undefined, now: Date = new Date()): string {
  if (!start && !end) return "—";
  if (start && end) {
    const sameDay = isoToLocalDate(Date.parse(start)) === isoToLocalDate(Date.parse(end));
    if (sameDay) {
      const prefix = dayDiff(start, now) === 0 ? "" : `${fmtDayLabel(start, now)} · `;
      return `${prefix}${fmtClock(start)}–${fmtClock(end)}`;
    }
    return `${fmtWhen(start, now)} – ${fmtWhen(end, now)}`;
  }
  return start ? `desde ${fmtWhen(start, now)}` : `até ${fmtWhen(end, now)}`;
}

/** "segunda-feira, 5 de outubro" */
export function fmtLongDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("pt-PT", { timeZone: OPS_TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(now);
}

/** Age of a record: "há 5 min", "há 3 h", "há 2 dias". */
export function fmtAge(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const min = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min)) return "—";
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

const nf0 = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtInt = (n: number | undefined | null) => (n === undefined || n === null || !Number.isFinite(n) ? "—" : nf0.format(n));
/** 12400 → "12,4 t" */
export const fmtTonnes = (kg: number | undefined | null) => (kg === undefined || kg === null || !Number.isFinite(kg) ? "—" : `${nf1.format(kg / 1000)} t`);
export const fmtKg = (kg: number | undefined | null) => (kg === undefined || kg === null ? "—" : `${nf0.format(kg)} kg`);
export const fmtKm = (km: number | undefined | null) => (km === undefined || km === null ? "—" : `${nf0.format(km)} km`);
export const fmtEur = (v: number | undefined | null) => (v === undefined || v === null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v));
/** minutes → "4 h 50" */
export function fmtDuration(min: number | undefined | null): string {
  if (min === undefined || min === null || !Number.isFinite(min)) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}
/** hours (decimal) → "3h42" */
export function fmtHours(h: number): string {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, "0")}`;
}

/** A stop's window: dated when known; legacy clock-only windows are labelled as undated. */
export function stopWindowText(s: { windowStartAt?: string; windowEndAt?: string; scheduledTime?: string; windowEnd?: string } | undefined, now: Date = new Date()): string {
  if (!s) return "—";
  if (s.windowStartAt || s.windowEndAt) return fmtWindow(s.windowStartAt, s.windowEndAt, now);
  if (s.scheduledTime) return `${s.scheduledTime}${s.windowEnd ? `–${s.windowEnd}` : ""} s/d`;
  return "sem janela";
}

/**
 * Window text for list rows that already sit under a day heading: the day prefix is
 * omitted when the window falls on `sectionDay` (local YYYY-MM-DD).
 */
export function stopWindowInDay(s: { windowStartAt?: string; windowEndAt?: string; scheduledTime?: string; windowEnd?: string } | undefined, sectionDay: string | undefined, now: Date = new Date()): string {
  if (!s || !sectionDay || !(s.windowStartAt || s.windowEndAt)) return stopWindowText(s, now);
  const startDay = s.windowStartAt ? isoToLocalDate(Date.parse(s.windowStartAt)) : undefined;
  const endDay = s.windowEndAt ? isoToLocalDate(Date.parse(s.windowEndAt)) : undefined;
  if ((startDay ?? endDay) === sectionDay && (endDay ?? startDay) === sectionDay) {
    return s.windowStartAt && s.windowEndAt ? `${fmtClock(s.windowStartAt)}–${fmtClock(s.windowEndAt)}` : s.windowStartAt ? `desde ${fmtClock(s.windowStartAt)}` : `até ${fmtClock(s.windowEndAt)}`;
  }
  return stopWindowText(s, now);
}
