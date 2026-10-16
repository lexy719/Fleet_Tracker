# FleetOS 5.7J — Operational instrument fidelity

DEV lab only (`/__dev/fleetos-environment`). 5.7I architecture preserved; instruments gained fidelity. Synthetic data, recorded road geometry, no production integration, no Plan, nothing committed.
Request: [`phase-5.7j-instrument-fidelity-request.txt`](phase-5.7j-instrument-fidelity-request.txt) · Evidence: [`phase-5.7j-review/`](phase-5.7j-review/) · Full visual report: `Downloads/FleetOS-5.7J-Relatorio-Visual-Completo.pdf` (67 pages).

## What changed

| Instrument | Fidelity added | Files |
|---|---|---|
| Vehicle | Technical side elevation in metres (cab with windscreen, roof deflector, mirror, grille, bumper, steps, wheel arch; chassis, fuel tank, battery box, fifth wheel; curtain-side trailer with rails, straps, folds, rear doors, lights, underrun bar, landing legs, side guards; five axles with tyre/rim/hub/lugs). Top-down **load plan** (11 × 3 Euro slots, destination groups, unload sequence, weights, door side). Restriction facts **bound to parts** (clearance line, dashed first-axle dimension with leader, counted axles, mass bracket). Question switch **Carga · Restrições · Combustível**; hover detail for pallet groups, axles and tank. | `fx/VehicleDrawing.tsx`, `fx/TruckInstrument.tsx` |
| Driver | One continuous day: shaded past, strong now, committed future pattern, uncertain future texture after the limit or with a stale baseline. Support notes grouped into numbered **moments** that originate at the instant they affect. | `fx/DriverInstrument.tsx` |
| Route & Stops | Coordinated **layers of one journey** on a shared km axis (Driver legal window, Vehicle assumed range, Route with stops as objects and detour spurs, Road intelligence, Delivery windows/slack) with vertical guides; recommended / chosen / infeasible / unknown-suitability stop states. | `fx/RouteInstrument.tsx` |
| Documents | CMR paper following the production renderer's box numbering (1–9, 16, 19–22, signature boxes), snapshot metadata band separate from transport data, serial box; diff as `22 → 24` with emitted value struck, hover lights the history event that caused it; honest "cannot issue yet" invoice. | `fx/DossierInstrument.tsx` |
| Restrictions | Causal chain **facts → conditions → exception → verdict → consequence**, group results, hover links fact ↔ predicate, missing facts with origin and resolution, predicate → vehicle focus. | `fx/RestrictionInstrument.tsx` |
| Attention | Consequence if ignored, staggered entry, hover emphasises that transport's route on the fleet map (others fade). | `fx/Attention.tsx`, `EnvironmentMap.tsx` |
| Transport Overview | Narrative: Começou → Agora → A seguir → O que ameaça → O que precisa de decidir; threats open the right instrument (CMR → document takeover). | `fx/TransportOverview.tsx` |
| Living composition | Object continuity layer: `[data-object]` entities (stop F-07, plate, driver, CMR, RI-042, first-axle fact) glide from old to new position during lead changes, re-targeting each frame while regions recompose. Temporary **vehicle focus** state (aspect + part) in history, restored by Esc. | `fx/continuity.ts`, `guidedWorkspace.ts` |

Synthetic additions: clearance restriction RI-063 (4,30 m, labelled synthetic / unverified), attention `ifIgnored`, truck variants. DEV-only `__fleetosLab.slow(n)` slows composition, camera and continuity together for motion review.

## Tests and checks

- `npm run typecheck` ✓ · `eslint .` ✓ · `vitest run` **1374/1374** (60 files) ✓ · `npm run build` ✓ · lab absent from `dist/`.
- New: `instrumentFocus.test.ts` — predicate focus keeps restriction context; focus is temporary (cleared on perspective change, kept on selection).
- Visual tests: title-hidden contact sheet; vehicle silhouette without labels (reads as articulated truck + semitrailer); relationship tests with headings hidden (fact ↔ predicate, stop ↔ break, CMR diff ↔ revision).
- Motion: six transitions recorded at 6× slow motion (`phase-5.7j-review/motion/`); objects carry across, map grows without snapping, pending bar rises; ghost size interpolates instead of scaling text.

## Review answers (§54)

- Vehicle — believable truck instrument: yes (silhouette test).
- Driver — continuous and operational time: yes.
- Route & Stops — journey reads instantly at 1440/1920; at 1199 the Delivery layer is still tight between Coimbra and Porto.
- Documents — authentic dossier: yes.
- Restrictions — verdict explained causally: yes.
- Workspace — same world reorganising: yes, with object continuity on the six reviewed transitions.

## Known limits

Motion reviewed in headless slow motion, not on real hardware; map tiles load progressively during long transitions; Campanhã clearance is synthetic; Plan reserved; Driver/Truck anchors, URL state, dark mode not built.
