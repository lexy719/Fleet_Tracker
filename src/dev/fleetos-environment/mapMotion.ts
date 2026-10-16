import type { Easing, MapCamera, Point } from "./mapTypes";
// Legacy renderer defaults; guided paths supply their actual synthetic geometry.
export const SYNTHETIC_ROUTE: Point[] = [
  [-9.18, 38.73],
  [-8.95, 39.05],
  [-8.55, 39.52],
  [-8.43, 40.18],
  [-8.53, 40.64],
  [-8.62, 41.16],
];
export const SYNTHETIC_DRIVER: Point = [-8.62, 41.16];
export const SYNTHETIC_FUEL: Point = [-8.55, 39.52];
export const SYNTHETIC_SEGMENT: Point[] = [
  [-8.43, 40.18],
  [-8.53, 40.64],
];
export function motionProgress(t: number, easing: Easing = "controlled") {
  const p = Math.max(0, Math.min(1, t));
  if (p === 0 || p === 1 || easing === "linear") return p;
  const curves = {
    controlled: [0.22, 1, 0.36, 1],
    snappy: [0.2, 0.8, 0.2, 1],
    gentle: [0.4, 0, 0.2, 1],
  } as const;
  const [x1, y1, x2, y2] = curves[easing];
  const bezier = (u: number, a: number, b: number) =>
    3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
  let low = 0,
    high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (bezier(mid, x1, x2) < p) low = mid;
    else high = mid;
  }
  return bezier((low + high) / 2, y1, y2);
}
export function interpolateCamera(
  from: MapCamera,
  to: MapCamera,
  progress: number,
): MapCamera {
  const p = Math.max(0, Math.min(1, progress)),
    mix = (a: number, b: number) => a + (b - a) * p;
  const delta = ((to.bearing - from.bearing + 540) % 360) - 180;
  return {
    center: [
      mix(from.center[0], to.center[0]),
      mix(from.center[1], to.center[1]),
    ],
    zoom: mix(from.zoom, to.zoom),
    bearing: p === 1 ? to.bearing : from.bearing + delta * p,
    pitch: mix(from.pitch, to.pitch),
    padding: {
      top: mix(from.padding.top, to.padding.top),
      right: mix(from.padding.right, to.padding.right),
      bottom: mix(from.padding.bottom, to.padding.bottom),
      left: mix(from.padding.left, to.padding.left),
    },
  };
}
