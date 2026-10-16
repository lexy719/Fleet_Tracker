# FleetOS — remembered tabs on a morphing canvas

Superseded by the user's [merged-page correction](fleetos-merged-pages-implementation.md): adding content now creates a new combined page retaining existing domains. Ordinary clicks on other domains combine their content as well. This document and its recording describe the earlier interpretation.

The user's current interaction correction is implemented in the small-sidebar DEV environment: clicking Truck while working on a Driver opens a Truck workspace tab; Restrictions opens its own tab. The source view stays available. These are tabs inside FleetOS, sharing one canvas and one mounted map.

## Behavior

- Ordinary sidebar navigation resolves the related object from confirmed synthetic assignments. The target opens with one primary domain. Collection navigation opens a separate collection tab.
- Object links use the same tab mechanism. An already-open object and transport context reuses its existing tab instead of duplicating it.
- Every tab remembers selection, facet, local editor/proposal, authored composition, map camera and practical scroll. Confirmed synthetic changes are carried into every restored tab and its history. Drafts stay in their source tab.
- Facets inspect a different question in the current tab. The small +/− beside a domain, or Shift-click on another domain, explicitly adds or removes supporting context in that tab.
- Tabs can be selected, closed and reopened. Arrow keys, Home and End navigate the tab strip. Escape reverses a local question first, then returns to the source workspace when that excursion's history reaches it.
- The shared scene keeps object hosts mounted between tabs. New and returning instruments unfold from their measured relationship in the outgoing workspace; visible instruments retarget from their current geometry. Geometry, unfolding and camera use a shared 680 ms duration. Reduced motion removes those transitions.

## Implementation

`workspaceTabs.ts` defines semantic tab identity, domain navigation, isolated new-workspace state and shared confirmed facts. `GuidedEnvironment.tsx` captures and restores tab frames and local histories, while `fx/WorkspaceTabs.tsx` supplies the accessible tab strip. `fx/LivingScene.tsx`, `fx/sceneSnapshot.ts` and `fx/morph.css` retain the instruments and coordinate their geometry. The map remains outside the tab content and never becomes a tab-keyed component.

The DEV settled hook now waits for camera choreography, map geometry and instrument CSS transitions. A MapLibre jump reports move-end on each interpolation frame, so its native moving flag alone cannot establish that the entire morph has finished.

## Verification

The environment suite passed **18 files / 143 tests**. Full application, test and server typechecks, targeted ESLint and the production build passed. The build retains its existing vendor-chunk size warning. No workspace-tab, persistent-scene or lab-font markers were found in production assets.

Browser acceptance passed at **1440, 1920 and 1199 × 900**. It measured intermediate truck geometry and unfolding, retained the original driver timeline, truck SVG and map nodes, and verified remembered state/layout/camera/scroll, tab reuse, explicit context and interrupted transitions. Keyboard navigation, active/inactive tab closing, reopening, shared confirmed facts and reduced motion passed.

The changed-scene audit exercised **150 visible buttons across five fixtures with zero dead clicks and no page JavaScript errors**. A supplementary check exercised all six domain menu controls from a Driver and from a transport (12 clicks), plus the restriction alternative facet. The spatial follow transition was established through the DEV hook and checked separately; it is a state acceptance check, not an extra audited click. These checks cover this interaction slice rather than every historical lab scene or the production application.

Evidence: [main browser report](</C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/tabs-browser-report.json>), [navigation report](</C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/tab-navigation-report.json>), [reproducible acceptance script](</C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/verify-workspace-tabs.cjs>) and [navigation script](</C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/verify-tab-navigation.cjs>).

## Scope

Changes are confined to the existing DEV lab and its documentation. Synthetic data, recorded route geometry, authored compositions and the small sidebar remain the foundation. This is a remembered-workspace and motion slice; it does not constitute production integration, a complete accessibility audit or a production caching policy. No commit or push was made.

Preview: [small-sidebar environment](http://127.0.0.1:5174/__dev/fleetos-environment).

[Recorded morphing demo](</C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/tabs-morph-demo.webm>): Driver → Truck → Restrictions → remembered Driver → explicit Truck context.
