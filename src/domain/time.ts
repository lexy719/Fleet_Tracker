/*
 * Operational time. FleetOS stores INSTANTS (ISO 8601 with offset). Dispatchers enter and
 * read wall-clock times in the company timezone, Europe/Lisbon (DST-aware via Intl). A
 * time without a date is never an operational instant.
 */

export const OPS_TIME_ZONE = "Europe/Lisbon";

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(tz, f);
  }
  return f;
}

/** "YYYY-MM-DDTHH:MM" wall-clock time in `tz` for an instant. */
export function toLocalMinute(ms: number, tz = OPS_TIME_ZONE): string {
  const parts = Object.fromEntries(formatterFor(tz).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Instant for a wall-clock time; DST-ambiguous → earlier instant; non-existent → null. */
export function fromLocalMinute(local: string, tz = OPS_TIME_ZONE): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const guess = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(guess)) return null;
  for (const offsetH of [-1, 0, 1, 2]) {
    const ms = guess - offsetH * 3_600_000;
    if (toLocalMinute(ms, tz) === local) return ms;
  }
  return null;
}

/** "2026-10-06T08:00" (Lisbon) → "2026-10-06T08:00:00+01:00"; null if invalid/non-existent. */
export function localToIso(local: string, tz = OPS_TIME_ZONE): string | null {
  const ms = fromLocalMinute(local, tz);
  if (ms === null) return null;
  const offsetMin = Math.round((Date.parse(`${local}:00Z`) - ms) / 60_000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const a = Math.abs(offsetMin);
  return `${local}:00${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** ISO instant → "YYYY-MM-DDTHH:MM" Lisbon (for <input type="datetime-local">); "" if invalid. */
export function isoToLocal(iso: string | undefined, tz = OPS_TIME_ZONE): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? toLocalMinute(ms, tz) : "";
}

/** "HH:MM" Lisbon wall-clock of an instant (legacy display fields). */
export function isoToClock(iso: string | undefined, tz = OPS_TIME_ZONE): string {
  return isoToLocal(iso, tz).slice(11, 16);
}

/** Local calendar date "YYYY-MM-DD" of an instant. */
export function isoToLocalDate(ms: number, tz = OPS_TIME_ZONE): string {
  return toLocalMinute(ms, tz).slice(0, 10);
}

/** Monday (local date) of the ISO week containing the instant. */
export function localWeekStart(ms: number, tz = OPS_TIME_ZONE): string {
  const d = new Date(`${isoToLocalDate(ms, tz)}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function isIsoInstant(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && Number.isFinite(Date.parse(s));
}

export function isLocalDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`));
}

/** Human display "06/10 08:00" in Lisbon time. */
export function formatLocal(iso: string | undefined): string {
  const l = isoToLocal(iso);
  return l ? `${l.slice(8, 10)}/${l.slice(5, 7)} ${l.slice(11, 16)}` : "—";
}
