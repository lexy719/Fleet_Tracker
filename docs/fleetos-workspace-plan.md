# FleetOS living workspace — agreed plan

Saved at the user's request on 9 October 2026. This plan guides the existing default environment at `/__dev/fleetos-environment`.

## Objective and user preferences

Design the entire workspace as one connected, alive and dynamic operational environment. Every supported domain combination forms a coherent working composition with its own shared question, structure and actions. The original domain's page must not remain in charge with other information attached. Existing instruments are reusable materials, rather than fixed pages.

The opening Operação should center on today's journeys and the work needed to move them forward. The current operation view feels too large; the map needs substantially more prominence. The map should initially occupy approximately 70–80% of the usable working canvas, with compact journey controls. These are starting design proportions, not fixed dimensions for every task or viewport.

## 1. Opening Operação

Routes, readable destinations, stage and relevant operational problems form the map view. A compact journey strip explains what is moving, what begins next and where a decision is needed. Problems appear with the affected work; the large default alert list gives way to lighter contextual decisions. Selection emphasizes the affected journey and related records.

## 2. Three independent controls

- Object or scope: the whole day, a shipment, a person, equipment or a group.
- Participating domains: the operational relationships considered by the workspace.
- Task: execution, assignment, comparison, resolution, handover or review.

These jointly determine the composition. The first selected domain does not permanently dictate its structure.

## 3. Shared structures for all combinations

Use authored working structures and domain relationship contracts, rather than a unique hard-coded screen per subset or a universal grid with one cell per domain:

- Journey execution: stops, responsibilities, timing and passage conditions meet along a journey.
- Resource matching: people, equipment and shipment requirements meet around an assignment decision.
- Readiness and handover: required work, documents and unresolved conditions form a sequence toward departure or delivery.
- Comparison and planning: alternatives reveal their consequences for the same operation.
- Record review: recorded facts, issued documents and current circumstances are examined together.

Every participating domain must change the shared answer, representation or available action. Context labels and appended columns alone do not satisfy this objective. The principle applies across collections, jobs and entity anchors.

## 4. Interaction and history

- Selecting a journey emphasizes related people, equipment, stops and problems.
- Adding/removing a domain opens or restores the corresponding combined composition tab. The live canvas reorganizes around the shared task.
- Inspecting an object expands its working representation within the operation.
- Following an object changes the anchor while retaining participating domains and adapting their relationships.
- Comparing or editing previews the consequences before confirmation.
- Back/Esc restores the captured source composition: selection, draft, practical scroll and camera. Accepted operational facts remain shared.

Tabs identify the work and anchor. They should not become long concatenations of isolated domain names.

## 5. Morphing and continuity

Objects stay recognizable while moving, resizing or changing representation. Relationships become visible as they become relevant. Map geometry and camera framing change with the work, preserving mental landmarks and avoiding unnecessary camera movement. The renderer stays mounted. Reduced-motion mode expresses the same state changes without animation.

Motion communicates meaningful changes. The resting workspace remains calm and legible. Different compositions need different structures; do not make every task the same map-plus-information-panel layout.

## 6. Map prominence

Geography remains dominant in journey execution, routing and passage decisions. Planning shares only the space required for meaningful work. A document or comparison may temporarily receive more room, with an exact return to the earlier composition. Known routes, simulated/recorded positions and missing information remain distinguishable; unknown positions are not placed on the map.

## 7. Backend relationships and valid actions

Use application-owned relationships: assignments, stop sequence, capacity requirements, appointment windows, execution records and issued-document snapshots. These determine what the composition can claim and which actions are valid. Edits reveal affected work before confirmation; expected revisions and domain validation protect writes. Issued records remain immutable. Missing execution cannot produce an invented ETA or live legal margin.

The separate `?connected` experiment contains useful read/command boundaries but is not the target interface. Integrate backend capabilities into the authored environment incrementally. Do not replace the living workspace with that experiment's base table and appended context.

## Implementation sequence

1. Implement a map-dominant opening Operação with compact, useful journey controls.
2. Establish shared composition semantics before choosing a domain lead or rectangle, and connect collection composition changes to genuinely shared instruments.
3. Exercise a complete journey through combinations, object following, an edit, its consequences and exact returns. Extend shared representations across selected-job and entity paths without discarding existing instrument fidelity.
4. Connect those representations to application read models and service commands, preserving data provenance and valid-action boundaries.
5. Inventory supported sets and verify purpose, structure, participation, actions, motion and history. State-space coverage is distinct from native browser/visual acceptance.

