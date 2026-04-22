import { Award, Download, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart,
  CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { drivers, trucks } from "../data/mockData";
import { useJobs } from "../context/JobsContext";
import type { Job } from "../data/types";

/* ─── helpers ─────────────────────────────────────────── */
const FUEL_L_PER_100KM = 28;
const FUEL_EUR_PER_L   = 1.72;
const DRIVER_EUR_PER_H = 18;

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371, dLat = ((b[0] - a[0]) * Math.PI) / 180, dLng = ((b[1] - a[1]) * Math.PI) / 180;
  return R * 2 * Math.atan2(
    Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2),
    Math.sqrt(1 - (Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2)),
  );
}

function estimateJobKm(j: Job): number {
  let km = 0;
  for (let i = 0; i < j.stops.length - 1; i++) {
    const a = j.stops[i]!, b = j.stops[i + 1]!;
    km += haversineKm([a.lat, a.lng], [b.lat, b.lng]);
  }
  return Math.round(km * 1.25);
}

function jobCost(j: Job) {
  const km = estimateJobKm(j);
  const fuel   = (km / 100) * FUEL_L_PER_100KM * FUEL_EUR_PER_L;
  const driver = (km / 75) * DRIVER_EUR_PER_H;
  return { km, fuel, driver, total: fuel + driver };
}

function csvDownload(rows: Record<string, string | number>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const lines   = [headers.join(","), ...rows.map((r) => headers.map((h) => r[h]).join(","))];
  const blob    = new Blob([lines.join("\n")], { type: "text/csv" });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ─── KPI card ───────────────────────────────────────── */
function KpiCard({
  label, value, sub, trend, trendDir,
}: { label: string; value: string; sub?: string; trend?: string; trendDir?: "up" | "down" | "neutral" }) {
  const Icon = trendDir === "up" ? TrendingUp : TrendingDown;
  const color = trendDir === "up" ? "#2D5F4E" : trendDir === "down" ? "#A84432" : "#8B6F47";
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl border p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>{label}</p>
      <p className="text-[28px] font-black tabular-nums leading-none" style={{ color: "var(--app-fg)" }}>{value}</p>
      {sub && <p className="text-[11px]" style={{ color: "var(--app-muted)" }}>{sub}</p>}
      {trend && trendDir && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold" style={{ color }}>
          <Icon className="h-3.5 w-3.5" />{trend}
        </p>
      )}
    </div>
  );
}

