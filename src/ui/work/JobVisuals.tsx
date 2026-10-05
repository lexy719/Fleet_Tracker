import clsx from "clsx";
import { AlertTriangle, Clock, RotateCcw } from "lucide-react";
import type { CargoType, Driver, Job, JobStop, Trailer, Truck } from "../../data/types";
import { fmtTonnes, stopWindowInDay, stopWindowText } from "../format";
import { StatusBadge } from "../kit";
import { JOB_STATUS, toneVars, type Tone } from "../status";
import type { AttentionReason, Countdown } from "./workModel";

/*
 * Work visual language — one set of components used by the list, board, drawer and job
 * workspace: schematic route, job identity, deadline countdown, cargo and resource unit.
 */

/* ─── Cargo identity ─── */

export const CARGO: Record<CargoType, { label: string; color: string }> = {
  dry: { label: "Seco", color: "var(--cargo-dry)" },
  refrigerated: { label: "Frio", color: "var(--cargo-reefer)" },
  hazmat: { label: "ADR", color: "var(--cargo-hazmat)" },
  bulk: { label: "Granel", color: "var(--cargo-bulk)" },
  automotive: { label: "Auto", color: "var(--cargo-auto)" },
};

export function CargoTag({ job, className }: { job: Job; className?: string }) {
  const c = CARGO[job.cargoType];
  const adr = job.cargoType !== "hazmat" && (job.adrClass || job.cargo.some((l) => l.dangerousGoods));
  return (
    <span className={clsx("num inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-[var(--text)]", className)}>
      <span className="inline-flex h-[18px] items-center rounded-[var(--r-sm)] px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 12%, transparent)` }}>
        {c.label}
      </span>
      <span>{job.totalPallets} plt · {fmtTonnes(job.totalWeightKg)}</span>
      {adr ? <span className="text-[11px] font-semibold text-[var(--cargo-hazmat)]">ADR</span> : null}
      {job.tempTargetC ? <span className="text-[11px] text-[var(--cargo-reefer)]">{job.tempTargetC.min}…{job.tempTargetC.max}°</span> : null}
    </span>
  );
}

/* ─── Identity ─── */

export function JobIdentity({ job, size = "row" }: { job: Job; size?: "row" | "card" | "header" }) {
  const prio = job.priority !== "normal";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className={clsx("num font-semibold tracking-[0.01em] text-[var(--accent)]", size === "header" ? "text-[13px]" : "text-[12px]")}>{job.jobNumber}</span>
        {prio ? (
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: job.priority === "critical" ? "var(--danger)" : "var(--warn)" }}>
            {job.priority === "critical" ? "Crítico" : "Urgente"}
          </span>
        ) : null}
        {job.isDemo ? <span className="text-[10.5px] font-medium text-[var(--prov-demo)]">demo</span> : null}
      </div>
      <p className={clsx("truncate font-semibold text-[var(--text)]", size === "header" ? "text-[18px] leading-6 tracking-[-0.01em]" : size === "card" ? "text-[13px]" : "text-[13.5px] leading-5")} title={job.client}>
        {job.client}
      </p>
      {job.reference && size !== "card" ? <p className="num truncate text-[11.5px] text-[var(--text-3)]">Ref. {job.reference}</p> : null}
    </div>
  );
}

/* ─── Countdown ─── */

export function DeadlineChip({ c, className }: { c: Countdown | null; className?: string }) {
  if (!c) return null;
  const v = toneVars(c.tone);
  return (
    <span
      className={clsx("num inline-flex h-[20px] items-center gap-1 whitespace-nowrap rounded-[var(--r-sm)] px-1.5 text-[11.5px] font-medium", className)}
      style={c.tone === "neutral" ? { color: "var(--text-2)", background: "var(--surface-sunken)" } : { color: v.fg, background: v.bg }}
      title={`Prazo de ${c.kind === "pickup" ? "recolha" : "entrega"} registado no trabalho (não é uma ETA)`}
    >
      <Clock className="h-3 w-3" />
      {c.label}
    </span>
  );
}

/* ─── Status + attention ─── */

