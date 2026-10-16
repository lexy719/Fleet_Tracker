# FleetOS — operational/domain hardening report

Date: 2026-10-07. Scope: production operational machinery and interfaces for a future 5.7L. No Plan UI, lab integration, database migration, commit or push was performed in this pass.

The original request is preserved in [operational-hardening-request.txt](operational-hardening-request.txt). The architecture was mapped before editing in [operational-hardening-architecture-before.md](operational-hardening-architecture-before.md).

## Outcome and ownership

The existing operational planner and restriction evaluator remain the decision engines. This pass fixes timing/baseline defects and adds a read-only operational boundary, reproducible execution replay, domain alternatives, explainable stop candidates, explicit input invalidation and proposed/accepted plan revisions.

Job remains commercial demand. Its assignment and planned ETA fields remain compatibility projections for existing screens. A confirmed `Job.operationalPlan.execution` owns the physical execution: resources, departure, movements, waits, service and driver state. Nothing in the new modules depends on a DEV workspace, browser globals or interaction state.

The new revision envelope is a domain contract. It is **not yet persisted or integrated into the existing confirmation UI**. `OperationsService` remains the only mutation owner and the operational store remains the atomic persistence boundary. No second write path was created.

## Architecture: before → after

| Concern | Before | After this pass |
|---|---|---|
| Commercial demand | Job cargo, ordered stops, windows and legacy projections | Preserved; `operationalDemand` defines planning inputs without notes/display ETAs |
| Physical execution | Planner creates EMPTY/LOADED movements, waits and services | Preserved; `buildExecutionTimeline` independently replays the saved execution using those same timing and idle rules |
| Resource identity | Execution assignment plus Job compatibility fields | `getResourceAssignment` reads the execution assignment and flags conflicting projections/missing records |
| Movement timing | Provider total, point interpolation, mandatory stops; repeated builds | One reusable movement result; strict metadata checks; request-scoped evaluation reuse; driving propagation consumes its existing stops |
| Restriction passage | Fractional wall-clock interpolation could smear pauses | Interpolate driving first, then insert discrete stops; evaluator uses the corrected local passage interval |
| Future resources | Sequential commitment propagation using saved endpoints and driver state | Replays operational commitments; changed timing/windows or affected/uncertain restrictions block unsafe future projections |
| Route alternatives | Provider option mixed domain metrics with card labels | Domain projection with intent, geometry/content fingerprint, timing, restrictions, provenance, explicit feasibility and uncertainty |
| Candidate stops | Mandatory driving pauses only | Added explainable candidate eligibility: current progress, legal limit, fuel range, compatibility, detour and rescheduled delivery margin |
| Proposed changes | Job revisions; no standalone plan consequence/lineage interface | Pure proposal/acceptance envelope with parent fingerprint, snapshots, input checks, fresh restriction validation and consequences |
| Derived-state invalidation | Several local stale-input checks and array-identity caches | Content snapshots and dependency mapping; exact geometry content checked at every evaluator entry, invalidating changed indexes; geometry hashes recomputed from content |
| Frontend reads | Screens could select compatibility values and calculate independently | Injected immutable snapshot/dataset query boundary; no UI wiring in this pass |

```text
Commercial demand + resource inventory + driver evidence
                      │
             existing sequential planner
                      │
               JobExecution / Trip
                      │
Provider geometry + departure + driving state
                      ↓
             canonical movement timeline
                      │
              waits + active services
                      ↓
              replayed execution timeline
                ┌─────┴─────┐
                ↓           ↓
       local passage    delivery margin / driving state
                │           │
                ↓           ↓
       existing restriction engine / future resources

previous revision + proposed plan + current inventory/dataset
                      ↓
       validate + structured consequences + proposal
                      ↓
       revalidate + conflict/uncertainty checks + accepted revision
                      ↓
       future OperationsService atomic transaction (not wired here)
```

## Files authored or changed by this pass

The repository already contained uncommitted production/planning work and a DEV lab before this task. This list describes this pass, not the entire current Git diff.

Existing production files:

