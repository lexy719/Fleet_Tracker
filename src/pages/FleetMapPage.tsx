import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, Layers, MapPinned, Package, Radio, Signal } from "lucide-react";
import { FleetMap } from "../components/map/FleetMap";
import { MapObjectsPanel } from "../components/map/MapObjectsPanel";
import { MapUtilitiesPanel } from "../components/map/MapUtilitiesPanel";
import { useFleetData } from "../context/FleetDataContext";
import { useJobs } from "../context/JobsContext";
import { drivers, getRouteById, getTrailEventsForTruck, routes } from "../data/mockData";
import { dispatchCargoUrl, dispatchUrl, jobsUrl } from "../lib/appLinks";
import { primaryOperationalJob } from "../lib/jobOperational";
import { loadFleetMapPrefs, saveFleetMapPrefs } from "../lib/fleetMapPrefs";
import { trucks as fleetTrucks } from "../data/mockData";

function isValidTruckId(id: string | null): id is string {
  return !!id && fleetTrucks.some((t) => t.id === id);
}

export function FleetMapPage() {
  const { trucksLive } = useFleetData();
  const { jobs, getJob } = useJobs();
  const [searchParams, setSearchParams] = useSearchParams();

  const [visible, setVisible] = useState<Record<string, boolean>>(() => loadFleetMapPrefs().visible ?? {});
  const [panelOpen, setPanelOpen] = useState(() => loadFleetMapPrefs().panelOpen ?? true);

  useEffect(() => {
    saveFleetMapPrefs({ visible, panelOpen });
  }, [visible, panelOpen]);

  const [selected, setSelected] = useState<string | null>(() => {
    const jobId = searchParams.get("job");
    if (jobId) {
      const j = getJob(jobId);
      if (j?.assignedTruckId && isValidTruckId(j.assignedTruckId)) return j.assignedTruckId;
    }
    const t = searchParams.get("truck");
    return isValidTruckId(t) ? t : null;
  });

  useEffect(() => {
    const jobId = searchParams.get("job");
    const truckParam = searchParams.get("truck");

    if (jobId) {
      const j = getJob(jobId);
      if (j?.assignedTruckId && isValidTruckId(j.assignedTruckId)) {
        setSelected(j.assignedTruckId);
        if (truckParam !== j.assignedTruckId) {
          setSearchParams(
            (prev) => {
              const n = new URLSearchParams(prev);
              n.set("truck", j.assignedTruckId!);
              n.set("job", jobId);
              return n;
            },
            { replace: true },
          );
        }
        return;
      }
    }

    if (isValidTruckId(truckParam)) {
      setSelected(truckParam);
      return;
    }

    setSelected(null);
  }, [searchParams, setSearchParams]);

  const setSelectedTruck = useCallback(
    (id: string | null) => {
      setSelected(id);
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (id) {
            n.set("truck", id);
            const jobId = n.get("job");
            if (jobId) {
              const j = getJob(jobId);
              if (!j || j.assignedTruckId !== id) n.delete("job");
            }
          } else {
            n.delete("truck");
            n.delete("job");
          }
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const jobParam = searchParams.get("job");
  const jobFromUrl = jobParam ? getJob(jobParam) : undefined;
  const highlightedJobId =
    jobFromUrl && jobFromUrl.assignedTruckId && jobFromUrl.assignedTruckId === selected ? jobParam : null;
  const unassignedJobBanner =
    jobParam && jobFromUrl && !jobFromUrl.assignedTruckId ? { id: jobParam, job: jobFromUrl } : null;

  const toggleVisible = useCallback((id: string) => {
    setVisible((v) => ({ ...v, [id]: v[id] === false ? true : false }));
  }, []);

  const filteredTrucks = useMemo(
    () => trucksLive.filter((t) => visible[t.id] !== false),
    [trucksLive, visible],
  );

  const truck = useMemo(
    () => trucksLive.find((t) => t.id === selected) ?? null,
    [trucksLive, selected],
  );
  const primaryJobOnTruck = useMemo(
    () => (selected ? primaryOperationalJob(jobs, selected) : undefined),
    [jobs, selected],
  );
  const route = truck?.routeId ? getRouteById(truck.routeId) : undefined;
  const driver = useMemo(() => {
    if (!truck) return undefined;
    if (primaryJobOnTruck?.assignedDriverId) {
      return drivers.find((x) => x.id === primaryJobOnTruck.assignedDriverId);
    }
    // Idle trucks have no driver until a job is dispatched
    return undefined;
  }, [truck, primaryJobOnTruck]);
  const driverAttribution = useMemo<"job" | "truck" | null>(() => {
    if (!truck) return null;
    if (primaryJobOnTruck?.assignedDriverId) {
      const d = drivers.find((x) => x.id === primaryJobOnTruck.assignedDriverId);
      if (d) return "job";
    }
    return null;
  }, [truck, primaryJobOnTruck]);
  const events = truck ? getTrailEventsForTruck(truck.id) : [];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="relative z-[600] shrink-0 border-b px-4 py-3 md:px-6"
        style={{ background: "var(--app-card)", borderColor: "var(--app-border)" }}
      >
        {unassignedJobBanner ? (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[12px]"
            style={{ borderColor: "#C8A049", background: "rgba(200,160,73,0.12)", color: "var(--app-fg)" }}
          >
            <span>
              Trabalho <span className="font-mono font-semibold">{unassignedJobBanner.id}</span> ainda sem viatura atribuída —
              abra o quadro ou o dispatch para atribuir.
            </span>
            <Link
              to={jobsUrl(unassignedJobBanner.id)}
              className="shrink-0 font-semibold text-[#2D5F4E] hover:underline"
            >
              Ir para trabalhos →
            </Link>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex"
              style={{ background: "#E8F0EC" }}
            >
              <MapPinned className="h-5 w-5" style={{ color: "#2D5F4E" }} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--app-muted)" }}>
                Península · tempo real
              </p>
              <h1 className="text-[16px] font-bold leading-tight tracking-tight" style={{ color: "var(--app-fg)" }}>
                Mapa da frota
              </h1>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-muted)" }}>
                Viaturas e rotas — mesmos dados que{" "}
                <Link to="/app/jobs" className="font-semibold text-[#2D5F4E] hover:underline">
                  trabalhos
                </Link>{" "}
                e{" "}
                <Link to="/app/dispatch" className="font-semibold text-[#2D5F4E] hover:underline">
                  dispatch
                </Link>
                . Legenda e tráfego no canto inferior esquerdo do mapa.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div
              className="hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              style={{ borderColor: "var(--app-border)", color: "#2D5F4E" }}
            >
              <Signal className="h-3 w-3" />
              Live
            </div>

            <div className="hidden text-right sm:block">
              <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--app-fg)" }}>
                {filteredTrucks.length}
              </span>
              <span className="ml-1 text-[10px]" style={{ color: "var(--app-muted)" }}>
                visíveis
              </span>
            </div>

            <div className="hidden h-4 w-px sm:block" style={{ background: "var(--app-border)" }} />

            <Link
              to={dispatchUrl(selected ?? undefined)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--app-fg)] transition hover:opacity-90"
            >
              <Radio className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Dispatch</span>
            </Link>

            <Link
              to="/app/jobs"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--app-fg)] transition hover:opacity-90"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Trabalhos</span>
            </Link>

            <Link
              to={dispatchCargoUrl(selected ?? undefined)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ background: "#2D5F4E" }}
            >
              <Package className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Carga</span>
            </Link>

            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="hidden lg:inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
              style={{
                borderColor: "var(--app-border)",
                background: panelOpen ? "#E8F0EC" : "var(--app-elevated)",
                color: panelOpen ? "#2D5F4E" : "var(--app-fg)",
              }}
            >
              <Layers className="h-3.5 w-3.5" />
              {panelOpen ? "Ocultar" : "Mostrar"} lista
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {panelOpen && (
          <div
            className="order-2 flex min-h-0 max-h-[42vh] w-full shrink-0 flex-col border-r lg:order-1 lg:max-h-none lg:w-[280px] xl:w-[300px]"
            style={{
              background: "var(--app-card)",
              borderColor: "var(--app-border)",
              boxShadow: "2px 0 8px rgba(0,0,0,0.04)",
            }}
          >
            <MapObjectsPanel
              trucks={trucksLive}
              selectedId={selected}
              onSelect={setSelectedTruck}
              visible={visible}
              onToggleVisible={toggleVisible}
            />
          </div>
        )}

        <div className="relative order-1 min-h-[280px] flex-1 lg:order-2">
          <FleetMap
            trucks={filteredTrucks}
            routes={routes}
            selectedTruckId={selected}
            onSelectTruck={setSelectedTruck}
            className="absolute inset-0 h-full w-full"
            embed
          />
        </div>

        {truck ? (
          <div
            className="hidden min-h-0 w-[min(100%,380px)] shrink-0 flex-col border-l lg:flex xl:w-[400px]"
            style={{
              background: "var(--app-card)",
              borderColor: "var(--app-border)",
              boxShadow: "-2px 0 12px rgba(0,0,0,0.04)",
            }}
          >
            <MapUtilitiesPanel
              truck={truck}
              route={route}
              driver={driver}
              driverAttribution={driverAttribution}
              events={events}
              onClose={() => setSelectedTruck(null)}
              truckId={truck.id}
              driverId={driver?.id}
              highlightedJobId={highlightedJobId}
            />
          </div>
        ) : null}
      </div>

      {truck ? (
        <div
          className="shrink-0 border-t lg:hidden"
          style={{
            maxHeight: "45vh",
            borderColor: "var(--app-border)",
            background: "var(--app-card)",
            overflowY: "auto",
          }}
        >
          <MapUtilitiesPanel
            truck={truck}
            route={route}
            driver={driver}
            driverAttribution={driverAttribution}
            events={events}
            onClose={() => setSelectedTruck(null)}
            truckId={truck.id}
            driverId={driver?.id}
            highlightedJobId={highlightedJobId}
          />
        </div>
      ) : null}
    </div>
  );
}
