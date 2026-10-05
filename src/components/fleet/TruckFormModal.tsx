import { useState } from "react";
import type { Measured, ResourceAvailability, Truck, VehicleType } from "../../data/types";
import { useFleetData } from "../../context/FleetDataContext";
import { isoToLocal } from "../../domain/time";
import { AVAILABILITY_LABEL, VEHICLE_TYPES, type TruckDraft } from "../../domain/fleet/trucks";
import { TRUCK_PRESETS } from "../../tomtom/truckPresets";
import { Field, FormDrawer, inputCls, numStr, optNum, Section } from "../forms/FormDrawer";

type F = Record<
  | "plate" | "unitNumber" | "make" | "model" | "yearManuf" | "lengthM" | "widthM" | "heightM" | "grossVehicleWeightKg" | "kerbWeightKg"
  | "payloadKg" | "axleCount" | "maxAxleWeightKg" | "firstAxleHeightM" | "emissionClass" | "palletCapacity" | "routingPresetId"
  | "odometerKm" | "fuelCapacityL" | "fuelLevelPct" | "notes" | "ownerCategory",
  string
> & { vehicleType: VehicleType; bodyType: string; availability: ResourceAvailability; adrEquipped: boolean };

function toForm(t?: Truck): F {
  return {
    plate: t?.plate ?? "", unitNumber: t?.unitNumber ?? "", make: t?.make ?? "", model: t?.model ?? "", yearManuf: numStr(t?.yearManuf),
    vehicleType: t?.vehicleType ?? "TRACTOR", bodyType: t?.bodyType ?? "", availability: t?.availability ?? "AVAILABLE",
    lengthM: numStr(t?.lengthM), widthM: numStr(t?.widthM), heightM: numStr(t?.heightM),
    grossVehicleWeightKg: numStr(t?.grossVehicleWeightKg), kerbWeightKg: numStr(t?.kerbWeightKg), payloadKg: numStr(t?.payloadKg),
    axleCount: numStr(t?.axleCount), maxAxleWeightKg: numStr(t?.maxAxleWeightKg), firstAxleHeightM: numStr(t?.firstAxleHeightM),
    emissionClass: t?.emissionClass ?? "", adrEquipped: !!t?.adrEquipped, palletCapacity: numStr(t?.palletCapacity),
    routingPresetId: t?.routingPresetId ?? "", odometerKm: numStr(t?.odometerKm?.value), fuelCapacityL: numStr(t?.fuelCapacityL),
    fuelLevelPct: numStr(t?.fuelLevelPct?.value), notes: t?.notes ?? "", ownerCategory: t?.ownerCategory ?? "",
  };
}

/** A manual measurement keeps its timestamp unless the value changed (then it is re-recorded now, MANUAL). */
function measured(prev: Measured<number> | undefined, s: string, now: string): Measured<number> | undefined {
  const v = optNum(s);
  if (v === undefined) return undefined;
  if (prev && prev.value === v) return prev;
  return { value: v, recordedAt: now, source: "MANUAL" };
}

function toDraft(f: F, t: Truck | undefined, now: string): TruckDraft {
  const d: TruckDraft = {
    plate: f.plate, vehicleType: f.vehicleType, availability: f.availability,
    unitNumber: f.unitNumber.trim() || undefined, make: f.make.trim() || undefined, model: f.model.trim() || undefined,
    yearManuf: optNum(f.yearManuf), bodyType: (f.bodyType || undefined) as Truck["bodyType"],
    lengthM: optNum(f.lengthM), widthM: optNum(f.widthM), heightM: optNum(f.heightM),
    grossVehicleWeightKg: optNum(f.grossVehicleWeightKg), kerbWeightKg: optNum(f.kerbWeightKg), payloadKg: optNum(f.payloadKg),
    axleCount: optNum(f.axleCount), maxAxleWeightKg: optNum(f.maxAxleWeightKg), firstAxleHeightM: optNum(f.firstAxleHeightM),
    emissionClass: f.emissionClass.trim() || undefined, adrEquipped: f.adrEquipped || undefined, palletCapacity: optNum(f.palletCapacity),
    ownerCategory: f.ownerCategory.trim() || undefined, routingPresetId: f.routingPresetId || undefined,
    odometerKm: measured(t?.odometerKm, f.odometerKm, now), fuelCapacityL: optNum(f.fuelCapacityL),
    fuelLevelPct: measured(t?.fuelLevelPct, f.fuelLevelPct, now), notes: f.notes.trim() || undefined,
  };
  for (const k of Object.keys(d) as (keyof TruckDraft)[]) if (d[k] === undefined) delete d[k];
  return d;
}

