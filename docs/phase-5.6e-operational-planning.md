# Phase 5.6E — Operational Planning

## A. Current architecture audit (completed before implementation)

Baseline: completed 5.6D, 47 files / 1235 passing tests, typecheck/lint/build green. Uncommitted 5.6D files are retained. A fresh full-suite baseline passed before functional changes (99.11 s).

Job already represents demand with optional assigned resources. JobRoutePlanner initializes selectedTruckId from a prior assignment, a demo preference or the first available/capable truck. Driver selection follows the current truck line; trailer is a selected input. checkAssignment validates that chosen tuple but does not optimize assignments, future schedules or sequences. It permits some qualification/cargo gaps as warnings.

calculate(truckId) builds dated departure (or now), truck profile and ordered job stops; planRouteOptions uses traffic-aware TomTom durations and RouteCache. Missing provider gives an unconfirmable geometry-less estimate. buildTransportFacts excludes generic routing assumptions from legal facts. operationalTimeline derives point/stop passage including 45-minute breaks and 11-hour daily rests. evaluateEuDrivingRules rejects weekly excess. evaluateCompliance applies the accepted dataset with hardened 5.6D exception semantics. The clean solver solveStrategy evaluates/reroutes each strategy, with discovery, reuse fingerprints and no trust in provider avoidance alone.

decideRoutes excludes hard prohibitions/errors, weekly blockers and missed delivery windows, then groups route geometry families and compares compliance, windows, risk, fuel/tolls and a declared time comparison weight. Exact Pareto dominance retains any material monetary/toll saving even when extra daily rest consumes a resource. It cannot compare alternative drivers, empty repositioning or downstream jobs because those inputs do not exist.

Confirmation uses createComplianceRecord to replay persisted geometry/timeline, then OperationsService.confirmPlan/lifecycle, which preserve resources, costs, report, evidence and previous history. Writes are serialized, atomic IndexedDB transactions with job revision guards. assessPlannedJob re-evaluates the saved route without fetching a new route or mutating history. Queued work has a line/promotion model, not a fleet horizon optimizer.

## B. Root architectural problems and chosen boundary

Assignment is an input to a React route calculator. No coordinated resource calendars, future states, empty movement, job sequences, plan objective or recommendation history exist. Equal splitting/current-nearest routing would not solve this.

Introduce a typed, provider-independent planning domain with independent truck/driver/trailer state and immutable commitments; explicit constraints; loaded and empty movement; carried driving state; stop-window waits; vehicle facts and compliance on every movement. Use a deterministic bounded beam search over feasible job/resource/route extensions. Cheap filters precede exact provider evaluations; exact request memoization and explicit budgets bound expensive work. The result reports explored/pruned/truncated candidates and never claims a global VRP optimum.

Economic policy separates provider fuel/tolls, optional non-fuel variable cost/km, and declared resource opportunity cost/hour. No revenue means unknown profit. Whole-plan comparisons use completed demand, uncertainty, generalized cost, empty km, completion time and downstream state. Existing route-decisions remain backward-compatible; a contextual comparison path will consume operational cost/downstream value when available.

Minimal application surface: automatic planning is the default for an unassigned job; manual selectors become explicit constraints. An inspectable domain plan shows reasons, empty/loaded km and alternatives. A DEV surface will exercise fleet fixtures, mutations and confirmation/replanning in an isolated persistent store. Existing real commitments are preserved; no user data is reset.

Audit completed before implementation. The following records the implemented foundation and measured acceptance on 6 October 2026.

## C. Domain model changes

`src/domain/planning` owns the engine. React constructs requests and displays results; it does not choose assignments, sequence jobs or score alternatives. `PlanningRequest` contains the complete inventory, accepted road dataset, dated horizon, optional initial resource states and explicit constraints. Scope may include one demand or the mutable fleet backlog; existing commitments outside the scope still reserve resources.

