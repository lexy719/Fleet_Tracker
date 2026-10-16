# Phase 5.7H - Product workspace review

Implemented only in `src/dev/fleetos-environment`. The complete user contract is preserved in `phase-5.7h-product-workspace-request.txt`. Production changes already present before this phase were left in place; this phase does not connect operational repositories, commit or push.

## Product information architecture

- Driver: temporal duty blocks, daily driving used/remaining, next pause and arrival comparison, execution agenda, assigned truck/trailer, rest/next task, integrated documents/conditions and critical exception.
- Truck: asset identity, fuel/range/consumption, meaningful pallet capacity, load/mass/dimensions, execution progress, location/ETA, maintenance/availability and an explicit synthetic T-18 assignment conflict.
- Fuel: recommendation versus selected option, station comparison, price/detour/arrival/rest/parking/spend, explanation of trade-offs and operational consequence/authorization.
- Documents: required document register, present/pending state, selected HTML preview, related identities, metadata and dossier history. No production PDF/editor/signing integration.
- Restrictions: type, source, status, segment, temporal validity, illustrative applicability, vehicle/Job relevance, impact and related stop.
- Jobs: collection remains adaptive; a selected anchor uses Overview do transporte rather than an ambiguous generic collection title.

The shared product styling retains restrained borders, green accents, off-white canvas and rail. Wide useful regions add parallel information rather than empty margins. Lead information depth becomes DEEP_LEAD at 840 x 480 useful pixels; container queries add parallel domain structure at 760 px and a third documentary column at 1050 px.

## Scalable relationship model

`interactionGraph.ts` now derives relationships from generic lens participation, anchor relevance and 16 directed rules between four semantic groups. The former 30 core directed pairs remain a classified evidence projection: 22 generic, 4 inherited, 4 overridden.

The four specializations are Drivers->Documents, Trucks->Documents, Drivers->Fuel and Trucks->Fuel. Future lenses can inherit their group/target participation without implementing a mandatory pair matrix.

## Spatial presentation

`spatialPresentation.ts` gives each question a preferred character, aspect and prominence. The six composition families remain intact. Deterministic authored arrangements include local-left/work-right, local-right/work-left, work-left/corridor-right, work-above/overview-below and overview-above/decision-below.

CURRENT_ENTITY is compact/local, NEXT_LEG is a corridor, FULL_ROUTE and ROUTE_AND_STOP favor wide relationship geography, AFFECTED_SEGMENT favors a larger local region, and NONE hides the map while retaining the instance. A manually chosen question survives a lead change. Automatic questions resolve according to task and relevant selection.

## Selection lifecycle and map linking

Selection normalization now rejects unrelated resources/conditions and incompatible truck/stop combinations, in addition to anchor/lens removal. The DEV log explains each keep/clear decision. F-07 survives relevant lead changes, clears when Fuel is removed or the Job changes, and clears when synthetic T-18 excludes it. Documents and resources follow their own owners.

Row pointer/focus emphasizes map geography without changing spatial question/camera/history. Map candidate clicks select the matching Fuel row. Restriction selection updates the affected segment. Document selection remains visible during temporary inspection.

## Browser evidence

- 26 required scenes plus responsive, Jobs, selection, linking, scroll, diagnostic and return evidence: 65 screenshots with state JSON and SHA-256 manifest.
- Reviewed 1199 x 900, 1440 x 900 and 1920 x 1080. Final viewport override removed.
- Same TomTom map instance `2` throughout the screenshot session, including resets, hidden maps, takeovers and source CSS refresh.
- No horizontal overflow in the canvas or visible panels in recorded snapshots. No map errors or console errors during the acceptance interval.
- 13 selection checks and 2 map/content linking checks passed.
- 9 successful exact return comparisons; 3 repeated compact/full-route/hidden/open/next-leg/takeover cycles. Reference is the frame captured by the application. Two initial pre-click probes had unstable camera/scroll references and were superseded by synchronized/frame comparisons; raw probes are retained transparently.
- Fixed an Open map control covered by the document area. Also fixed compact toolbar overlap with the Fuel marker: toolbar reduced from 73 to 43 px; measured overlap became zero; affected screenshots recaptured.

## Motion and performance

420 ms nominal geometry/camera transitions; reduced-motion path uses 0 ms. ResizeObserver calls resize/redraw during geometric changes without reinitializing the renderer. DOM diagnostics record settled duration, sampled geometry changes and resize delta; React Profiler records subtree commits/durations.

Dense Fuel scrolling moved 435 px with zero React commits in all four groups and preserved the camera. The measured 311 ms includes the automation call and observation, so it is not rendering latency. DEV Profiler includes initial rendering and hidden mounted surfaces, with an initial Jobs maximum of 322.9 ms. No FPS, GPU budget, production SLA or operator-productivity claim is made. Reduced-motion code/CSS was reviewed; the OS preference was not changed during browser acceptance.

## Validation

- Full suite: 1372 passing tests across 59 files; existing 5.7G tests preserved.
- Six targeted new contract tests; no new temporary component test suite.
- Application/test/server typecheck, repo lint and build passed.
- Production bundle inspection found no H lab strings; the entry remains gated by import.meta.env.DEV.
- Existing large map-vendor chunk build warning remains.

## Review artifacts

Artifacts are in `C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/`:

- `output/pdf/FleetOS-5.7H-Relatorio-Visual-Completo.pdf`
- `FleetOS-5.7H-domain-contact-sheet.png` (five leads, no added image labels)
- `FleetOS-5.7H-map-shape-comparison.png`
- `FleetOS-5.7H-preview-final.png`
- `FleetOS-5.7H-evidence.json` and individual screenshot snapshots
- `FleetOS-5.7H-PNGs-e-evidencia.zip`
- `FleetOS-5.7H-*-final.log`

Stop at visual review. Synthetic routes/prices/conditions/times/document previews do not constitute operational, commercial or legal intelligence.
