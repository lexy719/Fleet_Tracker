import { anchorJob, type GuidedLens, type GuidedState } from "../guidedWorkspace";
import { demoContext, jobById } from "../guidedContent";
import {
  NOW,
  ROUTES,
  SPELL_LIMIT,
  driverWorld,
  hm,
  ledger,
  restrictionsFor,
  stopCandidates,
  truckWorld,
  worldJob,
  trailerWorld,
  type LedgerItem,
} from "../world";
import { fact } from "../edits";

/** Product names for lenses. Internal ids stay stable for the semantic contracts. */
export const LENS_LABEL: Record<GuidedLens, string> = {
  Jobs: "Transportes",
  Drivers: "Motorista",
  Trucks: "Viatura",
  Fuel: "Percurso e paragens",
  Restrictions: "Restrições",
  Documents: "Documentos",
  "Pricing DEV": "Economia · DEV",
  "Compliance DEV": "Conformidade · DEV",
};

/**
 * One read model for every instrument: the selected transport and its context.
 * Committed DEV facts always apply; a staged proposal applies only in preview
 * (the default), so every instrument shows its consequence before Confirm.
 */
export function labWorld(state: GuidedState, preview = true) {
  const F = (kind: Parameters<typeof fact>[1], id: string) => fact(state, kind, id, preview);
  const jobId = anchorJob(state.anchor) ?? "J-4217";
  const seededJob = worldJob(jobId);
  const demo = jobById(jobId);
  const context = demoContext(demo, state.assignment);
  const truckId = F("truck", jobId) ?? context.truckId;
  const driverId = F("driver", jobId) ?? seededJob.driverId;
  const trailerId = F("trailer", jobId) ?? seededJob.trailerId;
  const baseJob = { ...seededJob, driverId, trailerId };
  const route = ROUTES[baseJob.routeId];
  const critical = state.exceptions.driverTimeCritical;
  const driver = driverWorld(driverId, {
    stale: state.dev.staleBaseline,
    critical,
    forJob: driverId !== seededJob.driverId ? jobId : undefined,
  });
  const before = F("baseline", driverId);
  if (before != null) {
    const delta = Number(before) - driver.baseline.drivenBeforeMin;
    driver.baseline = { ...driver.baseline, drivenBeforeMin: Number(before), stale: false, recordedLabel: `corrigida hoje ${NOW.clock}` };
    driver.spellMin += delta;
    driver.dayMin += delta;
  }
  const renewal = F("qualification", `${driverId}:cpc`);
  if (renewal)
    driver.qualifications = driver.qualifications.map((q) =>
      q.kind === "cpc" ? { ...q, state: "VALID" as const, until: renewal, detail: "renovação registada" } : q,
    );
  const seededTruck = truckWorld(truckId);
  const axle = F("axle", truckId),
    reading = F("fuel-reading", truckId),
    repaired = F("maintenance", truckId);
  const truck = {
    ...seededTruck,
    firstAxleHeightM: axle != null ? Number(axle) : seededTruck.firstAxleHeightM,
    fuel:
      reading != null
        ? { value: Number(reading), prov: { kind: "KNOWN" as const, source: "manual · registo DEV", at: `hoje ${NOW.clock}` } }
        : seededTruck.fuel,
    ...(repaired === "AVAILABLE"
      ? { availability: "AVAILABLE" as const, state: "ASSIGNED" as const, service: "Reparação concluída · registo DEV" }
      : {}),
  };
  // A missing trailer is a blocker, never silently replaced by another one.
  const trailer = trailerWorld(baseJob.trailerId);
  const candidates = jobId === "J-4217" ? stopCandidates({ critical }) : [];
  const recommended = candidates.find((c) => c.recommended) ?? null;
  const planned =
    candidates.find((c) => c.id === state.planned.stop) ?? recommended;
  // A confirmed stop change re-times everything downstream and requires replanning.
  const ORIGINAL_STOP = "F-07";
  const changedStop = jobId === "J-4217" && state.planned.stop && state.planned.stop !== ORIGINAL_STOP ? planned : null;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let job = baseJob;
  if (jobId === "J-4217" && planned) {
    const shift = toMin(planned.coimbraEta) - toMin("12:57");
    const coimbra = 12 * 60 + 57 + shift,
      porto = 15 * 60 + 12 + shift;
    job = {
      ...baseJob,
      stops: baseJob.stops.map((st) =>
        st.id === "S2" ? { ...st, eta: hm(coimbra) } : st.id === "S3" ? { ...st, eta: hm(porto) } : st,
      ),
      ...(changedStop
        ? {
            plan: "REPLAN_REQUIRED" as const,
            planNote: `Paragem da pausa alterada para ${changedStop.name.replace("Área de serviço de ", "")}`,
            revision: baseJob.revision + 1,
          }
        : {}),
    };
    const a = planned.arrivalMin;
    driver.duty = [
      ...driver.duty.filter((d) => !d.planned),
      { kind: "drive", from: NOW.min, to: a, planned: true },
      { kind: "work", from: a, to: a + 10, planned: true, label: "Abastecer" },
      { kind: "break", from: a + 10, to: a + 55, planned: true, label: "Pausa 45 min" },
      { kind: "drive", from: a + 55, to: coimbra, planned: true },
      { kind: "work", from: coimbra, to: coimbra + 40, planned: true, label: "Descarga Coimbra" },
      { kind: "drive", from: coimbra + 40, to: porto, planned: true },
      { kind: "work", from: porto, to: porto + 40, planned: true, label: "Descarga Porto" },
    ];
  }
  const selectedStop =
    candidates.find((c) => c.id === state.selection.fuel) ?? null;
  const auth = F("authorization", truckId);
  const restrictions = restrictionsFor(jobId, {
    firstAxleHeightM: axle != null ? Number(axle) : undefined,
    vciAuthorization: auth == null ? undefined : auth === "1",
  });
  const restriction =
    restrictions.find((r) => r.id === state.selection.restriction) ??
    restrictions[0];
  const limitMin = NOW.min + (SPELL_LIMIT - driver.spellMin);
  const pallets = job.cargo.reduce((s, c) => s + c.pallets, 0);
  const cargoKg = job.cargo.reduce((s, c) => s + c.weightKg, 0);
  const positionKnown = job.positionKm != null;
  const sinceReadingKm = job.positionKm ?? 0;
  const fuelNowPct = Math.max(
    0,
    truck.fuel.value -
      (sinceReadingKm * truck.consumptionL100.value) / 100 / truck.tankL * 100,
  );
  const rangeKm = Math.round(
    ((fuelNowPct / 100) * truck.tankL) / (truck.consumptionL100.value / 100),
  );
  // Document actions add versions; an issued snapshot is never rewritten.
  const docs: LedgerItem[] = ledger(jobId).flatMap((d): LedgerItem[] => {
    if (d.type !== "CMR" || d.state === "VOID") return [d];
    if ((d.state === "DRAFT" || d.state === "MISSING") && F("issue", d.id))
      return [{ ...d, state: "ISSUED", stateText: "Emitida", number: "CMR 2026/000413", at: NOW.clock, diverges: 0, reason: undefined }];
    if (d.state === "ISSUED" && (state.overrides[`reissue:${d.id}`] || (preview && state.pending?.kind === "reissue" && state.pending.id === d.id)))
      return [
        { ...d, number: "CMR 2026/000413", at: NOW.clock, diverges: 0, stateText: "Emitida · reemissão" },
        { ...d, id: `${d.id}-V`, state: "VOID", stateText: "Anulada", reason: "Substituída pela reemissão", required: "Substituída" },
      ];
    return [d];
  });
  return {
    preview: preview ? state.pending : null,
    jobId,
    job,
    demo,
    context,
    route,
    driver,
    truck,
    trailer,
    trailerMissing: trailer == null,
    positionKnown,
    candidates,
    recommended,
    planned,
    selectedStop,
    ledger: docs,
    restrictions,
    restriction,
    limitMin,
    limit: hm(limitMin),
    pallets,
    cargoKg,
    fuelNowPct,
    rangeKm,
    critical,
    stale: state.dev.staleBaseline,
  };
}
export type LabWorld = ReturnType<typeof labWorld>;
export const kg = (v: number) =>
  `${(v / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1, minimumFractionDigits: v % 1000 ? 1 : 0 })} t`;
export const km = (v: number) => `${Math.round(v).toLocaleString("pt-PT")} km`;
