import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Euro,
  FileText,
  Globe,
  MapPin,
  Package,
  Printer,
  RefreshCw,
  Snowflake,
  Truck,
  User,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { drivers, getTruckById } from "../../data/mockData";
import type { CargoType, Job } from "../../data/types";
import { getCtaLabel, getNextStatus, STATUS_LABELS, useJobs } from "../../context/JobsContext";
import { dispatchUrl, mapUrl, driversUrl } from "../../lib/appLinks";
import { buildPortugueseCMRHtml } from "../../lib/cmrPortugal";
import { buildPtInvoiceHtml } from "../../lib/invoicePt";
import { useSettings } from "../../context/SettingsContext";

/* ─── helpers ─────────────────────────────────────────── */
const CARGO_COLOR: Record<CargoType, string> = {
  dry:          "#8B6F47",
  refrigerated: "#2D5F4E",
  hazmat:       "#A84432",
  bulk:         "#7A6B8A",
  automotive:   "#6B7A52",
};
const CARGO_LABEL: Record<CargoType, string> = {
  dry:          "Seco",
  refrigerated: "Reefer / Frio",
  hazmat:       "ADR / Perigoso",
  bulk:         "Granel",
  automotive:   "Automóvel",
};

const FUEL_L_PER_100KM = 28;   // average artic
const FUEL_EUR_PER_L   = 1.72; // diesel PT April 2026
const DRIVER_EUR_PER_H = 18;   // avg PT driver cost

function estimateCost(job: Job) {
  const stops = job.stops;
  // rough Haversine sum between consecutive stops
  let km = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    km += R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  km = Math.round(km * 1.25); // road factor
  const fuelEur   = (km / 100) * FUEL_L_PER_100KM * FUEL_EUR_PER_L;
  const driverHrs = km / 75; // avg speed
  const driverEur = driverHrs * DRIVER_EUR_PER_H;
  const margin    = job.rateEur - fuelEur - driverEur;
  return { km, fuelEur, driverEur, margin };
}

/* ─── Backload finder ─────────────────────────────────── */
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

type BackloadMatch = {
  job: Job;
  distanceKm: number;
  pickupCity: string;
};

