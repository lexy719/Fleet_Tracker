import { clock, driverWorld, initials, span, trailerWorld, truckWorld, SPELL_LIMIT, DAY_LIMIT } from "./model";
import { Hover, BoardRow, Row } from "./types";
import { Status, Strip, Hours } from "./parts";
import { xOf, toMinS } from "./Timeline";

export function DriverCard({ id, where, job, hot, delay, onOpen, onHover }: { id: string; where: string; job: Row | null; hot: boolean; delay: number; onOpen: () => void; onHover: Hover }) {
  const d = driverWorld(id);
  const bad = d.qualifications.find((q) => q.state === "EXPIRED");
  const warn = d.qualifications.find((q) => q.state === "EXPIRING");
  return (
    <button
      className="card ecard"
      data-tone={bad ? "bad" : job ? job.tone : "idle"}
      data-hot={hot || undefined}
      data-free={!job || undefined}
      data-tether={`drv-${id}`}
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <span className="card-bg" data-flip={job ? `bg-${job.id}` : undefined} data-flip-mode="box" data-flip-enter={job ? undefined : String(80 + delay)} />
      <span className="e-row">
        <span className="who who-big" data-flip={`drv-${id}`}>
          <span className="mono mono-big">{initials(d.name)}</span>
          <b>{d.name || "Sem motorista"}</b>
        </span>
        {job ? (
          <span className="ref ref-chip" data-flip={`ref-${job.id}`}>
            {job.id}
          </span>
        ) : (
          <span className="status" data-flip-enter={String(120 + delay)}>
            Livre
          </span>
        )}
      </span>
      <span className="e-sub" data-flip-enter={String(140 + delay)}>
        {job ? (
          <>
            <span className="act-dot" data-moving={job.moving || undefined} /> {job.activity} · {job.stops[0].city} → {job.stops.at(-1)!.city}
          </>
        ) : (
          where
        )}
        {job && (
          <span className="plate plate-mini" data-flip={`plate-${job.truckId}`}>
            {truckWorld(job.truckId).plate}
          </span>
        )}
      </span>
      <span className="e-meters" data-flip-enter={String(180 + delay)}>
        <Hours used={d.spellMin} limit={SPELL_LIMIT} label="sem pausa" compact />
        <Hours used={d.dayMin} limit={DAY_LIMIT} label="hoje" compact />
      </span>
      {(bad || warn) && (
        <span className="qual" data-s={bad ? "EXPIRED" : "EXPIRING"} data-flip-enter={String(220 + delay)}>
          {(bad ?? warn)!.label} · {(bad ?? warn)!.detail}
        </span>
      )}
    </button>
  );
}

/** A tractor. Same morph contract: transport card → driver card → truck card. */
export function TruckCard({ id, where, job, hot, delay, onOpen, onHover }: { id: string; where: string; job: Row | null; hot: boolean; delay: number; onOpen: () => void; onHover: Hover }) {
  const t = truckWorld(id);
  const shop = t.availability !== "AVAILABLE";
  const tr = job ? trailerWorld(job.trailerId) : null;
  return (
    <button
      className="card ecard"
      data-tone={shop ? "bad" : job ? job.tone : "idle"}
      data-hot={hot || undefined}
      data-free={!job || undefined}
      data-tether={`trk-${id}`}
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <span className="card-bg" data-flip={job ? `bg-${job.id}` : undefined} data-flip-mode="box" data-flip-enter={job ? undefined : String(80 + delay)} />
      <span className="e-row">
        <span className="plate plate-big" data-flip={`plate-${id}`}>
          {t.plate}
        </span>
        <span className="e-main" data-flip-enter={String(120 + delay)}>
          <b>
            {t.make} {t.model}
          </b>
          <span>{shop ? t.service : job ? job.activity : `livre · ${where}`}</span>
        </span>
        {job && (
          <span className="ref ref-chip" data-flip={`ref-${job.id}`}>
            {job.id}
          </span>
        )}
      </span>
      <span className="fuel" data-flip-enter={String(160 + delay)}>
        <span className="fuel-bar">
          <span style={{ width: `${t.fuel.value}%` }} />
        </span>
        <span className="fuel-txt">
          <b>{t.fuel.value}%</b> · ≈{Math.round((t.fuel.value / 100) * t.tankL)} L · {Math.round(t.odometer.value / 1000)} mil km
          <em>{t.fuel.prov.at}</em>
        </span>
      </span>
      {job && (
        <span className="e-coupled">
          <span className="who" data-flip={`drv-${job.driverId}`}>
            <span className="mono">{initials(driverWorld(job.driverId).name)}</span>
            {driverWorld(job.driverId).name}
          </span>
          <span className="e-link" aria-hidden />
          <span className="tr-chip" data-flip-enter={String(200 + delay)}>
            {tr ? `${tr.type} · ${tr.plate}` : "sem reboque"}
          </span>
        </span>
      )}
    </button>
  );
}

