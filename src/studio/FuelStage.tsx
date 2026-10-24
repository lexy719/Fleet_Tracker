// Combustível: the palco whose primary category is the refuel stop. It answers "where do we refuel, and what
// does it cost?", in one variation at a time:
//   Preço      — one line per stop the route plan makes: the pumps on the same road ±60 km, by price; the
//                planned one and the cheapest one close by. The engine picks the stop; this shows the evidence.
//   Depósitos  — one line per truck on the road: diesel now, the reserve, what it arrives with.
//   Gasto      — one line per trip: litres still to burn today and what they cost (estimated at its prices).
// Prices are the official sample (non-commercial). Drivers and trips are links to their palcos.
import { useRef } from "react";
import { clock, driverWorld, truckWorld } from "./model";
import type { Row } from "./types";
import { litresAt } from "./fuel";
import { eurL, money } from "./fuelui";
import { palcoFlight } from "./Layers";
import { plateFlight } from "./Garage";
import { Variations, usePalcoEntrance, useRowFlip } from "./palco";

export type FuelVar = "preco" | "depositos" | "gasto";
export const FUEL_VARS: [FuelVar, string][] = [
  ["preco", "Preço"],
  ["depositos", "Depósitos"],
  ["gasto", "Gasto"],
];
const SPAN = 60; // km either side of a stop
const pct = (l: number, tank: number) => Math.round((l / tank) * 100);
/** "AN ENERGETICOS - PEÑARANDA" → "An Energeticos": station names come in capitals and with the place. */
const title = (x: string) => x.toLowerCase().replace(/(^|[\s(/-])\S/g, (m) => m.toUpperCase());
const brand = (s: { station: { brand?: string; name?: string } }) => title((s.station.brand ?? s.station.name ?? "posto").split(" - ")[0].replace(/\s+/g, " ").trim());

/** A refuel stop of the route plan, with the pumps around it. */
export function fuelStops(jobs: Row[]) {
  return jobs.flatMap((j) => {
    const v = j.fuel;
    if (!v || j.status === "delivered") return [];
    return v.refuels.map((r) => {
      const fs = j.forecast.fuelStops.find((f) => Math.abs(f.km * j.scale - r.km) < 3);
      const near = v.corridor.filter((c) => Math.abs(c.km - r.km) <= SPAN);
      const cheapest = [...near].sort((a, b) => a.price.price - b.price.price)[0] ?? null;
      return { id: `${j.id}@${Math.round(r.km)}`, job: j, r, at: fs?.at ?? null, merged: !!fs?.merged, near, cheapest };
    });
  });
}

export function FuelScene({
  jobs,
  now,
  focus,
  variant,
  onVariant,
  onOpen,
  onDriver,
  onTruck,
}: {
  jobs: Row[];
  now: number;
  /** The tapped stop (first, open); null when opened from the sidebar. */
  focus: string | null;
  variant: FuelVar;
  onVariant: (v: FuelVar) => void;
  onOpen: (jobId: string) => void;
  onDriver: (driverId: string) => void;
  onTruck: (truckId: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  usePalcoEntrance(root);
  const captureRows = useRowFlip(root, variant);

  const stops = fuelStops(jobs).sort((a, b) => Number(b.id === focus) - Number(a.id === focus) || (a.at ?? 1e9) - (b.at ?? 1e9));
  const trips = jobs.filter((j) => j.fuel && j.status !== "delivered" && j.forecast.final != null && j.forecast.final > now - 60);
  const litres = stops.reduce((a, s) => a + s.r.litres, 0);
  const spend = stops.reduce((a, s) => a + s.r.litres * s.r.pricePerL, 0);
  const saving = stops.reduce((a, s) => a + (s.cheapest ? Math.max(0, (s.r.pricePerL - s.cheapest.price.price) * s.r.litres) : 0), 0);

  // Depósitos / Gasto: the trips, worst first.
  const tank = (j: Row) => {
    const v = j.fuel!;
    const nowL = litresAt(v, Math.max(v.fromKm, j.km));
    const remainingKm = Math.max(0, v.toKm - Math.max(v.fromKm, j.km));
    const burn = (remainingKm * v.lPer100) / 100;
    const priceRef = v.refuels[0]?.pricePerL ?? (v.corridor.length ? [...v.corridor].sort((a, b) => a.price.price - b.price.price)[Math.floor(v.corridor.length / 2)].price.price : null);
    return { v, nowL, endL: v.endL, burn, cost: priceRef != null ? burn * priceRef : null, priceRef };
  };
  const byTank = [...trips].sort((a, b) => tank(a).endL / tank(a).v.tankL - tank(b).endL / tank(b).v.tankL);
  const byCost = [...trips].sort((a, b) => (tank(b).cost ?? 0) - (tank(a).cost ?? 0));
  const maxCost = Math.max(1, ...trips.map((j) => tank(j).cost ?? 0));
  const totalBurn = trips.reduce((a, j) => a + tank(j).burn, 0);
  const totalCost = trips.reduce((a, j) => a + (tank(j).cost ?? 0), 0);

  const who = (j: Row) => (
    <small className="dy-links">
      {j.driverId && (
        <em
          className="lnk"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            palcoFlight.from = e.currentTarget.getBoundingClientRect();
            onDriver(j.driverId!);
          }}
        >
          {driverWorld(j.driverId).name}
        </em>
      )}
      {j.truckId && (
        <>
          {" · "}
          <em
            className="lnk dy-plate"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              plateFlight.from = e.currentTarget.getBoundingClientRect();
              onTruck(j.truckId!);
            }}
          >
            {truckWorld(j.truckId).plate}
          </em>
        </>
      )}
    </small>
  );

  return (
    <div className="fu-stage gar-stage" ref={root} data-var={variant}>
      <header className="dy-head">
        <span className="cn-eyebrow">Combustível · {{ preco: "preço nas paragens de hoje", depositos: "depósitos dos camiões na estrada", gasto: "gasto previsto do que falta hoje" }[variant]}</span>
        <h1>O gasóleo</h1>
        <p className="dy-sum" key={variant}>
          {variant === "preco" &&
            (stops.length ? (
              <>
                <b>
                  {stops.length} {stops.length === 1 ? "paragem" : "paragens"} para abastecer
                </b>{" "}
                · {Math.round(litres)} L · {money(spend)}
                {saving >= 1 ? (
                  <>
                    {" · "}
                    <b data-tone="ok">a ±{SPAN} km havia {money(saving)} mais barato</b>
                  </>
                ) : (
                  " · são as mais baratas da zona"
                )}
                {" · "}
                <span data-tone="warn">preços oficiais · amostra</span>
              </>
            ) : (
              <b>Hoje nenhuma viagem precisa de abastecer</b>
            ))}
          {variant === "depositos" && (
            <>
              <b>{trips.length} camiões na estrada</b>
              {` · ${trips.filter((j) => j.fuel!.short).length} chegam abaixo de 25%`}
              {` · ${trips.filter((j) => j.fuel!.refuels.length).length} abastecem pelo caminho`}
              {trips.some((j) => j.fuel!.reading !== "registo") && (
                <>
                  {" · "}
                  <span data-tone="warn">níveis simulados</span>
                </>
              )}
            </>
          )}
          {variant === "gasto" && (
            <>
              <b>{Math.round(totalBurn).toLocaleString("pt-PT")} L</b> ainda hoje · <b>{money(totalCost)}</b> · <span data-tone="warn">estimado aos preços da rota</span>
            </>
          )}
        </p>
        <Variations
          options={FUEL_VARS}
          value={variant}
          onChange={(v) => {
            if (v === variant) return;
            captureRows();
            onVariant(v);
          }}
        />
      </header>

      <div className="fu-rows" key={variant}>
        {variant === "preco" &&
          stops.map((s) => {
            const foc = s.id === focus || (focus == null && s === stops[0]);
            const prices = s.near.map((c) => c.price.price);
            const lo = Math.min(s.r.pricePerL, ...prices), hi = Math.max(s.r.pricePerL, ...prices);
            const X = (km: number) => ((km - (s.r.km - SPAN)) / (2 * SPAN)) * 100;
            const Y = (p: number) => 12 + (1 - (p - lo) / (hi - lo || 1)) * 64; // cheap = low, near the road
            const cheaper = s.cheapest && s.cheapest.price.price < s.r.pricePerL - 0.005 ? s.cheapest : null;
            const save = cheaper ? (s.r.pricePerL - cheaper.price.price) * s.r.litres : 0;
            const cx = cheaper ? X(cheaper.km) : 0;
            const px = X(s.r.km);
            return (
              <div key={s.id} className="fu-row" data-row={s.id} data-focus={foc || undefined}>
                <span className="fu-who">
                  <i className="fu-sq" data-fu-focus={foc || undefined} aria-hidden />
                  <span>
                    <b>{s.r.name.split(" · ")[1] ?? "Paragem"}</b>
                    <small>{title(s.r.name.split(" · ")[0].split(" - ")[0])}</small>
                    <small>
                      {s.at != null ? `${clock(s.at)} · ` : ""}
                      {Math.round(s.r.litres)} L · {eurL(s.r.pricePerL)} · {money(s.r.litres * s.r.pricePerL)}
                      {s.merged ? " · junto com a pausa" : ""}
                    </small>
                    <small>
                      <em className="lnk" role="button" tabIndex={0} onClick={() => onOpen(s.job.id)}>
                        {s.job.id}
                      </em>
                      {" · "}
                      {s.job.stops[0].city} → {s.job.stops.at(-1)!.city}
                    </small>
                    {who(s.job)}
                  </span>
                </span>
                <span className="fu-lane">
                  <i className="fu-road" />
                  {[-SPAN, -SPAN / 2, 0, SPAN / 2, SPAN].map((d) => (
                    <em key={d} className="fu-km" style={{ left: `${X(s.r.km + d)}%` }}>
                      {d === 0 ? "paragem" : `${d > 0 ? "+" : "−"}${Math.abs(d)} km`}
                    </em>
                  ))}
                  {s.near.map((c) => (
                    <i key={c.station.id} className="fu-dot" data-tone={c.price.price <= lo + (hi - lo) / 3 ? "ok" : c.price.price >= hi - (hi - lo) / 3 ? "bad" : "warn"} style={{ left: `${X(c.km)}%`, top: `${Y(c.price.price)}%` }} title={`${brand(c)} · ${eurL(c.price.price)}`} />
                  ))}
                  <i className="fu-mark" style={{ left: `${px}%`, top: `${Y(s.r.pricePerL)}%` }} />
                  <em className="fu-lab" data-side={cheaper && cx > px ? "left" : "right"} style={{ left: `${px}%`, top: `${Y(s.r.pricePerL)}%` }}>
                    <b>planeada · {eurL(s.r.pricePerL)}</b>
                  </em>
                  {cheaper && (
                    <>
                      <i className="fu-mark" data-tone="ok" style={{ left: `${cx}%`, top: `${Y(cheaper.price.price)}%` }} />
                      <em className="fu-lab" data-tone="ok" data-side={cx > px ? "right" : "left"} style={{ left: `${cx}%`, top: `${Y(cheaper.price.price)}%` }}>
                        <b>
                          {brand(cheaper)} · {eurL(cheaper.price.price)}
                        </b>
                        <small>
                          {Math.abs(Math.round(cheaper.km - s.r.km))} km {cheaper.km < s.r.km ? "antes" : "depois"} · −{money(save)}
                        </small>
                      </em>
                    </>
                  )}
                </span>
                {foc && (
                  <p className="fu-why">
                    {cheaper
                      ? `A mais barata a ±${SPAN} km é ${brand(cheaper)}, ${Math.abs(Math.round(cheaper.km - s.r.km))} km ${cheaper.km < s.r.km ? "antes" : "depois"}: ${money(save)} a menos.${s.merged ? " A planeada coincide com a pausa obrigatória." : ""}`
                      : `É a mais barata a ±${SPAN} km.${s.merged ? " Coincide com a pausa obrigatória." : ""}`}{" "}
                    {s.near.length} bombas a menos de 8 km da estrada.
                  </p>
                )}
              </div>
            );
          })}
        {variant !== "preco" &&
          (variant === "depositos" ? byTank : byCost).map((j) => {
            const t = tank(j);
            const v = t.v;
            const nowP = pct(t.nowL, v.tankL), endP = pct(t.endL, v.tankL);
            const stop = v.refuels[0];
            return (
              <div key={j.id} className="fu-row" data-row={j.id}>
                <span className="fu-who">
                  <span>
                    <b>
                      {j.stops[0].city} → {j.stops.at(-1)!.city}
                    </b>
                    <small>
                      {j.id} · faltam {Math.round(Math.max(0, v.toKm - j.km))} km · {String(v.lPer100).replace(".", ",")} L/100
                    </small>
                    {who(j)}
                  </span>
                </span>
                <span className="fu-lane" data-flat>
                  {variant === "depositos" ? (
                    <>
                      <i className="fu-tank" />
                      <i className="fu-fill" data-tone={nowP < 25 ? "bad" : nowP < 40 ? "warn" : undefined} style={{ width: `${nowP * 0.6}%` }} />
                      <i className="fu-reserve" style={{ left: `${pct(v.reserveL, v.tankL) * 0.6}%` }} />
                      <i className="fu-end" data-tone={v.short ? "bad" : undefined} style={{ left: `${endP * 0.6}%` }} />
                      <em className="fu-col" style={{ left: "64%" }}>
                        <b>
                          {nowP}% · {Math.round(t.nowL)} L
                        </b>{" "}
                        {v.reading !== "registo" && <span data-tone="mute">({v.reading})</span>}
                      </em>
                      <em className="fu-col" data-tone={v.short ? "bad" : stop ? "ok" : undefined} style={{ left: "64%", top: "74%" }}>
                        {stop ? `abastece ${Math.round(stop.litres)} L em ${(stop.name.split(" · ")[1] ?? title(stop.name.split(" · ")[0])).split(" ")[0]}` : "não precisa de parar"} · chega com {endP}%
                      </em>
                    </>
                  ) : (
                    <>
                      <i className="fu-cost" style={{ width: `${((t.cost ?? 0) / maxCost) * 56}%` }} />
                      {stop && <i className="fu-cost" data-bought style={{ width: `${((stop.litres * stop.pricePerL) / maxCost) * 56}%` }} />}
                      <em className="fu-col" style={{ left: "64%" }}>
                        <b>{t.cost != null ? money(t.cost) : "—"}</b> · {Math.round(t.burn)} L{t.priceRef != null ? ` a ${eurL(t.priceRef)}` : ""}
                      </em>
                      <em className="fu-col" data-tone={stop ? "ok" : undefined} style={{ left: "64%", top: "74%" }}>
                        {stop ? `${money(stop.litres * stop.pricePerL)} na paragem` : "do que já leva no depósito"}
                      </em>
                    </>
                  )}
                </span>
              </div>
            );
          })}
      </div>
      <p className="fu-foot">{variant === "preco" ? "mais abaixo = mais barato · verde, amarelo, vermelho por terço do preço · a paragem é escolhida pelo motor das rotas" : variant === "depositos" ? "barra = depósito agora · traço vermelho = reserva · argola = à chegada" : "barra clara = o que falta queimar hoje · escura = o que se paga na paragem"}</p>
    </div>
  );
}
