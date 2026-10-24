// Shared-element transitions: an element keeps its identity (data-flip="key") across
// renders, so the thing you clicked visibly becomes its new representation.
// Rects are read from the *visual* position, so a new input mid-flight retargets
// from wherever the element currently is instead of queuing a stale animation.

const rects = new Map<string, DOMRect>();
const EASE = "cubic-bezier(.2,.8,.2,1)";
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function captureFlip() {
  rects.clear();
  document.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width) rects.set(el.dataset.flip!, r);
  });
}

export function playFlip(duration = 560) {
  if (!rects.size) return;
  const motion = !reduced();
  document.querySelectorAll<HTMLElement>("[data-flip],[data-flip-enter]").forEach((el) => {
    const from = el.dataset.flip ? rects.get(el.dataset.flip) : undefined;
    el.getAnimations().forEach((a) => a.cancel());
    const to = el.getBoundingClientRect();
    if (!to.width) return;
    if (!from) {
      // Newcomer: arrives softly after the shared objects begin moving.
      if (el.dataset.flipEnter != null)
        el.animate(
          [
            { opacity: 0, transform: motion ? "translateY(8px)" : "none" },
            { opacity: 1, transform: "none" },
          ],
          { duration: motion ? 380 : 120, delay: motion ? Number(el.dataset.flipEnter) || 140 : 0, easing: EASE, fill: "backwards" },
        );
      return;
    }
    if (!motion) return;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (el.dataset.flipMode === "box") {
      const sx = from.width / to.width;
      const sy = from.height / to.height;
      el.animate(
        [
          { transformOrigin: "0 0", transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})` },
          { transformOrigin: "0 0", transform: "none" },
        ],
        { duration, easing: EASE },
      );
    } else {
      const s = from.height / to.height;
      el.animate(
        [
          { transformOrigin: "0 0", transform: `translate(${dx}px,${dy}px) scale(${s})` },
          { transformOrigin: "0 0", transform: "none" },
        ],
        { duration, easing: EASE },
      );
    }
  });
  rects.clear();
}
