// "Planear automaticamente" — the whole open workload planned by the same engine as Expedição's
// automatic planning (planFleet → saved recommendation → confirmOperationalRecommendation with one
// compliance record per movement), in batches so every run keeps its own route-request budget
// (see batchPlanning.ts). Existing commitments stay fixed, exactly as in the app.
import { useRef, useState } from "react";
import { reasonLabel, mergeDiagnostics } from "./planReasons";
import { planningRouter } from "../../application/planningRouter";
import { useRoadEvents } from "../../context/RoadEventsContext";
import { useFuel } from "../../context/FuelContext";
import { getTomTomKey } from "../../tomtom/config";
import { isoToLocal, localToIso } from "../../domain/time";
import type { OperationalPlan, PlanningRequest } from "../../domain/planning/types";
import type { OperationsService } from "../../application/operations";
import type { RegulationDataset } from "../../regulations/types";
import { BATCH_SIZE, confirmBatches, orderForBatches, previewBatches, type BatchPreview, type ConfirmOutcome } from "./batchPlanning";
import { W } from "./world/active";
import { initials } from "./model";
import { money } from "./fuelui";

/** Same request as Expedição's automatic planning (6-day horizon), scoped to a batch. */
function planningRequest(
  state: ReturnType<OperationsService["getState"]>,
  scopeJobIds: string[],
  fromMs: number,
  dataset: RegulationDataset,
  route: PlanningRequest["route"],
  initialState?: PlanningRequest["initialState"],
): PlanningRequest {
  const now = Date.now();
  return {
    ...state,
    scopeJobIds,
    nowMs: now,
    earliestStartMs: fromMs,
    horizonEndMs: Math.max(fromMs, now) + 6 * 86400_000,
    dataset,
    constraints: [],
    route,
    ...(initialState ? { initialState } : {}),
  };
}

const hm = (ms: number) => new Date(ms).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const h1 = (sec: number) => `${(sec / 3600).toFixed(1).replace(".", ",")} h`;

