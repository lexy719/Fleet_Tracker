import clsx from "clsx";
import { Check, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useFleetData } from "../../context/FleetDataContext";
import { canUnassignJob, useJobs } from "../../context/JobsContext";
import { useRoadEvents } from "../../context/RoadEventsContext";
import type { Job } from "../../data/types";
import type { OperationalEvent } from "../../domain/events";
import { truckDisplayName } from "../../domain/fleet/trucks";
import { trailerTypeLabel } from "../../domain/fleet/trailers";
import { EDITABLE_STATUSES } from "../../domain/jobs/jobDraft";
import { forwardStep, transitionBlockers } from "../../domain/jobs/lifecycle";
import { assessPlannedJob, type PlannedDecisionState } from "../../regulations/reevaluate";
import { paths } from "../../lib/appLinks";
import { fmtDuration, fmtEur, fmtKg, fmtKm, fmtWhen, stopWindowText } from "../format";
import { Button, DataList, Modal, Notice, Pill, ProvenanceTag, SectionTitle, StatusBadge } from "../kit";
import { JOB_STATUS, PLAN_STATUS, type Tone } from "../status";
import { useEditors } from "../shell/editors";
import { attentionReasons, nextCountdown } from "../work/workModel";
import { CargoTag, DeadlineChip, JobIdentity, ResourceUnit, RouteLine, StatusAndAttention } from "../work/JobVisuals";

/* ─── Header ─── */

export function JobStatusLine({ job }: { job: Job }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusBadge status={JOB_STATUS[job.status]} />
      {job.planStatus !== "UNPLANNED" && job.status !== "cancelled" ? <StatusBadge status={PLAN_STATUS[job.planStatus]} /> : null}
      {job.isDemo ? <ProvenanceTag kind="DEMO" /> : null}
    </span>
  );
}

/* ─── Route timeline ─── */

const STOP_LABEL = { pickup: "Recolha", stop: "Paragem", delivery: "Entrega" } as const;

