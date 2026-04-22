import { AlertTriangle, ArrowRight, MapPin, Package, Route, Wrench } from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { STATUS_LABELS, useJobs } from "../context/JobsContext";
import { maintenanceItems, trucks } from "../data/mockData";
import type { Job, JobStatus, MaintenanceStatus } from "../data/types";
import { fleetBadgeFromJobs } from "../lib/fleetTmsStatus";
import { dispatchUrl, mapUrl } from "../lib/appLinks";

const ACTIVE_STATUSES: JobStatus[] = ["assigned", "loading", "in_transit"];

function jobProgressPct(j: Job): number {
  if (!j.stops.length) return 0;
  return Math.round((j.stops.filter((s) => s.completed).length / j.stops.length) * 100);
}

function routeSummary(j: Job): string {
  const sorted = [...j.stops].sort((a, b) => a.sequence - b.sequence);
  const first = sorted[0]; const last = sorted[sorted.length - 1];
  if (!first || !last || first.id === last.id) return first?.city ?? "—";
  return `${first.city} → ${last.city}`;
}

const STATUS_COLOR: Partial<Record<JobStatus, string>> = {
  assigned:   "bg-[#E8F0EC] text-[#2D5F4E]",
  loading:    "bg-[#F2EBE0] text-[#6B4E2A]",
  in_transit: "bg-blue-500/12 text-blue-900",
};

function statusBadge(s: MaintenanceStatus) {
  if (s === "overdue") return <Badge variant="danger">Em atraso</Badge>;
  if (s === "due_soon") return <Badge variant="warn">≤ 30 dias</Badge>;
  return <Badge variant="ok">OK</Badge>;
}

export function FleetPage() {
  const { jobs } = useJobs();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const truck = searchParams.get("truck");
    if (!truck) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`fleet-card-${truck}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [searchParams]);

  const highlightedTruck = searchParams.get("truck");

  const byTruck = useMemo(() => {
    const m = new Map<string, typeof maintenanceItems>();
    for (const t of trucks) m.set(t.id, []);
    for (const it of maintenanceItems) {
      const list = m.get(it.truckId) ?? [];
      list.push(it);
      m.set(it.truckId, list);
    }
    return m;
  }, []);

  /* Active job per truck */
  const activeJobByTruck = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) {
      if (j.assignedTruckId && ACTIVE_STATUSES.includes(j.status)) {
        if (!m.has(j.assignedTruckId)) m.set(j.assignedTruckId, j);
      }
    }
    return m;
  }, [jobs]);

  const overdue = maintenanceItems.filter((m) => m.status === "overdue").length;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <PageHeader
        eyebrow="Frota"
        title="Viaturas e manutenção"
        subtitle="Inspeções, revisões, pneus e tacógrafo — tudo em dia para não ficar parado na estrada com carga a bordo."
        stats={[
          { label: "Unidades", value: String(trucks.length) },
          { label: "Itens em atraso", value: String(overdue) },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {trucks.map((t) => {
          const items = byTruck.get(t.id) ?? [];
          const bad = items.filter((i) => i.status !== "ok");
          const { label: fleetLabel, hint: fleetHint } = fleetBadgeFromJobs(jobs, t.id, t.status);
          const activeJob = activeJobByTruck.get(t.id) ?? null;
          const pct = activeJob ? jobProgressPct(activeJob) : 0;
          return (
            <Card
              key={t.id}
              id={`fleet-card-${t.id}`}
              className={clsx("flex flex-col gap-3", highlightedTruck === t.id && "ring-2 ring-[#2D5F4E]")}
            >
              {/* ── Truck identity ── */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-lg font-bold text-[#2D5F4E]">{t.plate}</div>
                  <div className="text-sm font-medium text-[var(--app-fg)]">{t.name}</div>
                  <div className="text-xs text-[var(--app-muted)]">
                    {t.model} · {t.yearManuf ?? "—"} · {t.odometerKm != null ? `${(t.odometerKm / 1000).toFixed(0)}k km` : "—"}
                  </div>
                </div>
                <div className="flex max-w-[min(100%,11rem)] flex-col items-end gap-1 text-right">
                  <Badge variant="muted" className="capitalize">
                    {fleetLabel}
                  </Badge>
                  {fleetHint && (
                    <p className="text-[9px] leading-tight text-[var(--app-muted)]">{fleetHint}</p>
                  )}
                </div>
              </div>

              {/* ── Active job ── */}
              {activeJob ? (
                <div
                  className="rounded-xl border p-3"
                  style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Route className="h-3.5 w-3.5 shrink-0 text-[#2D5F4E]" />
                      <span className="font-mono text-[11px] font-bold text-[#2D5F4E]">{activeJob.id}</span>
                      <span className={clsx("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", STATUS_COLOR[activeJob.status] ?? "bg-black/5 text-[var(--app-muted)]")}>
                        {STATUS_LABELS[activeJob.status]}
                      </span>
                    </div>
                    <Link
                      to={mapUrl({ truck: t.id })}
                      className="text-[10px] font-semibold text-[#2D5F4E] hover:underline"
                    >
                      Mapa
                    </Link>
                  </div>
                  <p className="mt-1 truncate text-[12px] font-semibold text-[var(--app-fg)]">{activeJob.client}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--app-muted)]">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {routeSummary(activeJob)}
                  </p>
                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-[9px] text-[var(--app-muted)]">
                      <span>{activeJob.stops.filter(s => s.completed).length}/{activeJob.stops.length} paragens</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-black/10">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: "#2D5F4E" }}
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="flex items-center gap-1 text-[10px] text-[var(--app-muted)]">
                      <Package className="h-3 w-3" />
                      {activeJob.totalPallets} plt · {(activeJob.totalWeightKg / 1000).toFixed(1)} t
                    </p>
                    <Link
                      to={`/app/jobs?job=${activeJob.id}`}
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#2D5F4E] hover:underline"
                    >
                      Detalhe <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-between rounded-xl border border-dashed px-3 py-2.5"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <p className="text-[11px] text-[var(--app-muted)]">
                    {t.status === "maintenance" ? "Em manutenção — indisponível" : "Sem trabalho ativo"}
                  </p>
                  {t.status !== "maintenance" && (
                    <Link
                      to={dispatchUrl(t.id)}
                      className="text-[10px] font-semibold text-[#2D5F4E] hover:underline"
                    >
                      Expedir →
                    </Link>
                  )}
                </div>
              )}

              {/* ── Maintenance ── */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--app-muted)]">
                  Manutenção
                </p>
                {items.length === 0 ? (
                  <p className="text-xs text-[var(--app-muted)]">Sem registos.</p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-[var(--app-border)] px-2 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-medium text-[var(--app-fg)]">
                            <Wrench className="h-3.5 w-3.5 shrink-0 text-[var(--app-muted)]" />
                            <span className="truncate">{m.label}</span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-[var(--app-muted)]">
                            Vence: {m.dueDate}
                            {m.lastDoneDate ? ` · Último: ${m.lastDoneDate}` : ""}
                          </div>
                          {m.notes ? (
                            <div className="mt-1 flex items-start gap-1 text-[10px] text-[#7A5C2E]">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              {m.notes}
                            </div>
                          ) : null}
                        </div>
                        {statusBadge(m.status)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {bad.length > 0 ? (
                <p className="text-[11px] font-semibold text-rose-700">
                  {bad.length} {bad.length === 1 ? "item em atraso ou a vencer" : "itens em atraso ou a vencer"}
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
