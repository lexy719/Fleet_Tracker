import { Maximize2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useJobs } from "../../context/JobsContext";
import { paths } from "../../lib/appLinks";
import { Button, Drawer, EmptyState } from "../kit";
import { JOB_STATUS } from "../status";
import { AttentionList, EventHistory, JobActions, JobHero, JobPlanSummary, JobResources, RouteTimeline, SectionBlock, CargoSummary } from "./JobParts";

/** Quick inspection of a job without leaving the current list. */
export function JobDrawer({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { getJob } = useJobs();
  const job = getJob(jobId);
  if (!job) {
    return (
      <Drawer title="Trabalho não encontrado" onClose={onClose}>
        <EmptyState title="Este trabalho não existe neste navegador" detail="Pode ter sido criado noutro dispositivo ou o link está incorreto." />
      </Drawer>
    );
  }
  return (
    <Drawer
      width={640}
      onClose={onClose}
      title={<span className="num text-[13px] font-medium text-[var(--text-2)]">Trabalho {job.jobNumber}</span>}
      headerActions={
        <Link to={paths.job(job.id)}>
          <Button size="sm" variant="ghost" icon={<Maximize2 className="h-3.5 w-3.5" />}>Abrir dossiê</Button>
        </Link>
      }
    >
      <div className="divide-y divide-[var(--border)]">
        <div className="space-y-4 px-5 pb-4 pt-4">
          <JobHero job={job} />
          <AttentionList job={job} />
          <JobActions job={job} />
        </div>
        <SectionBlock title="Paragens">
          <RouteTimeline job={job} />
        </SectionBlock>
        <SectionBlock title="Recursos">
          <JobResources job={job} />
        </SectionBlock>
        <SectionBlock title="Carga">
          <CargoSummary job={job} />
        </SectionBlock>
        <SectionBlock title="Plano">
          <JobPlanSummary job={job} />
        </SectionBlock>
        {job.notes ? (
          <SectionBlock title="Notas">
            <p className="whitespace-pre-wrap text-[13px] text-[var(--text-2)]">{job.notes}</p>
          </SectionBlock>
        ) : null}
        <SectionBlock title="Histórico">
          <EventHistory entityId={job.id} revisionKey={job.revision} statusLabel={(s) => JOB_STATUS[s as keyof typeof JOB_STATUS]?.label ?? s} />
        </SectionBlock>
      </div>
    </Drawer>
  );
}
