# FleetOS Studio — from a good-looking prototype to the working environment

15 October 2026 · `/__dev/fleetos-studio`

## Where it is shallow today

| Area | What the studio has | What the product already has (and the studio doesn't use) |
|---|---|---|
| **Navigation** | 5 tabs (Transportes, Paragens, Combustível, Motoristas, Frota) + one panel | 13 app areas: Visão geral, Trabalhos, Expedição, Frota, Viatura, Reboque, Motoristas, Motorista, Documentos, Conformidade, Inteligência, Definições; customers and sites |
| **Views** | One fixed-width panel, one level deep | Full pages per entity (driver, truck, trailer, job with tabs: resumo, paragens, plano, documentos, histórico) |
| **Map** | Pins, routes, fuel stations; no controls | Regulation dataset (restrictions with geometry), road events, sites, TomTom traffic, clean-route solver alternatives |
| **Planning** | One job at a time, by hand | `planFleet`: whole-fleet automatic plan (who takes what, empty km, rests, restrictions), alternatives, override impact, saved recommendations |
| **Execution** | Read-only states | Commands: start loading, depart, complete stops, deliver, invoice, cancel, replan invalidated plans |
| **Documents** | None | CMR and invoices: issue, void, numbering series, snapshot diff |
| **Records** | Create transport only | Create/edit trucks, trailers, drivers, customers, sites; archive |
| **History** | None | Append-only event log per entity (`listEvents`) |

The look and the motion are right. What's missing is **depth**: more places to go, bigger views when the work needs them, and the product's real engines behind every button.

## Principles (kept from what worked)

- One map, always present; objects keep their identity and morph between views (no page swaps).
- Every action runs on the app's own engine and commands, so studio and app never disagree.
- Office-first: fewer clicks for daily work, clear verbs, previews before commits.
- Honest data: simulated / estimated / not calculated always labelled.

## The plan — six phases

### A · Shell and expanding views (foundation)

1. **Main menu rail** on the left edge with the real areas: Operação · Planeamento · Execução · Frota · Pessoas · Clientes · Documentos · Conformidade · Inteligência · Definições. Collapsed it is icons; hovering expands labels. Each area is a *composition* of map + panels, not a separate page.
2. **Three view sizes for anything you open** (job, driver, truck, customer):
   - *Side* — today's panel (quick look, map in front).
   - *Wide* — panel takes half the screen, map shrinks to a corridor view (planning, documents).
   - *Full workspace* — the object fills the screen with tabs (Resumo · Paragens · Plano · Documentos · Histórico), the map becomes a header strip.
   Switching sizes morphs the same panel; Esc steps back one size.
3. **Command bar (Ctrl+K)**: search jobs, plates, drivers, customers, places, and actions ("novo transporte", "planear o dia", "emitir CMR J-4201").
4. **Split compare**: two jobs or two drivers side by side.

### B · Automatic planning workspace ("Planear o dia" — one button)

1. Button **Planear automaticamente** runs `planFleet` over all open jobs for a chosen day/horizon.
2. Result as a scene, not a list: every backlog card **flies onto the truck that takes it**; truck lanes show the day's sequence (empty run → pickup → delivery → rest); the map draws every proposed route at once.
3. Totals bar: jobs assigned / unassigned (with reasons), loaded vs empty km, cost, €/job, driving-hours risk.
4. **Adjust before confirming**: pin a truck or driver to a job (override) → the engine re-plans and shows the impact (`overrideImpact`: +€, +km, +h); reject alternatives; see why each match was made.
5. **Confirm all** or per job — the same confirmation path as Expedição's automatic planning (saved recommendation + plan confirmation with compliance).
6. Manual planner (already built) stays as "planear este à mão".

### C · The map as an instrument

1. **Layer control**: Transportes · Rotas · Paragens · Postos e preços · Restrições (regulation dataset) · Ocorrências na estrada · Clientes e locais · Motoristas · Trânsito TomTom.
2. **Zoom levels that change content**: country = density and counts per region; region = pins and routes; corridor = stops, windows, fuel stops, restrictions on the route.
3. **Map actions**: right-click → "novo transporte daqui / até aqui"; click a truck → its panel; lasso a group of jobs → "planear estes".
4. **Restrictions on the map**: zones and road segments from Road Intelligence; a planned route passing near one shows why it was avoided (from the compliance record).

### D · Execution (real commands)

1. Job lifecycle buttons that match the phase: **Iniciar carga · Partir · Concluir paragem · Entregar · Faturar · Cancelar** — `transition`, `setStopCompleted`.
2. **Replan invalidated plans** (`REPLAN_REQUIRED`): show what changed (fields), recompute, confirm.
3. **Documents in context**: emitir CMR before departure, fatura after delivery, anular with reason — `issueDocument` / `voidDocument`, numbering from the company series.
4. Notices to clients and exceptions saved as job notes + events (no longer local only).

### E · Entity depth (records you can open fully and edit)

1. **Driver**: qualifications and expiries, hours baseline (EU 561) with editing, current and next jobs, history.
2. **Truck / trailer**: identity, dimensions and weights (routing profile), fuel tank and readings, availability (maintenance), jobs, history.
3. **Customer / site**: create and edit, saved addresses with map pin, the customer's jobs.
4. **History tab** on every object: the event log, as a vertical timeline.
5. Create/edit forms for all of them in the studio style, on the app's validators.

### F · Remaining areas

- **Documentos**: list, filters, issued/void, preview.
- **Conformidade**: expiries board (licences, CQM, tacógrafo, ADR) with "renovar até".
- **Inteligência**: Road Intelligence coverage and recent changes on the map.
- **Definições**: company identity, numbering series, demo data reset.

## Order and size

| Phase | Why this order | Size |
|---|---|---|
| A · Shell + view sizes | Everything else needs somewhere to live | M |
| B · Automatic planning | Biggest daily value; engine already exists | L |
| C · Map instrument | Turns the map from decoration into a tool | M |
| D · Execution | Closes the day: from planned to invoiced | M |
| E · Entity depth | Records and editing | L |
| F · Remaining areas | Completes coverage of the app | M |

## How each phase is checked

- Real data source (`?source=ops`), commands go through `OperationsService`; the app shows the same result.
- Typecheck, lint, full test suite; new model tests per phase.
- Browser walk-through of the phase's main flow, with screenshots.

## Open questions

1. Should the studio eventually **replace** the app's pages (same providers, same routes), or stay a separate DEV view until it covers everything?
2. Planning horizon for "Planear o dia": today only, today + tomorrow, or a chosen range?
3. Should automatic planning also propose **reordering trucks already busy** (queued jobs), or only fill free capacity?
