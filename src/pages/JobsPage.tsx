import { AlertTriangle, Clock, MapPin, Package, Plus, Search, Trash2, User, X } from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getDriverById, getTruckById } from "../data/mockData";
import type { CargoType, Job, JobPriority, JobStatus, SlaStatus } from "../data/types";
import { canUnassignJob, STATUS_LABELS, useJobs } from "../context/JobsContext";
import { JobDetailSheet } from "../components/jobs/JobDetailSheet";
import { NewJobModal } from "../components/jobs/NewJobModal";
import { driversUrl, mapUrl } from "../lib/appLinks";

/* ─── reference clock — always real time, seed dates are shifted to match ── */
const DEMO_NOW = new Date();

function slaDeadline(j: Job): string {
  return j.status === "backlog" || j.status === "queued" || j.status === "assigned"
    ? j.pickupDeadline
    : j.deliveryDeadline;
}

type SlaTone = "ok" | "warn" | "crit";
function slaCountdown(deadline: string): { label: string; tone: SlaTone } {
  const diffH = (new Date(deadline).getTime() - DEMO_NOW.getTime()) / 3_600_000;
  if (diffH < 0)  return { label: `+${Math.abs(Math.ceil(diffH))}h`, tone: "crit" };
  if (diffH < 2)  return { label: `${diffH.toFixed(1)}h`, tone: "crit" };
  if (diffH < 6)  return { label: `${diffH.toFixed(1)}h`, tone: "warn" };
  const d = Math.floor(diffH / 24);
  const h = Math.round(diffH % 24);
  return { label: d > 0 ? `${d}d ${h}h` : `${h}h`, tone: "ok" };
}

const CARGO_COLOR: Record<CargoType, string> = {
  dry:          "#8B6F47",
  refrigerated: "#2D5F4E",
  hazmat:       "#A84432",
  bulk:         "#7A6B8A",
  automotive:   "#6B7A52",
};
const CARGO_LABEL: Record<CargoType, string> = {
  dry:          "Seco",
  refrigerated: "Reefer",
  hazmat:       "ADR",
  bulk:         "Granel",
  automotive:   "Auto",
};
const PRIORITY_BORDER: Record<JobPriority, string> = {
  normal:   "",
  urgent:   "border-l-[3px] border-l-[#C4A882]",
  critical: "border-l-[3px] border-l-[#A84432]",
};

const COLUMN_EMPTY: Partial<Record<JobStatus, string>> = {
  backlog:    "Sem trabalhos por expedir",
  queued:     "Nenhum trabalho em fila",
  assigned:   "Nenhum motorista a caminho",
  loading:    "Nenhuma carga em curso",
  in_transit: "Nenhuma viatura em viagem",
  delivered:  "Nenhuma entrega confirmada",
  invoiced:   "Nenhuma fatura emitida",
};

const COLUMNS: { status: JobStatus; pt: string }[] = [
  { status: "backlog",    pt: "Por expedir" },
  { status: "queued",     pt: "Na fila" },
  { status: "assigned",   pt: "Motorista a caminho" },
  { status: "loading",    pt: "A carregar" },
  { status: "in_transit", pt: "Em viagem" },
  { status: "delivered",  pt: "Entregue" },
  { status: "invoiced",   pt: "Faturado" },
];

function routeSummary(j: Job) {
  const a = j.stops[0]; const b = j.stops[j.stops.length - 1];
  return a && b ? `${a.city} → ${b.city}` : "—";
}
function cardBg(s: SlaStatus) {
  if (s === "breached") return "bg-[#F6E3DE] border-[#A84432]/30";
  if (s === "at_risk")  return "bg-[#F2EBE0] border-[#C4A882]/30";
  return "bg-[var(--app-elevated)] border-[var(--app-border)]";
}

function SlaChip({ deadline, status }: { deadline: string; status: JobStatus }) {
  if (status === "delivered" || status === "invoiced" || status === "cancelled") return null;
  const { label, tone } = slaCountdown(deadline);
  const bg =
    tone === "crit" ? "bg-[#F6E3DE] text-[#A84432]" :
    tone === "warn" ? "bg-[#F2EBE0] text-[#8B6F47]" :
                      "bg-[#E8F0EC] text-[#2D5F4E]";
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", bg)}>
      <Clock className="h-2.5 w-2.5" />{label}
    </span>
  );
}

