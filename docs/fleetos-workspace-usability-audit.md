# FleetOS living workspace: interaction and usefulness audit

11–12 October 2026. This audit follows the user's request to navigate the printed variations, click their variation controls, and identify pages that are shallow or do not make operational sense. The target remains the small-rail authored environment at `/__dev/fleetos-environment`.

## Finding

The navigation machinery is further developed than the work it exposes. Many representations preserve context and return correctly, but a successful transition can still open a summary instead of the question the operator intended to resolve. Adding another domain is useful only when its records change the decision, evidence, sequence or available action.

The next design standard is therefore a complete working relationship: **situation → question → evidence → decision → preview → accepted consequence → return**. Motion communicates that relationship. A new arrangement of the same summaries does not establish a new useful composition.

## What was exercised

| Review | Actual boundary and evidence |
| --- | --- |
| Printed inventory | All 935 groups, covering 1,789 finite initial states from the existing capture inventory. These include core domain sets, day and six journey scopes, six entity anchors, map modes, authored facets, absent context, situations, edits, proposals, inspections, narrow layouts and DEV placeholders. |
| Baseline interaction audit | 2,542 enabled native variation and instrument-inspection clicks. Every recorded click changed state. All returned exactly to the captured state and layout. No page errors or interaction failures were recorded. |
| Working-content comparison | 52 clicks left the extracted working body unchanged. The extraction excludes navigation, title and provenance text. This is a review signal, not 52 independently proven defects: some controls only select the default question explicitly. Documentary issuance and spatial document variations account for most of these results. |
| Revised shared-question matrix | All 57 mixed core sets at day and J-4217 scopes, each in normal and spatial mode: 228 source states and 324 native question changes, giving 552 successful matrix checks. The selected domains and anchor remain intact; the composition tab, mounted map and shared working host remain continuous; Esc restores state and layout. |
| Targeted native workflows | Rail entry, composition tabs, six scoped jobs, assignment and documentary intent, direct measurement and confirmation, instrument return, documentary questions, causal fact following, maintenance, and desktop/narrow layouts. The final browser report records the result of each workflow separately. |

The baseline loads the saved DEV scene before clicking its actual controls. It does not claim to enter every scene through the sidebar, test every arbitrary edit sequence, enumerate every possible dataset, or prove production readiness. Separate native flows test real entry and action paths. Baseline exact-return counts cover state/layout; camera and practical scroll are checked explicitly in the targeted return flow.

## Problems and implemented corrections

| Area | Problem found | Implemented behavior |
| --- | --- | --- |
| Mixed working questions | The domain set selected one default task. An operator could inspect a domain but could not intentionally re-form the joint work around another task. | A composition offers the valid joint questions for its entire set: its contextual default, execution, departure when documents participate, and readiness when both people and vehicles participate. These select different working structures within the same composition tab. |
| Expanded mixed maps | Expanding the map could fall back to the older lead-domain summaries with appended supports. | Mixed spatial views retain the shared instrument and question. Readiness/capacity/scheduling/route comparison use a working strip; other tasks use an appropriate working side. The map remains one mounted renderer. |
| Intent from the day | Assignment, documentary and measurement controls could only open a journey. A requested editor could also be cleared when the destination tab opened. | A scoped action carries both the actual journey and its requested facet or editor. A direct action also applies its intent when that composition tab already exists. |
| Inspection return | After several facets, the operator had no clear way to resume the shared task. | Participating instruments identify their shared work and expose an explicit return to its captured source. Accepted facts and proposals retain the existing history rules. |
| Documentary differences | Differences reused the document paper layout rather than supporting a decision about each changed field. | A field register places issued values beside current values, brings changes first, identifies the source to review, and offers an issuance/reissue preview only where appropriate. Missing issuance remains distinct from an issued snapshot. |
| Documentary history | History reused much of the dossier layout. | The history has a version register and an event trace, with actions to inspect the actual known version or follow the work that changed. Available demo events are explicitly bounded; they are not presented as a complete production history. |
| Execution with records | This combination reordered the ordinary journey summary. | A stage register associates each stop/window with recorded completion or forecast, cargo where requested, passage conditions, and documentary evidence. Signed delivery evidence that has not been recorded stays missing. Responsibility and equipment participate where requested. |
| Restriction evidence | Evidence primarily listed citations without tracing the inputs of the actual job and vehicle. | Rule provenance and the scoped fact trace are separate but connected. Missing facts lead to their measurement/authorization action; known facts lead to their source. Causal facts without a navigable owner can open an explanation instead of doing nothing. |
| Physical/alternative restrictions | A physical question with no physical inputs could be empty; the alternative displayed an invented added distance. | Nonphysical rules explain their deciding criterion and lead to its interpretation. Recorded alternative geometry does not acquire an invented whole-route distance, time or clearance. |
| Maintenance | Healthy vehicles could inherit a workshop-entry/release narrative; release timing could be stated as available. | The vehicle's recorded availability and service note determine the view. An existing forecast in a workshop note remains a forecast, with release unconfirmed. The assigned work and reassignment decision are visible; no new release time is fabricated. |
| Qualifications | Several crew/readiness summaries only treated expiry as a problem, allowing a missing required record to look valid. | Missing and not-held required qualifications are also exposed. ADR is considered only when the scoped cargo requires it. Record validity is not described as permission for the entire journey. |
| Reading space | Selected jobs repeated their identity below the persistent anchor, and question/inspection navigation consumed too much room. | Selected-job identity stays in the anchor strip. Shared navigation has smaller spacing so the first working evidence and decision appear sooner. |

