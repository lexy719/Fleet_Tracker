// Fuel presentation: one chart grammar used everywhere fuel appears (fuel cards, job panel),
// so the same picture grows and shrinks with the object it belongs to. Refuel stops are the
// ones the route calculation produced — shown, not picked.
import { litresAt, type FuelView } from "./fuel";
import { clock, initials, driverWorld, truckWorld, type Plan } from "./model";
import type { Row } from "./types";

const fmtL = (l: number) => `${Math.round(l)} L`;
export const eurL = (x: number) => `${x.toFixed(3).replace(".", ",")} €/L`;
export const money = (x: number) => `${Math.round(x).toLocaleString("pt-PT")} €`;

export function fuelVerdict(v: FuelView): { tone: "ok" | "warn" | "bad"; text: string } {
  const pct = Math.round((v.endL / v.tankL) * 100);
  const rule = Math.round((v.targetL / v.tankL) * 100);
  if (v.plan.status === "INFEASIBLE" || v.plan.status === "NO_STATIONS")
    return { tone: "bad", text: v.corridor.length ? "O motor não encontra paragens que cheguem ao destino com margem" : "Sem postos com preço publicado no corredor desta rota" };
  if (v.refuels.length) {
    const eur = v.refuels.reduce((a, r) => a + r.litres * r.pricePerL, 0);
    return {
      tone: v.short ? "warn" : "ok",
      text: `${v.refuels.length === 1 ? "1 paragem" : `${v.refuels.length} paragens`} de abastecimento na rota · ${fmtL(v.refuels.reduce((a, r) => a + r.litres, 0))} · ${money(eur)} · chega com ${pct}%`,
    };
  }
  if (v.short) return { tone: "warn", text: `Chega com ${pct}% · abaixo da regra de ${rule}%` };
  return { tone: "ok", text: `Sem abastecimento necessário · chega com ${pct}% (${fmtL(v.endL)})` };
}

/** Litres along the remaining route: level line, arrival rule, reserve, corridor price bins, refuel steps. */
export function FuelChart({ v, nowKm, compact }: { v: FuelView; nowKm?: number; compact?: boolean }) {
  const W = 1000;
  const H = compact ? 70 : 96;
  const pad = 6;
  const span = Math.max(1, v.toKm - v.fromKm);
  const x = (km: number) => ((km - v.fromKm) / span) * W;
  const y = (l: number) => pad + (1 - l / v.tankL) * (H - pad * 2 - 10);
  const pts: string[] = [];
  const marks = [...v.refuels].sort((a, b) => a.km - b.km);
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const km = v.fromKm + (span * i) / n;
    for (const r of marks)
      if (r.km > km - span / n && r.km <= km) {
        pts.push(`${x(r.km)},${y(litresAt(v, r.km - 1e-6))}`);
        pts.push(`${x(r.km)},${y(litresAt(v, r.km))}`);
      }
    pts.push(`${x(km)},${y(litresAt(v, km))}`);
  }
  // Without the route's stops: where the reserve would be hit.
  const dry = v.dryKmWithout;
  const BINS = compact ? 30 : 48;
  const bins: ({ min: number; n: number } | null)[] = Array.from({ length: BINS }, () => null);
  for (const st of v.corridor) {
    const i = Math.min(BINS - 1, Math.max(0, Math.floor(((st.km - v.fromKm) / span) * BINS)));
    const b = bins[i];
    bins[i] = b ? { min: Math.min(b.min, st.price.price), n: b.n + 1 } : { min: st.price.price, n: 1 };
  }
  const prices = v.corridor.map((s) => s.price.price);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const tint = (p: number) => {
    const k = pMax > pMin ? (p - pMin) / (pMax - pMin) : 0.5;
    return k < 0.33 ? "var(--ok)" : k < 0.66 ? "var(--warn)" : "var(--bad)";
  };
  return (
    <svg className="fchart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" data-compact={compact || undefined} aria-hidden>
      <rect x={0} y={y(v.reserveL)} width={W} height={H - 10 - y(v.reserveL)} className="fc-reserve" />
      <line x1={0} x2={W} y1={y(v.reserveL)} y2={y(v.reserveL)} className="fc-reserve-line" />
      <line x1={0} x2={W} y1={y(v.targetL)} y2={y(v.targetL)} className="fc-target" />
      {marks.length > 0 && (
        <polyline
          points={Array.from({ length: n + 1 }, (_, i) => {
            const km = v.fromKm + (span * i) / n;
            return `${x(km)},${y(litresAt(v, km, false))}`;
          }).join(" ")}
          className="fc-ghost"
        />
      )}
      <polygon points={`0,${H - 10} ${pts.join(" ")} ${W},${H - 10}`} className="fc-area" />
      <polyline points={pts.join(" ")} className="fc-line" data-dry={v.short || undefined} />
      {bins.map((b, i) =>
        b ? (
          <rect key={i} x={(i / BINS) * W + 1} y={H - 8} width={W / BINS - 2} height={8} rx={1.5} fill={tint(b.min)} className="fc-st">
            <title>{`${b.n} postos · desde ${b.min.toFixed(3)} €/L`}</title>
          </rect>
        ) : null,
      )}
      {marks.map((r) => (
        <circle key={r.stationId + r.km} cx={x(r.km)} cy={y(litresAt(v, r.km))} r={compact ? 9 : 11} className="fc-refuel" />
      ))}
      {dry != null && marks.length === 0 && (
        <g className="fc-dry" transform={`translate(${x(dry)},${y(v.reserveL)})`}>
          <line y1={-H} y2={H} />
          <circle r={compact ? 8 : 10} />
        </g>
      )}
      {nowKm != null && nowKm >= v.fromKm && <line x1={x(nowKm)} x2={x(nowKm)} y1={0} y2={H - 10} className="fc-now" />}
    </svg>
  );
}