- `src/ops/drivingStops.ts`: numeric validation; iteration guard fails explicitly instead of truncating.
- `src/domain/drivers/drivers.ts`: invalid/future baseline handling.
- `src/regulations/geometry.ts`: leg/coordinate/departure validation, degenerate-point timing, invalid sampling rejection, spatial-index invalidation hook.
- `src/regulations/timeline.ts`: model validation, aggregate arrival, discrete fractional passage, interval uncertainty, legacy error-boundary compatibility.
- `src/regulations/operationalTimeline.ts`: provider-summary normalization, explicit fallback provenance, shared stop schedule and reproducible route input.
- `src/regulations/evaluate.ts`: corrected temporal exposure inputs, content-checked index reuse at the evaluation boundary, invalid-route error even with an empty dataset. Existing exception semantics were retained.
- `src/regulations/decisionInputs.ts`: remove geometry hash memoization by mutable array identity; preserve the existing hash format for saved records.
- `src/domain/planning/planner.ts`: reuse a timing/report by content within a single movement request; reject malformed provider leg metadata; consume already generated stops for driving propagation; use shared movement facts.
- `src/domain/planning/state.ts`: shared driving-state helpers, position/availability validation, commitment replay and current restriction/fact checks.

New production modules:

- `src/domain/planning/drivingState.ts`: existing idle/advance policy extracted without a competing scheduler; avoids a circular dependency with execution replay.
- `src/domain/planning/transportFacts.ts`: existing planner movement-fact logic extracted for shared use, including EMPTY cargo and actual equipment facts.
- `src/domain/operational/values.ts`: discriminated known/assumed/unknown values, explicit-offset instants and feasibility types.
- `src/domain/operational/executionTimeline.ts`: reproducible execution activities and per-stop times/margins.
- `src/domain/operational/routeAlternatives.ts`: UI-independent projection of real supplied route candidates.
- `src/domain/operational/stopPlanning.ts`: candidate ranking and coded explanations.
- `src/domain/operational/invalidation.ts`: immutable input capture, content fingerprints and event/dependency mapping.
- `src/domain/operational/planComparison.ts`: structured timing/distance/cost/assignment/restriction/compliance consequences.
- `src/domain/operational/planRevisions.ts`: pure proposal and acceptance validation, revision lineage and snapshot isolation; separates live inventory from optional proposed commercial demand.
- `src/application/operationalQueries.ts`: read-only integration boundary using a captured operational snapshot, current dataset and clock.

New test files are listed below. Documentation consists of the preserved request, before-map, this report and measured performance JSON.

Boundary verification: SHA-256 snapshots of existing `src` files were captured before editing. The changed existing production files correspond to the nine listed above. The comparison also shows ongoing external edits within `src/dev/fleetos-environment` (including new lab files); this pass made no writes to that directory, production UI components, application entry points, styles or persistence schemas. The lab therefore cannot be described as byte-for-byte unchanged during the overall parallel session, but its changes are outside this pass.

## Bugs and risks corrected

| Severity | Defect/risk | Change and evidence |
|---|---|---|
| High | A 45-minute break or 11-hour rest could be spread across an entire sparse route segment when calculating fractional passage | Driving-time interpolation precedes discrete stop insertion. Tests cover points before/after a break and a temporal restriction whose outcome changes under smeared timing |
| High | An edited confirmed commitment could propagate its old end time and driver state | Reproduce the physical execution against current stop/service inputs before releasing resources; inconsistent commitments are blocked |
| High | Saved clear restriction reports could conceal a current restriction during revision acceptance | Proposals and acceptance evaluate current dataset and current job/equipment facts; accepted movement reports/inputs are rebuilt |
| High | Future-recorded manual driver evidence was treated as known at an earlier departure | Explicit unknown flags; malformed dates/numbers cannot throw through local-time conversion |
| High | A stop recommendation could preserve the delivery window on paper while ignoring pauses introduced by detour or early stopping | Replace the next pause at the candidate and reschedule remaining driving/pauses; service is additional active time |
| Medium | Coincident route points lost positive provider duration | Degenerate legs distribute duration by point index; a one-point leg represents arrival |
| Medium | Empty geometry arrival could disagree with provider driving plus pauses | Aggregate arrival comes from provider duration and stop schedule; local passage remains unavailable |
| Medium | Invalid sampling step could cause unbounded corridor sampling | Reject nonpositive/invalid sampling and invalid matching parameters |
| Medium | Excessive stop-planning horizon silently returned a partial schedule | Guard exhaustion throws an explicit error |
| Medium | In-place geometry edits could reuse spatial/hash data from the previous route | Spatial reuse requires exact unchanged content at the evaluation boundary; decision hashes read content again; mutation regression test included |
| Medium | Malformed routes with zero loaded restrictions could look compliant | Evaluator status remains `EVALUATION_ERROR`, independently of result count |
| Medium | Replaying confirmed Job.plannedDepartureAt as pickup service start doubled loading time | Execution.pickupMs owns loading start. The Job compatibility departure is a loaded departure and is checked separately by selectors |
| Medium | UI labels, independently saved metrics or partial replay could masquerade as current consequences | Comparisons derive distance/cost/timing from movements and reproducible execution; unavailable timing/cost returns null/UNKNOWN |

