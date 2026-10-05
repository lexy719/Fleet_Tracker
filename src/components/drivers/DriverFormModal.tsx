import { useState } from "react";
import type { Driver, DriverAvailability, DriverHoursBaseline } from "../../data/types";
import { useFleetData } from "../../context/FleetDataContext";
import { DRIVER_AVAILABILITY_LABEL, LICENCE_CATEGORIES, type DriverDraft } from "../../domain/drivers/drivers";
import { isoToLocal, localToIso } from "../../domain/time";
import { Field, FormDrawer, inputCls, Section } from "../forms/FormDrawer";

type F = {
  name: string; employeeNumber: string; phone: string; email: string; homeTerminal: string; availability: DriverAvailability;
  licenceNumber: string; categories: string[]; licenceExpires: string; cpcExpires: string;
  adrCertified: boolean; adrClasses: string; adrTanks: boolean; adrExpires: string; tachoExpires: string;
  hoursToday: string; hoursWeek: string; spellMin: string; dutyStart: string; notes: string;
};

const hm = (min: number | undefined) => (min === undefined ? "" : (min / 60).toFixed(2).replace(/\.?0+$/, ""));

function toForm(d?: Driver): F {
  return {
    name: d?.name ?? "", employeeNumber: d?.employeeNumber ?? "", phone: d?.phone ?? "", email: d?.email ?? "", homeTerminal: d?.homeTerminal ?? "",
    availability: d?.availability ?? "AVAILABLE", licenceNumber: d?.licence.number ?? "", categories: d?.licence.categories ?? ["C", "CE"],
    licenceExpires: d?.licence.expiresOn ?? "", cpcExpires: d?.cpc.expiresOn ?? "", adrCertified: !!d?.adr.certified,
    adrClasses: (d?.adr.classes ?? []).join(", "), adrTanks: !!d?.adr.tanks, adrExpires: d?.adr.expiresOn ?? "", tachoExpires: d?.tachoCardExpiresOn ?? "",
    hoursToday: hm(d?.hours?.drivenTodayMin), hoursWeek: hm(d?.hours?.drivenWeekMin), spellMin: d?.hours?.currentSpellMin !== undefined ? String(d.hours.currentSpellMin) : "",
    dutyStart: isoToLocal(d?.hours?.dutyStartedAt), notes: d?.notes ?? "",
  };
}

function hoursToMin(s: string): number {
  return Math.round(Number(s.replace(",", ".")) * 60);
}

/** Builds the baseline; it is re-timestamped only when its values change (age stays honest). */
function baseline(f: F, prev: DriverHoursBaseline | null | undefined, now: string): DriverHoursBaseline | null {
  if (f.hoursToday.trim() === "" && f.hoursWeek.trim() === "") return null;
  const b: DriverHoursBaseline = {
    drivenTodayMin: hoursToMin(f.hoursToday || "0"),
    drivenWeekMin: hoursToMin(f.hoursWeek || "0"),
    recordedAt: now,
    source: "MANUAL",
  };
  if (f.spellMin.trim() !== "") b.currentSpellMin = Number(f.spellMin);
  if (f.dutyStart) {
    const iso = localToIso(f.dutyStart);
    b.dutyStartedAt = iso ?? "invalid";
  }
  if (prev && prev.drivenTodayMin === b.drivenTodayMin && prev.drivenWeekMin === b.drivenWeekMin && prev.currentSpellMin === b.currentSpellMin && prev.dutyStartedAt === b.dutyStartedAt) return prev;
  return b;
}

function toDraft(f: F, prev: Driver | undefined, now: string): DriverDraft {
  const d: DriverDraft = {
    name: f.name,
    availability: f.availability,
    licence: { categories: f.categories, ...(f.licenceNumber.trim() ? { number: f.licenceNumber.trim() } : {}), ...(f.licenceExpires ? { expiresOn: f.licenceExpires } : {}) },
    cpc: f.cpcExpires ? { expiresOn: f.cpcExpires } : {},
    adr: {
      certified: f.adrCertified,
      ...(f.adrCertified && f.adrClasses.trim() ? { classes: f.adrClasses.split(",").map((x) => x.trim()).filter(Boolean) } : {}),
      ...(f.adrCertified && f.adrTanks ? { tanks: true } : {}),
      ...(f.adrCertified && f.adrExpires ? { expiresOn: f.adrExpires } : {}),
    },
    hours: baseline(f, prev?.hours, now),
    ...(f.employeeNumber.trim() ? { employeeNumber: f.employeeNumber.trim() } : {}),
    ...(f.phone.trim() ? { phone: f.phone.trim() } : {}),
    ...(f.email.trim() ? { email: f.email.trim() } : {}),
    ...(f.homeTerminal.trim() ? { homeTerminal: f.homeTerminal.trim() } : {}),
    ...(f.tachoExpires ? { tachoCardExpiresOn: f.tachoExpires } : {}),
    ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
  };
  return d;
}

