import {
  AlertTriangle,
  Box,
  Car,
  Layers,
  Loader2,
  Plus,
  Snowflake,
  Truck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { CargoType, Job, JobPriority, JobStop } from "../../data/types";
import { useJobs } from "../../context/JobsContext";
import { resolveStopCoordinates } from "../../lib/jobStopGeocode";
import { getTomTomKey } from "../../tomtom/config";

/* ─── constants ─────────────────────────────────────────────────────────── */

let _counter = 4300;
function nextJobId() { return `J-${++_counter}`; }

const PRIORITIES: { value: JobPriority; label: string; color: string; active: string }[] = [
  {
    value:  "normal",
    label:  "Normal",
    color:  "text-[var(--app-muted)]",
    active: "bg-slate-800 text-white",
  },
  {
    value:  "urgent",
    label:  "Urgente",
    color:  "text-amber-600",
    active: "bg-amber-500 text-white",
  },
  {
    value:  "critical",
    label:  "Crítico",
    color:  "text-rose-600",
    active: "bg-rose-600 text-white",
  },
];

const CARGO_TYPES: {
  value: CargoType;
  label: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}[] = [
  { value: "dry",          label: "Seco",    Icon: Box           },
  { value: "refrigerated", label: "Reefer",  Icon: Snowflake     },
  { value: "hazmat",       label: "ADR",     Icon: AlertTriangle },
  { value: "bulk",         label: "Granel",  Icon: Layers        },
  { value: "automotive",   label: "Auto",    Icon: Car           },
];

/* ─── ADR classes (EU — Acordo ADR) ─────────────────────────────────────── */
const ADR_CLASSES = [
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

/* ─── form state ─────────────────────────────────────────────────────────── */

type FormData = {
  client:              string;
  priority:            JobPriority;
  cargoType:           CargoType;
  totalWeightKg:       number;
  totalPallets:        number;
  rateEur:             number;
  notes:               string;
  pickupCompany:       string;
  pickupAddress:       string;
  pickupFrom:          string;
  pickupUntil:         string;
  pickupDeadline:      string;
  deliveryCompany:     string;
  deliveryAddress:     string;
  deliveryFrom:        string;
  deliveryUntil:       string;
  deliveryDeadline:    string;
  /* ADR */
  adrClass:            string;
  adrUnNumber:         string;
  /* Reefer */
  tempMin:             string;
  tempMax:             string;
  /* International */
  isInternational:     boolean;
  destinationCountryCode: string;
};

const EMPTY: FormData = {
  client:           "",
  priority:         "normal",
  cargoType:        "dry",
  totalWeightKg:    0,
  totalPallets:     0,
  rateEur:          0,
  notes:            "",
  pickupCompany:    "",
  pickupAddress:    "",
  pickupFrom:       "08:00",
  pickupUntil:      "12:00",
  pickupDeadline:   "",
  deliveryCompany:  "",
  deliveryAddress:  "",
  deliveryFrom:     "13:00",
  deliveryUntil:    "17:00",
  deliveryDeadline: "",
  adrClass:            "",
  adrUnNumber:         "",
  tempMin:             "2",
  tempMax:             "6",
  isInternational:     false,
  destinationCountryCode: "ES",
};

/* ─── helpers ────────────────────────────────────────────────────────────── */

function makeStop(n: number, type: "pickup" | "delivery"): JobStop {
  return {
    id: `new-stop-${n}`, sequence: n, type,
    clientName: "", address: "", city: "",
    lat: 38.7223, lng: -9.1393,
    scheduledTime: "09:00", windowEnd: "12:00",
    cargoDescription: "", weightKg: 0, pallets: 0, completed: false,
  };
}

function cityFromAddress(addr: string): string {
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? addr;
}

/** Auto-generate a reference: "SON-260419-4301" */
function generateReference(client: string, jobId: string): string {
  const code = client
    .split(/[\s\-—·]+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w.slice(0, 3).toUpperCase())
    .join("");
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const seq  = jobId.split("-")[1] ?? "000";
  return `${code || "JOB"}-${date}-${seq}`;
}

/* ─── component ──────────────────────────────────────────────────────────── */

export function NewJobModal({ onClose }: { onClose: () => void }) {
  const { createJob } = useJobs();
  const [form, setForm] = useState<FormData>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit = useMemo(
    () =>
      form.client.trim().length > 0 &&
      form.pickupAddress.trim().length > 0 &&
      form.deliveryAddress.trim().length > 0 &&
      form.rateEur > 0,
    [form.client, form.pickupAddress, form.deliveryAddress, form.rateEur],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client.trim())          return setError("Nome do cliente obrigatório.");
    if (!form.pickupAddress.trim())   return setError("Morada de levantamento obrigatória.");
    if (!form.deliveryAddress.trim()) return setError("Morada de entrega obrigatória.");
    if (form.rateEur <= 0)            return setError("Taxa deve ser maior que 0.");

    setError(null);
    setSubmitting(true);
    const apiKey = getTomTomKey();

    try {
      const [pickupLL, deliveryLL] = await Promise.all([
        resolveStopCoordinates(form.pickupAddress, apiKey, form.pickupCompany),
        resolveStopCoordinates(form.deliveryAddress, apiKey, form.deliveryCompany),
      ]);

      if (!pickupLL) {
        setError("Não foi possível localizar a morada de levantamento. Inclua a localidade ou código postal.");
        return;
      }
      if (!deliveryLL) {
        setError("Não foi possível localizar a morada de entrega. Inclua a localidade ou código postal.");
        return;
      }
      if (
        Math.abs(pickupLL.lat - deliveryLL.lat) < 1e-5 &&
        Math.abs(pickupLL.lng - deliveryLL.lng) < 1e-5
      ) {
        setError("Levantamento e entrega coincidem no mapa — verifique as moradas.");
        return;
      }

      const id  = nextJobId();
      const now = new Date().toISOString();
      const cargoLabel = CARGO_TYPES.find((c) => c.value === form.cargoType)?.label ?? form.cargoType;

      const pickupStop: JobStop = makeStop(1, "pickup");
      Object.assign(pickupStop, {
        clientName:       form.pickupCompany.trim()   || form.client,
        address:          form.pickupAddress,
        city:             cityFromAddress(form.pickupAddress),
        lat:              pickupLL.lat,
        lng:              pickupLL.lng,
        scheduledTime:    form.pickupFrom,
        windowEnd:        form.pickupUntil,
        cargoDescription: cargoLabel,
        weightKg:         form.totalWeightKg,
        pallets:          form.totalPallets,
      });

      const deliveryStop: JobStop = makeStop(2, "delivery");
      Object.assign(deliveryStop, {
        clientName:       form.deliveryCompany.trim() || form.client,
        address:          form.deliveryAddress,
        city:             cityFromAddress(form.deliveryAddress),
        lat:              deliveryLL.lat,
        lng:              deliveryLL.lng,
        scheduledTime:    form.deliveryFrom,
        windowEnd:        form.deliveryUntil,
        cargoDescription: cargoLabel,
        weightKg:         form.totalWeightKg,
        pallets:          form.totalPallets,
      });

      const job: Job = {
        id,
        reference:        generateReference(form.client, id),
        client:           form.client,
        status:           "backlog",
        priority:         form.priority,
        cargoType:        form.cargoType,
        totalWeightKg:    form.totalWeightKg,
        totalPallets:     form.totalPallets,
        stops:            [pickupStop, deliveryStop],
        pickupDeadline:   form.pickupDeadline   || new Date(Date.now() + 86_400_000).toISOString(),
        deliveryDeadline: form.deliveryDeadline || new Date(Date.now() + 2 * 86_400_000).toISOString(),
        slaStatus:        "on_track",
        rateEur:          form.rateEur,
        createdAt:        now,
        notes:            form.notes.trim() || undefined,
        /* ADR */
        ...(form.cargoType === "hazmat" && form.adrClass
          ? { adrClass: form.adrClass, adrUnNumber: form.adrUnNumber.trim() || undefined }
          : {}),
        /* Reefer */
        ...(form.cargoType === "refrigerated"
          ? { tempTargetC: { min: Number(form.tempMin), max: Number(form.tempMax) } }
          : {}),
        /* International */
        ...(form.isInternational
          ? { isInternational: true, destinationCountryCode: form.destinationCountryCode.trim() || undefined }
          : {}),
      };

      createJob(job);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden border-l shadow-2xl"
        style={{ background: "var(--app-card)", borderColor: "var(--app-border)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Nova entrega"
      >
        {/* ── Header ── */}
        <div
          className="flex shrink-0 items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: "#E8F0EC" }}
            >
              <Truck className="h-4 w-4" style={{ color: "#2D5F4E" }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--app-muted)" }}>
                Expedição
              </p>
              <h2 className="text-[15px] font-black leading-none" style={{ color: "var(--app-fg)" }}>
                Nova entrega
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition hover:bg-black/5"
          >
            <X className="h-4 w-4" style={{ color: "var(--app-muted)" }} />
          </button>
        </div>

        {/* ── Body ── */}
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">

            {/* ── Section: Cliente ── */}
            <Section label="Cliente">
              <Field label="Nome do cliente" required>
                <input
                  type="text"
                  required
                  autoComplete="organization"
                  placeholder="Ex: Sonae MC, Auchan Portugal…"
                  value={form.client}
                  onChange={(e) => set("client", e.target.value)}
                  className="input-base"
                />
              </Field>
            </Section>

            <Divider />

            {/* ── Section: Prioridade ── */}
            <Section label="Prioridade">
              <div className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => set("priority", p.value)}
                    className={[
                      "flex-1 rounded-lg border py-2 text-[12px] font-semibold transition",
                      form.priority === p.value
                        ? p.active + " border-transparent"
                        : "border-[var(--app-border)] bg-transparent " + p.color + " hover:bg-black/5",
                    ].join(" ")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Section>

            <Divider />

            {/* ── Section: Carga ── */}
            <Section label="Carga">
              {/* Cargo type icon grid */}
              <div className="grid grid-cols-5 gap-1.5">
                {CARGO_TYPES.map(({ value, label, Icon }) => {
                  const active = form.cargoType === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => set("cargoType", value)}
                      className={[
                        "flex flex-col items-center gap-1 rounded-xl border py-2.5 transition",
                        active
                          ? "border-[#2D5F4E] bg-[#E8F0EC]"
                          : "border-[var(--app-border)] hover:border-[#2D5F4E]/40 hover:bg-[#E8F0EC]/40",
                      ].join(" ")}
                    >
                      <Icon
                        className="h-4 w-4"
                        style={{ color: active ? "#2D5F4E" : "var(--app-muted)" }}
                      />
                      <span
                        className="text-[10px] font-semibold leading-none"
                        style={{ color: active ? "#2D5F4E" : "var(--app-muted)" }}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Peso (kg)">
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={form.totalWeightKg || ""}
                    onChange={(e) => set("totalWeightKg", Number(e.target.value))}
                    className="input-base"
                  />
                </Field>
                <Field label="Paletes">
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={form.totalPallets || ""}
                    onChange={(e) => set("totalPallets", Number(e.target.value))}
                    className="input-base"
                  />
                </Field>
              </div>

              <Field label="Taxa (€)" required>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold"
                    style={{ color: "var(--app-muted)" }}
                  >
                    €
                  </span>
                  <input
                    type="number"
                    required
                    min={0.01}
                    step={0.01}
                    placeholder="0.00"
                    value={form.rateEur || ""}
                    onChange={(e) => set("rateEur", Number(e.target.value))}
                    className="input-base pl-7"
                  />
                </div>
              </Field>

              {/* ── ADR fields (hazmat only) ── */}
              {form.cargoType === "hazmat" && (
                <>
                  <Field label="Classe ADR" required>
                    <select
                      value={form.adrClass}
                      onChange={(e) => set("adrClass", e.target.value)}
                      className="input-base"
                    >
                      <option value="">Selecionar classe ADR…</option>
                      {ADR_CLASSES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Número ONU (UN)" hint="Ex: UN1993, UN1202">
                    <input
                      type="text"
                      placeholder="UN1993"
                      value={form.adrUnNumber}
                      onChange={(e) => set("adrUnNumber", e.target.value.toUpperCase())}
                      className="input-base font-mono"
                    />
                  </Field>
                </>
              )}

              {/* ── Temperature fields (reefer only) ── */}
              {form.cargoType === "refrigerated" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Temp. mín (°C)">
                    <input
                      type="number"
                      step={0.5}
                      placeholder="2"
                      value={form.tempMin}
                      onChange={(e) => set("tempMin", e.target.value)}
                      className="input-base"
                    />
                  </Field>
                  <Field label="Temp. máx (°C)">
                    <input
                      type="number"
                      step={0.5}
                      placeholder="6"
                      value={form.tempMax}
                      onChange={(e) => set("tempMax", e.target.value)}
                      className="input-base"
                    />
                  </Field>
                </div>
              )}
            </Section>

            <Divider />

            {/* ── Section: Internacional ── */}
            <Section label="Internacional / Cabotagem">
              <label className="flex cursor-pointer items-center gap-3">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.isInternational}
                    onChange={(e) => set("isInternational", e.target.checked)}
                  />
                  <div
                    className="h-5 w-9 rounded-full transition-colors"
                    style={{ background: form.isInternational ? "#2D5F4E" : "var(--app-border)" }}
                  >
                    <div
                      className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                      style={{ left: form.isInternational ? "18px" : "2px" }}
                    />
                  </div>
                </div>
                <span className="text-[13px] font-medium" style={{ color: "var(--app-fg)" }}>
                  Transporte internacional (para fora de Portugal)
                </span>
              </label>
              {form.isInternational && (
                <Field label="País de destino (código ISO)" hint="Ex: ES, FR, DE, NL">
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="ES"
                    value={form.destinationCountryCode}
                    onChange={(e) => set("destinationCountryCode", e.target.value.toUpperCase())}
                    className="input-base uppercase font-mono"
                  />
                </Field>
              )}
            </Section>

            <Divider />

            {/* ── Section: Levantamento ── */}
            <Section label="Levantamento" accent="#8B6F47">
              <Field label="Empresa / Local de carga">
                <input
                  type="text"
                  placeholder={form.client ? `Ex: ${form.client}` : "Ex: Armazém central, Pingo Doce…"}
                  value={form.pickupCompany}
                  onChange={(e) => set("pickupCompany", e.target.value)}
                  className="input-base"
                />
              </Field>
              <Field label="Morada" required>
                <input
                  type="text"
                  required
                  placeholder="Ex: Pingo Doce, Vieira do Minho"
                  value={form.pickupAddress}
                  onChange={(e) => set("pickupAddress", e.target.value)}
                  className="input-base"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="A partir das">
                  <input
                    type="time"
                    value={form.pickupFrom}
                    onChange={(e) => set("pickupFrom", e.target.value)}
                    className="input-base"
                  />
                </Field>
                <Field label="Até às">
                  <input
                    type="time"
                    value={form.pickupUntil}
                    onChange={(e) => set("pickupUntil", e.target.value)}
                    className="input-base"
                  />
                </Field>
              </div>
              <Field label="Prazo">
                <input
                  type="datetime-local"
                  value={form.pickupDeadline}
                  onChange={(e) => set("pickupDeadline", e.target.value)}
                  className="input-base"
                />
              </Field>
            </Section>

            <Divider />

            {/* ── Section: Entrega ── */}
            <Section label="Entrega" accent="#2D5F4E">
              <Field label="Empresa / Destinatário">
                <input
                  type="text"
                  placeholder="Ex: Lidl Armazém, cliente final…"
                  value={form.deliveryCompany}
                  onChange={(e) => set("deliveryCompany", e.target.value)}
                  className="input-base"
                />
              </Field>
              <Field label="Morada" required>
                <input
                  type="text"
                  required
                  placeholder="Ex: Lidl, Póvoa de Lanhoso"
                  value={form.deliveryAddress}
                  onChange={(e) => set("deliveryAddress", e.target.value)}
                  className="input-base"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="A partir das">
                  <input
                    type="time"
                    value={form.deliveryFrom}
                    onChange={(e) => set("deliveryFrom", e.target.value)}
                    className="input-base"
                  />
                </Field>
                <Field label="Até às">
                  <input
                    type="time"
                    value={form.deliveryUntil}
                    onChange={(e) => set("deliveryUntil", e.target.value)}
                    className="input-base"
                  />
                </Field>
              </div>
              <Field label="Prazo">
                <input
                  type="datetime-local"
                  value={form.deliveryDeadline}
                  onChange={(e) => set("deliveryDeadline", e.target.value)}
                  className="input-base"
                />
              </Field>
            </Section>

            <Divider />

            {/* ── Section: Notas ── */}
            <Section label="Notas">
              <textarea
                rows={3}
                placeholder="Instruções de entrega, contacto no destino, requisitos especiais…"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className="input-base resize-none"
              />
            </Section>

            {/* Error */}
            {error && (
              <div className="px-5 pb-4">
                <p className="rounded-xl border border-[#A84432]/30 bg-[#F6E3DE] px-3 py-2.5 text-[12px] text-[#A84432]">
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div
            className="flex shrink-0 items-center gap-2.5 border-t px-5 py-4"
            style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-75"
              style={{ borderColor: "var(--app-border)", color: "var(--app-muted)" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              title={!canSubmit ? "Preencha cliente, moradas e taxa" : undefined}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "#2D5F4E" }}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A localizar…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Criar trabalho
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ─── layout primitives ──────────────────────────────────────────────────── */

function Section({
  label,
  accent,
  children,
}: {
  label: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 px-5 py-4">
      <p
        className="text-[10px] font-black uppercase tracking-widest"
        style={{ color: accent ?? "var(--app-muted)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function Divider() {
  return <hr style={{ borderColor: "var(--app-border)" }} />;
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        className="block text-[11px] font-semibold"
        style={{ color: "var(--app-muted)" }}
      >
        {label}
        {required && (
          <span className="ml-0.5 text-rose-400">*</span>
        )}
      </label>
      {children}
      {hint && (
        <p className="text-[10px]" style={{ color: "var(--app-muted)" }}>{hint}</p>
      )}
    </div>
  );
}
