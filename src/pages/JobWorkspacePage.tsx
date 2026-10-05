import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useJobs } from "../context/JobsContext";
import { paths } from "../lib/appLinks";
import { fmtEur, fmtKg, fmtWhen, stopWindowText } from "../ui/format";
import { Button, DataList, EmptyState, IconButton, Notice, PageHeader, SectionTitle, Tabs } from "../ui/kit";
import { AttentionList, CargoSummary, EventHistory, JobActions, JobHero, JobPlanSummary, JobResources, JobStatusLine, RouteTimeline } from "../ui/job/JobParts";
import { PlanDecision } from "../ui/job/PlanDecision";
import { JobDocuments } from "../ui/documents/DocumentParts";
import { JOB_STATUS } from "../ui/status";

type Tab = "overview" | "stops" | "plan" | "documents" | "history";

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--border)] px-6 py-4 last:border-b-0">
      <SectionTitle action={action} className="mb-3">{title}</SectionTitle>
      {children}
    </section>
  );
}

export function JobWorkspacePage() {
  const { jobId = "" } = useParams();
  const { getJob, setStopCompleted } = useJobs();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = (params.get("tab") as Tab) || "overview";
  const [stopError, setStopError] = useState<string | null>(null);
  const job = getJob(jobId);

  if (!job) {
    return (
      <div className="flex-1 bg-[var(--surface)]">
        <EmptyState title="Trabalho não encontrado" detail="O link pode estar incorreto ou o registo pertence a outro navegador." action={<Link to={paths.work()}><Button>Voltar aos trabalhos</Button></Link>} />
      </div>
    );
  }

  const stops = [...job.stops].sort((a, b) => a.sequence - b.sequence);
  const canToggle = (t: string) => (t === "pickup" ? ["loading", "in_transit"].includes(job.status) : job.status === "in_transit");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <IconButton label="Voltar" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(paths.work()))}><ArrowLeft className="h-4 w-4" /></IconButton>
            <span className="num">{job.jobNumber}</span>
            <span className="font-normal text-[var(--text-2)]">{job.client}</span>
          </span>
        }
        meta={<JobStatusLine job={job} />}
      >
        <Tabs
          value={tab}
          onChange={(t) => setParams((p) => { const n = new URLSearchParams(p); if (t === "overview") n.delete("tab"); else n.set("tab", t); return n; }, { replace: true })}
          items={[
            { value: "overview", label: "Resumo" },
            { value: "stops", label: "Paragens e carga" },
            { value: "plan", label: "Plano e decisão" },
            { value: "documents", label: "Documentos" },
            { value: "history", label: "Histórico" },
          ]}
        />
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)] scroll-thin">
        <div className="mx-auto max-w-[1280px]">
          {tab === "overview" && (
            <>
            <div className="border-b border-[var(--border)] px-6 py-5">
              <JobHero job={job} showIdentity={false} />
              <div className="mt-4 space-y-3">
                <AttentionList job={job} />
                <JobActions job={job} />
              </div>
            </div>
            <div className="grid grid-cols-1 bg-[var(--surface)] xl:grid-cols-[1fr_420px] xl:divide-x xl:divide-[var(--border)]">
              <div>
                <Panel title="Paragens e janelas">
                  <RouteTimeline job={job} />
                </Panel>
                <Panel title="Carga">
                  <CargoSummary job={job} />
                </Panel>
              </div>
              <div>
                <Panel title="Cliente">
                  <DataList
                    rows={[
                      { label: "Cliente", value: job.client },
                      { label: "Referência", value: job.reference || "—" },
                      { label: "Frete", value: fmtEur(job.rateEur) },
                      { label: "Prioridade", value: job.priority === "normal" ? "Normal" : job.priority === "urgent" ? "Urgente" : "Crítica" },
                      ...(job.buyerNif ? [{ label: "NIF adquirente", value: job.buyerNif }] : []),
                      { label: "Criado", value: fmtWhen(job.createdAt) },
                    ]}
                  />
                </Panel>
                <Panel title="Recursos">
                  <JobResources job={job} />
                </Panel>
                <Panel title="Plano">
                  <JobPlanSummary job={job} />
                </Panel>
                {job.notes ? (
                  <Panel title="Notas">
                    <p className="whitespace-pre-wrap text-[13px] text-[var(--text-2)]">{job.notes}</p>
                  </Panel>
                ) : null}
              </div>
            </div>
            </>
          )}

          {tab === "stops" && (
            <div className="bg-[var(--surface)]">
              <Panel title={`Paragens · ${stops.length}`}>
                {stopError ? <Notice className="mb-2" title="A paragem não foi atualizada">{stopError}</Notice> : null}
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      <th>Tipo</th>
                      <th>Local</th>
                      <th>Janela</th>
                      <th>Concluída</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {stops.map((s) => (
                      <tr key={s.id}>
                        <td className="num text-[var(--text-3)]">{s.sequence}</td>
                        <td className="text-[var(--text-2)]">{s.type === "pickup" ? "Recolha" : s.type === "delivery" ? "Entrega" : "Paragem"}</td>
                        <td>
                          <span className="block font-medium">{s.city || "—"}</span>
                          <span className="block truncate text-[12px] text-[var(--text-3)]">{s.clientName ? `${s.clientName} · ` : ""}{s.address}</span>
                        </td>
                        <td className="num text-[var(--text-2)]">{stopWindowText(s)}</td>
                        <td className="num text-[var(--text-2)]">{s.completed ? (s.completedAt ? fmtWhen(s.completedAt) : s.actualTime ?? "sim") : "—"}</td>
                        <td className="r">
                          {canToggle(s.type) && !(s.completed && s.type === "pickup" && job.status === "in_transit") ? (
                            <Button size="sm" variant={s.completed ? "ghost" : "secondary"} icon={s.completed ? undefined : <Check className="h-3.5 w-3.5" />} onClick={async () => { const r = await setStopCompleted(job.id, s.id, !s.completed); setStopError(r.ok ? null : r.errors.join("; ")); }}>
                              {s.completed ? "Reabrir" : "Marcar concluída"}
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[12px] text-[var(--text-3)]">Recolhas concluem-se durante a carga; entregas e paragens intermédias durante a viagem.</p>
              </Panel>
              <Panel title="Linhas de carga">
                <table className="ui-table">
                  <thead>
                    <tr><th>Descrição</th><th className="r">Quantidade</th><th className="r">Paletes</th><th className="r">Peso</th><th>Mercadoria perigosa</th></tr>
                  </thead>
                  <tbody>
                    {job.cargo.map((c) => (
                      <tr key={c.id}>
                        <td>{c.description}</td>
                        <td className="num r">{c.quantity} {c.unit === "pallet" ? "paletes" : c.unit === "package" ? "volumes" : c.unit === "bulk" ? "granel" : "unid."}</td>
                        <td className="num r">{c.pallets ?? (c.unit === "pallet" ? c.quantity : "—")}</td>
                        <td className="num r">{fmtKg(c.weightKg)}</td>
                        <td className="text-[var(--text-2)]">{c.dangerousGoods ? [c.dangerousGoods.unNumber, c.dangerousGoods.adrClass].filter(Boolean).join(" · ") : "—"}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="font-medium">Total</td>
                      <td />
                      <td className="num r font-medium">{job.totalPallets}</td>
                      <td className="num r font-medium">{fmtKg(job.totalWeightKg)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </Panel>
            </div>
          )}

          {tab === "plan" && (
            <div className="bg-[var(--surface)]">
              <Panel title="Decisão de planeamento" action={["backlog", "queued", "assigned"].includes(job.status) ? <Link to={paths.dispatch(job.id)}><Button size="sm" variant="primary">{job.planStatus === "UNPLANNED" ? "Planear na Expedição" : "Replanear na Expedição"}</Button></Link> : undefined}>
                <PlanDecision job={job} />
              </Panel>
            </div>
          )}

          {tab === "documents" && (
            <div className="bg-[var(--surface)]">
              <Panel title="Documentos">
                <JobDocuments job={job} />
              </Panel>
            </div>
          )}

          {tab === "history" && (
            <div className="bg-[var(--surface)]">
              <Panel title="Histórico operacional">
                <EventHistory entityId={job.id} revisionKey={job.revision} statusLabel={(s) => JOB_STATUS[s as keyof typeof JOB_STATUS]?.label ?? s} />
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
