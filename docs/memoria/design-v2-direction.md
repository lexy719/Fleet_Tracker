---
name: design-v2-direction
description: "User's answers 2026-10-21 that define FleetOS design v2 — the current palcos are not good; cinematic, alive, Apple Maps 3D; system first, then pages"
metadata:
  node_type: memory
  type: project
  originSessionId: ad5491a4-dffa-44db-83c9-02877e7fb9f6
  modified: 2026-10-22T10:38:51.316Z
---

On 2026-10-21 the user said all the palcos I built are not good. Their answers, given through questions (they work better when I ask, and I had asked almost nothing):
- **What fails:** the palcos look like reports, are static and lifeless, feel disconnected from the map, and carry too much information.
- **Motion:** cinematic.
- **Feel:** a mix of Apple Maps 3D and a cinematic website. Above all, a site that constantly feels alive: the person working is always one click from everything because the page keeps changing. No closing pages, no searching tables.
- **Map vs palco:** the palco still takes the whole page, with a strong bridge. Everything on screen flies from where it was on the map and goes back there on leaving.
- **One click:** everything is tappable and opens its scene in place. Events come to the user (a truck runs late → the scene reorganises and puts it in front). Esc / back is an animation; nothing is ever "closed".
- **Light:** follows the real hour (day light, golden evening, night with the roads lit).
- **Process:** both tools. Claude Design gives the visual direction, starting with the main map page. Then code plus reviewer agents: a separate agent oversees the work before the user sees it. Build the system first, then the pages, to avoid redesigning 10–20 times.

**Correction (2026-10-22):** the user does NOT care about:
- time-of-day lighting ("if it's evening it needs to be yellow — fuck that");
- real-life data in design mockups.

What they DO care about:
- the map being good and actually 3D;
- the sidebar being beautiful;
- notifications being dynamic;
- auto-zoom when you click a driver or a route.

Don't spend effort on light per hour or on pulling real data into mockups.

**How to apply:**
- Ask the user questions at each decision (AskUserQuestion, multiple choice).
- Never present work that hasn't passed the reviewer.
- This overrides the "report-like" timeline palcos in [[palcos-architecture]]; that file's structure still holds: categories, variations, links.
- Related: [[palco-full-page]], [[skills-audit]].

**Camera verdict, 2026-10-22, after seeing /v2:**
- **Overview:** must be top-down (pitch 0, north up). The tilted overview was "horrível", "like reading a book page".
- **Medium zoom (visit):** OK but "um bocadinho mais de cima", now pitch 42.
- **Close follow with 3D buildings:** LOVED.
- **Dark and light themes:** both OK.
- **Sidebar:** can get "more alive" later; not the priority.
- **Not important:** issues that come from the real backend data (scenarios, stale events). The page is front-end.
- **Video:** allowed now. Use CDP Page.startScreencast plus an ffmpeg concat with real timestamps (`scratchpad/video.mjs`, about 36 fps).

**Sidebar rejected, 2026-10-22.** "Nothing fixed but the map."
- **Replacement:** a floating category dock (Motoristas, Rotas, …).
- **Motoristas:** pins on the map. Tap a pin → 3D zoom on that driver plus a floating card (state, fuel, driving hours, ETA).
- **Rotas:** pins and lines. Tap a route → the whole route in 3D from a little above, start to end. Free pan and zoom; a route card.
- **Mockups:** scratchpad `mk/mock.html` over real map backgrounds from `capmock.mjs`. Awaiting the user's verdict.

**Built 2026-10-22 in /v2 (LiveMap.tsx):**
- **Shell:** the sidebar is gone. A brand chip, a passing toast and a back pill, plus the dock (Motoristas, Rotas, Camiões→garagem, Alertas, Palcos popover).
- **Drivers mode:** hides the lines and shows free-driver pins. A followed truck carries a state card (stopped = ring of minutes, driving = ring of speed).
- **Routes mode:** name labels on the lines. Tapping one frames the whole route at pitch 44, with "Partida" and "Chegada" stubs and a live strip.
- **Base map:** OSM (OpenFreeMap liberty).
- **Tour video:** `scratchpad/video2.mjs`.
- **Not yet reviewer-gated.**

**2026-10-23, the founder rejects simplification.** I argued for "stable lenses, ranked lists, less motion"; they disagreed.
- **The bar:** "complex, beautiful AND alive".
- **The only thing they like:** the Motoristas tap, which expands into a live, state-shaped model. Everything else is "ridiculously simple".

**How to apply:**
- Never propose simplifying.
- Give every object (truck, yard, route, alert, stop) its own expanding, live, state-shaped model at the richness of the driver card.
- A category toggle must transform the scene; "uns pings" = fail.