export function JobsPage() {
  const { jobs, unassignJob, forceJobStatus } = useJobs();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<JobStatus | "all">("all");
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [showNewJob, setShowNewJob] = useState(false);
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<JobStatus | null>(null);

  /* deep-link ?job=X */
  useEffect(() => {
    const jid = searchParams.get("job");
    if (jid) setOpenJobId(jid);
  }, [searchParams]);

  function openJob(id: string) {
    setOpenJobId(id);
    setSearchParams((p) => { const n = new URLSearchParams(p); n.set("job", id); return n; }, { replace: true });
  }
  function closeJob() {
    setOpenJobId(null);
    setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("job"); return n; }, { replace: true });
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return jobs.filter((j) => {
      if (j.status === "cancelled") return false;
      if (filterStatus !== "all" && j.status !== filterStatus) return false;
      if (!q) return true;
      return (
        j.id.toLowerCase().includes(q) ||
        j.client.toLowerCase().includes(q) ||
        j.reference.toLowerCase().includes(q) ||
        j.stops.some((s) => s.city.toLowerCase().includes(q))
      );
    });
  }, [jobs, search, filterStatus]);

  const byCol = useMemo(() => {
    const m = new Map<JobStatus, Job[]>();
    for (const c of COLUMNS) m.set(c.status, []);
    for (const j of filtered) { const list = m.get(j.status); if (list) list.push(j); }
    return m;
  }, [filtered]);

  const atRisk  = jobs.filter((j) => j.slaStatus !== "on_track" && j.status !== "delivered" && j.status !== "invoiced" && j.status !== "cancelled").length;
  const revenue = jobs.filter((j) => j.status === "delivered" || j.status === "invoiced").reduce((s, j) => s + j.rateEur, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ background: "var(--workspace-bg)" }}>

      {/* ── Header ── */}
      <header
        className="shrink-0 border-b px-4 py-3 md:px-6"
        style={{ background: "var(--app-card)", borderColor: "var(--app-border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-muted)" }}>
              Pipeline · do pedido à fatura
            </p>
            <h1 className="text-[18px] font-black" style={{ color: "var(--app-fg)" }}>Trabalhos</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className="flex items-center gap-1.5 rounded-full border px-3 py-1"
              style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
            >
              <span style={{ color: "var(--app-muted)" }}>Total</span>
              <span className="font-bold" style={{ color: "var(--app-fg)" }}>{jobs.filter(j => j.status !== "cancelled").length}</span>
            </span>
            {atRisk > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-[#A84432]/30 bg-[#F6E3DE] px-3 py-1">
                <AlertTriangle className="h-3 w-3 text-[#A84432]" />
                <span className="font-bold text-[#A84432]">{atRisk} em risco</span>
              </span>
            )}
            <span
              className="flex items-center gap-1.5 rounded-full border px-3 py-1"
              style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
            >
              <span style={{ color: "var(--app-muted)" }}>Faturável</span>
              <span className="font-bold text-[#2D5F4E]">
                {revenue.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setShowNewJob(true)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold text-white transition hover:opacity-90"
              style={{ background: "#2D5F4E" }}
            >
              <Plus className="h-3.5 w-3.5" />
              Novo trabalho
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-1.5"
            style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)", minWidth: 180, maxWidth: 260 }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--app-muted)" }} />
            <input
              type="text"
              placeholder="Cliente, ID, cidade…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--app-muted)]"
              style={{ color: "var(--app-fg)" }}
            />
            {search && (
              <button onClick={() => setSearch("")}><X className="h-3.5 w-3.5" style={{ color: "var(--app-muted)" }} /></button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {(["all", ...COLUMNS.map((c) => c.status)] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s as JobStatus | "all")}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition"
                style={
                  filterStatus === s
                    ? { background: "#2D5F4E", color: "#fff" }
                    : { background: "var(--app-elevated)", color: "var(--app-muted)", border: "1px solid var(--app-border)" }
                }
              >
                {s === "all" ? "Todos" : STATUS_LABELS[s as JobStatus]}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Kanban ── */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden p-4 md:gap-4">
        {COLUMNS.map((col) => {
          const list = byCol.get(col.status) ?? [];
          const colRevenue = list.reduce((s, j) => s + j.rateEur, 0);
          const hasRisk    = list.some((j) => j.slaStatus !== "on_track");
          return (
            <section
              key={col.status}
              className={clsx(
                "flex w-[min(100%,272px)] shrink-0 flex-col rounded-2xl border transition-shadow",
                dragOverColumn === col.status && draggingJobId
                  ? "ring-2 ring-[#2D5F4E] shadow-lg"
                  : "",
              )}
              style={{ borderColor: dragOverColumn === col.status && draggingJobId ? "#2D5F4E" : "var(--app-border)", background: "var(--app-card)" }}
              onDragOver={(e) => { e.preventDefault(); setDragOverColumn(col.status); }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverColumn(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const jobId = e.dataTransfer.getData("text/plain");
                if (jobId) {
                  if (col.status === "cancelled") {
                    const job = jobs.find((j) => j.id === jobId);
                    const name = job ? `${job.id} — ${job.client}` : jobId;
                    if (!window.confirm(`Cancelar ${name}?\n\nEsta ação não pode ser desfeita.`)) {
                      setDragOverColumn(null);
                      setDraggingJobId(null);
                      return;
                    }
                  }
                  forceJobStatus(jobId, col.status);
                }
                setDragOverColumn(null);
                setDraggingJobId(null);
              }}
            >
              {/* Column header */}
              <div className="shrink-0 border-b px-3 py-2.5" style={{ borderColor: "var(--app-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>
                    {col.pt}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {hasRisk && <AlertTriangle className="h-3 w-3 text-[#8B6F47]" />}
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={list.length > 0 ? { background: "#E8F0EC", color: "#2D5F4E" } : { background: "var(--app-elevated)", color: "var(--app-muted)" }}
                    >
                      {list.length}
                    </span>
                  </div>
                </div>
                {colRevenue > 0 && (
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--app-muted)" }}>
                    {colRevenue.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                  </p>
                )}
              </div>

              {/* Cards */}
              <div className="min-h-[120px] flex-1 space-y-2 overflow-y-auto p-2 scroll-thin">
                {list.map((j) => {
                  const driver = j.assignedDriverId ? getDriverById(j.assignedDriverId) : null;
                  const truck  = j.assignedTruckId  ? getTruckById(j.assignedTruckId)   : null;
                  return (
                    <article
                      key={j.id}
                      id={`job-card-${j.id}`}
                      role="button"
                      tabIndex={0}
                      draggable
                      onClick={() => openJob(j.id)}
                      onKeyDown={(e) => e.key === "Enter" && openJob(j.id)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", j.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingJobId(j.id);
                      }}
                      onDragEnd={() => { setDraggingJobId(null); setDragOverColumn(null); }}
                      className={clsx(
                        "cursor-grab rounded-xl border p-3 shadow-sm transition active:cursor-grabbing hover:shadow-md hover:ring-1 hover:ring-[#2D5F4E]/20",
                        cardBg(j.slaStatus),
                        PRIORITY_BORDER[j.priority],
                        openJobId === j.id && "ring-2 ring-[#2D5F4E]",
                        draggingJobId === j.id && "opacity-40 shadow-none",
                      )}
                    >
                      {/* ID + SLA + remover atribuição */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[10px] font-black" style={{ color: "#2D5F4E" }}>{j.id}</span>
                        <div className="flex items-center gap-1">
                          <SlaChip deadline={slaDeadline(j)} status={j.status} />
                          {canUnassignJob(j) && (
                            <button
                              type="button"
                              title="Remover atribuição — liberta viatura e motorista"
                              className="rounded-md p-1 text-[#A84432] transition hover:bg-[#F6E3DE]"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  window.confirm(
                                    `Remover atribuição de ${j.id}? O trabalho volta a «Por atribuir» e a viatura e o motorista ficam livres.`,
                                  )
                                ) {
                                  unassignJob(j.id);
                                  if (openJobId === j.id) closeJob();
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Client */}
                      <p className="mt-1.5 line-clamp-1 text-[13px] font-semibold" style={{ color: "var(--app-fg)" }}>
                        {j.client}
                      </p>

                      {/* Route */}
                      <p className="mt-0.5 flex items-center gap-1 text-[11px]" style={{ color: "var(--app-muted)" }}>
                        <MapPin className="h-3 w-3 shrink-0" />
                        {routeSummary(j)}
                      </p>

                      {/* Cargo + weight */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ background: `${CARGO_COLOR[j.cargoType]}18`, color: CARGO_COLOR[j.cargoType] }}
                        >
                          {CARGO_LABEL[j.cargoType]}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--app-muted)" }}>
                          <Package className="h-3 w-3" />
                          {j.totalPallets} plt · {(j.totalWeightKg / 1000).toFixed(1)} t
                        </span>
                      </div>

                      {/* Driver + rate */}
                      <div className="mt-2 flex items-center justify-between gap-1">
                        {driver ? (
                          <Link
                            to={driversUrl(driver.id)}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold hover:underline"
                            style={{ color: "#2D5F4E" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <User className="h-3 w-3" />
                            {driver.name.split(" ")[0]}
                          </Link>
                        ) : (
                          <span className="text-[10px] italic" style={{ color: "var(--app-muted)" }}>
                            {j.status === "backlog" ? "clicar para atribuir" : "sem motorista"}
                          </span>
                        )}
                        <span className="font-mono text-[10px] font-black" style={{ color: "#2D5F4E" }}>
                          {j.rateEur.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                        </span>
                      </div>

                      {/* Map link if in transit */}
                      {truck && (j.status === "in_transit" || j.status === "loading") && (
                        <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
                          <Link
                            to={mapUrl({ truck: truck.id })}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold hover:underline"
                            style={{ color: "#2D5F4E" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MapPin className="h-3 w-3" />
                            {truck.plate} · mapa ao vivo
                          </Link>
                        </div>
                      )}
                    </article>
                  );
                })}
                {list.length === 0 && (
                  <div
                    className={clsx(
                      "flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed py-8 text-center transition",
                      dragOverColumn === col.status && draggingJobId
                        ? "border-[#2D5F4E] bg-[#E8F0EC]"
                        : "border-transparent",
                    )}
                  >
                    <p className="text-[11px]" style={{ color: "var(--app-muted)" }}>
                      {COLUMN_EMPTY[col.status] ?? "Vazio"}
                    </p>
                    {dragOverColumn === col.status && draggingJobId && (
                      <p className="text-[10px] font-semibold text-[#2D5F4E]">Largar aqui</p>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Job detail sheet ── */}
      <JobDetailSheet jobId={openJobId} onClose={closeJob} />

      {/* ── New job modal ── */}
      {showNewJob && <NewJobModal onClose={() => setShowNewJob(false)} />}
    </div>
  );
}
