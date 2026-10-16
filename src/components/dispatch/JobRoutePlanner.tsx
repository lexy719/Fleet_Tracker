/**
 * JobRoutePlanner — right-panel component in Dispatch.
 *
 * Assignment model:
 *  • Dispatcher picks a TRUCK first.
 *  • IDLE truck (no active job): dispatcher also picks a driver from the
 *    available pool.  Driver + truck are written on the job together.
 *  • BUSY truck (assigned/loading/in_transit): the driver is already in the
 *    truck finishing another job.  New job queues automatically — same truck,
 *    same driver, no picker needed.
 *  • Queue promotion: when the active job finishes, the queued job with the
 *    pickup closest to the truck's live position is promoted first.
 */

import { useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Container, Loader2, RefreshCw, Truck, User, X } from "lucide-react";
import { fmtHours, fmtWhen } from "../../ui/format";
import { Button, Drawer } from "../../ui/kit";
import { toneVars } from "../../ui/status";
import { CargoTag, DeadlineChip, JobIdentity, RouteLine } from "../../ui/work/JobVisuals";
import { nextCountdown } from "../../ui/work/workModel";
import { CheckRow, Delta, Details, riConclusion, Step, WINDOW_TEXT } from "./DecisionParts";
import { trailerTypeLabel } from "../../domain/fleet/trailers";
import { evaluateEuDrivingRules, simulateDrivingSchedule } from "../../ops/euDrivingRules";
import { routeLineBaseColor } from "../../tomtom/planRoutes";
import { RefuelPlanSummary } from "./RefuelPlanSummary";
import { optionWindowStatus } from "../../regulations/alternatives";
import { RouteCompliancePanel } from "./RouteCompliancePanel";
import { CleanRoutesPanel } from "./CleanRoutesPanel";
import { RouteResearchControl } from "./RouteResearchControl";
import { STRATEGIES } from "./useCleanRoutes";
import { operationalTimeline } from "../../regulations/operationalTimeline";
import { useRoutePlanningSession, type RoutePlanningSessionInput, fmtDur, scheduleDescription } from "./useRoutePlanningSession";

/* ── Props ───────────────────────────────────────────────── */
export type JobRoutePlannerProps = RoutePlanningSessionInput;

