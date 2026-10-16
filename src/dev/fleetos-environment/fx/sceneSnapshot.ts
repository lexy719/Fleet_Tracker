import type { CSSProperties } from "react";

export type ObjectSnapshot = {
  objects: Map<string, { rect: CSSProperties }>;
  lead: CSSProperties | null;
};

/** Capture on-screen geometry, not the last authored target. No cloned
 * instruments, hidden arriving labels or orphaned animation timers.
 */
export function snapshotObjects(root: HTMLElement | null): ObjectSnapshot {
  const objects: ObjectSnapshot["objects"] = new Map();
  let lead: CSSProperties | null = null;
  if (!root) return { objects, lead };
  const bounds = root.getBoundingClientRect();
  root
    .querySelectorAll<HTMLElement>("[data-object], [data-scene-key]")
    .forEach((el) => {
      if (el.closest('[data-visible="false"], [aria-hidden="true"]')) return;
      const rect = el.getBoundingClientRect();
      if (
        rect.width < 2 ||
        rect.height < 2 ||
        rect.bottom < 0 ||
        rect.top > innerHeight
      )
        return;
      const geometry = {
        left: rect.left - bounds.left,
        top: rect.top - bounds.top,
        width: rect.width,
        height: rect.height,
      };
      const key = el.dataset.sceneKey ?? el.dataset.object!;
      if (!objects.has(key)) objects.set(key, { rect: geometry });
      if (el.dataset.role === "lead" || el.dataset.lead === "true")
        lead ??= geometry;
    });
  return { objects, lead };
}
