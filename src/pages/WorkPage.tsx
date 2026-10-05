import clsx from "clsx";
import { AlertTriangle, ArrowRight, Columns3, List, ListFilter, Plus, X } from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFleetData } from "../context/FleetDataContext";
import { useJobs } from "../context/JobsContext";
import type { Driver, Job, JobStatus, Trailer, Truck } from "../data/types";
import { paths } from "../lib/appLinks";
import { fmtDayLabel, fmtLongDate } from "../ui/format";
import { Button, Checkbox, EmptyState, Field, Notice, Popover, Segmented, Tabs } from "../ui/kit";
import { JobDrawer } from "../ui/job/JobDrawer";
import { useEditors } from "../ui/shell/editors";
import { JOB_STATUS } from "../ui/status";
import { attentionEdge, CargoTag, DeadlineChip, JobIdentity, ResourceUnit, RouteLine, StatusAndAttention } from "../ui/work/JobVisuals";
import {
  activeFilterCount,
  attentionReasons,
  BOARD_COLUMNS,
  boardColumnOf,
  EMPTY_FILTERS,
  firstStop,
  groupCounts,
  inGroup,
  lastStop,
  matchesFilters,
  nextCountdown,
  requestedStatusForDrop,
  sectionOf,
  sortWork,
  WORK_GROUPS,
  type AttentionReason,
  type BoardColumn,
  type DateScope,
  type ResolveRefs,
  type WorkFilters,
  type WorkGroup,
} from "../ui/work/workModel";

type View = "list" | "board";
const ROW_H = 78;
const SECTION_H = 34;
const GRID = "grid grid-cols-[minmax(190px,240px)_minmax(360px,680px)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(170px,1fr)] gap-x-5";

const DATE_ITEMS: { value: DateScope; label: string }[] = [
  { value: "any", label: "Qualquer" },
  { value: "today", label: "Hoje" },
  { value: "tomorrow", label: "Amanhã" },
  { value: "week", label: "Esta semana" },
  { value: "overdue", label: "Atrasados" },
];

