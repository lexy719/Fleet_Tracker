# FleetOS environment: interaction and cinematic remap analysis

13 October 2026. Target: `/__dev/fleetos-environment`, default `GuidedEnvironment`.

## The intended outcome

The user's clarification is about behaviour: an alive environment that changes coherently as the operator opens navigation, follows an object, introduces content, inspects a relationship and acts on it. This is the seventh frontend attempt. A visual theme, new dashboard shell or another batch of animations is insufficient.

The recommendation is to rebuild the presentation around persistent operational objects and authored transformations. A truck, person, stage, restriction and document should visibly become the material of a new working situation. The interaction should explain what was selected, what changed, how the objects relate and what can happen next. Art direction should support those transformations.

## Evidence and coverage

The source inventory covers every TypeScript/TSX/CSS file under `src/dev/fleetos-environment`: 118 files, including 41 TSX rendering modules, 44 supporting TypeScript modules, 22 test modules and 11 stylesheets. An AST scan records 153 capitalized function declarations, including internal presentation helpers; this is not a claim that there are precisely 153 independently rendered React components. `EntityRegion`, for example, is a named function expression inside `memo` and is audited separately.

The accompanying [component audit](fleetos-environment-component-audit.md) covers all 41 rendering modules, their named presentation functions, all 11 stylesheet files and all 44 supporting modules. Machine-readable inventory, function ranges, imported modules, JSX text samples and action types are in `output/environment-audit/inventory.json`. This is a source/design audit, not a line-by-line correctness proof.

Native browser inspection covered the opening operation, a selected journey, incremental domain additions through all six core domains, shared schedule, detailed driver hours, crew/equipment readiness, vehicle load instrument, shared execution, restriction logic, document handover and dossier, route management and layered journey. Inspections were performed at the actual 1101 × 884 viewport. This turn did not repeat the historical 1,789-state audit or establish acceptance at every viewport. Source coverage and browser coverage are deliberately separate.

The previous preparation turn established that 183 environment tests and the project type check pass. Those checks establish a technical baseline; they do not establish visual quality. This analysis changes documentation and audit artifacts only.

## What makes the current environment feel flat

### 1. The outer region has continuity; many of its contents do not

`LivingScene` retains region hosts, previous geometry and scroll. `sceneIdentity` gives drivers, vehicles and other instruments recognizable keys. This is useful infrastructure.

However, `SharedWorkInstrument` switches between separately rendered `Schedule`, `Matching`, `Handover`, `Journey`, `Clearance`, `Capacity`, `Range`, `Credentials`, `RouteChoice` and `ExecutionRecords` bodies. Keeping the `shared-work:job:*` host alive does not keep each person, truck, stage or document inside it alive across those bodies. A text link in a shared task can become a completely different instrument inside another region. There is no common transform contract for that inner object.

**Consequence:** a morphing container can still feel like a page replacement. The clicked truck should become the large truck drawing; its cargo should become the load instrument; its relationship with the driver should survive the transformation.

### 2. One broad duration moves different kinds of changes alike

`MORPH_DURATION` is 680 ms. Surface CSS transitions animate `left`, `top`, `width`, `height`, opacity and clipping. Camera choreography continuously refits against the moving map container. That is already real motion, not a missing animation library.

The browser-exposed measurement for one restriction inspection recorded a nominal 680 ms, settling at 733 ms, 14 samples, 10 geometry changes and 8 map resizes, with map instance `2`. This is evidence that a transition happened; it is not an FPS benchmark or proof that every transition is smooth.

**Consequence:** the interface needs different transition meanings—reveal, follow, combine, inspect, propose, confirm and return—with origin, continuity and ordering. Making the same large rectangle travel faster will not resolve the design issue.

### 3. Navigation asks users to infer too much

The rail uses icon buttons plus tiny companion +/− buttons. In `Rail`, an inactive domain's icon and its + button both dispatch `content`; an active non-main domain can be removed by either. The main domain's icon opens its collection. In a shared composition, there is no main domain. Thus visually similar clicks have context-dependent meanings.

