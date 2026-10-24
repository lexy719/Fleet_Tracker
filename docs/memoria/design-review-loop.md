---
name: design-review-loop
description: "How design work is reviewed before the founder sees it — two reviewer agents (finish + motion) that must both score ≥8, local .dc.html renderer, Claude Design canvas"
metadata:
  node_type: memory
  type: reference
  originSessionId: ad5491a4-dffa-44db-83c9-02877e7fb9f6
  modified: 2026-10-22T17:47:32.908Z
---

Loop set up 2026-10-21, tuned 2026-10-22 from the user's answers:

**Two reviewers, both must approve at 8/10 or above.**
- **`design-reviewer`:** beauty and finish.
- **`design-reviewer-motion`:** life and motion. Give it filmstrips or frame sequences, not only stills.
- Both live in `.claude/agents/` in the repo, are read-only, and carry the founder's brief.
- If either scores below 8: I fix it myself and re-run. The user only sees approved work.

**The user's answers built into the reviewers:**
- **Users:** a dispatcher on a big monitor (density OK) and an owner on a laptop (must get it at a glance).
- **Bar:** Linear / Arc / Raycast, Tesla's car screen, strategy/simulation games. Apple Maps was not picked.
- **Strict on:** beauty/finish and life/motion.
- **Instant reject:** looks like a report or table, generic SaaS dashboard, too much text. "Covering the map" was not picked as a reject.
- **Theme:** show both dark and light.
- **Notifications:** born on the map where the thing happens, with a pulse; for important ones the camera flies there.
- **Tap a driver or route:** the camera flies there, then follows the truck (chase cam).

**Tools:**
- Claude Design canvas "FleetOS mapa vivo": https://claude.ai/artifact/RTTziSsyymSDngEDT3dvAH. Boards live in scratchpad `canvas1/project/`.
- Local render: `canvas1/project/support.js` shim (never publish it) and `dcshot.mjs`, on headless Chrome port 9333.
- Real 3D map plates: scratchpad `capreal.mjs` drives the Studio's MapLibre. maxPitch is 60; wait for idle before capturing.

**Lessons from the /v2 rounds (2026-10-22):**
- **Scores:** motion reached 8 by round 5. Finish stalled at 7 for rounds 4–8, raising finer defects each round. After ~3 flat rounds, ask the user whether to show; they chose "Mostra já".
- **Demo data follows the real clock, backend included.** Pinning the browser Date (`capv2live.mjs` addScriptToEvaluateOnNewDocument) does not keep a scenario: Rui's late case disappeared by about 18:00.
- **MapLibre traps:**
  - A whitespace-only `text-field` has no collision box. Keep-outs must be transparent `icon-image`s.
  - The terrain mesh hides draped routes behind buildings and blanks flights. It was removed; relief is now hillshade only.
  - TomTom tiles carry no buildings in most towns, so use OpenFreeMap OSM `building` extrusions.

Related: [[design-v2-direction]], [[skills-audit]]
