/**
 * Automatic operational planning session (planFleet → saved recommendation → human
 * confirmation with one compliance record per movement). Shared by Expedição's panel and
 * the DEV studio so both plan with exactly the same engine and rules.
 */
import { useEffect, useRef, useState } from "react";
import type { OperationsService } from "../../application/operations";
import { planFleet } from "../../domain/planning/planner";
import { overrideImpact } from "../../domain/planning/economics";
import type { ConfirmedOperationalPlan, OperationalPlan, PlanningConstraint, PlanningRequest, PlanningResult } from "../../domain/planning/types";
import { isoToLocal, localToIso } from "../../domain/time";
export type OperationalPlanningInput = {
  service: OperationsService;
  makeRequest: (
    constraints: PlanningConstraint[],
    departureMs: number,
  ) => PlanningRequest;
  defaultDepartureMs: number;
  overrideJobId?: string;
  onPlan?: (plan: OperationalPlan | null) => void;
  onConfirmed?: (record: ConfirmedOperationalPlan) => void;
  providerStats?: () => unknown;
};
export const euro = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(
    n,
  );
export const hour = (n: number) => `${(n / 3600).toFixed(1)} h`;
export const reasonLabels: Record<string, string> = {
  RESOURCE_CAPACITY_AND_EQUIPMENT_COMPATIBLE:
    "Capacidade e equipamento compatíveis",
  RESOURCE_ORIGIN: "Posição inicial usada",
  TIMELINE_AND_KNOWN_RESTRICTIONS_EVALUATED:
    "Horários e restrições avaliados com estes recursos",
  DAILY_REST_PLANNED_BEFORE_DEPARTURE: "Descanso diário antes da partida",
  DAILY_REST_PLANNED_DURING_IDLE: "Descanso diário durante a espera",
  DRIVING_BASELINE_UNKNOWN: "Horas de condução por validar",
  RESOURCE_COLOCATION_UNCONFIRMED:
    "Presença do motorista/reboque junto da viatura por validar",
  BASE_OR_LEGAL_APPLICABILITY_UNKNOWN: "Aplicabilidade legal por resolver",
  SERVICE_DURATION_UNKNOWN: "Tempo de carga/descarga desconhecido",
  OVERRIDE_APPLIED: "Recursos impostos pelo operador",
};
export function useOperationalPlanning({
  service,
  makeRequest,
  defaultDepartureMs,
  overrideJobId,
  onPlan,
  onConfirmed,
  providerStats,
}: OperationalPlanningInput) {
  const [departure, setDeparture] = useState(() =>
    isoToLocal(new Date(defaultDepartureMs).toISOString()),
  );
  const [truckId, setTruckId] = useState(""),
    [driverId, setDriverId] = useState(""),
    [trailerId, setTrailerId] = useState("");
  const [result, setResult] = useState<PlanningResult | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [recommendationId, setRecommendationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [ack, setAck] = useState(false),
    [confirmed, setConfirmed] = useState<ConfirmedOperationalPlan | null>(null),
    [impact, setImpact] = useState<unknown>(null),
    [stats, setStats] = useState<unknown>(null);
  const cancel = useRef<AbortController | null>(null),
    baseline = useRef<OperationalPlan | null>(null);
  const [plannedInputs, setPlannedInputs] = useState<string | null>(null),
    inputs = JSON.stringify([departure, truckId, driverId, trailerId]);
  useEffect(() => () => cancel.current?.abort(), []);
  const state = service.getState(),
    plans = result
      ? [result.recommended, ...result.alternatives].filter(
          (p): p is OperationalPlan => !!p,
        )
      : [],
    selected = plans.find((p) => p.id === selectedId) ?? null;
  async function run() {
    const iso = localToIso(departure);
    if (!iso) {
      setError("Indique uma partida válida, com data e hora de Lisboa.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setRecommendationId(null);
    setConfirmed(null);
    setAck(false);
    onPlan?.(null);
    const controller = new AbortController();
    cancel.current = controller;
    try {
      const constraints: PlanningConstraint[] =
        overrideJobId && (truckId || driverId || trailerId)
          ? [
              {
                jobId: overrideJobId,
                ...(truckId ? { truckId } : {}),
                ...(driverId ? { driverId } : {}),
                ...(trailerId ? { trailerId } : {}),
              },
            ]
          : [];
      const request = makeRequest(constraints, Date.parse(iso)),
        value = await planFleet({
          ...request,
          signal: controller.signal,
          yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
        });
      if (controller.signal.aborted) return;
      const saved = await service.savePlanningRecommendation(value);
      if (!saved.ok) throw new Error(saved.errors.join("; "));
      if (!constraints.length) {
        baseline.current = value.recommended;
        setImpact(null);
      } else setImpact(overrideImpact(baseline.current, value.recommended));
      setResult(value);
      setPlannedInputs(inputs);
      setRecommendationId(saved.value.id);
      setSelectedId(value.recommended?.id ?? null);
      setStats(providerStats?.());
      onPlan?.(value.recommended);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!selected || !recommendationId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await service.confirmOperationalRecommendation(
        recommendationId,
        selected.id,
        makeRequest([], Date.parse(localToIso(departure)!)).dataset,
        ack,
      );
      if (!r.ok) throw new Error(r.errors.join("; "));
      setConfirmed(r.value);
      onConfirmed?.(r.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return {
    departure,
    setDeparture,
    truckId,
    setTruckId,
    driverId,
    setDriverId,
    trailerId,
    setTrailerId,
    result,
    setResult,
    selectedId,
    setSelectedId,
    recommendationId,
    setRecommendationId,
    busy,
    setBusy,
    error,
    setError,
    ack,
    setAck,
    confirmed,
    setConfirmed,
    impact,
    setImpact,
    stats,
    setStats,
    cancel,
    baseline,
    plannedInputs,
    setPlannedInputs,
    inputs,
    state,
    plans,
    selected,
    run,
    confirm,
  };
}

export type OperationalPlanning = ReturnType<typeof useOperationalPlanning>;
