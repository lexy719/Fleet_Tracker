# Route management in the merged environment

8 October 2026. DEV environment only. No production backend writes, repository integration, commits or pushes.

## Result

Adding route content to a Truck or Driver with a transport creates/reuses a combined `ROUTE_OPERATIONS` tab. The shared route becomes the full-width lead; the participating truck, driver and restriction objects become supporting instruments. The prior composition is preserved. Additional Documents and Transport content remains represented as context.

The new **Gestão da rota** question brings the delivery sequence, observed completion, signed window margins, route impediments and resource release into one operational reading. Links follow restrictions and related resources, review windows, or morph into the spatial canvas. The already anchored resource is a current readout rather than a no-op link.

**Percursos** is a captured facet, not component-local accordion state. It replaces the delivery/control reading with all available alternatives and their evidence. Escape restores the comparison after inspecting windows, then restores management; returning to the saved source composition retains its exact state. Each question remains inside the combined page.

## Read-model corrections

- Official diversion geometry is scoped as a segment. Its complete distance and duration remain unknown, and its feasibility is UNKNOWN pending evaluation. The former invented extra 11 km and PASS were removed.
- The recorded Faro–Porto NO_TOLLS corridor uses its recorded provider distance/date. Historical geometry is not a fresh execution result.
- A planned ETA passing does not mark an outstanding stop completed.
- ETA plus 40 minutes unloading is an ASSUMED resource release. Missing resources, maintenance and qualification blockers expose unknown availability. Stale driver timing also removes projected release times.
- Future position is an assumed route endpoint, distinct from current simulated telemetry.
- DEV contract comments now explicitly describe a projection requiring adapter mapping, rather than claiming drop-in compatibility with production queries.

`engine/routeManagement.ts` composes reads only. It does not implement another planner, and it never returns dispatch clearance from these incomplete inputs.

## Validation

- Full project suite: **73 files / 1,535 tests passed**, using `npm test -- --maxWorkers=4 --testTimeout=15000`. An earlier default-concurrency run had one official PDF fixture exceed its 5-second timeout; the bounded rerun passed without changing the test or fixture.
- After final comparison/history and stale-availability refinements: **19 environment files / 153 tests passed**.
- Application, test and server typecheck passed. Targeted ESLint passed.
- Production build passed. Its existing map-vendor chunk-size warning remains. Searching generated assets found none of the route-management DEV markers.
- Native headless Chrome acceptance at **1440, 1920 and 1199 × 900** passed: actual sidebar clicks, intermediate morph geometry, persistent route/truck object hosts and map instance, all participating domains, new-tab ownership, exact source restoration, comparison/window Escape history and saved-tab reuse.
- Final dead-click audit: **161 visible controls**, zero dead clicks, zero uncaught page errors. Fixtures covered route management, route comparison, a maintenance-blocked trip and a missing-trailer trip. The first audit found three current-truck links with no effect; they were corrected before the final passing audit.

## Evidence

Artifacts are in `C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30`:

- `route-management-demo.webm`: Truck → Driver → Restrictions → Route management → comparison → windows → exact returns.
- `route-management-1440.png`, `route-management-1920.png`, `route-management-1199.png`.
- `route-management-comparison.png`: all recorded corridors and the scoped official segment.
- `route-management-browser-report.json`: final flows, per-control audit and errors.
- `verify-route-management.cjs`, `record-route-management.cjs`: reproducible browser checks and recording.

The backend findings and engineering sequence are in `fleetos-backend-route-analysis.md`. The next production step is an application-owned revision transaction plus a typed operational adapter; it has not been substituted by synthetic frontend state.
