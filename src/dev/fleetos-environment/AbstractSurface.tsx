import type { Bounds, SurfaceAllocation } from "./workspaceGeometry";
import { useLayoutEffect, useRef, useState } from "react";

/** A geometry proof only: no cards, domain content or operational interactions. */
export function AbstractSurface({
  id,
  allocation,
  fallback,
}: {
  id: string;
  allocation?: SurfaceAllocation;
  fallback: Bounds;
}) {
  const surface = useRef<HTMLElement>(null);
  const [lastBounds, setLastBounds] = useState(fallback);
  const visible = Boolean(allocation?.bounds),
    bounds = allocation?.bounds ?? lastBounds;
  const allocatedX = allocation?.bounds?.x,
    allocatedY = allocation?.bounds?.y,
    allocatedWidth = allocation?.bounds?.width,
    allocatedHeight = allocation?.bounds?.height;
  useLayoutEffect(() => {
    if (
      allocatedX !== undefined &&
      allocatedY !== undefined &&
      allocatedWidth !== undefined &&
      allocatedHeight !== undefined
    )
      setLastBounds({
        x: allocatedX,
        y: allocatedY,
        width: allocatedWidth,
        height: allocatedHeight,
      });
  }, [allocatedX, allocatedY, allocatedWidth, allocatedHeight]);
  function checkSettled() {
    const element = surface.current;
    if (!element) return;
    const actual = element.getBoundingClientRect();
    element.dataset.surfaceMoving = String(
      Math.abs(actual.x - bounds.x) > 1 ||
        Math.abs(actual.y - bounds.y) > 1 ||
        Math.abs(actual.width - bounds.width) > 1 ||
        Math.abs(actual.height - bounds.height) > 1 ||
        Math.abs(
          Number(getComputedStyle(element).opacity) - (visible ? 1 : 0),
        ) > 0.01,
    );
  }
  useLayoutEffect(() => {
    checkSettled();
    const frame = requestAnimationFrame(checkSettled);
    return () => cancelAnimationFrame(frame);
  });
  return (
    <section
      ref={surface}
      className="environment-abstract-surface"
      aria-label={`DEV · ${id}`}
      aria-hidden={!visible}
      inert={!visible}
      data-surface-id={id}
      data-surface-status={allocation?.status ?? "inactive"}
      data-visible={visible}
      onTransitionEnd={checkSettled}
      onTransitionCancel={checkSettled}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height),
        opacity: visible ? 1 : 0,
      }}
    >
      <span>{id}</span>
      <small>
        {allocation?.status} · {Math.round(bounds.width)} ×{" "}
        {Math.round(bounds.height)}
      </small>
    </section>
  );
}