Native measurement found companion buttons at 14 × 14 px. The sampled tabs were 23 px high and close buttons 20 px wide. These are concrete usability review candidates. Small dimensions alone are not a complete WCAG failure determination, because spacing and exceptions must also be assessed. [W3C's target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) explains the 24 × 24 CSS-pixel minimum and its exceptions.

**Remap:** keep the compact resting rail, but let an explicit navigation reveal unfold a readable, temporary domain/work layer from it. Separate “open collection” from “add to this work” with visible verbs. Preview the resulting working question before committing a composition change. Mouse, keyboard and touch must all access the same choices.

### 4. Geography is large without always explaining the work

At the inspected viewport, Operação places a very large map over a shallow horizontally scrolling journey ribbon. The map shows much of Iberia and a large ocean area, while the decision content has limited reading height. The selected-job overview repeats that hierarchy with a large map and a long lower narrative. Other compositions invert it: a long reading surface and a corridor map beneath it.

Map prominence is appropriate for spatial work, but area alone does not create an environment. A journey's next stop, driver limit, unresolved passage and selected object should have a clear correspondence with the displayed geography. Hover emphasis already exists and should be extended into keyboard focus, selection and transitions.

**Remap:** geography becomes a task-aware stage. Fleet view establishes the operation; selecting a journey frames its corridor; inspecting a restriction focuses its real segment; opening a document quiets the geography while preserving return context. Keep TomTom/MapLibre and recorded geometry. Camera movement must remain tied to a spatial question.

### 5. The instruments are valuable but their hierarchy is often uniform

The driver timeline, truck elevation, cargo plan, layered journey, causal restriction chain and CMR snapshot are the strongest assets. They represent actual operational relationships. Replacing them with generic cards would throw away the project's distinctive work.

Yet many decisions compete with metadata, provenance, repeated headings, participant lists, facet controls, inspection links and secondary paragraphs. Numerous stylesheet declarations use 9–12.5 px text. In the observed restriction view the decisive missing input was distributed among the headline, fact list, conditions, exception, conclusion and support column.

**Remap:** make one dominant object/relationship and one next decision readable first. Put context on the diagram or stage it explains. Keep provenance legible, and reveal detailed evidence within the existing object instead of expanding another long reading page by default.

### 6. The presentation stack is layered across several design generations

The 11 stylesheets contain 310,581 source bytes and 83 `!important` declarations in the static inventory. These are source-file totals, not production bundle sizes. `GuidedEnvironment` directly imports eight environment stylesheets. Older rendering modules and the separate connected/world experiments remain alongside the current interface.

`GuidedEnvironment` is 1,307 lines; `SharedWork` is 1,698 lines. Both combine multiple responsibilities. Styles for the same instrument are spread across base, fidelity, living, entity, morph and shared-work layers. This makes a broad CSS restyle fragile. Although the default imports eight stylesheets directly, `index.tsx` eagerly imports both optional experiments: their CSS also loads. The native DOM inspection confirmed all eleven environment stylesheets present in the default session. Isolating optional entry imports is therefore a concrete cleanup opportunity, subject to checking any inherited style dependency.

**Remap:** consolidate styles by object and scene responsibility as each flow migrates. Introduce one motion coordinator and object presentation contracts instead of adding another global override stylesheet. Preserve historical experiments, but establish a clear active path.

### 7. Some explanations disagree within the same scene

The inspected VCI workspace says “Todas as outras condições estão confirmadas” beneath a headline focused on the axle height. Its rule/exemption chain and conclusion show two missing facts: axle height and authorization. The vehicle support says “único facto em falta”. These strings come from `world.ts:1174` and `fx/Supports.tsx:93`; the main instrument renders `answerDetail` at `fx/RestrictionInstrument.tsx:188`.

This is not evidence that the underlying applicability calculation is wrong. It is evidence that separate summaries can disagree and weaken confidence. The remap must derive the headline, causal stage and decision from one scoped explanation model. Cinematic emphasis would make contradictory copy more prominent.

## Reference research: what transfers to FleetOS

These are references for interaction and representation, not product templates. Studio case-study claims are attributed to their authors; they are not independent performance measurements.

| Reference | Verified characteristic | Application to FleetOS |
| --- | --- | --- |
| [Immersive Garden: Chartogne-Taillet](https://immersive-g.com/projects/chartogne-taillet-1/) | The studio describes interactive maps, vineyard animation and hover-based exploration. | Make location and object discovery change the environment locally. Use layered geographic emphasis and meaningful material transitions. |
| [Immersive Garden: Orano](https://immersive-g.com/projects/orano/) | Its industrial tools are represented through stylized wireframes and interactive exploration. | Deepen the existing vehicle drawing into a precise, manipulable instrument. Stylization can communicate machinery without requiring photoreal assets. |
| [Immersive Garden: Masar](https://immersive-g.com/projects/masar-destination/) | The case study describes a WebGL urban model and switchable day/night views. | A scene can change presentation coherently while remaining the same place. FleetOS's changes should follow work context rather than ornamental time-of-day effects. |
| [Immersive Garden: Aten7](https://immersive-g.com/projects/aten7/) | An immersive digital-world case study. | Reference for coherent visual worldbuilding; evaluate its interaction cost before borrowing a mechanism. |
| [Bruno Simon](https://bruno-simon.com/) | The portfolio is explored by driving through a 3D world, with interaction, map, quality and recovery controls. | Learn from persistent world/object identity and recovery. Fleet operations still need direct selection and efficient work access. |
| [Microsoft: connected animation](https://learn.microsoft.com/en-us/windows/apps/develop/motion/connected-animation) | Connected animation maintains context between views and differentiates forward/backward navigation. | The selected object should visibly connect its origin to its new representation, with an authored return path. |
| [Google Earth Studio: camera target](https://earth.google.com/studio/docs/advanced-features/camera-target/) | A camera can maintain an explicit target while its position changes. | Bind map movement to the selected corridor, segment or object; preserve orientation and landmarks. This is a camera reference, not a proposal to change providers. |
| [Apple: Design great visionOS apps](https://developer.apple.com/videos/play/wwdc2024/10086/) | The guidance relates immersion to depth, scale, cohesive grouping and meaningful interaction; it also warns against arbitrarily floating UI. | Use depth and scale to express work relationships. Keep navigation, controls and evidence attached to their objects. This is an adaptation to a desktop screen, not a claim that headset conventions directly apply. |

Active Theory and Resn were also searched through their official sites. The native Active Theory inspection reached its animated loading view, not a verified complete navigation flow. The Chartogne-Taillet live site opened behind an age-certification gate; no certification was submitted. Its studio case study was readable and visually inspected. These limits prevent overclaiming live reference coverage.

## The new interaction grammar

Treat each action as an authored transformation with six answers: origin object, retained objects, changing representation, spatial target, resulting work and return frame.

| Action | Visible behaviour | State rule |
| --- | --- | --- |
| Reveal navigation | A readable domain/work layer unfolds from the resting rail; the current scene yields space and remains identifiable. | Navigation preview is temporary and does not mutate operational facts or silently create a composition. |
| Open collection | The scope widens; the focused object rejoins its collection through a visible identity path. | The source tab retains its frame. |
| Follow object | The clicked object becomes the focus; its label and graphic move together while related objects remain context. | Preserve participants, object scope, camera and exact return. |
| Add domain | Existing objects acquire a new shared arrangement; the additional information changes the operational relationship. | Create/reuse the combined tab and retain every participating domain. |
| Inspect facet | The relevant portion of an object unfolds—for example tank, axle, cargo or issued field. | Retain the shared work and return frame. |
| Propose edit | The changed part and its consequences are previewed together in the scene. | Preview only; accepted facts remain unchanged. |
| Confirm | A finite visual event propagates through affected objects; settled values become the new accepted state. | Confirmation applies the existing DEV command semantics; immutable issued snapshots remain fixed. |
| Return | Reverse the relationship transformation using the captured source frame. | Restore selection, draft, practical scroll, camera and composition; keep confirmed facts. |

The resting state must feel rich through legible objects, connected spatial structure and responsive focus. Continuous pulses, fake moving vehicles or shifting backgrounds are not substitutes for these relationships. Recorded positions and the fixed demonstration clock must remain identifiable as such.

## Concrete first sequence

Implement and review this sequence before extending the remap to every surface:

1. **Operation → reveal navigation.** The rail expands into labeled work choices within the scene. Current journeys stay visible. Focused choices preview their operational question; dismissal restores the exact scene.
2. **Select J-4217.** The selected journey representation becomes its corridor/stage structure. Other journeys recede coherently. The next decision stays visible without first scrolling through metadata.
3. **Follow AA-42-ZP.** Its existing vehicle identity grows into the technical elevation; the selected job remains context. Cargo stays attached to the same trailer.
4. **Add Driver.** The driver and vehicle form a working unit. Driver time and cargo demands align with the next stage; they do not become two unrelated pages placed together.
5. **Add Restrictions.** The relevant passage condition connects the actual segment, axle input and driver/arrival context. Missing authorization and height are both represented by the same explanation model.
6. **Inspect/preview a measurement.** The axle detail unfolds from the truck. The proposed value visibly changes the condition and consequences, while retaining uncertainty about the authorization. Cancel reverses the preview.
7. **Return.** The exact prior composition, camera, working scroll and selections return. Repeated or rapid input retargets the transition rather than queuing stale animations.

This sequence exercises menu, selection, following, combined work, inspection, preview and return. Its acceptance depends on native interaction and visual review, not merely on whether the states render.

## Implementation architecture

Preserve the current application-owned boundaries, shared task semantics, saved frames, data provenance and mounted map. Redesign visual representations and interaction choreography inside the authored environment.

- **Object presenters:** stable identity for person, tractor, trailer, cargo group, route stage, restriction and document. Each can expose compact, joint, detailed and spatial representations while retaining its semantic identity. Inner objects need continuity, not just region hosts.
- **Scene composition:** the entire participating set and actual record situation choose a working structure before allocating space. Reuse the existing ten task forms; redesign their representations and relationships. Avoid random layout generation or one handcrafted page per subset.
- **Transition coordinator:** capture current visual state, resolve the relationship transformation, coordinate object movement/camera/evidence and settle to an interactive target. Cancel obsolete work on new input. Use reverse contracts for captured returns. Draft timing ranges are 120–180 ms for local feedback, 180–280 ms for navigation reveal, 350–550 ms for object follow and 450–700 ms for complex composition. These are prototype starting points, not verified performance results.
- **Map stage:** retain the renderer. Change overlays, framing and emphasis in sync with scene transitions. Use route-line animation only to reveal recorded geometry, with an explicit distinction from observed vehicle movement.
- **Navigation layer:** separate collection navigation, participation and inspection. Keep a small resting rail; let a temporary reveal expose labels and resulting questions. Preserve accessible direct navigation.
- **Evidence/edit layer:** derive all summaries from the same scoped facts. Attach evidence and editors to their deciding object. Keep proposal/cancel/confirm boundaries visible.
- **Style ownership:** consolidate by scene/object. Establish a usable reading scale, finite elevation/material rules, semantic selection/status channels and container-responsive instrument layouts. Do not append a ninth active override layer.

Library choice is secondary. [GSAP Flip](https://gsap.com/docs/v3/Plugins/Flip/) provides layout-state animation and timelines; it is a candidate for object transformations, not a requirement to replace the existing camera code. [View Transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) animate snapshots between views and may fit isolated document transitions, but should be tested carefully against the project's mounted-map and live-object requirements. [MapLibre's line animation example](https://maplibre.org/maplibre-gl-js/docs/examples/animate-a-line/) establishes a provider-native option for recorded route reveals. No new dependency has been installed.

## Acceptance and rollout

First validate the sequence above at desktop, narrow desktop and mobile widths. Then migrate other representations by family: journey/execution, working unit/capacity, physical passage, credentials, range, departure and documentary evidence.

For each increment check:

- The origin and resulting object are recognizable through the transition.
- Introducing a domain changes the shared work, representation or valid action.
- Navigation exposes clear verbs and useful labels; touch/keyboard do not depend on hover.
- Immediate repeated input, a reverse action mid-transition and resize do not leave stale overlays or stranded focus.
- The map instance persists, with finite meaningful camera changes and no post-settle correction.
- Exact return includes nonzero source scroll, camera, selections and drafts; confirmed DEV facts stay shared.
- Reduced motion retains the same information and decisions with spatial travel suppressed. See [MDN's reduced-motion guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion).
- Unknown/missing/stale/simulated information remains distinguishable, and the next action agrees with the deciding facts.
- Runtime measurements include frame cadence and long frames, not merely animation duration or geometry-change count. No performance threshold is claimed met by this audit.

After the first sequence succeeds, extend the matrix across collections, selected jobs and entity anchors. Keep finite state coverage separate from visual acceptance and production workflow completeness. Bind production reads/commands later through existing owners; the separate `?connected` interface is not the replacement design.

The next implementation should therefore start with the menu and one continuous object journey, then reuse that transformation grammar across the full environment. The remap is behavioural and representational before it is decorative.
