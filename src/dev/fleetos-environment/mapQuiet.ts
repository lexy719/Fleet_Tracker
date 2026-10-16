import type { Map as LibreMap } from "maplibre-gl";

/**
 * FleetOS map treatment over the production TomTom style: quieter land, desaturated
 * road colours, restrained labels and no POI clutter, so operational overlays lead.
 * Applied to the loaded style at runtime; the provider style URL is unchanged.
 */
type Role = "water" | "road" | "green" | "label" | "other";
const ROLE_TUNING: Record<Role, { sat: number; lift: number; dark?: number }> = {
  water: { sat: 0.9, lift: 0.02 },
  road: { sat: 0.6, lift: 0.04 },
  green: { sat: 0.75, lift: 0.06 },
  label: { sat: 0.7, lift: 0, dark: 0.04 },
  other: { sat: 0.85, lift: 0.02 },
};
function roleOf(id: string, type: string): Role {
  if (type === "symbol") return "label";
  if (/water|ocean|sea|river|lake|reservoir|canal/i.test(id)) return "water";
  if (/road|motorway|street|highway|tunnel|bridge|link|ramp|trunk|primary|secondary|tertiary|path|rail/i.test(id))
    return "road";
  if (/park|wood|forest|green|grass|landcover|vegetation|nature|golf|cemetery/i.test(id))
    return "green";
  return "other";
}
const COLOR_PROPS = [
  "background-color",
  "fill-color",
  "fill-outline-color",
  "line-color",
  "text-color",
  "text-halo-color",
  "icon-color",
  "fill-extrusion-color",
];

export function quietMapStyle(map: LibreMap) {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return;
  const parse = (value: string): [number, number, number, number] | null => {
    if (!/^(#|rgb|hsl)/i.test(value.trim())) return null;
    ctx.fillStyle = "#010203";
    ctx.fillStyle = value;
    const v = ctx.fillStyle;
    if (v.startsWith("#"))
      return [
        parseInt(v.slice(1, 3), 16),
        parseInt(v.slice(3, 5), 16),
        parseInt(v.slice(5, 7), 16),
        1,
      ];
    const m = v.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = "1"] = m[1].split(",").map((x) => x.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  };
  const tune = (value: string, role: Role) => {
    const c = parse(value);
    if (!c) return value;
    const [r, g, b] = c.slice(0, 3).map((v) => v / 255);
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    let h = 0,
      s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h =
        max === r
          ? (g - b) / d + (g < b ? 6 : 0)
          : max === g
            ? (b - r) / d + 2
            : (r - g) / d + 4;
      h *= 60;
    }
    const t = ROLE_TUNING[role];
    const ns = s * t.sat;
    let nl = l + (1 - l) * t.lift;
    if (t.dark && l < 0.6) nl = Math.max(0, l - t.dark);
    // Warm the neutral base slightly toward the FleetOS paper tone.
    const nh = ns < 0.06 ? 45 : h;
    return `hsla(${nh.toFixed(1)}, ${(Math.max(ns, l > 0.85 ? 0.08 : ns) * 100).toFixed(1)}%, ${(nl * 100).toFixed(1)}%, ${c[3]})`;
  };
  const walk = (value: unknown, role: Role): unknown => {
    if (typeof value === "string") return tune(value, role);
    if (Array.isArray(value)) return value.map((v) => walk(v, role));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, walk(v, role)]),
      );
    return value;
  };
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.id.startsWith("environment-")) continue;
    if (/poi|point.of.interest|hospital|amenity|shop|food|tourism|sport/i.test(layer.id)) {
      map.setLayoutProperty(layer.id, "visibility", "none");
      continue;
    }
    const role = roleOf(layer.id, layer.type);
    for (const prop of COLOR_PROPS) {
      let current: unknown;
      try {
        current = map.getPaintProperty(layer.id, prop);
      } catch {
        continue;
      }
      if (current == null) continue;
      try {
        map.setPaintProperty(layer.id, prop, walk(current, role));
      } catch {
        /* expression shapes the walker cannot safely rewrite keep the provider value */
      }
    }
    if (layer.type === "background")
      map.setPaintProperty(layer.id, "background-color", "#f4f3ec");
  }
}
