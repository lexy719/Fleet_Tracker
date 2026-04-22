import { STATUS_LABELS } from "../context/JobsContext";
import type { Job, TruckStatus } from "../data/types";
import { primaryOperationalJob } from "./jobOperational";

/**
 * Estado operacional a partir dos trabalhos (TMS) vs telemetria estática (mock).
 * Quando há trabalho activo, o TMS é a fonte de verdade para «em serviço».
 */
export function fleetBadgeFromJobs(
  jobs: Job[],
  truckId: string,
  telemStatus: TruckStatus,
): { label: string; hint?: string } {
  const op = primaryOperationalJob(jobs, truckId);
  if (op) {
    const hint =
      telemStatus === "idle" && ["assigned", "loading", "in_transit"].includes(op.status)
        ? "Telemetria ainda «idle» no demo — estado operacional vem do trabalho."
        : undefined;
    return { label: STATUS_LABELS[op.status], hint };
  }
  const queued = jobs.find((j) => j.assignedTruckId === truckId && j.status === "queued");
  if (queued) {
    return {
      label: "Na fila",
      hint: "Tem trabalho a aguardar — a viatura está ocupada com outro trabalho.",
    };
  }
  /* Sem trabalho ativo: viatura livre. */
  const telemLabel =
    telemStatus === "idle"       ? "Disponível"   :
    telemStatus === "in_transit" ? "Em viagem"    :
    telemStatus === "loading"    ? "A carregar"   :
    telemStatus === "maintenance"? "Em manutenção":
                                   "Parada";
  return {
    label: telemLabel,
    hint:
      telemStatus === "idle"
        ? "Viatura livre — pode ser atribuída a um trabalho."
        : undefined,
  };
}

/** Uma linha única para o planeador de dispatch (sem «disponível» + «em trânsito» ao mesmo tempo). */
export function dispatchTruckStatusLine(args: {
  jobs: Job[];
  truckId: string;
  currentJobId: string;
  telemStatus: TruckStatus;
  maxWeightT: number;
  overCapacity: boolean;
}): string {
  const { jobs, truckId, currentJobId, telemStatus, maxWeightT, overCapacity } = args;
  const ops = jobs.filter(
    (j) =>
      j.assignedTruckId === truckId &&
      ["assigned", "loading", "in_transit"].includes(j.status),
  );
  const sort = (a: Job, b: Job) => {
    const o: Record<string, number> = { in_transit: 0, loading: 1, assigned: 2 };
    return (o[a.status] ?? 9) - (o[b.status] ?? 9) || a.id.localeCompare(b.id);
  };
  ops.sort(sort);
  const firstOp = ops[0];

  const cap = `Cap. ${maxWeightT.toFixed(0)} t`;
  if (!firstOp) {
    const statusLabel: Record<string, string> = {
      idle:        "parada · disponível",
      loading:     "a carregar",
      in_transit:  "em viagem",
      maintenance: "em manutenção",
      delayed:     "atrasada",
    };
    return `Livre · ${statusLabel[telemStatus] ?? telemStatus} · ${cap}${overCapacity ? " · ⚠ capacidade insuficiente" : ""}`;
  }

  const opPart =
    firstOp.id === currentJobId
      ? `Este trabalho · ${STATUS_LABELS[firstOp.status]}`
      : `${firstOp.id} · ${STATUS_LABELS[firstOp.status]}`;
  return `${opPart} · ${cap}${overCapacity ? " · ⚠ capacidade insuficiente" : ""}`;
}