/* ── Component ───────────────────────────────────────────── */
export function JobRoutePlanner(props: JobRoutePlannerProps) {
  const { job, onClose } = props;
  const {
    apiKey,
    activeTrailers,
    selectedTruckId,
    setSelectedTruckId,
    selectedTruck,
    activeJobOnTruck,
    truckIsBusy,
    availableDrivers,
    selectedDriverId,
    setSelectedDriverId,
    selectedTrailerId,
    setSelectedTrailerId,
    driverHours,
    effectiveDriver,
    hoursFor,
    assignmentMode,
    truckDisabled,
    truckLabel,
    sortedTrucks,
    loading,
    calcError,
    options,
    selectedOptionId,
    plannedDepartAt,
    altSearch,
    plannedAll,
    calculate,
    selectedOption,
    hosIssues,
    driverOk,
    regulationDataset,
    routingProfile,
    complianceFacts,
    cleanStates,
    complianceByOption,
    selectedCompliance,
    selectedCoverage,
    cleanCoverage,
    cleanDiscovery,
    applyCleanRoute,
    complianceBlocks,
    originalOption,
    originalReport,
    departMsForWindows,
    hoursToday,
    alternativeViews,
    applyAlternative,
    savedDecision,
    decisionSet,
    solving,
    canConfirmRoute,
    isAlreadyAssigned,
    confirmError,
    handleConfirm,
    routeRows,
    realSec,
    costOf,
    truckBlockers,
    truckWarnings,
    driverBlockers,
    driverWarnings,
    eu561,
    driverVerdict,
    truckVerdict,
    windowNow,
    ri,
    assumed,
    blockReason,
  } = useRoutePlanningSession(props);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  /* ── Render ──────────────────────────────────────────── */
  const selectCls = "ui-input h-9 w-full text-[13px]";
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {/* 1 · Trabalho */}
        <section className="border-b border-[var(--border)] px-5 py-4" data-testid="decision-job">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">{job.planStatus === "REPLAN_REQUIRED" ? "Replanear" : isAlreadyAssigned ? "Rever plano" : "Planear e atribuir"}</p>
              <JobIdentity job={job} />
            </div>
            <DeadlineChip c={nextCountdown(job, new Date())} />
            <button type="button" onClick={onClose} className="shrink-0 rounded-[var(--r-md)] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]" aria-label="Fechar planeador">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2.5"><RouteLine job={job} variant="compact" now={new Date()} /></div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-2)]">
            <CargoTag job={job} />
            {job.planStatus === "REPLAN_REQUIRED" && job.planInvalidation ? <span className="text-[var(--warn)]">Alterado: {job.planInvalidation.fields.join(", ")}</span> : null}
          </div>
        </section>

        {/* 2 · Recursos */}
        <Step n={2} title="Recursos">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--text-2)]"><Truck className="h-3.5 w-3.5" />Viatura</span>
              <select value={selectedTruckId} onChange={(e) => setSelectedTruckId(e.target.value)} className={selectCls} aria-label="Viatura">
                <option value="">Escolher viatura (override)</option>
                {sortedTrucks.map((t) => (
                  <option key={t.id} value={t.id} disabled={truckDisabled(t)}>{truckLabel(t)}</option>
                ))}
              </select>
              <span className="mt-1 block truncate text-[12px] text-[var(--text-3)]" data-testid="truck-summary">
                {!selectedTruck ? "—" : selectedTruck.availability !== "AVAILABLE" ? (selectedTruck.availability === "MAINTENANCE" ? "Em manutenção" : "Fora de serviço") : truckIsBusy ? `Em serviço · ${activeJobOnTruck!.jobNumber} — entra na fila` : `Livre · carga útil ${selectedTruck.maxWeightKg ? `${(selectedTruck.maxWeightKg / 1_000).toFixed(1)} t` : "desconhecida"}`}
              </span>
            </label>
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--text-2)]"><User className="h-3.5 w-3.5" />Motorista</span>
              {truckIsBusy ? (
                <div className={clsx(selectCls, "flex items-center bg-[var(--surface-2)] text-[var(--text-2)]")}>{effectiveDriver?.name ?? "Motorista em serviço desconhecido"}</div>
              ) : availableDrivers.length ? (
                <select value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)} className={selectCls} aria-label="Motorista">
                  <option value="">Escolher motorista (override)</option>
                  {availableDrivers.map((d) => {
                    const h = hoursFor(d);
                    return <option key={d.id} value={d.id}>{d.name} · {h.weekKnown ? `${h.hoursWeek.toFixed(1)} h semana` : "horas desconhecidas"}{d.isDemo ? " (demo)" : ""}</option>;
                  })}
                </select>
              ) : (
                <div className={clsx(selectCls, "flex items-center text-[var(--danger)]")}>Nenhum motorista disponível</div>
              )}
              <span className="mt-1 block truncate text-[12px] text-[var(--text-3)]" data-testid="driver-summary">
                {effectiveDriver ? (truckIsBusy ? `Já na viatura (${activeJobOnTruck?.jobNumber})` : `${effectiveDriver.license}${driverHours.weekKnown ? ` · ${fmtHours(effectiveDriver.hoursWeek)} esta semana` : " · base de horas desconhecida"}`) : "—"}
              </span>
            </label>
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--text-2)]"><Container className="h-3.5 w-3.5" />Reboque</span>
              <select value={selectedTrailerId} onChange={(e) => setSelectedTrailerId(e.target.value)} aria-label="Reboque" className={selectCls}>
                <option value="">Sem reboque</option>
                {activeTrailers.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.availability !== "AVAILABLE"}>
                    {t.plate} · {trailerTypeLabel(t)}{t.payloadKg ? ` · ${(t.payloadKg / 1000).toFixed(1)} t` : ""}{t.isDemo ? " (demo)" : ""}{t.availability !== "AVAILABLE" ? " — indisponível" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block truncate text-[12px] text-[var(--text-3)]">{selectedTrailerId ? trailerTypeLabel(activeTrailers.find((t) => t.id === selectedTrailerId)!) : "Opcional"}</span>
            </label>
          </div>
          {assumed.length > 0 ? (
            <div className="mt-2" data-testid="routing-profile">
              <Details label={<span>{assumed.length} {assumed.length === 1 ? "valor assumido" : "valores assumidos"} no cálculo da rota · <span className="underline">Ver detalhes</span></span>}>
                <p>A ficha da viatura não regista estes valores; foi usado o perfil genérico:</p>
                <ul className="list-disc pl-4">{assumed.map((a) => <li key={a}>{a}</li>)}</ul>
                {routingProfile?.fromRecord.length ? <p className="text-[var(--text-3)]">Da ficha: {routingProfile.fromRecord.join(", ")}.</p> : null}
              </Details>
            </div>
          ) : null}
        </Step>

        {/* 3 · Opções de rota */}
        <Step
          n={3}
          title="Opções de rota"
          aside={
            <>
              {plannedDepartAt ? <span className="num text-[var(--text-3)]">partida {job.plannedDepartureAt ? "" : "agora · "}{fmtWhen(plannedDepartAt.toISOString())}</span> : null}
              {!loading && (options.length > 0 || calcError) ? (
                <button type="button" onClick={() => void calculate(selectedTruckId, true)} className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"><RefreshCw className="h-3 w-3" />Recalcular</button>
              ) : null}
            </>
          }
        >
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-[13px] text-[var(--text-2)]"><Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />{apiKey ? "A calcular rotas…" : "A estimar rota…"}</div>
          ) : calcError ? (
            <p className="rounded-[var(--r-md)] bg-[var(--danger-soft)] px-3 py-2 text-[12.5px] text-[var(--danger)]">{calcError}</p>
          ) : (
            <>
              {!apiKey && options.length > 0 ? <p className="mb-2 text-[12px] text-[var(--warn)]">Estimativa sem fornecedor de rotas — distâncias aproximadas.</p> : null}
              <ul className="divide-y divide-[var(--border)] rounded-[var(--r-md)] border border-[var(--border)]" data-testid="route-list">
                {routeRows.map((r) => {
                  const o = r.option;
                  const sel = r.id === selectedOptionId;
                  const rep = complianceByOption[o.id];
                  const win = WINDOW_TEXT[optionWindowStatus(o, job, departMsForWindows, hoursToday)];
                  const hos = effectiveDriver ? evaluateEuDrivingRules(o.legDurationSec, hoursToday, effectiveDriver.hoursWeek) : [];
                  const sched = operationalTimeline(o, departMsForWindows, hoursToday);
                  const riR = riConclusion(rep?.status, false);
                  return (
                    <li key={r.id} className={clsx("relative", sel && "bg-[var(--accent-soft)]")} data-testid="route-row" data-selected={sel}>
                      {sel ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: routeLineBaseColor(o) }} /> : null}
                      <button type="button" onClick={r.select} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-3 py-2.5 text-left" aria-pressed={sel}>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className={clsx("truncate text-[13px]", sel ? "font-semibold text-[var(--text)]" : "font-medium text-[var(--text)]")}>{r.title}</span>
                            {sched.drivingDays > 1 ? <span className="text-[11.5px] text-[var(--text-3)]">{sched.drivingDays} dias</span> : null}
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px]">
                            <span style={{ color: toneVars(riR.tone).fg }}>{rep ? riR.text : "restrições por avaliar"}</span>
                            {win.verdict !== "OK" ? <span style={{ color: win.verdict === "BLOCKS" ? "var(--danger)" : win.verdict === "RISK" ? "var(--warn)" : "var(--text-3)" }}>{win.text.toLowerCase()}</span> : null}
                            {hos.some((i) => i.severity === "critical") ? <span className="text-[var(--danger)]">excede UE 561</span> : null}
                          </span>
                        </span>
                        <span className="num grid grid-cols-[64px_56px_56px] gap-x-2 text-right text-[12.5px]">
                          {sel || !selectedOption ? (
                            <>
                              <span className="font-medium text-[var(--text)]" title="Duração com pausas e descansos">{fmtDur(realSec(o))}</span>
                              <span className="text-[var(--text-2)]">{(o.distanceM / 1_000).toFixed(0)} km</span>
                              <span className="text-[var(--text-2)]">€{costOf(o).toFixed(0)}</span>
                            </>
                          ) : (
                            <>
                              <Delta value={(realSec(o) - realSec(selectedOption)) / 60} fmt={(m) => (m >= 60 ? fmtDur(m * 60) : `${Math.round(m)} min`)} />
                              <Delta value={Math.round((o.distanceM - selectedOption.distanceM) / 1_000)} fmt={(v) => `${v}`} unit=" km" />
                              <Delta value={Math.round(costOf(o) - costOf(selectedOption))} fmt={(v) => `€${v}`} />
                            </>
                          )}
                        </span>
                      </button>
                      {sel ? (
                        <div className="px-3 pb-2.5">
                          <Details label="Detalhes da rota" testId="route-details">
                            <p>{scheduleDescription(o.durationSec, hoursToday)}</p>
                            <p className="num">Condução {fmtDur(o.durationSec)} · combustível €{o.fuelCostEur.toFixed(0)} · portagens €{o.tollCostEur.toFixed(2)}{o.trafficDelaySec >= 300 ? ` · trânsito +${fmtDur(o.trafficDelaySec)}` : ""}</p>
                            <p>Chegada prevista {fmtWhen(operationalTimeline(o, departMsForWindows, hoursToday).arrivalAtIso)}</p>
                            {o.fuelPriceBasis ? <p className="text-[var(--text-3)]">Combustível a €{o.fuelPriceBasis.eurPerL.toFixed(3)}/L — {o.fuelPriceBasis.basis}</p> : null}
                            {o.refuelPlan ? <RefuelPlanSummary plan={o.refuelPlan} /> : null}
                            <p className="text-[var(--text-3)]">Origem: {r.provenance.join(" · ")}</p>
                          </Details>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                {routeRows.length === 0 ? <li className="px-3 py-3 text-[12.5px] text-[var(--text-3)]">{decisionSet.decisionStatus === "NO_EXECUTABLE_ROUTE" ? "Nenhuma rota executável encontrada. Reveja a partida, os recursos ou as restrições." : "Sem rota avaliada disponível."}</li> : null}
              </ul>
              <p className="mt-2 text-[11.5px] text-[var(--text-3)]" data-testid="decision-summary">{decisionSet.analysisSummary}</p>
              {decisionSet.unresolvedIssues.length > 0 && <p className="mt-1 text-[11.5px] text-[var(--text-3)]">{decisionSet.unresolvedIssues.join(" · ")}</p>}
              {decisionSet.excluded.length > 0 ? <Details label="Ver análise"><ul>{decisionSet.excluded.map((e) => <li key={e.routeId}>{e.reasons.join(" · ")}</li>)}</ul></Details> : null}
              {solving ? <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--text-3)]"><Loader2 className="h-3 w-3 animate-spin" />A verificar restrições conhecidas nas rotas…</p> : null}
              {selectedOption ? <p className="mt-1.5 text-[11.5px] text-[var(--text-3)]">Nas outras opções, valores relativos à rota escolhida (duração com pausas · distância · custo).</p> : null}
            </>
          )}
        </Step>

        {/* 4 · Verificações */}
        <Step n={4} title="Verificações">
          <ul className="divide-y divide-[var(--border)]" data-testid="checks">
            <CheckRow label="Viatura" verdict={truckVerdict} testId="check-truck" text={truckBlockers[0] ?? truckWarnings[0] ?? (truckIsBusy ? `Em serviço — este trabalho entra na fila depois de ${activeJobOnTruck?.jobNumber}` : "Disponível e com capacidade registada para a carga")}>
              {[...truckBlockers.slice(1), ...truckWarnings.slice(truckBlockers.length ? 0 : 1)].map((m) => <p key={m} className="text-[12px] text-[var(--text-2)]">{m}</p>)}
            </CheckRow>
            <CheckRow label="Motorista" verdict={driverVerdict} testId="check-driver" text={driverBlockers[0] ?? (!driverOk ? "Nenhum motorista disponível" : eu561.text)}>
              {driverWarnings.map((m) => <p key={m} className="text-[12px] text-[var(--text-2)]">{m}</p>)}
              {effectiveDriver ? (
                <Details label="Detalhes UE 561" testId="eu561-details">
                  <p>Calculado com {fmtHours(driverHours.hoursToday)} hoje e {fmtHours(driverHours.hoursWeek)} esta semana — {driverHours.basis}.</p>
                  {driverHours.notes.map((n) => <p key={n} className="text-[var(--warn)]">{n}</p>)}
                  {hosIssues.map((i, k) => <p key={k} style={{ color: i.severity === "critical" ? "var(--danger)" : i.code === "MULTI_DAY" ? undefined : "var(--warn)" }}>{i.message}</p>)}
                </Details>
              ) : null}
            </CheckRow>
            <CheckRow label="Janela" verdict={windowNow.verdict} testId="check-window" text={selectedOption ? `${windowNow.text} · chegada ${fmtWhen(operationalTimeline(selectedOption, departMsForWindows, hoursToday).arrivalAtIso)}` : windowNow.text} />
            <CheckRow
              label="Restrições"
              verdict={selectedOption ? ri.verdict : "UNKNOWN"}
              testId="check-restrictions"
              text={selectedOption ? ri.text : "Por avaliar"}
              action={selectedCompliance ? <Button size="sm" variant="ghost" onClick={() => setEvidenceOpen(true)}>Ver análise</Button> : undefined}
            >
              {complianceBlocks && alternativeViews.length ? <p className="text-[12px] text-[var(--text-2)]">{alternativeViews.filter((a) => a.verdict === "compliant" || a.verdict === "uncertain").length} alternativa(s) avaliada(s) — ver análise.</p> : null}
              {complianceBlocks && altSearch.status === "searching" ? <p className="text-[12px] text-[var(--text-3)]">A procurar alternativa que evite a restrição…</p> : null}
            </CheckRow>
          </ul>
        </Step>
      </div>

      {/* 5 · Confirmar */}
      <div className="flex shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3" data-testid="confirm-bar">
        <div className="min-w-0 flex-1 text-[12.5px]" aria-live="polite">
          {confirmError ? <span className="text-[var(--danger)]">{confirmError}</span> : blockReason ? <span className="text-[var(--text-2)]" data-testid="block-reason">{blockReason}</span> : <span className="text-[var(--text-3)]">{assignmentMode === "queued" ? `Fica na fila de ${selectedTruck?.plate} depois de ${activeJobOnTruck?.jobNumber}.` : "Atribui viatura e motorista e guarda a decisão."}</span>}
        </div>
        <Button variant="primary" onClick={handleConfirm} disabled={!canConfirmRoute} icon={<CheckCircle2 className="h-4 w-4" />} data-testid="confirm-route">
          Confirmar rota e atribuir
        </Button>
      </div>

      {evidenceOpen && selectedCompliance && selectedOption ? (
        <Drawer width={640} title="Análise de restrições" subtitle={`${job.jobNumber} · ${routeRows.find((r) => r.id === selectedOptionId)?.title ?? ""}`} onClose={() => setEvidenceOpen(false)}>
          <div className="space-y-4 px-5 py-4">
            <RouteCompliancePanel
              report={selectedCompliance}
              dataset={regulationDataset}
              coverage={selectedCoverage}
              route={{
                distanceM: selectedOption.distanceM,
                durationSec: realSec(selectedOption),
                arrivalAtIso: operationalTimeline(selectedOption, departMsForWindows, hoursToday).arrivalAtIso,
                deliveryWindow: optionWindowStatus(selectedOption, job, departMsForWindows, hoursToday),
              }}
              savedDecision={savedDecision}
              replacesAffected={
                originalOption && originalOption.id !== selectedOptionId && originalReport?.status === "ROUTE_AFFECTED"
                  ? { distanceM: originalOption.distanceM, durationSec: originalOption.durationSec, arrivalAtIso: originalOption.arrivalAtIso, deliveryWindow: optionWindowStatus(originalOption, job, departMsForWindows, hoursToday) }
                  : undefined
              }
              alternatives={complianceBlocks ? alternativeViews : undefined}
              altSearchStatus={complianceBlocks ? altSearch.status : undefined}
              altSearchMessage={altSearch.message}
              onUseAlternative={(id) => { applyAlternative(id); setEvidenceOpen(false); }}
            />
            {apiKey && plannedAll.length > 0 ? (
              <>
                <CleanRoutesPanel
                  states={cleanStates}
                  elapsedDurationSec={(driveSec) => simulateDrivingSchedule(driveSec, hoursToday * 3600).totalElapsedSec}
                  coverage={cleanCoverage}
                  discovery={cleanDiscovery}
                  selectedOptionId={selectedOptionId}
                  selectedCandidateIds={decisionSet.decisions.find((d) => d.routeId === selectedOptionId)?.candidateIds}
                  selectableIds={decisionSet.decisions.flatMap((d) => d.candidateIds)}
                  onUse={(s) => { applyCleanRoute(s); setEvidenceOpen(false); }}
                  windowStatus={Object.fromEntries(STRATEGIES.flatMap((st) => { const o = cleanStates[st].finalOption; return o ? [[st, optionWindowStatus(o, job, departMsForWindows, hoursToday)]] : []; }))}
                  confirmed={job.routeCompliance?.cleanRoute ? { strategy: job.routeCompliance.cleanRoute.strategy, at: job.routeCompliance.confirmedAt } : null}
                />
                <RouteResearchControl route={plannedAll[0]} report={plannedAll[0] ? complianceByOption[plannedAll[0].id] : undefined} facts={complianceFacts} />
              </>
            ) : null}
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