## Acceptance questions

Does this composition answer a shared operational question? Does adding a domain change the work and its representation? Can the operator understand and act on the relationships? Does a meaningful edit expose its consequences across related work? Do objects, source frames and confirmed facts retain continuity? Is the map sufficiently prominent when the task is spatial?

Do not claim every combination is complete merely because it renders or contains every domain. Record the implementation boundary and browser evidence for each increment.

## Implementation progress — 10 October 2026

The opening Operação now gives its map approximately 75% of the working area at the reviewed desktop sizes, with compact journey controls and decisions derived from each transport's own records. The first shared composer resolves all 57 combinations of the six core domains at day level before allocating space. Journey execution, crew/equipment readiness and handover use distinct shared structures. Tabs identify the work and show the participating domains.

Browser evidence: all 57 day sets render their domain contributions; 220 enabled action controls were exercised with no dead clicks or browser errors. Native addition/removal and object-follow flows pass at 1199, 1440 and 1920 pixels, including persistent map/shared host, visible morphing, exact state/layout/camera/scroll returns, tab reuse and reduced motion. Six narrow-window scenes at 414/768 pixels render usable stacked instruments. A confirmed DEV repair removes its warning on return to Operação. The targeted environment/application/repository suite passed 193 tests, followed by 26 focused tests including the narrow layout change. Type checking, targeted lint and the production build pass (the pre-existing map bundle size warning remains).

This is evidence for the first increment, not completion of every object, facet or backend workflow. The default still uses the synthetic operational adapter and DEV edits. Detailed object paths still need the same shared semantics; backend integration remains a subsequent step. Browser artifacts are in `C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/shared-work-browser-report.json` and `shared-work-followup-report.json` beside its screenshots and review scripts.

## Second increment — Drivers and context-specific work, 10 October 2026

The user's clarification concerns the standalone Drivers collection and the mixed pages. Drivers now starts with eight people grouped by the decision needed, assigned work and absent assignment. Each row separates the person, today's journey and next decision. Comparing shifts opens the existing timeline explicitly. The individual Driver opens with one next decision, three readable facts and upcoming work; detailed shifts, qualifications, assignment and editors remain available.

Shared compositions now apply to the day, selected journeys and scoped entity anchors. The six core domains resolve into ten authored working forms: working units, load capacity, shifts and stages, physical passage checks, driver credentials, fuel range, route choice, departure, execution, and execution records. Their geography and working structures follow the task. Task-specific inspection links open the relevant instrument, including driver records for credentials and tank readings for range. Narrow windows retain that reading order and useful working space.

The selected record also changes the situation within those forms. A missing trailer or unavailable vehicle produces a replacement workspace with cargo requirements and a direct proposal entry. An expired required qualification brings the relevant record and driver decision forward. A changed delivery window sits beside the recorded shift and opens route comparison. Missing positions and measurements stay explicit. Confirming a DEV trailer replacement changes the source from recovery into a working-unit composition while preserving its map and host. Unloading follows the actual stop sequence, including partial unloading; wide north/south route strips frame the recorded corridor horizontally and expose a working compass.

Scope validation prevents unknown or unassigned objects from inheriting another journey. Selecting a journey retains the requested domains. Removing an anchor's domain retains its scope when a shared combination remains. Day returns, reused composition tabs and temporary inspections retain source frames and proposals. Confirmed DEV facts remain shared.

Validation for this increment:

- Pure checks cover all 57 core sets at day level and 399 set/anchor cases, including scope, missing records, domain ownership, geometry and confirmed facts. The targeted environment/application/repository suite passed 203 tests; 22 focused tests passed after the final reading-order change.
- Native browser checks verified all 57 exact selected-journey sets and their contributions. Ten forms were reviewed at day and selected scope on desktop, followed by 20 narrow scenes at 414/768 pixels. The standalone Drivers collection and person flows passed at 414, 768, 1199 and 1440 pixels, including comparison and qualification returns; the actual menu entry was also checked.
- Fourteen situation-specific scenes cover missing equipment, qualifications, changed windows, unknown execution and missing measurements. Replacement and measurement proposals, confirmation, shared facts and source returns passed. Nineteen task-specific inspection controls and five working actions passed exact returns. Final checks verified the changed-window action, visible capacity action and compass.
- Native morphing at 1199, 1440 and 1920 pixels recorded 15, 14 and 21 distinct working-surface positions with the map and host retained. Addition/removal returned exact state/layout, camera and a nonzero 40-pixel source scroll. Reduced-motion flows passed. Browser reports recorded no page errors. Type checking, targeted lint and build pass; the existing production map-bundle size warning remains.

