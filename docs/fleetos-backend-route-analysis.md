# FleetOS: route machinery and the living environment

8 October 2026. Source analysis of the current working tree, including the ongoing uncommitted backend work. Scope: operational storage and commands, fleet planning, routing, restriction evaluation, execution timing, future resources, revisions, research evidence, and the DEV environment. This is an implementation review, not independent validation of current road rules or a production security certification.

## Main conclusion

FleetOS has considerably more operational machinery than the environment currently communicates. Its useful organising object is an **execution**: commercial demand + an assigned combination + empty/loaded movements + dated stops + driving state + road evidence. Route management should compose those relationships into a page that answers a decision, rather than display a collection of disconnected domain summaries.

The strongest foundations are reproducible movement timing, conservative resource commitments, explicit uncertainty, and atomic confirmation. The largest integration gap is that the newer read and revision boundaries exist mainly as domain facilities and tests. The ordinary application still saves recommendations through an older confirmation path. The lab is a separate synthetic demonstration, not a connected operational client.

## What exists, and where

| Layer | Implemented behaviour | Implication for the environment |
| --- | --- | --- |
| Operational persistence | `src/repositories/operationalStore.ts` provides memory and IndexedDB stores. Jobs, resources, documents, customers, sites, events and metadata are stored locally. IndexedDB checks job revisions and resource update expectations within the same read/write transaction. | Treat accepted operational facts as shared truth across compositions; view history must not undo a committed fact. This is local persistence, not a remote fleet backend. |
| Application commands | `src/application/operations.ts:73` serialises compute → commit → publish. At line 153 confirmation retrieves a saved recommendation, checks inputs, commits jobs/events/confirmed metadata with resource and job expectations. | A future environment command should return one accepted snapshot or a conflict, not mutate several instrument-local stores. |
| Fleet search | `src/domain/planning/planner.ts:50` extends resource combinations through jobs. It handles positioning travel in EMPTY movements, loaded stop-to-stop legs, waiting, service and carried driver state. Defaults in `types.ts:55` are beam width 8, 16 extensions per state, 256 movement route requests and 4 movement alternatives. | Show the jobs served, unserved diagnostics, resource chain, empty travel and search limits. Never claim global optimality: the result explicitly says `globallyOptimal: false`. |
| Resource suitability | `src/domain/planning/feasibility.ts` checks availability, payload, pallets, towing/trailer type, equipment, temperatures, ADR, licences, qualification dates, position and driving state. `transportFacts.ts` keeps legal facts separate from routing presets and distinguishes component from combination scope. | Truck + Driver + Restrictions should answer whether this actual combination can execute the movement. A default routing profile must not fill a missing legal measurement. |
| Route generation | `src/application/planningRouter.ts:18` uses vehicle/trailer envelopes, a bounded 5-minute cache and an external-call budget of 64 by default. It tries FASTEST and NO_TOLLS, evaluates each, and invokes the clean solver with at most two reroutes when required. | Candidates are provider results with request provenance, not a fixed set of fabricated “fast/economic/safe” cards. Count route requests separately from provider retries. |
| Road avoidance | `src/solver/solver.ts` translates applicable restrictions to avoidance requests, records diagnostics and iteration results, and retains uncertainty. Precautionary avoidance concerns legal-status uncertainty; missing vehicle facts need resolution rather than arbitrary avoidance. | “Why blocked?” should follow the restriction to the fact or evidence that decides it. An official diversion segment is not automatically a complete drivable route. |
| Timing | `src/regulations/operationalTimeline.ts`, `timeline.ts` and `src/domain/operational/executionTimeline.ts` replay provider legs into drive/break/rest/wait/service activities and stop margins. Malformed movement chains are unavailable; missing inputs lead to review/assumptions. `drivingState.ts` treats service as active work and does not reset hours at midnight. | Display dated activities and explicit stop margins. A stop’s arrival, service start, departure and observation of completion are different facts. |
| Restriction evaluation | `src/regulations/evaluate.ts` combines geometry, passage-time uncertainty, target facts and exemptions with tri-state results. `decisionRecord.ts` replays a persisted route and requires matching outcomes; evidence and input fingerprints are saved. | Keep PASS / FAIL / UNKNOWN distinct. A compliant result only describes the evaluated dataset, not comprehensive road knowledge. |
| Operational reads | `src/application/operationalQueries.ts:35` clones inputs into a read-only boundary. It checks resource specifications, assignments, departure and demand fingerprints before exposing timing. Alternatives at line 163 belong to a single physical movement, not the whole job. | Adapter mapping must carry movement identity and stale reasons into the page. It must not compare one leg against a complete multi-stop execution. |
| Future resources | `src/domain/planning/state.ts` replays existing commitments, blocks stale/overlapping/overdue commitments and refuses to invent remaining driving hours for an in-progress job. `operationalQueries.ts:268` distinguishes a planned endpoint from observed telemetry. | “Free at 16:00 in Porto” needs separate confidence for time, place and remaining driving. Show why a resource cannot be released. |
| Revision and consequence model | `src/domain/operational/planRevisions.ts:324,394` proposes/accepts fingerprinted parent revisions, revalidates execution/resources/restrictions, checks conflicts and requires uncertainty acknowledgement. `planComparison.ts` compares timing, margins, assignments, empty travel, fuel/tolls, driving, resource release and document differences. | Replanning should have an accepted baseline, a proposed execution, consequences and one confirmation. Switching a composition is not accepting a plan revision. |
| Stops and evidence | `stopPlanning.ts:40` explains reachability before the legal stop, detour, range and delivery consequences from supplied inputs. `src/research/` preserves evidence, source freshness, event validity and geometry-resolution uncertainty. | Station candidates need actual detour and compatibility inputs. A source fetched today is not necessarily current; a name match does not become verified geometry. |

