import { Ban, ChevronLeft, ExternalLink, MapPin, Play, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { STATUS_LABELS, useJobs } from "../../context/JobsContext";
import type { Driver, Route as FleetRoute, Truck, VehicleTrailEvent } from "../../data/types";
import { dispatchCargoUrl, dispatchUrl, driversUrl, fleetUrl, jobsUrl, mapUrl } from "../../lib/appLinks";
import { operationalJobsForTruckSorted } from "../../lib/jobOperational";
import { Badge } from "../ui/Badge";

function EventIcon({ kind }: { kind: VehicleTrailEvent["kind"] }) {
  if (kind === "ignition_off") return <Ban className="h-4 w-4" style={{ color: "#A84432" }} />;
  if (kind === "stop") return <MapPin className="h-4 w-4" style={{ color: "#8B6F47" }} />;
  return <Play className="h-4 w-4" style={{ color: "#2D5F4E" }} />;
}

function eventLabel(kind: VehicleTrailEvent["kind"]) {
  if (kind === "ignition_off") return "Ignição desligada";
  if (kind === "stop") return "Paragem";
  return "Em movimento";
}

export function MapUtilitiesPanel({
  truck,
  route,
  driver,
  driverAttribution = null,
  events,
  onClose,
  truckId,
  driverId,
  highlightedJobId,
}: {
  truck: Truck | null;
  route?: FleetRoute;
  driver?: Driver;
  /** De onde vem o nome do motorista: trabalho em curso (dispatch) ou viatura (telemática). */
  driverAttribution?: "job" | "truck" | null;
  events: VehicleTrailEvent[];
  onClose: () => void;
  truckId: string;
  driverId?: string;
  /** Deep link `?job=` — highlight when it belongs to this truck. */
  highlightedJobId?: string | null;
}) {
  const { jobs, getJob } = useJobs();
  const highlightJob = highlightedJobId ? getJob(highlightedJobId) : undefined;
  const jobRows = useMemo(() => operationalJobsForTruckSorted(jobs, truckId), [jobs, truckId]);
  const [searchQ, setSearchQ] = useState("");

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col border-l lg:w-[340px] xl:w-[380px]"
      style={{ background: "var(--app-card)", borderColor: "var(--app-border)" }}
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b px-3 py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium transition hover:opacity-70"
          style={{ color: "var(--app-muted)" }}
        >
          <ChevronLeft className="h-4 w-4" />
          Fechar
        </button>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-muted)" }}>
          Detalhe
        </span>
      </div>

      <div className="shrink-0 border-b p-3" style={{ borderColor: "var(--app-border)" }}>
        <div
          className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--app-muted)" }} />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Filtrar trabalhos, paragens…"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--app-fg)" }}
          />
          {searchQ && (
            <button type="button" onClick={() => setSearchQ("")} className="shrink-0 opacity-50 hover:opacity-100">
              <X className="h-3.5 w-3.5" style={{ color: "var(--app-muted)" }} />
            </button>
          )}
        </div>
      </div>

      {!truck ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px]" style={{ color: "var(--app-muted)" }}>
          Escolha uma viatura no mapa ou na lista à esquerda.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <div className="border-b p-4" style={{ borderColor: "var(--app-border)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold" style={{ color: "var(--app-fg)" }}>
                {truck.plate}
              </h2>
              <Badge variant="muted" className="capitalize">
                {truck.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="mt-1 text-[13px]" style={{ color: "var(--app-muted)" }}>
              {truck.name}
            </p>
            {driver && (
              <p className="mt-2 text-[12px]" style={{ color: "var(--app-muted)" }}>
                {driverAttribution === "job" ? "Motorista (dispatch)" : "Motorista"}{" "}
                ·{" "}
                {driverId ? (
                  <Link to={driversUrl(driverId)} className="font-semibold text-[#2D5F4E] hover:underline">
                    {driver.name}
                  </Link>
                ) : (
                  <span className="font-semibold" style={{ color: "var(--app-fg)" }}>
                    {driver.name}
                  </span>
                )}
              </p>
            )}
            {route && (
              <p className="mt-2 text-[12px]" style={{ color: "var(--app-muted)" }}>
                {route.name} · ETA {route.etaDestination}
                {route.delayMin > 0 && <span style={{ color: "#8B6F47" }}> · +{route.delayMin} min</span>}
              </p>
            )}

            {highlightJob && highlightJob.assignedTruckId === truckId ? (
              <div
                className="mt-3 rounded-xl border-2 px-3 py-2.5"
                style={{ borderColor: "#2D5F4E", background: "rgba(45,95,78,0.08)" }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#2D5F4E]">Trabalho em foco (ligação partilhada)</p>
                <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--app-fg)" }}>
                  {highlightJob.id} · {highlightJob.client}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-muted)" }}>
                  {STATUS_LABELS[highlightJob.status]}
                </p>
                <Link
                  to={jobsUrl(highlightJob.id)}
                  className="mt-2 inline-block text-[11px] font-semibold text-[#2D5F4E] hover:underline"
                >
                  Abrir no quadro de trabalhos →
                </Link>
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div
                className="rounded-lg border p-2"
                style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
              >
                <div style={{ color: "var(--app-muted)" }}>Lat</div>
                <div className="font-mono font-semibold" style={{ color: "var(--app-fg)" }}>
                  {truck.lat.toFixed(5)}
                </div>
              </div>
              <div
                className="rounded-lg border p-2"
                style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
              >
                <div style={{ color: "var(--app-muted)" }}>Lng</div>
                <div className="font-mono font-semibold" style={{ color: "var(--app-fg)" }}>
                  {truck.lng.toFixed(5)}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to={dispatchUrl(truckId)}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
                style={{ borderColor: "var(--app-border)", color: "var(--app-fg)" }}
              >
                <ExternalLink className="h-3 w-3" />
                Dispatch
              </Link>
              <Link
                to={dispatchCargoUrl(truckId)}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
                style={{ borderColor: "var(--app-border)", color: "var(--app-fg)" }}
              >
                Carga LIFO
              </Link>
              <Link
                to={fleetUrl(truckId)}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90"
                style={{ background: "#2D5F4E" }}
              >
                Frota / IPO
              </Link>
            </div>

            {jobRows.length > 0 ? (
              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--app-muted)]">
                  Trabalhos em curso
                </p>
                {(() => {
                  const q = searchQ.trim().toLowerCase();
                  const filtered = q
                    ? jobRows.filter(
                        (j) =>
                          j.id.toLowerCase().includes(q) ||
                          j.client.toLowerCase().includes(q) ||
                          j.stops.some((s) => s.city.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)),
                      )
                    : jobRows;
                  if (filtered.length === 0) {
                    return (
                      <p className="mt-2 text-[11px]" style={{ color: "var(--app-muted)" }}>
                        Nenhum trabalho encontrado para &quot;{searchQ}&quot;.
                      </p>
                    );
                  }
                  return (
                    <ul className="mt-2 space-y-1">
                      {filtered.slice(0, 8).map((j) => (
                        <li
                          key={j.id}
                          className={
                            highlightedJobId === j.id
                              ? "rounded-lg border border-[#2D5F4E] bg-[rgba(45,95,78,0.06)] px-2 py-1"
                              : "px-2 py-1"
                          }
                        >
                          <Link to={jobsUrl(j.id)} className="text-[12px] font-semibold text-[#2D5F4E] hover:underline">
                            {j.id} · {j.client}
                          </Link>
                          <div className="text-[10px] font-medium" style={{ color: "var(--app-muted)" }}>
                            {STATUS_LABELS[j.status]}
                            {j.stops.length > 0 && (
                              <> · {j.stops[0]!.city} → {j.stops[j.stops.length - 1]!.city}</>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
            ) : null}

            <p className="mt-3 text-[11px] text-[var(--app-muted)]">
              <Link
                to={mapUrl({ truck: truckId, job: highlightedJobId ?? undefined })}
                className="font-semibold text-[#2D5F4E] hover:underline"
              >
                Partilhar posição
              </Link>{" "}
              <span className="font-mono">
                ?truck={truckId}
                {highlightedJobId ? `&job=${highlightedJobId}` : ""}
              </span>
            </p>
          </div>

          <div className="p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--app-muted)" }}>
              Rasto recente
            </h3>
            <ul className="mt-3 space-y-4">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="relative border-l-2 pb-4 pl-4"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <div
                    className="absolute -left-[9px] top-0 flex h-4 w-4 items-center justify-center rounded-full"
                    style={{ background: "var(--app-card)" }}
                  >
                    <EventIcon kind={ev.kind} />
                  </div>
                  <div className="text-[12px] font-semibold" style={{ color: "var(--app-fg)" }}>
                    {eventLabel(ev.kind)}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--app-muted)" }}>
                    {ev.timeLabel}
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: "var(--app-fg)" }}>
                    {ev.address}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: "var(--app-muted)" }}>
                    {ev.speedKmh} km/h
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