export function StatusAndAttention({ job, attention, compact }: { job: Job; attention: AttentionReason[]; compact?: boolean }) {
  const top = attention[0];
  return (
    <div className="min-w-0">
      {job.planStatus === "REPLAN_REQUIRED" && job.status !== "cancelled" ? (
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--warn)]">
          <RotateCcw className="h-3 w-3" /> Replanear
        </span>
      ) : (
        <StatusBadge status={JOB_STATUS[job.status]} />
      )}
      {top && top.kind !== "replan" ? (
        <p className={clsx("mt-0.5 flex items-center gap-1 text-[11.5px] font-medium", compact ? "truncate" : "")} style={{ color: toneVars(top.tone).fg }} title={attention.map((a) => a.label).join(" · ")}>
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{top.label}</span>
          {attention.length > 1 ? <span className="shrink-0 text-[var(--text-3)]">+{attention.length - 1}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

/** Worst attention tone → thin left edge colour (null = no edge). */
export function attentionEdge(attention: AttentionReason[]): string | null {
  if (!attention.length) return null;
  return attention.some((a) => a.tone === "danger") ? "var(--danger)" : "var(--warn)";
}

/* ─── Resources ─── */

export function ResourceUnit({ job, truck, trailer, driver }: { job: Job; truck?: Truck; trailer?: Trailer; driver?: Driver }) {
  if (job.status === "backlog") {
    return (
      <div className="min-w-0">
        <span className="inline-flex h-[20px] items-center rounded-[var(--r-sm)] border border-dashed border-[var(--border-strong)] px-1.5 text-[11.5px] font-medium text-[var(--text-2)]">Por atribuir</span>
      </div>
    );
  }
  const missing = (label: string) => <span className="text-[var(--text-3)]">{label} —</span>;
  const unresolved = (id: string) => <span className="text-[var(--danger)]" title="Referência não resolvida">«{id}»</span>;
  return (
    <div className="min-w-0 leading-[18px]">
      <p className="num truncate text-[12.5px] font-medium text-[var(--text)]">
        {job.assignedTruckId ? (truck ? truck.plate : unresolved(job.assignedTruckId)) : missing("Viatura")}
        {job.assignedTrailerId ? <span className="font-normal text-[var(--text-2)]"> · {trailer ? trailer.plate : unresolved(job.assignedTrailerId)}</span> : null}
      </p>
      <p className="truncate text-[12px] text-[var(--text-2)]">{job.assignedDriverId ? (driver ? driver.name : unresolved(job.assignedDriverId)) : missing("Motorista")}</p>
    </div>
  );
}

/* ─── Route schematic ─── */

function sortedStops(job: Job): JobStop[] {
  return [...job.stops].sort((a, b) => a.sequence - b.sequence);
}

function Marker({ type, done, size = 9 }: { type: JobStop["type"]; done: boolean; size?: number }) {
  const color = done ? "var(--ok)" : type === "pickup" ? "var(--route-pickup)" : type === "delivery" ? "var(--route-delivery)" : "var(--text-3)";
  const hollow = type === "stop" && !done;
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: hollow ? size - 2 : size, height: hollow ? size - 2 : size, background: hollow ? "var(--surface)" : color, boxShadow: `0 0 0 ${hollow ? 1.5 : 2}px ${hollow ? color : "var(--surface)"}${hollow ? "" : `, 0 0 0 3px ${color}`}` }}
    />
  );
}

/**
 * Schematic origin → destination with intermediate stops and dated windows.
 * `row`: list rows · `compact`: board cards (vertical) · `detail`: drawer / workspace header.
 */
