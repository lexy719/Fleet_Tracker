import clsx from "clsx";
import { CalendarRange, Map as MapIcon, PanelRightClose, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AutomaticJobPlanner } from "../components/dispatch/AutomaticJobPlanner";
import { RoutePlannerMap, type RouteMapMarker } from "../components/routes/RoutePlannerMap";
import { useFleetData } from "../context/FleetDataContext";
import { useJobs } from "../context/JobsContext";
import type { Job } from "../data/types";
import { isoToLocalDate } from "../domain/time";
import type { RoutePlanOption, RouteOptionId } from "../tomtom/planRoutes";
import { fmtTonnes, stopWindowText } from "../ui/format";
import { Button, Drawer, EmptyState, IconButton, Notice, PageHeader, Segmented, StatusBadge } from "../ui/kit";
import { useEditors } from "../ui/shell/editors";
import { JOB_STATUS, PLAN_STATUS } from "../ui/status";
import { dispatchQueue } from "../ui/dispatchModel";
import { firstStop, jobAnchor, lastStop } from "../ui/work/workModel";

type Day = "today" | "tomorrow" | "all" | "date";

const MAP_PREF = "fleetos.dispatch.map";
function readMapPref(): boolean {
  try {
    return localStorage.getItem(MAP_PREF) !== "hidden";
  } catch {
    return true;
  }
}

function QueueRow({ job, selected, onSelect, truckPlate }: { job: Job; selected: boolean; onSelect: () => void; truckPlate?: string }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected}
        className={clsx("block w-full border-l-2 px-4 py-2 text-left transition-colors duration-150", selected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-transparent hover:bg-[var(--surface-2)]")}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="num text-[13px] font-medium text-[var(--text)]">{job.jobNumber}</span>
          {job.planStatus === "REPLAN_REQUIRED" ? <StatusBadge status={PLAN_STATUS.REPLAN_REQUIRED} className="text-[11.5px]" /> : <StatusBadge status={JOB_STATUS[job.status]} className="text-[11.5px]" />}
        </div>
        <p className="truncate text-[12.5px] text-[var(--text)]">{firstStop(job)?.city ?? "—"} → {lastStop(job)?.city ?? "—"}</p>
        <p className="num flex justify-between gap-2 truncate text-[11.5px] text-[var(--text-3)]">
          <span className="truncate">{stopWindowText(firstStop(job))}</span>
          <span className="shrink-0">{fmtTonnes(job.totalWeightKg)}{truckPlate ? ` · ${truckPlate}` : ""}</span>
        </p>
      </button>
    </li>
  );
}

function QueueSection({ title, jobs, selectedId, onSelect, empty }: { title: string; jobs: Job[]; selectedId: string | null; onSelect: (id: string) => void; empty: string }) {
  const { getTruck } = useFleetData();
  return (
    <section>
      <h2 className="sticky top-0 z-[1] flex h-8 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)] px-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">
        {title}
        <span className="num font-normal">{jobs.length}</span>
      </h2>
      {jobs.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-[var(--text-3)]">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {jobs.map((j) => <QueueRow key={j.id} job={j} selected={j.id === selectedId} onSelect={() => onSelect(j.id)} truckPlate={getTruck(j.assignedTruckId)?.plate} />)}
        </ul>
      )}
    </section>
  );
}