Some risks were discovered while implementing the new interfaces, rather than demonstrated in the previous UI. They are covered as invariants; the report does not claim every one was an observed user-facing incident.

## Strengthened invariants

1. UNKNOWN does not become PASS or a recommended stop. Assumed provenance cannot be narrowed to known without examining the value status.
2. Dated operational instants require an explicit offset. Clock-only/host-local strings cannot be accepted as canonical instants by replay.
3. Arrival, elapsed time, break/rest totals, waits, service and final driver state must reproduce the physical execution. Failed replay exposes no partial operational timeline.
4. Cargo service does not reset continuous driving. Stationary idle follows the existing break/rest policy. Midnight does not reset the driver's allowance.
5. Provider traffic delay is not added a second time. Provider summary duration remains the total used to normalize rounded leg durations.
6. Missing geometry cannot establish route-local passage. A fallback leg partition is labelled assumed; the planner cannot confirm it as valid provider leg metadata.
7. Equipment facts come from assigned Truck/Trailer resources. Recorded job facts cannot override the physical equipment facts during movement evaluation.
8. Future resources are sequential. Stale commitments, invalid positions, overlaps or unfinished in-progress evidence prevent a trustworthy release projection.
9. Proposals preserve snapshots, revision parentage and input inventory/dataset fingerprints. Live Jobs remain the concurrency guard; optional `proposedJobs` are validated as demand overrides for existing records at the same live revision. Acceptance uses fingerprint-checked proposed snapshots, revalidates the live source inventory and does not overwrite accepted demand.
10. Proposal acceptance rebuilds derived metrics, trips, reports and future state; independently edited aggregate fields do not become operational truth.
11. No UI card-count requirement determines domain alternatives. Segment alternatives are explicitly scoped to a physical movement.
12. Issued documents remain historical snapshots. This pass signals document consequences; it does not rewrite existing documents.

## Tests and checks

New suites under `src/domain/operational/__tests__/`:

| Suite | Coverage |
|---|---|
| `timeline.test.ts` | Planner/confirmation replay, pickup semantics, activities, missing geometry, invalid service/windows/order, UNKNOWN driver, missed window, fractional passage, temporal restriction regression, degenerate legs, offset times, large horizon, invalid sampling, mutable geometry and empty-dataset error |
| `revisions.test.ts` | Immutable proposal/acceptance, no-op/display-only edits, lineage/input mutation, missing resources/trailer, availability/origin/driver chaining, missed delivery, fresh closure rejection, explicit uncertainty acknowledgement, consequence deltas/nulls |
| `alternatives-stops.test.ts` | Intent without fake alternatives; provider error/stale departure; missing geometry/provenance/facts/driver/leg timing; no clean alternative; toll provenance; legal/detour/range/window/compatibility explanations; exact boundaries; early pauses and active service |
| `queries-invalidation.test.ts` | Confirmed read boundary, immutable snapshot, stale demand/resources/service/departure, future resource propagation, overlap and edited commitment blocking, unrelated/missing restrictions, stale driver evidence, dependency/event invalidation and notes exclusion |
| `performance.test.ts` | Repeatable measurements plus correctness assertions for timing, remote restriction evaluation, replay and a synthetic 20-job sequential fleet plan |
| `fixtures.ts` | Test-only adapters to the existing planner and actual domain confirmation path; not production imports |

Verification results are recorded in the final check section below. Existing rules/solver/persistence tests are run as part of the whole suite. No UI tests or thresholds were rewritten to obtain a pass.

## Performance

Raw observations are in [operational-hardening-performance.json](operational-hardening-performance.json). The benchmark uses synthetic road geometry and the existing synthetic planning fixtures, not live TomTom/network timing.

Measured on the local Windows x64 machine using bundled Node v24.19.0. Latest controlled run:

