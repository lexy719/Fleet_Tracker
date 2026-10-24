---
name: sim-claims-policy
description: Simulation savings are synthetic evidence only — never annualise or present as a product claim until real customer load history validates them
metadata:
  node_type: memory
  type: feedback
  originSessionId: c1f45b6e-5999-4d8f-aa29-16a703267b7a
  modified: 2026-10-11T15:51:39.122Z
---

User (2026-10-11): keep profit improvements from the week simulator explicitly as synthetic simulation evidence; do not annualise them as a product claim until real customer load history validates. Also separate results into technically feasible / legally feasible / commercially best.

**Why:** the base planner turned out to produce illegal plans often (night-work 10 h, 6 h working time without break, daily rest within 24 h); unvalidated numbers would mislead customers.
**How to apply:** report per-week synthetic deltas with caveats; legality audit in src/legal/driverLegality.ts must gate any plan; see docs/simulacao-legalidade-12-semanas.md. Related: [[product-lineup]], [[project2-road-intelligence-store]].