export function DispatchPage() {
  const { jobs, getJob } = useJobs();
  const ed = useEditors();
  const [params, setParams] = useSearchParams();
  const selectedJobId = params.get("job");
  const day = (params.get("day") as Day) || "all";
  const [nowMs] = useState(() => Date.now());
  const pickedDate = params.get("date") ?? isoToLocalDate(nowMs);
  const [routeOptions, setRouteOptions] = useState<RoutePlanOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<RouteOptionId | null>(null);
  const [hoveredRouteId, setHoveredRouteId] = useState<RouteOptionId | null>(null);
  const [mapMarkers, setMapMarkers] = useState<RouteMapMarker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(readMapPref);
  const [wideMap, setWideMap] = useState(() => window.matchMedia("(min-width: 1280px)").matches);
  const [mapOverlayOpen, setMapOverlayOpen] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => setWideMap(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(MAP_PREF, showMap ? "shown" : "hidden");
    } catch {
      /* preference only */
    }
  }, [showMap]);

  const setParam = useCallback((k: string, v: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }), [setParams]);

  const inDay = useCallback(
    (j: Job) => {
      if (day === "all") return true;
      const target = day === "today" ? isoToLocalDate(nowMs) : day === "tomorrow" ? isoToLocalDate(nowMs + 86_400_000) : pickedDate;
      return isoToLocalDate(jobAnchor(j)) === target;
    },
    [day, pickedDate, nowMs],
  );

  const q = useMemo(() => {
    const scoped = jobs.filter(inDay).sort((a, b) => jobAnchor(a) - jobAnchor(b));
    return dispatchQueue(scoped);
  }, [jobs, inDay]);

  const resetMap = () => {
    setRouteOptions([]);
    setSelectedRouteId(null);
    setHoveredRouteId(null);
    setMapMarkers([]);
  };
  const select = (id: string) => {
    resetMap();
    setConfirmed(null);
    setParam("job", id === selectedJobId ? null : id);
  };
  const handleRoutesReady = useCallback((options: RoutePlanOption[], selId: RouteOptionId | null, markers: RouteMapMarker[]) => {
    setRouteOptions(options);
    setSelectedRouteId(selId);
    setMapMarkers(markers);
  }, [setRouteOptions, setSelectedRouteId, setMapMarkers]);

  const selectedJob = selectedJobId ? getJob(selectedJobId) ?? null : null;
  const plannable = selectedJob && ["backlog", "queued", "assigned"].includes(selectedJob.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Expedição"
        meta={`${q.toPlan.length} por planear · ${q.replan.length} a replanear`}
        actions={
          <>
            <Segmented
              label="Dia"
              value={day}
              onChange={(d) => setParam("day", d === "all" ? null : d)}
              items={[
                { value: "today", label: "Hoje" },
                { value: "tomorrow", label: "Amanhã" },
                { value: "date", label: "Data", icon: <CalendarRange className="h-3.5 w-3.5" /> },
                { value: "all", label: "Todos" },
              ]}
            />
            {day === "date" ? <input type="date" aria-label="Data" className="ui-input w-[150px]" value={pickedDate} onChange={(e) => setParam("date", e.target.value)} /> : null}
            {!showMap || !wideMap ? <Button variant="ghost" icon={<MapIcon className="h-3.5 w-3.5" />} onClick={() => wideMap ? setShowMap(true) : setMapOverlayOpen(true)} data-testid="show-map">Mapa</Button> : null}
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        {/* Queue */}
        <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] 2xl:w-[300px]" data-testid="dispatch-queue">
          {confirmed ? (
            <div className="border-b border-[var(--border)] p-3">
              <Notice tone="ok" title={`Rota confirmada · ${confirmed}`} action={<button type="button" aria-label="Fechar" onClick={() => setConfirmed(null)} className="p-1 text-[var(--text-3)]"><X className="h-3.5 w-3.5" /></button>}>
                Trabalho atribuído e decisão de rota guardada.
              </Notice>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            <QueueSection title="Por planear" jobs={q.toPlan} selectedId={selectedJobId} onSelect={select} empty="Sem trabalhos por planear neste período." />
            <QueueSection title="A replanear" jobs={q.replan} selectedId={selectedJobId} onSelect={select} empty="Nenhum plano por rever." />
          </div>
        </div>

        {/* Planner */}
        <div className="flex min-w-[560px] flex-[1.25] flex-col border-r border-[var(--border)] bg-[var(--surface)]" data-testid="dispatch-decision">
          {selectedJob && plannable ? (
            <AutomaticJobPlanner
              key={selectedJob.id + ":" + selectedJob.revision}
              job={selectedJob}
              onRoutesReady={handleRoutesReady}
              onRouteSelect={setSelectedRouteId}
              requestedRouteId={selectedRouteId}
              onClose={() => (resetMap(), setParam("job", null))}
              onConfirmed={() => {
                setConfirmed(selectedJob.jobNumber);
                resetMap();
                setParam("job", null);
              }}
            />
          ) : selectedJob ? (
            <EmptyState title={`${selectedJob.jobNumber} está «${JOB_STATUS[selectedJob.status].label}»`} detail="Só trabalhos por atribuir, na fila ou atribuídos podem ser (re)planeados. A execução acompanha-se na área do trabalho." />
          ) : (
            <EmptyState
              title="Selecione um trabalho"
              detail="Escolha um trabalho da fila para obter um plano automático, verificar os recursos e confirmar."
              action={<Button onClick={() => ed.openJob()}>Novo trabalho</Button>}
            />
          )}
        </div>

        {/* Map — supporting, collapsible; yields first on narrow screens */}
        {showMap && wideMap ? (
          <div className="relative flex min-w-[300px] flex-1 flex-col" data-testid="dispatch-map">
            <div className="relative min-h-0 flex-1 p-3">
              <RoutePlannerMap
                className="h-full"
                options={routeOptions}
                selectedId={selectedRouteId}
                hoveredRouteId={hoveredRouteId}
                onRouteHover={setHoveredRouteId}
                onRouteLineClick={setSelectedRouteId}
                markers={mapMarkers}
                selectedMarkerId={selectedMarkerId}
                onMarkerClick={setSelectedMarkerId}
                comparisonSheetInset="none"
              />
              <IconButton label="Ocultar mapa" onClick={() => setShowMap(false)} className="absolute right-5 top-5 z-[500] bg-[var(--surface)] shadow-[var(--shadow-sm)]" data-testid="hide-map">
                <PanelRightClose className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        ) : null}
      </div>
      {!wideMap && mapOverlayOpen ? (
        <Drawer title="Mapa da rota" width={720} onClose={() => setMapOverlayOpen(false)}>
          <div className="h-[calc(100vh-120px)] p-3">
            <RoutePlannerMap className="h-full" options={routeOptions} selectedId={selectedRouteId} hoveredRouteId={hoveredRouteId} onRouteHover={setHoveredRouteId} onRouteLineClick={setSelectedRouteId} markers={mapMarkers} selectedMarkerId={selectedMarkerId} onMarkerClick={setSelectedMarkerId} comparisonSheetInset="none" />
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
