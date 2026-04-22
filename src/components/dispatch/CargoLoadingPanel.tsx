/**
 * CargoLoadingPanel — Cargo LIFO (Last In First Out) loading order view.
 *
 * Shows cargo currently loaded on a truck in the correct loading sequence:
 * the last delivery destination's cargo is loaded FIRST (innermost),
 * and the first delivery stop's cargo is loaded LAST (nearest to door).
 *
 * Also shows warehouse stock available to load onto the selected truck.
 */

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Package,
  RotateCcw,
  Truck,
  Warehouse,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useFleetData } from "../../context/FleetDataContext";
import { useJobs } from "../../context/JobsContext";
import { drivers } from "../../data/mockData";
import type { CargoItem, CargoType } from "../../data/types";

/* ── helpers ─────────────────────────────────────────── */
const TYPE_LABEL: Record<CargoType, string> = {
  dry:          "Carga geral",
  refrigerated: "Frigorífico",
  hazmat:       "Matérias perigosas",
  bulk:         "Granel",
  automotive:   "Automóvel",
};

const TYPE_COLOR: Record<CargoType, { bg: string; text: string; border: string }> = {
  dry:          { bg: "#F2EBE0", text: "#5C4A30",  border: "#8B6F47" },
  refrigerated: { bg: "#E5F0EC", text: "#2D5F4E",  border: "#5F8A7D" },
  hazmat:       { bg: "#F6E3DE", text: "#A84432",  border: "#A84432" },
  bulk:         { bg: "#EDE9F2", text: "#4A3B5C",  border: "#7A6B8A" },
  automotive:   { bg: "#EBF0E0", text: "#4A5538",  border: "#6B7A52" },
};

const LOAD_STATUS_LABEL: Record<string, string> = {
  secured:    "Segura",
  pending:    "Pendente",
  unbalanced: "Desequilibrada",
};

