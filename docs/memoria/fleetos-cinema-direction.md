---
name: fleetos-cinema-direction
description: "2026-10-18 FIRST direction the user loved (\"first fucking thing I liked\") — /combinar cinematic scenes in the real Studio"
metadata:
  node_type: memory
  type: project
  originSessionId: ad5491a4-dffa-44db-83c9-02877e7fb9f6
  modified: 2026-10-19T22:47:40.824Z
---

After ~10 rejected rounds (cards, panels, treemaps, animatics, path columns), the user loved `/combinar` (src/studio/Combo.tsx + StageMap `shot`/`scene` props + `.cn-*` CSS): full-screen map + tiny category bar (Motoristas, Transportes); each COMBINATION of switched-on categories is a different cinematic SHOT — the whole screen changes "like watching a film":
- camera flyTo with pitch/bearing per scene (map 0/0, drivers 56°/-18°, jobs 50°/24°, both 44°/10°), map canvas tone filter per scene (desaturate),
- huge film-title lower-third (104px) + cast/reel strip on a bottom scrim, drivers "standing" on the map (stem + label),
- both on → split screen: map pushed left, "Quem leva o quê" credits panel slides in from the right (SPLIT_W 600),
- scene exit (blur/fade up) then enter (staggered blur-in), driven by sceneOf(combo).
User: "needs a lot more but this view is a great start". Known gaps: routes washed out by tone filter in jobs scene; only 2 categories.

Video capture recipe that worked: headless Chrome + window.__slow=12 (map flyTo/route-growth durations ×slow) + CDP Animation.setPlaybackRate(1/12) + Page.startScreencast frames with timestamps → ffmpeg concat with durations/12 (scratchpad cap20.mjs). Always ffprobe the duration before sending.

2026-10-19 multi-STAGE idea liked: engine picks the stage (palco) from what you touch. In the idea reel (docs/engine-mockups/palcos-ideias.mp4) one object (driver/truck/job) morphs between stages: mundo (map) → pessoa → tempo (lanes) → mundo (route) → dinheiro (euro bar) → comparação (columns) → mesa (papers). The user liked the concept and the morphing. The content of each stage is still basic, which the user accepts as layout/motion only. More stages are welcome ("não temos que ficar por aqui"). The map is just one stage, not the default container.

2026-10-19 `/mapa` (src/studio/Layers.tsx + SceneStage in Combo.tsx) = first-video look with the map in COLOUR (`colour` prop on StageMap: no wash, no ink gesture). Categories Motoristas/Rotas/Combustível (keys M/R/C) add up: Rotas alone = lines only (no truck pins); fuel = stop ping + "Combustível" reel. The user says the combined scenes (split "Quem leva o quê" for M+R, M+R+C) are too simple. Each combined scene needs its own palco later; not now.

2026-10-19 "O dia" (src/studio/Day.tsx) was LOVED ("adorei"). It is the full-page palco for Motoristas + Rotas in /mapa, opened by pressing Rotas. The map steps back and the category bar hides; Esc or the "Mapa" crumb goes back. Each trip is a line: hairline past, thick ink driving, dotted pause, a node at the arrival, a bracket for the client's window. Late = red line, waiting = amber dots. Free and finished people are a row at the bottom. Next goal set by the user: give it functionality and motion (it must let you DO things).

**How to apply:** build further in THIS direction (whole-screen shot changes, camera as storyteller, typography as film titles); never go back to cards/lists-growing. Related: [[fleetos-living-composition-vision]], [[fleetos-studio]]
