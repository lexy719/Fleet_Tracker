# Operational hardening - architecture before edits

Inspected 2026-10-07. This is the production/domain pass, separate from Claude's 5.7K lab. The supplied request is preserved in `operational-hardening-request.txt`.

## Ownership and relationships

- `data/types.ts`: Job is commercial demand (cargo, customer, ordered stops and dated windows), with legacy projection fields and current resource references. Truck/Driver/Trailer are independent master records. Legacy `Route` is a demo/read representation, not the operational planner's execution entity.
- `domain/planning/types.ts`: OperationalPlan owns a horizon of JobExecution records. Each execution owns its assignment, EMPTY/LOADED movements, starting/final driver state, waiting/service and reasons. Trips group sequential jobs with the same assignment; they do not consolidate simultaneous loads.
- A confirmed job's `operationalPlan.execution` is the physical execution snapshot. `assigned*`, `planned*`, `routeCompliance` and `planDecision` are compatibility projections on Job. The full selected/recommended plan is stored in operational meta. Documents separately own immutable issued snapshots.
- `domain/planning/planner.ts`: beam search combines compatible resources and route choices, applies waits/services, propagates driving and future locations, rejects missed dated windows, preserves commitments and explains uncertainty. `state.ts` establishes future resource availability; `feasibility.ts` provides resource/equipment checks; `economics.ts` derives aggregate metrics.
- `application/planningRouter.ts` and `tomtom/planRoutes.ts`: provider requests, dynamic route candidates, toll/fuel estimates and restriction avoidance. Their route options contain presentation fields as well as reusable provider geometry/leg timing; a UI-independent alternative projection is missing.
- `regulations/geometry.ts`: distance-weighted point times and corridor matching. `timeline.ts`: driving, mandatory breaks/rests and local passage bounds. `operationalTimeline.ts`: provider-total normalization plus another arrival/stop calculation. The planner consumes this helper per physical movement, then applies stop services/waits between movements.
- `regulations/evaluate.ts`: tri-valued vehicle/cargo + actual route exposure + temporal rule + confirmed exceptions. `decisionRecord.ts` persists replayable inputs, geometry and decisions. `reevaluate.ts` checks current inputs/datasets. UNKNOWN is separate from permission.
- `application/operations.ts` is the mutation boundary. `repositories/operationalStore.ts` commits records/events/meta atomically with job revision and resource update checks (memory and IndexedDB). Job revision currently serves optimistic concurrency and includes non-planning edits; an explicit proposed-plan revision/diff boundary is absent.

## Concrete risks to cover before changing behavior

1. Fractional passage times interpolate wall-clock point timestamps across a mandatory stop, spreading a discrete 45-minute/11-hour stop across a road segment.
2. Empty/degenerate geometry and inconsistent leg metadata can disagree with provider-total arrival; coincident points lose a positive leg duration. Invalid numeric metadata can propagate NaN or silently partial timing.
3. `validTimingModel` does not validate a supplied continuous-driving count. `planStops` silently stops after its iteration guard.
4. A same-day manual driver baseline recorded AFTER departure is labelled known; malformed persisted dates can throw while converting to local time.
5. Movement timeline/evaluation is rebuilt repeatedly in the planner and again by resource-state propagation, despite identical inputs in the same evaluation pass.
6. There is no structured, UI-independent plan consequence diff, proposal lineage, explicit dependency invalidation projection or one frontend selector boundary for operational truth.

## Intended contained changes

Fix proven timing/baseline bugs with regression tests. Reuse the existing planner, restriction evaluator and atomic store rather than introducing a competing scheduler. Add production domain projections for execution timelines, alternatives, explainable stop candidates, revisions/consequences and invalidation, and a read-only application selector boundary. Validate confirmed execution snapshots against current demand/resources before presenting derived results. No lab imports, UI edits, Plan UI, source schema migration, commit or push.
