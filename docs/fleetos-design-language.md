# FleetOS design language

17 October 2026 · extracted from FleetOS Studio (`src/dev/fleetos-studio`) · the reference for the whole app

FleetOS is an **operations stage**, not a set of pages. One living map is always there; the work comes
to it as panels that grow, shrink and morph. Everything you look at in the UI is connected to where it
is on the map.

## 1. Principles

1. **The map is the stage.** One map instance for the whole session. Selecting, previewing and going
   back change framing and overlays, never the map. Areas of the app are lenses on the same stage.
2. **Layout follows the task.** No layout switches. The map steps back when there is nothing to place
   on it (a new form, a table of results), the panel widens when the work is tables and choices, and
   comes back the moment something gets a place.
3. **Objects keep their identity.** A transport card becomes the transport panel, its driver card, its
   truck card, its stop row — the same object morphs (shared-element FLIP), it is never replaced.
4. **Preview before commit.** Hover shows the consequence (ETA, route, cost) on the panel and the map;
   click drafts; one commit bar confirms; Esc/back reverses. Nothing changes silently.
5. **Honest data.** Every value says what it is: real, recorded, simulated, estimated, unconfirmed,
   "por calcular". Never invent a number to fill a gap.
6. **Rules are visible.** Phase rules (planning / loading / in transit / closed) decide which actions
   exist; impossible actions are absent, not disabled without reason.
7. **Office language.** Portuguese, plain words, verbs on buttons ("Planear rota e atribuir",
   "Confirmar saída"), one sentence for the next decision.

## 2. Tokens

| Token | Value | Use |
|---|---|---|
| `--paper` | `#f6f2ea` | panel surface, cards |
| `--paper-2` | `#efe9dd` | inset rows, fields |
| `--glass` | `rgba(250,247,240,.9)` + `backdrop-filter: blur(14px)` | floating surfaces over the map |
| `--ink` / `--ink-2` / `--ink-3` | `#1b1d22` / `#474b55` / `#868a93` | text, primary dark surfaces, meta |
| `--rule` / `--rule-2` | ink at 9% / 16% | hairlines, field outlines |
| `--focus` | `#e0502a` (vermilion) | the one focus colour: selected corridor, primary action, attention |
| `--sea` | `#2f6f8f` | alternatives, previews, links, traffic toggle |
| `--ok` / `--warn` / `--bad` / `--idle` | `#2a7a57` / `#c2850c` / `#d2401f` / `#8b8f98` | state only, never decoration |
| `--shadow` | inner highlight + soft 50px drop | every floating surface |
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | all motion |
| Type | Geist (UI), Geist Mono (numbers, refs, plates, times, eyebrows) | |

Scale: eyebrow 10–11px mono uppercase tracked; body 13–14px; titles 22px; deck headline 34px/650/-0.035em.
Radii: cards 16px, panels 22px, buttons 9–12px, chips pill. Spacing 4/6/8/10/14/18/22px.

## 3. Surfaces

- **Top bar** — brand, breadcrumb (Operação / J-4217), data source pill (real / demo, honest), live
  clock ("ao vivo"), menu.
- **Rail (menu)** — vertical, icon + short label: Transportes, Paragens, Combustível, Motoristas,
  Frota, then actions (Novo, Planear). Will carry the app areas.
- **Deck** — the resting list of the current lens: headline with counts ("Hoje 14 transportes"),
  filter chips, cards.
- **Panel** — the open object: head (back, ref, client, status), strip (corridor timeline), facts row,
  decision block (dark, one sentence + actions), then sections (stops metro, fuel, crew, vehicle).
- **Commit bar** — dark bar at the panel bottom when a draft exists: what changes + Confirmar / Cancelar.
- **Attention stack** — right side, the few things that need the office now.
- **Toast** — one line after a commit; the affected map object pulses once.
- **Map tools** — bottom right: Seguir camião, Trânsito, base style (Ruas / TomTom / Papel).

## 4. The map stage

- Paper style by default (work overlays carry the colour); street and satellite styles when detail is
  needed; satellite only for close-ups (a pump, a gate).
- Overlays: ink routes (dashed when no road geometry), vermilion focus corridor with flowing light
  ahead of the truck and ink behind, alternatives in sea blue, plan routes (loaded solid, empty dashed),
  stops as paper circles with vermilion ring, fuel stations coloured by price within the shown set.
- DOM markers: one persistent pin per transport (heading arrow, plate + activity tag), extras per lens
  (free drivers, free trucks, parked trailers, stops, refuel marks), spot marker for close-ups.
- Camera: padding always leaves the area free of panels; frame the corridor on open, follow the truck
  on request, fly to a spot at street level, re-frame when the layout widens.
- **Tethers**: thin curves from a UI element (driver row, stop row) to its point on the map.

## 5. Motion

- Shared-element FLIP with `data-flip` keys (`bg-{id}`, `ref-{id}`, `drv-{id}`, `plate-{id}`), retargets
  mid-flight; `data-flip-enter` staggers secondary content.
- Route reveal: the corridor draws from origin to destination (~1.3 s ease-out).
- Lens changes morph cards into their counterpart cards.
- Never animate `transform` on a MapLibre marker root (it positions via transform) — animate children
  or opacity. Respect `prefers-reduced-motion`.

## 6. Components (to extract)

Card (job / driver / truck / stop / fuel variants) · Panel + PanelHead · Strip · Facts / Fact ·
Decision + Act buttons (`act`, `act-need` vermilion, `act-exec` green) · Status badge · Chips ·
Lens nav / Rail · Metro (stops) · Unfold (inline option list with peek) · Option row · Commit bar ·
Toast · Attention item · Fuel chart · Tethers · StageMap · Map tools · Spot card.

## 7. Don'ts

No layout toggles · no decorative colour · no abstract diagrams or truck drawings · no full-page
navigations that drop the map · no disabled buttons without a reason in their title · no invented
numbers · no modal dialogs for things a panel can unfold.
