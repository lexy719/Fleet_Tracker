import { NOW, ROUTES, pointAtKm, type WorldJob } from "../fleetos-environment/world";
import { PT_OUTLINE } from "./geo";
import { routeLabel, type Job, type Level } from "./store";

type P = [number, number];
const BBOX = { minLng: -9.6, maxLng: -6.1, minLat: 36.9, maxLat: 42.2 };
function projector(w: number, h: number, pad = 12, bb = BBOX) {
  const k = Math.cos((39.5 * Math.PI) / 180);
  const sx = (w - 2 * pad) / ((bb.maxLng - bb.minLng) * k), sy = (h - 2 * pad) / (bb.maxLat - bb.minLat), s = Math.min(sx, sy);
  const ox = pad + (w - 2 * pad - (bb.maxLng - bb.minLng) * k * s) / 2, oy = pad + (h - 2 * pad - (bb.maxLat - bb.minLat) * s) / 2;
  return ([lng, lat]: P): P => [ox + (lng - bb.minLng) * k * s, oy + (bb.maxLat - lat) * s];
}
const path = (pts: P[], f: (p: P) => P) => pts.map((p, i) => (i ? "L" : "M") + f(p).map((v) => v.toFixed(1)).join(" ")).join("");
const LV: Record<Level, string> = { bad: "var(--bad)", warn: "var(--warn)", ok: "var(--brand)" };

export function position(j: WorldJob): P | null {
  const r = ROUTES[j.routeId];
  if (!r) return null;
  return pointAtKm(r, j.positionKm ?? 0);
}

