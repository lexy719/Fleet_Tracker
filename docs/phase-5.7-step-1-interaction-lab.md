# Phase 5.7 — Interaction Lab, Step 1

## Open locally

Start the existing development server and open
`http://localhost:5173/__dev/fleetos-environment` directly.

The initial composition contains an off-white canvas, a central neutral map and
a compact left control rail. The five context controls are accessible inactive
placeholders. Their labels appear on hover or keyboard focus. There are no
jobs, statistics, operational panels, focus modes or packing behavior.

## Isolation and foundation

- The entry is guarded by `import.meta.env.DEV` and lazy-loaded from `main.tsx`.
  It mounts outside the operational, ingestion, settings and theme providers.
  It does not initialize application stores or write user data.
- Production keeps the original router/provider tree. No navigation link to
  this lab was added. Production build assets contain neither the lab route
  nor its styles/components.
- `composition.ts` separates map placement/visibility from camera/padding.
  The canvas uses positioned surfaces rather than fixed dashboard columns.
- The MapLibre instance survives placement changes. A ResizeObserver coalesces
  explicit `map.resize()` calls with requestAnimationFrame, without refitting
  the camera. Cleanup removes the observer, pending frame and map.
- Scoped motion tokens provide transform/opacity transitions. Geometry changes
  are not animated through width/height. Reduced motion disables transitions
  and map tile fading. The basemap requires internet access and uses public
  CARTO/OpenStreetMap data, without operational locations or API credentials.

## Browser acceptance

| Viewport | Map surface | Whitespace each side | Horizontal overflow |
| --- | --- | --- | --- |
| 1440 × 900 | 892.8 × 558 | 273.6 px | None |
| 1920 × 1080 | 1050 × 669.6 | 435 px | None |

Both compositions were inspected visually and captured for review.

Optional DEV instrumentation at `?inspect=1` exposes only width/height fields.
Browser test: 760 × 480 → 1000 × 620 → 640 × 420. Map instance remained `2`;
resize count advanced from `2` to `4` to `6`. Canvas and host dimensions matched
after each change; map remained ready, with no console errors.

Existing UI smoke checks covered Work tabs, Dispatch opening J-4198's planning
panel, Fleet, Drivers, Documents, Compliance, Intelligence, Settings and
Overview. No resource assignment, document issuance or destructive action was
performed. No console errors were captured during these checks.

Validation passed: `npm run typecheck`, `npm run lint`, `npm run build`,
`npx vitest run --maxWorkers=1` (49 files, 1281 tests) and `git diff --check`.
The build retains its existing vendor-size warning; the lab is excluded.

Step 1 stops here. Operational contexts and dynamic workspace behavior await
review of this base composition.
