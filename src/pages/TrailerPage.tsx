import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useFleetData } from "../context/FleetDataContext";
import { useJobs } from "../context/JobsContext";
import { trailerOperationalState, trailerTypeLabel } from "../domain/fleet/trailers";
import { paths } from "../lib/appLinks";
import { Button, DataList, EmptyState, IconButton, PageHeader, ProvenanceTag, SectionTitle, StatusBadge, Tabs } from "../ui/kit";
import { EventHistory } from "../ui/job/JobParts";
import { ResourceHeaderActions } from "../ui/resources/ResourceHeaderActions";
import { JobRef, Known, resourceWork, WorkTable } from "../ui/resources/resourceParts";
import { useEditors } from "../ui/shell/editors";
import { TRAILER_STATE } from "../ui/status";

type Tab = "overview" | "work" | "history";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--border)] px-6 py-4">
      <SectionTitle className="mb-3">{title}</SectionTitle>
      {children}
    </section>
  );
}

const yes = (b: boolean | undefined) => (b ? "Sim" : "Não");

export function TrailerPage() {
  const { trailerId = "" } = useParams();
  const { getTrailer } = useFleetData();
  const { jobs } = useJobs();
  const ed = useEditors();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";
  const t = getTrailer(trailerId);
  const work = useMemo(() => resourceWork(jobs, (j) => j.assignedTrailerId === trailerId), [jobs, trailerId]);
  if (!t) return <div className="flex-1 bg-[var(--surface)]"><EmptyState title="Reboque não encontrado" action={<Link to={paths.trailers()}><Button>Voltar aos reboques</Button></Link>} /></div>;
  const state = trailerOperationalState(t, jobs);
  const c = t.capabilities;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={<span className="flex items-center gap-2"><IconButton label="Voltar" onClick={() => navigate(paths.trailers())}><ArrowLeft className="h-4 w-4" /></IconButton><span className="num">{t.plate}</span><span className="font-normal text-[var(--text-2)]">{trailerTypeLabel(t)}</span></span>}
        meta={<span className="inline-flex items-center gap-2"><StatusBadge status={TRAILER_STATE[state]} />{t.isDemo ? <ProvenanceTag kind="DEMO" /> : null}</span>}
        actions={<ResourceHeaderActions kind="trailer" id={t.id} label={t.plate} archived={!!t.archivedAt} onEdit={() => ed.openTrailer(t.id)} listPath={paths.trailers()} />}
      >
        <Tabs value={tab} onChange={(v) => setParams(v === "overview" ? {} : { tab: v }, { replace: true })} items={[{ value: "overview", label: "Resumo" }, { value: "work", label: "Trabalho" }, { value: "history", label: "Histórico" }]} />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)] scroll-thin">
        <div className="mx-auto max-w-[1280px]">
          {tab === "overview" && (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 xl:divide-x xl:divide-[var(--border)]">
<div>
<Panel title="Identificação">
                <DataList rows={[
                  { label: "Matrícula", value: <span className="num">{t.plate}</span> },
                  { label: "Unidade", value: t.unitNumber ?? "—" },
                  { label: "Marca / modelo", value: [t.make, t.model].filter(Boolean).join(" ") || "—" },
                  { label: "Tipo", value: trailerTypeLabel(t) },
                  { label: "Disponibilidade", value: t.availability === "AVAILABLE" ? "Disponível (manual)" : t.availability === "MAINTENANCE" ? "Em manutenção (manual)" : "Fora de serviço (manual)" },
                  { label: "Trabalho atual / próximo", value: <JobRef job={work.current ?? work.next} /> },
                ]} />
              </Panel>
              </div>
<div>
<Panel title="Especificação física">
                <DataList rows={[
                  { label: "Comprimento", value: <Known v={t.lengthM} unit="m" /> },
                  { label: "Largura", value: <Known v={t.widthM} unit="m" /> },
                  { label: "Altura", value: <Known v={t.heightM} unit="m" /> },
                  { label: "Tara", value: <Known v={t.tareKg} unit="kg" /> },
                  { label: "Peso bruto máximo", value: <Known v={t.maxGrossWeightKg} unit="kg" /> },
                  { label: "Carga útil", value: <Known v={t.payloadKg} unit="kg" /> },
                  { label: "Eixos", value: <Known v={t.axleCount} /> },
                  { label: "Lugares de palete", value: <Known v={t.palletCapacity} /> },
                ]} />
              </Panel>
              <Panel title="Capacidades">
                <DataList rows={[
                  { label: "Frigorífico", value: c.refrigerated ? `Sim · ${c.tempMinC ?? "?"} a ${c.tempMaxC ?? "?"} °C` : "Não" },
                  { label: "Apto ADR", value: yes(c.adrSuitable) },
                  { label: "Plataforma elevatória", value: yes(c.tailLift) },
                  { label: "Outras", value: c.other?.length ? c.other.join(", ") : "—" },
                  { label: "Notas", value: t.notes ?? "—" },
                ]} />
              </Panel>
</div>
</div>
            </>
          )}
          {tab === "work" && (
            <>
              <Panel title="Atual e próximos"><WorkTable jobs={[...(work.current ? [work.current] : []), ...work.upcoming]} empty="Sem trabalho atribuído" /></Panel>
              <Panel title="Anteriores"><WorkTable jobs={work.past.slice(0, 50)} empty="Sem trabalhos anteriores" /></Panel>
            </>
          )}
          {tab === "history" && <Panel title="Histórico"><EventHistory entityId={t.id} revisionKey={t.updatedAt} /></Panel>}
        </div>
      </div>
    </div>
  );
}
