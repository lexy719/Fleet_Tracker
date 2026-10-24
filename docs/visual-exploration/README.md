# FleetOS — Detached visual exploration (7 out 2026)

73 composition studies (59 new + 14 picked from the environment lab), each judged KEEP / MAYBE / REJECT.
Nothing in `src/` was touched.

- `FleetOS-Visual-Exploration.pdf`: 100-page A4 landscape pack (contact sheets, one page per study, top 10, patterns, domains, primitives, galleries)
- `studies/*.png`: every study at 1600×1000 (O-, D-, V-, R-, X-, F- = new; E- = existing lab states)
- `kit/`: generator. `node prep-geo.mjs` (geometry from fixtures), `node build.mjs [ID]` (render), `node report.mjs` (HTML + PDF). `rejudge.py` holds the second, harsher verdict pass; `existing.mjs` holds the E-series judgements.

Result: 15 KEEP · 31 MAYBE · 27 REJECT.
Top 10: R-02, D-05, V-01, X-01, R-03, O-09, D-01, X-03, V-06, O-05.
