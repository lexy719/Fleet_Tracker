/**
 * UnassignedJobsPanel — left column of the Dispatch page.
 *
 * Shows two tabs:
 *  • "A planear"  — backlog jobs waiting to be planned & assigned
 *  • "Atribuídos" — active jobs (assigned / loading / in_transit)
 *
 * Clicking "Planear rota" / "Ver rota" on a job card fires onJobSelect so the
 * parent can open JobRoutePlanner in the right column.
 */

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  RefreshCw,
  Route,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { STATUS_LABELS, useJobs } from "../../context/JobsContext";
import type { Job, JobStatus } from "../../data/types";

/* ── Haversine (local copy to avoid circular dep) ─────── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const ACTIVE_STATUSES: JobStatus[] = ["assigned", "loading", "in_transit"];

/* ── Small UI helpers ─────────────────────────────────── */
function slaChip(s: Job["slaStatus"]) {
  if (s === "breached") return { t: "SLA violado",  cls: "text-rose-700" };
  if (s === "at_risk")  return { t: "SLA em risco", cls: "text-[#7A5C2E]" };
  return                       { t: "No prazo",     cls: "text-[#2D5F4E]" };
}

function statusBadge(status: JobStatus) {
  const label = STATUS_LABELS[status] ?? status;
  const bg =
    status === "in_transit" ? "bg-blue-500/12 text-blue-900" :
    status === "loading"    ? "bg-[#F2EBE0] text-[#6B4E2A]" :
                              "bg-[#E8F0EC] text-[#2D5F4E]";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold ${bg}`}>
      {label}
    </span>
  );
}

function priorityBadge(p: Job["priority"]) {
  if (p === "normal") return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#F2EBE0] px-1.5 py-0.5 text-[9px] font-semibold text-[#6B4E2A]">
      <AlertTriangle className="h-2.5 w-2.5" />
      {p === "critical" ? "Crítico" : "Urgente"}
    </span>
  );
}

function routeSummary(j: Job) {
  const first = [...j.stops].sort((a, b) => a.sequence - b.sequence)[0];
  const last  = [...j.stops].sort((a, b) => b.sequence - a.sequence)[0];
  if (!first || !last || first.id === last.id) return first?.city ?? "—";
  return `${first.city} → ${last.city}`;
}

/* ── Props ────────────────────────────────────────────── */
export type UnassignedJobsPanelProps = {
  selectedJobId?: string | null;
  onJobSelect?: (jobId: string) => void;
};

/* ── Component ────────────────────────────────────────── */
export function UnassignedJobsPanel({
  selectedJobId,
  onJobSelect,
}: UnassignedJobsPanelProps) {
  const { jobs, advanceJob } = useJobs();
  const [tab, setTab] = useState<"queue" | "active">("queue");

  /* ── Derived lists ────────────────────────────────────── */
  const queue = useMemo(
    () =>
      jobs
        .filter((j) => j.status === "backlog")
        .sort((a, b) => {
          const order = { breached: 0, at_risk: 1, on_track: 2 };
          const sa = order[a.slaStatus] ?? 2;
          const sb = order[b.slaStatus] ?? 2;
          if (sa !== sb) return sa - sb;
          return a.pickupDeadline.localeCompare(b.pickupDeadline);
        }),
    [jobs],
  );

  const active = useMemo(
    () =>
      jobs
        .filter((j) => ACTIVE_STATUSES.includes(j.status))
        .sort((a, b) => {
          const order = { breached: 0, at_risk: 1, on_track: 2 };
          const sa = order[a.slaStatus] ?? 2;
          const sb = order[b.slaStatus] ?? 2;
          if (sa !== sb) return sa - sb;
          return a.deliveryDeadline.localeCompare(b.deliveryDeadline);
        }),
    [jobs],
  );

  const atRiskCount = queue.filter((j) => j.slaStatus !== "on_track").length;

  // Backload opportunity: for each backlog job, check if any active job's
  // last delivery stop is within 80 km of this job's first pickup stop.
  const backloadJobIds = useMemo(() => {
    const activeJobs = jobs.filter((j) => ["in_transit", "loading", "assigned"].includes(j.status));
    const result = new Set<string>();
    for (const bJob of queue) {
      const pickup = [...bJob.stops]
        .filter((s) => s.type === "pickup")
        .sort((a, b) => a.sequence - b.sequence)[0];
      if (!pickup) continue;
      for (const aJob of activeJobs) {
        const dropoff = [...aJob.stops]
          .filter((s) => s.type === "delivery")
          .sort((a, b) => b.sequence - a.sequence)[0];
        if (!dropoff) continue;
        if (haversineKm(dropoff.lat, dropoff.lng, pickup.lat, pickup.lng) <= 80) {
          result.add(bJob.id);
          break;
        }
      }
    }
    return result;
  }, [queue, jobs]);

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--app-card)]">

      {/* Header */}
      <div className="shrink-0 border-b border-[var(--app-border)] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">
          Trabalhos · expedição
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
          <div>
            <span className="text-2xl font-black tabular-nums leading-none text-[var(--app-fg)]">
              {queue.length}
            </span>
            <span className="ml-1 text-[var(--app-muted)]">por expedir</span>
          </div>
          {atRiskCount > 0 && (
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-rose-500" />
              <span className="font-semibold text-rose-700">{atRiskCount} prazo em risco</span>
            </div>
          )}
          {active.length > 0 && (
            <div className="flex items-center gap-1 text-[var(--app-muted)]">
              <CheckCircle2 className="h-3 w-3 text-[#2D5F4E]" />
              {active.length} em curso
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-[var(--app-border)]">
        {(["queue", "active"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 text-[11px] font-semibold transition ${
              tab === t
                ? "border-b-2 border-[#2D5F4E] text-[#2D5F4E]"
                : "text-[var(--app-muted)] hover:text-[var(--app-fg)]"
            }`}
          >
            {t === "queue"
              ? `Por expedir${queue.length > 0 ? ` (${queue.length})` : ""}`
              : `Em curso${active.length > 0 ? ` (${active.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-3">

        {/* ── "A planear" tab ────────────────────────────── */}
        {tab === "queue" && (
          queue.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-[#2D5F4E] opacity-40" />
              <p className="text-xs text-[var(--app-muted)]">Nenhum trabalho por planear.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {queue.map((j) => {
                const sla      = slaChip(j.slaStatus);
                const isActive = selectedJobId === j.id;
                return (
                  <li
                    key={j.id}
                    className={`rounded-xl border p-3 shadow-sm transition ${
                      isActive
                        ? "border-[#2D5F4E] bg-[#E8F0EC]"
                        : j.slaStatus === "breached"
                          ? "border-l-[3px] border-l-rose-500 border-[var(--app-border)] bg-[var(--app-elevated)]"
                          : j.slaStatus === "at_risk"
                            ? "border-l-[3px] border-l-amber-500 border-[var(--app-border)] bg-[var(--app-elevated)]"
                            : "border-[var(--app-border)] bg-[var(--app-elevated)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-[#2D5F4E]">
                          {j.id}
                        </span>
                        {backloadJobIds.has(j.id) && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                            style={{ background: "#E8F0EC", color: "#2D5F4E" }}
                            title="Retorno disponível — camião ativo perto deste levantamento"
                          >
                            <RefreshCw className="h-2.5 w-2.5" />
                            Retorno
                          </span>
                        )}
                      </div>
                      {priorityBadge(j.priority)}
                    </div>

                    <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-[var(--app-fg)]">
                      {j.client}
                    </p>

                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--app-muted)]">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {routeSummary(j)}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--app-muted)]">
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-black/5 px-1.5 py-0.5 font-medium">
                        <Package className="h-3 w-3" />
                        {j.totalPallets} plt · {(j.totalWeightKg / 1_000).toFixed(1)} t
                      </span>
                      <span className={`inline-flex items-center gap-0.5 font-semibold ${sla.cls}`}>
                        <Clock className="h-3 w-3" />
                        {sla.t}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="mt-2.5 flex items-center gap-2">
                      {onJobSelect && (
                        <button
                          type="button"
                          onClick={() => onJobSelect(j.id)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition ${
                            isActive
                              ? "bg-[#2D5F4E] text-white"
                              : "border border-[#2D5F4E] bg-[#E8F0EC] text-[#2D5F4E] hover:bg-[#2D5F4E] hover:text-white"
                          }`}
                        >
                          <Route className="h-3 w-3" />
                          {isActive ? "A planear…" : "Planear rota"}
                        </button>
                      )}
                      <Link
                        to={`/app/jobs?job=${j.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] font-semibold text-[#2D5F4E] hover:underline"
                      >
                        Ver detalhe →
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {/* ── "Atribuídos" tab ───────────────────────────── */}
        {tab === "active" && (
          active.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Package className="h-8 w-8 text-[var(--app-muted)] opacity-40" />
              <p className="text-xs text-[var(--app-muted)]">Nenhum trabalho em curso de momento.</p>
              <button
                type="button"
                onClick={() => setTab("queue")}
                className="mt-1 text-[11px] font-semibold text-[#2D5F4E] hover:underline"
              >
                ← Ver trabalhos por planear
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {active.map((j) => {
                const sla      = slaChip(j.slaStatus);
                const isActive = selectedJobId === j.id;
                const completedStops = j.stops.filter((s) => s.completed).length;
                const totalStops     = j.stops.length;

                return (
                  <li
                    key={j.id}
                    className={`rounded-xl border p-3 shadow-sm transition ${
                      isActive
                        ? "border-[#2D5F4E] bg-[#E8F0EC]"
                        : "border-[var(--app-border)] bg-[var(--app-elevated)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-[#2D5F4E]">{j.id}</span>
                      {statusBadge(j.status)}
                    </div>

                    <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-[var(--app-fg)]">
                      {j.client}
                    </p>

                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--app-muted)]">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {routeSummary(j)}
                    </div>

                    {/* Progress bar */}
                    {totalStops > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[9px] text-[var(--app-muted)]">
                          <span>{completedStops}/{totalStops} paragens</span>
                          {j.plannedKm && (
                            <span>{j.plannedKm} km planeados</span>
                          )}
                        </div>
                        <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-black/10">
                          <div
                            className="h-full rounded-full bg-[#2D5F4E]"
                            style={{ width: `${(completedStops / totalStops) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--app-muted)]">
                      <span className={`inline-flex items-center gap-0.5 font-semibold ${sla.cls}`}>
                        <Clock className="h-3 w-3" />
                        {sla.t}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="mt-2.5 flex items-center gap-2">
                      {onJobSelect && (
                        <button
                          type="button"
                          onClick={() => onJobSelect(j.id)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition ${
                            isActive
                              ? "bg-[#2D5F4E] text-white"
                              : "border border-[#2D5F4E] bg-[#E8F0EC] text-[#2D5F4E] hover:bg-[#2D5F4E] hover:text-white"
                          }`}
                        >
                          <Route className="h-3 w-3" />
                          {isActive ? "A rever…" : "Ver rota"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => advanceJob(j.id)}
                        className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#2D5F4E] hover:underline"
                      >
                        Avançar estado <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
