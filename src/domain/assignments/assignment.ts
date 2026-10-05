import type { Driver, Job, Trailer, Truck } from "../../data/types";
import {
  driverAssignmentBlockedMessage,
  driverLineIncompatibleMessage,
  resolveAssignmentMode,
  truckLineIncompatibleMessage,
  type AssignmentMode,
} from "../../lib/truckJobConstraints";
import { driverQualifications, holdsHeavyGoodsLicence } from "../drivers/drivers";
import { truckPayloadKg } from "../fleet/trucks";

/*
 * Basic assignment validity for the planner (Phase 5). Blockers prevent confirmation;
 * warnings are shown but do not block — qualification enforcement and time-aware
 * resource scheduling belong to Phase 6.
 */

export type AssignmentCheck = {
  mode: AssignmentMode | null;
  blockers: string[];
  warnings: string[];
};

export function checkAssignment(args: {
  jobs: Job[];
  job: Job;
  truck: Truck | undefined;
  driver: Driver | undefined;
  trailer?: Trailer | undefined;
  trailerId?: string;
  now: Date;
}): AssignmentCheck {
  const { jobs, job, truck, driver, trailer, now } = args;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!truck) blockers.push("Selecione uma viatura.");
  else if (truck.archivedAt) blockers.push("A viatura está arquivada.");
  else if (truck.availability !== "AVAILABLE") blockers.push(`A viatura está «${truck.availability === "MAINTENANCE" ? "em manutenção" : "fora de serviço"}».`);

  if (!driver) blockers.push("Selecione um motorista.");
  else if (driver.archivedAt) blockers.push("O motorista está arquivado.");
  else if (driver.availability === "LEAVE" || driver.availability === "UNAVAILABLE") blockers.push(`O motorista está «${driver.availability === "LEAVE" ? "ausente" : "indisponível"}».`);
  else if (driver.availability === "OFF_DUTY") warnings.push("O motorista está marcado como fora de serviço.");

  if (args.trailerId && !trailer) blockers.push("O reboque selecionado não existe.");
  if (trailer) {
    if (trailer.archivedAt) blockers.push("O reboque está arquivado.");
    else if (trailer.availability !== "AVAILABLE") blockers.push("O reboque não está disponível.");
    if (truck && truck.vehicleType !== "TRACTOR") warnings.push("Reboque atribuído a uma viatura que não é trator.");
    const busy = jobs.find((j) => j.id !== job.id && j.assignedTrailerId === trailer.id && ["assigned", "loading", "in_transit"].includes(j.status));
    if (busy) warnings.push(`O reboque também está no trabalho ${busy.jobNumber} (sem verificação temporal até à Fase 6).`);
  }

  // Capacity — payload of the trailer when coupled, else of the truck.
  const payload = trailer?.payloadKg ?? (truck ? truckPayloadKg(truck) : null);
  if (payload === null || payload === undefined) warnings.push("Carga útil desconhecida — capacidade não verificada.");
  else if (job.totalWeightKg > payload) blockers.push(`Peso da carga (${job.totalWeightKg.toLocaleString("pt-PT")} kg) excede a carga útil (${payload.toLocaleString("pt-PT")} kg).`);
  const pallets = trailer?.palletCapacity ?? truck?.palletCapacity;
  if (pallets !== undefined && job.totalPallets > pallets) blockers.push(`Paletes (${job.totalPallets}) excedem a capacidade (${pallets}).`);

  if (job.cargoType === "refrigerated" || job.tempTargetC) {
    const reefer = trailer ? !!trailer.capabilities.refrigerated : truck?.bodyType === "reefer";
    if (!reefer) warnings.push("Carga refrigerada sem equipamento frigorífico registado.");
  }
  const isAdr = job.cargoType === "hazmat" || !!job.adrClass || job.cargo.some((c) => c.dangerousGoods);
  if (isAdr) {
    if (truck && !truck.adrEquipped) warnings.push("Mercadoria perigosa — viatura sem equipamento ADR registado.");
    if (trailer && !trailer.capabilities.adrSuitable) warnings.push("Mercadoria perigosa — reboque sem aptidão ADR registada.");
  }

  if (driver) {
    if (!holdsHeavyGoodsLicence(driver)) warnings.push("Motorista sem categoria C/CE registada.");
    const q = driverQualifications(driver, now);
    for (const x of q) {
      if (x.kind === "adr" && !isAdr) continue;
      if (x.kind === "adr" && x.state === "NOT_HELD") warnings.push("Mercadoria perigosa — motorista sem certificado ADR.");
      else if (x.state === "EXPIRED") warnings.push(`${x.label}: caducado (${x.expiresOn}).`);
      else if (x.state === "MISSING") warnings.push(`${x.label}: validade não registada.`);
    }
  }

  let mode: AssignmentMode | null = null;
  if (truck && driver) {
    mode = resolveAssignmentMode(args.jobs, job.id, truck.id, driver.id);
    if (mode === null) {
      blockers.push(
        truckLineIncompatibleMessage(jobs, job.id, truck.id, driver.id) ??
          driverLineIncompatibleMessage(jobs, job.id, truck.id, driver.id) ??
          driverAssignmentBlockedMessage(jobs, job.id, driver.id) ??
          "Combinação viatura/motorista inválida.",
      );
    }
  }
  return { mode: blockers.length ? null : mode, blockers, warnings };
}
