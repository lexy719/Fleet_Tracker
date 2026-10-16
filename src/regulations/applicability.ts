import type { ApplicabilityEvaluation, Tri, VerificationState } from "./types";

/** General prohibition plus separately reviewed counter-rules. Never coerce a missing fact. */
export function combineApplicability(
  base: Tri,
  legalStatus: VerificationState,
  exceptions: ApplicabilityEvaluation["exceptions"],
): Tri {
  if (base !== "APPLIES") return base;
  if (legalStatus !== "VERIFIED") return "UNKNOWN";
  if (exceptions.some((e) => e.confirmed)) return "DOES_NOT_APPLY";
  if (
    exceptions.some(
      (e) => e.proof === "indeterminate" && e.outcome !== "DOES_NOT_APPLY",
    )
  )
    return "UNKNOWN";
  return "APPLIES";
}
