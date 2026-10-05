/** Point at `distM` metres from `p` ([lat, lng]) on bearing `deg` (spherical, test helper). */
export function destinationPoint(p: [number, number], deg: number, distM: number): [number, number] {
  const R = 6371008.8, d = distM / R, b = (deg * Math.PI) / 180;
  const la1 = (p[0] * Math.PI) / 180, lo1 = (p[1] * Math.PI) / 180;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [(la2 * 180) / Math.PI, (lo2 * 180) / Math.PI];
}
