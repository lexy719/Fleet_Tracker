import { Link } from "react-router-dom";
import type { Job } from "../../data/types";
import { paths } from "../../lib/appLinks";
import { fmtAge, fmtWhen, stopWindowText } from "../format";
import { EmptyState, ProvenanceTag, StatusBadge } from "../kit";
import { JOB_STATUS } from "../status";
import { firstStop, jobAnchor, lastStop } from "../work/workModel";
import type { Measured } from "../../data/types";

/* Shared pieces for truck / trailer / driver workspaces. */

export type ResourceWork = { current: Job | null; next: Job | null; upcoming: Job[]; past: Job[] };

/** Work linked to a resource, derived from jobs (no scheduling model yet). */
export function resourceWork(jobs: Job[], match: (j: Job) => boolean): ResourceWork {
  const mine = jobs.filter(match);
  const current = mine.find((j) => j.status === "loading" || j.status === "in_transit") ?? null;
  const upcoming = mine.filter((j) => j.status === "assigned" || j.status === "queued").sort((a, b) => jobAnchor(a) - jobAnchor(b));
  const past = mine.filter((j) => ["delivered", "invoiced", "cancelled"].includes(j.status)).sort((a, b) => jobAnchor(b) - jobAnchor(a));
  return { current, next: upcoming[0] ?? null, upcoming, past };
}

export function JobRef({ job }: { job: Job | null }) {
  if (!job) return <span className="text-[var(--text-3)]">—</span>;
  return (
    <Link to={paths.workJob(job.id)} className="block truncate hover:underline" onClick={(e) => e.stopPropagation()}>
      <span className="num font-medium">{job.jobNumber}</span> <span className="text-[var(--text-3)]">{firstStop(job)?.city} → {lastStop(job)?.city}</span>
    </Link>
  );
}

export function WorkTable({ jobs, empty }: { jobs: Job[]; empty: string }) {
  if (!jobs.length) return <EmptyState className="py-6" title={empty} />;
  return (
    <table className="ui-table">
      <thead>
        <tr><th>Trabalho</th><th>Cliente</th><th>Rota</th><th>Recolha</th><th>Estado</th></tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.id}>
            <td className="num w-[110px] font-medium"><Link to={paths.workJob(j.id)} className="hover:underline">{j.jobNumber}</Link></td>
            <td className="max-w-[220px] truncate">{j.client}</td>
            <td className="text-[var(--text-2)]">{firstStop(j)?.city} → {lastStop(j)?.city}</td>
            <td className="num text-[var(--text-2)]">{stopWindowText(firstStop(j))}</td>
            <td><StatusBadge status={JOB_STATUS[j.status]} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A manually recorded measurement with its provenance and age. */
export function MeasuredValue({ m, format }: { m: Measured<number> | undefined; format: (v: number) => string }) {
  if (!m) return <ProvenanceTag kind="UNKNOWN" />;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="num">{format(m.value)}</span>
      <ProvenanceTag kind={m.source === "DEMO" ? "DEMO" : "MANUAL"} detail={fmtAge(m.recordedAt)} />
      <span className="sr-only">registado {fmtWhen(m.recordedAt)}</span>
    </span>
  );
}

/** Value or an explicit «Desconhecido». */
export function Known({ v, unit }: { v: number | string | undefined | null; unit?: string }) {
  if (v === undefined || v === null || v === "") return <span className="text-[var(--text-3)]">Desconhecido</span>;
  return <span className="num">{typeof v === "number" ? v.toLocaleString("pt-PT") : v}{unit ? ` ${unit}` : ""}</span>;
}
