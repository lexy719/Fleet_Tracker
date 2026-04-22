import clsx from "clsx";
import type { DragEvent } from "react";
import type { CargoItem, CargoType } from "../../data/types";
import type { Truck } from "../../data/types";
import type { CargoDragPayload } from "./dnd";
import { setDragData } from "./dnd";

/* ─── Cargo colours & labels ─────────────────────────────────── */
const CARGO_COLOR: Record<CargoType, string> = {
  dry: "var(--lp-cargo-dry)",
  refrigerated: "var(--lp-cargo-reefer)",
  hazmat: "var(--lp-cargo-hazmat)",
  bulk: "var(--lp-cargo-bulk)",
  automotive: "var(--lp-cargo-auto)",
};
const CARGO_LABEL: Record<CargoType, string> = {
  dry: "DRY", refrigerated: "REEFER", hazmat: "HAZMAT",
  bulk: "BULK", automotive: "AUTO",
};

/* ─── EU axle weight limits (kg) ─────────────────────────────── */
const EU_LIMITS = {
  steering: 7_500,
  drive:   16_000,
  trailer: 16_000,
};

/* ─── Axle load model ────────────────────────────────────────── */
function calcAxleLoads(items: CargoItem[], truck: Truck) {
  const bays = Math.max(1, truck.maxSlots);

  // Empty vehicle weight split across axle groups
  const baseTotal = Math.max(8_000, truck.maxWeightKg * 0.22);
  const baseSteering = baseTotal * 0.42;
  const baseDrive    = baseTotal * 0.58;

  // Distribute cargo: bay position drives front/rear split in trailer
  let frontCargoKg = 0; // bays near cab → more to drive axle via kingpin
  let rearCargoKg  = 0; // bays near rear → trailer axles

  items.forEach((item, i) => {
    const pos = bays > 1 ? i / (bays - 1) : 0.5; // 0 = front bay, 1 = rear bay
    frontCargoKg += item.weightKg * (1 - pos);
    rearCargoKg  += item.weightKg * pos;
  });

  // Drive axle = base drive + kingpin load (50% of front cargo)
  const drive    = baseDrive    + frontCargoKg * 0.50;
  // Trailer axle = rear cargo + remaining kingpin load
  const trailer  = rearCargoKg  + frontCargoKg * 0.50;
  const steering = baseSteering;

  return { steering, drive, trailer, total: steering + drive + trailer };
}

/* ─── Tone helper ────────────────────────────────────────────── */
function axleTone(loadKg: number, limitKg: number) {
  const pct = loadKg / limitKg;
  if (pct > 0.95) return { color: "var(--lp-rust)",  label: "OVER",  bg: "var(--lp-rust-soft)"  };
  if (pct > 0.80) return { color: "var(--lp-amber)", label: "HIGH",  bg: "var(--lp-amber-soft)" };
  return               { color: "var(--lp-green)",   label: "OK",    bg: "var(--lp-green-soft)"  };
}

/* ─── Props ──────────────────────────────────────────────────── */
interface TrailerSVGProps {
  truck: Truck;
  items: CargoItem[];
  bayCapacityKg?: number;
  overload: boolean;
  hoveredBay: number | null;
  selectedBay: number | null;
  onBayDragOver:  (idx: number, e: DragEvent) => void;
  onBayDragEnter: (idx: number) => void;
  onBayDragLeave: (idx: number, e: DragEvent) => void;
  onBayDrop:      (idx: number, e: DragEvent) => void;
  onBayClick:     (idx: number) => void;
  onCargoDragStart: (p: CargoDragPayload) => void;
  onCargoDragEnd:   () => void;
}

/* ════════════════════════════════════════════════════════════════
   Main component
   ════════════════════════════════════════════════════════════════ */