export function TruckFormModal({ truck, onClose, onSaved }: { truck?: Truck; onClose: () => void; onSaved?: (r: Truck) => void }) {
  const { service } = useFleetData();
  const [f, setF] = useState<F>(() => toForm(truck));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof F, label: string, ph?: string) => (
    <Field label={label}><input className={inputCls} value={f[k] as string} placeholder={ph} onChange={(e) => set(k, e.target.value as never)} /></Field>
  );

  async function submit() {
    setBusy(true);
    const draft = toDraft(f, truck, new Date().toISOString());
    // The form covers every editable field; demo/archive markers are preserved by the domain.
    const r = truck ? await service.updateTruck(truck.id, draft) : await service.createTruck(draft);
    setBusy(false);
    if (!r.ok) return setErrors(r.errors);
    onClose();
    onSaved?.(r.value);
  }

  return (
    <FormDrawer
      title={truck ? `Editar ${truck.plate}` : "Nova viatura"}
      eyebrow={truck?.isDemo ? "Frota · registo DEMO" : "Frota · viatura"}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      errors={errors}
      submitLabel={truck ? "Guardar" : "Criar viatura"}
    >
      <Section title="Identificação">
        <div className="grid grid-cols-3 gap-2">
          {txt("plate", "Matrícula *", "AA-00-BB")}
          {txt("unitNumber", "N.º de unidade")}
          {txt("yearManuf", "Ano")}
          {txt("make", "Marca")}
          {txt("model", "Modelo")}
          <Field label="Tipo">
            <select className={inputCls} value={f.vehicleType} onChange={(e) => set("vehicleType", e.target.value as VehicleType)}>
              {VEHICLE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Carroçaria">
            <select className={inputCls} value={f.bodyType} onChange={(e) => set("bodyType", e.target.value)}>
              <option value="">—</option>
              <option value="curtainsider">Cortinas</option>
              <option value="box">Caixa</option>
              <option value="reefer">Frigorífico</option>
              <option value="flatbed">Plataforma</option>
              <option value="tanker">Cisterna</option>
            </select>
          </Field>
          <Field label="Disponibilidade (manual)">
            <select className={inputCls} value={f.availability} onChange={(e) => set("availability", e.target.value as ResourceAvailability)}>
              {(Object.keys(AVAILABILITY_LABEL) as ResourceAvailability[]).map((a) => <option key={a} value={a}>{AVAILABILITY_LABEL[a]}</option>)}
            </select>
          </Field>
          {txt("emissionClass", "Classe de emissões", "Euro VI")}
        </div>
        <p className="mt-1 text-[11px]" style={{ color: "var(--app-muted)" }}>«Atribuída» e «Em serviço» são derivados dos trabalhos — não se definem aqui.</p>
      </Section>

      <Section title="Dimensões e pesos (documentos da viatura)" hint="Usados no cálculo de rotas. Campos vazios são preenchidos pelo perfil genérico e indicados como suposição no planeador.">
        <div className="grid grid-cols-3 gap-2">
          {txt("lengthM", "Comprimento (m)")}
          {txt("widthM", "Largura (m)")}
          {txt("heightM", "Altura (m)")}
          {txt("grossVehicleWeightKg", "Peso bruto (kg)")}
          {txt("kerbWeightKg", "Tara (kg)")}
          {txt("payloadKg", "Carga útil (kg)")}
          {txt("axleCount", "Eixos")}
          {txt("maxAxleWeightKg", "Peso máx. por eixo (kg)")}
          {txt("firstAxleHeightM", "Altura ao 1.º eixo (m)")}
          {txt("palletCapacity", "Lugares de palete")}
          {txt("ownerCategory", "Categoria do proprietário", "private")}
          <Field label="Perfil genérico (só p/ valores em falta)">
            <select className={inputCls} value={f.routingPresetId} onChange={(e) => set("routingPresetId", e.target.value)}>
              <option value="">Automático (pelo tipo/eixos)</option>
              {TRUCK_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
        </div>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={f.adrEquipped} onChange={(e) => set("adrEquipped", e.target.checked)} /> Equipada para ADR</label>
      </Section>

      <Section title="Registos manuais (não é telemetria)" hint="Valores introduzidos à mão; a data de registo é guardada e mostrada.">
        <div className="grid grid-cols-3 gap-2">
          {txt("odometerKm", "Conta-quilómetros (km)")}
          {txt("fuelCapacityL", "Depósito (L)")}
          {txt("fuelLevelPct", "Combustível (%)")}
        </div>
        {truck?.odometerKm && <p className="mt-1 text-[11px]" style={{ color: "var(--app-muted)" }}>Km registados em {isoToLocal(truck.odometerKm.recordedAt).replace("T", " ")} ({truck.odometerKm.source === "DEMO" ? "demo" : "manual"})</p>}
      </Section>

      <Section title="Notas">
        <textarea className={`${inputCls} min-h-[60px]`} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Section>
    </FormDrawer>
  );
}