export function StopRow({ row, t, hot, onOpen, onHover, delay }: { row: BoardRow; t: number; hot: boolean; onOpen: () => void; onHover: Hover; delay: number }) {
  const w0 = toMinS(row.window[0]);
  const w1 = toMinS(row.window[1]);
  const rel =
    row.state === "done"
      ? `feito ${row.eta != null ? clock(row.eta) : ""}`
      : row.state === "active"
        ? "em carga agora"
        : row.eta == null
        ? "sem plano"
        : row.eta < t
          ? `há ${span(t - row.eta)}`
          : `em ${span(row.eta - t)}`;
  return (
    <button
      className="srow"
      data-state={row.state}
      data-hot={hot || undefined}
      data-tether={`stop-${row.job.id}-${row.job.stops[row.i].id}`}
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <span className="card-bg" data-flip={row.next ? `bg-${row.job.id}` : undefined} data-flip-mode="box" data-flip-enter={row.next ? undefined : String(60 + delay)} />
      <span className="s-time">
        <b>{row.eta != null ? clock(row.eta) : row.window[0]}</b>
        <span className="s-win">
          <span className="s-win-bar" style={{ left: `${xOf(w0)}%`, width: `${xOf(w1) - xOf(w0)}%` }} />
          {row.eta != null && <span className="s-win-eta" style={{ left: `${xOf(row.eta)}%` }} />}
        </span>
      </span>
      <span className="s-body">
        <b>
          {row.city}
          <em>{row.type === "pickup" ? "Carga" : row.type === "delivery" ? "Entrega" : "Paragem"}</em>
        </b>
        <span>
          {row.site} · janela {row.window[0]}–{row.window[1]}
        </span>
      </span>
      <span className="s-side">
        <span className="ref ref-chip" data-flip={row.next ? `ref-${row.job.id}` : undefined}>
          {row.job.id}
        </span>
        <span className="s-rel">{rel}</span>
      </span>
    </button>
  );
}

export function JobCard({ job, hot, onOpen, onHover }: { job: Row; hot: boolean; onOpen: () => void; onHover: (h: boolean) => void }) {
  const d = driverWorld(job.driverId);
  const t = truckWorld(job.truckId);
  const last = job.stops.at(-1)!;
  return (
    <button
      className="card"
      data-tether={`job-${job.id}`}
      data-tone={job.tone}
      data-hot={hot || undefined}
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <span className="card-bg" data-flip={`bg-${job.id}`} data-flip-mode="box" />
      <span className="card-top">
        <span className="ref" data-flip={`ref-${job.id}`}>
          {job.id}
        </span>
        <span className="client">{job.client}</span>
        <Status job={job} />
      </span>
      <span className="card-od">
        <b>{job.stops[0].city}</b>
        <span className="od-arrow" />
        <b>{last.city}</b>
        <span className="card-eta">
          {job.forecast.final != null && job.positionKm != null ? (
            <>
              chega <b>{clock(job.forecast.final)}</b>
            </>
          ) : (
            <>janela {last.window[0]}</>
          )}
        </span>
      </span>
      <span className="card-strip" data-flip={`strip-${job.id}`} data-flip-mode="box">
        <Strip job={job} />
      </span>
      <span className="card-foot">
        <span className="who" data-flip={`drv-${job.driverId}`}>
          <span className="mono">{initials(d.name)}</span>
          {d.name || "Sem motorista"}
        </span>
        <span className="plate" data-flip={`plate-${job.truckId}`}>
          {t.plate}
        </span>
      </span>
      {job.tone !== "ok" && job.tone !== "idle" && (
        <span className="card-next">
          <span className="next-dot" />
          {job.blockers[0] ?? job.next}
        </span>
      )}
    </button>
  );
}
