import type { MapMode } from "./mapTypes";
export function mapRepresentation(mode: MapMode) {
  const mini =
    mode === "CONTEXTUAL_MINIMAP" ||
    mode === "SUPPORTING_MAP" ||
    mode === "BACKGROUND_CONTEXT";
  const corridor =
    mode.includes("CORRIDOR") ||
    mode === "FUEL_ROUTE" ||
    mode === "FUEL_CORRIDOR";
  return {
    labelZoomOffset: mini
      ? 2
      : [
            "FULL_OPERATIONAL",
            "LARGE_SPATIAL",
            "DRIVER_LOCAL",
            "TRUCK_LOCAL",
          ].includes(mode)
        ? 0
        : 1,
    controls: !mini && mode !== "HIDDEN",
    route: !["DRIVER_LOCAL", "TRUCK_LOCAL", "HIDDEN"].includes(mode),
    fuel: mode === "FUEL_CORRIDOR" || mode === "FUEL_ROUTE",
    segment: mode === "RESTRICTION_SEGMENT",
    vehicle: mode !== "HIDDEN",
    lineWidth: mode === "FULL_OPERATIONAL" ? 2.5 : mini ? 2 : corridor ? 6 : 4,
    markerScale:
      mode === "BACKGROUND_CONTEXT"
        ? 0.45
        : mode === "CONTEXTUAL_MINIMAP"
          ? 0.6
          : mini
            ? 0.7
            : mode === "DRIVER_LOCAL"
              ? 1.2
              : 1,
    routeOpacity:
      mode === "BACKGROUND_CONTEXT"
        ? 0.25
        : mode === "FULL_OPERATIONAL"
          ? 0.5
          : mini
            ? 0.65
            : 1,
  };
}
