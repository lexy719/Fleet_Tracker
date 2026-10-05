import { FilePlus2, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useJobs } from "../context/JobsContext";
import { DOC_LABEL, issueBlockers, missingDocuments, type DocumentType } from "../domain/documents/documents";
import { isoToLocalDate } from "../domain/time";
import { paths } from "../lib/appLinks";
import { fmtEur, fmtWhen } from "../ui/format";
import { Button, EmptyState, Notice, PageHeader, Pill, StatusBadge, Tabs } from "../ui/kit";
import { DOC_STATUS, DocumentRowActions, useDocuments } from "../ui/documents/DocumentParts";
import { fold } from "../ui/records/RecordLists";
import { JOB_STATUS } from "../ui/status";

type View = "issued" | "pending";
type TypeFilter = "all" | DocumentType;
type StatusFilter = "all" | "ISSUED" | "VOID";

const PAGE = 200;

/** Documentos: every issued CMR / invoice, and what is still due to be issued. */
export function DocumentsPage() {
  const { documents, issue } = useDocuments();
  const { jobs } = useJobs();
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "pending" ? "pending" : "issued";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);
  const dq = fold(useDeferredValue(q));

  const issued = useMemo(() => {
    return documents
      .filter((d) => (type === "all" || d.type === type) && (status === "all" || d.status === status))
      .filter((d) => {
        if (!from && !to) return true;
        const day = isoToLocalDate(Date.parse(d.issuedAt));
        return (!from || day >= from) && (!to || day <= to);
      })
      .filter((d) => !dq || fold(`${d.number} ${d.jobNumber} ${d.customerName} ${d.snapshot.job.reference}`).includes(dq))
      .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : 0));
  }, [documents, type, status, from, to, dq]);

  const pending = useMemo(() => {
    const rows: { job: (typeof jobs)[number]; type: DocumentType }[] = [];
    for (const j of jobs) for (const t of missingDocuments(j, documents)) if (type === "all" || t === type) rows.push({ job: j, type: t });
    return rows
      .filter((r) => !dq || fold(`${r.job.jobNumber} ${r.job.client} ${r.job.reference}`).includes(dq))
      .sort((a, b) => (a.job.deliveryDeadline < b.job.deliveryDeadline ? -1 : 1));
  }, [jobs, documents, type, dq]);

  const pendingCount = useMemo(() => jobs.reduce((n, j) => n + missingDocuments(j, documents).length, 0), [jobs, documents]);
  const setView = (v: View) => setParams((p) => { const n = new URLSearchParams(p); if (v === "issued") n.delete("view"); else n.set("view", v); return n; }, { replace: true });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Documentos" meta={<span>Guias CMR e faturas emitidas a partir dos trabalhos</span>}>
        <Tabs value={view} onChange={setView} items={[{ value: "issued", label: "Emitidos" }, { value: "pending", label: "Por emitir", count: pendingCount || undefined }]} />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)] scroll-thin">
        <div className="px-6 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
              <input className="ui-input pl-8" type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Número, trabalho, cliente ou referência…" aria-label="Procurar documentos" />
            </div>
            <select className="ui-input w-auto" aria-label="Tipo" value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
              <option value="all">Todos os tipos</option>
              <option value="CMR">Guias CMR</option>
              <option value="INVOICE">Faturas</option>
            </select>
            {view === "issued" ? (
              <>
                <select className="ui-input w-auto" aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                  <option value="all">Todos os estados</option>
                  <option value="ISSUED">Emitidos</option>
                  <option value="VOID">Anulados</option>
                </select>
                <input className="ui-input num w-auto" type="date" aria-label="Emitido desde" value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-[12px] text-[var(--text-3)]">a</span>
                <input className="ui-input num w-auto" type="date" aria-label="Emitido até" value={to} onChange={(e) => setTo(e.target.value)} />
              </>
            ) : null}
          </div>
          {error ? <Notice className="mb-3" title="O documento não foi emitido">{error}</Notice> : null}

          {view === "issued" ? (
            issued.length ? (
              <>
                <table className="ui-table">
                  <thead><tr><th>Número</th><th>Tipo</th><th>Trabalho</th><th>Cliente</th><th>Emitido</th><th className="r">Valor</th><th>Estado</th><th /></tr></thead>
                  <tbody>
                    {issued.slice(0, limit).map((d) => (
                      <tr key={d.id} className={d.status === "VOID" ? "text-[var(--text-3)]" : undefined}>
                        <td className="num font-medium">{d.number}</td>
                        <td className="text-[var(--text-2)]">{DOC_LABEL[d.type]}</td>
                        <td className="num"><Link className="hover:underline" to={paths.job(d.jobId, "documents")}>{d.jobNumber}</Link></td>
                        <td>{d.customerName}{d.isDemo ? <Pill className="ml-2">Demo</Pill> : null}</td>
                        <td className="num text-[var(--text-2)]">{fmtWhen(d.issuedAt)}</td>
                        <td className="num r text-[var(--text-2)]">{d.type === "INVOICE" ? fmtEur(d.snapshot.job.rateEur * (1 + d.snapshot.company.vatPct / 100)) : "—"}</td>
                        <td><StatusBadge status={DOC_STATUS[d.status]} /></td>
                        <td className="r"><DocumentRowActions doc={d} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {issued.length > limit ? <div className="mt-3 text-center"><Button onClick={() => setLimit((l) => l + PAGE)}>Mostrar mais ({issued.length - limit})</Button></div> : null}
              </>
            ) : (
              <EmptyState title={documents.length ? "Nenhum documento corresponde aos filtros" : "Ainda não foram emitidos documentos"} detail={documents.length ? undefined : "Emita a guia CMR ou a fatura a partir do separador Documentos de cada trabalho, ou em «Por emitir»."} />
            )
          ) : pending.length ? (
            <table className="ui-table">
              <thead><tr><th>Trabalho</th><th>Cliente</th><th>Estado</th><th>Documento em falta</th><th /></tr></thead>
              <tbody>
                {pending.slice(0, limit).map(({ job, type: t }) => {
                  const blockers = issueBlockers(t, job, documents);
                  return (
                    <tr key={`${job.id}-${t}`}>
                      <td className="num"><Link className="font-medium hover:underline" to={paths.job(job.id, "documents")}>{job.jobNumber}</Link></td>
                      <td>{job.client}</td>
                      <td><StatusBadge status={JOB_STATUS[job.status]} /></td>
                      <td>{DOC_LABEL[t]}</td>
                      <td className="r">
                        <Button size="sm" disabled={!!blockers.length} title={blockers[0]} icon={<FilePlus2 className="h-3.5 w-3.5" />} onClick={async () => { const r = await issue(job.id, t); setError(r.ok ? null : r.errors.join("; ")); }}>Emitir</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState title="Nada por emitir" detail="A guia CMR é esperada a partir da carga; a fatura depois da entrega." />
          )}
        </div>
      </div>
    </div>
  );
}