## Material gaps and risks

### 1. New revision machinery is not the application save path — highest integration priority

Searching production source finds definitions and tests for `proposeOperationalPlanRevision`, `acceptOperationalPlanRevision`, precise invalidation and the new operational queries, but no ordinary application/UI callers for the revision commands. `OperationsService.confirmOperationalRecommendation` calls `domain/planning/confirmation.ts` instead.

That existing path does provide useful inventory/dataset guards, overlap checks, replayed compliance and atomic persistence. It does **not** run the newer complete execution replay and driver/resource chain validation from `planRevisions.ts`. The two acceptance paths have different defensive depth. Before enabling route changes in the environment, introduce one application-owned revision transaction that invokes the full domain validation, writes the accepted revision and demand/resource projections, and guards the parent revision atomically.

Suggested acceptance evidence: stale proposal rejected after an external resource edit; changed demand rejected after proposal; driver baseline chain rechecked; accepted history survives reload; a rejected commit publishes no partial state. Existing revision tests already cover much of the domain side, but application integration remains necessary.

### 2. The DEV contracts are a projection, not a interchangeable backend

The lab and production use similar query names and uncertainty envelopes, but their shapes differ. Production alternatives include `movementIndex`, timing, geometry and evaluation; lab alternatives describe recorded corridors or official segments. Production stop timing includes service start/departure; the lab adds labels and a synthetic spell limit. Production restriction impact returns per-movement reports; the lab returns a simplified passage summary.

The previous comment that a real provider could simply replace the lab was too strong; it is corrected. A typed adapter must map these differences explicitly, including completion observations and scopes. Do not directly cast the production output to the DEV interface.

### 3. Alternative-route evidence was overstated in the lab — corrected in this slice

The adapter previously added a fixed 11 km to every official diversion, and assigned PASS despite an unknown duration. Neither came from a calculated complete alternative. Those fields are now UNKNOWN and the alternative is explicitly scoped as an official segment. The existing recorded Faro–Porto NO_TOLLS corridor is included with its actual recorded distance and retrieval date; it still requires current timing and evaluation.

The production `operationalRouteAlternatives` handles geometry/provenance/timing uncertainty more carefully. However, `avoidedRestrictionIds` is currently returned empty by its conversion function; avoid-area request provenance is not a verified restriction-id mapping. A future adapter must not invent that mapping.

### 4. Scheduling beyond an active trip needs execution observations

The production future-state code deliberately blocks unknown remaining driver hours while a job is in progress. That conservative result should survive into the interface. The lab previously exposed ETA + 40 minutes as a known release time and current simulated position as future position. Release is now ASSUMED, blocked resources expose unknown release times, and future position is labelled as the planned route endpoint.

