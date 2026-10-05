/*
 * Identifiers. Every persisted entity has an immutable INTERNAL id (UUID — collision-safe
 * across reloads, deletions, imports and tabs). Human-readable numbers ("J-004302") are
 * display attributes, never database keys. Plates and employee numbers are attributes too.
 */

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

const JOB_NUMBER = /^J-(\d+)$/;

export function formatJobNumber(n: number): string {
  return `J-${String(n).padStart(6, "0")}`;
}

/** Numeric part of a job number ("J-4201" → 4201, "J-004302" → 4302); null if not numeric. */
export function parseJobNumber(s: string): number | null {
  const m = s.match(JOB_NUMBER);
  return m ? Number(m[1]) : null;
}

/** Highest numeric job number in use (0 when none). */
export function maxJobNumber(numbers: Iterable<string>): number {
  let max = 0;
  for (const s of numbers) {
    const n = parseJobNumber(s);
    if (n !== null && n > max) max = n;
  }
  return max;
}