export function AutoPlanPanel({ onClose, onPlan, onConfirmed }: { onClose: () => void; onPlan: (p: Pick<OperationalPlan, "executions"> | null) => void; onConfirmed: (n: number) => void }) {
  const ops = W().ops!;
  const service = ops.service;
  const { dataset } = useRoadEvents();
  const { intelligence: fuel } = useFuel();
  const state = service.getState();
  const displays = new Map(Object.entries(W().storeIds ?? {}).map(([disp, id]) => [id, disp]));
  const displayOf = (id: string) => displays.get(id) ?? id;
  const backlog = state.jobs.filter((j) => j.status === "backlog");
  const [scope, setScope] = useState<string[]>(() => backlog.map((j) => j.id));
  const [departure, setDeparture] = useState(() => isoToLocal(new Date(Date.now() + 600000).toISOString()));
  const [busy, setBusy] = useState<null | { phase: "plan" | "confirm"; done: number; total: number }>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [plannedKey, setPlannedKey] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [outcome, setOutcome] = useState<ConfirmOutcome | null>(null);
  const cancel = useRef<AbortController | null>(null);
  const key = JSON.stringify([departure, scope]);
  const stale = !!preview && plannedKey !== key;

  const request = (jobIds: string[], fromMs: number, initialState?: PlanningRequest["initialState"]) =>
    planningRequest(service.getState(), jobIds, fromMs, dataset, planningRouter(getTomTomKey() ?? "", dataset, undefined, undefined, fuel).route, initialState);

  async function run() {
    const iso = localToIso(departure);
    if (!iso) return setError("Indique uma partida válida, com data e hora de Lisboa.");
    const fromMs = Date.parse(iso);
    setError(null);
    setPreview(null);
    setOutcome(null);
    setAck(false);
    onPlan(null);
    const controller = new AbortController();
    cancel.current = controller;
    const ordered = orderForBatches(state.jobs.filter((j) => scope.includes(j.id)));
    try {
      setBusy({ phase: "plan", done: 0, total: Math.ceil(ordered.length / BATCH_SIZE) });
      const p = await previewBatches({
        scope: ordered,
        makeRequest: (jobIds, initialState) => request(jobIds, fromMs, initialState),
        service,
        signal: controller.signal,
        onProgress: (done, total) => setBusy({ phase: "plan", done, total }),
      });
      setPreview(p);
      setPlannedKey(key);
      onPlan({ executions: p.executions });
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!preview) return;
    const fromMs = Date.parse(localToIso(departure)!);
    setError(null);
    setBusy({ phase: "confirm", done: 0, total: preview.batches.length });
    try {
      const r = await confirmBatches({
        preview,
        service,
        dataset,
        acknowledge: ack,
        makeRequest: (jobIds) => request(jobIds, fromMs),
        onProgress: (done, total) => setBusy({ phase: "confirm", done, total }),
      });
      setOutcome(r);
      if (r.confirmed) onConfirmed(r.confirmed);
      if (r.reason) setError(r.reason);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const plate = (id: string) => state.trucks.find((t) => t.id === id)?.plate ?? id;
  const driver = (id: string) => state.drivers.find((d) => d.id === id)?.name ?? id;
  const trailer = (id?: string) => (id ? (state.trailers.find((t) => t.id === id)?.plate ?? id) : "sem reboque");
  const jobOf = (id: string) => state.jobs.find((j) => j.id === id);
  const execOf = (id: string) => preview?.executions.find((e) => e.jobId === id);
  const done = outcome && outcome.stoppedAt === null;

  return (
    <aside className="panel autoplan" aria-label="Planear automaticamente">
      <span className="panel-bg" data-flip="bg-auto" data-flip-mode="box" />
      <div className="panel-head">
        <button className="back" onClick={onClose} aria-label="Fechar (Esc)">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="panel-title">
          <span className="ref ref-big" data-flip="auto-title">
            Planear automaticamente
          </span>
          <span className="panel-client">Motor da Expedição · em lotes de {BATCH_SIZE} · compromissos atuais ficam fixos</span>
        </div>
      </div>

      <div className="panel-scroll">
        <section className="nj-sec" data-flip-enter="120">
          <span className="eyebrow">
            Transportes por planear · {scope.length} de {backlog.length}
          </span>
          <div className="ap-scope">
            {backlog.map((j) => {
              const on = scope.includes(j.id);
              if (execOf(j.id)) return null;
              return (
                <button
                  key={j.id}
                  className="ap-job"
                  aria-pressed={on}
                  disabled={!!busy}
                  onClick={() => setScope((xs) => (on ? xs.filter((x) => x !== j.id) : [...xs, j.id]))}
                  data-unassigned={preview?.unassignedJobIds.includes(j.id) || undefined}
                >
                  <span className="ref ref-chip" data-flip={`ref-${displayOf(j.id)}`}>
                    {displayOf(j.id)}
                  </span>
                  <span className="ap-od">
                    {j.stops[0]?.city} → {j.stops.at(-1)?.city}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="ap-dep">
            <span>Partida mínima · Lisboa</span>
            <input className="nj-in" type="datetime-local" value={departure} onChange={(e) => setDeparture(e.target.value)} disabled={!!busy} />
          </label>
          <div className="actions ap-actions">
            <button className="act act-need" onClick={() => void run()} disabled={!!busy || !scope.length}>
              {busy?.phase === "plan" ? "A planear…" : preview ? "Planear de novo" : "Calcular plano"}
            </button>
            {busy?.phase === "plan" && (
              <button className="act" onClick={() => cancel.current?.abort()}>
                Cancelar
              </button>
            )}
          </div>
          {busy && (
            <div className="ap-progress" aria-live="polite">
              <span style={{ width: `${(busy.done / Math.max(1, busy.total)) * 100}%` }} />
              <em>
                {busy.phase === "plan"
                  ? busy.done < busy.total
                    ? `Lote ${busy.done + 1} de ${busy.total} · viaturas, motoristas, vazios, janelas, horas e restrições`
                    : "A juntar os lotes…"
                  : `A confirmar lote ${Math.min(busy.done + 1, busy.total)} de ${busy.total}`}
              </em>
            </div>
          )}
          {error && <p className="pl-err">{error}</p>}
        </section>

        {preview && (
          <>
            <div className="panel-facts ap-facts" data-flip-enter="140">
              <span className="fact">
                <span>Planeados</span>
                <b>{preview.executions.length}</b>
              </span>
              <span className="fact" data-tone={preview.unassignedJobIds.length ? "bad" : undefined}>
                <span>Por atribuir</span>
                <b>{preview.unassignedJobIds.length}</b>
              </span>
              <span className="fact">
                <span>Km vazios</span>
                <b>{Math.round(preview.metrics.emptyKm)}</b>
              </span>
              <span className="fact">
                <span>Custo comparável</span>
                <b>{money(preview.metrics.generalizedCostEur)}</b>
              </span>
            </div>

            {preview.trips.length > 0 && (
              <section className="ap-trips" aria-label="Plano por viatura">
                <span className="eyebrow">Plano por viatura</span>
                {preview.trips.map((t) => (
                  <div key={`${t.assignment.truckId}/${t.assignment.driverId}/${t.assignment.trailerId ?? ""}`} className="ap-trip">
                    <div className="ap-trip-head">
                      <span className="plate" data-flip={`plate-${t.assignment.truckId}`}>
                        {plate(t.assignment.truckId)}
                      </span>
                      <span className="who">
                        <span className="mono">{initials(driver(t.assignment.driverId))}</span>
                        {driver(t.assignment.driverId)}
                      </span>
                      <span className="ap-trailer">{trailer(t.assignment.trailerId)}</span>
                    </div>
                    <ol className="ap-seq">
                      {t.jobIds.map((id) => {
                        const e = execOf(id);
                        const j = jobOf(id);
                        const empty = e?.movements.filter((m) => m.kind === "EMPTY").reduce((a, m) => a + m.route.distanceM / 1000, 0) ?? 0;
                        return (
                          <li key={id}>
                            {empty > 0.5 && <span className="ap-empty">{Math.round(empty)} km em vazio</span>}
                            <span className="ap-step">
                              <span className="ref ref-chip" data-flip={`ref-${displayOf(id)}`}>
                                {displayOf(id)}
                              </span>
                              <span className="ap-od">
                                {j?.stops[0]?.city} → {j?.stops.at(-1)?.city}
                              </span>
                              <span className="ap-time">{e ? `${hm(e.pickupMs)} → ${hm(e.endMs)}` : ""}</span>
                            </span>
                            {e && e.reasons.length > 0 && (
                              <details className="ap-why">
                                <summary>Porquê esta combinação</summary>
                                <ul>
                                  {e.reasons.map((r, i) => (
                                    <li key={i}>{reasonLabel(r.code)}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
                <p className="fine">
                  {Math.round(preview.metrics.loadedKm)} km carregados · {Math.round(preview.metrics.emptyKm)} km vazios · {h1(preview.metrics.totalDrivingSec)} de condução · {h1(preview.metrics.restSec)} de descanso · combustível e portagens{" "}
                  {money(preview.metrics.providerFuelTollEur)}. {preview.batches.length} execuções do motor (até 64 pedidos de rota cada); sem garantia de ótimo global.
                  {preview.truncatedBatches ? ` ${preview.truncatedBatches} lote(s) atingiram o limite; os transportes que faltaram foram repetidos.` : ""}
                </p>
              </section>
            )}

            {preview.trips.length === 0 && (
              <p className="fine">
                {preview.batches.length} execuções do motor (até 64 pedidos de rota cada) · nenhuma combinação viável para os transportes escolhidos com a frota e os dados atuais.
              </p>
            )}

            {preview.unassignedJobIds.length > 0 && (
              <section className="ap-unassigned">
                <span className="eyebrow">Ficam por atribuir</span>
                <div className="ap-scope">
                  {preview.unassignedJobIds.map((id) => (
                    <span key={id} className="ap-job" data-unassigned>
                      <span className="ref ref-chip">{displayOf(id)}</span>
                      <span className="ap-od">
                        {jobOf(id)?.stops[0]?.city} → {jobOf(id)?.stops.at(-1)?.city}
                      </span>
                    </span>
                  ))}
                </div>
                {preview.diagnostics.length > 0 && (
                  <>
                    <p className="fine">Motivos pelos quais o motor rejeitou combinações viatura · motorista · reboque (contagem de combinações, não de transportes):</p>
                    <ul className="ap-diag">
                      {mergeDiagnostics(preview.diagnostics)
                        .slice(0, 8)
                        .map((d) => (
                          <li key={d.code}>
                            {d.label} <b>×{d.count.toLocaleString("pt-PT")}</b>
                          </li>
                        ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {preview.reviewRequired && !done && (
              <label className="ap-ack">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>Reconheço os dados por validar indicados no plano. A confirmação não os transforma em factos conhecidos.</span>
              </label>
            )}
          </>
        )}
      </div>

      {preview && preview.executions.length > 0 && (
        <div className="commit" role="region" aria-label="Confirmar plano">
          <span className="commit-txt">
            <b>
              {done
                ? `Plano confirmado · ${outcome!.confirmed} atribuído${outcome!.confirmed === 1 ? "" : "s"}`
                : `${preview.executions.length} transporte${preview.executions.length === 1 ? "" : "s"} · ${preview.trips.length} viatura${preview.trips.length === 1 ? "" : "s"}`}
            </b>
            <span>
              {stale
                ? "Partida ou seleção alterada: volte a planear antes de confirmar."
                : outcome?.stoppedAt != null
                  ? `${outcome.confirmed} confirmados; parou no lote ${outcome.stoppedAt + 1}.`
                  : done
                    ? "Guardado com a análise de restrições de cada deslocação."
                    : "Confirma lote a lote; cada lote seguinte é verificado contra os dados já confirmados."}
            </span>
          </span>
          <button className="ghost" onClick={onClose}>
            Fechar
          </button>
          <button className="primary" onClick={() => void confirm()} disabled={!!busy || !!done || stale || (preview.reviewRequired && !ack)}>
            Confirmar plano
          </button>
        </div>
      )}
    </aside>
  );
}