/* ─── Section header ─────────────────────────────────── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--app-muted)" }}>
      {children}
    </h2>
  );
}

/* ─── Main ───────────────────────────────────────────── */
export function ReportsPage() {
  const { jobs } = useJobs();

  /* ── Aggregate metrics ──────────────────────────────── */
  const done   = useMemo(() => jobs.filter((j) => j.status === "delivered" || j.status === "invoiced"), [jobs]);
  const active = useMemo(() => jobs.filter((j) => j.status === "in_transit" || j.status === "loading"), [jobs]);

  const totalRevenue  = useMemo(() => done.reduce((s, j) => s + j.rateEur, 0), [done]);
  const totalCostEur  = useMemo(() => done.reduce((s, j) => s + jobCost(j).total, 0), [done]);
  const totalKm       = useMemo(() => done.reduce((s, j) => s + estimateJobKm(j), 0), [done]);
  const onTimePct     = useMemo(() => {
    if (!done.length) return 0;
    return Math.round((done.filter((j) => j.slaStatus === "on_track").length / done.length) * 100);
  }, [done]);
  const avgMarginPct  = useMemo(() => {
    if (!totalRevenue) return 0;
    return Math.round(((totalRevenue - totalCostEur) / totalRevenue) * 100);
  }, [totalRevenue, totalCostEur]);
  const costPerKm     = useMemo(() => totalKm ? totalCostEur / totalKm : 0, [totalCostEur, totalKm]);

  /* ── Revenue by week (last 4 weeks, simulated from job dates) ── */
  const revenueByWeek = useMemo(() => {
    const weeks: Record<string, { revenue: number; cost: number; jobs: number }> = {};
    for (const j of done) {
      const d   = new Date(j.createdAt);
      const mon = new Date(d); mon.setDate(d.getDate() - d.getDay() + 1);
      const key = mon.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
      if (!weeks[key]) weeks[key] = { revenue: 0, cost: 0, jobs: 0 };
      weeks[key]!.revenue += j.rateEur;
      weeks[key]!.cost    += jobCost(j).total;
      weeks[key]!.jobs++;
    }
    return Object.entries(weeks).map(([week, v]) => ({ week, ...v, margin: v.revenue - v.cost }));
  }, [done]);

  /* ── Per-truck performance ──────────────────────────── */
  const truckPerf = useMemo(() => {
    return trucks.map((t) => {
      const truckJobs = done.filter((j) => j.assignedTruckId === t.id);
      const rev  = truckJobs.reduce((s, j) => s + j.rateEur, 0);
      const cost = truckJobs.reduce((s, j) => s + jobCost(j).total, 0);
      const km   = truckJobs.reduce((s, j) => s + estimateJobKm(j), 0);
      return { id: t.id, plate: t.plate, name: t.name, jobs: truckJobs.length, rev, cost, margin: rev - cost, km, costPerKm: km ? cost / km : 0 };
    }).filter((t) => t.jobs > 0).sort((a, b) => b.margin - a.margin);
  }, [done]);

  /* ── Driver scoreboard ──────────────────────────────── */
  const driverPerf = useMemo(() => {
    return drivers.map((d) => {
      const dJobs     = done.filter((j) => j.assignedDriverId === d.id);
      const onTime    = dJobs.filter((j) => j.slaStatus === "on_track").length;
      const onTimePct = dJobs.length ? Math.round((onTime / dJobs.length) * 100) : 0;
      const rev       = dJobs.reduce((s, j) => s + j.rateEur, 0);
      const hosUsed   = Math.round((d.hoursWeek / d.hoursLimit) * 100);
      return { id: d.id, name: d.name, jobs: dJobs.length, onTimePct, rev, safety: d.safetyScore, hosUsed };
    }).filter((d) => d.jobs > 0).sort((a, b) => b.onTimePct - a.onTimePct);
  }, [done]);

  /* ── Week-over-week ────────────────────────────────── */
  const weekOverWeek = useMemo(() => {
    const now = new Date();
    const w0 = new Date(now); w0.setDate(now.getDate() - 7);
    const w1 = new Date(now); w1.setDate(now.getDate() - 14);
    const thisWeek = done.filter((j) => new Date(j.createdAt) >= w0);
    const lastWeek = done.filter((j) => new Date(j.createdAt) >= w1 && new Date(j.createdAt) < w0);
    const thisRev  = thisWeek.reduce((s, j) => s + j.rateEur, 0);
    const lastRev  = lastWeek.reduce((s, j) => s + j.rateEur, 0);
    const revChange = lastRev ? Math.round(((thisRev - lastRev) / lastRev) * 100) : 0;
    return { thisJobs: thisWeek.length, lastJobs: lastWeek.length, thisRev, lastRev, revChange };
  }, [done]);

  /* ── Best / worst insights ──────────────────────────── */
  const topDriver  = driverPerf[0] ?? null;
  const topTruck   = truckPerf[0] ?? null;
  const atRiskNow  = jobs.filter((j) => j.slaStatus !== "on_track" && !["delivered", "invoiced", "cancelled"].includes(j.status)).length;

  /* ── SLA breakdown ─────────────────────────────────── */
  const slaData = useMemo(() => [
    { label: "No prazo",  value: done.filter((j) => j.slaStatus === "on_track").length,  fill: "#2D5F4E" },
    { label: "Em risco",  value: jobs.filter((j) => j.slaStatus === "at_risk" && !["delivered","invoiced"].includes(j.status)).length, fill: "#8B6F47" },
    { label: "Violado",   value: jobs.filter((j) => j.slaStatus === "breached" && !["delivered","invoiced"].includes(j.status)).length, fill: "#A84432" },
  ], [jobs, done]);

  /* ── CSV export ─────────────────────────────────────── */
  function exportJobs() {
    csvDownload(
      done.map((j) => {
        const c = jobCost(j);
        const t = trucks.find((t) => t.id === j.assignedTruckId);
        const d = drivers.find((d) => d.id === j.assignedDriverId);
        return {
          id: j.id, cliente: j.client, referencia: j.reference,
          estado: j.status, sla: j.slaStatus, prioridade: j.priority,
          tipo_carga: j.cargoType, paletes: j.totalPallets, peso_kg: j.totalWeightKg,
          taxa_eur: j.rateEur, custo_combustivel: c.fuel.toFixed(2),
          custo_motorista: c.driver.toFixed(2), km_estimado: c.km,
          margem_eur: (j.rateEur - c.total).toFixed(2),
          viatura: t?.plate ?? "", motorista: d?.name ?? "",
          levantamento: j.pickupDeadline, entrega: j.deliveryDeadline,
        };
      }),
      "fleet-report.csv",
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto scroll-thin"
      style={{ background: "var(--workspace-bg)" }}
    >
      <div className="mx-auto max-w-[1400px] space-y-8 p-4 md:p-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-muted)" }}>
              Prova de ROI · exportável
            </p>
            <h1 className="text-[22px] font-black leading-tight" style={{ color: "var(--app-fg)" }}>Relatórios</h1>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-muted)" }}>
              Custo/km, pontualidade, margem e desempenho por viatura e motorista — para banco, seguros e clientes.
            </p>
          </div>
          <button
            type="button"
            onClick={exportJobs}
            disabled={!done.length}
            className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[12px] font-semibold transition hover:opacity-80 disabled:opacity-40"
            style={{ borderColor: "#2D5F4E", color: "#2D5F4E", background: "#E8F0EC" }}
          >
            <Download className="h-4 w-4" />
            Exportar CSV ({done.length} trabalhos)
          </button>
        </div>

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            label="Receita realizada"
            value={totalRevenue.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
            sub={`${done.length} trabalhos concluídos`}
            trend={`${active.length} em curso`}
            trendDir="neutral"
          />
          <KpiCard
            label="Margem estimada"
            value={`${avgMarginPct}%`}
            sub={`${(totalRevenue - totalCostEur).toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} líquido`}
            trend={avgMarginPct >= 60 ? "Acima do benchmark" : "Verificar custos"}
            trendDir={avgMarginPct >= 60 ? "up" : "down"}
          />
          <KpiCard
            label="Entregas no prazo"
            value={`${onTimePct}%`}
            sub={`${done.filter(j => j.slaStatus === "on_track").length} de ${done.length} no prazo`}
            trend={onTimePct >= 85 ? "Boa performance" : "Atenção necessária"}
            trendDir={onTimePct >= 85 ? "up" : "down"}
          />
          <KpiCard
            label="Custo / km"
            value={`€${costPerKm.toFixed(2)}`}
            sub="Combustível + motorista"
            trend={costPerKm < 0.50 ? "Eficiente" : "Acima da média"}
            trendDir={costPerKm < 0.50 ? "up" : "down"}
          />
          <KpiCard
            label="Km estimados"
            value={totalKm.toLocaleString("pt-PT")}
            sub="Total frota concluída"
          />
          <KpiCard
            label="Trabalhos em curso"
            value={String(active.length)}
            sub={`${jobs.filter(j => j.status === "backlog").length} por expedir`}
            trend={jobs.filter(j => j.slaStatus === "breached" && j.status !== "delivered" && j.status !== "invoiced").length > 0 ? "Prazo ultrapassado" : "Prazos OK"}
            trendDir={jobs.filter(j => j.slaStatus === "breached" && j.status !== "delivered" && j.status !== "invoiced").length > 0 ? "down" : "up"}
          />
        </div>

        {/* ── Insights da semana ── */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Week-over-week revenue */}
          <div
            className="flex items-start gap-3 rounded-2xl border p-4"
            style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: weekOverWeek.revChange >= 0 ? "#E8F0EC" : "#F6E3DE" }}>
              {weekOverWeek.revChange >= 0
                ? <TrendingUp className="h-4 w-4 text-[#2D5F4E]" />
                : <TrendingDown className="h-4 w-4 text-[#A84432]" />
              }
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--app-muted)]">Semana atual vs anterior</p>
              <p className="mt-0.5 text-[22px] font-black tabular-nums leading-none" style={{ color: weekOverWeek.revChange >= 0 ? "#2D5F4E" : "#A84432" }}>
                {weekOverWeek.revChange >= 0 ? "+" : ""}{weekOverWeek.revChange}%
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--app-muted)]">
                {weekOverWeek.thisJobs} trabalhos · {weekOverWeek.thisRev.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          {/* Top driver */}
          <div
            className="flex items-start gap-3 rounded-2xl border p-4"
            style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "#E8F0EC" }}>
              <Award className="h-4 w-4 text-[#2D5F4E]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--app-muted)]">Melhor motorista</p>
              {topDriver ? (
                <>
                  <p className="mt-0.5 truncate text-[15px] font-black text-[var(--app-fg)]">{topDriver.name.split(" ")[0]}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--app-muted)]">{topDriver.onTimePct}% pontual · {topDriver.jobs} entrega{topDriver.jobs !== 1 ? "s" : ""}</p>
                </>
              ) : (
                <p className="mt-0.5 text-[12px] text-[var(--app-muted)]">Sem dados ainda</p>
              )}
            </div>
          </div>

          {/* At-risk alert or best truck */}
          <div
            className="flex items-start gap-3 rounded-2xl border p-4"
            style={{ borderColor: atRiskNow > 0 ? "#A84432" : "var(--app-border)", background: atRiskNow > 0 ? "#FFF5F5" : "var(--app-card)" }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: atRiskNow > 0 ? "#F6E3DE" : "#E8F0EC" }}>
              <Zap className="h-4 w-4" style={{ color: atRiskNow > 0 ? "#A84432" : "#2D5F4E" }} />
            </div>
            <div className="min-w-0">
              {atRiskNow > 0 ? (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#A84432" }}>Prazos em risco agora</p>
                  <p className="mt-0.5 text-[22px] font-black tabular-nums leading-none text-[#A84432]">{atRiskNow}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--app-muted)]">Trabalho{atRiskNow !== 1 ? "s" : ""} a precisar de atenção</p>
                </>
              ) : topTruck ? (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--app-muted)]">Viatura mais rentável</p>
                  <p className="mt-0.5 text-[15px] font-black text-[var(--app-fg)]">{topTruck.plate}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--app-muted)]">
                    {topTruck.margin.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} margem
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--app-muted)]">Estado geral</p>
                  <p className="mt-0.5 text-[15px] font-black text-[#2D5F4E]">Tudo OK</p>
                  <p className="mt-0.5 text-[11px] text-[var(--app-muted)]">Sem prazos em risco</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Revenue + margin chart ── */}
        {revenueByWeek.length > 0 && (
          <section
            className="rounded-2xl border p-5"
            style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
          >
            <SectionTitle>Receita e margem por semana</SectionTitle>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-muted)" }}>
              Receita faturada vs. custos estimados de combustível + motorista
            </p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueByWeek} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--app-border)", fontSize: 11 }}
                    formatter={(v, name) => [
                      Number(v).toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
                      name === "revenue" ? "Receita" : name === "cost" ? "Custo" : "Margem",
                    ]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#2D5F4E" fill="#2D5F4E" fillOpacity={0.15} strokeWidth={2} name="revenue" />
                  <Area type="monotone" dataKey="cost"    stroke="#8B6F47" fill="#8B6F47" fillOpacity={0.12} strokeWidth={2} name="cost" />
                  <Area type="monotone" dataKey="margin"  stroke="#8B6F47" fill="#8B6F47" fillOpacity={0.10} strokeWidth={1.5} strokeDasharray="4 2" name="margin" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">

          {/* ── SLA breakdown ── */}
          <section
            className="rounded-2xl border p-5"
            style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
          >
            <SectionTitle>Cumprimento de prazos — todos os trabalhos</SectionTitle>
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={slaData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--app-border)", fontSize: 11 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} name="Trabalhos">
                    {slaData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ── Driver scoreboard ── */}
          <section
            className="rounded-2xl border p-5"
            style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
          >
            <SectionTitle>Pontuação motoristas</SectionTitle>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-muted)" }}>Pontualidade · entregas no prazo · horas de condução</p>
            {driverPerf.length === 0 ? (
              <p className="mt-6 text-center text-sm" style={{ color: "var(--app-muted)" }}>
                Sem dados — avança trabalhos para "Entregue" para ver estatísticas.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {driverPerf.map((d, i) => (
                  <li key={d.id} className="flex items-center gap-3 text-[12px]">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
                      style={{ background: i === 0 ? "#2D5F4E" : i === 1 ? "#8B6F47" : "var(--app-muted)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="w-28 truncate font-semibold" style={{ color: "var(--app-fg)" }}>{d.name.split(" ")[0]}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--app-muted)" }}>
                        <span>Pontual</span><span>{d.onTimePct}%</span>
                      </div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/10">
                        <div className="h-full rounded-full" style={{ width: `${d.onTimePct}%`, background: d.onTimePct >= 85 ? "#2D5F4E" : d.onTimePct >= 70 ? "#8B6F47" : "#A84432" }} />
                      </div>
                    </div>
                    <span className="w-10 text-right font-mono text-[10px]" style={{ color: "var(--app-muted)" }}>
                      {d.safety}/100
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                      style={d.hosUsed >= 90 ? { background: "#F6E3DE", color: "#A84432" } : d.hosUsed >= 75 ? { background: "#F2EBE0", color: "#8B6F47" } : { background: "#E8F0EC", color: "#2D5F4E" }}
                    >
                      {d.hosUsed}% horas
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Per-truck P&L ── */}
        <section
          className="rounded-2xl border p-5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <SectionTitle>P&amp;L por viatura</SectionTitle>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-muted)" }}>
                Receita − combustível − custo motorista estimado por matrícula
              </p>
            </div>
            <button
              type="button"
              onClick={() => csvDownload(truckPerf.map(t => ({
                matricula: t.plate, modelo: t.name, trabalhos: t.jobs,
                receita_eur: t.rev.toFixed(0), custo_eur: t.cost.toFixed(0),
                margem_eur: t.margin.toFixed(0), km: t.km, custo_por_km: t.costPerKm.toFixed(2),
              })), "frota-pl.csv")}
              className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--app-border)", color: "var(--app-muted)" }}
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>

          {truckPerf.length === 0 ? (
            <p className="mt-6 text-center text-sm" style={{ color: "var(--app-muted)" }}>
              Avança trabalhos para "Entregue" no quadro de trabalhos para ver performance por viatura.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--app-border)" }}>
                    {["Matrícula", "Modelo", "Trabalhos", "Receita", "Custo est.", "Margem", "Km", "€/km"].map((h) => (
                      <th key={h} className="pb-2 pr-4 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {truckPerf.map((t) => (
                    <tr key={t.id} className="border-b" style={{ borderColor: "var(--app-border)" }}>
                      <td className="py-2 pr-4 font-mono font-bold" style={{ color: "#2D5F4E" }}>{t.plate}</td>
                      <td className="pr-4 text-[11px]" style={{ color: "var(--app-muted)" }}>{t.name}</td>
                      <td className="pr-4 tabular-nums">{t.jobs}</td>
                      <td className="pr-4 tabular-nums font-semibold" style={{ color: "var(--app-fg)" }}>
                        {t.rev.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                      </td>
                      <td className="pr-4 tabular-nums" style={{ color: "#A84432" }}>
                        {t.cost.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                      </td>
                      <td className="pr-4">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                          style={t.margin > 0 ? { background: "#E8F0EC", color: "#2D5F4E" } : { background: "#F6E3DE", color: "#A84432" }}
                        >
                          {t.margin.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                        </span>
                      </td>
                      <td className="pr-4 tabular-nums" style={{ color: "var(--app-muted)" }}>{t.km.toLocaleString("pt-PT")}</td>
                      <td className="tabular-nums" style={{ color: t.costPerKm < 0.50 ? "#2D5F4E" : "#8B6F47" }}>
                        €{t.costPerKm.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
