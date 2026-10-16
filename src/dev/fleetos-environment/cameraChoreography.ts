import type { Map as LibreMap } from "maplibre-gl";
import type { MapCamera, Easing, CameraTarget } from "./mapTypes";
import {
  interpolateCamera,
  motionProgress,
  SYNTHETIC_DRIVER,
  SYNTHETIC_ROUTE,
  SYNTHETIC_SEGMENT,
} from "./mapMotion";
export function readCamera(map: LibreMap): MapCamera {
  const p = map.getPadding(),
    c = map.getCenter();
  return {
    center: [c.lng, c.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    padding: {
      top: p.top ?? 0,
      right: p.right ?? 0,
      bottom: p.bottom ?? 0,
      left: p.left ?? 0,
    },
  };
}
function destination(map: LibreMap, target: CameraTarget): MapCamera {
  if (target.kind === "restore") return target.camera;
  const domain =
      target.kind === "focus"
        ? target.domain
        : target.kind === "scene"
          ? "Jobs"
          : target.mode === "DRIVER_LOCAL"
            ? "Drivers"
            : target.mode === "TRUCK_LOCAL"
              ? "Trucks"
              : target.mode === "RESTRICTION_SEGMENT"
                ? "Restrictions"
                : target.mode === "HIDDEN"
                  ? "Documents"
                  : "Jobs",
    padding = {
      top: 0,
      right: target.kind === "mode" ? (target.insetRight ?? 0) : 0,
      bottom: 0,
      left: 0,
    };
  if (domain === "Documents") return readCamera(map);
  if (domain === "Drivers" || domain === "Trucks")
    return {
      center: SYNTHETIC_DRIVER,
      zoom: domain === "Drivers" ? 12.4 : 10.2,
      bearing: domain === "Drivers" ? 24 : 12,
      pitch: domain === "Drivers" ? 42 : 24,
      padding,
    };
  const points =
    target.kind === "scene"
      ? target.points
      : domain === "Restrictions"
        ? SYNTHETIC_SEGMENT
        : SYNTHETIC_ROUTE;
  if (points.length < 2) return { ...readCamera(map), padding };
  const box: [[number, number], [number, number]] = [
    [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
    ],
    [
      Math.max(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])),
    ],
  ];
  const container = map.getContainer();
  const pad = Math.min(
    52,
    container.clientWidth * 0.14,
    container.clientHeight * 0.14,
  );
  const fit = map.cameraForBounds(box, {
    bearing:
      target.kind === "scene"
        ? (target.bearing ?? 0)
        : target.kind === "mode" && target.mode === "ROUTE_CORRIDOR_HORIZONTAL"
          ? 68
          : 0,
    padding: {
      top: Math.min(100, container.clientHeight * 0.28) + (target.kind === "scene" ? (target.inset?.top ?? 0) : 0),
      bottom: pad + (target.kind === "scene" ? (target.inset?.bottom ?? 0) : 0),
      left: pad + (target.kind === "scene" ? (target.inset?.left ?? 0) : 0),
      // The live transform already reserves the overlay through camera padding.
      // Add only the normal route margin here, or the panel is counted twice.
      right: pad + (target.kind === "scene" ? (target.inset?.right ?? 0) : 0),
    },
    maxZoom:
      target.kind === "scene"
        ? (target.maxZoom ?? 8)
        : domain === "Restrictions"
          ? 10
          : target.kind === "mode" && target.mode === "CONTEXTUAL_MINIMAP"
            ? 6.5
            : 8,
  });
  const center = fit?.center;
  const lngLat = Array.isArray(center)
    ? center
    : center && "lng" in center
      ? [center.lng, center.lat]
      : SYNTHETIC_DRIVER;
  return {
    center: [lngLat[0], lngLat[1]],
    zoom: fit?.zoom ?? 7,
    bearing:
      target.kind === "scene"
        ? (target.bearing ?? 0)
        : target.kind === "mode" && target.mode === "ROUTE_CORRIDOR_HORIZONTAL"
          ? 68
          : 0,
    pitch:
      target.kind === "scene"
        ? (target.pitch ?? 0)
        : target.kind === "mode" && target.mode === "LARGE_SPATIAL"
          ? 18
          : 0,
    padding,
  };
}
/** Re-fit against the live container every frame: no late camera correction after CSS resize. */
export function createCameraChoreography(map: LibreMap, host: HTMLElement) {
  let frame = 0,
    generation = 0;
  let activeTarget: CameraTarget | null = null;
  function stop() {
    generation++;
    activeTarget = null;
    cancelAnimationFrame(frame);
    host.dataset.cameraChoreography = "false";
    map.stop();
  }
  function run(
    target: CameraTarget,
    duration: number,
    easing: Easing = "controlled",
  ) {
    stop();
    activeTarget = target;
    const token = generation,
      from = readCamera(map),
      start = performance.now();
    host.dataset.cameraChoreography = "true";
    const tick = (now: number) => {
      if (token !== generation) return;
      const container = map.getContainer(),
        canvas = map.getCanvas();
      // rAF can run before ResizeObserver. Fit against the current transform,
      // not the previous container size, including the final animation frame.
      if (
        canvas.clientWidth !== container.clientWidth ||
        canvas.clientHeight !== container.clientHeight
      )
        map.resize();
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const camera = interpolateCamera(
        from,
        destination(map, target),
        motionProgress(t, easing),
      );
      map.jumpTo(camera);
      map.redraw();
      const surface = map.getContainer().parentElement;
      const geometryMoving =
        target.kind !== "restore" &&
        surface?.dataset.targetWidth &&
        surface?.dataset.targetHeight &&
        (Math.abs(
          map.getContainer().clientWidth - Number(surface.dataset.targetWidth),
        ) > 1.1 ||
          Math.abs(
            map.getContainer().clientHeight -
              Number(surface.dataset.targetHeight),
          ) > 1.1);
      if (t < 1 || (geometryMoving && now - start < duration + 500))
        frame = requestAnimationFrame(tick);
      else {
        host.dataset.cameraChoreography = "false";
        activeTarget = null;
      }
    };
    if (duration === 0) tick(start);
    else frame = requestAnimationFrame(tick);
  }
  function finish() {
    const target = activeTarget;
    if (target) run(target, 0);
  }
  return { run, stop, finish };
}