export function TrailerSVG({
  truck, items, bayCapacityKg, overload,
  hoveredBay, selectedBay,
  onBayDragOver, onBayDragEnter, onBayDragLeave, onBayDrop, onBayClick,
  onCargoDragStart, onCargoDragEnd,
}: TrailerSVGProps) {
  const bayCapacity = bayCapacityKg ?? Math.round(truck.maxWeightKg / Math.max(1, truck.maxSlots));
  const bays = truck.maxSlots;
  const axles = calcAxleLoads(items, truck);

  const totalCargoKg = items.reduce((s, it) => s + it.weightKg, 0);
  const cogPct = bays > 1
    ? items.reduce((s, it, i) => s + (i / (bays - 1)) * it.weightKg, 0) / Math.max(1, totalCargoKg)
    : 0.5; // 0 = all front, 1 = all rear

  return (
    <div className="w-full select-none">

      {/* ══════════════════════════════════════════
          1. INTERACTIVE BAY GRID
          ══════════════════════════════════════════ */}
      <div className="px-2 pt-2 pb-1">
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "var(--lp-fg-subtle)" }}>
            Bay layout · {bays} slots
          </span>
          {overload && (
            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-bold lp-pulse"
              style={{ background: "var(--lp-rust-soft)", color: "var(--lp-rust)" }}>
              ⚠ NEAR GVWR
            </span>
          )}
        </div>

        <div className="flex gap-1.5 w-full" style={{ height: 110 }}>
          {Array.from({ length: bays }).map((_, idx) => {
            const item = items[idx];
            const fillPct = item ? Math.min(1, item.weightKg / bayCapacity) * 100 : 0;
            const isHovered  = hoveredBay  === idx;
            const isSelected = selectedBay === idx;
            const overCap    = !!item && item.weightKg > bayCapacity;

            const border = overCap ? "var(--lp-rust)"
              : isHovered  ? "var(--lp-green)"
              : isSelected ? "var(--lp-brown)"
              : "var(--lp-border-strong)";

            return (
              <div
                key={idx}
                className={clsx(
                  "relative flex-1 overflow-hidden rounded-lg transition-all duration-150 cursor-pointer",
                  isHovered && "lp-pulse",
                )}
                style={{
                  background: "var(--lp-surface-alt)",
                  border: `${isHovered || isSelected || overCap ? 2 : 1.5}px ${!item && !isHovered ? "dashed" : "solid"} ${border}`,
                  boxShadow: isHovered ? "0 0 0 3px rgba(45,95,78,0.12)" : overCap ? "0 0 0 3px rgba(168,68,50,0.12)" : "none",
                }}
                onDragOver={(e) => onBayDragOver(idx, e)}
                onDragEnter={() => onBayDragEnter(idx)}
                onDragLeave={(e) => onBayDragLeave(idx, e)}
                onDrop={(e) => onBayDrop(idx, e)}
                onClick={() => onBayClick(idx)}
              >
                {/* Bay number */}
                <span className="absolute top-1.5 left-0 right-0 text-center pointer-events-none z-10"
                  style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--lp-fg-subtle)" }}>
                  {idx + 1}
                </span>

                {/* Cargo fill — rises from bottom */}
                {item && (
                  <div
                    className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center gap-0.5 transition-all duration-500"
                    style={{
                      height: `${fillPct}%`,
                      background: item.type === "hazmat"
                        ? `repeating-linear-gradient(-45deg,var(--lp-cargo-hazmat) 0 5px,rgba(0,0,0,0.18) 5px 10px)`
                        : CARGO_COLOR[item.type],
                      opacity: 0.9,
                      borderRadius: "0 0 7px 7px",
                    }}
                  >
                    {fillPct > 32 && (
                      <span className="text-white font-bold pointer-events-none"
                        style={{ fontSize: 8, letterSpacing: "0.1em", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                        {CARGO_LABEL[item.type]}
                      </span>
                    )}
                    {fillPct > 54 && (
                      <span className="text-white font-bold font-mono pointer-events-none"
                        style={{ fontSize: 12, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                        {item.weightKg >= 1000 ? `${(item.weightKg / 1000).toFixed(1)}t` : `${item.weightKg}kg`}
                      </span>
                    )}
                  </div>
                )}

                {/* Empty */}
                {!item && (
                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ fontSize: 9, color: isHovered ? "var(--lp-green)" : "var(--lp-fg-subtle)", fontWeight: isHovered ? 700 : 400 }}>
                    {isHovered ? "Drop" : "Empty"}
                  </span>
                )}

                {/* Over-cap badge */}
                {overCap && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center pointer-events-none z-20"
                    style={{ background: "var(--lp-rust)", fontSize: 9, fontWeight: 900, color: "#fff" }}>
                    !
                  </div>
                )}

                {/* Drag handle */}
                {item && (
                  <div className="absolute inset-0 z-30" style={{ cursor: "grab" }} draggable
                    onDragStart={(e) => {
                      setDragData(e as unknown as DragEvent, { itemId: item.id, from: { kind: "truck", truckId: truck.id } });
                      onCargoDragStart({ itemId: item.id, from: { kind: "truck", truckId: truck.id } });
                    }}
                    onDragEnd={onCargoDragEnd}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          2. AXLE WEIGHT DISTRIBUTION
          ══════════════════════════════════════════ */}
      <div
        className="mx-2 mb-2 rounded-xl overflow-hidden"
        style={{ background: "var(--lp-surface-alt)", border: "1px solid var(--lp-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2"
          style={{ borderBottom: "1px solid var(--lp-border)" }}>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--lp-fg-subtle)" }}>
              Axle load distribution
            </span>
            <span className="ml-2 text-[9px]" style={{ color: "var(--lp-fg-subtle)" }}>
              EU legal limits per axle group
            </span>
          </div>
          <BalanceBadge cogPct={cogPct} />
        </div>

        {/* Three axle cards */}
        <div className="grid grid-cols-3 gap-px p-px" style={{ background: "var(--lp-border)" }}>
          <AxleCard label="Steering" sublabel="Axle 1" loadKg={axles.steering} limitKg={EU_LIMITS.steering} icon="🔵" />
          <AxleCard label="Drive" sublabel="Axles 2 – 3" loadKg={axles.drive} limitKg={EU_LIMITS.drive} icon="⚙️" />
          <AxleCard label="Trailer" sublabel="Axles 4 – 5" loadKg={axles.trailer} limitKg={EU_LIMITS.trailer} icon="📦" />
        </div>
      </div>

    </div>
  );
}

/* ─── Balance badge ───────────────────────────────────────────── */
function BalanceBadge({ cogPct }: { cogPct: number }) {
  const label = cogPct < 0.38 ? "Front heavy" : cogPct > 0.62 ? "Rear heavy" : "Balanced";
  const color = cogPct < 0.38 || cogPct > 0.62 ? "var(--lp-amber)" : "var(--lp-green)";
  const bg    = cogPct < 0.38 || cogPct > 0.62 ? "var(--lp-amber-soft)" : "var(--lp-green-soft)";
  return (
    <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
      style={{ color, background: bg, transition: "all 0.4s ease" }}>
      {label}
    </span>
  );
}

/* ─── Axle card ───────────────────────────────────────────────── */
function AxleCard({ label, sublabel, loadKg, limitKg, icon: _icon }: {
  label: string; sublabel: string; loadKg: number; limitKg: number; icon: string;
}) {
  const pct = Math.min(1, loadKg / limitKg) * 100;
  const tone = axleTone(loadKg, limitKg);

  return (
    <div className="flex flex-col gap-2 px-4 py-3" style={{ background: "var(--lp-surface)" }}>
      {/* Top row */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--lp-fg-subtle)" }}>
            {label}
          </p>
          <p className="text-[9px]" style={{ color: "var(--lp-fg-subtle)" }}>{sublabel}</p>
        </div>
        <span
          className="rounded-md px-1.5 py-0.5 text-[8px] font-bold tracking-wide"
          style={{ color: tone.color, background: tone.bg }}
        >
          {tone.label}
        </span>
      </div>

      {/* Big weight number */}
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-2xl font-bold tabular-nums transition-all duration-500"
          style={{ color: tone.color }}>
          {(loadKg / 1000).toFixed(1)}
        </span>
        <span className="text-xs font-semibold" style={{ color: "var(--lp-fg-muted)" }}>t</span>
      </div>

      {/* Progress bar */}
      <div className="relative overflow-hidden rounded-full" style={{ height: 6, background: "var(--lp-border)" }}>
        {/* 80% warning zone marker */}
        <div className="absolute top-0 bottom-0 w-px z-10 opacity-60"
          style={{ left: "80%", background: "var(--lp-amber)" }} />
        <div
          className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: tone.color }}
        />
      </div>

      {/* Limit label */}
      <p className="text-[9px]" style={{ color: "var(--lp-fg-subtle)" }}>
        Limit <span className="font-mono font-semibold" style={{ color: "var(--lp-fg-muted)" }}>
          {(limitKg / 1000).toFixed(1)}t
        </span> EU · {Math.round(pct)}% used
      </p>
    </div>
  );
}
