# FleetOS environment context coverage

The DEV environment now retains the selected content set when the canvas becomes spatial. Narrow entity compositions use a readable lead and a shared relationship summary. Missing objects and objects without a selected transport show unavailable context rather than borrowing J-4217's driver, cargo and journey.

This is a bounded coverage pass, not a claim that every possible operational screen is finished. The inventory covers the six implemented content domains and six entity anchors. Some domains participate through contextual facts rather than a complete independent instrument.

## What changed

- Spatial compositions keep their anchored object beside the map and collect the other active domains into a context region. Expanding the map no longer silently drops Drivers, Documents, Fuel or Jobs.
- Below 1000 pixels, normal compositions place one full-width lead above a full-width relationship summary. Spatial compositions stack map, object and context. The ordinary rail still opens the spatial view; the map remains one mounted instance.
- Entity renderers validate the selected object and transport. Unavailable contexts explain what is missing and provide a return to the collection. Unassigned driver D-40 displays Carla Nunes, without Miguel Costa's timeline or J-4217's journey.
- Geography follows the same validation. Unavailable entity context returns empty geometry and an explicit caption; map-opening controls are unavailable. It cannot reveal J-4217's route through an unrelated object's map.
- The synthetic provider returns null for missing driver/truck identities. Scene identity distinguishes an unassigned object from unrelated transport supports and keeps a known truck's identity across selected/unselected transport context.
- Context links to the anchored object become current-object readouts. Other object links remain followable. Region memoization includes the participating content list.
- The old test titled “every layer combination” was renamed because it checked only single additions. A finite inventory now builds combinations through the actual content and map reducers.

## Verification boundary

| Check | Coverage | Meaning |
| --- | --- | --- |
| Entity inventory | 384 states | Six entity kinds × 32 content sets including the base × normal/spatial |
| Layout invariants | 1,920 layouts | Each inventory state at 1920, 1440, 1199, 900 and 390 pixels, height 900; active-domain participation, one lead, bounds and non-overlap |
| Facet state checks | 2,992 transitions | Each single facet of each active domain from the 192 normal states; retained anchor/content and layout participation |
| Content removal | 480 transitions | Reduced composition keys and source-state immutability |
| Browser rendering | 36 scenes | All six domains active for each entity kind in normal/spatial views at 1440, 1199 and 900 pixels; actual rendered context, bounds and Esc state return |
| Browser unavailable cases | Five scenes | Free driver, missing truck/document/stop, and unknown transport |
| Visible click audit | 120 clicks, zero dead controls | Spatial truck, spatial document, compact route composition and free-driver composition; no page errors |
| Animated browser flows | Three widths | Native rail merges, animated map expansion, intermediate geometry, persistent map/truck/route hosts and exact Esc return |
| Lab tests | 20 files, 157 tests passed | Existing lab behavior plus the finite inventory |

Typecheck, targeted ESLint and production build passed. The existing map-vendor chunk-size warning remains. The production output contains none of the checked DEV markers (`__fleetosLab`, `ROUTE_OPERATIONS`, `fx-context-card`). No production integration was added.

The 390-pixel result is geometry coverage only. The visual/browser review in this pass covers the three larger widths above. Facet state checks do not prove every simultaneous facet combination has its own authored visual composition. The browser checks exercise representative maximal compositions and unavailable states, not every one of the 384 inventory states.

## Evidence

Browser reports and screenshots are saved in:

`C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/`

- `context-variations-browser-report.json` — 41 rendered scenes and 120 click results. The five unavailable cases also verify that the map is hidden and its rail control disabled.
- `spatial-morph-browser-report.json` — frame geometry and persistence/return results at all three widths. Geometry sampling begins before the click and runs in requestAnimationFrame, so tool latency cannot miss the transition.
- `context-combined-{1440,1199,900}.png` and `context-spatial-{1440,1199,900}.png` — reviewed truck compositions.
- `verify-context-variations.cjs` and `verify-spatial-morph.cjs` — reproducible DEV browser checks.

The prior route management review remains in [fleetos-route-management-implementation.md](fleetos-route-management-implementation.md), and the production boundary analysis remains in [fleetos-backend-route-analysis.md](fleetos-backend-route-analysis.md).

## Remaining work before “all context screens are done”

1. Extend this explicit inventory to collection and selected-transport compositions. Those have earlier focused tests, but are outside this entity matrix.
2. Review combined facets and context summaries against the questions they should answer. A summary is valid participation, but does not establish a complete management workflow or a dedicated authored screen for every question.
3. Exercise edit/proposal/confirmation, uncertain and stale facts, reassignment and return paths across more compositions. Existing checks cover representative paths rather than their Cartesian product.
4. Add browser and visual coverage for small mobile screens, keyboard/focus behavior, longer text, empty collections and real asynchronous loading/error states.
5. Implement and validate the production adapter described in the backend analysis before making real dispatch or backend-completeness claims. The current environment continues to use synthetic read models.
