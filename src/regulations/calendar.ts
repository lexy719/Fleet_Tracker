import type { DateCalendar, DayClassRule, TemporalRule, Tri, Weekday } from "./types";

export type LocalParts = {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: Weekday;
  /** Minutes since local midnight. */
  minutes: number;
  /** "YYYY-MM-DD" in the local zone. */
  isoDate: string;
};

const WEEKDAY_BY_SHORT: Record<string, Weekday> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Civil date/time of an instant in an IANA time zone. */
export function localParts(ms: number, timeZone: string): LocalParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return {
    year,
    month,
    day,
    weekday: WEEKDAY_BY_SHORT[get("weekday")] ?? 1,
    minutes,
    isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** Western (Gregorian) Easter Sunday — anonymous Gregorian algorithm. */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Label of the calendar entry matching a civil date, or null. */
export function matchCalendar(cal: DateCalendar, year: number, month: number, day: number): string | null {
  const fixed = cal.fixed.find((f) => f.month === month && f.day === day);
  if (fixed) return fixed.label;
  if (cal.easterOffsets.length > 0) {
    const e = easterSunday(year);
    const easterUtc = Date.UTC(year, e.month - 1, e.day);
    const target = Date.UTC(year, month - 1, day);
    const diffDays = Math.round((target - easterUtc) / 86_400_000);
    const off = cal.easterOffsets.find((o) => o.days === diffDays);
    if (off) return off.label;
  }
  return null;
}

export type DayClassification = { outcome: Tri; matchedCalendar?: { id: string; entry: string } };

export function classifyDay(rule: DayClassRule, calendars: DateCalendar[], p: LocalParts): DayClassification {
  for (const o of rule.dateOverrides) {
    const cal = calendars.find((c) => c.id === o.calendarId);
    if (!cal) return { outcome: "UNKNOWN", matchedCalendar: { id: o.calendarId, entry: "calendário em falta" } };
    const entry = matchCalendar(cal, p.year, p.month, p.day);
    if (entry) return { outcome: o.outcome, matchedCalendar: { id: cal.id, entry } };
  }
  return { outcome: rule.weekdays[p.weekday] };
}

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Half-open [start, end) local windows; supports windows crossing midnight. */
export function inAnyWindow(minutes: number, windows: NonNullable<TemporalRule["windows"]>): boolean {
  return windows.some((w) => {
    const s = hmToMinutes(w.start);
    const e = hmToMinutes(w.end);
    return s <= e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
  });
}
