import { useState } from "react";
import type { ResourceAvailability, Trailer, TrailerType } from "../../data/types";
import { useFleetData } from "../../context/FleetDataContext";
import { AVAILABILITY_LABEL } from "../../domain/fleet/trucks";
import { TRAILER_TYPES, type TrailerDraft } from "../../domain/fleet/trailers";
import { Field, FormDrawer, inputCls, numStr, optNum, Section } from "../forms/FormDrawer";

type F = Record<"plate" | "unitNumber" | "make" | "model" | "typeLabel" | "lengthM" | "widthM" | "heightM" | "tareKg" | "maxGrossWeightKg" | "payloadKg" | "axleCount" | "palletCapacity" | "tempMinC" | "tempMaxC" | "other" | "notes", string> & {
  type: TrailerType;
  availability: ResourceAvailability;
  refrigerated: boolean;
  adrSuitable: boolean;
  tailLift: boolean;
};

function toForm(t?: Trailer): F {
  return {
    plate: t?.plate ?? "", unitNumber: t?.unitNumber ?? "", make: t?.make ?? "", model: t?.model ?? "", type: t?.type ?? "CURTAINSIDER", typeLabel: t?.typeLabel ?? "",
    lengthM: numStr(t?.lengthM), widthM: numStr(t?.widthM), heightM: numStr(t?.heightM), tareKg: numStr(t?.tareKg), maxGrossWeightKg: numStr(t?.maxGrossWeightKg),
    payloadKg: numStr(t?.payloadKg), axleCount: numStr(t?.axleCount), palletCapacity: numStr(t?.palletCapacity), availability: t?.availability ?? "AVAILABLE",
    refrigerated: !!t?.capabilities.refrigerated, tempMinC: numStr(t?.capabilities.tempMinC), tempMaxC: numStr(t?.capabilities.tempMaxC),
    adrSuitable: !!t?.capabilities.adrSuitable, tailLift: !!t?.capabilities.tailLift, other: (t?.capabilities.other ?? []).join(", "), notes: t?.notes ?? "",
  };
}

function toDraft(f: F): TrailerDraft {
  const caps: Trailer["capabilities"] = {};
  if (f.refrigerated || f.type === "REFRIGERATED") caps.refrigerated = true;
  const tmin = optNum(f.tempMinC);
  const tmax = optNum(f.tempMaxC);
  if (tmin !== undefined) caps.tempMinC = tmin;
  if (tmax !== undefined) caps.tempMaxC = tmax;
  if (f.adrSuitable) caps.adrSuitable = true;
  if (f.tailLift) caps.tailLift = true;
  const other = f.other.split(",").map((x) => x.trim()).filter(Boolean);
  if (other.length) caps.other = other;
  const d: TrailerDraft = {
    plate: f.plate, type: f.type, availability: f.availability, capabilities: caps,
    unitNumber: f.unitNumber.trim() || undefined, make: f.make.trim() || undefined, model: f.model.trim() || undefined,
    typeLabel: f.type === "OTHER" ? f.typeLabel.trim() : undefined,
    lengthM: optNum(f.lengthM), widthM: optNum(f.widthM), heightM: optNum(f.heightM), tareKg: optNum(f.tareKg),
    maxGrossWeightKg: optNum(f.maxGrossWeightKg), payloadKg: optNum(f.payloadKg), axleCount: optNum(f.axleCount),
    palletCapacity: optNum(f.palletCapacity), notes: f.notes.trim() || undefined,
  };
  for (const k of Object.keys(d) as (keyof TrailerDraft)[]) if (d[k] === undefined) delete d[k];
  return d;
}

export function TrailerFormModal({ trailer, onClose, onSaved }: { trailer?: Trailer; onClose: () => void; onSaved?: (r: Trailer) => void }) {
  const { service } = useFleetData();
  const [f, setF] = useState<F>(() => toForm(trailer));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof F, label: string, ph?: string) => (
    <Field label={label}><input className={inputCls} value={f[k] as string} placeholder={ph} onChange={(e) => set(k, e.target.value as never)} /></Field>
  );

  async function submit() {
    setBusy(true);
    const draft = toDraft(f);
    const r = trailer ? await service.updateTrailer(trailer.id, draft) : await service.createTrailer(draft);
    setBusy(false);
    if (!r.ok) return setErrors(r.errors);
    onClose();
    onSaved?.(r.value);
  }

  return (
    <FormDrawer
      title={trailer ? `Editar reboque ${trailer.plate}` : "Novo reboque"}
      eyebrow={trailer?.isDemo ? "Frota · registo DEMO" : "Frota · reboque"}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      errors={errors}
      submitLabel={trailer ? "Guardar" : "Criar reboque"}
    >
      <Section title="Identificação">
        <div className="grid grid-cols-3 gap-2">
          {txt("plate", "Matrícula *", "L-000000")}
          {txt("unitNumber", "N.º de unidade")}
          <Field label="Tipo">
            <select className={inputCls} value={f.type} onChange={(e) => set("type", e.target.value as TrailerType)}>
              {TRAILER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          {f.type === "OTHER" && txt("typeLabel", "Tipo (descrição) *")}
          {txt("make", "Marca")}
          {txt("model", "Modelo")}
          <Field label="Disponibilidade (manual)">
            <select className={inputCls} value={f.availability} onChange={(e) => set("availability", e.target.value as ResourceAvailability)}>
              {(Object.keys(AVAILABILITY_LABEL) as ResourceAvailability[]).map((a) => <option key={a} value={a}>{AVAILABILITY_LABEL[a]}</option>)}
            </select>
          </Field>
        </div>
      </Section>
      <Section title="Especificação">
        <div className="grid grid-cols-3 gap-2">
          {txt("lengthM", "Comprimento (m)")}
          {txt("widthM", "Largura (m)")}
          {txt("heightM", "Altura (m)")}
          {txt("tareKg", "Tara (kg)")}
          {txt("maxGrossWeightKg", "Peso bruto máx. (kg)")}
          {txt("payloadKg", "Carga útil (kg)")}
          {txt("axleCount", "Eixos")}
          {txt("palletCapacity", "Lugares de palete")}
        </div>
      </Section>
      <Section title="Capacidades">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.refrigerated || f.type === "REFRIGERATED"} disabled={f.type === "REFRIGERATED"} onChange={(e) => set("refrigerated", e.target.checked)} /> Frigorífico</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.adrSuitable} onChange={(e) => set("adrSuitable", e.target.checked)} /> Apto ADR</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.tailLift} onChange={(e) => set("tailLift", e.target.checked)} /> Plataforma elevatória</label>
        </div>
        {(f.refrigerated || f.type === "REFRIGERATED") && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {txt("tempMinC", "Temp. mín. (°C)")}
            {txt("tempMaxC", "Temp. máx. (°C)")}
          </div>
        )}
        <div className="mt-2">{txt("other", "Outras (separadas por vírgula)", "bi-temperatura, porta-paletes")}</div>
      </Section>
      <Section title="Notas">
        <textarea className={`${inputCls} min-h-[60px]`} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Section>
    </FormDrawer>
  );
}
