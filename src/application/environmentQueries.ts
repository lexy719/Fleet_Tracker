import type { OpsSnapshot } from "../repositories/operationalStore";
import type { Job } from "../data/types";
import {
  driverQualifications,
  driverOperationalState,
} from "../domain/drivers/drivers";
import { truckOperationalState } from "../domain/fleet/trucks";
import {
  forwardStep,
  resourceProblems,
  transitionBlockers,
} from "../domain/jobs/lifecycle";
import { missingDocuments } from "../domain/documents/documents";
import { deriveSla } from "../domain/jobs/sla";
import { getRegulationDataset } from "../regulations/repository";
import { createOperationalQueries } from "./operationalQueries";

export type WorkspaceDomain =
  | "Jobs"
  | "Drivers"
  | "Trucks"
  | "Fuel"
  | "Documents"
  | "Restrictions";
export type WorkspaceIssue = {
  domain: WorkspaceDomain;
  text: string;
  severity: "block" | "review";
};
const CLOSED = new Set(["delivered", "invoiced", "cancelled"]);

/** Application-owned projection. No frontend fixture, inferred telemetry or persistence write. */
export function readEnvironment(snapshot: OpsSnapshot, now: Date) {
  const queries = createOperationalQueries(
    snapshot,
    getRegulationDataset(),
    now.getTime(),
  );
  const resources = {
    trucks: new Map(snapshot.trucks.map((t) => [t.id, t])),
    drivers: new Map(snapshot.drivers.map((d) => [d.id, d])),
    trailers: new Map(snapshot.trailers.map((t) => [t.id, t])),
  };
  const jobs = snapshot.jobs
    .map((job) => {
      const truck = resources.trucks.get(job.assignedTruckId ?? "");
      const driver = resources.drivers.get(job.assignedDriverId ?? "");
      const trailer = resources.trailers.get(job.assignedTrailerId ?? "");
      const documents = snapshot.documents.filter((d) => d.jobId === job.id);
      const qualifications = driver ? driverQualifications(driver, now) : [];
      const stops = [...job.stops].sort((a, b) => a.sequence - b.sequence);
      const nextStop = stops.find((s) => !s.completed);
      const step = forwardStep(job.status);
      const blockers = step
        ? transitionBlockers(job, step.to, { now, resources })
        : [];
      const issues: WorkspaceIssue[] = [];
      if (!CLOSED.has(job.status)) {
        resourceProblems(job, resources).forEach((text) =>
          issues.push({
            domain: text.includes("motorista") ? "Drivers" : "Trucks",
            text,
            severity: "block",
          }),
        );
        if (truck?.availability === "MAINTENANCE")
          issues.push({
            domain: "Trucks",
            text: "Viatura em manutenção",
            severity: "review",
          });
        if (job.planStatus !== "PLANNED")
          issues.push({
            domain: "Fuel",
            text:
              job.planStatus === "REPLAN_REQUIRED"
                ? "Percurso invalidado: rever o plano"
                : "Percurso por confirmar",
            severity: "review",
          });
        qualifications
          .filter((q) => q.state === "EXPIRED" || q.state === "MISSING")
          .forEach((q) =>
            issues.push({
              domain: "Drivers",
              text: `${q.label} ${q.state === "EXPIRED" ? "caducada" : "por verificar"}`,
              severity: "review",
            }),
          );
        if (driver && !driver.hours)
          issues.push({
            domain: "Drivers",
            text: "Base de condução em falta",
            severity: "review",
          });
        missingDocuments(job, documents).forEach((type) =>
          issues.push({
            domain: "Documents",
            text: type === "CMR" ? "Guia CMR por emitir" : "Fatura por emitir",
            severity: "review",
          }),
        );
        if (deriveSla(job, now) !== "on_track")
          issues.push({
            domain: "Jobs",
            text:
              deriveSla(job, now) === "breached"
                ? "Prazo ultrapassado"
                : "Prazo em risco",
            severity: "review",
          });
      }
      const assignment = queries.getResourceAssignment(job.id);
      return {
        job,
        truck,
        driver,
        trailer,
        documents,
        qualifications,
        stops,
        nextStop,
        step,
        blockers,
        issues,
        assignment,
        sla: deriveSla(job, now),
        active: !CLOSED.has(job.status),
      };
    })
    .sort(
      (a, b) =>
        Number(b.active && ["loading", "in_transit"].includes(b.job.status)) -
          Number(
            a.active && ["loading", "in_transit"].includes(a.job.status),
          ) ||
        b.issues.filter((i) => i.severity === "block").length -
          a.issues.filter((i) => i.severity === "block").length ||
        b.issues.length - a.issues.length ||
        Date.parse(a.job.deliveryDeadline) -
          Date.parse(b.job.deliveryDeadline) ||
        a.job.id.localeCompare(b.job.id),
    );
  const commitments = (rows: typeof jobs) =>
    rows.sort((a, b) => {
      // Active work first, followed by dated commitments. Missing dates sort last.
      const executing = (j: Job) =>
        ["loading", "in_transit"].includes(j.status) ? 0 : 1;
      const start = (j: Job) =>
        Date.parse(j.stops.find((s) => !s.completed)?.windowStartAt ?? "") ||
        Infinity;
      return (
        executing(a.job) - executing(b.job) ||
        start(a.job) - start(b.job) ||
        a.job.id.localeCompare(b.job.id)
      );
    });
  const drivers = snapshot.drivers
    .filter((d) => !d.archivedAt)
    .map((driver) => ({
      driver,
      state: driverOperationalState(driver, snapshot.jobs),
      qualifications: driverQualifications(driver, now),
      jobs: commitments(
        jobs.filter((r) => r.active && r.job.assignedDriverId === driver.id),
      ),
    }))
    .sort(
      (a, b) =>
        Number(b.jobs.length > 0) - Number(a.jobs.length > 0) ||
        a.driver.name.localeCompare(b.driver.name),
    );
  const trucks = snapshot.trucks
    .filter((t) => !t.archivedAt)
    .map((truck) => ({
      truck,
      state: truckOperationalState(truck, snapshot.jobs),
      jobs: commitments(
        jobs.filter((r) => r.active && r.job.assignedTruckId === truck.id),
      ),
    }))
    .sort(
      (a, b) =>
        Number(b.jobs.length > 0) - Number(a.jobs.length > 0) ||
        a.truck.plate.localeCompare(b.truck.plate),
    );
  return {
    jobs,
    drivers,
    trucks,
    queries,
    attention: jobs.filter((r) => r.active && r.issues.length > 0),
    unassigned: jobs.filter((r) => r.active && (!r.driver || !r.truck)),
    now: now.toISOString(),
  };
}
export type EnvironmentRead = ReturnType<typeof readEnvironment>;
export type EnvironmentJob = EnvironmentRead["jobs"][number];
export function contextQuestion(
  base: WorkspaceDomain,
  active: WorkspaceDomain[],
) {
  if (
    active.includes("Fuel") &&
    (active.includes("Drivers") || active.includes("Trucks"))
  )
    return "Quem executa cada etapa, com que conjunto e o que falta resolver?";
  if (active.includes("Drivers") && active.includes("Jobs"))
    return "Que transportes tem cada motorista e o que impede a próxima tarefa?";
  if (active.includes("Trucks") && active.includes("Jobs"))
    return "Que conjunto leva cada carga e que dados precisam de revisão?";
  if (active.includes("Documents") && active.length > 1)
    return "Que transportes podem avançar e quais precisam de documentos?";
  return {
    Jobs: "Que transportes precisam de uma decisão?",
    Drivers:
      "Quem está a trabalhar, quem está livre e que habilitações precisam de atenção?",
    Trucks: "Que viaturas estão comprometidas e quais estão disponíveis?",
    Fuel: "Qual é a próxima etapa de cada transporte?",
    Documents: "Que guias estão emitidas e quais estão em falta?",
    Restrictions: "O que foi avaliado e que percursos precisam de revisão?",
  }[base];
}
export const routeName = (job: Job) =>
  `${job.stops[0]?.city || "Origem por definir"} → ${job.stops.at(-1)?.city || "Destino por definir"}`;