Existing single-domain instruments remain reusable material. Detailed inspection is allowed to reveal their authored instrument; this does not justify making every mixed task the former driver's or vehicle's page with more content attached.

## What each mixed working form must accomplish

| Form | Operational question and evidence | Required next decision |
| --- | --- | --- |
| Readiness of the unit | Assigned person and equipment confronted with actual job requirements, qualifications, availability, journey and documentary inputs. | Resolve the specific unavailable/missing resource or record; retain the job when inspecting its source. |
| Capacity | Cargo and its actual unloading sequence against assigned trailer capacity. | Choose/review the necessary equipment; do not infer capacity from a missing trailer. |
| Shift and stages | Recorded driving baseline, stops, windows and pauses. | Review a changed window or missing execution input before presenting a feasible schedule. |
| Physical passage | Vehicle measurements against each scoped rule, including exemptions and unknown facts. | Capture the missing measurement or inspect the criterion that decides the passage. |
| Credentials | The person's records confronted with the cargo's requirements. | Inspect the required record or review the assignment. Time availability remains a separate question. |
| Range | Recorded fuel, calculated/unknown range and the next journey opportunity. | Review the reading or relevant stop; preserve the difference between a reading and an estimate. |
| Route choice | Recorded corridors and their operational consequences. | Inspect or propose a valid alternative without inventing missing duration, distance or eligibility. |
| Departure/handover | Equipment, people, route conditions and required records form a sequence of prerequisites. | Resolve the specific prerequisite; issued documents remain evidence, not editable current fields. |
| Execution | The next actual stage links responsibility, work, timing and relevant passage conditions. | Open the stage or its unresolved input with the requested context intact. |
| Execution records | The stop sequence and operational record meet documentary evidence and discrepancies. | Review the difference or missing evidence at the relevant stage. |

These forms are a useful basis, not a claim that every situation now has enough operational depth. The records must continue to select the situation and valid action inside each form. No domain should participate only as a name in the heading.

## Backend work that remains

The default authored environment still uses the synthetic adapter and DEV proposals. The separate `?connected` experiment is not a replacement for it.

The application already owns the useful boundaries: `src/application/operationalQueries.ts` distinguishes current, unavailable and stale assignments/execution inputs; `src/application/operations.ts` serializes domain-validated writes and atomically persists records with events; issued-document behavior is owned by the document domain. The existing execution timeline is a replay of accepted planning inputs, not a stream of observed vehicle arrivals.

The next implementation should bind these boundaries to the existing authored workspaces in this order:

1. **Assignments and readiness:** supply actual assignment/resource revisions and eligibility; bind comparison and confirmation to service commands. A failed or stale write must leave the published composition and source facts intact.
2. **Execution and routes:** distinguish accepted plans, observed arrivals/departures, forecasts and absent telemetry. Do not turn an unrecorded position into an invented live ETA or legal margin.
3. **Documentary work:** bind actual immutable issued versions, their source revision, subsequent differences, void/reissue events and delivery evidence. The lab's known versions/events are insufficient for a production audit trail.
4. **Workshop work:** bind work-order state, observed release and the affected assignments. Free-text forecasts cannot establish future availability.
5. **Unassigned entities:** give people, vehicles and trailers useful work based on their own records even without a journey. Missing transport context must never borrow another job.
6. **Scenario acceptance:** exercise complete chains—late delivery, unavailable vehicle, missing required qualification, document divergence, unknown passage measurement—with actual saved records, preview, concurrency rejection, confirmation and exact return.

The acceptance criterion is an operator resolving one concrete piece of work with visible consequences across its relationships. Exhaustive rendering of a domain-set matrix is evidence of coverage, not evidence of useful management software.

## Saved evidence

Artifact folder:
`C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/interaction-review/`

- `audit-before.json`: complete baseline inventory/click results and boundary.
- `acceptance-after.json`: 552 shared-question matrix checks; its earlier workflow attempts retain their failures rather than being rewritten as passes.
- `acceptance-flows-after.json`: final workflow results, including camera/scroll checks and screenshots.
- `screens/`: revised working forms, documents, evidence, maintenance and narrow layouts.
- `before-live-apply/`: the touched lab files before this increment was applied.

Validation status is also recorded in the third increment of the saved workspace plan. The historical printed PDF remains the pre-audit inventory; it has not been regenerated to pretend these changes were already present in it.

Final live validation on 12 October: all 12 targeted native workflows pass with no page errors, including camera restoration and a captured 90-pixel working scroll after multiple inspections. The animated question transition retains the map/host and records five distinct working geometries across 62 sampled frames. Final visual review found clipping inside the narrow expanded passage region; a container-width correction now stacks its physical evidence and passes region overflow checks at 1440, 1199 and 414 pixels. Its three captures are in `acceptance-region-layout-after.json`; motion is in `acceptance-motion-after.json`. The main project passes frontend type checking, targeted lint, all 183 environment tests, and the frontend production build. The build retains the existing large map-vendor chunk warning. The live environment is served on port 5174.
