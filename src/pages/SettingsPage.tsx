import { Building2, CreditCard, Info, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { DEFAULT_SETTINGS, useSettings } from "../context/SettingsContext";
import type { CompanySettings } from "../context/SettingsContext";

/* ─── Field + Section helpers ─────────────────────────────── */
function SectionTitle({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4" style={{ color: "#2D5F4E" }} />
      <h2 className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#2D5F4E" }}>
        {label}
      </h2>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold" style={{ color: "var(--app-muted)" }}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[10px]" style={{ color: "var(--app-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

const INPUT_CLS =
  "w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition focus:ring-2 focus:ring-[#2D5F4E]/30";

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={INPUT_CLS}
      style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)", color: "var(--app-fg)" }}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className={INPUT_CLS}
      style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)", color: "var(--app-fg)" }}
    />
  );
}

/* ─── Main page ───────────────────────────────────────────── */
export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [local, setLocal] = useState<CompanySettings>({ ...settings });
  const [saved, setSaved] = useState(false);

  function set<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setLocal((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function save() {
    updateSettings(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function reset() {
    if (!window.confirm("Repor todas as definições para os valores padrão?\n\nEsta ação não pode ser desfeita.")) return;
    const defaults = { ...DEFAULT_SETTINGS };
    setLocal(defaults);
    resetSettings();
    setSaved(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
      <PageHeader
        eyebrow="Sistema"
        title="Definições"
        subtitle="Dados da empresa, faturação e preferências operacionais — guardados localmente neste browser."
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition hover:opacity-75"
              style={{ borderColor: "var(--app-border)", color: "var(--app-muted)" }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Repor
            </button>
            <button
              type="button"
              onClick={save}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
              style={{ background: saved ? "#4A7C6A" : "#2D5F4E" }}
            >
              <Save className="h-3.5 w-3.5" />
              {saved ? "Guardado ✓" : "Guardar"}
            </button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">

        {/* ── Company identity ── */}
        <Card className="space-y-4">
          <SectionTitle icon={Building2} label="Identidade da empresa" />

          <Field label="Nome da empresa">
            <TextInput value={local.name} onChange={(v) => set("name", v)} placeholder="Transportes Exemplo, Lda." />
          </Field>
          <Field label="NIF" hint="Número de Identificação Fiscal — 9 dígitos">
            <TextInput value={local.nif} onChange={(v) => set("nif", v)} placeholder="500 000 000" />
          </Field>
          <Field label="Morada">
            <TextInput value={local.address} onChange={(v) => set("address", v)} placeholder="Rua Exemplo, 1" />
          </Field>
          <Field label="Código postal + Localidade">
            <TextInput value={local.postalCity} onChange={(v) => set("postalCity", v)} placeholder="4000-000 Porto" />
          </Field>
          <Field label="País">
            <TextInput value={local.country} onChange={(v) => set("country", v)} placeholder="Portugal" />
          </Field>
          <Field label="Telefone">
            <TextInput value={local.phone} onChange={(v) => set("phone", v)} type="tel" placeholder="+351 220 000 000" />
          </Field>
          <Field label="E-mail">
            <TextInput value={local.email} onChange={(v) => set("email", v)} type="email" placeholder="geral@empresa.pt" />
          </Field>
          <Field label="Licença comunitária" hint="Número atribuído pelo IMT / ANSR">
            <TextInput value={local.licencaComunitaria} onChange={(v) => set("licencaComunitaria", v)} placeholder="CM 123456789" />
          </Field>
        </Card>

        {/* ── Billing ── */}
        <div className="space-y-6">
          <Card className="space-y-4">
            <SectionTitle icon={CreditCard} label="Faturação" />

            <Field label="IBAN" hint="Conta para recebimento">
              <TextInput
                value={local.iban}
                onChange={(v) => set("iban", v)}
                placeholder="PT50 0000 0000 0000 0000 0000 0"
              />
            </Field>
            <Field label="Prefixo de fatura" hint='Ex: "FT 2026/" → FT 2026/0001'>
              <TextInput value={local.invoicePrefix} onChange={(v) => set("invoicePrefix", v)} placeholder="FT 2026/" />
            </Field>
            <Field label="Próximo nº sequencial" hint="Incrementado automaticamente a cada fatura emitida">
              <NumberInput value={local.invoiceNextSeq} onChange={(v) => set("invoiceNextSeq", v)} min={1} />
            </Field>
            <Field label="Taxa IVA (%)" hint="Serviços de transporte: 23% em Portugal">
              <NumberInput value={local.vatPct} onChange={(v) => set("vatPct", v)} min={0} max={100} />
            </Field>
            <Field label="Prazo de pagamento (dias)">
              <NumberInput value={local.paymentTermsDays} onChange={(v) => set("paymentTermsDays", v)} min={0} />
            </Field>
          </Card>

          {/* ── Info box ── */}
          <div
            className="flex gap-3 rounded-xl border p-4 text-[12px] leading-relaxed"
            style={{ borderColor: "#C4A882", background: "#F2EBE0", color: "#8B6F47" }}
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Nota legal</p>
              <p className="mt-1">
                Faturas legais devem ser emitidas por <strong>software certificado pela AT</strong> (Portaria 363/2010).
                Os documentos gerados nesta plataforma são <em>prévisualizações</em> para conferência — não têm validade fiscal.
              </p>
              <p className="mt-1">
                Dados guardados apenas neste browser. Para uso em produção, integre com SAFT-PT ou faturação eletrónica.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div
        className="sticky bottom-0 flex items-center justify-between gap-3 rounded-xl border px-5 py-3 shadow-lg"
        style={{ background: "var(--app-card)", borderColor: "var(--app-border)" }}
      >
        <p className="text-[12px]" style={{ color: "var(--app-muted)" }}>
          Alterações são guardadas localmente — clique em <strong>Guardar</strong> para aplicar.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setLocal({ ...settings }); setSaved(false); }}
            className="rounded-xl border px-3.5 py-2 text-xs font-semibold transition hover:opacity-75"
            style={{ borderColor: "var(--app-border)", color: "var(--app-muted)" }}
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-xl px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
            style={{ background: saved ? "#4A7C6A" : "#2D5F4E" }}
          >
            {saved ? "Guardado ✓" : "Guardar definições"}
          </button>
        </div>
      </div>
    </div>
  );
}
