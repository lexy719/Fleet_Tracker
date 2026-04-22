import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Euro,
  FileWarning,
  Globe,
  MapPin,
  Package,
  Radio,
  ShieldAlert,
  Truck,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { drivers, getTruckById } from "../data/mockData";
import { useJobs } from "../context/JobsContext";
import { STATUS_LABELS } from "../context/JobsContext";
import { useFleetData } from "../context/FleetDataContext";
import type { Driver, Job } from "../data/types";
import { mapUrl } from "../lib/appLinks";

/* ── clock ───────────────────────────────────────────── */
function useClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return t;
}

const TODAY = new Date().toISOString().slice(0, 10);

function isJobToday(j: Job) {
  return (
    j.pickupDeadline.startsWith(TODAY) ||
    j.deliveryDeadline.startsWith(TODAY) ||
    j.createdAt.startsWith(TODAY)
  );
}

/* ── compliance helpers ──────────────────────────────── */
function daysUntil(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

type DocAlert = {
  driver: Driver;
  docLabel: string;
  days: number;   // negative = already expired
};

const DOC_LABELS: Array<{ key: keyof Driver; label: string }> = [
  { key: "licenseExpiry",  label: "Carta de condução" },
  { key: "cpcExpiry",      label: "CPC" },
  { key: "adrExpiry",      label: "Certificado ADR" },
  { key: "tachoCalExpiry", label: "Calibração tacógrafo" },
];

function getDocAlerts(threshold = 90): DocAlert[] {
  const alerts: DocAlert[] = [];
  for (const d of drivers) {
    for (const { key, label } of DOC_LABELS) {
      const days = daysUntil(d[key] as string | undefined);
      if (days === null) continue;
      if (days <= threshold) {
        alerts.push({ driver: d, docLabel: label, days });
      }
    }
  }
  // Expired first, then by days ascending
  return alerts.sort((a, b) => a.days - b.days);
}

/* ── small chips ─────────────────────────────────────── */
function SlaChip({ status }: { status: Job["slaStatus"] }) {
  if (status === "breached")
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700">
        <AlertTriangle className="h-2.5 w-2.5" /> Prazo ultrapassado
      </span>
    );
  if (status === "at_risk")
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#F2EBE0] px-2 py-0.5 text-[10px] font-bold text-[#7A5C2E]">
        <Clock className="h-2.5 w-2.5" /> Prazo em risco
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#E8F0EC] px-2 py-0.5 text-[10px] font-bold text-[#2D5F4E]">
      <CheckCircle2 className="h-2.5 w-2.5" /> No prazo
    </span>
  );
}

