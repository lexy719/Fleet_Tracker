import clsx from "clsx";
import { ArrowDown, ArrowUp, Building2, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, Drawer, Field, IconButton, Notice, SectionTitle } from "../../ui/kit";
import { useMemo, useState } from "react";
import type { CargoLine, CargoType, Customer, Job, JobPriority, Site, StopType } from "../../data/types";
import { useJobs } from "../../context/JobsContext";
import { useOperations } from "../../context/OperationsContext";
import { siteCoordinatesCurrent, stopFieldsFromSite } from "../../domain/records/records";
import { CustomerEditor, SiteEditor } from "../../ui/records/RecordEditors";
import { RecordPicker, type PickerOption } from "../../ui/records/RecordPicker";
import { cargoTotals, EDITABLE_STATUSES, jobToDraft, validateJobDraft, type JobDraft } from "../../domain/jobs/jobDraft";
import { isoToLocal, localToIso } from "../../domain/time";
import { resolveStopCoordinates } from "../../lib/jobStopGeocode";
import { getTomTomKey } from "../../tomtom/config";

/*
 * Create / edit a job: any number of stops (pickup, intermediate, delivery) with DATED
 * windows entered in Lisbon time, a planned departure, and cargo lines (totals derived).
 * Saving goes through the OperationsService; a planning-relevant edit of a planned job
 * invalidates its route (REPLAN_REQUIRED) — the form says so before saving.
 */

const PRIORITIES: { value: JobPriority; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Urgente" },
  { value: "critical", label: "Crítico" },
];
const CARGO_TYPES: { value: CargoType; label: string }[] = [
  { value: "dry", label: "Seco" },
  { value: "refrigerated", label: "Refrigerado" },
  { value: "hazmat", label: "ADR" },
  { value: "bulk", label: "Granel" },
  { value: "automotive", label: "Automóvel" },
];
const STOP_TYPES: { value: StopType; label: string }[] = [
  { value: "pickup", label: "Recolha" },
  { value: "stop", label: "Intermédia" },
  { value: "delivery", label: "Entrega" },
];
const UNITS: { value: CargoLine["unit"]; label: string }[] = [
  { value: "pallet", label: "paletes" },
  { value: "package", label: "volumes" },
  { value: "unit", label: "unidades" },
  { value: "bulk", label: "granel" },
];
export const ADR_CLASSES = [
  "Classe 1 — Explosivos",
  "Classe 2 — Gases",
  "Classe 3 — Líquidos inflamáveis",
  "Classe 4.1 — Sólidos inflamáveis",
  "Classe 4.2 — Substâncias sujeitas a combustão espontânea",
  "Classe 4.3 — Substâncias que em contacto com água emitem gases",
  "Classe 5.1 — Substâncias comburentes",
  "Classe 5.2 — Peróxidos orgânicos",
  "Classe 6.1 — Substâncias tóxicas",
  "Classe 6.2 — Substâncias infecciosas",
  "Classe 7 — Material radioactivo",
  "Classe 8 — Substâncias corrosivas",
  "Classe 9 — Substâncias e objectos perigosos diversos",
];

type StopRow = {
  key: string;
  id?: string;
  /** Site the fields were copied from; cleared by «usar outra morada». */
  siteId?: string;
  type: StopType;
  clientName: string;
  address: string;
  city: string;
  lat?: number;
  lng?: number;
  /** Address the current coordinates belong to (re-geocode when the address changes). */
  locatedFor?: string;
  coords: string;
  from: string;
  until: string;
  notes: string;
  municipality?: string;
};
type CargoRow = { key: string; id?: string; description: string; quantity: string; unit: CargoLine["unit"]; weightKg: string; pallets: string; unNumber: string; adrClass: string };

type Form = {
  customerId?: string;
  client: string;
  reference: string;
  priority: JobPriority;
  cargoType: CargoType;
  rateEur: string;
  notes: string;
  departure: string;
  adrClass: string;
  adrUnNumber: string;
  tempMin: string;
  tempMax: string;
  isInternational: boolean;
  destinationCountryCode: string;
  buyerNif: string;
  stops: StopRow[];
  cargo: CargoRow[];
};

let rowSeq = 0;
const rowKey = () => `row-${++rowSeq}`;

