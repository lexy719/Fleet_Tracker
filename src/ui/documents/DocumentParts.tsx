import { ExternalLink, FilePlus2, Printer, Ban } from "lucide-react";
import { useMemo, useState } from "react";
import { useOperations } from "../../context/OperationsContext";
import { companySnapshot, useSettings } from "../../context/SettingsContext";
import type { Job } from "../../data/types";
import { DOC_LABEL, issueBlockers, missingDocuments, type DocumentType, type OpsDocument } from "../../domain/documents/documents";
import { renderDocumentHtml } from "../../lib/documentRender";
import { fmtWhen } from "../format";
import { Button, Field, Modal, Notice, StatusBadge } from "../kit";
import type { StatusView } from "../status";

export const DOC_STATUS: Record<OpsDocument["status"], StatusView> = {
  ISSUED: { label: "Emitido", tone: "ok" },
  VOID: { label: "Anulado", tone: "neutral" },
};

/** Open the stored snapshot in a new tab; `print` triggers the browser print dialog. */
export function openDocument(doc: OpsDocument, print = false) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(renderDocumentHtml(doc));
  w.document.close();
  if (print) w.addEventListener("load", () => w.print(), { once: true });
}

export function useDocuments() {
  const { state, service } = useOperations();
  const { settings } = useSettings();
  return {
    documents: state.documents,
    issue: (jobId: string, type: DocumentType) => service.issueDocument(jobId, type, companySnapshot(settings)),
    voidDoc: (id: string, reason: string) => service.voidDocument(id, reason),
  };
}

export function VoidDocumentModal({ doc, onClose }: { doc: OpsDocument; onClose: () => void }) {
  const { voidDoc } = useDocuments();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={`Anular ${doc.number}?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button variant="danger" disabled={reason.trim().length < 3} onClick={async () => { const r = await voidDoc(doc.id, reason); if (r.ok) onClose(); else setError(r.errors.join("; ")); }}>Anular documento</Button>
        </>
      }
    >
      <p className="mb-3">O número {doc.number} fica registado como anulado e não volta a ser usado.</p>
      <Field label="Motivo"><input className="ui-input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex.: dados do cliente errados" /></Field>
      {error ? <Notice className="mt-2" title="Não foi possível anular">{error}</Notice> : null}
    </Modal>
  );
}

export function DocumentRowActions({ doc }: { doc: OpsDocument }) {
  const [voiding, setVoiding] = useState(false);
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => openDocument(doc)}>Abrir</Button>
      <Button size="sm" variant="ghost" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => openDocument(doc, true)}>Imprimir</Button>
      {doc.status === "ISSUED" ? <Button size="sm" variant="ghost" icon={<Ban className="h-3.5 w-3.5" />} onClick={() => setVoiding(true)}>Anular</Button> : null}
      {voiding ? <VoidDocumentModal doc={doc} onClose={() => setVoiding(false)} /> : null}
    </div>
  );
}

const TYPES: DocumentType[] = ["CMR", "INVOICE"];

/** Job dossier → Documentos: what exists, what is still due, and how to issue it. */
export function JobDocuments({ job }: { job: Job }) {
  const { documents, issue } = useDocuments();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<DocumentType | null>(null);
  const docs = useMemo(() => documents.filter((d) => d.jobId === job.id).sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1)), [documents, job.id]);
  const missing = missingDocuments(job, documents);
  return (
    <div className="space-y-3">
      {error ? <Notice title="O documento não foi emitido">{error}</Notice> : null}
      <table className="ui-table">
        <thead>
          <tr><th>Documento</th><th>Número</th><th>Emitido</th><th>Estado</th><th /></tr>
        </thead>
        <tbody>
          {TYPES.filter((t) => !docs.some((d) => d.type === t && d.status === "ISSUED")).map((t) => {
            const blockers = issueBlockers(t, job, documents);
            return (
              <tr key={`new-${t}`}>
                <td className="font-medium">{DOC_LABEL[t]}</td>
                <td className="text-[var(--text-3)]">—</td>
                <td className="text-[var(--text-3)]">{missing.includes(t) ? <span className="text-[var(--warn)]">Por emitir</span> : "—"}</td>
                <td className="text-[12px] text-[var(--text-3)]">{blockers.length ? blockers[0].charAt(0).toUpperCase() + blockers[0].slice(1) : "Pronto a emitir"}</td>
                <td className="r">
                  <Button size="sm" variant={missing.includes(t) ? "primary" : "secondary"} disabled={!!blockers.length || busy !== null} icon={<FilePlus2 className="h-3.5 w-3.5" />} onClick={async () => { setBusy(t); const r = await issue(job.id, t); setBusy(null); setError(r.ok ? null : r.errors.join("; ")); }}>
                    Emitir
                  </Button>
                </td>
              </tr>
            );
          })}
          {docs.map((d) => (
            <tr key={d.id} className={d.status === "VOID" ? "text-[var(--text-3)]" : undefined}>
              <td className="font-medium">{DOC_LABEL[d.type]}</td>
              <td className="num">{d.number}</td>
              <td className="num text-[var(--text-2)]">{fmtWhen(d.issuedAt)}</td>
              <td><StatusBadge status={DOC_STATUS[d.status]} />{d.voidReason ? <span className="ml-2 text-[12px]">{d.voidReason}</span> : null}</td>
              <td className="r"><DocumentRowActions doc={d} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[12px] text-[var(--text-3)]">Cada documento guarda os dados do momento da emissão; abrir ou reimprimir não altera o número. Não substitui software de faturação certificado pela AT.</p>
    </div>
  );
}