`Assignment` is an output. `JobExecution` describes its empty/loaded movements, stop service/waiting, resource assignment, dated timeline, structured reasons and exact driver state before/after execution. `OperationalPlan` contains coordinated executions, trips grouped by resource tuple, economics, metrics, future fleet state and reproducible planning inputs. Job gains an optional immutable confirmed execution snapshot; it still exists without any assignment. Optional additions use existing IndexedDB object stores and metadata; no destructive migration or database reset is required.

## D. Resource-assignment model

Cheap filters cover archive/manual availability, tractor/trailer compatibility, required equipment, payload and pallets, refrigeration/ranges, ADR equipment/classes/tank qualification, automotive/bulk equipment, cargo dimensions and licence/qualification expiry. Known cargo external dimensions can exclude equipment; internal clearance remains an explicit unverified fact. Trailer payload must be recorded or derivable from recorded gross limit and tare. Known truck kerb + trailer tare + cargo must not exceed the recorded combination gross limit.

Driver, truck and trailer have independent calendars and positions. A known driver/trailer must be physically colocated with the truck; a missing colocation is explicit uncertainty requiring review. A truck with no credible position cannot be automatically routed. No invented depot/coordinates are added. Existing demo telemetry remains labelled `DEMO_SIMULATED`; externally supplied initial positions retain their source. Capacity and legal driving impossibilities are rejected before routing. Qualifications are checked again against the execution end, not only its departure.

Every assignment is evaluated together with its actual route and carried driving timeline. The engine is deterministic over the supplied request and provider results, not over changing live traffic.

## E. Future-resource-state model

State starts with available inventory and recorded hours. Confirmed work reserves resources until its expected completion and moves their predicted origin to its recorded final stop (`CONFIRMED_JOB:<id>`). Later mutable work is appended after the last commitment, including empty travel from that future position. The Madrid regression proves that current Porto GPS loses to a confirmed Madrid destination when planning the next job.

An unfinished overdue commitment, missing timing, overlapping commitments, a changed resource specification/baseline, required replan or newly prohibited saved movement blocks extensions of the affected resources. In-progress work does not fabricate remaining driving hours from the old whole-route duration; that driver remains blocked pending an execution forecast. This is deliberately conservative.

Executed/delivered/invoiced/cancelled work is excluded. Confirmed assignments and JSON are retained. This phase does not insert mutable work into gaps between commitments or reschedule a confirmed horizon automatically.

## F. Multi-Job sequencing

The bounded beam extends a partial coordinated plan with feasible job/resource/route combinations. Each tuple has its own next availability, so independent crews can work concurrently. Delivery-to-next-pickup deadhead is calculated before the next commercial movement. Job stop order remains commercial demand, not an arbitrary reorder of pickups/deliveries inside a job.

Jobs are shortlisted by pickup deadline and geographic lower bound; candidates rotate across job buckets rather than letting all permutations of the first job occupy the shortlist. Before cost ranking, an optimistic cheap remaining-coverage bound avoids retaining a cheap prefix that has already stranded an urgent pickup. That bound makes no travel-time promise and does not certify remaining route feasibility.

Measured five-crew fixture: 20 demands, five trucks/drivers/trailers, dry/cold/bulk/automotive/ADR equipment, different coordinates and dated windows. Distribution is **8 / 5 / 3 / 2 / 2**, not an equal split. Baseline crew 1 follows J1-1 → J1-2 → … → J1-8. Moving J1-2 changes that sequence to J1-1 → J1-3 → … → J1-8 → J1-2. Tightening its pickup to 08:10–08:25 Lisbon makes J1-2 the first job while still serving all 20 demands.

The urgent-window browser test initially exposed a cost-first beam pruning flaw (19 served); the general remaining-coverage ranking fixed it. A regression uses the full heterogeneous fleet, not a special production Job ID branch.

## G. Empty/revenue km model

`EMPTY` and `LOADED` movements each have geometry, departure, traffic driving duration, breaks/rest, fuel/toll basis and legal evaluation. Empty arrival precedes pickup service. Waiting and service at each dated stop are explicit. Loaded km refer to commercial cargo movements; they are not a claim that a revenue amount has been recorded.