/** The route's refuel stops as a short list with their time in the plan. */
export function RefuelList({ v, pl, onSpot, spotId }: { v: FuelView; pl: Plan; onSpot?: (stationId: string) => void; spotId?: string | null }) {
  if (!v.refuels.length) return null;
  return (
    <ol className="refuels">
      {v.refuels.map((r, i) => {
        const fs = pl.fuelStops[i];
        return (
          <li key={r.stationId + i} data-on={spotId === r.stationId || undefined}>
            {onSpot && (
              <button className="rf-hit" onClick={() => onSpot(r.stationId)} aria-label={`Ver ${r.name} no mapa`} title="Ver a bomba no mapa" />
            )}
            <span className="pump" aria-hidden />
            <span className="rf-main">
              <b>{r.name}</b>
              <span>
                km {Math.round(r.km)}
                {fs ? ` · ${clock(fs.at)}${fs.merged ? " · durante a pausa de 45 min" : " · paragem de 20 min"}` : ""}
              </span>
            </span>
            <span className="rf-num">
              <b>{fmtL(r.litres)}</b>
              <span>
                {eurL(r.pricePerL)} · {money(r.litres * r.pricePerL)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Combustível view: the transport card becomes its truck's tank (shared bg/ref/plate keys). */
export function FuelCard({ job, hot, onOpen, onHover }: { job: Row; hot: boolean; onOpen: () => void; onHover: (h: boolean) => void }) {
  const v = job.fuel!;
  const t = truckWorld(job.truckId);
  const verdict = fuelVerdict(v);
  const pct = Math.round((v.startL / v.tankL) * 100);
  return (
    <button
      className="card fcard"
      data-tone={verdict.tone}
      data-hot={hot || undefined}
      data-tether={`job-${job.id}`}
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <span className="card-bg" data-flip={`bg-${job.id}`} data-flip-mode="box" />
      <span className="e-row">
        <span className="plate plate-big" data-flip={`plate-${job.truckId}`}>
          {t.plate}
        </span>
        <span className="f-pct" data-flip-enter="120">
          <b>{pct}%</b>
          <span>
            {fmtL(v.startL)} de {v.tankL} L · {v.reading}
          </span>
        </span>
        <span className="ref ref-chip" data-flip={`ref-${job.id}`}>
          {job.id}
        </span>
      </span>
      <span className="f-chart" data-flip-enter="160">
        <FuelChart v={v} nowKm={job.km} compact />
        <span className="f-ends">
          <span>{job.stops[0].city}</span>
          <span>{job.stops.at(-1)!.city}</span>
        </span>
      </span>
      <span className="f-verdict" data-tone={verdict.tone} data-flip-enter="200">
        {verdict.text}
      </span>
      {v.refuels.map((r, i) => (
        <span key={i} className="f-best f-planned" data-flip-enter="240">
          <span className="pump" aria-hidden />
          {r.name} · {job.forecast.fuelStops[i] ? clock(job.forecast.fuelStops[i].at) : ""} · {eurL(r.pricePerL)} · {fmtL(r.litres)}
        </span>
      ))}
      <span className="who f-who" data-flip={`drv-${job.driverId}`}>
        <span className="mono">{initials(driverWorld(job.driverId).name)}</span>
        {driverWorld(job.driverId).name || "Sem motorista"}
      </span>
    </button>
  );
}