Evidence is saved beside screenshots in `C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/`: `driver-and-shared-tasks-report.json`, `shared-real-contexts-report.json`, `shared-clearance-and-motion-report.json`, and `shared-final-navigation-report.json`. The latter records the final inspection links and narrow reading order.

The default still uses the synthetic adapter and DEV proposals. Production read/command binding, revision protection, actual eligibility and persistent operational records remain the next integration step. This evidence covers the six core domains and reviewed situations; it does not establish completion of every entity, facet, non-core domain or production workflow. The earlier progress section records the first increment and its historical validation boundary.

## Design research

The plan draws on context-sensitive information representations in [Bret Victor's Magic Ink](https://worrydream.com/MagicInk/) and continuous, visible, reversible action in [Shneiderman's direct-manipulation principles](https://www.cs.umd.edu/users/ben/about.html). [Pad++ research](https://www.cs.umd.edu/projects/hcil/pad%2B%2B/papers/jvlc-96-pad/zoom-4.html) illustrates multiple working representations of the same information. These sources inform continuity and context; they do not prescribe FleetOS's layouts or a zoom-based navigation system. Conventional trucking products inform operational constraints and data ownership, rather than defining the interaction architecture.

## Third increment — usefulness and action intent, 12 October 2026

The user requested an interactive audit of the printed variations. All 935 inventory groups and 1,789 finite states were loaded and their enabled variation/inspection controls exercised: 2,542 native clicks, zero browser errors/failures, and exact state/layout returns. Fifty-two clicks left the extracted working body unchanged; this identifies review candidates rather than proving 52 separate defects. The full audit and remaining backend work are saved in [fleetos-workspace-usability-audit.md](fleetos-workspace-usability-audit.md).

Shared work now offers valid joint working questions within its composition tab: its contextual default, execution, departure when documents participate, and readiness when people and vehicles participate. The whole domain set remains in charge in expanded map views. Normal and spatial questions retain the same map and shared host. Explicit instrument questions reveal their actual instrument, with a captured return to the shared task. Header spacing is tighter and selected-job identity remains in the anchor strip.

Day-level actions carry the requested job and facet/editor, including when the destination tab already exists. This fixes a real browser failure: opening a composition had cleared an editor request. Documentary differences, known versions/events, issuance review and execution with records now have distinct working structures. Restriction evidence traces scoped inputs to their sources; physical questions with no physical inputs explain their deciding criterion. Alternative geometry does not acquire invented distance or clearance. Maintenance separates recorded status and an unconfirmed forecast from observed release. Missing/not-held required qualifications are exposed alongside expiry, with cargo-sensitive ADR requirements.

The revised browser matrix passed 552 checks across all 57 mixed sets at day/J-4217 scopes in normal/spatial modes: 228 source states and 324 native question changes. Scope, participants, composition tab, map/shared host and exact state/layout returns passed. The final project type check and targeted lint pass; all 183 environment tests pass. Targeted native flows and screenshots are recorded separately in `interaction-review/acceptance-flows-after.json`; earlier failing workflow attempts remain in the other reports instead of being relabeled as passes.

This increment deepens the authored environment and its action semantics. The default still uses the synthetic adapter and DEV proposals. Production assignments, observed execution, complete immutable document history, workshop records and revision-protected commands must be bound through the application owners described in the audit. The earlier PDF is the historical inventory and has not been regenerated. Rendering every finite combination is not a claim that every operational situation is complete.

Final live acceptance: all 12 targeted workflows pass with zero page errors. Multiple instrument inspections return the captured joint-map camera and a nonzero 90-pixel working scroll. An animated question change retains the map/host and records five distinct working geometries. Visual review also exposed clipping within the narrow expanded passage region; its evidence now stacks according to the instrument's width and passes internal overflow checks at 1440, 1199 and 414 pixels. The frontend production build passes with the existing map-vendor size warning. The final motion and region-layout reports sit alongside the workflow report. The environment remains running at `http://127.0.0.1:5174/__dev/fleetos-environment`.
