# FleetOS — first persistent scene implementation

The newer [remembered workspace tabs implementation](fleetos-workspace-tabs-implementation.md) supersedes ordinary menu clicks adding context. This document records the first persistent-scene slice; explicit +/− and Shift-click continue to use its context compositions.

The small-sidebar DEV environment now composes its zones and entity regions through one persistent scene catalog. The completed interaction slice is Driver → Truck context → Restrictions → Map → Esc, including following the truck as the main object and reversing that transition while it is still moving.

## What changed

- Scene identity follows the actual person, vehicle, document, trailer or transport, rather than a recipe's region name. Authored recipes still choose the final geometry.
- Driver full, compact and passage forms use the same instrument and time-axis DOM. Truck full and compact forms use the same instrument and technical SVG. Supporting summaries answer the current question; compact drawing annotations withdraw to avoid overlap.
- New regions grow from the preceding object's measured geometry, or the preceding lead. Existing hosts interpolate from their current position, including interrupted transitions. The old cloned-label animation has been removed.
- Inactive surfaces retain their last read model and scroll within the synthetic session catalog. They become inert and hidden from accessibility immediately, then withdraw visually. Reset releases that catalog. This is a DEV session mechanism, not a production caching policy.
- Scroll is captured by scene identity. A changed representation starts at its answer; returning with Esc restores the captured position. The DEV settled hook now waits for scene geometry as well as the map, and exposes the current camera for read-only verification.
- Confirmed overrides and planned work survive returning to collections and closing their final lens. Explicit reset still starts a fresh synthetic world.
- Vehicle map markers follow the current transport's truck. They no longer fall back to J-4217 on an entity anchor or open a driver merely because Trucks is the current perspective.
- Sidebar principal controls and restriction-row open links now have separate click areas instead of covering their neighboring controls.

## Verification

The full application/test/server typecheck and production build passed; the environment remains DEV-only. No persistent-scene, recipe or lab-font markers were found in the production assets. The existing Vite size warning concerns production vendor chunks. Targeted ESLint passed, and the environment suite passed with **17 files / 139 tests**.

The final browser audit exercised **99 visible buttons across five changed compositions**, with **zero dead clicks**. The three desktop flows passed intermediate-geometry, persistent-node, interruption, bounds and exact state/layout/camera/scroll return assertions. Reduced-motion acceptance passed, and no page JavaScript errors were recorded in the three desktop flow pages. Map-marker identity and confirmed-fact persistence were also verified by the separate seven-scene probe.

Browser acceptance uses visible sidebar buttons and map controls after the DEV hook establishes fixtures. It checks intermediate geometry, driver-axis and truck-SVG identity, persistent map identity, frame return including camera and scroll, interruption, bounds at 1440/1920/1199 × 900, reduced motion, and actual button clicks in the changed compositions. The audit is limited to those compositions, not the entire application or every historical lab variant.

Evidence and reproducible browser scripts are in [the browser evidence folder](</C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/morph-browser-report.json>) and [the acceptance script](</C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/verify-morph.cjs>).

## Scope

This proves continuous object behavior for the driver/truck flow and introduces a shared renderer for all authored surfaces. Other instruments still have conditional internal forms; this is the first completed morphing slice, not a claim that every domain, collection or facet has been fully reengineered. The synthetic world adapter, small sidebar, authored destinations and persistent map remain the foundation. Production integration, mobile review, complete accessibility review and a production memory/performance policy are outside this slice.

Preview: [small-sidebar DEV environment](http://127.0.0.1:5174/__dev/fleetos-environment).