The baseline synthetic fleet measured **188.4 loaded km / 24.1 empty km / 2.7 fleet driving hours**. The geography mutation increased empty km to 36.1. The urgent-window scenario preserved all 20 jobs but increased empty km to 119.3; this is the selected bounded solution, not a claim of the minimum possible deadhead. A separate deterministic economic regression proves that lower total repositioning can beat a superficially cheaper isolated loaded route.

## H. Economic objective and no double counting

The declared comparison objective is lexicographic: serve demand; prefer fewer unresolved/at-risk inputs; compare recorded revenue and generalized cost; then empty km, completion time and deterministic ID. This is a transport fulfilment policy, not an optimizer for deciding which customers to reject based on profitability.

Direct cost = provider fuel + provider tolls + optional additional non-fuel €/km. The extra €/km explicitly excludes fuel, tolls and time. Default additional €/km is zero (unpriced), not a claim of free maintenance. Opportunity cost = driving + in-execution waiting + service + planned break/rest, multiplied by a declared comparison policy of **€18/hour** (the prior €0.30/min policy). It is not salary, an invoice or net profit. Free idle time before an execution is not independently monetized or added again to loaded/empty km costs. No separate speculative downstream bonus is added for the same cost savings.

Revenue is known only when all served demands have finite positive recorded amounts; legacy zero remains unknown. `contributionBeforeUnpricedCostsEur` is revenue less priced direct cost, never net margin. Unknown revenue stays null.

Synthetic fleet baseline: €95.62 fuel/toll + €167.81 opportunity = €263.43 comparison. Service is included in opportunity cost. Single synthetic Amadora–Porto: 309.3 km / 3.9 h driving / €139.19 fuel/toll + €75.60 opportunity = €214.79. Synthetic geometry, duration and costs are explicitly identified and are not TomTom evidence.

## I. Dominance/materiality changes

Operational decisions compare whole explored horizon plans rather than a quota of route cards. A covering plan with no worse uncertainty, cost and empty km can dominate another. Immaterial alternatives are suppressed against both the recommendation and already retained choices: same served demands/uncertainty, negligible direct/generalized cost, empty km, resource time and completion changes. Equivalent uncertain-driver permutations do not fill extra cards. A more expensive recommendation may legitimately rank first when it is better documented; its reason says demand/data confidence precede cost, rather than falsely claiming the lowest monetary cost.

Legacy route decisions retain their original default behavior for 5.6C regression. Their explicit operational context compares fuel/tolls plus opportunity time minus an explicitly supplied downstream value; an operator toll objective can be retained. The same context now controls family representative selection, ranking and recommendation stability. A dominated prior recommendation cannot reappear through stability.

Deterministic example: +13 hours to save €41 is removed at €18/hour when risk/windows are equal and there is no downstream benefit. Supplying an explicit €300 downstream benefit can make the slower choice win. At fleet level, an 11-hour rest also wins when it enables another job under a sequence constraint; no fixed duration cutoff exists.

## J. EU561 interaction

Existing timeline logic supplies conservative daily driving/break/rest rules and the weekly driving check. Empty and loaded driving consume the same carried daily/current-spell/weekly state. Midnight never resets a driving allowance. Qualifying idle intervals can schedule rest; cargo service itself never counts as a break.

Confirmed execution stores its exact start/end driving state. Future extension verifies that the starting baseline still matches, then carries the end state. This fixes a discovered error in replaying inter-movement gaps: those gaps can contain active loading/unloading. A regression with one-hour cargo service preserves the current spell and requires the next 45-minute break. Changed baselines block extending the old forecast instead of silently pretending its old legal allowance is current.

The browser fresh-driver case selects the documented fresh driver and returns one plan with zero daily rest. The useful-rest regional case keeps the old driver, 11 hours rest and two linked jobs because the fresh driver has only one weekly driving hour remaining. The synthetic regional two-job case is 114.7 km and two hours driving, not a one-hour simulation of the full Amadora–Porto journey.

