/** Renderer vocabulary only. This module owns no workspace layout policy. */
export const DOMAINS = [
  "Jobs",
  "Drivers",
  "Trucks",
  "Fuel",
  "Restrictions",
  "Documents",
] as const;
export type Domain = (typeof DOMAINS)[number];
export type Point = [number, number];
export type MapMode =
  | "FULL_OPERATIONAL"
  | "LARGE_SPATIAL"
  | "ROUTE_FOCUS"
  | "DRIVER_LOCAL"
  | "TRUCK_LOCAL"
  | "ROUTE_CORRIDOR"
  | "ROUTE_CORRIDOR_HORIZONTAL"
  | "ROUTE_CORRIDOR_VERTICAL"
  | "FUEL_CORRIDOR"
  | "FUEL_ROUTE"
  | "RESTRICTION_SEGMENT"
  | "SUPPORTING_MAP"
  | "CONTEXTUAL_MINIMAP"
  | "BACKGROUND_CONTEXT"
  | "HIDDEN";
export type MapPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  opacity: number;
  visible: boolean;
  /** Spatial mode: screen space covered by inspectors, kept clear by the camera. */
  inset?: { top: number; right: number; bottom: number; left: number };
};
export type MapCamera = {
  center: Point;
  zoom: number;
  bearing: number;
  pitch: number;
  padding: { top: number; right: number; bottom: number; left: number };
};
export type Easing = "controlled" | "snappy" | "gentle" | "linear";
export type CameraTarget =
  | { kind: "focus"; domain: Domain }
  | { kind: "mode"; mode: MapMode; insetRight?: number }
  | { kind: "restore"; camera: MapCamera }
  | {
      kind: "scene";
      points: Point[];
      inset?: { top: number; right: number; bottom: number; left: number };
      maxZoom?: number;
      bearing?: number;
      pitch?: number;
    };
export type MapScene = {
  emphasis?: {
    kind: "stop" | "restriction" | "resource" | "job";
    id?: string;
    point?: Point;
  };
  selectedStop?: string | null;
  segmentIds?: string[];
  selectedRestriction?: string | null;
  routes: Point[][];
  /** Ids for `routes` when several transports are drawn (fleet context). */
  routeIds?: string[];
  driver: Point | null;
  fuel: Point | null;
  segment: Point[];
  showSegment?: boolean;
  segments?: Point[][];
  stops?: { id: string; point: Point }[];
  /** Official alternative to a restricted segment (recorded geometry, dashed). */
  alt?: Point[][];
  /** Route already driven (rendered quieter than the remaining route). */
  done?: Point[];
  driverSource?: "SIMULATED" | "UNKNOWN";
  /** Fleet context: only known or simulated positions are ever placed. */
  fleet?: { id: string; point: Point; source: "SIMULATED" | "UNKNOWN" }[];
};
export const INITIAL_CAMERA: MapCamera = {
  center: [-5, 39.7],
  zoom: 5.35,
  bearing: 0,
  pitch: 0,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};