/** Portrait Portugal with every transport's recorded route; the selected one is inked. */
export function PortraitMap({ jobs, levels, selected, onSelect, height = 640 }: { jobs: Job[]; levels: Record<string, Level>; selected: string | null; onSelect: (id: string) => void; height?: number }) {
  const w = Math.round(height * 0.56), f = projector(w, height);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} role="img" aria-label="Mapa de Portugal com os transportes" style={{ display: "block", maxHeight: height }}>
      <rect width={w} height={height} fill="#e6ebe8" rx="10" />
      <path d={path(PT_OUTLINE, f) + "Z"} fill="#fbfbf8" stroke="#cfd4cc" />
      {jobs.map((j) => {
        const r = ROUTES[j.routeId];
        if (!r) return null;
        const on = selected === j.id;
        return <path key={j.id} d={path(r.line.filter((_, i) => i % 3 === 0), f)} fill="none" stroke={on ? "var(--ink)" : selected ? "#c7cdc6" : "#9fb8ae"} strokeWidth={on ? 3.5 : 2} strokeLinejoin="round" />;
      })}
      {jobs.map((j) => {
        const p = position(j);
        if (!p) return null;
        const [x, y] = f(p), on = selected === j.id, moving = j.positionKm != null && j.positionKm > 0;
        return (
          <g key={j.id} style={{ cursor: "pointer" }} onClick={() => onSelect(j.id)}>
            <circle cx={x} cy={y} r={on ? 11 : 8} fill={moving ? "#fff" : "#f4f5f2"} stroke={LV[levels[j.id]]} strokeWidth={on ? 4 : 3} strokeDasharray={moving ? undefined : "3 2"} />
            {(on || levels[j.id] !== "ok") && <text x={x + 14} y={y + 4} fontSize="12" fontWeight="600" fill="var(--ink)" style={{ paintOrder: "stroke", stroke: "#fbfbf8", strokeWidth: 4 }}>{j.id}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Each transport as a vertical line on Portugal's latitude (north at the top). */
export function LatitudeMetro({ jobs, levels, selected, onSelect, height = 620 }: { jobs: Job[]; levels: Record<string, Level>; selected: string | null; onSelect: (id: string) => void; height?: number }) {
  const cities: [string, number][] = [["Braga", 41.55], ["Porto", 41.15], ["Viseu", 40.66], ["Coimbra", 40.21], ["Leiria", 39.74], ["Santarém", 39.24], ["Lisboa", 38.72], ["Évora", 38.57], ["Beja", 38.02], ["Faro", 37.02]];
  const top = 70, bot = height - 20, y = (lat: number) => top + ((42 - lat) / 5.1) * (bot - top);
  const dx = 120, x0 = 110, w = x0 + dx * jobs.length;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} role="img" aria-label="Transportes por latitude" style={{ display: "block", maxHeight: "calc(100vh - 190px)" }}>
      {cities.map(([n, lat]) => (
        <g key={n}>
          <line x1={x0 - 30} x2={w} y1={y(lat)} y2={y(lat)} stroke="#e6e9e3" />
          <text x={x0 - 36} y={y(lat) + 4} fontSize="12" textAnchor="end" fill="var(--muted)">{n}</text>
        </g>
      ))}
      {jobs.map((j, i) => {
        const r = ROUTES[j.routeId];
        if (!r) return null;
        const x = x0 + i * dx + dx / 2, a = r.line[0][1], b = r.line.at(-1)![1], p = position(j), on = selected === j.id;
        return (
          <g key={j.id} style={{ cursor: "pointer" }} onClick={() => onSelect(j.id)}>
            <rect x={x - dx / 2} y={0} width={dx} height={height} fill={on ? "#eef3f0" : "transparent"} />
            <text x={x} y={22} fontSize="11" textAnchor="middle" fill="var(--muted)" fontFamily="var(--mono)">{j.id}</text>
            <text x={x} y={40} fontSize="12.5" textAnchor="middle" fontWeight="600">{routeLabel(j)}</text>
            <line x1={x} x2={x} y1={y(a)} y2={y(b)} stroke={levels[j.id] === "ok" ? "#b9cbc3" : "#c9cec8"} strokeWidth="9" strokeLinecap="round" />
            {p && j.positionKm ? <line x1={x} x2={x} y1={y(a)} y2={y(p[1])} stroke="var(--ink)" strokeWidth="9" strokeLinecap="round" /> : null}
            <circle cx={x} cy={y(a)} r="6" fill="#fff" stroke="var(--ink)" strokeWidth="3" />
            <rect x={x - 7} y={y(b) - 7} width="14" height="14" fill="var(--ink)" />
            {p && <circle cx={x} cy={y(p[1])} r="11" fill="#fff" stroke={LV[levels[j.id]]} strokeWidth="4" />}
          </g>
        );
      })}
    </svg>
  );
}

/** The real route unrolled onto a straight km axis (lateral wiggle kept). */
export function StripMap({ job, height = 190 }: { job: Job; height?: number }) {
  const r = ROUTES[job.routeId];
  if (!r) return null;
  const W = 1000, a = r.line[0], b = r.line.at(-1)!, k = Math.cos((39.5 * Math.PI) / 180);
  const dx = (b[0] - a[0]) * k, dy = b[1] - a[1], len = Math.hypot(dx, dy);
  const lat = (p: P) => (((p[0] - a[0]) * k) * -dy + (p[1] - a[1]) * dx) / len;
  const X = (km: number) => 20 + (km / r.km) * (W - 40), yc = height / 2 - 10, amp = 70;
  const pts = r.line.map((p, i) => [X(r.cum[i]), yc - lat(p) * amp] as P).filter((_, i) => i % 2 === 0);
  const d = pts.map((p, i) => (i ? "L" : "M") + p.map((v) => v.toFixed(1)).join(" ")).join("");
  const now = job.positionKm ?? 0, yAt = (km: number) => yc - lat(pointAtKm(r, km)) * amp;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Percurso ${routeLabel(job)}`} style={{ display: "block" }}>
      <rect x="0" y="0" width={W} height={height - 34} rx="8" fill="#eef2ef" />
      <path d={d} fill="none" stroke="#b9cbc3" strokeWidth="5" strokeLinejoin="round" />
      <clipPath id={`c-${job.id}`}><rect x="0" y="0" width={X(now)} height={height} /></clipPath>
      <path d={d} fill="none" stroke="var(--brand)" strokeWidth="6" strokeLinejoin="round" clipPath={`url(#c-${job.id})`} />
      {job.stops.map((s) => (
        <g key={s.id}>
          <rect x={X(s.km) - 7} y={yAt(s.km) - 7} width="14" height="14" fill={s.completedAt ? "var(--ink)" : "#fff"} stroke="var(--ink)" strokeWidth="2.5" />
          <text x={X(s.km)} y={height - 16} fontSize="13" fontWeight="600" textAnchor={s.km === 0 ? "start" : s === job.stops.at(-1) ? "end" : "middle"}>{s.city}</text>
          <text x={X(s.km)} y={height - 2} fontSize="11" fill="var(--muted)" textAnchor={s.km === 0 ? "start" : s === job.stops.at(-1) ? "end" : "middle"} fontFamily="var(--mono)">{s.completedAt ?? s.eta} · {s.window.join("–")}</text>
        </g>
      ))}
      {job.positionKm != null && <circle cx={X(now)} cy={yAt(now)} r="10" fill="#fff" stroke="var(--bad)" strokeWidth="4" />}
      <text x={W - 24} y={20} fontSize="11" textAnchor="end" fill="var(--muted)" fontFamily="var(--mono)">{Math.round(r.km)} km · {r.roads.slice(0, 5).join(" · ")}</text>
    </svg>
  );
}

export function MicroJourney({ job, level, width = 220 }: { job: Job; level: Level; width?: number }) {
  const k = job.positionKm ?? 0, x = (km: number) => 2 + (km / job.routeKm) * (width - 10);
  return (
    <svg width={width} height="16" aria-hidden="true" style={{ display: "block" }}>
      <line x1="2" x2={width - 4} y1="8" y2="8" stroke="#dde1da" strokeWidth="3" />
      <line x1="2" x2={x(k)} y1="8" y2="8" stroke="var(--brand)" strokeWidth="3" />
      {job.stops.slice(1, -1).map((s) => <rect key={s.id} x={x(s.km) - 3} y="5" width="6" height="6" fill="#fff" stroke="var(--ink)" strokeWidth="1.5" />)}
      <rect x={width - 9} y="3" width="9" height="9" fill="var(--ink)" />
      {job.positionKm != null && k > 0 && <circle cx={x(k)} cy="8" r="5" fill="#fff" stroke={LV[level]} strokeWidth="2.5" />}
    </svg>
  );
}

export const minOf = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const NOW_MIN = NOW.min;
