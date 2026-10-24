---
name: reviewers-learn-founder
description: "After EVERY piece of design feedback from the founder, append it to .claude/founder-taste.md so both reviewer agents judge more like them"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ad5491a4-dffa-44db-83c9-02877e7fb9f6
  modified: 2026-10-22T18:07:21.903Z
---

**Rule:** after every design instruction or verdict from the user, append it (dated, newest first, as loves / rejects / wants) to `.claude/founder-taste.md` in the repo, then continue the work.

**Why:** on 2026-10-22 the user asked that "with every edit or instruction update" the reviewer gets smarter and "more like me". Both `.claude/agents/design-reviewer*.md` were told to read that log first; it overrides their briefs.

**How to apply:**
- Update the log BEFORE running the reviewers on the next round.
- Keep the user's own words where they are vivid ("horrível, like reading a book page").
- Fix brief text that the log contradicts, as was done for the sidebar and the pitched overview.

Related: [[design-review-loop]], [[design-v2-direction]]