export function RouteTimeline({ job, now = new Date() }: { job: Job; now?: Date }) {
  const stops = [...job.stops].sort((a, b) => a.sequence - b.sequence);
  return (
    <ol className="relative">
      {stops.map((s, i) => (
        <li key={s.id} className="relative flex gap-3 pb-3 last:pb-0">
          {i < stops.length - 1 ? <span aria-hidden className="absolute left-[7px] top-4 bottom-0 w-px bg-[var(--border-strong)]" /> : null}
          <span
            aria-hidden
            className={clsx(
              "relative z-[1] mt-[3px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-2",
              s.completed ? "border-[var(--ok)] bg-[var(--ok)]" : s.type === "delivery" ? "border-[var(--text)] bg-[var(--surface)]" : "border-[var(--text-3)] bg-[var(--surface)]",
            )}
          >
            {s.completed ? <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} /> : null}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-[13px] font-medium text-[var(--text)]">
                {s.city || s.address}
                <span className="ml-2 text-[11px] font-normal uppercase tracking-[0.04em] text-[var(--text-3)]">{STOP_LABEL[s.type]}</span>
              </p>
              <span className="num shrink-0 text-[12px] text-[var(--text-2)]">
                {stopWindowText(s, now)}
              </span>
            </div>
            <p className="truncate text-[12px] text-[var(--text-3)]">
              {s.clientName ? `${s.clientName} · ` : ""}
              {s.address}
            </p>
            {s.completed ? <p className="num text-[11px] text-[var(--ok)]">Concluída {s.completedAt ? fmtWhen(s.completedAt, now) : s.actualTime ?? ""}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ─── Cargo ─── */

const UNIT = { pallet: "paletes", package: "volumes", unit: "unid.", bulk: "granel" } as const;

export function CargoSummary({ job }: { job: Job }) {
  return (
    <div>
      <p className="num text-[13px] text-[var(--text)]">
        <span className="font-medium">{job.totalPallets} paletes</span> · {fmtKg(job.totalWeightKg)}
        {job.adrClass ? <Pill tone="danger" className="ml-2">ADR {job.adrUnNumber ?? ""}</Pill> : null}
        {job.tempTargetC ? <Pill tone="info" className="ml-2">{job.tempTargetC.min}…{job.tempTargetC.max} °C</Pill> : null}
      </p>
      <ul className="mt-1 space-y-0.5">
        {job.cargo.map((c) => (
          <li key={c.id} className="num flex justify-between gap-3 text-[12px] text-[var(--text-2)]">
            <span className="truncate">{c.description}{c.dangerousGoods ? ` · ${[c.dangerousGoods.unNumber, c.dangerousGoods.adrClass].filter(Boolean).join(" ")}` : ""}</span>
            <span className="shrink-0 text-[var(--text-3)]">{c.quantity} {UNIT[c.unit]} · {fmtKg(c.weightKg)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Resources ─── */

export function JobResources({ job }: { job: Job }) {
  const { getTruck, getDriver, getTrailer } = useFleetData();
  const t = getTruck(job.assignedTruckId);
  const d = getDriver(job.assignedDriverId);
  const r = getTrailer(job.assignedTrailerId);
  const row = (label: string, id: string | undefined, node: ReactNode) => ({
    label,
    value: !id ? <span className="text-[var(--text-3)]">—</span> : node ?? <span className="text-[var(--danger)]">«{id}» não existe (referência preservada)</span>,
  });
  return (
    <DataList
      rows={[
        row("Viatura", job.assignedTruckId, t ? <Link className="hover:underline" to={paths.truck(t.id)}><span className="num font-medium">{t.plate}</span> <span className="text-[var(--text-3)]">{truckDisplayName(t)}</span>{t.archivedAt ? " (arquivada)" : ""}</Link> : null),
        row("Reboque", job.assignedTrailerId, r ? <Link className="hover:underline" to={paths.trailer(r.id)}><span className="num font-medium">{r.plate}</span> <span className="text-[var(--text-3)]">{trailerTypeLabel(r)}</span></Link> : null),
        row("Motorista", job.assignedDriverId, d ? <Link className="hover:underline" to={paths.driver(d.id)}>{d.name}</Link> : null),
      ]}
    />
  );
}

/* ─── Plan / Road Intelligence ─── */

export function useDecisionState(job: Job): PlannedDecisionState {
  const { getTruck, drivers, trailers } = useFleetData();
  const { dataset } = useRoadEvents();
  const truck = getTruck(job.assignedTruckId) ?? null;
  return useMemo(() => assessPlannedJob(job, truck, dataset,new Date(),{drivers,trailers}), [job, truck, dataset,drivers,trailers]);
}

export function decisionView(s: PlannedDecisionState): { label: string; tone: Tone; detail?: string } {
  switch (s.state) {
    case "NOT_PLANNED":
      return { label: "Sem decisão (trabalho não planeado ou concluído)", tone: "neutral" };
    case "INSUFFICIENT_SAVED_ROUTE_DATA":
      return { label: "Sem decisão guardada", tone: "neutral", detail: s.reason };
    case "STALE_INPUTS":
      return { label: "Decisão desatualizada", tone: "warn", detail: `Mudou: ${s.changed.join(", ")}` };
    case "REQUIRES_REEVALUATION":
      return { label: "Requer reavaliação", tone: "warn", detail: s.reason };
    case "CURRENT": {
      const st = s.reevaluation.current.status;
      if (st === "ROUTE_AFFECTED") return { label: "Rota afetada por restrição", tone: "danger" };
      if (st === "POTENTIALLY_AFFECTED") return { label: "Possivelmente afetada", tone: "warn" };
      if (st === "EVALUATION_ERROR") return { label: "Erro de avaliação", tone: "danger" };
      return { label: "Sem restrições conhecidas", tone: "neutral", detail: "Cobertura parcial — não equivale a conformidade garantida." };
    }
  }
}

export function JobPlanSummary({ job }: { job: Job }) {
  const s = useDecisionState(job);
  const dv = decisionView(s);
  return (
    <DataList
      rows={[
        { label: "Plano", value: <StatusBadge status={PLAN_STATUS[job.planStatus]} /> },
        ...(job.planStatus === "REPLAN_REQUIRED" && job.planInvalidation ? [{ label: "Alterado", value: <span className="text-[var(--warn)]">{job.planInvalidation.fields.join(", ")}</span> }] : []),
        { label: "Partida", value: job.plannedDepartureAt ? fmtWhen(job.plannedDepartureAt) : <span className="text-[var(--text-3)]">não definida (planeamento usa a hora atual)</span> },
        ...(job.plannedKm !== undefined ? [{ label: "Distância · duração", value: `${fmtKm(job.plannedKm)} · ${fmtDuration(job.plannedDurationMin)}` }] : []),
        ...(job.plannedCostEur !== undefined ? [{ label: "Custo estimado", value: <span>{fmtEur(job.plannedCostEur)} <span className="text-[var(--text-3)]">combustível + portagens</span></span> }] : []),
        { label: "Road Intelligence", value: <span><StatusBadge status={{ label: dv.label, tone: dv.tone }} />{dv.detail ? <span className="block text-[12px] text-[var(--text-3)]">{dv.detail}</span> : null}</span> },
      ]}
    />
  );
}

/* ─── Attention ─── */

export function AttentionList({ job }: { job: Job }) {
  const { getTruck, getDriver, getTrailer } = useFleetData();
  const reasons = attentionReasons(job, new Date(), { truck: (id) => !!getTruck(id), driver: (id) => !!getDriver(id), trailer: (id) => !!getTrailer(id) });
  if (!reasons.length) return null;
  return (
    <div className="space-y-1">
      {reasons.map((r) => (
        <Notice key={r.kind} tone={r.tone} title={r.label}>{r.kind === "replan" && job.planInvalidation ? `Alterado: ${job.planInvalidation.fields.join(", ")}.` : undefined}</Notice>
      ))}
    </div>
  );
}

/* ─── Actions ─── */

/** Turn domain blockers into "what happened / what to do". */
export function explainBlockers(job: Job, blockers: string[]): { title: string; detail: string; replan: boolean } {
  const replan = blockers.some((b) => /replanead|sem rota confirmada/.test(b));
  const step = forwardStep(job.status);
  const title = step ? `Ainda não é possível: ${step.label.toLowerCase()}` : "Ação indisponível";
  return { title, detail: blockers.map((b) => b.charAt(0).toUpperCase() + b.slice(1)).join(". ") + ".", replan };
}

export function JobActions({ job, compact }: { job: Job; compact?: boolean }) {
  const { transition, unassignJob, cancelJob } = useJobs();
  const { trucks, drivers, trailers } = useFleetData();
  const ed = useEditors();
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [unassignOpen, setUnassignOpen] = useState(false);
  const [reason, setReason] = useState("");
  const step = forwardStep(job.status);
  const blockers = useMemo(() => {
    if (!step) return [];
    const resources = { trucks: new Map(trucks.map((t) => [t.id, t])), drivers: new Map(drivers.map((d) => [d.id, d])), trailers: new Map(trailers.map((t) => [t.id, t])) };
    return transitionBlockers(job, step.to, { now: new Date(), resources });
  }, [job, step, trucks, drivers, trailers]);
  const ex = blockers.length ? explainBlockers(job, blockers) : null;
  const run = async (p: Promise<{ ok: true } | { ok: false; errors: string[] }>) => {
    const r = await p;
    setError(r.ok ? null : r.errors.join("; "));
    return r.ok;
  };
  const canCancel = !["delivered", "invoiced", "cancelled"].includes(job.status);
  return (
    <div className="space-y-2">
      <div className={clsx("flex flex-wrap items-center gap-2", compact && "justify-end")}>
        {job.status === "backlog" || job.planStatus === "REPLAN_REQUIRED" ? (
          <Link to={paths.dispatch(job.id)}><Button variant="primary" icon={<ChevronRight className="h-3.5 w-3.5" />}>{job.status === "backlog" ? "Planear e atribuir" : "Replanear"}</Button></Link>
        ) : null}
        {step && job.planStatus !== "REPLAN_REQUIRED" ? (
          <Button variant="primary" disabled={blockers.length > 0} onClick={() => void run(transition(job.id, step.to))} title={ex?.detail}>
            {step.label}
          </Button>
        ) : null}
        {EDITABLE_STATUSES.includes(job.status) ? <Button onClick={() => ed.openJob(job.id)}>Editar</Button> : null}
        {canUnassignJob(job) ? <Button variant="ghost" onClick={() => setUnassignOpen(true)}>Remover atribuição</Button> : null}
        {canCancel ? <Button variant="ghost" className="text-[var(--danger)]" onClick={() => setCancelOpen(true)}>Cancelar trabalho</Button> : null}
      </div>
      {ex && job.planStatus !== "REPLAN_REQUIRED" && job.status !== "backlog" ? (
        <Notice
          tone="warn"
          title={ex.title}
          action={blockers.some((b) => /paragem|recolha/.test(b)) ? <Link to={paths.job(job.id, "stops")}><Button size="sm">Concluir paragens</Button></Link> : undefined}
        >
          {ex.detail}
        </Notice>
      ) : null}
      {error ? <Notice title="A ação não foi aplicada">{error}</Notice> : null}

      {cancelOpen ? (
        <Modal
          title={`Cancelar ${job.jobNumber}`}
          onClose={() => setCancelOpen(false)}
          footer={
            <>
              <Button onClick={() => setCancelOpen(false)}>Voltar</Button>
              <Button variant="danger" disabled={reason.trim().length < 3} onClick={async () => (await run(cancelJob(job.id, reason))) && setCancelOpen(false)}>Cancelar trabalho</Button>
            </>
          }
        >
          <p className="mb-3">O cancelamento fica no histórico e não pode ser desfeito. Os recursos atribuídos ficam livres.</p>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-[var(--text-2)]">Motivo</span>
            <input autoFocus className="ui-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex.: cliente cancelou a encomenda" />
          </label>
        </Modal>
      ) : null}
      {unassignOpen ? (
        <Modal
          title={`Remover atribuição de ${job.jobNumber}`}
          onClose={() => setUnassignOpen(false)}
          footer={
            <>
              <Button onClick={() => setUnassignOpen(false)}>Voltar</Button>
              <Button variant="primary" onClick={async () => (await run(unassignJob(job.id))) && setUnassignOpen(false)}>Remover atribuição</Button>
            </>
          }
        >
          O trabalho volta a «Por atribuir»; viatura, reboque e motorista ficam livres e a rota confirmada passa ao histórico.
        </Modal>
      ) : null}
    </div>
  );
}

/* ─── History ─── */

const EVENT_LABEL: Record<string, string> = {
  JOB_CREATED: "Criado",
  JOB_EDITED: "Editado",
  ROUTE_PLANNED: "Rota confirmada",
  ROUTE_INVALIDATED: "Rota invalidada",
  STATUS_CHANGED: "Estado",
  ASSIGNMENT_CHANGED: "Atribuição",
  STOP_UPDATED: "Paragem",
  JOB_CANCELLED: "Cancelado",
  NOTES_UPDATED: "Notas",
  MIGRATED: "Migrado do armazenamento anterior",
  DEMO_SEEDED: "Dados demo",
  RESOURCE_CREATED: "Criado",
  RESOURCE_UPDATED: "Atualizado",
  RESOURCE_ARCHIVED: "Arquivado",
  RESOURCE_RESTORED: "Restaurado",
  RESOURCE_DELETED: "Eliminado",
};
const SOURCE: Record<string, string> = { LOCAL_USER: "utilizador", SYSTEM: "sistema", MIGRATION: "migração", DEMO_SEED: "seed demo" };

export function useEntityEvents(entityId: string, revisionKey: unknown) {
  const { listEvents } = useJobs();
  const [events, setEvents] = useState<OperationalEvent[] | null>(null);
  useEffect(() => {
    let alive = true;
    void listEvents(entityId).then((e) => alive && setEvents(e));
    return () => {
      alive = false;
    };
  }, [entityId, revisionKey, listEvents]);
  return events;
}

export function EventHistory({ entityId, revisionKey, statusLabel }: { entityId: string; revisionKey: unknown; statusLabel?: (s: string) => string }) {
  const events = useEntityEvents(entityId, revisionKey);
  if (!events) return <p className="text-[12px] text-[var(--text-3)]">A carregar histórico…</p>;
  if (!events.length) return <p className="text-[12px] text-[var(--text-3)]">Sem eventos registados.</p>;
  return (
    <ol className="divide-y divide-[var(--border)]" data-testid="job-history">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="grid grid-cols-[110px_1fr_auto] items-baseline gap-3 py-1.5 text-[12px]">
          <span className="num text-[var(--text-3)]">{fmtWhen(e.at)}</span>
          <span className="min-w-0 text-[var(--text)]">
            <span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
            {e.fromStatus && e.toStatus ? <span className="text-[var(--text-2)]"> · {statusLabel?.(e.fromStatus) ?? e.fromStatus} → {statusLabel?.(e.toStatus) ?? e.toStatus}</span> : null}
            {e.reason ? <span className="text-[var(--text-2)]"> · {e.reason}</span> : null}
          </span>
          <span className="text-[11px] text-[var(--text-3)]">{SOURCE[e.source] ?? e.source}</span>
        </li>
      ))}
    </ol>
  );
}

export function SectionBlock({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("px-5 py-4", className)}>
      <SectionTitle action={action} className="mb-2.5">{title}</SectionTitle>
      {children}
    </section>
  );
}

/* ─── Dossier header (drawer + workspace) ─── */

/** Job identity, state, schematic route with windows, countdown, cargo and resource unit. */
export function JobHero({ job, className, showIdentity = true }: { job: Job; className?: string; showIdentity?: boolean }) {
  const { getTruck, getDriver, getTrailer } = useFleetData();
  const now = new Date();
  const att = attentionReasons(job, now, { truck: (id) => !!getTruck(id), driver: (id) => !!getDriver(id), trailer: (id) => !!getTrailer(id) });
  const sla = att.find((a) => a.kind === "sla_breached" || a.kind === "sla_risk");
  return (
    <div className={clsx("space-y-4", className)}>
      {showIdentity ? (
        <div className="flex items-start justify-between gap-4">
          <JobIdentity job={job} size="header" />
          <div className="shrink-0 text-right">
            <StatusAndAttention job={job} attention={[]} />
            <div className="mt-1"><DeadlineChip c={nextCountdown(job, now)} /></div>
          </div>
        </div>
      ) : null}
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        <RouteLine job={job} variant="detail" now={now} deliveryTone={sla?.tone} />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <CargoTag job={job} />
        <ResourceUnit job={job} truck={getTruck(job.assignedTruckId)} trailer={getTrailer(job.assignedTrailerId)} driver={getDriver(job.assignedDriverId)} />
        {job.plannedDepartureAt ? <span className="num text-[12.5px] text-[var(--text-2)]">Partida {fmtWhen(job.plannedDepartureAt, now)}</span> : null}
        {!showIdentity ? <DeadlineChip c={nextCountdown(job, now)} className="ml-auto" /> : null}
      </div>
    </div>
  );
}
