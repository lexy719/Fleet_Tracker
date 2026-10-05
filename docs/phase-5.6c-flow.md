# Phase 5.6C — implementation trace (before changes)

The active, uncommitted checkout was inspected before implementation.

`JobRoutePlanner` resolves the job, truck preset, cargo and manual driver hours. It chooses the recorded departure or now, then `planRouteOptions` makes a traffic-aware primary request (up to three native alternatives) and a separate toll-avoiding request. The provider summary's travel time already includes traffic; `trafficDelaySec` is explanatory, not an extra duration. Fuel and unpriced toll costs are modelled estimates, not guaranteed prices.

Provider deduplication uses geometry (`routesEquivalent`) plus length/time guards. The planner then retains role slots and one other option. `useCleanRoutes` solves FASTEST and NO_TOLLS separately with their provider baselines, route-driven discovery, accepted restriction evaluation, cumulative avoidAreas and complete reevaluation of each new route. Solver reuse compares inputs and dataset version. A second planner effect also requests avoidance for the selected affected route, duplicating solver work.

Restriction passage uses `routeTimingInput` / `planStops`. Cards use a separate `simulateDrivingSchedule`; windows treat driving-only arrival as earliest and arrival with breaks as latest. The UI and confirmed summary nevertheless use TomTom's driving-only `arrivalAtIso`. Confirmed `plannedDurationMin` also stores driving-only duration. This creates the observed ETA inconsistency.

The countdown receives the planned departure as its `now` argument. `Usar esta rota` appends by option ID; route rows then merge solver provenance by rounded distance/duration, without geometry-aware deduplication of the whole pool. Equivalent provider and solver IDs can therefore become duplicate choices.

Confirmation uses `createComplianceRecord`, persists full/simplified geometry only when replay preserves outcomes, stores facts, timing options and input fingerprint, and writes an operational plan through `confirmPlan`. Reassessment uses the saved geometry without routing calls. Intelligence's review action always sends jobs to Dispatch, including executing jobs that Dispatch refuses to replan.

Implementation preserves these provider, evaluator, solver, repository and lifecycle foundations. It adds a canonical operational timeline and a domain decision set between candidate evaluation and presentation, removes the redundant avoidance request, and separates compliance review from replanning.