| Path | Mean | p95 |
|---|---:|---:|
| Timing, 10,000 points | 3.91 ms | 6.01 ms |
| Compliance, 10,000 points / 40 remote restrictions | 13.36 ms | 17.76 ms |
| Amadora→Porto execution replay | 4.57 ms | 11.39 ms |

The 20-job/five-crew plan took 3,487 ms, used 67 provider-fixture requests and recorded 896 request-cache hits. Search was truncated (`globallyOptimal: false`), with 504 evaluated extensions and 116,220 cheap rejections. Host scheduling caused substantial variation across runs; these are observations, not guaranteed response budgets.

- Timing: 10,000 points, 30 samples after warmup.
- Compliance: 10,000 points against 40 remote restrictions, 20 samples after warmup. This exercises route-wide index construction and remote corridor rejection; it is not a worst-case overlapping-corridor benchmark.
- Replay: Amadora→Porto synthetic execution, 30 samples after warmup.
- Fleet: 20 heterogeneous jobs, five crews, sequential bounded beam search, one complete measured run. The recorded search reports its provider-request count, cache hits and truncation. It is not a global-optimality claim.

Correctness-oriented changes reduce repeat work inside a movement request: a provider callback and subsequent candidate acceptance reuse the same content-keyed timeline/report; legal state advancement consumes already produced stops. Timing/report reuse does not cross departure/driver/equipment/dataset request boundaries. Geometry indexes are shared by constraints and may survive repeated evaluations only after an exact coordinate-content check; changed geometry explicitly invalidates the index. Identity alone is insufficient.

There is no measured pre-change benchmark, so no percentage speedup is claimed. Content hashing and immutable snapshots have a cost; future query caching should key the complete operational input/dataset projection and apply the explicit invalidation boundary.

## Integration points for 5.7L

Create a query boundary with `createOperationalQueries(snapshot, dataset, nowMs)` after loading the existing application state. Recreate it on an operational snapshot/dataset update. It exposes:

- `getResourceAssignment(jobId)` — current execution identity and projection/missing-resource issues.
- `getOperationalTimeline(jobId)` — replayed activities/stops/margins or explicit stale/unavailable reasons; it does not silently select an old ETA.
- `getRouteAlternatives(jobId, candidates?, movementIndex?)` — selected movement or actual supplied candidates, projected into the domain model. It does not call TomTom or generate missing variants.
- `getRestrictionImpact(jobId, restrictionId)` — fresh current-fact evaluation over canonical movements, including unrelated-route non-applicability and missing-regulation UNKNOWN.
- `getResourceFutureState(initialState?)` — existing sequential state algorithm, explicit unknown values and ordered remaining assignments; future endpoints are labelled assumptions rather than observed locations.
- `getPlanConsequences(proposal)` — cloned structured consequences for the frontend.

Pure domain helpers include `compareOperationalPlans`, `planOperationalStops`, `captureOperationalInputs`, `compareOperationalInputs`, `invalidationForEvents`, `proposeOperationalPlanRevision` and `acceptOperationalPlanRevision`.

The future application adapter should generate a fresh candidate through the existing planner, propose against the accepted revision, display consequences, then accept/revalidate inside the existing serialized application mutation flow. Persist jobs/events/plan revision together using operational-store revision/resource expectations. Do not save a proposal as an accepted plan and do not use browser interaction state as domain input.

For a stop/cargo/window edit, pass the live inventory as `context.jobs` and the pending overrides as `context.proposedJobs`. Generate the candidate against the merged target demand, then call `proposeOperationalPlanRevision`. Its proposal captures the original live inventory fingerprint separately from the target scenario fingerprint. At acceptance, pass live context again; proposed demand is reconstructed from the verified proposal snapshots. Concurrent changes to the accepted Job reject acceptance. Persist target demand and confirmed execution together only after domain acceptance succeeds. A regression test changes a delivery coordinate, checks consequences/new revision, verifies accepted source Jobs remain unchanged, then verifies rejection after a concurrent live edit.

## Remaining work and practical limits