function CargoTypeBadge({ type }: { type: CargoType }) {
  const c = TYPE_COLOR[type];
  return (
    <span
      className="rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.text, borderColor: c.border + "50" }}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}

/* ── component ───────────────────────────────────────── */
export function CargoLoadingPanel() {
  const { trucksLive, cargoByTruck, warehouse, moveCargo, reorderTruckCargo } = useFleetData();
  const { jobs } = useJobs();

  const [selectedTruckId, setSelectedTruckId] = useState<string>(
    () => trucksLive[0]?.id ?? "t1",
  );
  const [showWarehouse, setShowWarehouse] = useState(false);

  const truck = trucksLive.find((t) => t.id === selectedTruckId) ?? trucksLive[0] ?? null;
  const cargo = useMemo(() => cargoByTruck[selectedTruckId] ?? [], [cargoByTruck, selectedTruckId]);

  /* Find job(s) assigned to this truck that are operational */
  const truckJobs = useMemo(
    () =>
      jobs
        .filter(
          (j) =>
            j.assignedTruckId === selectedTruckId &&
            ["assigned", "loading", "in_transit", "queued"].includes(j.status),
        )
        .sort((a, b) => {
          const o: Record<string, number> = { in_transit: 0, loading: 1, assigned: 2, queued: 3 };
          return (o[a.status] ?? 9) - (o[b.status] ?? 9);
        }),
    [jobs, selectedTruckId],
  );

  const assignedDriver = useMemo(() => {
    const dId = truckJobs[0]?.assignedDriverId;
    return dId ? (drivers.find((d) => d.id === dId) ?? null) : null;
  }, [truckJobs]);

  /* Derive LIFO loading order from delivery stops */
  const lifoOrder = useMemo(() => {
    const deliveryStops = truckJobs
      .flatMap((j) => j.stops.filter((s) => s.type === "delivery"))
      .sort((a, b) => b.sequence - a.sequence); // reverse sequence = LIFO
    return deliveryStops;
  }, [truckJobs]);

  const totalWeightKg = cargo.reduce((s, c) => s + c.weightKg, 0);
  const weightPct = truck ? Math.min(100, (totalWeightKg / truck.maxWeightKg) * 100) : 0;
  const isOverloaded = truck ? totalWeightKg > truck.maxWeightKg : false;

  /* Reorder helpers */
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...cargo];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    reorderTruckCargo(selectedTruckId, next.map((c) => c.id));
  };

  const unload = (item: CargoItem) => {
    moveCargo(item.id, { kind: "truck", truckId: selectedTruckId }, { kind: "warehouse" });
  };

  const loadFromWarehouse = (item: CargoItem) => {
    moveCargo(item.id, { kind: "warehouse" }, { kind: "truck", truckId: selectedTruckId });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: "var(--workspace-bg)" }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div
        className="shrink-0 border-b px-5 py-4"
        style={{ background: "var(--app-card)", borderColor: "var(--app-border)" }}
      >
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-muted)" }}>
              Ordem de carga · LIFO
            </p>
            <h1 className="mt-0.5 text-[17px] font-black leading-tight" style={{ color: "var(--app-fg)" }}>
              Planeamento de carga
            </h1>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-muted)" }}>
              Última paragem carregada primeiro — primeiro a sair fica junto à porta.
            </p>
          </div>

          {/* Truck selector */}
          <div className="ml-auto min-w-[220px]">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>
              Viatura
            </label>
            <div className="relative">
              <select
                value={selectedTruckId}
                onChange={(e) => setSelectedTruckId(e.target.value)}
                className="w-full appearance-none rounded-xl border px-3 py-2 pr-8 text-[13px] font-semibold outline-none"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-elevated)",
                  color: "var(--app-fg)",
                }}
              >
                {trucksLive.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.plate} · {t.name.slice(0, 22)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-muted)" }} />
            </div>
          </div>
        </div>

        {/* Truck stats strip */}
        {truck && (
          <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px]">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4" style={{ color: "#2D5F4E" }} />
              <span style={{ color: "var(--app-fg)" }}>{truck.name}</span>
              <span style={{ color: "var(--app-muted)" }}>· {truck.bodyType ?? "—"}</span>
            </div>
            {assignedDriver && (
              <span style={{ color: "var(--app-muted)" }}>
                Motorista: <strong style={{ color: "var(--app-fg)" }}>{assignedDriver.name}</strong>
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[10px]" style={{ color: "var(--app-muted)" }}>
                  Peso carregado
                </span>
                <span
                  className="font-bold tabular-nums"
                  style={{ color: isOverloaded ? "#A84432" : "var(--app-fg)" }}
                >
                  {(totalWeightKg / 1_000).toFixed(2)} t
                  <span className="font-normal text-[var(--app-muted)]"> / {(truck.maxWeightKg / 1_000).toFixed(1)} t</span>
                </span>
              </div>
              <div className="w-32">
                <div className="h-2 overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${weightPct}%`,
                      background: isOverloaded ? "#A84432" : weightPct > 85 ? "#8B6F47" : "#2D5F4E",
                    }}
                  />
                </div>
                <p className="mt-0.5 text-[9px] tabular-nums" style={{ color: "var(--app-muted)" }}>
                  {Math.round(weightPct)}% · {cargo.length}/{truck.maxSlots} slots
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden lg:flex-row">

        {/* ── Left: cargo sequence ──────────────────────── */}
        <div
          className="flex min-h-0 flex-1 flex-col border-r"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="shrink-0 border-b px-5 py-3" style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-[#2D5F4E]" />
              <h2 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-muted)" }}>
                Carga no camião ({cargo.length} artigos)
              </h2>
              {isOverloaded && (
                <span className="ml-auto flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  <AlertTriangle className="h-3 w-3" /> Excesso de peso
                </span>
              )}
            </div>
            <p className="mt-1 text-[10px]" style={{ color: "var(--app-muted)" }}>
              Posição 1 = junto à porta (primeira a sair) · Arraste ou use ↑↓ para reordenar
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-4">
            {cargo.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Package className="h-10 w-10 opacity-20" style={{ color: "var(--app-muted)" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--app-fg)" }}>
                    Sem carga neste camião
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--app-muted)" }}>
                    Carregue artigos do armazém abaixo.
                  </p>
                </div>
              </div>
            ) : (
              <ol className="space-y-2">
                {cargo.map((item, idx) => {
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl border p-3 transition"
                      style={{
                        borderColor: "var(--app-border)",
                        background: "var(--app-card)",
                      }}
                    >
                      {/* Position number */}
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                        style={{ background: idx === 0 ? "#2D5F4E" : "var(--app-elevated)", color: idx === 0 ? "#fff" : "var(--app-muted)" }}
                        title={idx === 0 ? "Junto à porta — primeira a sair" : `Posição ${idx + 1}`}
                      >
                        {idx + 1}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold" style={{ color: "var(--app-fg)" }}>
                              {item.label}
                            </p>
                            <p className="font-mono text-[10px]" style={{ color: "var(--app-muted)" }}>
                              {item.sku}
                            </p>
                          </div>
                          <CargoTypeBadge type={item.type} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--app-muted)" }}>
                          <span>{(item.weightKg / 1_000).toFixed(3)} t</span>
                          <span>·</span>
                          <span>Destino: {item.destination}</span>
                          <span>·</span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{
                              background: item.loadStatus === "secured" ? "#E8F0EC" : item.loadStatus === "unbalanced" ? "#F6E3DE" : "#F2EBE0",
                              color: item.loadStatus === "secured" ? "#2D5F4E" : item.loadStatus === "unbalanced" ? "#A84432" : "#8B6F47",
                            }}
                          >
                            {LOAD_STATUS_LABEL[item.loadStatus] ?? item.loadStatus}
                          </span>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => move(idx, -1)}
                            disabled={idx === 0}
                            className="rounded-lg border p-1.5 transition hover:opacity-80 disabled:opacity-30"
                            style={{ borderColor: "var(--app-border)", color: "var(--app-muted)" }}
                            title="Mover para frente (mais perto da porta)"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(idx, 1)}
                            disabled={idx === cargo.length - 1}
                            className="rounded-lg border p-1.5 transition hover:opacity-80 disabled:opacity-30"
                            style={{ borderColor: "var(--app-border)", color: "var(--app-muted)" }}
                            title="Mover para trás (mais fundo no camião)"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => unload(item)}
                          className="rounded-lg border px-2 py-1 text-[10px] font-semibold transition hover:opacity-80"
                          style={{ borderColor: "#A84432", color: "#A84432", background: "#FEF2F2" }}
                          title="Devolver ao armazém"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        {/* ── Right: delivery sequence + warehouse ─────── */}
        <div className="flex w-[320px] shrink-0 flex-col xl:w-[360px]">

          {/* Delivery sequence */}
          <div
            className="shrink-0 border-b"
            style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
          >
            <div className="border-b px-5 py-3" style={{ borderColor: "var(--app-border)" }}>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-muted)" }}>
                Sequência de entrega
              </h2>
              <p className="mt-0.5 text-[10px]" style={{ color: "var(--app-muted)" }}>
                A última entrega deve ser carregada primeiro.
              </p>
            </div>
            <div className="max-h-[240px] overflow-y-auto p-4">
              {lifoOrder.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--app-muted)" }}>
                  Nenhum trabalho com paragens de entrega atribuído a esta viatura.
                </p>
              ) : (
                <ol className="space-y-2">
                  {lifoOrder.map((stop, idx) => (
                    <li key={stop.id} className="flex items-start gap-3">
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: idx === 0 ? "#A84432" : "#8B6F47" }}
                        title={idx === 0 ? "Última entrega — carregar primeiro" : `Carregar ${idx + 1}º`}
                      >
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold" style={{ color: "var(--app-fg)" }}>
                          {stop.city}
                        </p>
                        <p className="truncate text-[10px]" style={{ color: "var(--app-muted)" }}>
                          {stop.cargoDescription}
                        </p>
                        <p className="text-[10px]" style={{ color: "var(--app-muted)" }}>
                          {(stop.weightKg / 1_000).toFixed(2)} t · {stop.pallets} plt · {stop.scheduledTime}
                        </p>
                      </div>
                      {idx === 0 && (
                        <span className="ml-auto shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
                          1º a carregar
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Warehouse stock */}
          <div className="flex min-h-0 flex-1 flex-col">
            <button
              type="button"
              onClick={() => setShowWarehouse((v) => !v)}
              className="flex shrink-0 items-center justify-between border-b px-5 py-3 text-left transition hover:opacity-80"
              style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
            >
              <div className="flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-[#2D5F4E]" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-muted)" }}>
                  Armazém ({warehouse.length} artigos)
                </h2>
              </div>
              <ChevronDown
                className="h-4 w-4 transition-transform"
                style={{ color: "var(--app-muted)", transform: showWarehouse ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>

            {showWarehouse && (
              <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-3">
                {warehouse.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <CheckCircle2 className="h-7 w-7 text-[#2D5F4E] opacity-40" />
                    <p className="text-[12px]" style={{ color: "var(--app-muted)" }}>
                      Armazém vazio — toda a carga está nos camiões.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {warehouse.map((item) => {
                      const c = TYPE_COLOR[item.type];
                      const canLoad = truck
                        ? cargo.length < truck.maxSlots &&
                          totalWeightKg + item.weightKg <= truck.maxWeightKg
                        : false;
                      return (
                        <li
                          key={item.id}
                          className="rounded-xl border p-2.5 text-[12px]"
                          style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
                        >
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold" style={{ color: "var(--app-fg)" }}>
                                {item.label}
                              </p>
                              <p className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--app-muted)" }}>
                                {item.sku}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span
                                  className="rounded border px-1.5 py-0.5 text-[9px] font-semibold"
                                  style={{ background: c.bg, color: c.text, borderColor: c.border + "50" }}
                                >
                                  {TYPE_LABEL[item.type]}
                                </span>
                                <span style={{ color: "var(--app-muted)" }}>
                                  {(item.weightKg / 1_000).toFixed(3)} t
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => loadFromWarehouse(item)}
                              disabled={!canLoad}
                              className="shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
                              style={{ background: "#2D5F4E", color: "#fff" }}
                              title={
                                !canLoad
                                  ? "Capacidade insuficiente ou slots cheios"
                                  : "Carregar nesta viatura"
                              }
                            >
                              Carregar
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
