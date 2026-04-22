import clsx from "clsx";
import type { DragEvent } from "react";
import { useCallback, useState } from "react";
import type { CargoItem, CargoType } from "../../data/types";
import type { Truck } from "../../data/types";
import type { CargoDragPayload } from "./dnd";
import { TrailerSVG } from "./TrailerSVG";

const TYPE_LABEL: Record<CargoType, string> = {
  dry: "Dry freight",
  refrigerated: "Refrigerated",
  hazmat: "Hazardous",
  bulk: "Bulk",
  automotive: "Automotive",
};

const TYPE_DOT: Record<CargoType, string> = {
  dry: "var(--lp-cargo-dry)",
  refrigerated: "var(--lp-cargo-reefer)",
  hazmat: "var(--lp-cargo-hazmat)",
  bulk: "var(--lp-cargo-bulk)",
  automotive: "var(--lp-cargo-auto)",
};

export function TrailerIsoDeck({
  truck,
  items,
  overload,
  weightPct,
  overZone,
  zoneId,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
  onBayDrop,
}: {
  truck: Truck;
  items: CargoItem[];
  overload: boolean;
  weightPct: number;
  overZone: string | null;
  zoneId: string;
  onDragOver: (e: DragEvent) => void;
  onDragEnter: () => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDragStart: (p: CargoDragPayload) => void;
  onDragEnd: () => void;
  /** Called when a cargo is dropped into a specific bay */
  onBayDrop?: (bayIndex: number, e: DragEvent) => void;
}) {
  const [hoveredBay, setHoveredBay] = useState<number | null>(null);
  const [selectedBay, setSelectedBay] = useState<number | null>(null);

  const handleBayDragOver = useCallback((_idx: number, e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleBayDrop = useCallback(
    (idx: number, e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setHoveredBay(null);
      if (onBayDrop) {
        onBayDrop(idx, e);
      } else {
        // Fall back to generic truck drop
        onDrop(e);
      }
    },
    [onBayDrop, onDrop],
  );

  const bayCapacity = Math.round(truck.maxWeightKg / Math.max(1, truck.maxSlots));
  const totalWeightKg = items.reduce((s, it) => s + it.weightKg, 0);

  // Summary of cargo types present
  const typeSummary = items.reduce<Record<CargoType, { count: number; kg: number }>>(
    (acc, it) => {
      if (!acc[it.type]) acc[it.type] = { count: 0, kg: 0 };
      acc[it.type].count += 1;
      acc[it.type].kg += it.weightKg;
      return acc;
    },
    {} as Record<CargoType, { count: number; kg: number }>,
  );

  return (
    <section
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={clsx(
        "lp-paper relative overflow-hidden rounded-2xl border transition",
        overZone === zoneId
          ? "border-[var(--lp-green)] ring-2 ring-[var(--lp-green)]/30"
          : "border-[var(--lp-border)]",
      )}
      style={{ background: "var(--lp-surface)" }}
    >
      <div className="lp-grain absolute inset-0 pointer-events-none" />

      {/* Header */}
      <header className="relative flex flex-wrap items-end justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--lp-border)]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--lp-fg-subtle)]">
            Trailer side view · {truck.plate}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--lp-fg)]">
            {truck.name}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <KPIChip
            label="Gross weight"
            value={`${(totalWeightKg / 1000).toFixed(2)}t`}
            sub={`/ ${(truck.maxWeightKg / 1000).toFixed(1)}t`}
            tone={overload ? "danger" : "default"}
          />
          <KPIChip
            label="Bays used"
            value={`${items.length}`}
            sub={`/ ${truck.maxSlots}`}
          />
          <KPIChip
            label="Utilization"
            value={`${Math.round(weightPct)}%`}
            tone={weightPct > 92 ? "danger" : weightPct > 75 ? "warn" : "ok"}
          />
        </div>
      </header>

      {/* Truck SVG */}
      <div className="relative px-4 pt-6 pb-2 sm:px-8">
        <TrailerSVG
          truck={truck}
          items={items}
          bayCapacityKg={bayCapacity}
          overload={overload}
          hoveredBay={hoveredBay}
          selectedBay={selectedBay}
          onBayDragOver={handleBayDragOver}
          onBayDragEnter={(idx) => setHoveredBay(idx)}
          onBayDragLeave={(idx, e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setHoveredBay((h) => (h === idx ? null : h));
          }}
          onBayDrop={handleBayDrop}
          onBayClick={(idx) =>
            setSelectedBay((s) => (s === idx ? null : idx))
          }
          onCargoDragStart={onDragStart}
          onCargoDragEnd={onDragEnd}
        />
      </div>

      {/* Cargo type legend + capacity bar */}
      <footer className="relative border-t border-[var(--lp-border)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {(Object.keys(TYPE_LABEL) as CargoType[]).map((t) => {
              const active = !!typeSummary[t];
              return (
                <div
                  key={t}
                  className={clsx(
                    "flex items-center gap-2 text-xs transition",
                    active ? "opacity-100" : "opacity-40",
                  )}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: TYPE_DOT[t] }}
                  />
                  <span className="font-medium text-[var(--lp-fg)]">
                    {TYPE_LABEL[t]}
                  </span>
                  {active && (
                    <span className="font-mono text-[var(--lp-fg-muted)]">
                      {typeSummary[t].count} · {(typeSummary[t].kg / 1000).toFixed(1)}t
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-[var(--lp-fg-muted)]">
            Per-bay capacity ≈{" "}
            <span className="font-mono font-semibold text-[var(--lp-fg)]">
              {(bayCapacity / 1000).toFixed(1)}t
            </span>
          </p>
        </div>
      </footer>
    </section>
  );
}

function KPIChip({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "ok" | "warn" | "danger";
}) {
  const toneColor =
    tone === "danger"
      ? "var(--lp-rust)"
      : tone === "warn"
      ? "var(--lp-amber)"
      : tone === "ok"
      ? "var(--lp-green)"
      : "var(--lp-fg)";

  return (
    <div className="rounded-xl border border-[var(--lp-border)] bg-[var(--lp-surface-alt)] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--lp-fg-subtle)]">
        {label}
      </p>
      <p className="mt-0.5 flex items-baseline gap-1">
        <span
          className="font-mono text-xl font-bold tabular-nums"
          style={{ color: toneColor }}
        >
          {value}
        </span>
        {sub && (
          <span className="font-mono text-xs text-[var(--lp-fg-muted)]">{sub}</span>
        )}
      </p>
    </div>
  );
}