Daily/weekly hours/current spell are manually recorded, not live tachograph evidence. Missing/stale baseline or current spell stays uncertainty. Full fortnight limits, consecutive duty days, weekly-rest compensation and all EU561 derogations are not added in this phase; no complete statutory-compliance guarantee is claimed.

## K. Restriction/compliance interaction

All movement candidates use `evaluateCompliance` on actual selected resources, dated traffic/break/rest passage and the accepted dataset. Mandatory APPLIES or evaluation error excludes the movement. Genuine UNKNOWN remains review-required. Empty movements have no loaded-job delivery-stop exemptions. Actual cargo/ADR comes from demand; old Job-level `vehicle.*` / `trailer.*` facts cannot override a newly selected physical vehicle.

Truck/trailer height and width use the recorded envelope. Coupled length remains UNKNOWN when the coupling overlap/overall length has not been recorded, even though routing may use a conservative component-length bound. Axle scope is explicit (`POWER_UNIT` / `COMBINATION`): recorded power-unit and trailer counts can be summed; unspecified legacy coupled scope is UNKNOWN, not an invented count. Generic routing presets never become known regulatory facts. No missing legal facts were added to the real J-4198 vehicle.

Existing clean solver is reused for hard or precautionary restrictions with at most two reroutes per strategy. Provider avoidance alone is never legal proof. Current dataset coverage remains partial; this adapter does not run area discovery for every fleet candidate.

5.6D remains intact: established base + unproven exemption → APPLIES; genuinely missing base → UNKNOWN; affirmative exemption → DOES_NOT_APPLY; exceptions are local to a restriction; saved history is not rewritten.

## L. Override semantics

Explicit constraints support forced truck/driver/trailer, excluded trucks and an immediate same-assignment predecessor. Invalid references/out-of-mutable-scope constraints are diagnosed. An infeasible override leaves demand unassigned, with structured reasons; it never silently chooses a different forced resource.

The minimal UI starts with automatic selection and hides selectors under `Impor recursos (override)`. After an unconstrained baseline, a constrained rerun exposes cost/empty-km/resource-time/jobs-served impact. With no comparable baseline it says so. The old route calculator remains available through an explicit manual action and no longer defaults to the first truck/driver or a demo-specific preferred vehicle.

## M. Persistence/history

Each run saves an immutable recommendation under its own metadata ID. Confirmation resolves a saved recommendation/selected alternative, checks current inventory/dataset/dated departure/calendar/resource overlap and explicit uncertainty acknowledgment, then replays every movement into `RouteComplianceRecord`.

All jobs, lifecycle events and the human confirmation receipt commit atomically. Job revisions and truck/driver/trailer update preconditions guard against another session's edits. No partial commit publishes state. Receipt stores engine recommendation separately from human selection, with routes/timing/facts/versions/economics/reasons and planning inputs. Job retains the current execution; old receipts remain immutable even after explicit manual unassignment/replanning. Legacy `routeCompliance` is the first loaded record for compatibility; operational review re-evaluates **all** loaded/empty records without fetching or mutating them.

Queue promotion preserves confirmed dated sequence and checks all shared resources, rather than selecting the nearest next job. Independent resource lines can advance independently. Existing executed lifecycle history is retained.

Browser proof: confirm first demand of the 20-job fixture, then plan the other 19 from future availability/position. The confirmed job's canonical hash remains identical; reload still shows the same receipt and hash. Recommendation-vs-confirmation is inspectable in the isolated receipt details. Executed/in-progress exclusions are proven by deterministic tests; no real execution was fabricated through the browser.

## N. Performance/pruning strategy

Naive search grows with job permutations × truck × driver × (trailer + none) × routes. The chosen beam bounds sequence branching; cheap tuple checks are roughly O(depth × beam × remaining jobs × trucks × drivers × trailers), with a similarly bounded optimistic remaining-coverage check. Only shortlisted feasible extensions request routing.

