---
name: phase-56b-architecture
description: "FleetOS Phase 5.6B (docs, customers/sites, compliance, dispatch rebuild) state as of 2026-10-05, plus dev-server gotchas found during acceptance"
metadata:
  node_type: memory
  type: project
  originSessionId: 1a8f9d55-3ba2-4227-b8a7-0a86d300400f
  modified: 2026-10-05T13:50:24.857Z
---

Phase 5.6B was implemented on 2026-10-05 (uncommitted; user commits themselves). Key decisions not obvious from code:
- Invoice numbering is owned by the operational store (`counter:invoice:<prefix>`), migrated ONCE from localStorage "fleet-settings-v1" invoiceNextSeq; Settings shows next number read-only. A commit failure after allocation can leave a gap (accepted, documented), never a duplicate.
- Demo re-anchoring shifts only "relative" demo jobs; fixtures with dated stop windows (J-DEMO-IP3/3C/PL/BF/SB) are pinned to real dates and age on purpose.
- RI coverage headline stays English in the frozen domain; UI translates via src/ui/coverageText.ts.
- Root-level untracked `fleet.html` / `reports.html` (user's files) shadow `/fleet` on a FULL page load in the Vite dev server; in-app navigation is fine. Do not delete them (user decides).

**Why:** these explain behaviour that otherwise looks like bugs in later phases.
**How to apply:** Phase 6 resource verdicts plug into DecisionParts `CheckVerdict` (OK/BLOCKS/RISK/UNKNOWN); vehicles join compliance through `ComplianceSubject`. Related: [[road-intelligence-state]].
