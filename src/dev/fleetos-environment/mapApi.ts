import type {
  EaseToOptions,
  FitBoundsOptions,
  LngLatBoundsLike,
  PointLike,
} from "maplibre-gl";
import type { MapCamera, Easing, CameraTarget } from "./mapTypes";

/** Camera operations for future composers, without ownership of the renderer instance. */
export type EnvironmentMapApi = {
  fitBounds(bounds: LngLatBoundsLike, options?: FitBoundsOptions): void;
  setCamera(options: EaseToOptions): void;
  panBy(offset: PointLike): void;
  zoomTo(zoom: number): void;
  getCamera(): MapCamera | null;
  resize(): void;
  transitionCamera(
    target: CameraTarget,
    duration: number,
    easing?: Easing,
  ): void;
};
// Synthetic geometry: neither a job nor a calculated road route.
export const REFERENCE_POINTS: [[number, number], [number, number]] = [
  [-5.55, 39.55],
  [-4.45, 39.85],
];
