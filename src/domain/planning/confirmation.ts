import type { Driver, Job, Trailer, Truck } from "../../data/types";
import { fail, ok, type Result, type OperationalEvent } from "../events";
import { confirmPlan } from "../jobs/lifecycle";
import {
  driverPlanningSpecification,
  inventoryFingerprint,
  trailerPlanningSpecification,
  truckPlanningSpecification,
} from "./state";
import type { ConfirmedOperationalPlan, OperationalPlan } from "./types";
import type {
  RegulationDataset,
  RouteComplianceRecord,
} from "../../regulations/types";
import { createComplianceRecord } from "../../regulations/decisionRecord";
import { evaluateCompliance } from "../../regulations/evaluate";

/** Validate and construct every change before the application makes ONE atomic commit. */
export function confirmOperationalPlan(args: {
  selected: OperationalPlan;
  recommended: OperationalPlan;
  jobs: Job[];
  trucks: Truck[];
  drivers: Driver[];
  trailers: Trailer[];
  dataset: RegulationDataset;
  now: Date;
  id: string;
  acknowledgeUncertainty: boolean;
}): Result<{
  jobs: Job[];
  events: OperationalEvent[];
  record: ConfirmedOperationalPlan;
}> {
  const {
    selected,
    recommended,
    jobs,
    trucks,
    drivers,
    trailers,
    dataset,
    now,
  } = args;
  if (
    selected.inventoryFingerprint !==
    inventoryFingerprint(jobs, trucks, drivers, trailers)
  )
    return fail(
      "A frota ou os trabalhos mudaram; volte a planear antes de confirmar.",
    );
  if (selected.datasetVersion !== dataset.version)
    return fail("A informação rodoviária mudou; volte a planear.");
  if (!selected.executions.length) return fail("Plano sem trabalhos.");
  if (selected.status === "REVIEW_REQUIRED" && !args.acknowledgeUncertainty)
    return fail(
      "Reconheça explicitamente os dados por validar antes de confirmar.",
    );
  if (selected.executions.some((e) => e.startMs < now.getTime()))
    return fail(
      "A partida planeada já passou; volte a planear com uma partida futura.",
    );
  const shared = (
    a: OperationalPlan["executions"][number]["assignment"],
    b: OperationalPlan["executions"][number]["assignment"],
  ) =>
    a.truckId === b.truckId ||
    a.driverId === b.driverId ||
    (!!a.trailerId && a.trailerId === b.trailerId);
  for (const e of selected.executions) {
    if (
      !Number.isFinite(e.startMs) ||
      !Number.isFinite(e.endMs) ||
      e.endMs <= e.startMs ||
      e.endMs > selected.planningInputs.horizonEndMs
    )
      return fail("Calendário do plano inválido.");
    if (
      selected.executions.some(
        (other) =>
          other !== e &&
          shared(e.assignment, other.assignment) &&
          e.startMs < other.endMs &&
          other.startMs < e.endMs,
      )
    )
      return fail("O plano sobrepõe recursos entre trabalhos.");
    if (
      jobs.some(
        (j) =>
          ["assigned", "queued", "loading", "in_transit"].includes(j.status) &&
          shared(e.assignment, {
            truckId: j.assignedTruckId ?? "",
            driverId: j.assignedDriverId ?? "",
            trailerId: j.assignedTrailerId,
          }) &&
          e.startMs <
            (j.operationalPlan?.execution.endMs ??
              Date.parse(
                j.routeCompliance?.route.arrivalAtIso ??
                  j.planDecision?.arrivalAt ??
                  "",
              )),
      )
    )
      return fail("O plano interfere com um compromisso confirmado.");
  }
  const resources = {
    trucks: new Map(trucks.map((t) => [t.id, t])),
    drivers: new Map(drivers.map((d) => [d.id, d])),
    trailers: new Map(trailers.map((t) => [t.id, t])),
  };
  let next = jobs;
  const events: OperationalEvent[] = [],
    compliance: Record<string, RouteComplianceRecord[]> = {};
  for (const e of [...selected.executions].sort(
    (a, b) => a.startMs - b.startMs || a.jobId.localeCompare(b.jobId),
  )) {
    const job = next.find((j) => j.id === e.jobId),
      truck = resources.trucks.get(e.assignment.truckId);
    if (
      !job ||
      job.status !== "backlog" ||
      job.revision !== e.jobRevision ||
      !truck
    )
      return fail(
        "O plano inclui trabalho confirmado, executado ou alterado; a parte bloqueada não pode ser reescrita.",
      );
    const records: RouteComplianceRecord[] = [];
    for (const m of e.movements) {
      const input = { ...m.evaluationInput },
        opts = {
          timeToleranceMin: 15,
          sampleStepMin: 5,
          timing: m.timingModel,
        };
      const report = evaluateCompliance(dataset, input, opts, now);
      const rc = createComplianceRecord({
        job,
        truck,
        dataset,
        option: m.route,
        title: `${m.kind}: ${m.route.title}`,
        departAt: new Date(m.departMs),
        liveInput: input,
        evaluationOptions: opts,
        liveReport: report,
        followsOfficialAlternatives: [],
        now,
      });
      if (!rc)
        return fail(
          `Não é possível reproduzir/confirmar a conformidade do movimento ${m.kind} de ${job.jobNumber}.`,
        );
      records.push(rc);
    }
    compliance[job.id] = records;
    const loaded = e.movements.find((m) => m.kind === "LOADED"),
      loadedRecord = records[e.movements.findIndex((m) => m.kind === "LOADED")];
    if (!loaded || !loadedRecord)
      return fail("Plano sem rota carregada reproduzível.");
    const busy = next.some(
      (j) =>
        j.id !== job.id &&
        ["assigned", "loading", "in_transit", "queued"].includes(j.status) &&
        (j.assignedTruckId === e.assignment.truckId ||
          j.assignedDriverId === e.assignment.driverId ||
          (e.assignment.trailerId &&
            j.assignedTrailerId === e.assignment.trailerId)),
    );
    const confirmed = confirmPlan(
      next,
      job.id,
      {
        ...e.assignment,
        mode: busy ? "queued" : "assigned",
        km: e.movements
          .filter((m) => m.kind === "LOADED")
          .reduce((s, m) => s + m.route.distanceM / 1000, 0),
        durationMin: (e.endMs - e.pickupMs) / 60_000,
        costEur: e.movements.reduce(
          (s, m) => s + m.route.fuelCostEur + m.route.tollCostEur,
          0,
        ),
        compliance: loadedRecord,
        decision: {
          confirmedAt: now.toISOString(),
          routeTitle: "Plano operacional automático",
          departureAt: new Date(loaded.departMs).toISOString(),
          arrivalAt: new Date(e.endMs).toISOString(),
          assumptions: e.reasons
            .filter((reason) =>
              /UNKNOWN|UNCONFIRMED|UNVERIFIED/.test(reason.code),
            )
            .map((reason) => reason.code),
          windowResult: {
            ok:
              e.reasons.some((reason) =>
                /WINDOW.*UNKNOWN|AT_RISK/.test(reason.code),
              ) || job.stops.some((s) => !s.windowStartAt && !s.windowEndAt)
                ? null
                : true,
            text: "Janelas datadas avaliadas no plano; dados sem data continuam por validar.",
          },
          eu561: {
            ok: e.reasons.some(
              (reason) => reason.code === "DRIVING_BASELINE_UNKNOWN",
            )
              ? null
              : true,
            text: "Condução carregada e vazia, pausas/descansos e limite semanal avaliados.",
          },
          roadIntelligence: {
            tone: e.movements.some(
              (m) => m.report.status === "POTENTIALLY_AFFECTED",
            )
              ? "warn"
              : "ok",
            text: "Restrições avaliadas por movimento e com factos reais da viatura; cobertura parcial.",
          },
        },
      },
      { now, resources },
    );
    if (!confirmed.ok) return confirmed;
    next = confirmed.value.jobs.map((j) =>
      j.id === job.id
        ? {
            ...j,
            plannedDepartureAt: new Date(loaded.departMs).toISOString(),
            operationalPlan: {
              planId: args.id,
              confirmedAt: now.toISOString(),
              execution: structuredClone(e),
              economics: structuredClone(selected.economics),
              compliance: records,
              datasetVersion: dataset.version,
              truckSpecification: truckPlanningSpecification(truck),
              driverSpecification: driverPlanningSpecification(
                resources.drivers.get(e.assignment.driverId)!,
              ),
              ...(e.assignment.trailerId
                ? {
                    trailerSpecification: trailerPlanningSpecification(
                      resources.trailers.get(e.assignment.trailerId)!,
                    ),
                  }
                : {}),
            },
          }
        : j,
    );
    events.push(...confirmed.value.events);
  }
  return ok({
    jobs: next,
    events,
    record: {
      schemaVersion: 1,
      id: args.id,
      recommended: structuredClone(recommended),
      selected: structuredClone(selected),
      confirmedAt: now.toISOString(),
      source: "HUMAN_CONFIRMED",
      compliance,
    },
  });
}
