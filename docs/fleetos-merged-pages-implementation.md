# FleetOS — content creates a merged page

The user's correction is that adding Drivers while in Trucks must create a new page containing both domains. Adding Restrictions must retain the truck and driver and recompose their combined information. The previous interpretation, in which new tabs isolated a domain and content mutated the source tab, has been replaced.

## Current behavior

Clicking another domain or its +/− opens a composition tab containing the resulting active domains. The source tab stays available with its state, facets, local draft, camera and scroll. The tab key includes the anchor, main perspective, transport context and canonical set of active domains. Reopening the same composition reuses its saved tab. Removing a domain opens or returns to the corresponding reduced composition. Clicking the base domain opens its collection. Following objects retains the participating domains. Facets for an already-active domain inspect within the current composition; a facet that introduces another domain creates its corresponding combined page as well.

The visible path is **Truck → Truck + Driver → Truck + Driver + Restrictions**. The pair becomes one machine-and-shift canvas: a full-width technical vehicle drawing above a full-width continuous driver day. The triple transforms into the shared journey axis, with vehicle range, driver time and causal restriction logic aligned to that journey. The composition's question appears once above the instruments.

Further domains remain participants. The compositor identifies which domains already have instruments, and supplies the remaining operational relationships as explicitly named context. The context region renders exactly its participating domains rather than duplicating instruments or omitting Drivers. Early adaptation branches now continue through that participation step. Existing authored recipe families and synthetic read models remain in use; there is no layout solver or floating fallback.

The shared scene retains the vehicle SVG, driver time-axis node and map between compositions. Geometry morphs to the new authored destination. Drafts belong to their source tabs; confirmed synthetic facts remain shared. These changes stay in the DEV lab, with no production integration or commit/push.

## Evidence

State checks cover distinct combined identities, preservation of the source state, retained domains, shared full-width instrument geometry, the route-led triple, canonical identity independent of addition order, reduction back to the base, and participation of every addable domain across six entity kinds.

Browser evidence is written by [the acceptance script](</C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/verify-merged-pages.cjs>) to [the merged-page report](</C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/merged-browser-report.json>). It checks actual domain clicks and + actions, intermediate geometry, visible drawing/timeline bounds, persistent DOM nodes, source frame restoration, facet history, composition reuse, interrupted transitions, six active domains, reduced motion and button effects. Captures cover 1440, 1920 and 1199 × 900.

The full environment suite passed **18 files / 145 tests**. Full application/test/server typechecks, targeted ESLint and the production build passed. The existing vendor-chunk size warning remains. The main browser audit passed **162 visible button clicks across five fixtures with no dead clicks or page errors**, and the three desktop motion flows plus reduced motion passed. Its audit uses reduced motion for fixture setup; the separate desktop flows verify the actual animation.

Four further actual clicks verified the final journey-control/domain-removal and object-follow/source-return fixes: the new domain gets its own combined tab, removal restores the exact earlier composition, and following an object carries both domains without carrying its source draft. The draft remains intact when returning. See [the history acceptance report](</C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/merge-history-report.json>) and [its script](</C:/Users/manue/.codex/visualizations/2026/10/08/01a11b3e-ebc9-7ba0-9e34-aff2457a1e30/verify-merge-history.cjs>).

The earlier isolated-tab reports and recordings are historical and do not describe this corrected interaction model. This slice is not a complete review of every historical recipe, accessibility behavior or production caching policy.

Preview: [small-sidebar environment](http://127.0.0.1:5174/__dev/fleetos-environment).
