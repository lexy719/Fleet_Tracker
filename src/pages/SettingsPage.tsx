import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DEV_FIXTURES_AVAILABLE, useIngestion } from "../context/IngestionContext";
import { useOperations, useOperationsRuntime } from "../context/OperationsContext";
import { useRoadEvents } from "../context/RoadEventsContext";
import { DEFAULT_SETTINGS, useSettings, type CompanySettings } from "../context/SettingsContext";
import { buildDemoSeed } from "../data/mockData";
import { documentSeries } from "../domain/documents/documents";
import { OPS_TIME_ZONE } from "../domain/time";
import { availableRoadEvents } from "../regulations/repository";
import { Button, Checkbox, DataList, Field, Modal, Notice, PageHeader, SectionTitle } from "../ui/kit";
import { CustomersList, SitesList } from "../ui/records/RecordLists";

export type SettingsGroup = "company" | "billing" | "operations" | "customers" | "sites" | "data" | "demo";
const GROUPS: { value: SettingsGroup; label: string; heading?: string }[] = [
  { value: "company", label: "Empresa" },
  { value: "billing", label: "Faturação" },
  { value: "operations", label: "Operação" },
  { value: "customers", label: "Clientes", heading: "Registos" },
  { value: "sites", label: "Locais" },
  { value: "data", label: "Dados", heading: "Sistema" },
  { value: "demo", label: "Demonstração e desenvolvimento" },
];

/** Read-only: the number the next issued invoice will get (owned by the operational store). */
function NextInvoiceNumber({ prefix }: { prefix: string }) {
  const { state, service } = useOperations();
  const [n, setN] = useState<number | null>(null);
  const series = documentSeries("INVOICE", { invoicePrefix: prefix }, new Date());
  const issued = state.documents.filter((d) => d.series === series).length;
  useEffect(() => {
    let alive = true;
    void service.peekNextNumber(series).then((v) => alive && setN(v));
    return () => {
      alive = false;
    };
  }, [service, series, issued]);
  return (
    <Field label="Próximo número" help="Atribuído ao emitir — reimprimir não consome números; anulados não são reutilizados.">
      <div className="ui-input num flex items-center bg-[var(--surface-2)] text-[var(--text-2)]">{n === null ? "…" : `${prefix}${String(n).padStart(4, "0")}`}</div>
    </Field>
  );
}

