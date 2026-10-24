import { STATUS_LABEL } from "../world/world";
import { clock, span, type Plan, type WorldJob } from "./model";
import { Row } from "./types";

export function Status({ job }: { job: WorldJob }) {
  return (
    <span className="status" data-s={job.status}>
      {STATUS_LABEL[job.status]}
    </span>
  );
}

/** Horizontal corridor: stops at their real km, progress to the (simulated) position. */
export function Strip({ job, plan: pl, big }: { job: Row; plan?: Plan | null; big?: boolean }) {
  const total = job.route.km;
  const pos = job.activity === "aguarda carga" && job.km < 0.5 ? null : Math.min(1, job.km / total);
  return (
    <span className={`strip${big ? " strip-big" : ""}`}>
      <span className="strip-rail" />
      {pos != null && <span className="strip-done" style={{ width: `${pos * 100}%` }} />}
      {job.stops.map((s, i) => {
        const x = Math.min(1, (s.km * job.scale) / total);
        const sp = (pl ?? job.forecast).stops[i];
        return (
          <span key={s.id} className="strip-stop" data-done={s.completedAt ? "" : undefined} data-late={sp.late || undefined} style={{ left: `${x * 100}%` }}>
            {big && (
              <span className="strip-label" data-edge={i === 0 ? "start" : i === job.stops.length - 1 ? "end" : undefined}>
                <b>{s.city}</b>
                <span>{s.completedAt ? `feito ${s.completedAt}` : sp.eta != null && job.positionKm != null ? clock(sp.eta) : s.window[0]}</span>
              </span>
            )}
          </span>
        );
      })}
      {pos != null && <span className="strip-truck" data-moving={job.moving || undefined} style={{ left: `${pos * 100}%` }} />}
    </span>
  );
}

export const delta = (m: number) => (Math.round(m) === 0 ? "sem atraso" : m > 0 ? `+${span(m)}` : `−${span(m)}`);

export function Fact({ k, v, changed, tone }: { k: string; v: string; changed?: boolean; tone?: "bad" }) {
  return (
    <span className="fact" data-changed={changed || undefined} data-tone={tone}>
      <span>{k}</span>
      <b key={v}>{v}</b>
    </span>
  );
}

export function Hours({ used, limit, label, compact }: { used: number; limit: number; label: string; compact?: boolean }) {
  const k = Math.min(1, Math.max(0, used / limit));
  return (
    <span className="hours" data-tight={k > 0.85 || undefined}>
      <span className="h-bar">
        <span style={{ width: `${k * 100}%` }} />
      </span>
      <span className="h-txt">
        <b>{span(used)}</b> {compact ? `/ ${span(limit)} · ${label}` : `de ${span(limit)} ${label}`}
      </span>
    </span>
  );
}
