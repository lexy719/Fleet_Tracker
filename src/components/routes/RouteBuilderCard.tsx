import { Link } from "react-router-dom";
import { Plus, Truck as TruckIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { CargoItem, Truck } from "../../data/types";
import { totalVehicleWeightKg, type TruckPreset } from "../../tomtom/truckPresets";
import { Card } from "../ui/Card";
import { RoutePointField } from "./RoutePointField";
import { createEmptyPoint, type PlannerPointDraft } from "./routePlannerTypes";

function newStopId() {
  return `stop-${crypto.randomUUID?.() ?? String(Date.now())}`;
}

export function RouteBuilderCard({
  apiKey,
  start,
  finish,
  middleStops,
  fleetTrucks,
  selectedTruckId,
  onTruckChange,
  assignedCargo,
  routingPreset,
  onStartChange,
  onFinishChange,
  onMiddleStopsChange,
}: {
  apiKey: string | undefined;
  start: PlannerPointDraft;
  finish: PlannerPointDraft;
  middleStops: PlannerPointDraft[];
  fleetTrucks: Truck[];
  selectedTruckId: string;
  onTruckChange: (truckId: string) => void;
  assignedCargo: CargoItem[];
  routingPreset: TruckPreset;
  onStartChange: (p: PlannerPointDraft) => void;
  onFinishChange: (p: PlannerPointDraft) => void;
  onMiddleStopsChange: (stops: PlannerPointDraft[]) => void;
}) {
  const truck = useMemo(
    () => fleetTrucks.find((t) => t.id === selectedTruckId) ?? fleetTrucks[0],
    [fleetTrucks, selectedTruckId],
  );

  const cargoWeightKg = useMemo(
    () => assignedCargo.reduce((a, c) => a + c.weightKg, 0),
    [assignedCargo],
  );

  const totalGrossKg = useMemo(
    () => (truck ? totalVehicleWeightKg(routingPreset, cargoWeightKg) : 0),
    [truck, routingPreset, cargoWeightKg],
  );

  const addStop = () => {
    onMiddleStopsChange([...middleStops, createEmptyPoint(newStopId())]);
  };

  const removeStop = (id: string) => {
    onMiddleStopsChange(middleStops.filter((s) => s.id !== id));
  };

  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= middleStops.length || to >= middleStops.length) return;
      const next = [...middleStops];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row!);
      onMiddleStopsChange(next);
    },
    [middleStops, onMiddleStopsChange],
  );

  return (
    <Card padding="p-5" className="space-y-6 overflow-visible">
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--app-fg)" }}>Construtor de rota</h2>
        <p className="mt-1 text-xs" style={{ color: "var(--app-muted)" }}>
          Pesquise locais (PT/ES) ou introduza coordenadas. Ordem: Origem → paragens → Destino.
        </p>
      </div>

      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>
          <TruckIcon className="h-4 w-4" style={{ color: "#2D5F4E" }} aria-hidden />
          Viatura & carga ao vivo
        </div>
        <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--app-muted)" }}>
          Peso da carga vem do{" "}
          <Link
            to="/app/dispatch?tab=cargo"
            className="font-semibold underline-offset-2 hover:underline"
            style={{ color: "#2D5F4E" }}
          >
            planeamento de carga
          </Link>
          . TomTom usa tara + carga para rotas e portagens.
        </p>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-[11px] font-medium" style={{ color: "var(--app-fg)" }}>Viatura</span>
            <select
              value={selectedTruckId}
              onChange={(e) => onTruckChange(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-card)",
                color: "var(--app-fg)",
              }}
            >
              {fleetTrucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.plate}
                </option>
              ))}
            </select>
          </label>

          <div
            className="rounded-lg border px-3 py-2.5"
            style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
          >
            {assignedCargo.length === 0 ? (
              <p className="text-[12px] leading-snug" style={{ color: "var(--app-muted)" }}>
                Sem carga atribuída a esta viatura.
              </p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <div className="col-span-2">
                  <dt style={{ color: "var(--app-muted)" }}>Modelo</dt>
                  <dd className="font-medium" style={{ color: "var(--app-fg)" }}>{truck?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt style={{ color: "var(--app-muted)" }}>Tara</dt>
                  <dd className="font-mono tabular-nums" style={{ color: "var(--app-fg)" }}>
                    {(routingPreset.kerbWeightKg / 1000).toFixed(1)} t
                  </dd>
                </div>
                <div>
                  <dt style={{ color: "var(--app-muted)" }}>Carga</dt>
                  <dd className="font-mono tabular-nums" style={{ color: "var(--app-fg)" }}>
                    {(cargoWeightKg / 1000).toFixed(2)} t
                  </dd>
                </div>
                <div>
                  <dt style={{ color: "var(--app-muted)" }}>Bruto (rota)</dt>
                  <dd className="font-mono font-semibold tabular-nums" style={{ color: "var(--app-fg)" }}>
                    {(totalGrossKg / 1000).toFixed(2)} t
                  </dd>
                </div>
                <div>
                  <dt style={{ color: "var(--app-muted)" }}>Itens / baias</dt>
                  <dd className="font-mono tabular-nums" style={{ color: "var(--app-fg)" }}>
                    {assignedCargo.length} / {truck?.maxSlots ?? "—"}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </div>
      </div>

      <RoutePointField
        apiKey={apiKey}
        rowLabel="Origem"
        point={start}
        onChange={onStartChange}
        placeholderSearch="Ex.: Lisboa, Braga, Porto…"
      />

      {middleStops.map((p, index) => (
        <div
          key={p.id}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData("text/plain"));
            if (Number.isNaN(from)) return;
            reorder(from, index);
          }}
        >
          <RoutePointField
            apiKey={apiKey}
            rowLabel={`Paragem ${index + 1}`}
            point={p}
            onChange={(next) => {
              const cp = [...middleStops];
              const i = cp.findIndex((x) => x.id === p.id);
              if (i >= 0) {
                cp[i] = next;
                onMiddleStopsChange(cp);
              }
            }}
            onRemove={() => removeStop(p.id)}
            dragHandleProps={{
              draggable: true,
              onDragStart: (e) => {
                e.dataTransfer.setData("text/plain", String(index));
                e.dataTransfer.effectAllowed = "move";
              },
              onDragEnd: () => {},
            }}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addStop}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 text-sm font-medium transition hover:opacity-80"
        style={{
          borderColor: "var(--app-border)",
          color: "var(--app-muted)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#2D5F4E";
          (e.currentTarget as HTMLElement).style.color = "#2D5F4E";
          (e.currentTarget as HTMLElement).style.background = "#E8F0EC";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "";
          (e.currentTarget as HTMLElement).style.color = "";
          (e.currentTarget as HTMLElement).style.background = "";
        }}
      >
        <Plus className="h-4 w-4" />
        Adicionar paragem
      </button>

      <RoutePointField
        apiKey={apiKey}
        rowLabel="Destino"
        point={finish}
        onChange={onFinishChange}
        placeholderSearch="Ex.: Porto, Vigo, Madrid…"
      />
    </Card>
  );
}
