import type { Driver } from "../data/types";
import { driverQualifications, type QualificationKind, type QualificationState } from "./drivers/drivers";

/*
 * Compliance register: one row per (subject, credential). Subjects are drivers today; the
 * subject union is where vehicles (inspeção, seguro, tacógrafo, ATP…) will be added later —
 * the page and filters work on this generic shape only.
 */

export type ComplianceSubject = { kind: "driver"; id: string; name: string; isDemo?: boolean };

export type ComplianceItem = {
  key: string;
  subject: ComplianceSubject;
  credential: QualificationKind;
  label: string;
  state: QualificationState;
  expiresOn?: string;
  daysLeft?: number;
};

export type ComplianceFilter = "all" | "expiring" | "expired" | "missing";

export function driverComplianceItems(drivers: Driver[], now: Date): ComplianceItem[] {
  const out: ComplianceItem[] = [];
  for (const d of drivers) {
    if (d.archivedAt) continue;
    const subject: ComplianceSubject = { kind: "driver", id: d.id, name: d.name, ...(d.isDemo ? { isDemo: true } : {}) };
    for (const q of driverQualifications(d, now)) {
      // A credential the driver does not hold (e.g. ADR) is not a compliance item.
      if (q.state === "NOT_HELD") continue;
      out.push({ key: `${d.id}:${q.kind}`, subject, credential: q.kind, label: q.label, state: q.state, ...(q.expiresOn ? { expiresOn: q.expiresOn } : {}), ...(q.daysLeft !== undefined ? { daysLeft: q.daysLeft } : {}) });
    }
  }
  return out;
}

const RANK: Record<QualificationState, number> = { EXPIRED: 0, EXPIRING: 1, MISSING: 2, VALID: 3, NOT_HELD: 4 };

export function filterCompliance(items: ComplianceItem[], f: ComplianceFilter): ComplianceItem[] {
  const keep = f === "all" ? items : items.filter((i) => i.state === (f === "expiring" ? "EXPIRING" : f === "expired" ? "EXPIRED" : "MISSING"));
  return [...keep].sort((a, b) => RANK[a.state] - RANK[b.state] || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9) || a.subject.name.localeCompare(b.subject.name, "pt"));
}

export function complianceCounts(items: ComplianceItem[]): Record<ComplianceFilter, number> {
  return {
    all: items.length,
    expiring: items.filter((i) => i.state === "EXPIRING").length,
    expired: items.filter((i) => i.state === "EXPIRED").length,
    missing: items.filter((i) => i.state === "MISSING").length,
  };
}
