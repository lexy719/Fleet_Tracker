import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useFleetData } from "../context/FleetDataContext";
import { useJobs } from "../context/JobsContext";
import { driverHoursForPlanning, driverOperationalState, driverQualifications } from "../domain/drivers/drivers";
import { paths } from "../lib/appLinks";
import { fmtAge, fmtDay, fmtHours, fmtWhen } from "../ui/format";
import { Button, DataList, EmptyState, IconButton, Notice, PageHeader, ProvenanceTag, SectionTitle, StatusBadge, Tabs } from "../ui/kit";
import { EventHistory } from "../ui/job/JobParts";
import { ResourceHeaderActions } from "../ui/resources/ResourceHeaderActions";
import { JobRef, resourceWork, WorkTable } from "../ui/resources/resourceParts";
import { useEditors } from "../ui/shell/editors";
import { DRIVER_STATE, QUALIFICATION } from "../ui/status";

type Tab = "overview" | "work" | "hours" | "qualifications" | "history";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--border)] px-6 py-4">
      <SectionTitle className="mb-3">{title}</SectionTitle>
      {children}
    </section>
  );
}

export function DriverPage() {
  const { driverId = "" } = useParams();
  const { getDriver, getTruck } = useFleetData();
  const { jobs } = useJobs();
  const ed = useEditors();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";
  const [now] = useState(() => new Date());
  const d = getDriver(driverId);
  const work = useMemo(() => resourceWork(jobs, (j) => j.assignedDriverId === driverId), [jobs, driverId]);
  if (!d) return <div className="flex-1 bg-[var(--surface)]"><EmptyState title="Motorista não encontrado" action={<Link to={paths.drivers()}><Button>Voltar aos motoristas</Button></Link>} /></div>;

  const state = driverOperationalState(d, jobs);
  const quals = driverQualifications(d, now);
  const problems = quals.filter((q) => q.state === "EXPIRED" || q.state === "EXPIRING");
  const h = driverHoursForPlanning(d, now.getTime());
  const truck = getTruck((work.current ?? work.next)?.assignedTruckId);

  const qualTable = (
    <table className="ui-table">
      <thead><tr><th>Qualificação</th><th>Validade</th><th>Estado</th><th className="r">Dias</th></tr></thead>
      <tbody>
        {quals.map((q) => (
          <tr key={q.kind}>
            <td>{q.label}</td>
            <td className="num text-[var(--text-2)]">{q.expiresOn ? fmtDay(`${q.expiresOn}T12:00:00Z`) + ` ${q.expiresOn.slice(0, 4)}` : "—"}</td>
            <td><StatusBadge status={QUALIFICATION[q.state]} /></td>
            <td className="num r text-[var(--text-2)]">{q.daysLeft !== undefined ? q.daysLeft : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={<span className="flex items-center gap-2"><IconButton label="Voltar" onClick={() => navigate(paths.drivers())}><ArrowLeft className="h-4 w-4" /></IconButton>{d.name}</span>}
        meta={<span className="inline-flex items-center gap-2"><StatusBadge status={DRIVER_STATE[state]} />{d.isDemo ? <ProvenanceTag kind="DEMO" /> : null}</span>}
        actions={<ResourceHeaderActions kind="driver" id={d.id} label={d.name} archived={!!d.archivedAt} onEdit={() => ed.openDriver(d.id)} listPath={paths.drivers()} />}
      >
        <Tabs value={tab} onChange={(v) => setParams(v === "overview" ? {} : { tab: v }, { replace: true })} items={[{ value: "overview", label: "Resumo" }, { value: "work", label: "Trabalho" }, { value: "hours", label: "Tempo de condução" }, { value: "qualifications", label: "Qualificações", count: problems.length || undefined }, { value: "history", label: "Histórico" }]} />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)] scroll-thin">
        <div className="mx-auto max-w-[1280px]">
          {tab === "overview" && (
            <>
              {problems.length ? (
                <div className="space-y-1 px-6 pt-4">
                  {problems.map((q) => <Notice key={q.kind} tone={q.state === "EXPIRED" ? "danger" : "warn"} title={`${q.label}: ${q.state === "EXPIRED" ? "caducado" : `caduca em ${q.daysLeft} dias`}`}>Validade {q.expiresOn}.</Notice>)}
                </div>
              ) : null}
              <div className="grid grid-cols-1 xl:grid-cols-2 xl:divide-x xl:divide-[var(--border)]">
<div>
<Panel title="Disponibilidade e trabalho">
                <DataList rows={[
                  { label: "Disponibilidade", value: `${{ AVAILABLE: "Disponível", OFF_DUTY: "Fora de serviço", LEAVE: "Ausente", UNAVAILABLE: "Indisponível" }[d.availability]} (manual)` },
                  { label: "Estado operacional", value: <StatusBadge status={DRIVER_STATE[state]} /> },
                  { label: "Trabalho atual", value: <JobRef job={work.current} /> },
                  { label: "Próximo", value: <JobRef job={work.next} /> },
                  { label: "Viatura", value: truck ? <Link className="hover:underline" to={paths.truck(truck.id)}><span className="num">{truck.plate}</span></Link> : <span className="text-[var(--text-3)]">— (definida por trabalho)</span> },
                ]} />
              </Panel>
              <Panel title="Contacto">
                <DataList rows={[
                  { label: "N.º colaborador", value: d.employeeNumber ?? "—" },
                  { label: "Telefone", value: d.phone ? <a className="num hover:underline" href={`tel:${d.phone.replace(/\s/g, "")}`}>{d.phone}</a> : "—" },
                  { label: "Email", value: d.email ?? "—" },
                  { label: "Base", value: d.homeTerminal ?? "—" },
                ]} />
              </Panel>
              </div>
<div>
<Panel title="Qualificações">{qualTable}</Panel>
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
          {tab === "hours" && (
            <Panel title="Base de horas de condução (UE 561)">
              {d.hours ? (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <ProvenanceTag kind={d.hours.source === "DEMO" ? "DEMO" : "MANUAL"} detail={`registado ${fmtWhen(d.hours.recordedAt, now)} (${fmtAge(d.hours.recordedAt, now)})`} />
                    <span className="text-[12px] text-[var(--text-3)]">Introduzido manualmente — não é uma leitura de tacógrafo.</span>
                  </div>
                  <DataList rows={[
                    { label: "Conduzido no dia do registo", value: fmtHours(d.hours.drivenTodayMin / 60) },
                    { label: "Conduzido na semana do registo", value: `${fmtHours(d.hours.drivenWeekMin / 60)} de 56h00` },
                    { label: "Desde a última pausa", value: d.hours.currentSpellMin !== undefined ? `${d.hours.currentSpellMin} min` : <span className="text-[var(--text-3)]">Desconhecido</span> },
                    { label: "Início do serviço", value: d.hours.dutyStartedAt ? fmtWhen(d.hours.dutyStartedAt, now) : <span className="text-[var(--text-3)]">Desconhecido</span> },
                  ]} />
                  <SectionTitle className="mb-2 mt-5">Válido para o planeamento de hoje</SectionTitle>
                  <DataList rows={[
                    { label: "Hoje", value: h.todayKnown ? fmtHours(h.hoursToday) : <span className="text-[var(--text-3)]">Desconhecido — base de outro dia (o planeador assume 0 h)</span> },
                    { label: "Esta semana", value: h.weekKnown ? fmtHours(h.hoursWeek) : <span className="text-[var(--text-3)]">Desconhecido — base de outra semana (o planeador assume 0 h)</span> },
                  ]} />
                </>
              ) : (
                <EmptyState className="py-6" title="Sem base de horas registada" detail="O planeador calcula a UE 561 a partir de 0 h e indica que o valor é desconhecido." action={<Button onClick={() => ed.openDriver(d.id)}>Registar base de horas</Button>} />
              )}
            </Panel>
          )}
          {tab === "qualifications" && (
            <>
              <Panel title="Carta de condução">
                <DataList rows={[{ label: "Categorias", value: d.licence.categories.join(", ") || "—" }, { label: "N.º", value: d.licence.number ?? "—" }]} />
              </Panel>
              <Panel title="Validades">{qualTable}</Panel>
              <Panel title="ADR">
                <DataList rows={[{ label: "Certificado", value: d.adr.certified ? "Sim" : "Não" }, ...(d.adr.certified ? [{ label: "Classes", value: d.adr.classes?.join(", ") || "todas / não especificado" }, { label: "Cisternas", value: d.adr.tanks ? "Sim" : "Não" }] : [])]} />
                <p className="mt-2 text-[12px] text-[var(--text-3)]">Nesta fase as validades geram avisos; o bloqueio automático na atribuição chega com a verificação de compatibilidade.</p>
              </Panel>
            </>
          )}
          {tab === "history" && <Panel title="Histórico"><EventHistory entityId={d.id} revisionKey={d.updatedAt} /></Panel>}
        </div>
      </div>
    </div>
  );
}
