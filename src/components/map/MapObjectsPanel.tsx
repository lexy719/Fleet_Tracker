import clsx from "clsx";
import { CheckSquare, Filter, MoreHorizontal, Search, Square, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Truck } from "../../data/types";
import { vehicleTrailEvents } from "../../data/mockData";
import { dispatchCargoUrl, dispatchUrl, fleetUrl } from "../../lib/appLinks";
import { SlideOver } from "../ui/SlideOver";

type Tab = "objects" | "events";

type Panel =
  | null
  | { kind: "filter" }
  | { kind: "unitActions"; truckId: string; plate: string };

type StatusFilter = Truck["status"] | "all";
type BodyFilter = NonNullable<Truck["bodyType"]> | "all";

export function MapObjectsPanel({
  trucks,
  selectedId,
  onSelect,
  visible,
  onToggleVisible,
}: {
  trucks: Truck[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  visible: Record<string, boolean>;
  onToggleVisible: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("objects");
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [bodyFilter, setBodyFilter] = useState<BodyFilter>("all");

  const filtered = useMemo(() => {
    let result = trucks;
    const s = q.trim().toLowerCase();
    if (s) result = result.filter((t) => t.plate.toLowerCase().includes(s) || t.name.toLowerCase().includes(s));
    if (statusFilter !== "all") result = result.filter((t) => t.status === statusFilter);
    if (bodyFilter !== "all") result = result.filter((t) => t.bodyType === bodyFilter);
    return result;
  }, [trucks, q, statusFilter, bodyFilter]);

  const activeFilters = (statusFilter !== "all" ? 1 : 0) + (bodyFilter !== "all" ? 1 : 0);

  const recentEvents = useMemo(() => {
    return [...vehicleTrailEvents].slice(0, 12);
  }, []);

  return (
    <>
      <div
        className="flex h-full min-h-0 w-full flex-col border-r lg:w-[300px] xl:w-[320px]"
        style={{ background: "var(--app-card)", borderColor: "var(--app-border)" }}
      >
        <div className="flex shrink-0 border-b" style={{ borderColor: "var(--app-border)" }}>
          {(["objects", "events"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="flex-1 px-3 py-3 text-[12px] font-semibold uppercase tracking-wide transition"
              style={
                tab === t
                  ? { color: "#2D5F4E", borderBottom: "2px solid #2D5F4E" }
                  : { color: "var(--app-muted)" }
              }
            >
              {t === "objects" ? "Viaturas" : "Eventos"}
            </button>
          ))}
        </div>

        <div className="shrink-0 border-b p-3" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex gap-2">
            <div
              className="flex flex-1 items-center gap-2 rounded-lg border px-2 py-1.5"
              style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
            >
              <Search className="h-3.5 w-3.5" style={{ color: "var(--app-muted)" }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filtrar matrícula ou modelo…"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: "var(--app-fg)" }}
              />
            </div>
            <button
              type="button"
              className="relative rounded-lg border p-2 transition hover:opacity-80"
              style={{
                borderColor: activeFilters > 0 ? "#2D5F4E" : "var(--app-border)",
                color: activeFilters > 0 ? "#2D5F4E" : "var(--app-muted)",
                background: activeFilters > 0 ? "#E8F0EC" : undefined,
              }}
              aria-label="Filtros avançados"
              onClick={() => setPanel({ kind: "filter" })}
            >
              <Filter className="h-4 w-4" />
              {activeFilters > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#2D5F4E] text-[9px] font-bold text-white">
                  {activeFilters}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-2">
          {tab === "objects" ? (
            <ul className="space-y-1">
              {filtered.map((t) => {
                const on = visible[t.id] !== false;
                const active = selectedId === t.id;
                return (
                  <li key={t.id}>
                    <div
                      className={clsx("flex items-center gap-2 rounded-xl border px-2 py-2 transition")}
                      style={{
                        borderColor: active ? "#2D5F4E" : "transparent",
                        background: active ? "#E8F0EC" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) (e.currentTarget as HTMLElement).style.background = "var(--app-elevated)";
                      }}
                      onMouseLeave={(e) => {
                        if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggleVisible(t.id)}
                        className="h-3.5 w-3.5 rounded"
                        style={{ accentColor: "#2D5F4E" }}
                        aria-label={`Mostrar ${t.plate} no mapa`}
                      />
                      <button type="button" onClick={() => onSelect(t.id)} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: on ? "#2D5F4E" : "var(--app-muted)" }}
                          />
                          <span className="truncate text-[13px] font-semibold" style={{ color: "var(--app-fg)" }}>
                            {t.plate}
                          </span>
                        </div>
                        <div className="truncate pl-4 text-[11px]" style={{ color: "var(--app-muted)" }}>
                          {t.name}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded p-1 transition hover:opacity-70"
                        style={{ color: "var(--app-muted)" }}
                        aria-label={`Ações · ${t.plate}`}
                        onClick={() => setPanel({ kind: "unitActions", truckId: t.id, plate: t.plate })}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="space-y-2 px-1">
              {recentEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-lg border border-[var(--app-border)] bg-[var(--app-elevated)] px-2 py-2 text-[11px]"
                >
                  <div className="font-mono text-[10px] text-[var(--app-muted)]">{ev.truckId}</div>
                  <div className="mt-0.5 font-medium text-[var(--app-fg)]">{ev.timeLabel}</div>
                  <div className="line-clamp-2 text-[var(--app-muted)]">{ev.address}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t p-3 text-[11px]" style={{ borderColor: "var(--app-border)", color: "var(--app-muted)" }}>
          <Link to="/app/dispatch" className="block font-semibold text-[#2D5F4E] hover:underline">
            Abrir dispatch →
          </Link>
        </div>
      </div>

      <SlideOver
        open={panel?.kind === "filter"}
        onClose={() => setPanel(null)}
        title="Filtros do mapa"
        subtitle={`${filtered.length} de ${trucks.length} viaturas visíveis`}
        widthClassName="max-w-md"
      >
        <div className="space-y-5">
          {/* Status filter */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-muted)" }}>
              Estado operacional
            </p>
            <div className="space-y-1.5">
              {([
                { value: "all",         label: "Todos os estados" },
                { value: "idle",        label: "Disponível" },
                { value: "in_transit",  label: "Em viagem" },
                { value: "loading",     label: "Em carga" },
                { value: "delayed",     label: "Atrasado" },
                { value: "maintenance", label: "Em manutenção" },
              ] as { value: StatusFilter; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatusFilter(opt.value)}
                  className="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition hover:opacity-80"
                  style={{
                    borderColor: statusFilter === opt.value ? "#2D5F4E" : "var(--app-border)",
                    background: statusFilter === opt.value ? "#E8F0EC" : "var(--app-elevated)",
                    color: "var(--app-fg)",
                  }}
                >
                  {statusFilter === opt.value
                    ? <CheckSquare className="h-4 w-4 shrink-0 text-[#2D5F4E]" />
                    : <Square className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
                  }
                  {opt.label}
                  <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--app-muted)" }}>
                    {opt.value === "all" ? trucks.length : trucks.filter((t) => t.status === opt.value).length}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Body type filter */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-muted)" }}>
              Tipo de carroçaria
            </p>
            <div className="space-y-1.5">
              {([
                { value: "all",           label: "Todas as carroçarias" },
                { value: "curtainsider",  label: "Lona / Curtainsider" },
                { value: "reefer",        label: "Frigorífico / Reefer" },
                { value: "flatbed",       label: "Plataforma / Flatbed" },
                { value: "box",           label: "Caixa fechada / Box" },
                { value: "tanker",        label: "Cisterna / Tanker" },
              ] as { value: BodyFilter; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBodyFilter(opt.value)}
                  className="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition hover:opacity-80"
                  style={{
                    borderColor: bodyFilter === opt.value ? "#2D5F4E" : "var(--app-border)",
                    background: bodyFilter === opt.value ? "#E8F0EC" : "var(--app-elevated)",
                    color: "var(--app-fg)",
                  }}
                >
                  {bodyFilter === opt.value
                    ? <CheckSquare className="h-4 w-4 shrink-0 text-[#2D5F4E]" />
                    : <Square className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
                  }
                  {opt.label}
                  <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--app-muted)" }}>
                    {opt.value === "all"
                      ? trucks.length
                      : trucks.filter((t) => t.bodyType === opt.value).length
                    }
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Reset */}
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => { setStatusFilter("all"); setBodyFilter("all"); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-[12px] font-semibold text-rose-700 transition hover:opacity-80"
            >
              <X className="h-3.5 w-3.5" />
              Limpar filtros ({activeFilters})
            </button>
          )}
        </div>
      </SlideOver>

      <SlideOver
        open={panel?.kind === "unitActions"}
        onClose={() => setPanel(null)}
        title={panel?.kind === "unitActions" ? `Viatura · ${panel.plate}` : "Ações"}
        subtitle="Atalhos para o resto da app"
        widthClassName="max-w-md"
      >
        {panel?.kind === "unitActions" ? (
          <ul className="space-y-3 text-sm">
            <li>
              <Link
                to={dispatchUrl(panel.truckId)}
                className="font-semibold text-[#2D5F4E] hover:underline"
                onClick={() => setPanel(null)}
              >
                Planeamento de rotas (dispatch)
              </Link>
            </li>
            <li>
              <Link
                to={dispatchCargoUrl(panel.truckId)}
                className="font-semibold text-[#2D5F4E] hover:underline"
                onClick={() => setPanel(null)}
              >
                Ordem de carga LIFO
              </Link>
            </li>
            <li>
              <Link
                to={fleetUrl(panel.truckId)}
                className="font-semibold text-[#2D5F4E] hover:underline"
                onClick={() => setPanel(null)}
              >
                Manutenção e IPO (frota)
              </Link>
            </li>
            <li>
              <button
                type="button"
                className="text-left font-semibold text-[#2D5F4E] hover:underline"
                onClick={() => {
                  onSelect(panel.truckId);
                  setPanel(null);
                }}
              >
                Centrar no mapa
              </button>
            </li>
          </ul>
        ) : null}
      </SlideOver>
    </>
  );
}
