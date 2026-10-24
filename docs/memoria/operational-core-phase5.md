---
name: operational-core-phase5
description: "FleetOS Phase 5 operational core — jobs/trucks/trailers/drivers persisted in IndexedDB \"fleetos-operations\" via OperationsService; mockData is demo seed only; STOP boundary before Phase 6"
metadata:
  node_type: memory
  type: project
  originSessionId: 1a8f9d55-3ba2-4227-b8a7-0a86d300400f
  modified: 2026-10-05T00:50:26.163Z
---

As of 2026-10-05, Phase 5 ("Operational Core") made JOB, TRUCK, TRAILER and DRIVER persistent entities: UI → src/application/operations.ts (OperationsService, the only write path) → pure domain (src/domain/**) → src/repositories/operationalStore.ts (IndexedDB "fleetos-operations", separate from Road Intelligence's "fleetos-ingestion"). Bootstrap (src/repositories/bootstrap.ts) imports legacy localStorage "fleet-jobs-v3" once and seeds demo records once; "Repor dados demo" lives in Settings. Job ids are UUIDs; jobNumber "J-00xxxx" comes from an atomic IDB counter. FORCE_STATUS was removed — every status change goes through domain/jobs/lifecycle.ts.

**Why:** the user's Phase 5 spec required removing static mockData as source of truth, fixing the duplicate-ID bug and the Kanban bypass, and ending with a STOP boundary: no Phase 6 (advanced dispatch / time-aware scheduling), 7, 8, 9, Project 2, Fuel/Toll Intelligence, driver app or telemetry until asked.

**How to apply:** new operational features go through OperationsService + domain functions (Result + events), never direct state. All seed records are labelled isDemo; positions are null/UNKNOWN except demo-simulated. Don't start Phase 6 work unprompted. Related: [[road-intelligence-state]].

Phase 5.5 (2026-10-05) rebuilt the whole UI on top of this: tokens in src/index.css (inside `@layer components` so Tailwind utilities still win), primitives in src/ui/kit.tsx, central status/provenance in src/ui/status.ts, Lisbon formatting in src/ui/format.ts, routes /, /work, /work/:id, /dispatch, /fleet(/trucks|/trailers/:id), /drivers/:id, /intelligence, /settings (old /app/* redirect via src/lib/legacyRoutes.ts). New UI must reuse these primitives rather than one-off styles.
