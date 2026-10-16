import { useState, type ReactNode } from "react";
import type { VehiclePart } from "../guidedWorkspace";

/**
 * Technical side elevation of an articulated tractor + curtain-side semitrailer,
 * drawn in metres from the vehicle facts (16.50 m, 4.00 m, 5 axles, 13.6 m trailer).
 * Schematic, not CAD: enough form to read as a modern truck at a glance.
 */
export type LoadGroup = {
  city: string;
  pallets: number;
  kg: number;
  /** 1 = first drop. */
  order: number;
  adr?: string;
  tempC?: [number, number];
};
export type Aspect = "load" | "restriction" | "fuel";
type RuleMark = { outcome: "yes" | "no" | "unknown"; label: string; value: string };

const L = 16.5;
const H = 4.0;
const TRAILER = 13.6;
const AXLES = [1.35, 5.0, 12.4, 13.7, 15.0];
const WHEEL_R = 0.53;
const PAD_R = 2.2;
const TOP = 0.95;
const GY = H + TOP; // ground line in SVG units
const Y = (h: number) => GY - h;

const TRAILER_FRONT = L - TRAILER;
const FLOOR = 1.32;
const ROWS = 11;
const ROW_LEN = (TRAILER - 0.36) / ROWS;
const KINGPIN = 4.72;