export function DriverFormModal({ driver, onClose, onSaved }: { driver?: Driver; onClose: () => void; onSaved?: (r: Driver) => void }) {
  const { service } = useFleetData();
  const [f, setF] = useState<F>(() => toForm(driver));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof F, label: string, type = "text", ph?: string) => (
    <Field label={label}><input type={type} className={inputCls} value={f[k] as string} placeholder={ph} onChange={(e) => set(k, e.target.value as never)} /></Field>
  );

  async function submit() {
    setBusy(true);
    const draft = toDraft(f, driver, new Date().toISOString());
    const r = driver ? await service.updateDriver(driver.id, draft) : await service.createDriver(draft);
    setBusy(false);
    if (!r.ok) return setErrors(r.errors);
    onClose();
    onSaved?.(r.value);
  }

  return (
    <FormDrawer
      title={driver ? `Editar ${driver.name}` : "Novo motorista"}
      eyebrow={driver?.isDemo ? "Motoristas · registo DEMO" : "Motoristas"}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      errors={errors}
      submitLabel={driver ? "Guardar" : "Criar motorista"}
    >
      <Section title="Identificação">
        <div className="grid grid-cols-2 gap-2">
          {txt("name", "Nome *")}
          {txt("employeeNumber", "N.º de colaborador")}
          {txt("phone", "Telefone")}
          {txt("email", "Email", "email")}
          {txt("homeTerminal", "Base")}
          <Field label="Disponibilidade (manual)">
            <select className={inputCls} value={f.availability} onChange={(e) => set("availability", e.target.value as DriverAvailability)}>
              {(Object.keys(DRIVER_AVAILABILITY_LABEL) as DriverAvailability[]).map((a) => <option key={a} value={a}>{DRIVER_AVAILABILITY_LABEL[a]}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Carta de condução">
        <div className="flex flex-wrap gap-2">
          {LICENCE_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-1 rounded-md border px-2 py-1" style={{ borderColor: "var(--app-border)" }}>
              <input type="checkbox" checked={f.categories.includes(c)} onChange={(e) => set("categories", e.target.checked ? [...f.categories, c] : f.categories.filter((x) => x !== c))} /> {c}
            </label>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {txt("licenceNumber", "N.º da carta")}
          {txt("licenceExpires", "Validade da carta", "date")}
          {txt("cpcExpires", "Validade CAM / CPC", "date")}
          {txt("tachoExpires", "Validade cartão de tacógrafo", "date")}
        </div>
      </Section>

      <Section title="ADR">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.adrCertified} onChange={(e) => set("adrCertified", e.target.checked)} /> Certificado ADR</label>
        {f.adrCertified && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {txt("adrClasses", "Classes (vírgulas)", "text", "3, 8")}
            {txt("adrExpires", "Validade ADR", "date")}
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.adrTanks} onChange={(e) => set("adrTanks", e.target.checked)} /> Especialização cisternas</label>
          </div>
        )}
      </Section>

      <Section title="Base de horas de condução (UE 561)" hint="Registo manual (sem tacógrafo integrado). Vale para o dia/semana em que é registado; o planeador mostra a idade do registo e assume 0 h fora desse período.">
        <div className="grid grid-cols-2 gap-2">
          {txt("hoursToday", "Conduzido hoje (h)")}
          {txt("hoursWeek", "Conduzido esta semana (h)")}
          {txt("spellMin", "Desde a última pausa (min)")}
          {txt("dutyStart", "Início do serviço", "datetime-local")}
        </div>
        {driver?.hours && (
          <p className="mt-1 text-[11px]" style={{ color: "var(--app-muted)" }}>
            Último registo: {isoToLocal(driver.hours.recordedAt).replace("T", " ")} ({driver.hours.source === "DEMO" ? "demo" : "manual"})
          </p>
        )}
      </Section>

      <Section title="Notas">
        <textarea className={`${inputCls} min-h-[60px]`} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Section>
    </FormDrawer>
  );
}
