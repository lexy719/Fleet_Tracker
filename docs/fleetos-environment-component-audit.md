# FleetOS environment: component-by-component audit

13 October 2026. Read with [the remap analysis](fleetos-environment-remap-analysis.md).

Scope: exhaustive rendering-module inventory and source/design dispositions, plus all supporting modules and stylesheets. Browser evidence is representative, not an exercise of every listed function or state. Line links identify the audited source at this working-tree state. Historical modules are inventoried so they are not mistaken for the active interface.

## AbstractSurface.tsx

Historical shell. Generic movable surface; retain for historical review, not the new interaction model.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| AbstractSurface | [L5](../src/dev/fleetos-environment/AbstractSurface.tsx#L5)–82 | Generic movable surface; retain for historical review, not the new interaction model. |

## backend/ConnectedEnvironment.tsx

Opt-in connected experiment. Production read/command boundaries are useful; its table/detail arrangement is not the target authored interface. Isolate its eager entry/style loading.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| ConnectedEnvironment | [L115](../src/dev/fleetos-environment/backend/ConnectedEnvironment.tsx#L115)–153 | Production read/command boundaries are useful; its table/detail arrangement is not the target authored interface. Isolate its eager entry/style loading. |
| Workspace | [L155](../src/dev/fleetos-environment/backend/ConnectedEnvironment.tsx#L155)–894 | Production read/command boundaries are useful; its table/detail arrangement is not the target authored interface. Isolate its eager entry/style loading. |
| DriverRead | [L896](../src/dev/fleetos-environment/backend/ConnectedEnvironment.tsx#L896)–948 | Production read/command boundaries are useful; its table/detail arrangement is not the target authored interface. Isolate its eager entry/style loading. |
| TruckRead | [L949](../src/dev/fleetos-environment/backend/ConnectedEnvironment.tsx#L949)–985 | Production read/command boundaries are useful; its table/detail arrangement is not the target authored interface. Isolate its eager entry/style loading. |
| DomainRead | [L986](../src/dev/fleetos-environment/backend/ConnectedEnvironment.tsx#L986)–1168 | Production read/command boundaries are useful; its table/detail arrangement is not the target authored interface. Isolate its eager entry/style loading. |
| JobWork | [L1170](../src/dev/fleetos-environment/backend/ConnectedEnvironment.tsx#L1170)–1447 | Production read/command boundaries are useful; its table/detail arrangement is not the target authored interface. Isolate its eager entry/style loading. |

## CompositionExplorer.tsx

Earlier DEV tool. Numeric layout/easing exploration is not operator navigation; keep outside the primary scene.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| CompositionExplorer | [L11](../src/dev/fleetos-environment/CompositionExplorer.tsx#L11)–146 | Numeric layout/easing exploration is not operator navigation; keep outside the primary scene. |

## ControlRail.tsx

Historical rail. Generic domain controls belong to an earlier lab. Do not redesign this instead of the active fx/Chrome rail.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| ControlRail | [L21](../src/dev/fleetos-environment/ControlRail.tsx#L21)–80 | Generic domain controls belong to an earlier lab. Do not redesign this instead of the active fx/Chrome rail. |

## DomainGrammar.tsx

Earlier grammar surfaces. Synthetic generic timelines/cards/relations are historical materials. Their universal grammar is not proof of a coherent operational composition.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| Timeline | [L21](../src/dev/fleetos-environment/DomainGrammar.tsx#L21)–48 | Synthetic generic timelines/cards/relations are historical materials. Their universal grammar is not proof of a coherent operational composition. |
| SelectedWorkspace | [L49](../src/dev/fleetos-environment/DomainGrammar.tsx#L49)–181 | Synthetic generic timelines/cards/relations are historical materials. Their universal grammar is not proof of a coherent operational composition. |
| DomainGrammar | [L182](../src/dev/fleetos-environment/DomainGrammar.tsx#L182)–430 | Synthetic generic timelines/cards/relations are historical materials. Their universal grammar is not proof of a coherent operational composition. |
| RelationGrammar | [L431](../src/dev/fleetos-environment/DomainGrammar.tsx#L431)–534 | Synthetic generic timelines/cards/relations are historical materials. Their universal grammar is not proof of a coherent operational composition. |

## DomainSurface.tsx

Historical surface. Generic shell and focus controls; preserve history, avoid restoring one box per domain.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| DomainSurface | [L11](../src/dev/fleetos-environment/DomainSurface.tsx#L11)–168 | Generic shell and focus controls; preserve history, avoid restoring one box per domain. |

## EnvironmentMap.tsx

Active shared renderer. Keep mounted MapLibre instance, recorded geometry and attribution. Redesign operational overlays/framing; coordinate camera and object transforms. Review per-frame resizing cost with real performance measurements.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| EnvironmentMap | [L43](../src/dev/fleetos-environment/EnvironmentMap.tsx#L43)–903 | Keep mounted MapLibre instance, recorded geometry and attribution. Redesign operational overlays/framing; coordinate camera and object transforms. Review per-frame resizing cost with real performance measurements. |

## FocusControls.tsx

Historical controls. Earlier focus-level controls are not the current follow/inspect/return architecture.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| FocusControls | [L4](../src/dev/fleetos-environment/FocusControls.tsx#L4)–53 | Earlier focus-level controls are not the current follow/inspect/return architecture. |

## fx/Attention.tsx

Active opening and collection. At 1101 × 884 the opening uses a shallow scrolling journey ribbon. Bind each journey and decision to geography, prioritise actionable work and preserve recognizable selection origins.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| AttentionBase | [L11](../src/dev/fleetos-environment/fx/Attention.tsx#L11)–82 | Journey decisions should visibly originate from their map/stage objects; enlarge useful reading space. |
| JobsCollection | [L84](../src/dev/fleetos-environment/fx/Attention.tsx#L84)–190 | Preserve comparable operational columns; selected row must become the detailed journey through continuity. |

## fx/Chrome.tsx

Active chrome. Separate navigation, participation and inspection. Preserve compact resting chrome, readable temporary navigation reveal, stable work identity and exact returns.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| AnchorStrip | [L69](../src/dev/fleetos-environment/fx/Chrome.tsx#L69)–271 | Keep anchor once; reduce competing status/meta and preserve meaningful selected identity. |
| Rail | [L300](../src/dev/fleetos-environment/fx/Chrome.tsx#L300)–453 | Icon and +/− currently duplicate content changes; distinguish collection/open/add/remove with visible verbs. |
| DevDrawer | [L456](../src/dev/fleetos-environment/fx/Chrome.tsx#L456)–528 | Keep diagnostics secluded; its 5.7I label no longer describes the latest increment. |
| PendingBar | [L535](../src/dev/fleetos-environment/fx/Chrome.tsx#L535)–624 | Connect preview consequences to affected objects; keep cancel and confirm unambiguous. |
| MapCaption | [L627](../src/dev/fleetos-environment/fx/Chrome.tsx#L627)–722 | Replace vague Mudar with current spatial intent; compact tools should not obscure the selected object. |

## fx/Collections.tsx

Active collections. Rows contain useful per-record work. Differentiate persons, machines, journeys and evidence through recognizable objects rather than repeated text summaries.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| OpContext | [L163](../src/dev/fleetos-environment/fx/Collections.tsx#L163)–184 | Transform domain context into relationship-specific annotations rather than extra prose columns. |
| DriverScheduleGrid | [L283](../src/dev/fleetos-environment/fx/Collections.tsx#L283)–396 | Keep common time scale and absence of recorded duty; support direct readable shift comparison. |
| DriversRoster | [L400](../src/dev/fleetos-environment/fx/Collections.tsx#L400)–541 | Keep people/next-decision hierarchy; follow should retain person identity into the timeline. |
| FleetRoster | [L545](../src/dev/fleetos-environment/fx/Collections.tsx#L545)–642 | Vehicle drawings are stronger than generic resource cards; preserve vehicle identity across selection. |
| DocumentRegister | [L646](../src/dev/fleetos-environment/fx/Collections.tsx#L646)–738 | Make missing/issued/blocked prerequisites readable; preserve immutable snapshots. |
| JourneysOverview | [L742](../src/dev/fleetos-environment/fx/Collections.tsx#L742)–822 | Use next stages and pause constraints to connect fleet view and journey focus. |
| RestrictionsOverview | [L826](../src/dev/fleetos-environment/fx/Collections.tsx#L826)–906 | Lead with affected work and unresolved criterion; selection must target the exact rule. |

## fx/DocumentWork.tsx

Active documentary work. Versions, changes and events are distinct tasks. Keep immutable evidence; visually connect field changes to cargo/person/stop sources.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| DocumentWork | [L22](../src/dev/fleetos-environment/fx/DocumentWork.tsx#L22)–248 | Separate difference, history and issuance while retaining the same document identity. |

## fx/DossierInstrument.tsx

Active document instrument. Rich but long dossier combines requirements, snapshots, history and paper. Keep authenticity; focus on the discrepancy and expose evidence through the same document object.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| DossierInstrument | [L27](../src/dev/fleetos-environment/fx/DossierInstrument.tsx#L27)–656 | Discrepancy should dominate; requirements and paper unfold around it rather than require long scrolling. |
| Box | [L659](../src/dev/fleetos-environment/fx/DossierInstrument.tsx#L659)–679 | Keep authentic numbered CMR layout and readable empty fields. |
| Paper | [L681](../src/dev/fleetos-environment/fx/DossierInstrument.tsx#L681)–807 | Same issued-document object must remain immutable through joint and detailed work. |

## fx/DriverInstrument.tsx

Active time instrument. Preserve the continuous day, limits and provenance. Make the next stage/constraint dominant; keep driver identity through compact, joint and detailed representations.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| DriverInstrument | [L42](../src/dev/fleetos-environment/fx/DriverInstrument.tsx#L42)–864 | Let the selected person become the time instrument; align next stage and limiting input. |
| Meter | [L866](../src/dev/fleetos-environment/fx/DriverInstrument.tsx#L866)–893 | Keep comparable unit/ceiling; animate accepted changes finitely and retain provenance. |

## fx/Editors.tsx

Active DEV editing. Preview/cancel/confirm boundaries are valuable. Editors should unfold from the deciding part and visibly show consequences; fixed synthetic choices are not production forms.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| EditHead | [L20](../src/dev/fleetos-environment/fx/Editors.tsx#L20)–34 | Name the deciding object and provide an exact cancel return. |
| AssignmentSurface | [L38](../src/dev/fleetos-environment/fx/Editors.tsx#L38)–167 | Candidate comparisons should attach requirements and conflicting work to actual equipment. |
| DriverAssignment | [L172](../src/dev/fleetos-environment/fx/Editors.tsx#L172)–231 | Compare required qualification and recorded duty; do not equate assignment with availability. |
| AxleEditor | [L235](../src/dev/fleetos-environment/fx/Editors.tsx#L235)–270 | Unfold from the axle; preview the causal condition without clearing missing authorization. |
| FuelReadingEditor | [L272](../src/dev/fleetos-environment/fx/Editors.tsx#L272)–294 | Unfold from the tank and show assumption-dependent range consequences. |
| MaintenanceEditor | [L296](../src/dev/fleetos-environment/fx/Editors.tsx#L296)–318 | Separate recorded repair completion from forecast; preserve reassignment context. |
| QualificationEditor | [L320](../src/dev/fleetos-environment/fx/Editors.tsx#L320)–344 | Fixed renewal choices are synthetic; do not present them as complete record capture. |
| AuthorizationEditor | [L346](../src/dev/fleetos-environment/fx/Editors.tsx#L346)–364 | Preview exemption effects while retaining source/uncertainty; explicit confirmation remains required. |
| BaselineEditor | [L366](../src/dev/fleetos-environment/fx/Editors.tsx#L366)–388 | Attach baseline correction to the day axis and limiting time. |
| IssuePreview | [L390](../src/dev/fleetos-environment/fx/Editors.tsx#L390)–425 | Represent a new proposed snapshot; never visually edit an already issued record. |

## fx/EntityRegions.tsx

Active representation router. Retain missing/unassigned scope guards and reusable instruments. Make object representation changes continuous across shared-work and detailed inspection.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| V | [L85](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L85)–106 | Keep missing values explicit and readable in compact representations. |
| EntityUnavailable | [L260](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L260)–273 | Show absent object/context directly; never inherit another journey. |
| TrailerSheet | [L277](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L277)–415 | Trailer must retain independent identity, capacity and assignment relationship. |
| RestrictionTransports | [L419](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L419)–463 | Connect affected jobs to the exact segment and criterion. |
| StopSheet | [L467](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L467)–577 | Make pause/fuel/window tradeoffs one coherent decision around the stop. |
| StopCompare | [L579](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L579)–613 | Use aligned tradeoffs and direct object comparison, not unrelated candidate cards. |
| DriverStrip | [L621](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L621)–729 | Compact time facts must remain the same person/time object as the detailed axis. |
| DriverPassages | [L733](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L733)–831 | Align actual scoped predicted passage and driver duty without implying observed execution. |
| RestrictionImpacts | [L835](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L835)–896 | Use the shared deciding facts; do not reduce different rules to generic status rows. |
| VehicleCard | [L900](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L900)–970 | Compact tractor identity should become the detailed elevation, not be replaced by a new page. |
| EntityFacts | [L974](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L974)–1062 | Keep ownership/provenance attached to the object and show missing relationships. |
| EntityRegion (memoized named function expression) | [L117](../src/dev/fleetos-environment/fx/EntityRegions.tsx#L117) | Retain scope guards and representation routing; preserve inner-object continuity across compact/joint/full forms. |

## fx/Facets.tsx

Active inspection navigation. Facet labels describe useful questions, but the control stack competes with content. Reveal the relevant object part and preserve the joint question.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| FacetBar | [L88](../src/dev/fleetos-environment/fx/Facets.tsx#L88)–134 | Facet inspection should unfold an object question while preserving the joint task and captured return. |

## fx/honesty.tsx

Active visual primitives. Keep simulated/assumed/stale/unknown semantics and non-colour status signals. Increase legibility where the deciding provenance is too small.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| Val | [L9](../src/dev/fleetos-environment/fx/honesty.tsx#L9)–40 | Provenance is part of the deciding value; do not shrink it below useful reading size. |
| ClockGlyph | [L56](../src/dev/fleetos-environment/fx/honesty.tsx#L56)–63 | Retain text alternative through the surrounding provenance, not the icon alone. |
| Tri | [L65](../src/dev/fleetos-environment/fx/honesty.tsx#L65)–71 | Keep yes/no/unknown shape and word semantics. |
| Status | [L74](../src/dev/fleetos-environment/fx/honesty.tsx#L74)–81 | Keep selection and status independent; preserve text, not colour alone. |
| Plate | [L82](../src/dev/fleetos-environment/fx/honesty.tsx#L82)–89 | Stable recognizable vehicle identity across every representation. |
| Id | [L90](../src/dev/fleetos-environment/fx/honesty.tsx#L90)–92 | Support secondary identification without making operator headings cryptic. |
| Num | [L93](../src/dev/fleetos-environment/fx/honesty.tsx#L93)–95 | Keep tabular numeric reading for changes/comparison. |
| Ref | [L97](../src/dev/fleetos-environment/fx/honesty.tsx#L97)–99 | Citations remain readable and traceable to evidence. |
| Sim | [L100](../src/dev/fleetos-environment/fx/honesty.tsx#L100)–106 | Simulated values remain explicitly distinguished through every cinematic transition. |

## fx/HonestySpecimen.tsx

Current DEV specimen. Keep a regression reference for provenance/status treatments; it should not consume primary operator space.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| HonestySpecimen | [L4](../src/dev/fleetos-environment/fx/HonestySpecimen.tsx#L4)–80 | Retain as a visual regression specimen, including missing/loading/stale cases. |
| Cell | [L81](../src/dev/fleetos-environment/fx/HonestySpecimen.tsx#L81)–89 | Developer specimen grouping; no need for operator-facing redesign. |

## fx/LivingScene.tsx

Active retained hosts. Retained hosts provide region continuity. Extend identity to inner operational objects across task-body switches. Keep inactive hosts inert; assess retained catalog growth before expanding real data scope.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| LivingScene | [L27](../src/dev/fleetos-environment/fx/LivingScene.tsx#L27)–85 | Retain hosts and inert hidden content; add stable inner object identity across bodies. |
| LivingSurface | [L87](../src/dev/fleetos-environment/fx/LivingScene.tsx#L87)–154 | Retarget from actual geometry; reduce unnecessary layout travel and preserve scroll semantics. |

## fx/RestrictionInstrument.tsx

Active causal instrument. The causal chain is strong, but long and distributed. Derive headline/support/conclusion from one explanation model and attach missing inputs to their owners.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| RestrictionInstrument | [L53](../src/dev/fleetos-environment/fx/RestrictionInstrument.tsx#L53)–742 | One explanation model must drive headline, conditions, exceptions and next action. |

## fx/RouteInstrument.tsx

Active layered journey. Preserve the shared km axis and linked layers. Resolve crowded labels and make route/time/cargo correspondences visible during transformation.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| RouteInstrument | [L38](../src/dev/fleetos-environment/fx/RouteInstrument.tsx#L38)–787 | Make the five layers share visible stage identities and readable labels. |
| Layer | [L791](../src/dev/fleetos-environment/fx/RouteInstrument.tsx#L791)–811 | Use one scale and stable lane meaning; avoid unnecessary repeated metadata. |

## fx/RouteManagement.tsx

Active route decisions. Useful stop sequence, alternatives and release estimates. Prioritize the deciding stage, expose uncertainty, and transition directly into the relevant corridor.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| RouteManagement | [L17](../src/dev/fleetos-environment/fx/RouteManagement.tsx#L17)–333 | Connect next-window and corridor decisions; estimates must not look like observed release. |

## fx/SharedWork.tsx

Active joint-work families. Ten task forms are semantically distinct; many bodies still replace inner objects. Introduce shared object presenters and relationship transforms without reverting to domain pages.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| Clock | [L76](../src/dev/fleetos-environment/fx/SharedWork.tsx#L76)–95 | Preserve operational-value honesty; no moving clock that implies new observations. |
| ObjectLink | [L96](../src/dev/fleetos-environment/fx/SharedWork.tsx#L96)–132 | Turn the clicked object into the actual transition origin, including exact scope. |
| WorkIdentity | [L133](../src/dev/fleetos-environment/fx/SharedWork.tsx#L133)–149 | Keep one work identity in the anchor; scope changes should remain visible. |
| Crew | [L150](../src/dev/fleetos-environment/fx/SharedWork.tsx#L150)–195 | Same person object in readiness, journey, departure and detailed duty. |
| Machine | [L196](../src/dev/fleetos-environment/fx/SharedWork.tsx#L196)–257 | Same tractor/trailer/cargo object in every joint form. |
| Passage | [L258](../src/dev/fleetos-environment/fx/SharedWork.tsx#L258)–300 | Attach each condition to the relevant stage and deciding facts. |
| Paper | [L301](../src/dev/fleetos-environment/fx/SharedWork.tsx#L301)–329 | Same issued-document object must remain immutable through joint and detailed work. |
| Journey | [L330](../src/dev/fleetos-environment/fx/SharedWork.tsx#L330)–410 | Stages and responsibilities should share a visual structure, not a sequence plus appended text. |
| Matching | [L411](../src/dev/fleetos-environment/fx/SharedWork.tsx#L411)–497 | Make person/equipment compatibility a unit instrument, not parallel summaries. |
| UnitRequirements | [L498](../src/dev/fleetos-environment/fx/SharedWork.tsx#L498)–557 | Show the required fit beside the specific object/attribute that satisfies or misses it. |
| Handover | [L558](../src/dev/fleetos-environment/fx/SharedWork.tsx#L558)–655 | Prerequisites form a release sequence; attach the participating objects to each gate. |
| Schedule | [L662](../src/dev/fleetos-environment/fx/SharedWork.tsx#L662)–786 | Transform driver duty and journey stages on an aligned time structure. |
| Credentials | [L787](../src/dev/fleetos-environment/fx/SharedWork.tsx#L787)–905 | Confront required record with cargo and person; separate legal time from qualification. |
| Capacity | [L906](../src/dev/fleetos-environment/fx/SharedWork.tsx#L906)–980 | Cargo groups and unload order remain attached to the actual trailer. |
| EquipmentRecovery | [L981](../src/dev/fleetos-environment/fx/SharedWork.tsx#L981)–1051 | Represent the actual broken equipment relationship and available replacement action. |
| Clearance | [L1052](../src/dev/fleetos-environment/fx/SharedWork.tsx#L1052)–1154 | Connect measured object part, threshold, segment and exemption in one spatial decision. |
| Range | [L1155](../src/dev/fleetos-environment/fx/SharedWork.tsx#L1155)–1229 | Distinguish recorded tank reading, assumed consumption and unknown current position. |
| RouteChoice | [L1230](../src/dev/fleetos-environment/fx/SharedWork.tsx#L1230)–1301 | Compare recorded corridors with missing full duration/clearance explicit. |
| ExecutionRecords | [L1303](../src/dev/fleetos-environment/fx/SharedWork.tsx#L1303)–1493 | Bind each stage to its own execution and documentary evidence; prediction remains separate. |
| SharedWorkInstrument | [L1495](../src/dev/fleetos-environment/fx/SharedWork.tsx#L1495)–1698 | Keep ten authored tasks but persist inner objects when the task body changes. |

## fx/Spatial.tsx

Active spatial instruments. Preserve domain-shaped inspection and joint work in map mode. Attach evidence to the selected object/segment; minimise duplicated normal/spatial presentation logic.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| SpatialInspector | [L29](../src/dev/fleetos-environment/fx/Spatial.tsx#L29)–52 | Retain task-shaped detail and all participants; avoid another independent presentation tree. |
| Shell | [L54](../src/dev/fleetos-environment/fx/Spatial.tsx#L54)–77 | Keep evidence anchored in the active scene; no arbitrary floating UI. |
| DriverSpatial | [L79](../src/dev/fleetos-environment/fx/Spatial.tsx#L79)–214 | Duty/next-stage detail belongs to the same driver and route object. |
| TruckSpatial | [L216](../src/dev/fleetos-environment/fx/Spatial.tsx#L216)–316 | Tank/capacity/next-stop detail belongs to the same physical object. |
| RouteSpatial | [L319](../src/dev/fleetos-environment/fx/Spatial.tsx#L319)–451 | Candidate stop selection and proposal stay tied to the recorded corridor. |
| RestrictionSpatial | [L453](../src/dev/fleetos-environment/fx/Spatial.tsx#L453)–521 | Condition detail stays attached to the exact affected segment and deciding part. |
| DocumentsSpatial | [L523](../src/dev/fleetos-environment/fx/Spatial.tsx#L523)–567 | Paper/record focus quiets geography while retaining the work and exact return. |
| OverviewSpatial | [L569](../src/dev/fleetos-environment/fx/Spatial.tsx#L569)–696 | Prioritize selected journey next decision on the map without repeating full overview. |
| Context | [L699](../src/dev/fleetos-environment/fx/Spatial.tsx#L699)–715 | Make participating context legible without duplicating the shared question. |
| ContextCard | [L718](../src/dev/fleetos-environment/fx/Spatial.tsx#L718)–852 | Replace passive compact summaries with object-linked contextual evidence. |

## fx/Supports.tsx

Active supporting facts. Useful provenance and consequences can become passive prose. Prefer object-bound annotations; reconcile the hardcoded single-missing-fact summary with two missing VCI facts.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| FactColumn | [L14](../src/dev/fleetos-environment/fx/Supports.tsx#L14)–230 | Consolidate deciding facts with their owners; fix contradictory single-missing-fact prose. |
| Fact | [L232](../src/dev/fleetos-environment/fx/Supports.tsx#L232)–255 | Expand/remove actions should be readable, reachable and structurally meaningful. |
| ConsequenceLines | [L258](../src/dev/fleetos-environment/fx/Supports.tsx#L258)–300 | Show consequence changes attached to their source and affected object. |

## fx/TransportOverview.tsx

Active selected transport. Lifecycle and started/now/next/threats are meaningful. Compress duplicate metadata and let the next decision connect the journey, resources and evidence.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| ContentBands | [L16](../src/dev/fleetos-environment/fx/TransportOverview.tsx#L16)–77 | Use stage-specific relationships rather than a stacked list of domains. |
| TransportOverview | [L85](../src/dev/fleetos-environment/fx/TransportOverview.tsx#L85)–392 | Bring next decision forward, preserve lifecycle and stop/object continuity. |

## fx/TruckInstrument.tsx

Active physical instrument. Technical elevation, cargo and part-bound facts are distinctive. Evolve one stable tractor/trailer object through load, passage, tank, assignment and workshop questions.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| TruckInstrument | [L40](../src/dev/fleetos-environment/fx/TruckInstrument.tsx#L40)–857 | Preserve a single tractor/trailer across load, fuel, passage, assignment and workshop. |
| RangeBar | [L859](../src/dev/fleetos-environment/fx/TruckInstrument.tsx#L859)–918 | Keep assumed range separate from observed reading and current unknown position. |

## fx/VehicleDrawing.tsx

Active vector objects. Keep authored vector precision and interactive parts. Current schematic uses fixed physical template constants; do not imply per-model CAD fidelity. Use stable per-instance SVG definition IDs when multiple drawings coexist.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| VehicleDrawing | [L37](../src/dev/fleetos-environment/fx/VehicleDrawing.tsx#L37)–449 | Use object-level transitions, accurate scoped labels and unique SVG IDs; schematic dimensions are template constants. |
| LoadPlan | [L452](../src/dev/fleetos-environment/fx/VehicleDrawing.tsx#L452)–548 | Cargo groups must retain identity as loading/unloading and capacity questions change. |

## fx/WorkspaceTabs.tsx

Active saved work. Preserve tab identity and source frames. Long labels truncate quickly; use concise work titles with anchor/participants available accessibly and improve close targets.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| WorkspaceTabs | [L29](../src/dev/fleetos-environment/fx/WorkspaceTabs.tsx#L29)–114 | Concise work titles, accessible full identity, usable close target and exact tab-frame return. |

## fx/World.tsx

Opt-in earlier world. Persistent transport objects illustrate continuity, but this prototype is not the default replacement. Extract useful identity principles without abandoning authored tasks or history.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| TransportObject | [L93](../src/dev/fleetos-environment/fx/World.tsx#L93)–221 | Persistent transport objects illustrate continuity, but this prototype is not the default replacement. Extract useful identity principles without abandoning authored tasks or history. |
| FocusContent | [L225](../src/dev/fleetos-environment/fx/World.tsx#L225)–265 | Persistent transport objects illustrate continuity, but this prototype is not the default replacement. Extract useful identity principles without abandoning authored tasks or history. |
| WorldEnvironment | [L269](../src/dev/fleetos-environment/fx/World.tsx#L269)–407 | Persistent transport objects illustrate continuity, but this prototype is not the default replacement. Extract useful identity principles without abandoning authored tasks or history. |

## GuidedEnvironment.tsx

Active orchestrator. Split scene rendering, navigation/frame lifecycle, motion coordination and diagnostics. Preserve commands/history; replace region-only continuity with object-level contracts.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| GuidedEnvironment | [L114](../src/dev/fleetos-environment/GuidedEnvironment.tsx#L114)–1307 | Split scene rendering, navigation/frame lifecycle, motion coordination and diagnostics. Preserve commands/history; replace region-only continuity with object-level contracts. |

## GuidedSurfaces.tsx

Mixed historical/current module. Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| LensTitle | [L34](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L34)–68 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| AnchorLine | [L69](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L69)–86 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| LensLink | [L87](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L87)–103 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| AssuranceBrief | [L104](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L104)–165 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| ExceptionBrief | [L166](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L166)–189 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| JobsSurface | [L190](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L190)–403 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| FuelBrief | [L404](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L404)–425 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| StopPicker | [L426](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L426)–444 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| ResourceBrief | [L445](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L445)–478 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| FuelSurface | [L479](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L479)–669 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| ResourceSurface | [L670](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L670)–887 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| AssuranceSurface | [L888](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L888)–1085 | Only StationDetail and FutureSurface are directly imported by the current orchestrator; other surfaces are earlier generations. Current station detail contains fixed proposal prose; use scoped facts when remapping it. |
| StationDetail | [L1086](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L1086)–1153 | Replace fixed quantities/times in earlier detail prose with the selected stop facts. |
| FutureSurface | [L1154](../src/dev/fleetos-environment/GuidedSurfaces.tsx#L1154)–1172 | Economy/compliance are placeholders; cinematic treatment cannot imply implemented workflows. |

## index.tsx

Active entry. Default GuidedEnvironment is correct. Eager imports also load optional experiment styles; isolate optional entry loading after verifying inherited style dependencies.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| FleetOSEnvironment | [L6](../src/dev/fleetos-environment/index.tsx#L6)–15 | Default GuidedEnvironment is correct. Eager imports also load optional experiment styles; isolate optional entry loading after verifying inherited style dependencies. |

## InteractionDiagnostics.tsx

Current DEV diagnostics. Transition/frame coverage is useful. Add continuity/retargeting/performance evidence without presenting developer terminology to operators.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| InteractionDiagnostics | [L15](../src/dev/fleetos-environment/InteractionDiagnostics.tsx#L15)–164 | Transition/frame coverage is useful. Add continuity/retargeting/performance evidence without presenting developer terminology to operators. |

## ParameterControl.tsx

Earlier DEV control. Continuous numeric controls support the old exploration tools. Keep them outside operator navigation.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| ParameterControl | [L3](../src/dev/fleetos-environment/ParameterControl.tsx#L3)–68 | Continuous numeric controls support the old exploration tools. Keep them outside operator navigation. |

## ProductSurfaces.tsx

Historical product surfaces. Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| Header | [L27](../src/dev/fleetos-environment/ProductSurfaces.tsx#L27)–68 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |
| Relation | [L69](../src/dev/fleetos-environment/ProductSurfaces.tsx#L69)–111 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |
| Supports | [L112](../src/dev/fleetos-environment/ProductSurfaces.tsx#L112)–166 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |
| DemoNote | [L167](../src/dev/fleetos-environment/ProductSurfaces.tsx#L167)–173 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |
| DutyTimeline | [L179](../src/dev/fleetos-environment/ProductSurfaces.tsx#L179)–233 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |
| DriverWork | [L234](../src/dev/fleetos-environment/ProductSurfaces.tsx#L234)–391 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |
| TruckWork | [L392](../src/dev/fleetos-environment/ProductSurfaces.tsx#L392)–545 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |
| FuelWork | [L546](../src/dev/fleetos-environment/ProductSurfaces.tsx#L546)–712 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |
| DocumentsWork | [L713](../src/dev/fleetos-environment/ProductSurfaces.tsx#L713)–892 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |
| RestrictionsWork | [L893](../src/dev/fleetos-environment/ProductSurfaces.tsx#L893)–1007 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |
| FuelSupport | [L1009](../src/dev/fleetos-environment/ProductSurfaces.tsx#L1009)–1075 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |
| ResourcesSupport | [L1076](../src/dev/fleetos-environment/ProductSurfaces.tsx#L1076)–1132 | Earlier work/support bodies coexist with current fx instruments. Preserve historical review; do not add another parallel presentation generation. |

## RepresentationSurface.tsx

Earlier representation shell. Generic content/roles belong to the earlier topology experiment; not the active authored work surface.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| RepresentationBody | [L12](../src/dev/fleetos-environment/RepresentationSurface.tsx#L12)–36 | Generic content/roles belong to the earlier topology experiment; not the active authored work surface. |
| RepresentationSurface | [L37](../src/dev/fleetos-environment/RepresentationSurface.tsx#L37)–231 | Generic content/roles belong to the earlier topology experiment; not the active authored work surface. |

## SpatialDiagnostics.tsx

Earlier DEV diagnostics. Geometry overlays are debugging tools, not the new scene architecture.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| SpatialDiagnostics | [L3](../src/dev/fleetos-environment/SpatialDiagnostics.tsx#L3)–90 | Geometry overlays are debugging tools, not the new scene architecture. |

## TopologyTools.tsx

Earlier solver tooling. Procedural topology/stress controls are historical. Do not restore random composition to satisfy alive behaviour.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| TopologyTools | [L17](../src/dev/fleetos-environment/TopologyTools.tsx#L17)–341 | Procedural topology/stress controls are historical. Do not restore random composition to satisfy alive behaviour. |

## WorkspaceTools.tsx

Earlier workspace tooling. Allocation/random/stress controls are historical. Keep distinct from authored operator navigation.

| Presentation function | Source lines | Finding / remap disposition |
| --- | --- | --- |
| WorkspaceTools | [L42](../src/dev/fleetos-environment/WorkspaceTools.tsx#L42)–263 | Allocation/random/stress controls are historical. Keep distinct from authored operator navigation. |

## Supporting modules

| Module | Responsibility / remap implication |
| --- | --- |
| [backend/runtime.ts](../src/dev/fleetos-environment/backend/runtime.ts) | Opt-in read/command adapter; preserve revision/domain protections and existing saved records. |
| [backend/workspace.ts](../src/dev/fleetos-environment/backend/workspace.ts) | Opt-in frame/navigation model; reuse boundaries, not its alternate layout. |
| [cameraChoreography.ts](../src/dev/fleetos-environment/cameraChoreography.ts) | Active camera interpolation/refitting; introduce semantic targets and measure per-frame resize/redraw cost. |
| [composition.ts](../src/dev/fleetos-environment/composition.ts) | Historical continuous/random composition; do not restore as current operator grammar. |
| [compositionGrammar.ts](../src/dev/fleetos-environment/compositionGrammar.ts) | Authored participation/families; reconcile with shared tasks and object presenters. |
| [demoContent.ts](../src/dev/fleetos-environment/demoContent.ts) | Earlier synthetic shapes; avoid confusing them with current operational fixtures. |
| [edits.ts](../src/dev/fleetos-environment/edits.ts) | Accepted/proposed DEV facts; preserve preview versus committed values. |
| [engine/contracts.ts](../src/dev/fleetos-environment/engine/contracts.ts) | Read/command honesty boundary; maintain explicit scope, unknowns and provenance. |
| [engine/routeManagement.ts](../src/dev/fleetos-environment/engine/routeManagement.ts) | Route decision projection; no fabricated full-route distance/time/clearance. |
| [engine/synthetic.ts](../src/dev/fleetos-environment/engine/synthetic.ts) | Default synthetic provider; preserve missing/unassigned guards and production-shaped contracts. |
| [entityComposition.ts](../src/dev/fleetos-environment/entityComposition.ts) | Entity layout composition; transform relationships before allocating rectangles. |
| [entityRecipes.ts](../src/dev/fleetos-environment/entityRecipes.ts) | Authored entity recipes; unify their object continuity with shared composition paths. |
| [entityVariations.ts](../src/dev/fleetos-environment/entityVariations.ts) | Finite variation inventory; does not establish browser or production completeness. |
| [fx/impact.ts](../src/dev/fleetos-environment/fx/impact.ts) | Preview consequence explanation; unify it with scene-level deciding facts. |
| [fx/model.ts](../src/dev/fleetos-environment/fx/model.ts) | Current lab projection and proposal preview; reduce repeated reads only after measurement; preserve scoped guards in callers. |
| [fx/sceneSnapshot.ts](../src/dev/fleetos-environment/fx/sceneSnapshot.ts) | Capture actual object geometry; extend capture to stable inner object presenters. |
| [guidedContent.ts](../src/dev/fleetos-environment/guidedContent.ts) | Demo job/context projection; preserve exact selected record geometry. |
| [guidedWorkspace.ts](../src/dev/fleetos-environment/guidedWorkspace.ts) | State/actions/layout/map translation; isolate responsibilities without losing history and action intent. |
| [interactionGraph.ts](../src/dev/fleetos-environment/interactionGraph.ts) | Relationship and selection contracts; extend with transition origin/retention/return meaning. |
| [labGeometry.ts](../src/dev/fleetos-environment/labGeometry.ts) | Earlier shell geometry; do not confuse with active task-specific scene geometry. |
| [labSurfaces.ts](../src/dev/fleetos-environment/labSurfaces.ts) | Earlier lab requests; historical materials, not active operator layout. |
| [liquidSynthesis.ts](../src/dev/fleetos-environment/liquidSynthesis.ts) | Historical procedural synthesis; not the new living interaction implementation. |
| [livingEnvironment.ts](../src/dev/fleetos-environment/livingEnvironment.ts) | Earlier living-state prototype; retain useful ideas, not alternate state architecture. |
| [mapApi.ts](../src/dev/fleetos-environment/mapApi.ts) | Stable renderer API; preserve mounted-map boundaries. |
| [mapMotion.ts](../src/dev/fleetos-environment/mapMotion.ts) | Shared interpolation plus legacy defaults; actual guided paths must retain recorded geometry. |
| [mapQuiet.ts](../src/dev/fleetos-environment/mapQuiet.ts) | Runtime basemap tuning; redesign geographic hierarchy rather than globally dimming all data. |
| [mapRepresentation.ts](../src/dev/fleetos-environment/mapRepresentation.ts) | Map role presentation; align emphasis with task and selected object. |
| [mapTypes.ts](../src/dev/fleetos-environment/mapTypes.ts) | Spatial/camera contracts; represent intent and scope explicitly. |
| [motion.ts](../src/dev/fleetos-environment/motion.ts) | Single 680 ms constant; split semantic motion classes with interruptible coordination. |
| [relations.ts](../src/dev/fleetos-environment/relations.ts) | Follow semantics; preserve scope/participants and make object origin visible. |
| [representationEngine.ts](../src/dev/fleetos-environment/representationEngine.ts) | Earlier topology/role solver; do not restore random/scored page generation. |
| [representationLibrary.ts](../src/dev/fleetos-environment/representationLibrary.ts) | Earlier representation catalog; historical materials only. |
| [sceneIdentity.ts](../src/dev/fleetos-environment/sceneIdentity.ts) | Current object keys; extend into inner objects shared between task bodies. |
| [sharedComposition.ts](../src/dev/fleetos-environment/sharedComposition.ts) | Ten shared tasks; preserve entire-set semantics and meaningful participation. |
| [sharedReadModel.ts](../src/dev/fleetos-environment/sharedReadModel.ts) | Scope/situation/decisions; use as common explanation source rather than divergent summaries. |
| [spatialPresentation.ts](../src/dev/fleetos-environment/spatialPresentation.ts) | Information depth; integrate depth with actual task rather than arbitrary panel scaling. |
| [spatialQuestions.ts](../src/dev/fleetos-environment/spatialQuestions.ts) | Task-specific geometry/camera; preserve distinction between recorded routes, segment evidence and absent positions. |
| [synthesis.worker.ts](../src/dev/fleetos-environment/synthesis.worker.ts) | Historical solver worker; not needed for authored choreography. |
| [synthesisStress.ts](../src/dev/fleetos-environment/synthesisStress.ts) | Historical synthesis stress; keep separate from current browser acceptance. |
| [tomtomStyle.ts](../src/dev/fleetos-environment/tomtomStyle.ts) | Reuse TomTom source/style and attribution; do not expose credentials in audit artifacts. |
| [topologyScenarios.ts](../src/dev/fleetos-environment/topologyScenarios.ts) | Historical topology scenarios; not production workflow acceptance. |
| [workspaceGeometry.ts](../src/dev/fleetos-environment/workspaceGeometry.ts) | Earlier spatial allocator; retain as historical, avoid generic boxes as living design. |
| [workspaceTabs.ts](../src/dev/fleetos-environment/workspaceTabs.ts) | Composition identity and captured frames; preserve draft/action intent, exact return and shared accepted facts. |
| [world.ts](../src/dev/fleetos-environment/world.ts) | Synthetic operational fixtures and derived data; reconcile divergent restriction summaries and keep simulation explicit. |

## Stylesheets

All eleven were present in the default browser session because the entry eagerly imports optional experiments. Source sizes below are not bundle/network sizes. Consolidate styles by scene and object as each flow migrates; keep historical experiments isolated.

| Stylesheet | Lines | Source bytes | `!important` declarations | Role |
| --- | ---: | ---: | ---: | --- |
| [backend/connected.css](../src/dev/fleetos-environment/backend/connected.css) | 775 | 14108 | 4 | Optional connected layout |
| [environment.css](../src/dev/fleetos-environment/environment.css) | 2198 | 47687 | 3 | Earlier generic environment base |
| [fx/entity.css](../src/dev/fleetos-environment/fx/entity.css) | 469 | 9940 | 1 | Entity-region presentation |
| [fx/fidelity.css](../src/dev/fleetos-environment/fx/fidelity.css) | 2192 | 45274 | 26 | Instrument fidelity overrides |
| [fx/fleetos.css](../src/dev/fleetos-environment/fx/fleetos.css) | 2722 | 57257 | 26 | Primary visual tokens and instruments |
| [fx/living.css](../src/dev/fleetos-environment/fx/living.css) | 1310 | 29589 | 14 | Facet/edit/spatial additions |
| [fx/morph.css](../src/dev/fleetos-environment/fx/morph.css) | 488 | 11927 | 1 | Region/object transition overrides |
| [fx/sharedWork.css](../src/dev/fleetos-environment/fx/sharedWork.css) | 1342 | 31878 | 0 | Joint task structures |
| [fx/world.css](../src/dev/fleetos-environment/fx/world.css) | 468 | 8696 | 0 | Optional earlier world layout |
| [guided.css](../src/dev/fleetos-environment/guided.css) | 1846 | 34633 | 3 | Guided shell/regions and prior styles |
| [product.css](../src/dev/fleetos-environment/product.css) | 1080 | 19592 | 5 | Earlier product instrument styles |

## Verification modules

The 22 test files are inventoried in the machine-readable report. Their 183 tests passed in the preceding preparation turn. Preserve meaningful semantic, identity, scope, history and camera checks; add native acceptance for menu reveal, object continuity, repeated-input retargeting and visual hierarchy. Do not equate state-rendering coverage with usability.