export function VehicleDrawing({
  aspect,
  part,
  groups,
  capacity,
  grossKg,
  firstAxleKnown,
  firstAxleM,
  clearanceM,
  fuelReadPct,
  fuelNowPct,
  rules,
  onPart,
  annotations = true,
  trailerMissing = false,
}: {
  aspect: Aspect;
  part?: VehiclePart;
  groups: LoadGroup[];
  capacity: number;
  grossKg: number;
  firstAxleKnown: boolean;
  firstAxleM: number | null;
  clearanceM?: number;
  fuelReadPct: number;
  fuelNowPct: number;
  rules: Partial<Record<VehiclePart, RuleMark>>;
  onPart?: (part: VehiclePart) => void;
  annotations?: boolean;
  /** The assigned trailer does not exist: draw only its outline, never a substitute. */
  trailerMissing?: boolean;
}) {
  const [hover, setHover] = useState<{ text: ReactNode; x: number; h: number } | null>(null);
  // The restriction question reserves room left of the cab for the first-axle dimension.
  const PAD_L = 0.9;
  const VB_W = L + PAD_L + PAD_R;
  // The restriction question adds a row under the vehicle for part-bound facts.
  const VB_H = GY + (aspect === "restriction" ? 1.95 : 1.05);
  const X = (m: number) => PAD_L + m;
  const P = (x: number, h: number) => `${X(x).toFixed(3)} ${Y(h).toFixed(3)}`;
  const pct = (x: number, h: number) => ({ left: `${(X(x) / VB_W) * 100}%`, top: `${(Y(h) / VB_H) * 100}%` });
  // Pallet rows fill from the front bulkhead; the first drop is loaded last (door side).
  const ordered = [...groups].sort((a, b) => b.order - a.order);
  const rows: { group: LoadGroup | null; index: number }[] = [];
  let r = 0;
  for (const g of ordered) {
    const n = Math.ceil(g.pallets / 3);
    for (let i = 0; i < n; i++) rows.push({ group: g, index: r++ });
  }
  while (r < ROWS) rows.push({ group: null, index: r++ });
  const rowX = (i: number) => TRAILER_FRONT + 0.18 + i * ROW_LEN;
  const focus = (p: VehiclePart) => (part ? (part === p ? "focus" : "dim") : undefined);
  const restriction = aspect === "restriction";
  const hoverOn = (text: ReactNode, x: number, h: number) => () => setHover({ text, x, h });
  const off = () => setHover(null);
  const tank = { x0: 2.5, x1: 3.98, h0: 0.5, h1: 1.0 };
  const fuelH = (p: number) => tank.h0 + ((tank.h1 - tank.h0) * p) / 100;

  return (
    <div className="fx-vd" data-aspect={aspect} data-part={part ?? "none"} data-trailer-missing={trailerMissing}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label="Alçado técnico do conjunto trator e semirreboque">
        <defs>
          <pattern id="vd-hatch" width="0.16" height="0.16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.16" className="vd-hatch-line" />
          </pattern>
          <linearGradient id="vd-glass" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" className="vd-glass-a" />
            <stop offset="1" className="vd-glass-b" />
          </linearGradient>
        </defs>

        {/* ground */}
        <line x1={0.15} x2={VB_W - 0.15} y1={GY} y2={GY} className="vd-ground" />
        <g className="vd-ground-ticks">
          {Array.from({ length: 18 }, (_, i) => (
            <line key={i} x1={X(i)} x2={X(i)} y1={GY} y2={GY + 0.07} />
          ))}
        </g>

        {/* ── semitrailer ─────────────────────────────────────────── */}
        <g className="vd-trailer">
          {/* chassis beam + gooseneck */}
          <rect x={X(5.55)} y={Y(FLOOR)} width={15.95 - 5.55} height={0.15} className="vd-steel" />
          <rect x={X(TRAILER_FRONT + 0.4)} y={Y(FLOOR)} width={5.6 - TRAILER_FRONT - 0.4} height={0.1} className="vd-steel" />
          {/* kingpin plate */}
          <rect x={X(KINGPIN - 0.35)} y={Y(FLOOR)} width={0.7} height={0.06} className="vd-steel-dark" />
          {/* landing legs */}
          <g className="vd-legs">
            <line x1={X(6.05)} x2={X(6.05)} y1={Y(1.18)} y2={Y(0.36)} />
            <line x1={X(6.18)} x2={X(6.18)} y1={Y(1.18)} y2={Y(0.36)} />
            <rect x={X(5.9)} y={Y(0.36)} width={0.43} height={0.07} />
            <line x1={X(6.18)} x2={X(6.42)} y1={Y(0.95)} y2={Y(0.95)} />
          </g>
          {/* lateral protection */}
          <rect x={X(6.5)} y={Y(0.9)} width={11.55 - 6.5} height={0.06} className="vd-steel-light" />
          <rect x={X(6.5)} y={Y(0.62)} width={11.55 - 6.5} height={0.06} className="vd-steel-light" />
          {/* body */}
          <path
            d={`M${P(TRAILER_FRONT, FLOOR)} L${P(TRAILER_FRONT, H - 0.12)} Q${P(TRAILER_FRONT, H)} ${P(TRAILER_FRONT + 0.12, H)} L${P(L - 0.02, H)} L${P(L - 0.02, FLOOR)} Z`}
            className="vd-body"
          />
          {/* curtain folds */}
          {Array.from({ length: 10 }, (_, i) => (
            <line key={i} x1={X(TRAILER_FRONT + 1.25 + i * 1.3)} x2={X(TRAILER_FRONT + 1.25 + i * 1.3)} y1={Y(H - 0.16)} y2={Y(FLOOR + 0.18)} className="vd-fold" />
          ))}
          {/* cargo silhouettes (visible through the curtain: light cutaway) */}
          <g className="vd-cargo">
            {rows.map(({ group, index }) => {
              const x0 = rowX(index);
              if (!group)
                return (
                  <rect key={index} x={X(x0) + 0.03} y={Y(FLOOR + 1.62)} width={ROW_LEN - 0.06} height={1.58} className="vd-slot-empty" />
                );
              const first = group.order === 1;
              const goodsH = 1.18 + Math.min(0.42, (group.kg / group.pallets / 650) * 0.42);
              return (
                <g
                  key={index}
                  className="vd-row"
                  data-drop={first ? "first" : "later"}
                  data-group={group.city}
                  onMouseEnter={hoverOn(
                    <>
                      <b>{group.city}</b> · {group.pallets} paletes · {(group.kg / 1000).toLocaleString("pt-PT")} t ·{" "}
                      {first ? "descarrega primeiro" : `descarga ${group.order}`}
                    </>,
                    x0 + ROW_LEN / 2,
                    FLOOR + 2.1,
                  )}
                  onMouseLeave={off}
                >
                  <rect x={X(x0) + 0.04} y={Y(FLOOR + 0.16)} width={ROW_LEN - 0.08} height={0.14} className="vd-pallet-base" />
                  <rect x={X(x0) + 0.06} y={Y(FLOOR + 0.16 + goodsH)} width={ROW_LEN - 0.12} height={goodsH} rx={0.03} className="vd-goods" />
                  <line x1={X(x0) + 0.06} x2={X(x0) + ROW_LEN - 0.06} y1={Y(FLOOR + 0.16 + goodsH * 0.5)} y2={Y(FLOOR + 0.16 + goodsH * 0.5)} className="vd-wrap" />
                </g>
              );
            })}
          </g>
          {/* rails */}
          <rect x={X(TRAILER_FRONT)} y={Y(FLOOR + 0.17)} width={TRAILER - 0.02} height={0.17} className="vd-rail" />
          <rect x={X(TRAILER_FRONT + 0.06)} y={Y(H)} width={TRAILER - 0.1} height={0.12} className="vd-rail" />
          {/* curtain straps */}
          {Array.from({ length: 21 }, (_, i) => (
            <line key={i} x1={X(TRAILER_FRONT + 0.55 + i * 0.62)} x2={X(TRAILER_FRONT + 0.55 + i * 0.62)} y1={Y(FLOOR + 0.17)} y2={Y(FLOOR + 0.45)} className="vd-strap" />
          ))}
          {/* rear doors + hinges + lights */}
          <rect x={X(L - 0.2)} y={Y(H)} width={0.18} height={H - FLOOR} className="vd-door" />
          {[1.9, 2.8, 3.6].map((h) => (
            <rect key={h} x={X(L - 0.06)} y={Y(h)} width={0.06} height={0.08} className="vd-steel-dark" />
          ))}
          <rect x={X(L - 0.16)} y={Y(1.02)} width={0.14} height={0.12} className="vd-light" />
          {/* underrun bar */}
          <line x1={X(L - 0.28)} x2={X(L - 0.28)} y1={Y(FLOOR)} y2={Y(0.55)} className="vd-bracket" />
          <rect x={X(L - 0.5)} y={Y(0.58)} width={0.46} height={0.13} rx={0.02} className="vd-steel-dark" />
          {/* mudguard over the tri-axle */}
          <path d={`M${P(11.72, 1.06)} L${P(11.72, 1.14)} L${P(15.68, 1.14)} L${P(15.68, 1.06)}`} className="vd-mudguard" />
        </g>

        {/* ── tractor ─────────────────────────────────────────────── */}
        <g className="vd-tractor">
          {/* chassis rail */}
          <rect x={X(0.32)} y={Y(1.2)} width={6.15 - 0.32} height={0.22} className="vd-steel" />
          {/* fifth wheel */}
          <g data-part="fifth">
            <rect x={X(KINGPIN - 0.48)} y={Y(1.33)} width={0.96} height={0.1} rx={0.02} className="vd-steel-dark" />
            <rect x={X(KINGPIN - 0.3)} y={Y(1.23)} width={0.6} height={0.05} className="vd-steel" />
          </g>
          {/* fuel tank */}
          <g
            className="vd-tank"
            data-emph={aspect === "fuel"}
            onMouseEnter={hoverOn(
              <>
                Depósito 430 L · leitura manual {fuelReadPct}% às 06:30 · agora ≈ {Math.round(fuelNowPct)}% <em>assumido</em>
              </>,
              (tank.x0 + tank.x1) / 2,
              1.3,
            )}
            onMouseLeave={off}
          >
            <rect x={X(tank.x0)} y={Y(tank.h1)} width={tank.x1 - tank.x0} height={tank.h1 - tank.h0} rx={0.12} className="vd-tank-shell" />
            {aspect === "fuel" && (
              <>
                <rect x={X(tank.x0) + 0.04} y={Y(fuelH(fuelNowPct))} width={tank.x1 - tank.x0 - 0.08} height={fuelH(fuelNowPct) - tank.h0 - 0.02} className="vd-fuel-now" />
                <line x1={X(tank.x0) - 0.08} x2={X(tank.x1) + 0.08} y1={Y(fuelH(fuelReadPct))} y2={Y(fuelH(fuelReadPct))} className="vd-fuel-read" />
              </>
            )}
            {[2.85, 3.62].map((x) => (
              <line key={x} x1={X(x)} x2={X(x)} y1={Y(tank.h1)} y2={Y(tank.h0)} className="vd-strap-dark" />
            ))}
          </g>
          {/* battery / AdBlue box */}
          <rect x={X(4.02)} y={Y(1.0)} width={0.36} height={0.42} rx={0.04} className="vd-box" />
          {/* drive-axle mudguard */}
          <path d={`M${P(4.38, 1.02)} L${P(4.38, 1.12)} L${P(5.62, 1.12)} L${P(5.62, 0.98)}`} className="vd-mudguard" />
          {/* cab */}
          <path
            d={[
              `M${P(0.06, 0.42)}`,
              `L${P(0.6, 0.42)}`,
              `L${P(0.6, 0.56)}`,
              `A0.75 0.75 0 0 1 ${P(2.1, 0.56)}`,
              `L${P(2.1, 1.16)}`,
              `L${P(2.34, 1.16)}`,
              `L${P(2.34, 3.78)}`,
              `Q${P(2.33, 3.87)} ${P(2.2, 3.88)}`,
              `L${P(0.64, 3.88)}`,
              `Q${P(0.4, 3.87)} ${P(0.33, 3.64)}`,
              `L${P(0.19, 3.06)}`,
              `L${P(0.07, 2.2)}`,
              `L${P(0.03, 1.02)}`,
              `Q${P(0.0, 0.94)} ${P(0.0, 0.82)}`,
              `L${P(0.0, 0.5)}`,
              `Q${P(0.0, 0.42)} ${P(0.06, 0.42)}`,
              "Z",
            ].join(" ")}
            className="vd-cab"
          />
          {/* roof deflector */}
          <path d={`M${P(0.95, 3.88)} Q${P(1.75, 3.99)} ${P(2.34, 4.0)} L${P(2.34, 3.88)} Z`} className="vd-cab-trim" />
          {/* windscreen sliver + side window + door */}
          <path d={`M${P(0.09, 2.24)} L${P(0.2, 3.02)} L${P(0.34, 3.02)} L${P(0.23, 2.24)} Z`} className="vd-glass" />
          <path d={`M${P(0.46, 2.26)} L${P(0.58, 3.02)} L${P(1.52, 3.02)} Q${P(1.6, 3.02)} ${P(1.6, 2.94)} L${P(1.6, 2.26)} Z`} className="vd-glass" />
          <path d={`M${P(0.44, 1.32)} L${P(0.44, 3.1)} L${P(1.68, 3.1)} L${P(1.68, 1.32)}`} className="vd-panel-line" />
          <line x1={X(1.45)} x2={X(1.58)} y1={Y(2.05)} y2={Y(2.05)} className="vd-handle" />
          {/* sleeper window */}
          <rect x={X(1.86)} y={Y(3.0)} width={0.3} height={0.42} rx={0.04} className="vd-glass" />
          {/* grille, lamp, bumper */}
          {[1.32, 1.5, 1.68, 1.86].map((h) => (
            <line key={h} x1={X(0.03)} x2={X(0.3)} y1={Y(h)} y2={Y(h)} className="vd-grille" />
          ))}
          <rect x={X(0.02)} y={Y(1.14)} width={0.26} height={0.12} rx={0.03} className="vd-lamp" />
          <rect x={X(0.0)} y={Y(0.86)} width={0.62} height={0.4} rx={0.05} className="vd-bumper" />
          {/* mirror */}
          <line x1={X(0.12)} x2={X(-0.2)} y1={Y(2.6)} y2={Y(2.66)} className="vd-handle" />
          <rect x={X(-0.32)} y={Y(2.82)} width={0.13} height={0.6} rx={0.03} className="vd-mirror" />
          {/* steps behind the front wheel */}
          <rect x={X(2.1)} y={Y(0.78)} width={0.22} height={0.05} className="vd-steel-dark" />
          <rect x={X(2.1)} y={Y(1.02)} width={0.22} height={0.05} className="vd-steel-dark" />
        </g>

        {/* ── wheels ──────────────────────────────────────────────── */}
        {AXLES.map((a, i) => {
          const mark = i === 0 ? rules.firstAxle : rules.axles;
          const emph = restriction && (i === 0 ? rules.firstAxle : rules.axles);
          return (
            <g
              key={a}
              className="vd-wheel"
              data-index={i + 1}
              data-rule={emph ? mark?.outcome : undefined}
              data-focus={i === 0 ? focus("firstAxle") : focus("axles")}
              onMouseEnter={hoverOn(
                i === 0 ? (
                  <>
                    Eixo 1 · direção · altura ao eixo {firstAxleKnown ? `${firstAxleM?.toFixed(2).replace(".", ",")} m` : <b>desconhecida</b>}
                  </>
                ) : (
                  <>
                    Eixo {i + 1} · {i === 1 ? "tração (rodado duplo)" : "semirreboque"}
                  </>
                ),
                a,
                1.35,
              )}
              onMouseLeave={off}
              onClick={() => onPart?.(i === 0 ? "firstAxle" : "axles")}
            >
              <circle cx={X(a)} cy={Y(WHEEL_R)} r={WHEEL_R} className="vd-tyre" />
              <circle cx={X(a)} cy={Y(WHEEL_R)} r={0.3} className="vd-rim" />
              <circle cx={X(a)} cy={Y(WHEEL_R)} r={0.11} className="vd-hub" />
              {Array.from({ length: 6 }, (_, k) => (
                <circle
                  key={k}
                  cx={X(a) + Math.cos((k * Math.PI) / 3) * 0.2}
                  cy={Y(WHEEL_R) + Math.sin((k * Math.PI) / 3) * 0.2}
                  r={0.028}
                  className="vd-lug"
                />
              ))}
              {restriction && <circle cx={X(a)} cy={Y(WHEEL_R)} r={WHEEL_R + 0.09} className="vd-axle-ring" />}
            </g>
          );
        })}

        {/* ── dimensions & restriction overlays ───────────────────── */}
        {annotations && (
          <g className="vd-dims" data-strong={restriction}>
            <line x1={X(0)} x2={X(L)} y1={GY + 0.42} y2={GY + 0.42} />
            <line x1={X(0)} x2={X(0)} y1={GY + 0.3} y2={GY + 0.54} />
            <line x1={X(L)} x2={X(L)} y1={GY + 0.3} y2={GY + 0.54} />
            <line x1={X(TRAILER_FRONT)} x2={X(TRAILER_FRONT)} y1={GY + 0.34} y2={GY + 0.5} />
            <line x1={X(L) + 0.55} x2={X(L) + 0.55} y1={Y(H)} y2={GY} />
            <line x1={X(L) + 0.42} x2={X(L) + 0.68} y1={Y(H)} y2={Y(H)} />
          </g>
        )}
        {restriction && clearanceM && (
          <g className="vd-limit" data-focus={focus("height")}>
            <line x1={X(-0.4)} x2={X(L) + 1.4} y1={Y(clearanceM)} y2={Y(clearanceM)} />
            <rect x={X(L) + 0.48} y={Y(clearanceM)} width={0.14} height={clearanceM - H} className="vd-clearance" />
          </g>
        )}
        {restriction && (
          <g className="vd-firstaxle" data-known={firstAxleKnown} data-focus={focus("firstAxle")}>
            <line x1={X(AXLES[0]) - 0.75} x2={X(AXLES[0]) - 0.75} y1={GY} y2={Y(WHEEL_R)} />
            <line x1={X(AXLES[0]) - 0.9} x2={X(AXLES[0]) - 0.6} y1={Y(WHEEL_R)} y2={Y(WHEEL_R)} />
            <line x1={X(AXLES[0]) - 0.75} x2={X(AXLES[0]) - 0.06} y1={Y(WHEEL_R)} y2={Y(WHEEL_R)} className="vd-leader" />
            <line x1={X(AXLES[0]) - 1.05} x2={X(AXLES[0]) + 0.6} y1={Y(1.1)} y2={Y(1.1)} className="vd-required" />
            <path d={`M${X(AXLES[0])} ${GY + 0.05} L${X(AXLES[0])} ${GY + 1.18}`} className="vd-leader" />
          </g>
        )}
        {restriction && (
          <g className="vd-weight" data-focus={focus("weight")}>
            <path d={`M${X(0)} ${GY + 0.66} L${X(0)} ${GY + 0.78} L${X(L)} ${GY + 0.78} L${X(L)} ${GY + 0.66}`} />
          </g>
        )}
      </svg>

      {/* HTML annotations keep a stable, readable size at every width */}
      {annotations && (
        <>
          <span className="vd-label" data-kind="dim" style={pct(L / 2, -0.52)}>
            16,50 m · conjunto articulado
          </span>
          {aspect !== "restriction" && (
            <span className="vd-label" data-kind="dim" style={pct(TRAILER_FRONT + TRAILER / 2, -0.12)}>
              semirreboque 13,60 m
            </span>
          )}
          <span className="vd-label" data-kind="dim" data-side="right" style={pct(L + 0.75, H / 2 + 0.15)}>
            4,00 m
          </span>
        </>
      )}
      {trailerMissing && (
        <span className="vd-label vd-missing" style={pct(TRAILER_FRONT + TRAILER / 2, H / 2 + 0.6)}>
          Reboque por atribuir
          <small>o reboque registado não existe na frota</small>
        </span>
      )}
      {aspect !== "restriction" && !trailerMissing && (
        <div className="vd-groups" style={{ left: `${(X(TRAILER_FRONT) / VB_W) * 100}%`, width: `${(TRAILER / VB_W) * 100}%`, top: `${(Y(H + 0.12) / VB_H) * 100}%` }}>
          {rows
            .reduce<{ g: LoadGroup | null; start: number; n: number }[]>((acc, row) => {
              const last = acc.at(-1);
              if (last && last.g === row.group) last.n++;
              else acc.push({ g: row.group, start: row.index, n: 1 });
              return acc;
            }, [])
            .map((seg) => (
              <span
                key={seg.start}
                className="vd-group"
                data-empty={!seg.g}
                data-drop={seg.g?.order === 1 ? "first" : "later"}
                style={{ left: `${(seg.start / ROWS) * 100}%`, width: `${(seg.n / ROWS) * 100}%` }}
              >
                {seg.g ? (
                  <>
                    <i>{seg.g.order}</i>
                    {seg.g.city} · {seg.g.pallets} p.
                  </>
                ) : (
                  <>{capacity - groups.reduce((s, g) => s + g.pallets, 0)} livres</>
                )}
              </span>
            ))}
        </div>
      )}
      {restriction && (
        <>
          {clearanceM && (
            <span className="vd-label" data-kind="limit" style={pct(-0.35, clearanceM + 0.34)}>
              Gabarito {clearanceM.toFixed(2).replace(".", ",")} m · altura registada 4,00 m · folga 0,30 m
            </span>
          )}
          <button data-ix="inspect"
            className="vd-label vd-callout"
            data-tone={firstAxleKnown ? "ok" : "unknown"}
            style={pct(-0.35, -1.42)}
            onClick={() => onPart?.("firstAxle")}
          >
            {firstAxleKnown ? (
              <>Altura ao 1.º eixo {firstAxleM?.toFixed(2).replace(".", ",")} m ≥ 1,10 m ✓</>
            ) : (
              <>
                <b>? ≥ 1,10 m exigido</b>
                <span>altura ao 1.º eixo não registada</span>
              </>
            )}
          </button>
          <span className="vd-label vd-axle-count" style={pct(13.7, -0.12)}>
            5 eixos contados · regra ≥ 3 ✓
          </span>
          <span className="vd-label" data-kind="weight" style={pct(L / 2, -0.98)}>
            Massa estimada do conjunto {(grossKg / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} t <em>assumida</em> · limiar 3,5 t ✓
          </span>
        </>
      )}
      {aspect === "fuel" && (
        <span className="vd-label vd-callout" data-tone="assumed" style={pct(3.24, 1.75)}>
          <b>≈ {Math.round(fuelNowPct)}% agora</b>
          <span>leitura manual {fuelReadPct}% às 06:30 (linha)</span>
        </span>
      )}
      {hover && (
        <span className="vd-tip" style={pct(hover.x, hover.h)}>
          {hover.text}
        </span>
      )}
    </div>
  );
}

/** Top-down load plan of the trailer floor: 11 rows × 3 Euro-pallet slots. */
export function LoadPlan({
  groups,
  capacity,
  focusCity,
  onGroup,
}: {
  groups: LoadGroup[];
  capacity: number;
  /** A followed delivery: its pallets stay, the others soften. */
  focusCity?: string;
  onGroup?: (city: string) => void;
}) {
  const ordered = [...groups].sort((a, b) => b.order - a.order);
  const slots: (LoadGroup | null)[] = [];
  for (const g of ordered) for (let i = 0; i < g.pallets; i++) slots.push(g);
  while (slots.length < capacity) slots.push(null);
  const rows = Math.ceil(capacity / 3);
  const used = groups.reduce((s, g) => s + g.pallets, 0);
  return (
    <figure className="fx-loadplan" aria-label="Plano de carga">
      <div className="lp-head">
        <span>Plano de carga · vista de cima</span>
        <span>
          {used}/{capacity} posições · carregado da frente · descarga pelas portas traseiras
        </span>
      </div>
      <div className="lp-body">
        <span className="lp-end" data-end="front">
          Frente
        </span>
        <div className="lp-floor" style={{ gridTemplateColumns: `repeat(${rows}, 1fr)` }}>
          {Array.from({ length: rows }, (_, col) => (
            <div key={col} className="lp-row">
              {[0, 1, 2].map((k) => {
                const g = slots[col * 3 + k];
                return (
                  <span
                    key={k}
                    className="lp-slot"
                    data-empty={!g}
                    data-drop={g ? (g.order === 1 ? "first" : "later") : undefined}
                    data-special={g?.adr ? "adr" : g?.tempC ? "temp" : undefined}
                    data-soft={!!focusCity && g?.city !== focusCity}
                    title={g ? `${g.city} · ${g.pallets} paletes · descarga ${g.order}` : "Posição livre"}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <span className="lp-end" data-end="doors">
          Portas
        </span>
      </div>
      <div className="lp-legend" style={{ gridTemplateColumns: `repeat(${rows}, 1fr)` }}>
        {(() => {
          const segs: { g: LoadGroup | null; start: number; n: number }[] = [];
          for (let col = 0; col < rows; col++) {
            const g = slots[col * 3];
            const last = segs.at(-1);
            if (last && last.g === g) last.n++;
            else segs.push({ g, start: col, n: 1 });
          }
          return segs.map((s) => (
            <button
              key={s.start}
              className="lp-bracket"
              data-empty={!s.g}
              data-ix={s.g && onGroup ? "follow" : undefined}
              disabled={!s.g || !onGroup}
              data-soft={!!focusCity && s.g?.city !== focusCity}
              data-drop={s.g?.order === 1 ? "first" : "later"}
              style={{ gridColumn: `${s.start + 1} / span ${s.n}` }}
              onClick={() => s.g && onGroup?.(s.g.city)}
            >
              {s.g ? (
                <>
                  <b>
                    <i>{s.g.order}</i> {s.g.city}
                  </b>
                  <small>
                    {s.g.pallets} paletes · {(s.g.kg / 1000).toLocaleString("pt-PT")} t ·{" "}
                    {s.g.order === 1 ? "sai primeiro, junto às portas" : "segunda descarga"}
                    {s.g.adr && ` · ADR ${s.g.adr}`}
                    {s.g.tempC && ` · ${s.g.tempC[0]}–${s.g.tempC[1]} °C`}
                  </small>
                </>
              ) : (
                <small>{capacity - used} posições livres</small>
              )}
            </button>
          ));
        })()}
      </div>
    </figure>
  );
}
