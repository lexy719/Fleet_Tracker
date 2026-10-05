# Synthetic ingestion fixtures (development only)

**These files are NOT official data.** They exist only to prove, in a development
browser, the path

structured event → CandidateConstraint → trust gate / human review → RoadConstraint →
re-evaluation of an already planned job (on its saved route).

- Served only by the Vite **dev** server (`vite.config.ts`, plugin
  `fleetos-dev-ingestion-fixtures`, `apply: "serve"`) at `/__dev/ingestion/<file>`.
  Not part of `public/`, not in production builds, not served by `vite preview`.
- Registered as `DEV_SOURCES` in `src/ingestion/sources.ts` (`synthetic: true`), and
  only used when the "fontes de TESTE SINTÉTICO" toggle on the Road Intelligence page
  is switched on (development builds only).
- Everything derived from them is labelled «TESTE SINTÉTICO» and can never produce a
  verified violation (`legalStatus` INTERPRETED ⇒ at most POTENTIALLY_AFFECTED).

Files:

- `synthetic-datex-closure.xml`: DATEX II v3 `roadClosed` with a linear geometry
  (automatic gate path).
- `synthetic-ip-point-event.json`: IP ArcGIS-style point event with a closure described
  only in prose (REVIEW_REQUIRED → human review path).

Coordinates follow routes saved during the 2026-09-30 acceptance run (J-4201, J-4203).
To reproduce with other routes, replace the coordinates.

Phase 3C (route-driven discovery + clean-route solver):

- `discovery-search-results.json`: results returned by the development-only search
  provider (`dev-fixture-search`). Mixes synthetic "official" hits on the reserved
  domain `fleetos-dev-fixtures.invalid` with non-authoritative pages (one containing a
  prompt-injection attempt). Official structured hits become *source proposals* that must
  be validated before ingestion; nothing here is ever evidence by itself.
- `synthetic-a1-closure.xml`: DATEX II `roadClosed` on ~3 km of the A1 near Mealhada /
  Cantanhede, taken from a real TomTom route Vieira do Minho → Faro (fastest strategy).
  Used by the demo job J-DEMO-3C once its proposal is validated.

Freshness (Phase 3C.5 close-out): `synthetic-a1-closure.xml` carries a fixed DATEX
`publicationTime`. A validated discovery proposal declares a 15-min cadence, so the feed
becomes STALE 6 h after that time and the trust gate demotes its closures to
`ACTIVE_SCREENING_ONLY` (UNKNOWN, never avoided, never green) — this is intended behaviour.
For an acceptance demo with active closures, set `publicationTime` to a recent instant
(last set to 2026-10-01T09:45:00Z) and re-query the source.
