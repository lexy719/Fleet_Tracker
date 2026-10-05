import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFleetData } from "../context/FleetDataContext";
import { complianceCounts, driverComplianceItems, filterCompliance, type ComplianceFilter } from "../domain/compliance";
import { paths } from "../lib/appLinks";
import { Button, EmptyState, PageHeader, Pill, StatusBadge, Tabs } from "../ui/kit";
import { fold } from "../ui/records/RecordLists";
import { useEditors } from "../ui/shell/editors";
import { QUALIFICATION } from "../ui/status";

const FILTERS: { value: ComplianceFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "expiring", label: "A caducar" },
  { value: "expired", label: "Caducados" },
  { value: "missing", label: "Não registados" },
];

function remaining(days: number | undefined) {
  if (days === undefined) return "—";
  if (days < 0) return `caducou há ${-days} d`;
  if (days === 0) return "caduca hoje";
  return `${days} d`;
}

/** Conformidade: validity of driver credentials (vehicles will join the same register later). */
export function CompliancePage() {
  const { drivers } = useFleetData();
  const ed = useEditors();
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.some((f) => f.value === params.get("f")) ? params.get("f") : "all") as ComplianceFilter;
  const [q, setQ] = useState("");
  const dq = fold(useDeferredValue(q));
  const [now] = useState(() => new Date());
  const items = useMemo(() => driverComplianceItems(drivers, now), [drivers, now]);
  const counts = complianceCounts(items);
  const rows = filterCompliance(items, filter).filter((i) => !dq || fold(`${i.subject.name} ${i.label}`).includes(dq));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Conformidade" meta={<span>Validade de cartas, CAM/CPC, ADR e cartões de tacógrafo dos motoristas</span>}>
        <Tabs value={filter} onChange={(v) => setParams(v === "all" ? {} : { f: v }, { replace: true })} items={FILTERS.map((f) => ({ ...f, count: f.value === "all" ? undefined : counts[f.value] || undefined }))} />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)] scroll-thin">
        <div className="px-6 py-4">
          <div className="relative mb-3 max-w-[360px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
            <input className="ui-input pl-8" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar motorista ou documento…" aria-label="Procurar" />
          </div>
          {rows.length ? (
            <table className="ui-table">
              <thead>
                <tr><th>Motorista</th><th>Documento</th><th>Validade</th><th className="r">Restam</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.key}>
                    <td><Link className="font-medium hover:underline" to={paths.driver(i.subject.id, "qualifications")}>{i.subject.name}</Link>{i.subject.isDemo ? <Pill className="ml-2">Demo</Pill> : null}</td>
                    <td className="text-[var(--text-2)]">{i.label}</td>
                    <td className="num text-[var(--text-2)]">{i.expiresOn ? i.expiresOn.split("-").reverse().join("/") : "—"}</td>
                    <td className="num r text-[var(--text-2)]">{remaining(i.daysLeft)}</td>
                    <td><StatusBadge status={QUALIFICATION[i.state]} /></td>
                    <td className="r"><Button size="sm" variant={i.state === "VALID" ? "ghost" : "secondary"} onClick={() => ed.openDriver(i.subject.id)}>Atualizar</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title={dq ? "Nenhum resultado para esta pesquisa" : filter === "all" ? "Sem motoristas ativos" : "Nada nesta categoria"} detail={dq ? "Ajuste ou limpe a pesquisa." : filter === "missing" ? "Todas as validades estão registadas." : undefined} />
          )}
          <p className="mt-3 text-[12px] text-[var(--text-3)]">«Não registado» significa que a validade não foi introduzida — não é tratado como válido nem como caducado. A caducar: 60 dias ou menos.</p>
        </div>
      </div>
    </div>
  );
}