function Text({ label, help, value, onChange, type = "text" }: { label: string; help?: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <Field label={label} help={help}>
      <input className="ui-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
function Num({ label, help, unit, value, onChange }: { label: string; help?: string; unit?: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label} help={help} unit={unit}>
      <input className="ui-input num" type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

function DataSection() {
  const { state } = useOperations();
  const { persistent, bootstrap, error } = useOperationsRuntime();
  const count = <T extends { isDemo?: boolean; archivedAt?: string }>(xs: T[]) => `${xs.filter((x) => !x.isDemo).length} próprios · ${xs.filter((x) => x.isDemo).length} demo`;
  return (
    <div className="space-y-4">
      {!persistent ? <Notice title="Armazenamento persistente indisponível">As alterações ficam só em memória e perdem-se ao recarregar a página. Verifique se o navegador permite IndexedDB.</Notice> : null}
      {error ? <Notice title="Erro na inicialização dos dados">{error}</Notice> : null}
      <DataList
        rows={[
          { label: "Armazenamento", value: persistent ? "Neste navegador (IndexedDB)" : "Memória (temporário)" },
          { label: "Trabalhos", value: count(state.jobs) },
          { label: "Viaturas", value: count(state.trucks) },
          { label: "Reboques", value: count(state.trailers) },
          { label: "Motoristas", value: count(state.drivers) },
          { label: "Clientes", value: count(state.customers) },
          { label: "Locais", value: count(state.sites) },
          { label: "Documentos", value: `${state.documents.filter((d) => d.status === "ISSUED").length} emitidos · ${state.documents.filter((d) => d.status === "VOID").length} anulados` },
          ...(bootstrap?.legacy ? [{ label: "Migração anterior", value: `${bootstrap.legacy.imported} trabalho(s) importado(s)${bootstrap.legacy.duplicates ? `, ${bootstrap.legacy.duplicates} duplicado(s) preservado(s)` : ""}${bootstrap.legacy.dropped ? `, ${bootstrap.legacy.dropped} entrada(s) inválida(s) ignorada(s)` : ""}` }] : []),
        ]}
      />
      <p className="text-[12px] text-[var(--text-3)]">Os dados operacionais ficam guardados apenas neste navegador; não há sincronização entre dispositivos.</p>
    </div>
  );
}

function DevTools() {
  const { enabledIds, setEnabled } = useRoadEvents();
  const ing = useIngestion();
  const events = availableRoadEvents();
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[var(--text-2)]">Ferramentas para testar a Road Intelligence. Não fazem parte do fluxo operacional; tudo o que delas resulta fica identificado.</p>
      {events.map((e) => (
        <div key={e.id} className="flex items-center gap-2">
          <Checkbox label={`Evento de teste (introdução manual): ${e.label}`} checked={enabledIds.includes(e.id)} onChange={(v) => setEnabled(e.id, v)} />
          <a href={e.sourceUrl} target="_blank" rel="noreferrer" title="Aviso oficial" className="text-[var(--text-3)] hover:text-[var(--text)]"><ExternalLink className="h-3 w-3" /></a>
        </div>
      ))}
      {import.meta.env.DEV && <a href="/__dev/routing-acceptance" className="block text-[13px] text-[var(--accent)] underline">Aceitação do motor de rotas (cenários sintéticos, sem guardar dados)</a>}
      {DEV_FIXTURES_AVAILABLE ? (
        <Checkbox label="Fontes de TESTE SINTÉTICO (só no servidor de desenvolvimento; dados não oficiais)" checked={ing.devFixturesEnabled} onChange={(v) => ing.setDevFixturesEnabled(v)} />
      ) : (
        <p className="text-[12px] text-[var(--text-3)]">Fontes sintéticas: disponíveis apenas no servidor de desenvolvimento.</p>
      )}
    </div>
  );
}

function DemoSection() {
  const { service } = useOperations();
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--text-2)]">
        Os registos de demonstração (marcados «Demo») servem para explorar o FleetOS. Foram criados uma vez; apagar ou arquivar um registo demo é permanente até os repor aqui.
      </p>
      <Button variant="danger" onClick={() => setConfirm(true)}>Repor dados demo</Button>
      {msg ? <Notice tone={msg.ok ? "ok" : "danger"} title={msg.text} /> : null}
      {confirm ? (
        <Modal
          title="Repor dados demo?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button onClick={() => setConfirm(false)}>Cancelar</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  setConfirm(false);
                  const r = await service.resetDemo(buildDemoSeed(new Date().toISOString()));
                  setMsg(r.ok ? { ok: true, text: `Dados demo repostos — ${r.value.removed} removidos, ${r.value.seeded} recriados.` } : { ok: false, text: r.errors.join("; ") });
                }}
              >
                Repor
              </Button>
            </>
          }
        >
          Os trabalhos, viaturas, reboques, motoristas, clientes e locais demo voltam ao estado inicial (documentos demo são removidos; os números já usados não voltam a ser atribuídos). Os seus próprios registos não são alterados.
        </Modal>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [params, setParams] = useSearchParams();
  const group = (GROUPS.some((g) => g.value === params.get("section")) ? params.get("section") : "company") as SettingsGroup;
  const setGroup = (g: SettingsGroup) => setParams((p) => { const n = new URLSearchParams(p); n.set("section", g); return n; }, { replace: true });
  const [local, setLocal] = useState<CompanySettings>({ ...settings });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = JSON.stringify(local) !== JSON.stringify(settings);
  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setLocal((p) => ({ ...p, [k]: v }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Definições" />
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Grupos de definições" className="w-[200px] shrink-0 border-r border-[var(--border)] bg-[var(--surface)] px-3 py-4">
          {GROUPS.map((g) => (
            <div key={g.value}>
            {g.heading ? <div className="mb-1 mt-4 px-2.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">{g.heading}</div> : null}
            <button
              type="button"
              onClick={() => setGroup(g.value)}
              aria-current={group === g.value}
              className={clsx("flex h-8 w-full items-center rounded-[var(--r-md)] px-2.5 text-left text-[13px] transition-colors", group === g.value ? "bg-[var(--surface-sunken)] font-medium text-[var(--text)]" : "text-[var(--text-2)] hover:bg-[var(--surface-2)]")}
            >
              {g.label}
            </button>
            </div>
          ))}
        </nav>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)] scroll-thin">
            <div className={clsx("px-8 py-6", group === "customers" || group === "sites" ? "max-w-[1100px]" : "max-w-[720px]")}>
              {group === "company" && (
                <section>
                  <SectionTitle className="mb-4">Identidade da empresa</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <Text label="Nome da empresa" value={local.name} onChange={(v) => set("name", v)} />
                    <Text label="NIF" help="9 dígitos" value={local.nif} onChange={(v) => set("nif", v)} />
                    <Text label="Morada" value={local.address} onChange={(v) => set("address", v)} />
                    <Text label="Código postal e localidade" value={local.postalCity} onChange={(v) => set("postalCity", v)} />
                    <Text label="País" value={local.country} onChange={(v) => set("country", v)} />
                    <Text label="Telefone" type="tel" value={local.phone} onChange={(v) => set("phone", v)} />
                    <Text label="Email" type="email" value={local.email} onChange={(v) => set("email", v)} />
                    <Text label="Licença comunitária" help="Atribuída pelo IMT" value={local.licencaComunitaria} onChange={(v) => set("licencaComunitaria", v)} />
                  </div>
                  <p className="mt-4 text-[12px] text-[var(--text-3)]">Usados na guia CMR e nas pré-visualizações de fatura.</p>
                </section>
              )}
              {group === "billing" && (
                <section className="space-y-4">
                  <SectionTitle>Faturação</SectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <Text label="IBAN" value={local.iban} onChange={(v) => set("iban", v)} />
                    <Text label="Prefixo de fatura" help="ex.: FT 2026/ → FT 2026/0001" value={local.invoicePrefix} onChange={(v) => set("invoicePrefix", v)} />
                    <NextInvoiceNumber prefix={settings.invoicePrefix} />
                    <Num label="Taxa de IVA" unit="%" help="Transporte em Portugal: 23 %" value={local.vatPct} onChange={(v) => set("vatPct", v)} />
                    <Num label="Prazo de pagamento" unit="dias" value={local.paymentTermsDays} onChange={(v) => set("paymentTermsDays", v)} />
                  </div>
                  <Notice tone="info" title="Pré-visualizações sem validade fiscal">Faturas legais têm de ser emitidas por software certificado pela AT (Portaria 363/2010). Os documentos do FleetOS servem para conferência.</Notice>
                </section>
              )}
              {group === "operations" && (
                <section className="space-y-4">
                  <SectionTitle>Operação</SectionTitle>
                  <DataList rows={[
                    { label: "Fuso horário operacional", value: `${OPS_TIME_ZONE} — todas as janelas e horas são mostradas e introduzidas nesta hora` },
                    { label: "Unidades", value: "kg, t, m, km, L" },
                    { label: "Regras de condução", value: "Regulamento (CE) 561/2006 — base de horas manual por motorista" },
                  ]} />
                </section>
              )}
              {group === "customers" && (
                <section>
                  <SectionTitle className="mb-4">Clientes</SectionTitle>
                  <CustomersList />
                </section>
              )}
              {group === "sites" && (
                <section>
                  <SectionTitle className="mb-4">Locais de carga e descarga</SectionTitle>
                  <SitesList />
                </section>
              )}
              {group === "data" && (
                <section>
                  <SectionTitle className="mb-4">Dados operacionais</SectionTitle>
                  <DataSection />
                </section>
              )}
              {group === "demo" && (
                <section>
                  <SectionTitle className="mb-4">Dados de demonstração</SectionTitle>
                  <DemoSection />
                  <SectionTitle className="mb-4 mt-8">Desenvolvimento</SectionTitle>
                  <DevTools />
                </section>
              )}
            </div>
          </div>
          {group === "company" || group === "billing" ? (
            <div className="flex h-12 shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-8">
              <span className="text-[12px] text-[var(--text-3)]">{dirty ? "Alterações por guardar" : savedAt ? "Guardado" : "Guardado neste navegador"}</span>
              <Button variant="ghost" className="ml-auto" onClick={() => setConfirmReset(true)}>Repor valores padrão</Button>
              <Button disabled={!dirty} onClick={() => setLocal({ ...settings })}>Descartar</Button>
              <Button variant="primary" disabled={!dirty} onClick={() => (updateSettings(local), setSavedAt(Date.now()))}>Guardar</Button>
            </div>
          ) : null}
        </div>
      </div>
      {confirmReset ? (
        <Modal
          title="Repor definições padrão?"
          onClose={() => setConfirmReset(false)}
          footer={<><Button onClick={() => setConfirmReset(false)}>Cancelar</Button><Button variant="danger" onClick={() => { setLocal({ ...DEFAULT_SETTINGS }); resetSettings(); setConfirmReset(false); }}>Repor</Button></>}
        >
          Os dados da empresa e de faturação voltam aos valores padrão.
        </Modal>
      ) : null}
    </div>
  );
}
