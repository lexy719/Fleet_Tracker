/** An assumption cannot be consumed as a measured/known value without narrowing the union. */
export type OperationalValue<T> =
  | {
      status: "KNOWN";
      value: T;
      source: "manual" | "provider" | "calculated" | "simulated";
      recordedAt?: string;
    }
  | { status: "ASSUMED"; value: T; source: "assumed"; reason: string }
  | { status: "UNKNOWN"; source: "unknown"; reason: string };

export const calculated = <T>(value: T): OperationalValue<T> => ({
  status: "KNOWN",
  value,
  source: "calculated",
});
export const unknown = <T = never>(reason: string): OperationalValue<T> => ({
  status: "UNKNOWN",
  source: "unknown",
  reason,
});
export const assumed = <T>(value: T, reason: string): OperationalValue<T> => ({
  status: "ASSUMED",
  value,
  source: "assumed",
  reason,
});

/** Operational instants require an explicit offset. Clock-only and host-local values are not instants. */
export function instantMs(value: string | undefined): number | null {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export type OperationalIssue = {
  code: string;
  stopId?: string;
  movementIndex?: number;
  detail?: string;
};
export type Feasibility = "PASS" | "FAIL" | "UNKNOWN";
