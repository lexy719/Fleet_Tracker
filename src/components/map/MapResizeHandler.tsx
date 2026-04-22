import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Call after mount, on window resize, and when the map wrapper is resized (flex/layout).
 * Leaflet otherwise leaves grey gutters until the container size is re-read.
 */
export function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const invalidate = () => {
      map.invalidateSize({ animate: false });
    };
    invalidate();
    const timeouts = [100, 400].map((ms) => window.setTimeout(invalidate, ms));
    window.addEventListener("resize", invalidate);
    const parent = map.getContainer().parentElement;
    const ro = parent ? new ResizeObserver(invalidate) : null;
    if (parent && ro) ro.observe(parent);
    return () => {
      timeouts.forEach(clearTimeout);
      window.removeEventListener("resize", invalidate);
      ro?.disconnect();
    };
  }, [map]);
  return null;
}
