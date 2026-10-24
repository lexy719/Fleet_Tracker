// Garagem: the palco whose primary category is the truck. One line per truck; the question it answers is
// "which trucks can I use?", in one variation at a time:
//   Ocupação             — busy or free: today and tomorrow in hours, the next 12 days folded.
//   Oficina e validades  — the countdown to the next due date (inspection, insurance, tachograph), 3 months.
//   Uso                  — km in the last 7 days, time parked, consumption against the fleet's average.
// Validities and use are simulated (the store keeps no inspection dates or odometer history for trucks yet).
// Drivers and trips are links to their own palcos, not layers here. The truck you tapped comes first, open.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { allTrucks, clock, driverWorld } from "./model";
import type { Row } from "./types";
import { palcoFlight } from "./Layers";
import { Variations, usePalcoEntrance, useRowFlip } from "./palco";

export type GarageVar = "ocup" | "ofi" | "uso";
export const GARAGE_VARS: [GarageVar, string][] = [
  ["ocup", "Ocupação"],
  ["ofi", "Oficina e validades"],
  ["uso", "Uso"],
];

/** Where the tapped plate was on screen (set by the palco it came from), so it can fly into its line here. */
export const plateFlight: { from: DOMRect | null } = { from: null };

const hash = (s: string) => {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h;
};
/** Simulated validities, deterministic per plate (clearly labelled in the UI). */
function validities(plate: string): { k: string; name: string; days: number }[] {
  const h = hash(plate);
  return [
    { k: "ins", name: "inspeção", days: 1 + (h % 40) },
    { k: "seg", name: "seguro", days: 12 + (h % 170) },
    { k: "tac", name: "tacógrafo", days: 25 + (h % 300) },
  ];
}
/** Simulated use of the last 7 days, deterministic per plate. */
function useOf(plate: string, busy: boolean) {
  const h = hash(plate + "u");
  const km7 = busy ? 1800 + (h % 1200) : h % 1100;
  return { km7, idleH: busy ? 6 + (h % 20) : 30 + (h % 140), l100: 28.5 + (h % 70) / 10 };
}
const thousands = (n: number) => Math.round(n).toLocaleString("pt-PT");
const dias = (d: number) => (d === 1 ? "amanhã" : `em ${d} dias`);
const FLEET_L100 = 31.2;
/** "Mercedes" + "-Benz Actros 1845 …" → "Mercedes-Benz Actros 1845"; no parentheses. */
const modelName = (make: string, model: string) =>
  (model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`)
    .replace(/\s+-/, "-")
    .replace(/\s*\(.*\)\s*/, "")
    .split(" ")
    .slice(0, 3)
    .join(" ");

export function GarageScene({
  jobs,
  now,
  focus,
  variant,
  onVariant,
  onOpen,
  onDriver,
}: {
  jobs: Row[];
  now: number;
  /** The tapped truck (first, open); null when the Garagem was opened from the sidebar. */
  focus: string | null;
  variant: GarageVar;
  onVariant: (v: GarageVar) => void;
  onOpen: (jobId: string) => void;
  onDriver: (driverId: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  usePalcoEntrance(root);
  const captureRows = useRowFlip(root, variant);
  const day0 = now - (((now % 1440) + 1440) % 1440);
  const A0 = now - 150, A1 = day0 + 2880;
  // Ocupação: today and tomorrow get most of the width (hours), the next 12 days are folded at the end.
  const pO = (m: number) => (m <= A1 ? ((Math.max(m, A0) - A0) / (A1 - A0)) * 72 : 75 + (Math.min(m - A1, 12 * 1440) / (12 * 1440)) * 25);
  // Oficina e validades: 14 days wide, then up to 3 months folded.
  const pV = (d: number) => (d <= 14 ? (d / 14) * 72 : 75 + ((Math.min(d, 90) - 14) / 76) * 25);

  const trucks = allTrucks().map((t) => {
    const trips = jobs.filter((j) => j.truckId === t.id && j.status !== "delivered" && j.forecast.final != null);
    const onRoad = trips.find((j) => j.status === "in_transit" || j.status === "loading");
    const next = trips.find((j) => j !== onRoad);
    const state: "bad" | "road" | "next" | "free" = t.availability !== "AVAILABLE" ? "bad" : onRoad ? "road" : next ? "next" : "free";
    const fuelPct = t.fuel.prov.kind === "UNKNOWN" ? null : Math.round(t.fuel.value);
    const svc = /([\d\s.]+)\s*km/.exec(t.service);
    const serviceKm = svc ? Number(svc[1].replace(/[\s.]/g, "")) - t.odometer.value : null;
    const valid = validities(t.plate);
    const nearest = [...valid].sort((a, b) => a.days - b.days)[0];
    return { t, trips, onRoad, next, state, fuelPct, serviceKm, valid, nearest, use: useOf(t.plate, state === "road" || state === "next") };
  });
  type T = (typeof trucks)[number];
  const group: Record<GarageVar, (x: T) => string> = {
    ocup: (x) => ({ next: "Saem hoje", road: "Em viagem", free: "Livres", bad: "Oficina" })[x.state],
    ofi: (x) => (x.state === "bad" ? "Na oficina" : x.nearest.days <= 14 ? "A vencer em 14 dias" : "Em dia"),
    uso: (x) => (x.state === "bad" ? "Na oficina" : x.use.km7 >= 1000 ? "A trabalhar" : "Pouco usados"),
  };
  const groups: Record<GarageVar, string[]> = {
    ocup: ["Saem hoje", "Em viagem", "Livres", "Oficina"],
    ofi: ["A vencer em 14 dias", "Em dia", "Na oficina"],
    uso: ["A trabalhar", "Pouco usados", "Na oficina"],
  };
  const within: Record<GarageVar, (a: T, b: T) => number> = {
    ocup: (a, b) => (a.onRoad?.forecast.final ?? a.next?.forecast.start ?? 0) - (b.onRoad?.forecast.final ?? b.next?.forecast.start ?? 0),
    ofi: (a, b) => a.nearest.days - b.nearest.days,
    uso: (a, b) => b.use.km7 - a.use.km7,
  };
  const g = group[variant];
  trucks.sort((a, b) => Number(b.t.id === focus) - Number(a.t.id === focus) || groups[variant].indexOf(g(a)) - groups[variant].indexOf(g(b)) || within[variant](a, b));
  const count = (s: string) => trucks.filter((x) => x.state === s).length;
  const dueSoon = trucks.filter((x) => x.state !== "bad" && x.nearest.days <= 14).length;
  const dueTomorrow = trucks.filter((x) => x.valid.some((v) => v.days <= 1)).length;
  const kmWeek = trucks.reduce((a, x) => a + x.use.km7, 0);
  const parked = trucks.filter((x) => x.state !== "bad" && x.use.idleH >= 72).length;

  // The tapped plate flies from where it was into its line.
  useLayoutEffect(() => {
    const from = plateFlight.from;
    plateFlight.from = null;
    const el = root.current?.querySelector<HTMLElement>("[data-gar-focus]");
    if (!from || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    el.animate(
      [
        { transform: `translate(${from.left - r.left}px, ${from.top - r.top}px) scale(${from.width / r.width}, ${from.height / r.height})`, transformOrigin: "0 0" },
        { transform: "none", transformOrigin: "0 0" },
      ],
      { duration: 900, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "backwards" },
    );
  }, []);

  const person = (driverId: string | null) =>
    driverId ? (
      <em
        className="lnk"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          palcoFlight.from = e.currentTarget.getBoundingClientRect();
          onDriver(driverId);
        }}
      >
        {driverWorld(driverId).name}
      </em>
    ) : null;
  /** A label after a mark; past 62% of the lane it sits above the line, ending at the mark. */
  const label = (pct: number, children: ReactNode, tone?: string) => (
    <em className="gg-lab" data-tone={tone} data-left={pct > 62 || undefined} style={{ left: `${pct}%` }}>
      {children}
    </em>
  );

  const lane = (x: T) => {
    if (variant === "ocup") {
      const nowP = pO(now);
      if (x.state === "bad") return [<i key="m" className="gg-bar" data-kind="shop" style={{ left: `${nowP}%`, width: `${100 - nowP}%` }} />, <em key="l" className="gg-lab" data-up data-tone="bad" style={{ left: `${nowP}%` }}>na oficina{x.t.service ? ` · ${x.t.service}` : ""}</em>];
      if (x.state === "free") return [<i key="m" className="gg-bar" data-kind="free" style={{ left: `${nowP}%`, width: `${100 - nowP}%` }} />, <em key="l" className="gg-lab" data-up data-tone="ok" style={{ left: `${nowP}%` }}>livre</em>];
      return x.trips.map((j) => {
        const a = pO(j.status === "in_transit" || j.status === "loading" ? A0 : (j.forecast.start ?? j.forecast.trace[0]?.from ?? now)), b = pO(j.forecast.final!);
        return (
          <span key={j.id}>
            <button className="gg-bar" data-kind="trip" style={{ left: `${a}%`, width: `max(8px, ${b - a}%)` }} onClick={() => onOpen(j.id)} title={`Abrir ${j.id}`} />
            <i className="gg-end" style={{ left: `${b}%` }} />
            {label(
              b,
              <>
                <b>{clock(j.forecast.final!)}</b> {j.id} · {j.stops[0].city} → {j.stops.at(-1)!.city} · {person(j.driverId)}
              </>,
            )}
          </span>
        );
      });
    }
    if (variant === "ofi") {
      if (x.state === "bad")
        return [<i key="m" className="gg-bar" data-kind="shop" style={{ left: "0%", width: "100%" }} />, <em key="l" className="gg-lab" data-up data-tone="bad" style={{ left: "0%" }}>na oficina{x.t.service ? ` · ${x.t.service}` : ""}</em>];
      const soon = x.valid.filter((v) => v.days <= 30).sort((a, b) => a.days - b.days);
      const tone = x.nearest.days <= 2 ? "bad" : x.nearest.days <= 14 ? "warn" : undefined;
      return [
        <i key="m" className="gg-bar" data-kind="count" data-tone={tone} style={{ left: "0%", width: `${pV(x.nearest.days)}%` }} />,
        ...x.valid.filter((v) => v.days <= 90).map((v) => <i key={v.k} className="gg-dia" data-tone={v.days <= 2 ? "bad" : v.days <= 14 ? "warn" : undefined} style={{ left: `${pV(v.days)}%` }} title={`${v.name} ${dias(v.days)} (simulado)`} />),
        <em key="l" className="gg-lab" data-up data-tone={tone} style={{ left: "0%" }}>
          {soon.length ? soon.map((v) => `${v.name} ${dias(v.days)}`).join(" · ") : `tudo em dia · próxima: ${x.nearest.name} em ${x.nearest.days} dias`}
          {x.serviceKm != null && ` · revisão em ${thousands(x.serviceKm)} km`}
        </em>,
      ];
    }
    const u = x.use;
    const w = Math.max(0.6, (u.km7 / 3000) * 52);
    const delta = (u.l100 - FLEET_L100) / FLEET_L100;
    return [
      <i key="m" className="gg-bar" data-kind="km" data-low={u.km7 < 1000 || undefined} style={{ left: "0%", width: `${w}%` }} />,
      <em key="k" className="gg-lab" style={{ left: `${w}%` }}>
        <b>{thousands(u.km7)} km</b>
      </em>,
      <em key="i" className="gg-col" data-tone={x.state !== "bad" && u.idleH >= 72 ? "warn" : undefined} style={{ left: "64%" }}>
        {x.state === "bad" ? "na oficina" : u.idleH >= 72 ? `${Math.round(u.idleH / 24)} dias` : `${u.idleH} h`}
      </em>,
      <em key="c" className="gg-col" style={{ left: "80%" }}>
        {u.l100.toFixed(1).replace(".", ",")} L/100
        {Math.abs(delta) >= 0.05 && (
          <span data-tone={delta > 0 ? "bad" : "ok"}>
            {" "}
            {delta > 0 ? "+" : "−"}
            {Math.round(Math.abs(delta) * 100)}%
          </span>
        )}
      </em>,
    ];
  };

  const why = (x: T) => {
    const parts: (string | false | null)[] =
      variant === "ocup"
        ? [x.onRoad ? `termina a ${x.onRoad.id} às ${clock(x.onRoad.forecast.final!)} em ${x.onRoad.stops.at(-1)!.city}` : x.next ? `sai às ${clock(x.next.forecast.start ?? x.next.forecast.trace[0]?.from ?? now)} com a ${x.next.id}, volta às ${clock(x.next.forecast.final!)}` : "sem viagens marcadas", `inspeção ${dias(x.valid[0].days)} (simulado)`]
        : variant === "ofi"
          ? [...x.valid.map((v) => `${v.name} ${dias(v.days)}`), x.serviceKm != null ? `revisão em ${thousands(x.serviceKm)} km` : `revisão: ${x.t.service || "sem data"}`, "simulado"]
          : [`${thousands(x.use.km7)} km esta semana`, `${x.use.l100.toFixed(1).replace(".", ",")} L/100 (média da frota ${FLEET_L100.toFixed(1).replace(".", ",")})`, x.fuelPct != null && `${x.fuelPct}% de gasóleo`, "simulado"];
    return parts.filter(Boolean).join(" · ");
  };

  let lastGroup = "";
  const nowP = pO(now);
  return (
    <div className="gar-stage gg" ref={root} data-var={variant} style={{ ["--now-x" as string]: `${nowP}%` }}>
      <header className="dy-head">
        <span className="cn-eyebrow">Camiões · {{ ocup: "ocupação, hoje até 14 dias", ofi: "oficina e validades, próximos 3 meses", uso: "uso nos últimos 7 dias" }[variant]}</span>
        <h1>A garagem</h1>
        <p className="dy-sum" key={variant}>
          {variant === "ocup" && (
            <>
              <b>{trucks.length} camiões</b> · {count("road")} em viagem · {count("next")} com viagem marcada
              {count("bad") > 0 && (
                <>
                  {" · "}
                  <b data-tone="bad">{count("bad")} na oficina</b>
                </>
              )}
              {" · "}
              <b data-tone="ok">{count("free")} livres</b>
            </>
          )}
          {variant === "ofi" && (
            <>
              <b>{dueSoon} a vencer em 14 dias</b>
              {dueTomorrow > 0 && (
                <>
                  {" · "}
                  <b data-tone="bad">{dueTomorrow} amanhã</b>
                </>
              )}
              {count("bad") > 0 && ` · ${count("bad")} na oficina`} · <span data-tone="warn">simulado</span>
            </>
          )}
          {variant === "uso" && (
            <>
              <b>{thousands(kmWeek)} km</b> nos últimos 7 dias
              {parked > 0 && (
                <>
                  {" · "}
                  <b data-tone="warn">{parked} parados mais de 3 dias</b>
                </>
              )}{" "}
              · <span data-tone="warn">simulado</span>
            </>
          )}
        </p>
        <Variations
          options={GARAGE_VARS}
          value={variant}
          onChange={(v) => {
            if (v === variant) return;
            captureRows();
            onVariant(v);
          }}
        />
      </header>

      <div className="gg-grid">
        <div className="gg-axis" key={variant}>
          {variant === "ocup" && (
            <>
              <span className="gg-day" style={{ left: "0%" }}>
                hoje
              </span>
              <span className="gg-day" style={{ left: `${pO(day0 + 1440)}%` }}>
                amanhã
              </span>
              <span className="gg-day" style={{ left: "75%" }}>
                próximos 12 dias
              </span>
              {[4, 8, 12, 16, 20].flatMap((h) => [day0 + h * 60, day0 + 1440 + h * 60]).filter((m) => m > A0 + 30 && Math.abs(pO(m) - nowP) > 5.5).map((m) => (
                <span key={m} className="gg-tick" style={{ left: `${pO(m)}%` }}>
                  {clock(m)}
                </span>
              ))}
              <span className="gg-now-tag" style={{ left: `${nowP}%` }}>
                {clock(now)}
              </span>
            </>
          )}
          {variant === "ofi" && (
            <>
              <span className="gg-day" style={{ left: "0%" }}>
                próximos 14 dias
              </span>
              <span className="gg-day" style={{ left: "75%" }}>
                até 3 meses
              </span>
              {[2, 4, 7, 14, 30, 60, 90].map((d) => (
                <span key={d} className="gg-tick" data-end={d === 90 || undefined} style={{ left: `${pV(d)}%` }}>
                  +{d} d
                </span>
              ))}
            </>
          )}
          {variant === "uso" && (
            <>
              <span className="gg-day" style={{ left: "0%" }}>
                km nos últimos 7 dias
              </span>
              <span className="gg-day" style={{ left: "64%" }}>
                parado
              </span>
              <span className="gg-day" style={{ left: "80%" }}>
                consumo
              </span>
            </>
          )}
        </div>
        <div className="gg-rules" key={`r${variant}`}>
          {variant === "ocup" && <i className="gg-now" style={{ left: `${nowP}%` }} />}
          {variant === "ocup" && <i className="gg-mid" style={{ left: `${pO(day0 + 1440)}%` }} />}
          {variant !== "uso" && <i className="gg-fold" style={{ left: "73.5%" }} />}
        </div>
        <div className="gg-rows">
          {trucks.map((x, i) => {
            const foc = x.t.id === focus;
            const grp = foc ? "Em foco" : g(x);
            const head = grp !== lastGroup;
            lastGroup = grp;
            const can = x.state !== "bad" && x.valid[0].days > 1;
            return (
              <div key={x.t.id} className="gg-block" data-row={x.t.id}>
                {head && <span className="gg-group">{grp}</span>}
                <div className="gg-row" data-focus={foc || undefined} data-state={x.state} style={{ animationDelay: `${0.25 + i * 0.04}s` }}>
                  <span className="gg-who">
                    <span className="gar-plate" data-gar-focus={foc || undefined}>
                      {x.t.plate}
                    </span>
                    <span className="gg-model">
                      <b>{modelName(x.t.make, x.t.model)}</b>
                      <small>{x.t.odometer.value ? `${thousands(x.t.odometer.value / 1000)} mil km` : "km por registar"}</small>
                    </span>
                  </span>
                  <span className="gg-lane" key={variant}>
                    {lane(x)}
                  </span>
                  {foc && (
                    <div className="gg-open">
                      <p className="gar-q">
                        Pode sair amanhã? <b data-tone={can ? "ok" : "bad"}>{can ? "Sim" : x.state === "bad" ? "Não, está na oficina" : "Só depois da inspeção"}</b>
                        <span className="gar-why" key={variant}>
                          {why(x)}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