function emptyStop(type: StopType): StopRow {
  return { key: rowKey(), type, clientName: "", address: "", city: "", coords: "", from: "", until: "", notes: "" };
}
function emptyCargo(): CargoRow {
  return { key: rowKey(), description: "", quantity: "", unit: "pallet", weightKg: "", pallets: "", unNumber: "", adrClass: "" };
}

function formFromJob(j: Job): Form {
  const d = jobToDraft(j);
  return {
    customerId: d.customerId,
    client: d.client,
    reference: d.reference,
    priority: d.priority,
    cargoType: d.cargoType,
    rateEur: String(d.rateEur),
    notes: d.notes ?? "",
    departure: isoToLocal(d.plannedDepartureAt),
    adrClass: d.adrClass ?? "",
    adrUnNumber: d.adrUnNumber ?? "",
    tempMin: d.tempTargetC ? String(d.tempTargetC.min) : "2",
    tempMax: d.tempTargetC ? String(d.tempTargetC.max) : "6",
    isInternational: !!d.isInternational,
    destinationCountryCode: d.destinationCountryCode ?? "ES",
    buyerNif: d.buyerNif ?? "",
    stops: d.stops.map((s) => ({
      key: rowKey(), id: s.id, siteId: s.siteId, type: s.type, clientName: s.clientName, address: s.address, city: s.city,
      lat: s.lat, lng: s.lng, locatedFor: s.address, coords: `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`,
      from: isoToLocal(s.windowStartAt), until: isoToLocal(s.windowEndAt), notes: s.notes ?? "", municipality: s.municipality,
    })),
    cargo: d.cargo.map((c) => ({
      key: rowKey(), id: c.id, description: c.description, quantity: String(c.quantity), unit: c.unit, weightKg: String(c.weightKg),
      pallets: c.pallets !== undefined ? String(c.pallets) : "", unNumber: c.dangerousGoods?.unNumber ?? "", adrClass: c.dangerousGoods?.adrClass ?? "",
    })),
  };
}

const EMPTY_FORM = (): Form => ({
  client: "", reference: "", priority: "normal", cargoType: "dry", rateEur: "", notes: "", departure: "",
  adrClass: "", adrUnNumber: "", tempMin: "2", tempMax: "6", isInternational: false, destinationCountryCode: "ES", buyerNif: "",
  stops: [emptyStop("pickup"), emptyStop("delivery")],
  cargo: [emptyCargo()],
});

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));

