import { changedFields, type ParsedCandidate } from "./candidate";
import type { CandidateConstraint, ChangeEntry, GateResult } from "./types";

/**
 * Merge a source's freshly parsed candidates into its previous set.
 * NEW / UNCHANGED / UPDATED by content hash; records absent from a successful parse are
 * NO_LONGER_REPORTED (kept, never deleted or "cancelled").
 * Only call with the output of a SUCCESSFUL fetch+parse — a failed fetch changes nothing.
 */
export function mergeCandidates(
  previous: CandidateConstraint[],
  parsed: ParsedCandidate[],
  at: string,
  gate: (c: Omit<CandidateConstraint, "gate">) => GateResult,
): { candidates: CandidateConstraint[]; changes: ChangeEntry[] } {
  const prev = new Map(previous.map((c) => [c.id, c]));
  const out: CandidateConstraint[] = [];
  const changes: ChangeEntry[] = [];
  const seen = new Set<string>();

  for (const p of parsed) {
    seen.add(p.id);
    const before = prev.get(p.id);
    let lifecycle: CandidateConstraint["lifecycle"];
    let fields: string[] | undefined;
    if (!before) lifecycle = "NEW";
    else if (before.contentHash === p.contentHash && before.lifecycle !== "NO_LONGER_REPORTED") lifecycle = "UNCHANGED";
    else {
      lifecycle = "UPDATED";
      fields = before.contentHash === p.contentHash ? ["reapareceu na fonte"] : changedFields(before.fields, p.fields);
    }
    const base = { ...p, lifecycle, firstSeenAt: before?.firstSeenAt ?? at, lastSeenAt: at };
    out.push({ ...base, gate: gate(base) });
    if (lifecycle !== "UNCHANGED") changes.push({ at, sourceId: p.sourceId, candidateId: p.id, change: lifecycle, ...(fields ? { fields } : {}) });
  }
  for (const c of previous) {
    if (seen.has(c.id)) continue;
    if (c.lifecycle === "NO_LONGER_REPORTED") {
      out.push(c);
      continue;
    }
    const base = { ...c, lifecycle: "NO_LONGER_REPORTED" as const, missingSinceAt: at };
    out.push({ ...base, gate: gate(base) });
    changes.push({ at, sourceId: c.sourceId, candidateId: c.id, change: "NO_LONGER_REPORTED" });
  }
  return { candidates: out, changes };
}
