# Phase 5.7 — Step 2: continuous composition + real TomTom map

Review entry: `http://localhost:5173/__dev/fleetos-environment` (development only).

## Delivered

The lab now uses a continuous composition solver, rather than a collection of fixed rectangles. Open **Explorar composição** to edit 19 numeric parameters through sliders or numeric fields, plus visibility and easing. Geometry, reserved space, directional surface pressure, horizontal/vertical bias, margin, radius, dominance, density and motion are independent inputs. The actual bounded geometry is displayed below the controls.

**Aleatório** produces a reproducible bounded combination. **Ciclo aleatório** runs 32 samples. **Ciclo de stress** runs three passes through eight contrasting envelopes, varying the intermediate compositions on each pass: large centered, small floating upper-right, wide bottom, tall left, dominant, tiny contextual, hidden and base. These are stress generators, not the layout implementation. **Parar** stops either cycle; **Restaurar base** restores the known composition without resetting the camera.

The canvas stays empty. The only map overlays are two synthetic geometry markers and a dashed reference line. No operational data, fake cards or business actions were added.

## Architecture and constraints

- `composition.ts`: pure solver, bounded variables, deterministic generation and separate semantic policy. Future `JOB_FOCUS`, `DRIVER_FOCUS`, `FUEL_CONTEXT`, `DOCUMENT_TAKEOVER` intents already accept continuous values; the DEV UI only exposes generic intent labels.
- Requested width/height and X/Y are viewport proportions. Density gently scales the footprint and breathing room. Dominance blends toward the available region. Reservations and pressures share finite directional budgets.
- Desktop minimum map surface: 240 × 180 px. Position and size are clamped inside the canvas frame. Rail and DEV instruments retain usable space. Smaller viewports relax the minimum to the physically available frame.
- `EnvironmentMap.tsx`: one mounted MapLibre renderer using the installed FleetOS map library and existing TomTom configuration. The default lab style uses real TomTom vector tiles. Missing credentials and provider errors have explicit states; no mock or alternative-provider fallback.
- Layout changes do not recreate the renderer or reset its camera. Hidden maps remain mounted with a positive size, and become inert and inaccessible until shown.
- CSS interpolates position, size, radius and opacity. ResizeObserver deduplicates pixel sizes and calls the public MapLibre `resize()` and synchronous `redraw()` before paint. Default motion is 320 ms; 0–800 ms and four easing curves are available.
- System reduced-motion preference is observed live; the DEV override exercises the same zero-duration layout and camera path.
- The ref exposes fitBounds, center/zoom/pitch/bearing through setCamera, panBy, zoomTo, getCamera and resize. Layout state has no camera state dependency.
- All lab state is local. The entry remains outside production providers, uses no operational storage and is eliminated from the production build.

TomTom's [MapLibre integration documentation](https://docs.tomtom.com/map-maker/documentation/cloud-styles/using-style-in-the-application) and [map style API documentation](https://docs.tomtom.com/map-display-api/documentation/tomtom-maps/v2/mapstyles/map-styles) support this integration approach.

## Browser acceptance — actually exercised

| Check | Result |
| --- | --- |
| Desktop sizes | 1440 × 900 and 1920 × 1080 |
| Continuous explorer | All 19 numeric inputs, range keyboard interaction, visibility, four generic intents and four easing options exercised |
| Automatic stress | 24 samples at each size: six complete aggressive transition sequences total |
| Automatic random cycle | 32 samples at each size |
| Recorded geometry checks | 144 checks, 129 distinct viewport/rectangle combinations |
| Persistent map | Same DOM instance identifier `2` throughout both sizes and all final acceptance interactions |
| Camera preservation | Unchanged throughout the recorded layout-only cycles |
| Pan and zoom | Six contrasting geometries at each desktop size: 12 successful checks, plus zoom after hidden/restore |
| Reference placement | Maximum measured marker error on either axis in the 12 pan/zoom checks: 0.407 px |
| Extreme conflicts | All reservations at 45% and all directional pressures at 100% still produced a bounded 240 × 180 map |
| Restoration | Base repeatedly reproduced the same rectangle; hidden/restore retained the map and camera |
| Camera actions | Fit reference and reset camera both exercised; reference visibility toggled |
| Motion | Intermediate 800 ms transition captured with live tiles; reduced-motion produced zero-duration CSS transitions |
| Overflow and rendering | No horizontal overflow or observed white flashes/tile corruption; native canvas matched the host at settled checks |
| Errors | Zero map errors and no captured browser warnings/errors during final acceptance |
| Cycle controls | Start, automatic completion, stop and restoration exercised |

The DOM inspector can force layout before ResizeObserver runs during an active transition; an instantaneous pre-paint measurement is not a rendered-frame assertion. Settled measurements and intermediate screenshots were checked separately. This is browser acceptance on this machine, not a frame-by-frame performance benchmark across all hardware. Native pan/zoom and the ref-based camera actions were tested; pitch/bearing are supported by the typed API but were not separately exercised interactively. The system preference subscription was inspected; reduced motion was exercised with the DEV override.

Evidence files in the task workspace:

- `FleetOS-continuous-browser-evidence.json`: geometry checks and pan/zoom measurements (contains no API credential).
- `FleetOS-continuous-base-1440.jpg`: base composition with explorer closed.
- `FleetOS-continuous-explorer-1920.jpg`: floating composition with explorer open.
- `FleetOS-continuous-motion-1920.jpg`: intermediate transition frame.

## Project verification

Typecheck, lint and production build passed. The production assets contain none of the lab route, map-surface marker or explorer text. The existing map vendor chunk still triggers the existing size warning.

Full test suite passed: **50 files, 1,287 tests**, including six new composition tests covering 2,000 combinations across four viewport sizes, conflicting surface budgets, future semantic policies and sub-pixel continuity. Run duration: 110.76 seconds.

This step stops at the composition foundation for visual review.