function parseCoords(s: string): { lat: number; lng: number } | null {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function cityFromAddress(addr: string): string {
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? addr;
}

/** Form → draft (coordinates must already be resolved). Returns per-field local-time errors. */
function toDraft(f: Form): { draft: JobDraft; errors: string[] } {
  const errors: string[] = [];
  const iso = (local: string, label: string): string | undefined => {
    if (!local) return undefined;
    const v = localToIso(local);
    if (!v) errors.push(`${label}: hora inexistente em Lisboa (mudança de hora) ou inválida.`);
    return v ?? undefined;
  };
  const draft: JobDraft = {
    ...(f.customerId ? { customerId: f.customerId } : {}),
    client: f.client,
    reference: f.reference,
    priority: f.priority,
    cargoType: f.cargoType,
    rateEur: f.rateEur.trim() === "" ? 0 : num(f.rateEur),
    ...(f.notes.trim() ? { notes: f.notes } : {}),
    ...(f.departure ? { plannedDepartureAt: iso(f.departure, "Partida planeada") } : {}),
    stops: f.stops.map((s, i) => ({
      ...(s.id ? { id: s.id } : {}),
      ...(s.siteId ? { siteId: s.siteId } : {}),
      type: s.type,
      clientName: s.clientName,
      address: s.address,
      city: s.city.trim() || cityFromAddress(s.address),
      lat: s.lat ?? NaN,
      lng: s.lng ?? NaN,
      ...(s.from ? { windowStartAt: iso(s.from, `Paragem ${i + 1} (início)`) } : {}),
      ...(s.until ? { windowEndAt: iso(s.until, `Paragem ${i + 1} (fim)`) } : {}),
      ...(s.notes.trim() ? { notes: s.notes.trim() } : {}),
      ...(s.municipality ? { municipality: s.municipality } : {}),
    })),
    cargo: f.cargo.map((c) => ({
      ...(c.id ? { id: c.id } : {}),
      description: c.description,
      quantity: num(c.quantity),
      unit: c.unit,
      weightKg: num(c.weightKg),
      ...(c.pallets.trim() !== "" ? { pallets: num(c.pallets) } : c.unit === "pallet" && c.quantity.trim() !== "" ? { pallets: num(c.quantity) } : {}),
      ...(c.unNumber.trim() || c.adrClass ? { dangerousGoods: { ...(c.unNumber.trim() ? { unNumber: c.unNumber.trim().toUpperCase() } : {}), ...(c.adrClass ? { adrClass: c.adrClass } : {}) } } : {}),
    })),
    ...(f.cargoType === "hazmat" && f.adrClass ? { adrClass: f.adrClass, ...(f.adrUnNumber.trim() ? { adrUnNumber: f.adrUnNumber.trim() } : {}) } : {}),
    ...(f.cargoType === "refrigerated" ? { tempTargetC: { min: num(f.tempMin), max: num(f.tempMax) } } : {}),
    ...(f.isInternational ? { isInternational: true, destinationCountryCode: f.destinationCountryCode } : {}),
    ...(f.buyerNif.trim() ? { buyerNif: f.buyerNif.trim() } : {}),
  };
  for (const s of draft.stops) {
    if (s.windowStartAt === undefined) delete s.windowStartAt;
    if (s.windowEndAt === undefined) delete s.windowEndAt;
  }
  if (draft.plannedDepartureAt === undefined) delete draft.plannedDepartureAt;
  return { draft, errors };
}

export function JobFormModal({ job, onClose, onSaved }: { job?: Job; onClose: () => void; onSaved?: (j: Job) => void }) {
  const { createJob, editJob } = useJobs();
  const editing = !!job;
  const [form, setForm] = useState<Form>(() => (job ? formFromJob(job) : EMPTY_FORM()));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const locked = editing && !EDITABLE_STATUSES.includes(job!.status);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setStop = (key: string, patch: Partial<StopRow>) => setForm((f) => ({ ...f, stops: f.stops.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  const setCargo = (key: string, patch: Partial<CargoRow>) => setForm((f) => ({ ...f, cargo: f.cargo.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
  const moveStop = (i: number, d: -1 | 1) =>
    setForm((f) => {
      const s = [...f.stops];
      const j = i + d;
      if (j < 0 || j >= s.length) return f;
      [s[i], s[j]] = [s[j]!, s[i]!];
      return { ...f, stops: s };
    });

  const totals = useMemo(() => {
    const lines = form.cargo.map((c) => ({ id: c.key, description: c.description, quantity: num(c.quantity) || 0, unit: c.unit, weightKg: num(c.weightKg) || 0, ...(c.pallets.trim() !== "" ? { pallets: num(c.pallets) || 0 } : {}) })) as CargoLine[];
    return cargoTotals(lines);
  }, [form.cargo]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    setBusy(true);
    setErrors([]);
    try {
      // Resolve coordinates: manual "lat, lng" wins; otherwise geocode new/changed addresses.
      const apiKey = getTomTomKey();
      const resolved: StopRow[] = [];
      const geoErrors: string[] = [];
      for (const [i, s] of form.stops.entries()) {
        const typed = parseCoords(s.coords);
        if (typed && (s.lat !== typed.lat || s.lng !== typed.lng)) {
          resolved.push({ ...s, lat: typed.lat, lng: typed.lng, locatedFor: s.address });
          continue;
        }
        if (s.lat !== undefined && s.lng !== undefined && s.locatedFor === s.address) {
          resolved.push(s);
          continue;
        }
        if (!s.address.trim()) {
          resolved.push({ ...s, lat: undefined, lng: undefined });
          continue;
        }
        const ll = await resolveStopCoordinates(s.address, apiKey, s.clientName);
        if (!ll) {
          geoErrors.push(`Paragem ${i + 1}: não foi possível localizar «${s.address}». Inclua a localidade/código postal ou indique coordenadas.`);
          resolved.push({ ...s, lat: undefined, lng: undefined });
        } else resolved.push({ ...s, lat: ll.lat, lng: ll.lng, locatedFor: s.address, coords: `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}` });
      }
      const nextForm = { ...form, stops: resolved };
      setForm(nextForm);
      const { draft, errors: timeErrors } = toDraft(nextForm);
      const all = [...geoErrors, ...timeErrors, ...validateJobDraft(draft).filter((m) => !geoErrors.length || !m.includes("coordenadas"))];
      if (all.length) {
        setErrors(all);
        return;
      }
      if (editing) {
        const r = await editJob(job!.id, draft);
        if (!r.ok) return setErrors(r.errors);
        onSaved?.(r.value.job);
      } else {
        const r = await createJob(draft);
        if (!r.ok) return setErrors(r.errors);
        onSaved?.(r.value);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const [more, setMore] = useState(() => !!(job && (job.buyerNif || job.isInternational)));
  const { state: ops } = useOperations();
  const [creatingCustomer, setCreatingCustomer] = useState<string | null>(null);
  const [creatingSite, setCreatingSite] = useState<{ stopKey: string; name: string } | null>(null);
  const [siteQuery, setSiteQuery] = useState<Record<string, string>>({});
  const customerOptions = useMemo<PickerOption[]>(
    () => ops.customers.filter((c) => !c.archivedAt).sort((a, b) => a.name.localeCompare(b.name, "pt")).map((c) => ({ id: c.id, label: c.name, detail: [c.nif, c.billingAddress].filter(Boolean).join(" · ") || undefined })),
    [ops.customers],
  );
  const siteOptions = useMemo<PickerOption[]>(() => {
    const active = ops.sites.filter((x) => !x.archivedAt);
    const own = active.filter((x) => form.customerId && x.customerId === form.customerId);
    const rest = active.filter((x) => !own.includes(x));
    const opt = (x: Site, group?: string): PickerOption => ({ id: x.id, label: x.name, detail: [x.address, x.locality].filter(Boolean).join(", "), group });
    return [...own.map((x) => opt(x, "Locais do cliente")), ...rest.map((x) => opt(x, own.length ? "Outros locais" : undefined))];
  }, [ops.sites, form.customerId]);
  const siteById = (id: string | undefined) => (id ? ops.sites.find((x) => x.id === id) : undefined);
  const pickCustomer = (c: Customer) => setForm((f) => ({ ...f, customerId: c.id, client: c.name, buyerNif: f.buyerNif || c.nif || "" }));
  const pickSite = (stopKey: string, site: Site) => {
    const v = stopFieldsFromSite(site);
    // Known coordinates are reused as they are — never re-geocoded.
    setStop(stopKey, { siteId: v.siteId, clientName: v.clientName, address: v.address, city: v.city, lat: v.lat, lng: v.lng, locatedFor: v.address, coords: `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`, ...(v.notes ? { notes: v.notes } : {}) });
    setSiteQuery((q) => ({ ...q, [stopKey]: "" }));
  };
  const typeLabel = (t: StopType) => (t === "pickup" ? "Recolha" : t === "delivery" ? "Entrega" : "Paragem");

  return (
    <Drawer
      width={760}
      onClose={onClose}
      title={editing ? `Editar ${job!.jobNumber}` : "Novo trabalho"}
      subtitle="Horas em hora de Lisboa"
      footer={
        <>
          <span className="mr-auto num text-[12px] text-[var(--text-2)]" data-testid="cargo-totals">
            Total: {totals.pallets} paletes · {totals.weightKg.toLocaleString("pt-PT")} kg{totals.dangerous ? " · mercadoria perigosa" : ""}
          </span>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="job-form" disabled={busy || locked}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {editing ? "Guardar alterações" : "Criar trabalho"}
          </Button>
        </>
      }
    >
      <form id="job-form" onSubmit={submit} className="space-y-7 px-6 py-5">
        {locked ? <Notice tone="warn" title="Este trabalho já não pode ser editado">A execução já começou ou o trabalho está concluído/cancelado.</Notice> : null}
        {editing && job!.planStatus === "PLANNED" && !locked ? (
          <Notice tone="info" title="Este trabalho tem uma rota confirmada">Alterar paragens, janelas, partida ou carga invalida a rota — o trabalho fica «Replanear» até nova confirmação na Expedição.</Notice>
        ) : null}

        <section>
          <SectionTitle className="mb-3">Básico</SectionTitle>
          <div className="grid grid-cols-6 gap-3">
            <Field label="Cliente" className="col-span-3" help={form.customerId ? undefined : form.client.trim() ? "Sem registo de cliente — escolha um ou crie-o" : undefined}>
              <RecordPicker
                ariaLabel="Cliente"
                autoFocus={!editing}
                value={form.client}
                onText={(v) => setForm((f) => ({ ...f, client: v, customerId: undefined }))}
                options={customerOptions}
                onPick={(id) => { const c = ops.customers.find((x) => x.id === id); if (c) pickCustomer(c); }}
                onCreate={(t) => setCreatingCustomer(t)}
                createLabel={(t) => `Criar cliente «${t}»`}
                placeholder="Procurar ou criar cliente"
                adornment={form.customerId ? <Building2 aria-label="Cliente registado" className="h-3.5 w-3.5 text-[var(--accent)]" /> : undefined}
              />
            </Field>
            <Field label="Referência do cliente" className="col-span-3" help="N.º de encomenda / guia do cliente"><input className="ui-input" value={form.reference} onChange={(e) => set("reference", e.target.value)} /></Field>
            <Field label="Partida planeada" className="col-span-2" help="Usada no planeamento, Road Intelligence e UE 561"><input type="datetime-local" className="ui-input" value={form.departure} onChange={(e) => set("departure", e.target.value)} /></Field>
            <Field label="Prioridade" className="col-span-2">
              <select className="ui-input" value={form.priority} onChange={(e) => set("priority", e.target.value as JobPriority)}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Frete" unit="€" className="col-span-2"><input className="ui-input num" inputMode="decimal" value={form.rateEur} onChange={(e) => set("rateEur", e.target.value)} /></Field>
          </div>
        </section>

        <section>
          <SectionTitle className="mb-3">Paragens · {form.stops.length}</SectionTitle>
          <ol className="relative">
            {form.stops.map((s, i) => (
              <li key={s.key} className="relative grid grid-cols-[28px_1fr] gap-3 pb-4">
                {i < form.stops.length - 1 ? <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-[var(--border-strong)]" /> : null}
                <span aria-hidden className={clsx("relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-semibold num", s.type === "delivery" ? "border-[var(--text)] bg-[var(--text)] text-white" : s.type === "pickup" ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-2)]")}>{i + 1}</span>
                <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <select aria-label={`Tipo da paragem ${i + 1}`} className="ui-input h-7 w-[120px] text-[12px]" value={s.type} onChange={(e) => setStop(s.key, { type: e.target.value as StopType })}>
                      {STOP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <span className="truncate text-[13px] font-medium text-[var(--text)]">{s.city || s.clientName || typeLabel(s.type)}</span>
                    <span className="ml-auto flex items-center">
                      <IconButton label="Subir" onClick={() => moveStop(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
                      <IconButton label="Descer" onClick={() => moveStop(i, 1)} disabled={i === form.stops.length - 1}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
                      <IconButton label="Remover paragem" onClick={() => set("stops", form.stops.filter((x) => x.key !== s.key))} disabled={form.stops.length <= 2}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </span>
                  </div>
                  <div className="mb-2.5">
                    {s.siteId ? (
                      <div className="flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[13px]" data-testid="stop-site">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                        <span className="min-w-0 flex-1 truncate"><span className="font-medium">{siteById(s.siteId)?.name ?? s.clientName}</span> <span className="text-[var(--text-3)]">{s.address}</span></span>
                        {siteById(s.siteId) && !siteCoordinatesCurrent(siteById(s.siteId)!) ? <span className="text-[12px] text-[var(--warn)]">coordenadas por rever</span> : null}
                        <Button size="sm" variant="ghost" onClick={() => setStop(s.key, { siteId: undefined })}>Usar outra morada</Button>
                      </div>
                    ) : (
                      <RecordPicker
                        ariaLabel={`Local da paragem ${i + 1}`}
                        value={siteQuery[s.key] ?? ""}
                        onText={(v) => setSiteQuery((q) => ({ ...q, [s.key]: v }))}
                        options={siteOptions}
                        onPick={(id) => { const x = ops.sites.find((y) => y.id === id); if (x) pickSite(s.key, x); }}
                        onCreate={(t) => setCreatingSite({ stopKey: s.key, name: t })}
                        createLabel={(t) => `Criar local «${t}»`}
                        placeholder="Escolher local registado (ou preencher a morada abaixo)"
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-6 gap-2.5">
                    <Field label="Morada" className="col-span-4"><input className="ui-input" disabled={!!s.siteId} value={s.address} onChange={(e) => setStop(s.key, { address: e.target.value })} placeholder="Rua, n.º, localidade" /></Field>
                    <Field label="Localidade" className="col-span-2"><input className="ui-input" disabled={!!s.siteId} value={s.city} onChange={(e) => setStop(s.key, { city: e.target.value })} placeholder="da morada" /></Field>
                    <Field label="Local / empresa" className="col-span-2"><input className="ui-input" disabled={!!s.siteId} value={s.clientName} onChange={(e) => setStop(s.key, { clientName: e.target.value })} /></Field>
                    <Field label="Janela — início" className="col-span-2"><input type="datetime-local" className="ui-input" value={s.from} onChange={(e) => setStop(s.key, { from: e.target.value })} aria-label={`Janela início paragem ${i + 1}`} /></Field>
                    <Field label="Janela — fim" className="col-span-2"><input type="datetime-local" className="ui-input" value={s.until} onChange={(e) => setStop(s.key, { until: e.target.value })} aria-label={`Janela fim paragem ${i + 1}`} /></Field>
                    <Field label="Coordenadas" className="col-span-3" help={s.lat !== undefined && s.locatedFor === s.address ? "Localizada" : "Opcional — sem coordenadas, a morada é localizada ao gravar"}>
                      <input className="ui-input num" disabled={!!s.siteId} value={s.coords} onChange={(e) => setStop(s.key, { coords: e.target.value })} placeholder="lat, lng" />
                    </Field>
                    <Field label="Notas da paragem" className="col-span-3"><input className="ui-input" value={s.notes} onChange={(e) => setStop(s.key, { notes: e.target.value })} /></Field>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="ml-[40px] flex gap-2">
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => set("stops", [...form.stops.slice(0, -1), emptyStop("stop"), ...form.stops.slice(-1)])}>Paragem intermédia</Button>
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => set("stops", [...form.stops, emptyStop("delivery")])}>Entrega</Button>
          </div>
        </section>

        <section>
          <SectionTitle className="mb-3">Carga</SectionTitle>
          <div className="mb-3 grid grid-cols-6 gap-3">
            <Field label="Tipo de carga" className="col-span-2">
              <select className="ui-input" value={form.cargoType} onChange={(e) => set("cargoType", e.target.value as CargoType)}>
                {CARGO_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            {form.cargoType === "hazmat" ? (
              <>
                <Field label="Classe ADR principal" className="col-span-3">
                  <select className="ui-input" value={form.adrClass} onChange={(e) => set("adrClass", e.target.value)}>
                    <option value="">—</option>
                    {ADR_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="N.º ONU" className="col-span-1"><input className="ui-input" value={form.adrUnNumber} onChange={(e) => set("adrUnNumber", e.target.value)} placeholder="UN1993" /></Field>
              </>
            ) : null}
            {form.cargoType === "refrigerated" ? (
              <>
                <Field label="Temperatura mín." unit="°C" className="col-span-2"><input className="ui-input num" value={form.tempMin} onChange={(e) => set("tempMin", e.target.value)} /></Field>
                <Field label="Temperatura máx." unit="°C" className="col-span-2"><input className="ui-input num" value={form.tempMax} onChange={(e) => set("tempMax", e.target.value)} /></Field>
              </>
            ) : null}
          </div>
          <table className="ui-table">
            <thead>
              <tr><th>Descrição</th><th className="w-[90px]">Qtd.</th><th className="w-[120px]">Unidade</th><th className="w-[110px]">Peso (kg)</th><th className="w-[80px]">Paletes</th>{form.cargoType === "hazmat" ? <th className="w-[110px]">ONU</th> : null}<th className="w-10" /></tr>
            </thead>
            <tbody>
              {form.cargo.map((c, i) => (
                <tr key={c.key}>
                  <td><input className="ui-input" aria-label={`Linha ${i + 1} — descrição`} value={c.description} onChange={(e) => setCargo(c.key, { description: e.target.value })} /></td>
                  <td><input className="ui-input num" inputMode="decimal" aria-label={`Quantidade linha ${i + 1}`} value={c.quantity} onChange={(e) => setCargo(c.key, { quantity: e.target.value })} /></td>
                  <td>
                    <select className="ui-input" aria-label={`Unidade linha ${i + 1}`} value={c.unit} onChange={(e) => setCargo(c.key, { unit: e.target.value as CargoLine["unit"] })}>
                      {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </td>
                  <td><input className="ui-input num" inputMode="decimal" aria-label={`Peso linha ${i + 1}`} value={c.weightKg} onChange={(e) => setCargo(c.key, { weightKg: e.target.value })} /></td>
                  <td><input className="ui-input num" inputMode="numeric" aria-label={`Paletes linha ${i + 1}`} value={c.pallets} onChange={(e) => setCargo(c.key, { pallets: e.target.value })} placeholder={c.unit === "pallet" ? c.quantity : ""} /></td>
                  {form.cargoType === "hazmat" ? <td><input className="ui-input" aria-label={`N.º ONU linha ${i + 1}`} value={c.unNumber} onChange={(e) => setCargo(c.key, { unNumber: e.target.value })} /></td> : null}
                  <td><IconButton label="Remover linha" onClick={() => set("cargo", form.cargo.filter((x) => x.key !== c.key))} disabled={form.cargo.length <= 1}><Trash2 className="h-3.5 w-3.5" /></IconButton></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2">
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => set("cargo", [...form.cargo, emptyCargo()])}>Linha de carga</Button>
          </div>
        </section>

        <section>
          <SectionTitle className="mb-3">Notas</SectionTitle>
          <textarea className="ui-input" value={form.notes} onChange={(e) => set("notes", e.target.value)} aria-label="Notas" />
          <button type="button" className="mt-3 text-[12px] font-medium text-[var(--accent)] hover:underline" onClick={() => setMore((m) => !m)} aria-expanded={more}>
            {more ? "Ocultar detalhes de faturação e transporte internacional" : "Faturação e transporte internacional…"}
          </button>
          {more ? (
            <div className="mt-3 grid grid-cols-6 gap-3">
              <Field label="NIF do adquirente" className="col-span-2"><input className="ui-input num" value={form.buyerNif} onChange={(e) => set("buyerNif", e.target.value)} /></Field>
              <div className="col-span-2 flex items-end pb-2"><Checkbox label="Transporte internacional" checked={form.isInternational} onChange={(v) => set("isInternational", v)} /></div>
              {form.isInternational ? <Field label="País de destino" className="col-span-2" help="Código ISO, ex.: ES"><input className="ui-input" value={form.destinationCountryCode} onChange={(e) => set("destinationCountryCode", e.target.value)} /></Field> : null}
            </div>
          ) : null}
        </section>

        {errors.length > 0 ? (
          <Notice title="Não foi possível gravar">
            <ul className="list-disc pl-4">{errors.map((m) => <li key={m}>{m}</li>)}</ul>
          </Notice>
        ) : null}
      </form>
      {creatingCustomer !== null ? <CustomerEditor initialName={creatingCustomer} onClose={() => setCreatingCustomer(null)} onSaved={pickCustomer} /> : null}
      {creatingSite ? (
        <SiteEditor
          initial={{ name: creatingSite.name, customerId: form.customerId, ...(() => { const st = form.stops.find((x) => x.key === creatingSite.stopKey); return st?.address ? { address: st.address, locality: st.city || undefined, ...(st.lat !== undefined && st.locatedFor === st.address ? { lat: st.lat, lng: st.lng, geocodedAddress: st.address } : {}) } : {}; })() }}
          onClose={() => setCreatingSite(null)}
          onSaved={(x) => pickSite(creatingSite.stopKey, x)}
        />
      ) : null}
    </Drawer>
  );
}