function StatusPill({ status }: { status: Job["status"] }) {
  const label = STATUS_LABELS[status] ?? status;
  const cls =
    status === "in_transit"
      ? "bg-blue-500/15 text-blue-800"
      : status === "loading"
      ? "bg-[#F2EBE0] text-[#6B4E2A]"
      : status === "assigned"
      ? "bg-[#E8F0EC] text-[#2D5F4E]"
      : status === "queued"
      ? "bg-[#F2EBE0] text-[#6B4E2A]"
      : "bg-black/5 text-[var(--app-muted)]";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────── */
export function TodayPage() {
  const now = useClock();
  const { jobs } = useJobs();
  const { trucksLive } = useFleetData();

  /* ── computed data ───────────────────────────────── */
  const jobsToday = useMemo(
    () => jobs.filter(isJobToday).sort((a, b) => a.stops[0]?.scheduledTime.localeCompare(b.stops[0]?.scheduledTime ?? "") ?? 0),
    [jobs],
  );

  const needsAction = useMemo(
    () =>
      jobs
        .filter(
          (j) =>
            !["delivered", "invoiced", "cancelled"].includes(j.status) &&
            (j.status === "backlog" || j.slaStatus === "breached" || j.slaStatus === "at_risk"),
        )
        .sort((a, b) => {
          const ord = { breached: 0, at_risk: 1, on_track: 2 } as Record<string, number>;
          const diff = (ord[a.slaStatus] ?? 2) - (ord[b.slaStatus] ?? 2);
          if (diff !== 0) return diff;
          // unassigned before assigned-but-at-risk
          if (a.status === "backlog" && b.status !== "backlog") return -1;
          if (b.status === "backlog" && a.status !== "backlog") return 1;
          return a.pickupDeadline.localeCompare(b.pickupDeadline);
        }),
    [jobs],
  );

  const inTransit = useMemo(
    () => jobs.filter((j) => j.status === "in_transit" || j.status === "loading"),
    [jobs],
  );

  /* ── compliance ─────────────────────────────────── */
  const docAlerts      = useMemo(() => getDocAlerts(90), []);
  const criticalDocs   = docAlerts.filter((a) => a.days <= 0);
  const urgentDocs     = docAlerts.filter((a) => a.days > 0 && a.days <= 30);
  const warningDocs    = docAlerts.filter((a) => a.days > 30 && a.days <= 90);
  const hasComplianceIssue = criticalDocs.length > 0 || urgentDocs.length > 0;

  /* ── cabotage tracking (EU: max 3 ops in 7 days after intl entry) ── */
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const recentIntlJobs = useMemo(
    () => jobs.filter((j) => j.isInternational && j.createdAt >= sevenDaysAgo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs],
  );
  const cabotageOps = recentIntlJobs.length;

  /* ── KPIs ────────────────────────────────────────── */
  const kpiToday     = jobsToday.length;
  const kpiTransit   = inTransit.length;
  const kpiBacklog   = jobs.filter((j) => j.status === "backlog").length;
  const kpiAtRisk    = needsAction.filter((j) => j.slaStatus !== "on_track").length;
  const kpiRevenue   = jobsToday.reduce((s, j) => s + j.rateEur, 0);

  const driversAvail = drivers.filter((d) => d.availability === "available").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ background: "var(--workspace-bg)" }}>

      {/* ── Header ─────────────────────────────────── */}
      <header
        className="shrink-0 border-b px-4 py-3 md:px-6"
        style={{ background: "var(--app-card)", borderColor: "var(--app-border)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-muted)" }}>
              Centro de comando
            </p>
            <h1 className="text-[17px] font-black leading-tight tracking-tight" style={{ color: "var(--app-fg)" }}>
              {format(now, "EEEE, d MMMM", { locale: pt })}
              <span className="ml-2 text-[14px] font-semibold tabular-nums" style={{ color: "var(--app-muted)" }}>
                {format(now, "HH:mm")}
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/app/dispatch"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ background: "#2D5F4E" }}
            >
              <Radio className="h-3.5 w-3.5" /> Expedição
            </Link>
            <Link
              to="/app/jobs"
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--app-border)", color: "var(--app-fg)" }}
            >
              <Package className="h-3.5 w-3.5" /> Trabalhos
            </Link>
            <Link
              to="/app/map"
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--app-border)", color: "var(--app-fg)" }}
            >
              <MapPin className="h-3.5 w-3.5" /> Mapa ao vivo
            </Link>
          </div>
        </div>
      </header>

      {/* ── KPI strip ───────────────────────────────── */}
      <div
        className="grid shrink-0 grid-cols-2 gap-px border-b sm:grid-cols-5"
        style={{ background: "var(--app-border)" }}
      >
        {[
          { label: "Entregas hoje",      value: String(kpiToday),   icon: Package,     color: "#2D5F4E" },
          { label: "Em viagem agora",   value: String(kpiTransit), icon: Truck,       color: "#2D5F4E" },
          { label: "Por expedir",       value: String(kpiBacklog), icon: Clock,       color: kpiBacklog > 0 ? "#8B6F47" : "#2D5F4E" },
          { label: "Prazo em risco",    value: String(kpiAtRisk),  icon: AlertTriangle, color: kpiAtRisk > 0 ? "#A84432" : "#2D5F4E" },
          { label: "Receita hoje",      value: `€${kpiRevenue.toLocaleString("pt-PT")}`, icon: Euro, color: "#2D5F4E" },
        ].map((k) => (
          <div key={k.label} className="flex items-center gap-3 bg-[var(--app-card)] px-4 py-3.5 sm:px-5">
            <k.icon className="h-4 w-4 shrink-0" style={{ color: k.color }} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>{k.label}</p>
              <p className="text-[22px] font-black tabular-nums leading-none" style={{ color: k.color !== "#2D5F4E" ? k.color : "var(--app-fg)" }}>{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Compliance alert banner ─────────────────────── */}
      {hasComplianceIssue && (
        <div
          className="shrink-0 border-b px-4 py-2 sm:px-6"
          style={{ background: criticalDocs.length > 0 ? "#FEF2F2" : "#FFFBEB", borderColor: criticalDocs.length > 0 ? "#FECACA" : "#FDE68A" }}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: criticalDocs.length > 0 ? "#991B1B" : "#92400E" }}>
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              Conformidade EU
            </span>
            {criticalDocs.length > 0 && (
              <span className="text-[11px] text-rose-800">
                {criticalDocs.length} documento{criticalDocs.length > 1 ? "s" : ""} vencido{criticalDocs.length > 1 ? "s" : ""}
                {" · "}{[...new Set(criticalDocs.map((a) => a.driver.name.split(" ")[0]))].join(", ")}
              </span>
            )}
            {urgentDocs.length > 0 && (
              <span className="text-[11px] text-amber-800">
                {urgentDocs.length} a vencer em {"<"}30 dias
                {" · "}{[...new Set(urgentDocs.map((a) => a.driver.name.split(" ")[0]))].join(", ")}
              </span>
            )}
            <Link
              to="/app/drivers"
              className="ml-auto text-[11px] font-semibold text-[#2D5F4E] hover:underline"
            >
              Ver motoristas →
            </Link>
          </div>
        </div>
      )}

      {/* ── Main grid — espaçamento + cartões para reduzir "tudo colado" ─ */}
      <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,360px)] lg:overflow-hidden lg:gap-5 lg:p-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.05fr)_minmax(300px,380px)]">

        {/* ── Col 1: Requer atenção ─────────────────── */}
        <section
          className="flex min-h-[200px] flex-col overflow-hidden rounded-2xl border shadow-sm lg:min-h-0"
          style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
        >
          <div className="shrink-0 border-b px-5 py-3.5" style={{ borderColor: "var(--app-border)" }}>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#2D5F4E]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">
                Requer atenção
              </p>
              {needsAction.length > 0 && (
                <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  {needsAction.length}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-[var(--app-muted)]">
              Por expedir e trabalhos com prazo em risco ou ultrapassado.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            {needsAction.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-[#2D5F4E] opacity-40" />
                <p className="text-xs text-[var(--app-muted)]">Tudo em ordem. Sem itens urgentes.</p>
              </div>
            ) : (
              <ul>
                {needsAction.map((j) => {
                  const isUnassigned = j.status === "backlog";
                  const borderColor =
                    j.slaStatus === "breached" ? "#A84432" :
                    j.slaStatus === "at_risk"  ? "#8B6F47" : "#2D5F4E";
                  const first = j.stops[0];
                  const last  = j.stops[j.stops.length - 1];
                  return (
                    <li
                      key={j.id}
                      className="border-b border-l-[3px] px-5 py-4"
                      style={{ borderColor: "var(--app-border)", borderLeftColor: borderColor }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold text-[#2D5F4E]">{j.id}</span>
                        <SlaChip status={j.slaStatus} />
                      </div>
                      <p className="mt-0.5 truncate text-[13px] font-semibold text-[var(--app-fg)]">{j.client}</p>
                      {first && last && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--app-muted)]">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {first.city} → {last.city}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <StatusPill status={j.status} />
                        {isUnassigned && (
                          <span className="rounded-full bg-[#F2EBE0] px-2 py-0.5 text-[9px] font-bold text-[#6B4E2A]">
                            Sem viatura
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        {isUnassigned ? (
                          <Link
                            to="/app/dispatch"
                            className="inline-flex items-center gap-1 rounded-lg border border-[#2D5F4E] bg-[#E8F0EC] px-2.5 py-1 font-semibold text-[#2D5F4E] transition hover:bg-[#2D5F4E] hover:text-white"
                          >
                            <Truck className="h-3 w-3" /> Atribuir na expedição
                          </Link>
                        ) : (
                          <Link
                            to={`/app/jobs?job=${j.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-elevated)] px-2.5 py-1 font-semibold text-[var(--app-fg)] transition hover:opacity-80"
                          >
                            Avançar estado <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                        <Link to={`/app/jobs?job=${j.id}`} className="font-semibold text-[#2D5F4E] hover:underline">
                          Detalhe
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ── Col 2: Em serviço + agenda (dois blocos separados) ─────────── */}
        <div className="flex min-h-[280px] flex-col gap-4 lg:min-h-0">
          <section
            className="flex min-h-0 flex-[1.1] flex-col overflow-hidden rounded-2xl border shadow-sm"
            style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
          >
            <div className="shrink-0 border-b px-5 py-3.5" style={{ borderColor: "var(--app-border)" }}>
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-[#2D5F4E]" />
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">
                  Em serviço agora
                </p>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-[var(--app-muted)]">
                Cargas em levantamento ou em viagem.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            {inTransit.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Truck className="h-7 w-7 text-[var(--app-muted)] opacity-30" />
                <p className="text-xs text-[var(--app-muted)]">Nenhum trabalho ativo no terreno.</p>
                <Link to="/app/dispatch" className="text-[11px] font-semibold text-[#2D5F4E] hover:underline">
                  Ir para expedição →
                </Link>
              </div>
            ) : (
              <ul>
                {inTransit.map((j) => {
                  const completedStops = j.stops.filter((s) => s.completed).length;
                  const totalStops = j.stops.length;
                  const pct = totalStops > 0 ? (completedStops / totalStops) * 100 : 0;
                  const truck = j.assignedTruckId ? getTruckById(j.assignedTruckId) : null;
                  const driver = drivers.find((d) => d.id === j.assignedDriverId);
                  const first = j.stops[0];
                  const last  = j.stops[j.stops.length - 1];
                  return (
                    <li
                      key={j.id}
                      className="border-b px-5 py-4 last:border-b-0"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold text-[#2D5F4E]">{j.id}</span>
                        <SlaChip status={j.slaStatus} />
                      </div>
                      <p className="mt-0.5 truncate text-[13px] font-semibold text-[var(--app-fg)]">{j.client}</p>
                      {first && last && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--app-muted)]">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {first.city} → {last.city}
                        </p>
                      )}

                      {/* Progress bar */}
                      <div className="mt-2">
                        <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--app-muted)]">
                          <span>Paragens {completedStops}/{totalStops}</span>
                          <StatusPill status={j.status} />
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: "#2D5F4E" }}
                          />
                        </div>
                      </div>

                      {/* Truck + driver */}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--app-muted)]">
                        {truck && (
                          <span className="inline-flex items-center gap-0.5 font-medium">
                            <Truck className="h-3 w-3" /> {truck.plate}
                          </span>
                        )}
                        {driver && (
                          <span className="inline-flex items-center gap-0.5 font-medium">
                            <Users className="h-3 w-3" /> {driver.name}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                        <Link to={`/app/jobs?job=${j.id}`} className="font-semibold text-[#2D5F4E] hover:underline">
                          Detalhe
                        </Link>
                        {j.assignedTruckId && (
                          <Link
                            to={mapUrl({ truck: j.assignedTruckId, job: j.id })}
                            className="inline-flex items-center gap-0.5 font-semibold text-[#2D5F4E] hover:underline"
                          >
                            <MapPin className="h-3 w-3" /> Mapa
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            </div>
          </section>

          <section
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm"
            style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
          >
            <div className="shrink-0 border-b px-5 py-3.5" style={{ borderColor: "var(--app-border)" }}>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#2D5F4E]" />
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">
                  Agenda de hoje
                </p>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-[var(--app-muted)]">
                Horários de primeira paragem (planeamento do dia).
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            {jobsToday.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-[var(--app-muted)]">Sem trabalhos agendados para hoje.</p>
            ) : (
              <ul>
                {jobsToday.map((j) => {
                  const first = j.stops[0];
                  const last  = j.stops[j.stops.length - 1];
                  return (
                    <li
                      key={j.id}
                      className="flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <div className="shrink-0 text-center">
                        <p className="text-[11px] font-bold tabular-nums text-[#2D5F4E]">
                          {first?.scheduledTime ?? "—"}
                        </p>
                        <p className="text-[9px] text-[var(--app-muted)]">{first?.windowEnd ?? ""}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold text-[#2D5F4E]">{j.id}</span>
                          <StatusPill status={j.status} />
                        </div>
                        <p className="truncate text-[12px] font-semibold text-[var(--app-fg)]">{j.client}</p>
                        {first && last && first.city !== last.city && (
                          <p className="text-[10px] text-[var(--app-muted)]">{first.city} → {last.city}</p>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <Link
                          to={`/app/jobs?job=${j.id}`}
                          className="text-[10px] font-semibold text-[#2D5F4E] hover:underline"
                        >
                          Detalhe
                        </Link>
                        {!j.assignedTruckId && (
                          <Link
                            to="/app/dispatch"
                            className="text-[10px] font-semibold text-[#8B6F47] hover:underline"
                          >
                            Atribuir →
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            </div>
          </section>
        </div>

        {/* ── Col 3: Equipa + frota (secções distintas) ────────────────────────── */}
        <section
          className="flex min-h-[240px] flex-col overflow-hidden rounded-2xl border shadow-sm lg:min-h-0"
          style={{ background: "var(--app-card)", borderColor: "var(--app-border)" }}
        >
          <div className="shrink-0 border-b px-5 py-3.5" style={{ borderColor: "var(--app-border)" }}>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#2D5F4E]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">
                Equipa & frota
              </p>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-[var(--app-muted)]">
              Disponibilidade, horas da semana e estado das viaturas.
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto scroll-thin p-4 sm:p-5">

            {/* ── Conformidade EU ──────────────────────────────── */}
            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
                Conformidade EU
              </p>

              {/* Cabotage tracker */}
              <div
                className="mb-3 rounded-xl border px-4 py-3"
                style={{
                  borderColor: cabotageOps >= 3 ? "#FECACA" : cabotageOps >= 2 ? "#FDE68A" : "var(--app-border)",
                  background:  cabotageOps >= 3 ? "#FEF2F2"  : cabotageOps >= 2 ? "#FFFBEB" : "var(--app-elevated)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 shrink-0" style={{ color: cabotageOps >= 3 ? "#991B1B" : cabotageOps >= 2 ? "#92400E" : "#2D5F4E" }} />
                    <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>
                      Cabotagem (7 dias)
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-3 w-3 rounded-sm"
                        style={{
                          background: i < cabotageOps
                            ? cabotageOps >= 3 ? "#DC2626" : cabotageOps >= 2 ? "#D97706" : "#2D5F4E"
                            : "var(--app-border)",
                        }}
                      />
                    ))}
                    <span className="ml-1 text-[11px] font-black tabular-nums" style={{ color: cabotageOps >= 3 ? "#991B1B" : "var(--app-fg)" }}>
                      {cabotageOps}/3
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-[10px] leading-snug" style={{ color: cabotageOps >= 3 ? "#991B1B" : "var(--app-muted)" }}>
                  {cabotageOps === 0
                    ? "Sem operações internacionais nos últimos 7 dias."
                    : cabotageOps >= 3
                    ? "⛔ Limite de 3 operações de cabotagem atingido — verificar antes de aceitar mais transportes internacionais."
                    : cabotageOps === 2
                    ? "⚠ 2 de 3 operações usadas — uma disponível antes de atingir o limite EU."
                    : `${cabotageOps} operação${cabotageOps > 1 ? "ões" : ""} registada${cabotageOps > 1 ? "s" : ""} — dentro do limite EU.`
                  }
                </p>
              </div>

              {/* Document expiry alerts */}
              {docAlerts.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 text-[#2D5F4E]" />
                  <p className="text-[11px] text-[var(--app-muted)]">Todos os documentos em dia.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {/* Critical: expired */}
                  {criticalDocs.map((a, i) => (
                    <div
                      key={`crit-${i}`}
                      className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5"
                    >
                      <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-rose-800">
                          {a.driver.name.split(" ")[0]} — {a.docLabel}
                        </p>
                        <p className="text-[10px] text-rose-700">
                          Vencido há {Math.abs(a.days)} dia{Math.abs(a.days) !== 1 ? "s" : ""} — renovação obrigatória
                        </p>
                      </div>
                      <Link to="/app/drivers" className="ml-auto shrink-0 text-[10px] font-semibold text-rose-700 hover:underline">
                        Ver →
                      </Link>
                    </div>
                  ))}
                  {/* Urgent: ≤30 days */}
                  {urgentDocs.map((a, i) => (
                    <div
                      key={`urg-${i}`}
                      className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-amber-900">
                          {a.driver.name.split(" ")[0]} — {a.docLabel}
                        </p>
                        <p className="text-[10px] text-amber-800">
                          Vence em {a.days} dia{a.days !== 1 ? "s" : ""} — renovar com urgência
                        </p>
                      </div>
                      <Link to="/app/drivers" className="ml-auto shrink-0 text-[10px] font-semibold text-amber-800 hover:underline">
                        Ver →
                      </Link>
                    </div>
                  ))}
                  {/* Warning: ≤90 days — collapsed summary */}
                  {warningDocs.length > 0 && (
                    <div className="flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2.5">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-[#8B6F47]" />
                      <p className="text-[10px] text-[var(--app-muted)]">
                        +{warningDocs.length} documento{warningDocs.length !== 1 ? "s" : ""} a vencer em {"<"}90 dias
                      </p>
                      <Link to="/app/drivers" className="ml-auto text-[10px] font-semibold text-[#2D5F4E] hover:underline">
                        Ver →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Can't drive — shown inline on each driver card below */}

            {/* Availability summary */}
            <div
              className="rounded-xl border px-4 py-3.5"
              style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--app-muted)]">
                Resumo · disponibilidade
              </p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-3xl font-black tabular-nums leading-none text-[#2D5F4E]">{driversAvail}</span>
                <span className="text-[12px] text-[var(--app-muted)]">/ {drivers.length} motoristas disponíveis</span>
              </div>
              <div className="mt-2 flex gap-1.5">
                {drivers.map((d) => (
                  <div
                    key={d.id}
                    className="h-2 flex-1 rounded-full"
                    title={`${d.name} · ${d.availability}`}
                    style={{
                      background:
                        d.availability === "available" ? "#2D5F4E" :
                        d.availability === "assigned"  ? "#8B6F47" : "#94a3b8",
                    }}
                  />
                ))}
              </div>
              <p className="mt-1 text-[9px] text-[var(--app-muted)]">
                Verde = disponível · Âmbar = em serviço · Cinza = offline
              </p>
            </div>

            {/* Driver HOS cards */}
            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
                Motoristas
              </p>
              <ul className="space-y-3">
              {drivers.map((d) => {
                const pct = (d.hoursWeek / d.hoursLimit) * 100;
                const bar = Math.min(100, pct);
                const truck = d.truckId ? getTruckById(d.truckId) : null;
                const driverJobs = jobs.filter(
                  (j) => j.assignedDriverId === d.id &&
                          ["assigned", "loading", "in_transit"].includes(j.status),
                );
                return (
                  <li
                    key={d.id}
                    className="rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-4 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{
                            background:
                              d.availability === "available" ? "#2D5F4E" :
                              d.availability === "assigned"  ? "#8B6F47" : "#94a3b8",
                          }}
                        >
                          {d.name.split(" ").map((x: string) => x[0]).slice(0, 2).join("")}
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold leading-tight text-[var(--app-fg)]">{d.name}</p>
                          <p className="text-[10px] text-[var(--app-muted)]">
                            {truck ? `${truck.plate} · ${truck.name}` : "Sem viatura"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-semibold tabular-nums text-[var(--app-muted)]">
                          {d.hoursWeek}h / {d.hoursLimit}h
                        </span>
                        {driverJobs.length > 0 && (
                          <p className="text-[9px] text-[#2D5F4E]">{driverJobs.length} trabalho{driverJobs.length > 1 ? "s" : ""}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${bar}%`,
                          background: pct >= 95 ? "#A84432" : pct >= 80 ? "#8B6F47" : "#2D5F4E",
                        }}
                      />
                    </div>
                    {d.complianceAlerts[0] && (
                      <p className="mt-1 text-[10px] leading-snug text-[#7A5C2E]">
                        ⚠ {d.complianceAlerts[0]}
                      </p>
                    )}
                  </li>
                );
              })}
              </ul>
            </div>

            {/* Fleet readiness */}
            <div className="border-t border-[var(--app-border)] pt-5">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
                Frota ao vivo
              </p>
              <div className="rounded-xl border border-[var(--app-border)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--app-muted)]">
                Matrículas e combustível
              </p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {trucksLive.map((t) => (
                  <Link
                    key={t.id}
                    to={`/app/map?truck=${t.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition hover:opacity-80"
                    style={{
                      borderColor:
                        t.status === "delayed"     ? "#8B6F47" :
                        t.status === "maintenance" ? "#A84432" : "var(--app-border)",
                      background:
                        t.status === "delayed"     ? "#F2EBE0" :
                        t.status === "maintenance" ? "#F6E3DE" : "var(--app-elevated)",
                      color: "var(--app-fg)",
                    }}
                  >
                    <Truck className="h-3 w-3" style={{
                      color:
                        t.status === "delayed"     ? "#8B6F47" :
                        t.status === "maintenance" ? "#A84432" : "#2D5F4E",
                    }} />
                    {t.plate}
                    <span className="text-[9px]" style={{ color: "var(--app-muted)" }}>
                      {t.fuelPct}%
                    </span>
                  </Link>
                ))}
              </div>
              <Link to="/app/fleet" className="mt-3 inline-block text-[11px] font-semibold text-[#2D5F4E] hover:underline">
                Manutenção e IPO →
              </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