No tachograph or live execution ingestion is established by this work. A dispatch suggestion after the active trip must remain provisional until the missing observation is supplied.

### 5. Search limits and economic assumptions must remain visible

This is bounded beam search, not a proof of the best possible fleet schedule. Router and planner budgets count at different levels. Fuel price defaults and opportunity-cost weights are policies, not measurements; tolls may be estimated or unpriced. The production economics model calls its contribution “before unpriced costs,” appropriately.

A future comparison should preserve feasible trade-offs and show which costs are known, assumed or omitted. It should not rank unpriced tolls as free or turn the search’s recommended result into a “best route” guarantee.

### 6. Provider cancellation/retry semantics deserve a focused backend follow-up

`src/tomtom/httpClient.ts` has per-attempt timeouts and retry logic, but its catch block retries any caught error while attempts remain. This also catches non-transient HTTP errors after they are thrown, so the intended transient-only policy is not enforced end to end. Cancellation can also enter that retry path; a signal already aborted before registration is not explicitly checked. The helper uses `window`, so it is a browser transport rather than a Node backend service.

Fixing this was outside the isolated environment change. Recommended focused tests: 400/401 receive one attempt; transient 429/5xx follow policy; a pre-aborted signal makes zero requests; caller cancellation never retries; external-call accounting includes actual attempts if quotas depend on them.

### 7. Data coverage and operational/legal scope remain partial

Restriction datasets are curated and versioned, combined with enabled events and reviewed ingested constraints (`regulations/repository.ts`). Research geometry resolution preserves UNRESOLVED/AMBIGUOUS and interpreted name matches. Its chainage interface explicitly states that no official PK reference is loaded. The research proxy is explicitly local development/preview middleware; static deployment has no such server.

The driving machinery implements a particular scheduling policy and baseline model. Its READY/PASS flags are not independent certification of every duty, rest, multi-week or jurisdictional obligation. Further scope expansion requires a requirements review against authoritative rules and appropriately dated evidence; this analysis only reviews the implementation.

### 8. Local architecture will need a service boundary for a shared fleet

The current operational store is browser-local. In-tab command serialisation and IndexedDB optimistic guards are valuable, but they are not cross-device collaboration, identity, permissions, a remote event feed or centrally refreshed routing/research. There is no production fleet API in `server/`; the server code inspected is the development research proxy. CPU-heavy route evaluation and cloning also execute in the client. Profile real workloads before choosing a worker or service split; do not infer a performance defect just from file size.

## Environment improvements implemented now

Adding route content to an anchored Truck or Driver composition opens/reuses a new combined tab and selects `ROUTE_OPERATIONS`. The route object becomes the full-width lead; active truck, driver and restriction instruments move into a supporting band. Source compositions remain intact. The map is available as a spatial question instead of being permanently required.

The management facet shows:

- Ordered stops, actual completion markers, synthetic arrival estimates and signed window margins. Passing a planned ETA never marks a delivery complete.
- The next decision, resource impediments and followable restriction conditions.
- Evidence comparison for recorded corridors and official diversion segments, with unknown timing retained.
- Followable assigned resources and assumed release times after unloading.
- Links into existing window, restriction, spatial and object compositions, retaining participating domains and captured history.

It is a synthetic read composition. It does not calculate routes, claim a newly accepted operational revision, call the production repository, or offer a fake recalculation button.

## Next engineering sequence

1. Application revision transaction and adapter contract: consolidate acceptance, carry job/movement/revision/dataset identity and return explicit stale reasons.
2. Connect a read-only environment instance to real snapshots, once production integration is authorised. Preserve this separate DEV demonstration.
3. Expose before/after consequences for a staged route/resource/window change; confirmation uses the single revision command.
4. Add route-search lifecycle and diagnostics, including cancelled/partial searches, excluded candidates and external-attempt accounting.
5. Add observed execution/tachograph inputs before releasing in-progress crew into subsequent assignments. Then expose the fleet’s chained route commitments, empty positioning and downstream margin.
6. Integrate explainable stop candidates only when detour, compatibility, range and service data are available. Expand research coverage without upgrading interpreted evidence into verified facts.

Validation results and browser evidence are recorded in `fleetos-route-management-implementation.md` after implementation verification.
