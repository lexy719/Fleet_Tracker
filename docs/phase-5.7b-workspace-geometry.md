# Phase 5.7B — usable workspace geometry and white-space allocation

Review: [DEV interaction lab](http://localhost:5173/__dev/fleetos-environment).

Open the **DEV** button below the floating rail. The explorer contains the full-map action, continuous map controls, generic Surface A/B/C controls and removable spatial diagnostics. Closing the instruments returns their reserved space to the canvas. **Restaurar base** removes the abstract surfaces, restores all composition defaults and closes the instruments; it preserves the camera.

## Delivered spatial model

The composition domain explicitly owns:

- `viewportBounds`: the entire application canvas.
- `reservedChromeBounds`: the protected floating rail and, while open, the temporary DEV instruments.
- `usableWorkspaceBounds` and `usableWorkspaceRegions`: viewport space after chrome exclusions and the deliberately requested safe margin. The regions also support future interior exclusions that cannot be described by one rectangle.
- `protectedRegions`: explicit directional reservations and simulated pressure.
- `occupiedRegions`: active or compressed workspace surfaces.
- `freeRegions`: an exact disjoint rectangle decomposition of the remaining usable area, used for area accounting.
- `availableRegions`: maximal empty rectangle candidates. These may overlap each other and are never summed as if they were a disjoint area ledger.
- `intentionalNegativeSpaceRegions`: gutters, thin unusable remnants, and reclaimable breathing room left by preferred demand.

The area ledger checks `occupied + protected + free = usable`. Target geometry is entirely deterministic. No measured DOM rectangles, animation timing or storage state feed the solver.

The rail remains a small floating visual control. Its protected boundary is shared by its rendering configuration and the domain geometry: **x=96 on desktop** (28 px visual inset + 50 px rail + 18 px protection). There is no traditional sidebar component or fixed content grid. The full-height exclusion prevents primary content being placed underneath the rail anywhere along the canvas.

The DEV instruments are also modeled chrome, with a temporary 342 px reservation on the right while open. Their actions moved out of the former bottom bar, so no unexplained bottom offset limits the usable workspace. Closing the explorer releases this reservation.

## Full usable map

With no abstract occupants or directional reservations, zero margin and dominant 100×100 demand produce:

| Viewport    | Usable workspace / actual map      |
| ----------- | ---------------------------------- |
| 1440 × 900  | x=96, y=0, width=1344, height=900  |
| 1920 × 1080 | x=96, y=0, width=1824, height=1080 |

The map reaches the top, right and bottom permitted edges and stops exactly at the protected rail boundary. This is computed by the allocator, not a fullscreen CSS preset. When other occupants or reservations exist, the same demand can be compressed or suspended according to priority and constraints.

The default clean base deliberately uses breathing room: at 1440 × 900 its usable workspace is x=120, y=24, 1296 × 852, and its map is 803.52 × 528.24 at x=366.24, y=185.88. Percentages now use the usable workspace; the former viewport-based base rectangle is intentionally superseded.

## Generic surface allocator

The map participates as a `WorkspaceSurface`, alongside abstract DEV surfaces. The shared representation contains priority, prominence, continuous demand, minimum/preferred/maximum sizes, movement/compression/suspension/hiding permissions, spatial affinity, relationship group and requested state.

Allocation uses deterministic priority ordering and ranked maximal empty regions. Ranking considers retained area, aspect suitability, desired position, contextual proximity, affinity, visual balance and prominence. No identifier is assigned a permanent side. The same Surface A was placed near the rail, in the upper-right region, and then compressed/reallocated by reducing its priority.

Demand interpolates minimum → preferred → maximum. Prominence gently raises intermediate demand without changing the minimum/maximum endpoints. Supporting surfaces have a useful width cap of 1000 px; increasing prominence continuously relaxes that cap toward the workspace width. The DEV surfaces use different aspect preferences and share a 220 × 160 minimum. Desktop maps retain a 240 × 180 minimum; the existing physical-viewport fallback remains for smaller canvases.

Design rules include a 12–20 px minimum gutter, density-controlled breathing room and an intentional white-space budget. At most two simultaneously prominent surfaces are allowed. Excess demand is compressed, then suspended/hidden when no viable rectangle remains; noncompressible, immovable requests are rejected with reasons rather than silently violating constraints. Preferred surfaces do not expand merely to fill every remaining pixel. Explicit standalone full-map intent can use the entire usable workspace.

`workspaceGeometry.ts` owns the generic rectangle operations, space ledger and allocator. `composition.ts` adapts semantic intent and continuous map variables into requests. `labGeometry.ts` shares chrome configuration with rendering. `labSurfaces.ts` supplies abstract DEV preferences. `WorkspaceTools`, `SpatialDiagnostics` and `AbstractSurface` only expose/visualize the model.

## Browser acceptance — actually tested

**209 recorded target/settled-render geometry checks**, across **1440 × 900** and **1920 × 1080**, passed with no area-accounting, protected-region overlap, occupant-overlap, canvas-size, overflow or rendered-target mismatch failures.

| Required proof              | Result                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — full usable map         | Exact zero-margin rectangles above; screenshots saved at both sizes                                                                                                              |
| B — protected chrome        | All recorded active allocations excluded permanent rail, temporary instruments and explicit reservations                                                                         |
| C — free-space tracking     | Adding, moving, hiding, suspending and removing occupants recomputed the region ledger                                                                                           |
| D — dynamic allocation      | A moved from left to upper-right; changing priority altered its allocation rather than choosing a fixed slot                                                                     |
| E — reallocation            | Removing A rebalanced the map; removing all abstract surfaces restored the previous standalone full map                                                                          |
| F — intentional white space | Balanced floating map + supporting A left large usable regions deliberately empty; diagnostics identify breathing room and gutters                                               |
| G — extreme pressure        | At both sizes, maximum A/B/C demand compressed the highest-priority surface and suspended remaining demand, including the persistent map; manual suspension gave the region to B |
| H — clean restoration       | Full 10-step sequence at each size returned an exactly equal clean-base model                                                                                                    |
| I — map persistence         | Same constructor identifier `2` throughout the final acceptance session; no remounts or camera resets from layout actions                                                        |

The full sequence was exercised at each size: full usable map → A → B → remove A → increase B prominence → C → hide map → restore map → remove all → exact clean base.

Regression cycles included **24 stress samples at each size** (six aggressive transition sequences total), **32 random samples at each size**, and an additional **32 random samples with A and B enabled**. Manual stop was verified across closing/reopening the instruments. All seven continuous surface parameters, all four affinity modes, abstract grouping, explicit hidden/suspended states and reduced motion were exercised.

Before explicit camera tests, **193 layout-only snapshots preserved the camera unchanged**. Six native pan/zoom checks passed: floating base, full usable and tiny floating map at each desktop size. Reference markers remained within **0.407 px on either axis** after those interactions. Fit reference and reset camera were exercised at both sizes, including the tiny map. A real intermediate 800 ms transition was captured with rendered width 467.14 px against a 240 px target, the same map instance and live tiles. The reduced-motion override produced zero-duration transitions.

No captured browser warnings/errors and no map errors occurred in the final acceptance session. No white flashes or tile corruption were observed in the inspected views. Acceptance validates allocation targets and settled live rendering; the intermediate screenshot demonstrates interpolation. It is not a frame-by-frame GPU or collision benchmark. DOM measurements in the renderers are DEV settlement diagnostics and native map resizing only; spatial reasoning remains in the pure domain layer.

Evidence:

- [Full usable map — 1440](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7B-full-usable-1440.jpg)
- [Full usable map — 1920](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7B-full-usable-1920.jpg)
- [Floating rail + A](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7B-rail-and-A-1440.jpg)
- [Spatial diagnostics](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7B-diagnostics-1920.jpg)
- [Intentional white space](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7B-white-space-1920.jpg)
- [Extreme demand](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7B-extreme-1920.jpg)
- [Intermediate motion](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7B-motion-1440.jpg)
- [Browser measurements](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7B-browser-evidence.json)

## Project checks and scope

Typecheck, lint and production build passed. The existing large map-vendor chunk warning remains. Production assets contain none of the lab route, explorer, spatial diagnostics, map-surface marker or Surface A strings; their output hashes remain unchanged from the preceding phase.

The laboratory now has **29 deterministic tests**, including the six previous continuous-composition tests and 23 new spatial tests. They cover 2,480 generated combinations across four viewport sizes, plus focused tests for chrome/safe margins, full usable geometry, interior exclusions, free decomposition, minimum/preferred/maximum demand, gutters, compression, priority, relationships, prominence limits, removal, hiding/suspension, immovable demand, complete exclusion, determinism and sub-pixel continuity.

Full existing suite passed: **51 files, 1,310 tests** (93.50 seconds).

Implementation remains in the DEV laboratory. The production UI, configured TomTom integration, operational data/storage and camera API are unchanged. No operational surfaces, primary-selection flow or real cross-domain relationships were added. This phase stops at the spatial foundation for review.