export function RouteLine({ job, variant = "row", now, deliveryTone, sectionDay }: { job: Job; variant?: "row" | "compact" | "detail"; now: Date; deliveryTone?: Tone; sectionDay?: string }) {
  const win = (st: JobStop) => stopWindowInDay(st, sectionDay, now);
  const stops = sortedStops(job);
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return <span className="text-[var(--text-3)]">Sem paragens</span>;
  const mids = stops.slice(1, -1);
  const done = stops.filter((s) => s.completed).length;
  const progress = stops.length > 1 ? Math.min(1, Math.max(0, (done - 1) / (stops.length - 1))) : 0;
  const delColor = deliveryTone && deliveryTone !== "neutral" ? toneVars(deliveryTone).fg : undefined;
  const midLabel = mids.length === 0 ? null : mids.length === 1 ? `via ${mids[0]!.city || mids[0]!.address}` : `+${mids.length} paragens`;

  if (variant === "compact") {
    return (
      <div className="relative space-y-1 pl-4">
        <span aria-hidden className="absolute left-[4px] top-[8px] bottom-[8px] w-px bg-[var(--route-line)]" />
        <div className="flex items-baseline justify-between gap-2">
          <span className="absolute left-0 mt-[4px]"><Marker type={first.type} done={first.completed} size={8} /></span>
          <span className="truncate text-[12.5px] font-medium text-[var(--text)]">{first.city || first.address}</span>
          <span className="num shrink-0 text-[11.5px] text-[var(--text-2)]">{stopWindowText(first, now)}</span>
        </div>
        {midLabel ? <p className="truncate text-[11px] text-[var(--text-3)]">{midLabel}</p> : null}
        <div className="flex items-baseline justify-between gap-2">
          <span className="absolute left-0 mt-[4px]"><Marker type={last.type} done={last.completed} size={8} /></span>
          <span className="truncate text-[12.5px] font-medium text-[var(--text)]">{last.city || last.address}</span>
          <span className="num shrink-0 text-[11.5px]" style={{ color: delColor ?? "var(--text-2)" }}>{stopWindowText(last, now)}</span>
        </div>
      </div>
    );
  }

  const big = variant === "detail";
  const shownMids = mids.length <= 3 ? mids : [];
  return (
    <div className={clsx("grid min-w-0 items-start gap-x-3", big ? "grid-cols-[minmax(0,auto)_minmax(90px,1fr)_minmax(0,auto)]" : "grid-cols-[minmax(0,140px)_minmax(64px,1fr)_minmax(0,150px)]")}>
      <div className="min-w-0">
        <p className={clsx("flex items-center gap-2 truncate font-semibold text-[var(--text)]", big ? "text-[15px]" : "text-[13px]")}>
          <Marker type={first.type} done={first.completed} />
          <span className="truncate">{first.city || first.address}</span>
        </p>
        <p className={clsx("num truncate pl-[17px] text-[var(--text-2)]", big ? "text-[13px]" : "text-[12px]")} title={stopWindowText(first, now)}>{win(first)}</p>
      </div>
      <div className={clsx("relative min-w-0", big ? "mt-[10px]" : "mt-[8px]")} aria-label={midLabel ?? "direto"}>
        <div className="relative h-[2px] rounded bg-[var(--route-line)]">
          {progress > 0 ? <div className="absolute inset-y-0 left-0 rounded bg-[var(--ok)]" style={{ width: `${progress * 100}%` }} /> : null}
          <svg aria-hidden className="absolute -right-[1px] -top-[4px]" width="7" height="10" viewBox="0 0 7 10"><path d="M0 0 L7 5 L0 10 Z" fill="var(--route-line)" /></svg>
          {shownMids.map((m, i) => (
            <span key={m.id} className="absolute -top-[3px]" style={{ left: `calc(${((i + 1) / (shownMids.length + 1)) * 100}% - 4px)` }} title={`${m.city} · ${stopWindowText(m, now)}`}>
              <Marker type={m.type} done={m.completed} size={8} />
            </span>
          ))}
        </div>
        {midLabel ? <p className={clsx("mt-2.5 truncate text-center text-[var(--text-3)]", big ? "text-[12px]" : "text-[11px]")}>{midLabel}</p> : null}
      </div>
      <div className="min-w-0 text-right">
        <p className={clsx("flex items-center justify-end gap-2 truncate font-semibold text-[var(--text)]", big ? "text-[15px]" : "text-[13px]")}>
          <span className="truncate">{last.city || last.address}</span>
          <Marker type={last.type} done={last.completed} />
        </p>
        <p className={clsx("num truncate pr-[17px]", big ? "text-[13px]" : "text-[12px]")} style={{ color: delColor ?? "var(--text-2)" }} title={stopWindowText(last, now)}>{win(last)}</p>
      </div>
    </div>
  );
}
