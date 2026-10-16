# FleetOS 5.7I — Instrument-driven workspace & attention-first base

DEV lab only (`/__dev/fleetos-environment`). Synthetic operational data; recorded road geometry. No production state, no Plan lens, nothing committed.
Request: [`phase-5.7i-instrument-workspace-request.txt`](phase-5.7i-instrument-workspace-request.txt). Evidence: [`phase-5.7i-review/`](phase-5.7i-review/) (31 scenes × 1440 and 1920, 7 at 1199, two contact sheets).

## What changed

**One visual system, five instruments.** The shared `eyebrow / title / anchor / ↗ ✕ / divider / hero metric` panel is gone. Each lead now has an answer headline and its own geometry:

| Lead | Instrument | Headline example |
|---|---|---|
| Driver | Full-width time axis: duty blocks (past solid, planned outlined), continuous-driving spell, stop windows, `now`, 4h30 rule; EU 561 counters; qualifications | «Pausa obrigatória até 10:50» |
| Truck | To-scale tractor + trailer elevation: pallet positions ordered by drop (Coimbra pallets at the doors), dimensions, axles, first-axle marker; VCI predicates pinned to vehicle parts | «Conjunto apto para J-4217 — falta 1 facto» |
| Route & Stops | Linear 556 km strip: break window, fuel-range estimate, candidates with detour spurs, delivery windows, restriction marks; trade-off grid (recommended ◆ vs operator choice outline) | «Santarém é a melhor paragem antes da pausa» |
| Documents | Requirements ledger (issued / blocked / void + series), issued-snapshot vs current diff, scaled paper; detail takeover re-lays as paper-first | «CMR emitida antes da alteração de carga» |
| Restrictions | «Aplica-se a este transporte?» logic tree: Se todas / e alguma / quando / exceto se, each ✓ ✕ ?; missing facts, consequence, evidence | «Desconhecido — falta a altura ao 1.º eixo» |

Plus **Transport Overview** (anchor = job, lifecycle stepper, multi-stop track, cargo, resources, open items, next human action) and an **Attention-first base** (Bloqueios / Ação necessária / Risco / Em curso rows that enter the right workspace).

**Shared chrome:** one anchor strip (job, route, client, lifecycle, SLA, plan, lead + lens trail, clock) replaces every repeated job line; rail grouped Operation / Resources / Journey / Assurance with reserved Plan, Trailer, Compliance slots, active = dot, lead = filled; DEV controls moved to a separate DEV drawer; map caption states the spatial question, controls are quiet icons.

**Supports** render only as fact columns (no header, hover tools), numbered margin notes on the Driver axis, VCI predicates on the Truck elevation, parties inside the dossier, and consequence lines.

**Data honesty** is typographic: `Val` + provenance line; UNKNOWN hatched, ASSUMED dashed underline, STALE faded + clock, SIMULATED dotted underline / dotted map ring, UNCERTAIN wavy amber. Fuel is «31 % · manual · depósito Faro · 06:30» with «≈ 12 % assumido · 282 km desde a leitura». A DEV «Sistema de honestidade dos dados» sheet shows all nine states.

**Editing (prototype):** choosing a non-recommended stop or «Preparar reemissão» stages a change in a pending bar: change, consequences (plan → A replanear, events STOP_UPDATED / DOCUMENT_VOIDED + DOCUMENT_ISSUED), mandatory uncertainty acceptance when VCI applicability is unknown, Confirm / Cancel.

## Trust: real geometry

- J-4217 moved from the straight-line Porto→Madrid fixture to **Faro → Porto on the recorded TomTom truck route** (`regulations/__fixtures__/routeMatrix/faro__porto__fastest.json`, 556 km, A22·A2·A13·A10·A1·A20). Every job now uses a recorded route (Porto→Lisboa, Bragança→Porto, Coimbra→Viseu, Évora→Porto, Viseu→Faro).
- Restriction RI-042 is the **VCI Porto ring from OSM** (`vciPortoRing.ts`), with the official **CREP/A41** alternative dashed; RI-071 uses the IP3 works geometry; RI-058 uses a slice of the recorded route.
- TomTom style is quieted at runtime (`mapQuiet.ts`: desaturated roads/land, POIs hidden). The vehicle marker is labelled «simulada»; unknown positions are never placed (base caption says so).
- Map shape follows geometry: north–south corridors get a **portrait** map for stop comparison and the Transport Overview (`portraitRoute` affinity); FULL_ROUTE keeps gaining width.

## Synthetic world (`world.ts`)

Shapes follow production: Job (8-state lifecycle, priority, SLA, plan status, multi-stop dated windows, cargo lines with ADR/temperature, revision, blockers), Driver (hours baseline with recordedAt/staleness, VALID/EXPIRING/EXPIRED/MISSING/NOT_HELD qualifications), Truck/Trailer (Measured readings with source/time, first-axle height possibly unknown), OpsDocument (CMR/invoice, ISSUED/VOID/blocked, snapshot), RegulationRecord (APPLIES/DOES_NOT_APPLY/UNKNOWN, predicates, exemptions, evidence, verification), OpsAlert severities. Clock: Tue 6 Oct 2026 10:05. Fuel stops, prices and parking stay explicitly synthetic (no production source).

## Engineering

- `npm run typecheck` ✓ · `eslint .` ✓ · `vitest run` **1372/1372** ✓ (59 files) · `npm run build` ✓ (existing map-vendor size warning).
- Production bundle contains no lab code (`fx-instrument`, `__fleetosLab` absent from `dist/`).
- All 5.7G/H semantic tests preserved. Fixture-only change: the lab's `LOAD-4217` document (no production equivalent) became the invoice `FT-4217` in three tests; semantics unchanged.
- Map settle bug fixed: placement radius now lives in the grammar (14/12) — a CSS radius override had kept `data-layout-moving` true and stalled camera choreography.
- DEV-only `window.__fleetosLab` hook (act / reset / settled / specimen) used for scripted capture.

## Visual review (explicit, against §62)

| Check | Result |
|---|---|
| Repeated panel chrome | Removed; context appears once in the anchor strip |
| Giant metric repetition | `3h42` is now a counter on the axis; no hero metric cards |
| Green overuse | Selection = ink outline; recommendation = brand ◆; green only for «dentro do plano» |
| Empty wide layouts | 1920: Driver 3 columns, Truck 3 columns, Dossier 3 columns, Restrictions logic + evidence side; takeovers use full width |
| Supports as mini-pages | Fact columns / margin notes / consequence lines only |
| Fake route geometry | None in final screenshots; residual reference spurs labelled «referência, não calculado» |
| Typographic contrast | Labels ≥ 11 px on `#5b6761`; mono for IDs, plate styling, tabular times |
| Provenance | Every manual/assumed/simulated value carries its line |
| Driver/Truck mirroring | Different geometry (time axis vs elevation); remove-the-title contact sheet passes |
| Map prominence | Driver corridor narrowed to 34 %; Documents no map; caption explains each map |

## Known limits / next

- Motion was reviewed structurally (instrument rise on lead transfer, pending bar, unchanged map choreography) but captures ran with reduced motion; a real-time motion pass is still due.
- Fleet dots on the base map are unlabelled; hover/selection linking from Attention rows to dots not yet built.
- Driver/Truck/Customer anchors, URL state, search, dark mode: not built; the strip and rail leave room for them.
- `GuidedSurfaces.tsx` / `ProductSurfaces.tsx` are now mostly superseded (StationDetail and FutureSurface still used); 5.7A–D files remain unused. Clean-up candidate.
- Plan is reserved (rail slot, comparative-axis language in the decision grid) but not implemented.
