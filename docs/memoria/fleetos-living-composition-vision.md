---
name: fleetos-living-composition-vision
description: User's core vision for the FleetOS frontend engine (2026-10-17) — screens are composed, not designed; every thing has "a thousand forms"
metadata:
  type: project
---

Vision confirmed by the user on 2026-10-17 after several misses: the frontend engine is NOT "a menu that resizes" or "a map that resizes". The screen is composed every moment from **things** (truck, driver, fuel, job, stop, pump, customer, money, time, place) × **forms** (each thing has "mil e uma formas": dot, number, line on a time/km axis, card, full sheet, satellite close-up, receipt…) × **compositions** (overview, focus, comparison, flow, story, headline) × **moment**. Questions (a click, a search, an event: "o que se passa?", "e este camião?", "e se?", "o que vem a seguir?", "como correu?") recompose the canvas → hundreds of distinct screens nobody designed, same visual language. Alive = continuity (an object morphs into its next form), breathing time, attention pulled by events, anticipation, temperament (calm day sparse, crisis dense), scale (country→pump, week→hour). Memory/learning the user's habits = good idea, not required at first.

User's way of working: "trabalhamos com a ideia" — talk at the level of the idea, not precise UI specs; never answer with small literal changes (resize menu/map). Keep current visual language (boxes, colours). Never put big panels over the map. Proposals must show motion/variety (video/reel), not static full-screen mockups.

2026-10-18 clarification: "vivo" = the environment is never the same screen — it reshapes itself (grows, shrinks, re-presents information in many forms) so the office worker never navigates pages; NOT decorative motion. Never add idle "breathing"/drift; nothing moves without a cause (a click, an event, time crossing a threshold), then it settles still. It is an operational transport tool. Prototypes so far in docs/engine-mockups (living.html presences, field.html attention-field engine); agreed direction: apply to the real Studio in phases (engine under current UI → open transport splits into related blocks → lenses share space by energy → events pull → map follows attention).

2026-10-18 research report reports/Interface operacional viva FleetOS.md (notes in research_notes/): evidence says moving things costs ~8% speed and control; no fleet/control-room product self-reorganises; success = stable anchors + form/size/emphasis change in place + "echo, don't move" + every change has a recorded cause (testable invariant) + deterministic composer (interest = a-priori importance − graph distance to focus) + form ladder with hysteresis/dwell/attention budget + why/pin/undo/freeze + Wizard-of-Oz test with dispatchers before ML. Fixed map canvas, animate camera padding, never resize per frame.

**How to apply:** design the engine as a grammar (things × forms × compositions), start from forms per thing; reuse winning forms from docs/visual-exploration (day-as-road, km×time string chart, decision fork, receipts, latitude metro). Avoid truck drawings (user dislikes). Related: [[fleetos-studio]], [[fleetos-design-taste]], [[studio-keep-design-consult]]
