# FleetOS living composition objective

User clarification, 9 October 2026: all combinations, not a special Driver/Truck page.

## Meaning

A domain provides information and operations. A combination defines a new shared working situation. The current collection or object remains the anchor of the work, but its domain does not automatically own the resulting page's structure.

The input is the anchor, the entire participating domain set, the current task or selection, available operational data, and viewport. The result is a shared operational question, the information structure needed to answer it, transformed representations of the participating objects, and meaningful actions. Geometry and camera motion then express that transformation.

Adding or removing a domain creates or restores a composition tab. The live canvas morphs into its structure. The source composition retains its selection, drafts, practical scroll and camera; accepted backend facts remain shared. This is a new composition of work within the same environment, with continuing object identity and a persistent map renderer.

## Examples, not a list of special cases

| Participating domains | Shared work | Structural implication |
| --- | --- | --- |
| Drivers + Trucks | Crew and equipment readiness | Person and machine form a working unit; assignment, qualifications and physical requirements meet in one decision instrument. |
| Jobs + Documents | Shipment handover | The shipment's stages and required/issued documents form a release sequence, with immutable issued snapshots visible where relevant. |
| Trucks + Routes | Equipment and journey capability | The physical combination and journey stages are compared along the route; recorded capacities and missing inputs remain explicit. |
| Drivers + Routes + Conditions | Executable journey | Duty, stages and applicable passage conditions meet on a shared time/route structure. |
| Jobs + Drivers + Trucks + Documents + Conditions | Dispatch readiness | The working unit, shipment requirements and assurance state become a coordinated decision; the operator can follow each missing prerequisite. |

All supported domain sets must follow the same principle. These examples do not justify a unique hand-coded screen for each subset. Authored composition families and domain relationship contracts should establish the joint structures. Every participating domain must change the operational answer, representation or possible action; merely changing a heading or adding a fact column is insufficient.

## What the current code still gets wrong

`compositionGrammar.ts` chooses a primary lens and assigns the other lenses lead/support/inline roles. This can preserve a domain's existing page even when the task has become a new combination.

`entityRecipes.ts` begins by switching on the anchor kind. Some important joint recipes exist, but other domain additions are relegated to remaining context summaries in `entityComposition.ts`. Presence of all domains is therefore not proof of a new coherent composition.

The separate backend-connected experiment repeats the same limitation as a base collection plus extra columns/detail. It supplies useful read/command boundaries and revision protection, but its layout is not the target architecture.

## Next implementation boundary

1. Resolve the operational relationship of the entire active set before choosing a domain lead or rectangle. An explicit inspection may emphasize an object, but it must retain the shared composition's purpose.
2. Introduce shared work structures in the existing composer. Reuse and transform the existing Driver, Truck, Journey, Document and Conditions instruments within those structures. Avoid both fixed domain pages and a uniform grid with one cell per domain.
3. Make collection, job and entity paths use the same combination semantics. An anchor selects the records, rather than imposing a permanent page template.
4. Feed those shared structures with application-owned read models and service commands. Backend eligibility, missing inputs, stale execution and immutable documents must determine what the page can claim or do. No fabricated ETA, live legal margin or unrestricted route.
5. Inventory all supported domain sets and their operational purpose. Verify structural/representation changes as well as participation. Browser-check representative families across anchors, viewport sizes, addition/removal and exact source-frame returns. State-space coverage and visual/usability acceptance remain separate claims.

## Acceptance

For each addition, ask: does the shared operational task change how the whole workspace is organized and what can be done? If the original page remains dominant with extra material appended, that composition is unfinished.

For removal and return, ask: does the environment restore the relevant earlier composition while retaining the identities and confirmed operational facts? A full remount or loss of source edits breaks continuity.

Avoid equating “all combinations” with random layouts, superficial visual variety or an exhaustive library of individually authored pages. Variation comes from the meaning of the work inside designed rules.

## Research context

The original Pad++ research describes multiple representations of the same underlying information, including lenses that change its representation and interaction. This supports preserving object identity while transforming its working representation. It does not supply FleetOS's composition rules or imply that FleetOS should adopt a zoom-based navigation system. [Primary research: Pad++ representation and lenses](https://www.cs.umd.edu/projects/hcil/pad%2B%2B/papers/jvlc-96-pad/zoom-4.html).

Conventional trucking products remain references for assignments, stop execution, operational exceptions and document ownership. Their familiar page architecture is not evidence for the living environment's interaction design.

This document records the corrected objective and code findings. It does not claim the current interface already implements every combination.