function findBackloads(currentJob: Job, allJobs: Job[], radiusKm = 80): BackloadMatch[] {
  // Last delivery stop = where the truck ends up
  const deliveryStops = [...currentJob.stops]
    .filter((s) => s.type === "delivery")
    .sort((a, b) => b.sequence - a.sequence);
  const dropoff = deliveryStops[0];
  if (!dropoff) return [];

  return allJobs
    .filter((j) => j.id !== currentJob.id && j.status === "backlog")
    .flatMap((j) => {
      // First pickup stop = where this job needs a truck
      const pickup = [...j.stops]
        .filter((s) => s.type === "pickup")
        .sort((a, b) => a.sequence - b.sequence)[0];
      if (!pickup) return [];
      const dist = haversineKm(dropoff.lat, dropoff.lng, pickup.lat, pickup.lng);
      if (dist > radiusKm) return [];
      return [{ job: j, distanceKm: Math.round(dist), pickupCity: pickup.city }];
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/* ─── CMR print — note: settings injected via closure in component ── */

/* ─── Main component ─────────────────────────────────── */
export type JobDetailSheetProps = {
  jobId: string | null;
  onClose: () => void;
};

export function JobDetailSheet({ jobId, onClose }: JobDetailSheetProps) {
  const { jobs, getJob, advanceJob, completeStop, uncompleteStop } = useJobs();
  const { settings, nextInvoiceNumber } = useSettings();
  const job = jobId ? getJob(jobId) : null;
  const [tab, setTab] = useState<"overview" | "cost" | "retorno">("overview");

  const truck  = job?.assignedTruckId  ? getTruckById(job.assignedTruckId)               : null;
  const driver = job?.assignedDriverId ? drivers.find((d) => d.id === job.assignedDriverId) : null;

  function printCMR() {
    if (!job) return;
    const html = buildPortugueseCMRHtml(job, {
      truckPlate: truck?.plate,
      truckName: truck?.name,
      driverName: driver?.name,
      driverLicense: driver?.license,
      settings,
    });
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  function printInvoice() {
    if (!job) return;
    const invoiceNumber = nextInvoiceNumber();
    const html = buildPtInvoiceHtml(job, { settings, invoiceNumber });
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  const nextStatus = job ? getNextStatus(job.status) : null;
  const ctaLabel   = job ? getCtaLabel(job.status)   : "";

  const cost = job ? estimateCost(job) : null;

  // Backload finder — only relevant when truck is en route or delivered
  const showBackload = job
    ? ["in_transit", "loading", "delivered"].includes(job.status)
    : false;

  const backloads = useMemo(
    () => (job && showBackload ? findBackloads(job, jobs) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [job?.id, jobs, showBackload],
  );

  const allDelivered = job
    ? job.stops.filter((s) => s.type === "delivery").every((s) => s.completed)
    : false;

  const canAdvance =
    job &&
    nextStatus !== null &&
    job.status !== "invoiced" &&
    job.status !== "cancelled" &&
    (job.status !== "backlog" || (!!job.assignedTruckId && !!job.assignedDriverId)) &&
    (job.status !== "in_transit" || allDelivered);

  if (!job) {
    return (
      <div
        className={clsx(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l shadow-xl transition-transform duration-300",
          jobId ? "translate-x-0" : "translate-x-full",
        )}
        style={{ background: "var(--app-card)", borderColor: "var(--app-border)" }}
      />
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[95] bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-lg flex-col overflow-hidden border-l shadow-xl"
        style={{ background: "var(--app-card)", borderColor: "var(--app-border)" }}
        role="dialog"
        aria-modal="true"
        aria-label={`Trabalho ${job.id}`}
      >
        {/* Header */}
        <div
          className="shrink-0 border-b px-5 py-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-black" style={{ color: "#2D5F4E" }}>
                  {job.id}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={
                    job.status === "invoiced"  ? { background: "#E8F0EC", color: "#2D5F4E" } :
                    job.status === "cancelled" ? { background: "#F6E3DE", color: "#A84432" } :
                    job.status === "queued"    ? { background: "#F2EBE0", color: "#8B6F47" } :
                    job.slaStatus === "breached" ? { background: "#F6E3DE", color: "#A84432" } :
                    job.slaStatus === "at_risk"  ? { background: "#F2EBE0", color: "#8B6F47" } :
                    { background: "var(--app-elevated)", color: "var(--app-muted)" }
                  }
                >
                  {STATUS_LABELS[job.status]}
                </span>
                {job.priority !== "normal" && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={
                      job.priority === "critical"
                        ? { background: "#F6E3DE", color: "#A84432" }
                        : { background: "#F2EBE0", color: "#8B6F47" }
                    }
                  >
                    {job.priority === "critical" ? "Crítico" : "Urgente"}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[15px] font-bold leading-snug" style={{ color: "var(--app-fg)" }}>
                {job.client}
              </p>
              <p className="text-[11px]" style={{ color: "var(--app-muted)" }}>{job.reference}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 transition hover:bg-black/5"
            >
              <X className="h-4 w-4" style={{ color: "var(--app-muted)" }} />
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex gap-1">
            {(["overview", "cost", ...(showBackload ? ["retorno"] : [])] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t as typeof tab)}
                className="relative rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
                style={
                  tab === t
                    ? { background: "#2D5F4E", color: "#fff" }
                    : { background: "var(--app-elevated)", color: "var(--app-muted)", border: "1px solid var(--app-border)" }
                }
              >
                {t === "overview" ? "Detalhes" : t === "cost" ? "Custo" : "Retorno"}
                {t === "retorno" && backloads.length > 0 && (
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white"
                    style={{ background: "#2D5F4E" }}
                  >
                    {backloads.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5 scroll-thin">

          {/* ── OVERVIEW tab ── */}
          {tab === "overview" && (
            <>
              {/* Cargo summary */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>
                  Carga
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: `${CARGO_COLOR[job.cargoType]}18`, color: CARGO_COLOR[job.cargoType] }}
                  >
                    <Package className="h-3.5 w-3.5" />
                    {CARGO_LABEL[job.cargoType]}
                  </span>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--app-fg)" }}>
                    {job.totalPallets} paletes · {(job.totalWeightKg / 1000).toFixed(1)} t
                  </span>
                  {/* ADR badge */}
                  {job.adrClass && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-[#A84432]/30 bg-[#F6E3DE] px-2 py-1 text-[11px] font-semibold text-[#A84432]">
                      <AlertTriangle className="h-3 w-3" />
                      {job.adrClass}
                      {job.adrUnNumber ? ` · ${job.adrUnNumber}` : ""}
                    </span>
                  )}
                  {/* Temperature badge */}
                  {job.tempTargetC && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-[#2D5F4E]/30 bg-[#E8F0EC] px-2 py-1 text-[11px] font-semibold text-[#2D5F4E]">
                      <Snowflake className="h-3 w-3" />
                      {job.tempTargetC.min}°C / {job.tempTargetC.max}°C
                    </span>
                  )}
                  {/* International / cabotage badge */}
                  {job.isInternational && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-[#7A6B8A]/30 bg-[#F0EDF5] px-2 py-1 text-[11px] font-semibold text-[#7A6B8A]">
                      <Globe className="h-3 w-3" />
                      Internacional · {job.destinationCountryCode ?? "EU"}
                    </span>
                  )}
                </div>
              </section>

              {/* Assigned truck + driver */}
              {(truck || driver) && (
                <section className="flex flex-wrap gap-3">
                  {truck && (
                    <Link
                      to={mapUrl({ truck: truck.id })}
                      onClick={onClose}
                      className="flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold hover:underline"
                      style={{ borderColor: "var(--app-border)", color: "#2D5F4E" }}
                    >
                      <Truck className="h-4 w-4" />
                      {truck.plate} · {truck.name}
                    </Link>
                  )}
                  {driver && (
                    <Link
                      to={driversUrl(driver.id)}
                      onClick={onClose}
                      className="flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold hover:underline"
                      style={{ borderColor: "var(--app-border)", color: "#2D5F4E" }}
                    >
                      <User className="h-4 w-4" />
                      {driver.name}
                    </Link>
                  )}
                </section>
              )}

              {/* Deadlines */}
              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border p-3" style={{ borderColor: "var(--app-border)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>
                    Levantamento
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--app-fg)" }}>
                    <Clock className="h-3.5 w-3.5 text-[#2D5F4E]" />
                    {job.pickupDeadline.slice(0, 16).replace("T", " ")}
                  </p>
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: "var(--app-border)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>
                    Entrega
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--app-fg)" }}>
                    <Clock className="h-3.5 w-3.5 text-[#8B6F47]" />
                    {job.deliveryDeadline.slice(0, 16).replace("T", " ")}
                  </p>
                </div>
              </section>

              {/* Stops */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>
                  Paragens · {job.stops.length}
                </p>
                <ol className="mt-2 space-y-2">
                  {job.stops.map((stop, i) => {
                    const isDelivery = stop.type === "delivery";
                    return (
                      <li
                        key={stop.id}
                        className="flex items-start gap-3 rounded-xl border p-3"
                        style={{
                          borderColor: stop.completed ? "#2D5F4E40" : "var(--app-border)",
                          background:  stop.completed ? "#E8F0EC60" : "var(--app-elevated)",
                        }}
                      >
                        {/* Step number */}
                        <div
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
                          style={{ background: stop.completed ? "#2D5F4E" : isDelivery ? "#8B6F47" : "#8B6F47" }}
                        >
                          {i + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold" style={{ color: "var(--app-fg)" }}>
                            {stop.clientName}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px]" style={{ color: "var(--app-muted)" }}>
                            <MapPin className="h-3 w-3 shrink-0" />
                            {stop.address}, {stop.city}
                          </p>
                          <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-muted)" }}>
                            {stop.type === "pickup" ? "Levantamento" : "Entrega"} · {stop.scheduledTime}–{stop.windowEnd}
                            {stop.actualTime ? ` · Real: ${stop.actualTime}` : ""}
                          </p>
                          <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-muted)" }}>
                            {stop.cargoDescription} · {stop.pallets} plt · {(stop.weightKg / 1000).toFixed(1)} t
                          </p>
                        </div>
                        {/* Completion toggle */}
                        {(job.status === "in_transit" || job.status === "loading") && (
                          <button
                            type="button"
                            title={stop.completed ? "Desmarcar" : "Marcar como concluído"}
                            onClick={() =>
                              stop.completed
                                ? uncompleteStop(job.id, stop.id)
                                : completeStop(job.id, stop.id)
                            }
                            className="shrink-0 rounded-lg p-1 transition hover:opacity-70"
                          >
                            {stop.completed ? (
                              <CheckCircle2 className="h-5 w-5 text-[#2D5F4E]" />
                            ) : (
                              <Circle className="h-5 w-5" style={{ color: "var(--app-muted)" }} />
                            )}
                          </button>
                        )}
                        {stop.completed && !(job.status === "in_transit" || job.status === "loading") && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2D5F4E]" />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>

              {/* Notes */}
              {job.notes && (
                <section
                  className="rounded-xl border p-3 text-[11px] leading-relaxed"
                  style={{ borderColor: "#C4A882", background: "#F2EBE0", color: "#8B6F47" }}
                >
                  <p className="font-bold uppercase tracking-wide">Notas</p>
                  <p className="mt-1">{job.notes}</p>
                </section>
              )}
            </>
          )}

          {/* ── COST tab ── */}
          {tab === "cost" && cost && (
            <section className="space-y-3">
              <p className="text-[11px]" style={{ color: "var(--app-muted)" }}>
                Estimativa baseada em ~{FUEL_L_PER_100KM} L/100 km, combustível €{FUEL_EUR_PER_L}/L, motorista €{DRIVER_EUR_PER_H}/h.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Distância estimada", value: `${cost.km} km` },
                  { label: "Taxa acordada", value: `€ ${job.rateEur.toLocaleString("pt-PT")}` },
                  { label: "Combustível", value: `€ ${cost.fuelEur.toFixed(0)}` },
                  { label: "Motorista (custo)", value: `€ ${cost.driverEur.toFixed(0)}` },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="rounded-xl border p-3"
                    style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>
                      {row.label}
                    </p>
                    <p className="mt-1 text-[18px] font-black tabular-nums" style={{ color: "var(--app-fg)" }}>
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>

              <div
                className="flex items-center justify-between rounded-xl border p-4"
                style={{
                  borderColor: cost.margin > 0 ? "#2D5F4E40" : "#A8443240",
                  background:  cost.margin > 0 ? "#E8F0EC"   : "#F6E3DE",
                }}
              >
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#2D5F4E]">Margem estimada</p>
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--app-muted)" }}>
                    Taxa − combustível − motorista
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Euro className="h-5 w-5 text-[#2D5F4E]" />
                  <span
                    className="text-[24px] font-black tabular-nums"
                    style={{ color: cost.margin > 0 ? "#2D5F4E" : "#A84432" }}
                  >
                    {cost.margin.toFixed(0)}
                  </span>
                </div>
              </div>

              <p className="text-[10px]" style={{ color: "var(--app-muted)" }}>
                Estimativa para planeamento — adicione custos fixos, portagens e margens reais na sua contabilidade.
              </p>
            </section>
          )}

          {/* ── RETORNO tab ── */}
          {tab === "retorno" && (
            <section className="space-y-4">
              {/* Header context */}
              {(() => {
                const dropoff = [...job.stops]
                  .filter((s) => s.type === "delivery")
                  .sort((a, b) => b.sequence - a.sequence)[0];
                return dropoff ? (
                  <div
                    className="flex items-start gap-3 rounded-xl border p-3"
                    style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
                  >
                    <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-[#2D5F4E]" />
                    <div>
                      <p className="text-[12px] font-semibold" style={{ color: "var(--app-fg)" }}>
                        Destino final: {dropoff.city}
                      </p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-muted)" }}>
                        A mostrar trabalhos em carteira com levantamento a menos de 80 km deste ponto.
                        Evite quilómetros em vazio — atribua um retorno antes de o camião sair.
                      </p>
                    </div>
                  </div>
                ) : null;
              })()}

              {backloads.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <RefreshCw className="h-8 w-8 opacity-20" style={{ color: "var(--app-muted)" }} />
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--app-fg)" }}>
                      Sem retornos disponíveis
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--app-muted)" }}>
                      Nenhum trabalho em carteira com levantamento próximo do destino de entrega.
                    </p>
                  </div>
                </div>
              ) : (
                <ol className="space-y-2">
                  {backloads.map(({ job: bJob, distanceKm, pickupCity }) => {
                    const bCost  = estimateCost(bJob);
                    const lastStop = bJob.stops[bJob.stops.length - 1];
                    return (
                      <li
                        key={bJob.id}
                        className="rounded-xl border p-3 transition hover:shadow-sm"
                        style={{ borderColor: "var(--app-border)", background: "var(--app-card)" }}
                      >
                        {/* Top row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-bold" style={{ color: "#2D5F4E" }}>
                                {bJob.id}
                              </span>
                              <span
                                className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                                style={{
                                  background: distanceKm <= 20 ? "#E8F0EC" : distanceKm <= 50 ? "#F2EBE0" : "var(--app-elevated)",
                                  color: distanceKm <= 20 ? "#2D5F4E" : distanceKm <= 50 ? "#8B6F47" : "var(--app-muted)",
                                }}
                              >
                                {distanceKm} km
                              </span>
                              {bJob.priority === "critical" && (
                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-bold text-rose-700">
                                  Crítico
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[13px] font-semibold" style={{ color: "var(--app-fg)" }}>
                              {bJob.client}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[12px] font-bold" style={{ color: "#2D5F4E" }}>
                              € {bJob.rateEur.toLocaleString("pt-PT")}
                            </p>
                            <p className="text-[10px]" style={{ color: "var(--app-muted)" }}>
                              margem ~€{bCost.margin.toFixed(0)}
                            </p>
                          </div>
                        </div>

                        {/* Route */}
                        <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--app-muted)" }}>
                          <MapPin className="h-3 w-3 shrink-0 text-[#2D5F4E]" />
                          <span className="font-semibold" style={{ color: "var(--app-fg)" }}>{pickupCity}</span>
                          <ArrowRight className="h-3 w-3 shrink-0" />
                          <span>{lastStop?.city ?? "—"}</span>
                        </div>

                        {/* Cargo */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--app-muted)" }}>
                          <span>{bJob.totalPallets} plt</span>
                          <span>·</span>
                          <span>{(bJob.totalWeightKg / 1_000).toFixed(1)} t</span>
                          <span>·</span>
                          <span>{bJob.totalPallets > 0 ? CARGO_LABEL[bJob.cargoType] : "—"}</span>
                          <span>·</span>
                          <span>{bCost.km} km</span>
                        </div>

                        {/* CTA */}
                        <div className="mt-3 flex gap-2">
                          <Link
                            to={dispatchUrl()}
                            onClick={onClose}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold text-white transition hover:opacity-90"
                            style={{ background: "#2D5F4E" }}
                          >
                            <Truck className="h-3.5 w-3.5" />
                            Atribuir no dispatch
                          </Link>
                          <span
                            className="flex items-center rounded-xl border px-2.5 py-2 text-[11px]"
                            style={{
                              borderColor: bJob.slaStatus === "breached" ? "#A84432" : bJob.slaStatus === "at_risk" ? "#8B6F47" : "var(--app-border)",
                              color: bJob.slaStatus === "breached" ? "#A84432" : bJob.slaStatus === "at_risk" ? "#8B6F47" : "var(--app-muted)",
                            }}
                          >
                            <Clock className="mr-1 h-3 w-3" />
                            {bJob.deliveryDeadline.slice(5, 16).replace("T", " ")}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              <p className="text-[10px]" style={{ color: "var(--app-muted)" }}>
                Raio de pesquisa: 80 km · Apenas trabalhos em carteira (sem viatura atribuída).
              </p>
            </section>
          )}
        </div>

        {/* Footer CTAs */}
        <div
          className="shrink-0 border-t px-5 py-4 space-y-2"
          style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
        >
          {/* Primary CTA */}
          {canAdvance && (
            <button
              type="button"
              onClick={() => advanceJob(job.id)}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-bold text-white transition hover:opacity-90"
              style={{ background: "#2D5F4E" }}
            >
              {ctaLabel}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {/* Secondary CTAs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={printCMR}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--app-border)", color: "var(--app-fg)" }}
            >
              <Printer className="h-4 w-4" />
              CMR
            </button>
            {job.status === "invoiced" && (
              <button
                type="button"
                onClick={printInvoice}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold transition hover:opacity-80"
                style={{ borderColor: "#2D5F4E40", background: "#E8F0EC", color: "#2D5F4E" }}
              >
                <FileText className="h-4 w-4" />
                Fatura PDF
              </button>
            )}
            {truck && (
              <Link
                to={mapUrl({ truck: truck.id })}
                onClick={onClose}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold transition hover:opacity-80"
                style={{ borderColor: "var(--app-border)", color: "#2D5F4E" }}
              >
                <MapPin className="h-4 w-4" />
                Mapa
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
