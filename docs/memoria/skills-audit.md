---
name: skills-audit
description: "2026-10-21 audit of ~/.claude/skills — which design skills fit FleetOS, which were archived and why"
metadata:
  node_type: memory
  type: reference
  originSessionId: ad5491a4-dffa-44db-83c9-02877e7fb9f6
  modified: 2026-10-21T22:30:36.631Z
---

The user asked me to check the installed skills and remove the bad ones (2026-10-21). I moved 7 to `~/.claude/skills-removed-2026-10-21/` (reversible, not deleted):
- **No image-generation tool here:** image-to-code (also written for Codex), imagegen-frontend-web, imagegen-frontend-mobile, brandkit.
- **Downloads remote skills through `npx` at run time:** ui-skills-root.
- **Duplicate of taste-skill v2:** taste-skill-v1.
- **Written for Google Stitch, mandates perpetual micro-motion:** stitch-skill.

**Fit for FleetOS (operational palcos):**
- **Use:** redesign-existing-projects (audit first), design-taste-frontend (dashboard dials), minimalist-ui (closest to paper/ink), fixing-motion-performance, fixing-accessibility.
- **Use the rules, not the stack:** baseline-ui. It assumes Tailwind + motion/react, but the Studio is vanilla CSS.
- **Landing-page skills — not for the Studio, kept for the user's websites:** high-end-visual-design (soft-skill), gpt-taste, web-designer, conversion-copywriter, fixing-metadata. They push glass, py-24 whitespace and scroll reveals.
- **Watch out:** brainstorming's hard gate commits spec docs to git, which conflicts with the "no commits unless asked" rule.

**Second pass (same day):** at the user's request I also archived soft-skill, gpt-tasteskill, web-designer, conversion-copywriter, fixing-metadata, product-builder, brutalist-skill and output-skill. 27 skills remain: the design kit above plus the workflow and caveman skills. Hard deletion is the user's call: they can empty the archive folder themselves.

Related: [[fleetos-design-taste]], [[show-before-build]]