Defaults: beam 8, 16 extensions/state, 256 domain movement requests, up to four useful plan decisions. The real adapter caps **64 cold provider attempts** across the entire run, including solver reroutes, irrespective of domain branching. Raw exact cache uses departure, geometry, routing profile/cargo, avoidance and credential fingerprint; different driver legal state can reuse geometry but must reevaluate compliance/timeline. Dataset/physical/cargo/time changes cannot reuse an old legal decision. Domain memoization is exact and separate. Errors do not become geometry-less confirmable estimates.

Measured synthetic 20-job run: **67 distinct movement requests / 896 domain cache hits / 504 evaluated extensions / 116,220 cheap rejections / zero external provider calls**. Urgent-window run: 111 movement requests / 820 cache hits. Remaining-19 run measured 64 requests / 852 hits. These are counters of the explored beam, not a global search or external-call estimate. `truncated=true`, `globallyOptimal=false` are exposed, with shortlist/beam/budget reasons.

Adapter regression: exact repeated requests produce two cold FASTEST/NO_TOLLS attempts and subsequent cache hits; a later router instance sends zero new cold attempts. Changed departure/load produces six distinct attempts. A cap of three is enforced despite more domain requests; failed cache entries can retry. Tests also enforce the production waypoint-to-stop metadata contract, after a live-browser run exposed its mismatch. The host yields between states/extensions for responsive UI and cancellation; deterministic search/scoring does not depend on those yields.

## O. Tests and quality gates

Fresh baseline: 47 files / 1235 tests. Final: **49 files / 1281 tests passed**, including **46** new planning/adapter tests. Full final suite completed in 54.27 s. No existing legal/compliance assertions or fixtures were weakened for the optimizer.

Coverage includes A–K: unassigned jobs; capacity/missing trailer/availability/licences/weekly hours/physical legality; future-position choice and override impact; changed geography/windows/sequences; loaded-empty accounting; carried driving/break/rest/service; fresh-vs-rest and useful-rest choices; contextual dominance; five-crew twenty-job distribution; immutable confirmation/replanning/all-leg review; stale inputs/dataset/departure; atomic IndexedDB preconditions and queue promotion; cancellation/executed exclusions; all 5.6C/5.6D regression.

Two concurrent earlier full runs hit the existing 16 ms picker microbenchmark at 19.96 ms and 16.11 ms. No code or threshold of that old test was changed. Complete later runs passed (1280, then final 1281); the final invocation requested a single worker to avoid competing test load.

Typecheck, lint, production build and `git diff --check` passed after final functional changes. Build completed successfully with the existing large map/vendor chunk warning (map bundle approximately 1.2 MB before gzip); no new build failure was suppressed. Production selection/adapter/context-ranking searches for the named Job/location/driver/registration examples returned no matches outside fixtures/tests/DEV acceptance.

## P. Browser acceptance — actually exercised

`http://localhost:5173/__dev/operational-planning` uses the real domain/service/current included RI dataset, a clearly labelled synthetic provider, fixed future clock and separate persistent `fleetos-planning-acceptance` database. Fixture buttons modify only that test store, not the user's fleet/backlog.

| Required acceptance | Observed result |
| --- | --- |
| Open unassigned Amadora–Porto; plan without choosing resources | TESTE-01 + Motorista teste automatically selected; 1 decision |
| Inspect reasons and actual legal facts | Opened assignment and loaded-leg details; recorded 32,000 kg / 3 axles / first-axle height 1.4 m / actual dimensions; current restriction evaluation shown |
| Fresh driver avoids unnecessary daily rest | Fresh driver selected; zero rest; one useful decision |
| Useful long-rest plan survives | Regional two-job sequence chooses 11 h rest and serves both demands |
| Coordinated fleet and empty movement | 20 served; five crews; 8/5/3/2/2; 188.4 loaded / 24.1 empty km |
| Geography change changes sequence | J1-2 moves from second to last in crew 1; 36.1 empty km |
| Window change changes sequence | Fresh fixture pickup tightened to 08:10–08:25; J1-2 first; 20 served |
| Confirm, replan future, retain history | First job confirmed in isolated store; 19 remaining planned; same saved/current hash |
| Reload persistence | Receipt and unchanged confirmed-job hash survive reload |
| Desktop presentation | Inspected 1440×900 and 1920×1080; temporary override reset; no document/main horizontal overflow in the inspected 1440 view |
| Real Dispatch/provider integration | Opened existing J-4199 without manual selection and calculated actual provider geometry; observed 256.2 loaded / 258.0 empty km, 7.5 h driving and a documented 11 h rest recommendation. Unknown/undated inputs remained explicit; no user-job confirmation was performed by the audit |