function FilterPanel({ jobs, f, set, reset }: { jobs: Job[]; f: WorkFilters; set: (p: Partial<WorkFilters>) => void; reset: () => void }) {
  const { trucks, trailers, drivers } = useFleetData();
  const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "pt"));
  const customers = useMemo(() => uniq(jobs.map((j) => j.client)), [jobs]);
  const origins = useMemo(() => uniq(jobs.map((j) => firstStop(j)?.city)), [jobs]);
  const dests = useMemo(() => uniq(jobs.map((j) => lastStop(j)?.city)), [jobs]);
  const sel = (label: string, value: string | undefined, onChange: (v: string | undefined) => void, opts: { v: string; l: string }[]) => (
    <Field label={label}>
      <select className="ui-input" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Todos</option>
        {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </Field>
  );
  return (
    <div className="space-y-3 p-3">
      <Field label="Data da recolha">
        <div className="flex flex-wrap gap-1">
          {DATE_ITEMS.map((d) => (
            <button key={d.value} type="button" onClick={() => set({ date: d.value })} className={clsx("h-7 rounded-[var(--r-md)] border px-2 text-[12px]", f.date === d.value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]")}>
              {d.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {sel("Cliente", f.customer, (v) => set({ customer: v }), customers.map((c) => ({ v: c, l: c })))}
        {sel("Viatura", f.truckId, (v) => set({ truckId: v }), trucks.map((t) => ({ v: t.id, l: t.plate })))}
        {sel("Origem", f.origin, (v) => set({ origin: v }), origins.map((c) => ({ v: c, l: c })))}
        {sel("Destino", f.destination, (v) => set({ destination: v }), dests.map((c) => ({ v: c, l: c })))}
        {sel("Reboque", f.trailerId, (v) => set({ trailerId: v }), trailers.map((t) => ({ v: t.id, l: t.plate })))}
        {sel("Motorista", f.driverId, (v) => set({ driverId: v }), drivers.map((d) => ({ v: d.id, l: d.name })))}
      </div>
      <Checkbox label="Só trabalhos a replanear" checked={!!f.replanOnly} onChange={(v) => set({ replanOnly: v || undefined })} />
      <div className="flex justify-end border-t border-[var(--border)] pt-2">
        <Button size="sm" variant="ghost" onClick={reset}>Limpar filtros</Button>
      </div>
    </div>
  );
}

function FilterChips({ f, set }: { f: WorkFilters; set: (p: Partial<WorkFilters>) => void }) {
  const { getTruck, getTrailer, getDriver } = useFleetData();
  const chips: { label: string; clear: Partial<WorkFilters> }[] = [];
  if (f.date !== "any") chips.push({ label: `Recolha: ${DATE_ITEMS.find((d) => d.value === f.date)!.label}`, clear: { date: "any" } });
  if (f.customer) chips.push({ label: `Cliente: ${f.customer}`, clear: { customer: undefined } });
  if (f.origin) chips.push({ label: `Origem: ${f.origin}`, clear: { origin: undefined } });
  if (f.destination) chips.push({ label: `Destino: ${f.destination}`, clear: { destination: undefined } });
  if (f.truckId) chips.push({ label: `Viatura: ${getTruck(f.truckId)?.plate ?? f.truckId}`, clear: { truckId: undefined } });
  if (f.trailerId) chips.push({ label: `Reboque: ${getTrailer(f.trailerId)?.plate ?? f.trailerId}`, clear: { trailerId: undefined } });
  if (f.driverId) chips.push({ label: `Motorista: ${getDriver(f.driverId)?.name ?? f.driverId}`, clear: { driverId: undefined } });
  if (f.replanOnly) chips.push({ label: "A replanear", clear: { replanOnly: undefined } });
  return (
    <>
      {chips.map((c) => (
        <span key={c.label} className="inline-flex h-7 items-center gap-1 rounded-[var(--r-md)] bg-[var(--accent-soft)] pl-2 pr-1 text-[12px] text-[var(--accent-ink)]">
          {c.label}
          <button type="button" aria-label={`Remover filtro ${c.label}`} onClick={() => set(c.clear)} className="rounded p-0.5 hover:bg-white/60"><X className="h-3 w-3" /></button>
        </span>
      ))}
    </>
  );
}

/* ─── Shared row data ─── */

type RowCtx = { now: Date; refs: ResolveRefs; truck: (id?: string) => Truck | undefined; trailer: (id?: string) => Trailer | undefined; driver: (id?: string) => Driver | undefined };

function deliveryToneOf(att: AttentionReason[]) {
  const sla = att.find((a) => a.kind === "sla_breached" || a.kind === "sla_risk");
  return sla?.tone;
}

/** Contextual quick action for a job (shown on hover / keyboard focus). */
function quickAction(j: Job): { label: string; to: string } | null {
  if (j.status === "backlog") return { label: "Atribuir", to: paths.dispatch(j.id) };
  if (j.planStatus === "REPLAN_REQUIRED" && ["queued", "assigned"].includes(j.status)) return { label: "Replanear", to: paths.dispatch(j.id) };
  if (j.status === "loading" || j.status === "in_transit") return { label: "Paragens", to: paths.job(j.id, "stops") };
  return null;
}

/* ─── List ─── */

const JobRow = memo(function JobRow({ job, selected, onOpen, ctx, sectionDay }: { job: Job; selected: boolean; onOpen: (id: string) => void; ctx: RowCtx; sectionDay?: string }) {
  const att = attentionReasons(job, ctx.now, ctx.refs);
  const edge = attentionEdge(att);
  const countdown = nextCountdown(job, ctx.now);
  const qa = quickAction(job);
  const danger = att.some((a) => a.tone === "danger");
  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      data-testid="work-row"
      onClick={() => onOpen(job.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(job.id)}
      className={clsx(
        "group relative cursor-pointer border-b border-[var(--border)] px-6 outline-none transition-[background-color,box-shadow] duration-150",
        selected ? "bg-[var(--accent-soft)]" : danger ? "bg-[color-mix(in_srgb,var(--danger-soft)_28%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--danger-soft)_55%,var(--surface))]" : "bg-[var(--surface)] hover:bg-[var(--surface-2)]",
        "hover:shadow-[0_1px_0_var(--border),0_-1px_0_var(--border)] focus-visible:bg-[var(--surface-2)] focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]",
      )}
      style={{ height: ROW_H }}
    >
      {edge ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: edge }} /> : null}
      {selected ? <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[var(--accent)]" /> : null}
      <div className={clsx(GRID, "h-full items-center")}>
        <JobIdentity job={job} />
        <RouteLine job={job} now={ctx.now} deliveryTone={deliveryToneOf(att)} sectionDay={sectionDay} />
        <div className="min-w-0 space-y-1">
          <CargoTag job={job} />
          {job.stops.length > 2 ? <p className="text-[11.5px] text-[var(--text-3)]">{job.stops.length} paragens</p> : null}
        </div>
        <ResourceUnit job={job} truck={ctx.truck(job.assignedTruckId)} trailer={ctx.trailer(job.assignedTrailerId)} driver={ctx.driver(job.assignedDriverId)} />
        <div className="min-w-0 space-y-1">
          <StatusAndAttention job={job} attention={att} compact />
          {!att.some((a) => a.kind !== "replan") ? <DeadlineChip c={countdown} /> : null}
        </div>
      </div>
      <div className="pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--surface)] p-1 opacity-0 shadow-[var(--shadow-md)] transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        {qa ? (
          <Link to={qa.to} onClick={(e) => e.stopPropagation()} tabIndex={0}>
            <Button size="sm" variant="primary">{qa.label}</Button>
          </Link>
        ) : null}
        <Link to={paths.job(job.id)} onClick={(e) => e.stopPropagation()} tabIndex={0}>
          <Button size="sm" icon={<ArrowRight className="h-3 w-3" />}>Abrir</Button>
        </Link>
      </div>
    </div>
  );
});

type Item = { kind: "section"; key: string; label: string; count: number; attention: number } | { kind: "job"; job: Job };

function sectionLabel(key: string, now: Date): string {
  if (key === "done") return "Concluídos e cancelados";
  const day = key.slice(2);
  const iso = `${day}T12:00:00Z`;
  const rel = fmtDayLabel(iso, now);
  const long = fmtLongDate(new Date(iso));
  return rel === "Hoje" || rel === "Amanhã" || rel === "Ontem" ? `${rel} · ${long}` : long;
}

/** Day sections between rows — computed once per list; heights stay fixed for virtualisation. */
function buildItems(jobs: Job[], now: Date, refs: ResolveRefs): { items: Item[]; offsets: number[]; total: number } {
  const items: Item[] = [];
  let current: Extract<Item, { kind: "section" }> | null = null;
  for (const j of jobs) {
    const key = sectionOf(j);
    if (!current || current.key !== key) {
      current = { kind: "section", key, label: sectionLabel(key, now), count: 0, attention: 0 };
      items.push(current);
    }
    current.count++;
    if (attentionReasons(j, now, refs).length) current.attention++;
    items.push({ kind: "job", job: j });
  }
  const offsets: number[] = [];
  let y = 0;
  for (const it of items) {
    offsets.push(y);
    y += it.kind === "section" ? SECTION_H : ROW_H;
  }
  return { items, offsets, total: y };
}

function firstVisible(offsets: number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid]! <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function WorkList({ jobs, selectedId, onOpen, ctx }: { jobs: Job[]; selectedId: string | null; onOpen: (id: string) => void; ctx: RowCtx }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(800);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { items, offsets, total } = useMemo(() => buildItems(jobs, ctx.now, ctx.refs), [jobs, ctx.now, ctx.refs]);
  // Windowed rendering over variable-height items (sections + rows) — only what is visible is mounted.
  const start = Math.max(0, firstVisible(offsets, scrollTop) - 6);
  let end = start;
  while (end < items.length && offsets[end]! < scrollTop + height + 6 * ROW_H) end++;
  return (
    <div ref={scroller} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-auto bg-[var(--surface)] scroll-thin" role="table" aria-label="Trabalhos">
      <div className="sticky top-0 z-[2] min-w-[1100px] border-b border-[var(--border)] bg-[var(--surface-2)] px-6" role="rowgroup">
        <div className={clsx(GRID, "h-8 items-center text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-3)]")} role="row">
          <span role="columnheader">Trabalho</span>
          <span role="columnheader" className="flex justify-between"><span>Recolha</span><span>Entrega</span></span>
          <span role="columnheader">Carga</span>
          <span role="columnheader">Recursos</span>
          <span role="columnheader">Estado</span>
        </div>
      </div>
      <div className="relative min-w-[1100px]" style={{ height: total }} role="rowgroup">
        {items.slice(start, end).map((it, i) => {
          const top = offsets[start + i]!;
          if (it.kind === "section") {
            return (
              <div key={`s-${it.key}`} className="absolute inset-x-0 flex items-end border-b border-[var(--border)] bg-[var(--bg)] px-6 pb-1.5" style={{ top, height: SECTION_H }} data-testid="work-section">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[var(--text-2)]">{it.label}</span>
                <span className="num ml-2 text-[11.5px] text-[var(--text-3)]">{it.count}</span>
                {it.attention ? <span className="num ml-2 text-[11.5px] font-medium text-[var(--warn)]">· {it.attention} com atenção</span> : null}
              </div>
            );
          }
          return (
            <div key={it.job.id} className="absolute inset-x-0" style={{ top }}>
              <JobRow job={it.job} selected={it.job.id === selectedId} onOpen={onOpen} ctx={ctx} sectionDay={sectionOf(it.job).startsWith("d:") ? sectionOf(it.job).slice(2) : undefined} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Board ─── */

const BOARD_LIMIT = 60;

const BoardCard = memo(function BoardCard({ job, selected, dragging, onOpen, onDragStart, onDragEnd, ctx }: { job: Job; selected: boolean; dragging: boolean; onOpen: (id: string) => void; onDragStart: (id: string, e: React.DragEvent) => void; onDragEnd: () => void; ctx: RowCtx }) {
  const att = attentionReasons(job, ctx.now, ctx.refs);
  const edge = attentionEdge(att);
  const truck = ctx.truck(job.assignedTruckId);
  const driver = ctx.driver(job.assignedDriverId);
  return (
    <article
      draggable
      onDragStart={(e) => onDragStart(job.id, e)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(job.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(job.id)}
      tabIndex={0}
      data-job-id={job.id}
      aria-selected={selected}
      className={clsx(
        "relative cursor-grab overflow-hidden rounded-[var(--r-md)] border bg-[var(--surface)] px-3 py-2.5 transition-[border-color,box-shadow,transform,opacity] duration-150 active:cursor-grabbing",
        selected ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]" : "border-[var(--border)] shadow-[var(--shadow-sm)] hover:-translate-y-px hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]",
        dragging && "opacity-40",
      )}
    >
      {edge ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: edge }} /> : null}
      <JobIdentity job={job} size="card" />
      <div className="mt-2">
        <RouteLine job={job} variant="compact" now={ctx.now} deliveryTone={deliveryToneOf(att)} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
        <CargoTag job={job} className="text-[12px]" />
        <span className="num min-w-0 truncate text-right text-[11.5px] text-[var(--text-2)]">
          {job.status === "backlog" ? <span className="text-[var(--text-3)]">sem recursos</span> : `${truck?.plate ?? "—"} · ${driver?.name.split(" ")[0] ?? "—"}`}
        </span>
      </div>
      {att.length ? (
        <p className="mt-1.5 flex min-w-0 items-center gap-1 text-[11.5px] font-medium" style={{ color: edge ?? undefined }} title={att.map((a) => a.label).join(" · ")}>
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{att[0]!.label}</span>
          {att.length > 1 ? <span className="shrink-0 text-[var(--text-3)]">+{att.length - 1}</span> : null}
        </p>
      ) : null}
      <div className="mt-1 flex min-h-[20px] items-center justify-between gap-2">
        <span className="text-[11.5px] text-[var(--text-3)]">{JOB_STATUS[job.status].label}</span>
        <DeadlineChip c={nextCountdown(job, ctx.now)} className="shrink-0" />
      </div>
    </article>
  );
});

function WorkBoard({ jobs, onOpen, selectedId, ctx }: { jobs: Job[]; onOpen: (id: string) => void; selectedId: string | null; ctx: RowCtx }) {
  const { transition } = useJobs();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<BoardColumn | null>(null);
  const [rejected, setRejected] = useState<{ job: string; to: string; why: string } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const cols = useMemo(() => {
    const m: Record<BoardColumn, Job[]> = { unassigned: [], planned: [], active: [], completed: [] };
    for (const j of jobs) {
      const c = boardColumnOf(j);
      if (c) m[c].push(j);
    }
    return m;
  }, [jobs]);
  const onDragStart = useCallback((id: string, e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
  }, []);
  const onDragEnd = useCallback(() => setDragId(null), []);

  const drop = async (col: BoardColumn, id: string | null) => {
    const job = jobs.find((j) => j.id === id);
    setOver(null);
    setDragId(null);
    if (!job) return;
    const to = requestedStatusForDrop(job, col);
    if (!to) return;
    // The lifecycle service is the authority; an invalid drop leaves the card where it was.
    const r = await transition(job.id, to as JobStatus);
    setRejected(r.ok ? null : { job: job.jobNumber, to: BOARD_COLUMNS.find((c) => c.value === col)!.label, why: r.errors.join(". ") });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg)]">
      {rejected ? (
        <div className="px-6 pt-3">
          <Notice title={`${rejected.job} não pode passar para «${rejected.to}»`} action={<button type="button" aria-label="Fechar aviso" onClick={() => setRejected(null)} className="p-1 text-[var(--text-3)]"><X className="h-3.5 w-3.5" /></button>}>
            {rejected.why.charAt(0).toUpperCase() + rejected.why.slice(1)}.
          </Notice>
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-4 px-6 pt-3">
        {BOARD_COLUMNS.map((c) => {
          const list = cols[c.value];
          const shown = expanded[c.value] ? list : list.slice(0, BOARD_LIMIT);
          const attn = list.filter((j) => attentionReasons(j, ctx.now, ctx.refs).length).length;
          return (
            <section
              key={c.value}
              aria-label={c.label}
              data-column={c.value}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(c.value);
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                void drop(c.value, e.dataTransfer.getData("text/plain") || dragId);
              }}
              className={clsx("flex min-h-0 flex-col rounded-[var(--r-lg)] transition-colors duration-150", over === c.value && dragId ? "bg-[var(--accent-soft)] outline outline-1 outline-[var(--accent)]" : "")}
            >
              <header className="flex h-9 shrink-0 items-center gap-2 border-b-2 px-1" style={{ borderColor: c.value === "active" ? "var(--info)" : c.value === "completed" ? "var(--ok)" : c.value === "planned" ? "var(--accent)" : "var(--border-strong)" }}>
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text)]">{c.label}</h2>
                <span className="num text-[12px] text-[var(--text-3)]">{list.length}</span>
                {attn ? <span className="num ml-auto text-[11.5px] font-medium text-[var(--warn)]">{attn} com atenção</span> : null}
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-2.5 pr-1 scroll-thin">
                {shown.map((j) => (
                  <BoardCard key={j.id} job={j} selected={selectedId === j.id} dragging={dragId === j.id} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} ctx={ctx} />
                ))}
                {list.length > shown.length ? (
                  <button type="button" className="w-full py-1.5 text-[12px] text-[var(--text-2)] hover:text-[var(--text)]" onClick={() => setExpanded((x) => ({ ...x, [c.value]: true }))}>
                    Mostrar mais {list.length - shown.length}
                  </button>
                ) : null}
                {list.length === 0 ? <p className="py-8 text-center text-[12px] text-[var(--text-3)]">Sem trabalhos</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Page ─── */

export function WorkPage() {
  const { jobs } = useJobs();
  const { getTruck, getDriver, getTrailer } = useFleetData();
  const ed = useEditors();
  const [params, setParams] = useSearchParams();
  const group = (params.get("group") as WorkGroup) || "all";
  const view = (params.get("view") as View) || "list";
  const openId = params.get("job");
  const [filters, setFilters] = useState<WorkFilters>(() => ({ ...EMPTY_FILTERS, q: params.get("q") ?? "" }));
  const deferredFilters = useDeferredValue(filters);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterAnchor = useRef<HTMLDivElement>(null);
  const [now] = useState(() => new Date());

  const setParam = useCallback(
    (k: string, v: string | null, replace = false) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v === null || v === "") n.delete(k);
          else n.set(k, v);
          return n;
        },
        { replace },
      ),
    [setParams],
  );
  const refs = useMemo<ResolveRefs>(() => ({ truck: (id) => !!getTruck(id), driver: (id) => !!getDriver(id), trailer: (id) => !!getTrailer(id) }), [getTruck, getDriver, getTrailer]);
  const ctx = useMemo<RowCtx>(() => ({ now, refs, truck: getTruck, trailer: getTrailer, driver: getDriver }), [now, refs, getTruck, getTrailer, getDriver]);

  const filtered = useMemo(() => jobs.filter((j) => matchesFilters(j, deferredFilters, now)), [jobs, deferredFilters, now]);
  const counts = useMemo(() => groupCounts(filtered, now, refs), [filtered, now, refs]);
  const shown = useMemo(() => sortWork(filtered.filter((j) => inGroup(j, view === "board" && (group === "cancelled" || group === "all") ? "all" : group, now, refs))), [filtered, group, view, now, refs]);
  const setF = (p: Partial<WorkFilters>) => setFilters((f) => ({ ...f, ...p }));
  const nActive = activeFilterCount(filters);
  const open = useCallback((id: string) => setParam("job", id), [setParam]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-6 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--text)]">Trabalhos</h1>
            <p className="num mt-0.5 flex flex-wrap gap-x-1.5 text-[12.5px] text-[var(--text-2)]">
              <span>{jobs.length} trabalhos</span>
              <span>· {counts.active} em curso</span>
              <span style={{ color: counts.attention ? "var(--danger)" : undefined }}>· {counts.attention} requerem atenção</span>
            </p>
          </div>
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => ed.openJob()}>Novo trabalho</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="ui-input w-[300px]"
            placeholder="Procurar n.º, referência, cliente, cidade…"
            aria-label="Procurar trabalhos"
            value={filters.q}
            onChange={(e) => {
              setF({ q: e.target.value });
              setParam("q", e.target.value || null, true);
            }}
          />
          <div ref={filterAnchor}>
            <Button icon={<ListFilter className="h-3.5 w-3.5" />} onClick={() => setFilterOpen((o) => !o)} aria-expanded={filterOpen}>
              Filtros{nActive ? <span className="num ml-1 rounded bg-[var(--accent)] px-1 text-[11px] text-white">{nActive}</span> : null}
            </Button>
          </div>
          <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchor={filterAnchor} width={460}>
            <FilterPanel jobs={jobs} f={filters} set={setF} reset={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })} />
          </Popover>
          <FilterChips f={filters} set={setF} />
          {nActive ? <Button size="sm" variant="ghost" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>Limpar</Button> : null}
          <div className="ml-auto">
            <Segmented label="Vista" value={view} onChange={(v) => setParam("view", v === "list" ? null : v, true)} items={[{ value: "list", label: "Lista", icon: <List className="h-3.5 w-3.5" /> }, { value: "board", label: "Quadro", icon: <Columns3 className="h-3.5 w-3.5" /> }]} />
          </div>
        </div>
        {view === "list" ? (
          <Tabs className="mt-2" value={group} onChange={(g) => setParam("group", g === "all" ? null : g)} items={WORK_GROUPS.map((g) => ({ value: g.value, label: g.label, count: counts[g.value] }))} />
        ) : (
          <div className="h-3" />
        )}
      </header>

      {view === "list" ? (
        shown.length === 0 ? (
          <div className="flex-1 bg-[var(--surface)]">
            <EmptyState
              title={jobs.length ? "Nenhum trabalho corresponde aos filtros" : "Ainda não existem trabalhos"}
              detail={group === "unassigned" ? "Todos os trabalhos atuais têm recursos atribuídos." : jobs.length || nActive || filters.q ? "Ajuste a pesquisa ou limpe os filtros." : "Crie um trabalho para começar."}
              action={!nActive && !filters.q && group === "all" ? <Button variant="primary" onClick={() => ed.openJob()}>Novo trabalho</Button> : undefined}
            />
          </div>
        ) : (
          <WorkList jobs={shown} selectedId={openId} onOpen={open} ctx={ctx} />
        )
      ) : (
        <WorkBoard jobs={shown} onOpen={open} selectedId={openId} ctx={ctx} />
      )}

      {openId ? <JobDrawer jobId={openId} onClose={() => setParam("job", null)} /> : null}
    </div>
  );
}
