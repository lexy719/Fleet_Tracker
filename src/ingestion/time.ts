/* Europe/Lisbon local time ⇄ UTC (DST-aware via Intl; no library). */

export const LISBON = "Europe/Lisbon";

/** "YYYY-MM-DDTHH:MM" local time in `timeZone` for an instant. */
export function toLocalMinute(ms: number, timeZone = LISBON): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Instant for a local wall-clock time. Ambiguous (DST fall-back) times resolve to the
 * earlier instant; non-existent (spring-forward) times return null.
 */
export function fromLocalMinute(local: string, timeZone = LISBON): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const guess = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(guess)) return null;
  for (const offsetH of [-1, 0, 1, 2]) {
    const ms = guess - offsetH * 3_600_000;
    if (toLocalMinute(ms, timeZone) === local) return ms;
  }
  return null;
}