- Wire revision acceptance/persistence into `OperationsService` in a later phase, with an atomic meta revision expectation in addition to existing job/resource expectations. This pass intentionally exposes pure acceptance, not a newly competing storage mechanism.
- Existing Job assignment/ETA/compliance compatibility projections still exist. Migrating/removing them requires a separate UI/persistence migration and historical-record policy.
- Legacy jobs without a reproducible operational execution return unavailable through the new timeline boundary. Existing legacy screen behavior was not redesigned.
- The old route-compliance-only commitment fallback remains in `initialFleetState` for compatibility. It does not constitute a full stop/service execution replay. Migrate those records to reproducible JobExecution snapshots before treating their future-state projection as verified physical execution; this pass does not invent historical service/tachograph evidence.
- Driver-hours behavior remains FleetOS's existing planning model: it is not certified tachograph execution evidence. Missing/in-progress evidence remains unknown/blocked.
- Manual/simulated positions must have explicit provenance. Confirmed future endpoints are predictions. The query boundary does not infer live GPS from them.
- Route intents describe actual supplied provider requests. The adapter cannot provide eco/no-tolls/restriction-avoiding geometry if the provider has not produced it, and avoided restriction IDs are not invented from avoidance rectangles.
- Stop eligibility requires supplied detour routes/times/distances, range, progress, compatibility and delivery closing time. It does not discover stations, derive fuel from nonexistent telemetry or implement a simultaneous multi-stop optimizer.
- Restriction PASS means no applicable constraint among the evaluated known dataset, not complete regulatory coverage of every road. Existing discovery/territory coverage machinery remains separate.
- Fingerprints use FleetOS's existing noncryptographic change-detection scheme, not an adversarial security signature.
- Proposal inventory checks deliberately retain the existing conservative full-inventory fingerprint. A non-planning edit may still force a proposal refresh even though `compareOperationalInputs` correctly leaves timing/restrictions valid. Optimizing proposal scope must preserve the application transaction's concurrency protection.
- Direct mutable callers of the low-level corridor matcher must use `invalidateRouteGeometry`; the production evaluator already does so at every entry.
- Whole-project checks include concurrently edited lab code. A temporary `findLastIndex` TypeScript failure was observed in the lab and disappeared on the next full typecheck/build without an edit from this pass.

## Recommended Phase 5.7L

1. Connect the pending-change UX to these operational queries and structured consequences, while preserving the accepted plan until domain acceptance succeeds.
2. Add the application transaction adapter for revision lineage and immutable accepted snapshots; test concurrent acceptance and store rollback before connecting the UI.
3. Attach real provider candidates and explicit position/fuel provenance; keep unknown data visible and block unsupported auto-confirmation.
4. Use a fresh canonical execution/query result for map passage, driver timeline and delivery explanation; avoid per-surface ETA calculations.
5. Profile with recorded provider geometry and real restriction corridors before adding persistent caches or increasing search budgets.

## Final verification

| Check | Result |
|---|---|
| New domain tests | 101 passed across five suites, including the separate benchmark |
| Focused regression pass | 246 passed across ten suites (new domain, existing planner, evaluator, timeline and solver); later added baseline/commitment/isolation cases passed in the final functional run |
| Typecheck | Passed: application, test and server TypeScript configurations |
| Lint | Passed across the project |
| Production build | Passed; existing large-chunk warning remains, particularly map/PDF bundles |
| Full regression on final source | 1,498 passed / 1,498 across 66 suites. Direct runner: `vitest run --maxWorkers=1 --testTimeout=15000`; elapsed 246.54 s |

Earlier default full-suite runs exposed timing variance, including 5-second brute-force reference timeouts and existing search/picker/alert performance ceilings. Those tests and ceilings were not edited. A two-worker controlled run passed 1,491 of 1,495 tests, with four timing/performance failures: two Viana do Castelo→Lisboa brute-force corridor comparisons exceeded 15 seconds, search-index construction took 325.85 ms against 250 ms, and the record picker took 191.70 ms against 16 ms. The same UI/territory suites passed a separate isolated run. There is no pre-change baseline run proving the cause; host-load attribution is an inference from variation, not a certified diagnosis.

The final controlled full run passed all 1,498 tests. It calls the runner directly with one worker and a 15-second timeout for long reference comparisons, after the scoped pending-demand extension. This command-level timeout allowance is reported explicitly; it does not relax the asserted search/picker/alert millisecond budgets. An additional missing-continuous-state regression was fixed and verified after an earlier worker had loaded the previous implementation. No test timeout configuration or performance ceiling was edited in source.

No browser acceptance or live TomTom calls are claimed in this backend pass. The delivered measurements use test/provider fixtures. No production UI or lab files were written by this pass, and no Git commit/push was created.
