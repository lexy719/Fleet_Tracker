/**
 * DispatchPage — three-pane TMS dispatch layout
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │  PageHeader: KPIs + "Nova entrega" button                            │
 *  ├──────────────┬──────────────────────────────────┬────────────────────┤
 *  │ Left (280px) │  Map  (RoutePlannerMap)           │ Right (380px)      │
 *  │              │                                   │                    │
 *  │ Job pipeline │  → auto-fits to selected job      │ JobRoutePlanner    │
 *  │ "A planear"  │    stop markers + TomTom routes   │ when job selected  │
 *  │ "Atribuídos" │                                   │                    │
 *  │              │  Empty state overlay when idle    │ Empty state guide  │
 *  └──────────────┴──────────────────────────────────┴────────────────────┘
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Loader2, Plus, Route } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { CargoLoadingPanel } from "../components/dispatch/CargoLoadingPanel";
import { UnassignedJobsPanel } from "../components/dispatch/UnassignedJobsPanel";
import { JobRoutePlanner } from "../components/dispatch/JobRoutePlanner";
import { PageHeader } from "../components/layout/PageHeader";
import { NewJobModal } from "../components/jobs/NewJobModal";
import { RoutePlannerMap, type RouteMapMarker } from "../components/routes/RoutePlannerMap";
import { useJobs } from "../context/JobsContext";
import type { RoutePlanOption, RouteOptionId } from "../tomtom/planRoutes";

/* ── Page ─────────────────────────────────────────────── */
export function DispatchPage() {
  const { jobs, getJob } = useJobs();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "cargo" ? "cargo" : "dispatch";

  /* ── Selected job / map state ─────────────────────── */
  const [selectedJobId,    setSelectedJobId]    = useState<string | null>(null);
  const [routeOptions,     setRouteOptions]     = useState<RoutePlanOption[]>([]);
  const [selectedRouteId,  setSelectedRouteId]  = useState<RouteOptionId | null>(null);
  const [hoveredRouteId,   setHoveredRouteId]   = useState<RouteOptionId | null>(null);
  const [mapMarkers,       setMapMarkers]       = useState<RouteMapMarker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [showNewJob,          setShowNewJob]          = useState(false);
  const [confirmToast,        setConfirmToast]        = useState<string | null>(null);
  const [calculatingRoutes,   setCalculatingRoutes]   = useState(false);

  /* ── KPIs ─────────────────────────────────────────── */
  const kpiBacklog   = useMemo(() => jobs.filter((j) => j.status === "backlog").length,  [jobs]);
  const kpiTransit   = useMemo(() => jobs.filter((j) => j.status === "in_transit").length, [jobs]);
  const kpiAtRisk    = useMemo(
    () => jobs.filter(
      (j) => (j.slaStatus === "breached" || j.slaStatus === "at_risk") &&
              !["delivered", "invoiced", "cancelled"].includes(j.status),
    ).length,
    [jobs],
  );

  /* ── Toast auto-dismiss ───────────────────────────── */
  useEffect(() => {
    if (!confirmToast) return;
    const id = window.setTimeout(() => setConfirmToast(null), 6_000);
    return () => window.clearTimeout(id);
  }, [confirmToast]);

  /* ── Handlers ─────────────────────────────────────── */
  const handleJobSelect = useCallback(
    (jobId: string) => {
      // If tapping the already-selected job → deselect
      if (jobId === selectedJobId) {
        setSelectedJobId(null);
        setRouteOptions([]);
        setMapMarkers([]);
        setSelectedRouteId(null);
        setCalculatingRoutes(false);
        return;
      }
      setSelectedJobId(jobId);
      setRouteOptions([]);
      setSelectedRouteId(null);
      setHoveredRouteId(null);
      setMapMarkers([]);
      setCalculatingRoutes(false);
    },
    [selectedJobId],
  );

  const handleRoutesReady = useCallback(
    (options: RoutePlanOption[], selId: RouteOptionId | null, markers: RouteMapMarker[]) => {
      setRouteOptions(options);
      setSelectedRouteId(selId);
      setMapMarkers(markers);
      // Hide the "calculating" overlay once routes (or an empty set with markers) arrives
      if (markers.length > 0 && options.length === 0) setCalculatingRoutes(true);
      else setCalculatingRoutes(false);
    },
    [],
  );

  const handleRouteSelect = useCallback((id: RouteOptionId) => {
    setSelectedRouteId(id);
  }, []);

  const handleConfirmed = useCallback(() => {
    const jId = selectedJobId;
    setSelectedJobId(null);
    setRouteOptions([]);
    setMapMarkers([]);
    setSelectedRouteId(null);
    setHoveredRouteId(null);
    setCalculatingRoutes(false);
    if (jId) setConfirmToast(jId);
  }, [selectedJobId]);

  const handleClose = useCallback(() => {
    setSelectedJobId(null);
    setRouteOptions([]);
    setMapMarkers([]);
    setSelectedRouteId(null);
    setHoveredRouteId(null);
    setCalculatingRoutes(false);
  }, []);

  /* ── Active job for planner ───────────────────────── */
  const selectedJob = selectedJobId ? (getJob(selectedJobId) ?? null) : null;

  /* ── Render ───────────────────────────────────────── */
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[var(--workspace-bg)]">

      {/* Header */}
      <PageHeader
        eyebrow="Operações"
        title="Expedição"
        subtitle="Selecione um trabalho, escolha a viatura e o motorista, e confirme a rota."
        stats={[
          { label: "Por expedir",    value: String(kpiBacklog)  },
          { label: "Em viagem",      value: String(kpiTransit)  },
          { label: "Prazo em risco", value: String(kpiAtRisk)   },
        ]}
        action={
          <div className="flex items-center gap-2">
            {/* Tab switcher */}
            <div
              className="flex items-center rounded-xl border p-0.5"
              style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
            >
              <button
                type="button"
                onClick={() => setSearchParams({})}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition"
                style={
                  activeTab === "dispatch"
                    ? { background: "#2D5F4E", color: "#fff" }
                    : { color: "var(--app-muted)" }
                }
              >
                <Route className="h-3.5 w-3.5" />
                Expedição
              </button>
              <button
                type="button"
                onClick={() => setSearchParams({ tab: "cargo" })}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition"
                style={
                  activeTab === "cargo"
                    ? { background: "#2D5F4E", color: "#fff" }
                    : { color: "var(--app-muted)" }
                }
              >
                <Layers className="h-3.5 w-3.5" />
                Carga LIFO
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowNewJob(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ background: "#2D5F4E" }}
            >
              <Plus className="h-3.5 w-3.5" />
              Nova entrega
            </button>
          </div>
        }
      />

      {/* Confirmation toast */}
      {confirmToast && (
        <div
          className="pointer-events-auto fixed bottom-4 left-1/2 z-[300] flex max-w-[min(100%,420px)] -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-3 text-[13px] shadow-xl"
          style={{ background: "var(--app-card)", borderColor: "#2D5F4E60" }}
          role="status"
        >
          <span className="text-xl">✅</span>
          <div>
            <span className="font-semibold text-[#2D5F4E]">Rota confirmada · </span>
            <span className="font-mono font-semibold">{confirmToast}</span>
            <p className="text-[11px] text-[var(--app-muted)]">
              Trabalho atribuído e rota guardada com sucesso.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmToast(null)}
            className="ml-auto shrink-0 rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-1.5 text-xs font-semibold hover:opacity-80"
          >
            OK
          </button>
        </div>
      )}

      {/* ── Cargo LIFO tab ───────────────────────────────── */}
      {activeTab === "cargo" && (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <CargoLoadingPanel />
        </div>
      )}

      {/* ── Three-pane body ──────────────────────────────── */}
      {activeTab === "dispatch" && <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* ── Left: job pipeline ──────────────────────── */}
        <div className="hidden w-[260px] shrink-0 border-r border-[var(--app-border)] lg:flex lg:flex-col xl:w-[280px]">
          <UnassignedJobsPanel
            selectedJobId={selectedJobId}
            onJobSelect={handleJobSelect}
          />
        </div>

        {/* ── Center: map ─────────────────────────────── */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="box-border flex h-full min-h-0 flex-1 flex-col p-3 sm:p-4">
            <RoutePlannerMap
              className="min-h-[320px] flex-1 lg:min-h-0"
              options={routeOptions}
              selectedId={selectedRouteId}
              hoveredRouteId={hoveredRouteId}
              onRouteHover={setHoveredRouteId}
              onRouteLineClick={setSelectedRouteId}
              markers={mapMarkers}
              cargoByStopId={{}}
              selectedMarkerId={selectedMarkerId}
              onMarkerClick={setSelectedMarkerId}
              comparisonSheetInset="none"
            />
          </div>

          {/* Empty-state overlay — no job selected (always light chrome; matches ThemeProvider) */}
          {!selectedJobId && (
            <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center p-4">
              <div
                className="max-w-[min(100%,280px)] rounded-2xl border px-5 py-5 text-center shadow-md"
                style={{
                  background: "var(--app-card)",
                  borderColor: "var(--app-border)",
                  boxShadow: "0 8px 30px rgba(26, 26, 26, 0.08)",
                }}
              >
                <div
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ background: "var(--shell-nav-active-bg, #E8F0EC)" }}
                >
                  <Route className="h-6 w-6" style={{ color: "#2D5F4E" }} />
                </div>
                <p className="mt-3 text-sm font-semibold text-[var(--app-fg)]">
                  Selecione um trabalho para planear a rota
                </p>
                <p className="mt-1.5 text-[12px] leading-snug text-[var(--app-muted)]">
                  Clique em «Planear rota» no painel esquerdo
                </p>
              </div>
            </div>
          )}

          {/* Calculating overlay — markers on map, waiting for TomTom routes */}
          {calculatingRoutes && selectedJobId && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
              <div
                className="flex items-center gap-2 rounded-2xl border px-4 py-2.5 shadow-md"
                style={{
                  background: "var(--app-card)",
                  borderColor: "var(--app-border)",
                  boxShadow: "0 4px 20px rgba(26, 26, 26, 0.07)",
                }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#2D5F4E" }} />
                <span className="text-[12px] font-semibold" style={{ color: "#2D5F4E" }}>
                  A calcular rotas TomTom…
                </span>
              </div>
            </div>
          )}

          {/* Mobile job pipeline — shown below map on small screens */}
          <div className="shrink-0 border-t border-[var(--app-border)] lg:hidden">
            <div className="max-h-[40vh] overflow-y-auto">
              <UnassignedJobsPanel
                selectedJobId={selectedJobId}
                onJobSelect={handleJobSelect}
              />
            </div>
          </div>
        </div>

        {/* ── Right: job route planner ─────────────────── */}
        <div className="hidden w-[360px] shrink-0 border-l border-[var(--app-border)] lg:flex lg:flex-col xl:w-[390px]">
          {selectedJob ? (
            <JobRoutePlanner
              key={selectedJobId!}
              job={selectedJob}
              onRoutesReady={handleRoutesReady}
              onRouteSelect={handleRouteSelect}
              onClose={handleClose}
              onConfirmed={handleConfirmed}
            />
          ) : (
            /* Empty state — right panel */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: "#E8F0EC" }}
              >
                <Route className="h-7 w-7" style={{ color: "#2D5F4E" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--app-fg)]">Planeador de rotas</p>
                <p className="mt-1 text-[11px] text-[var(--app-muted)]">
                  Selecione um trabalho no painel esquerdo para calcular rotas TomTom, validar HOS UE
                  e atribuir viatura + motorista.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewJob(true)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-[#2D5F4E] px-3 py-2 text-[12px] font-semibold text-[#2D5F4E] transition hover:bg-[#E8F0EC]"
              >
                <Plus className="h-3.5 w-3.5" />
                Criar nova entrega
              </button>
            </div>
          )}
        </div>
      </div>}

      {showNewJob && <NewJobModal onClose={() => setShowNewJob(false)} />}
    </div>
  );
}