The real-provider test exposed and fixed a waypoint metadata mismatch; invalid earlier provider attempts are not evidence of HTTP routes. The synthetic cases are not sold as actual road-route measurements. No browser claim is made for completed execution, a full statutory audit or all product pages.

Core-service hot updates temporarily triggered the existing React context error boundary (`useOperations must be used inside <OperationsProvider>`). A full reload recovered without data loss. Cold-loaded final acceptance flows were retested. This development hot-refresh behavior remains a limitation, not a claim of a production calculation crash.

## Q. Remaining limitations

- Bounded append-only heuristic, not globally optimal VRP. Urgency can outweigh cheap local prefixes; future-state value outside the supplied horizon is not priced. Constraints/equipment limit crew distribution in the acceptance fixture.
- Sequential full-demand transports; no consolidated LTL, split loads, pickup/delivery interleaving across jobs, empty trailer swaps or independent driver transfer routing. Known noncolocated crews are rejected; unknown colocation requires review.
- No real telemetry/tachograph ingestion. Explicit initial position/hour forecasts are supported; unrecorded positions/hours cannot be invented. In-progress or unreproducible commitments require an external forecast/review.
- Existing EU daily/break/weekly model is reused; full fortnight/weekly-rest compensation logic is not provided. Calendar midnight is not a reset.
- Restriction coverage is partial; no per-candidate discovery. Missing physical/legal base facts and unknown coupled lengths/scopes remain unknown. Axle scope is a new domain field; generic Fleet editing does not yet expose a dedicated scope selector.
- Traffic is a provider snapshot/cache, not a live continuously replanned guarantee. Windows without dates, absent service durations and unpriced toll sections remain review inputs.
- €18/hour is comparison policy, not measured utilization revenue. Unknown revenue/maintenance/salaries/fixed costs prevent a net-profit claim. Idle time before a scheduled execution is not monetized.
- Dispatch normal UI scopes the selected job; fleet horizon demonstration is available in DEV. Phase 5.7 will render fleet recommendations and constraints more simply; no major navigation/layout redesign was performed.
- Historical/atomic stores remain local to this browser; no multi-user server scheduler or external dispatch delivery is introduced. Production-wide optimum/scalability beyond measured bounded cases is not claimed.
- Development context hot refresh can require a reload while editing core service modules.

## R. No-hack confirmation

New production planning, adapter, automatic panel/wrapper and contextual route ranking contain no J-4198/J-4199, Amadora, Carla, Volvo registration or VCI-specific selection branches. Demo example IDs and geography exist only in explicit fixtures/DEV acceptance and tests. Existing seeded legal geography and 5.6D exception evidence are legal data, not optimizer hacks. No real resource axle count/first-axle height was fabricated and no user data was reset.

Search/budget/economic/materiality policies are explicit domain policy, not a fixed three-card or >10-hour UI filter. The old demo-specific preselection branch was removed. Recommendations/human confirmation/execution remain distinguishable, and no new Git commit/push was requested or performed in this phase.

Final quality-gate completion: full tests **49 files / 1281 tests**, typecheck, lint, production build, whitespace check, production no-hack search, measured provider/cache budgets and browser acceptance **PASS**. Final confirmation/replan/reload retained hash **9532458fe6130f7c** and receipt **f18e8925-28c7-4f43-b43b-a06e5a99503e** while planning the other 19 jobs. Screenshot evidence: `FleetOS-5.6E-historico.png` in this task's output directory. The stated limitations, including development hot refresh, are retained explicitly.

FLEETOS AUTONOMOUS OPERATIONAL PLANNING FOUNDATION: YES
