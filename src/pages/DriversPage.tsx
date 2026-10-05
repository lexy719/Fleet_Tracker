import { AlertTriangle, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFleetData } from "../context/FleetDataContext";
import { useJobs } from "../context/JobsContext";
import type { DriverOperationalState } from "../data/types";
import { driverHoursForPlanning, driverOperationalState, driverQualifications } from "../domain/drivers/drivers";
import { paths } from "../lib/appLinks";
import { fmtAge, fmtHours } from "../ui/format";
import { Button, Checkbox, EmptyState, PageHeader, ProvenanceTag, StatusBadge, Tabs } from "../ui/kit";
import { JobRef, resourceWork } from "../ui/resources/resourceParts";
import { useEditors } from "../ui/shell/editors";
import { DRIVER_STATE, toneVars } from "../ui/status";

type Filter = "all" | "available" | "working" | "attention";
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Compact licence summary: "C+E · ADR". */
function licenceSummary(cats: string[], adr: boolean) {
  const ce = cats.includes("CE") ? "C+E" : cats.includes("C") ? "C" : cats.includes("C1E") ? "C1+E" : cats.includes("C1") ? "C1" : cats.join(", ") || "—";
  return adr ? `${ce} · ADR` : ce;
}

export function DriversPage() {
  const { drivers } = useFleetData();
  const { jobs } = useJobs();
  const ed = useEditors();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [archived, setArchived] = useState(false);
  const [now] = useState(() => new Date());

  const rows = useMemo(
    () =>
      drivers
        .filter((d) => (archived ? true : !d.archivedAt))
        .map((d) => {
          const state = driverOperationalState(d, jobs);
          const quals = driverQualifications(d, now);
          const worst = quals.find((x) => x.state === "EXPIRED") ?? quals.find((x) => x.state === "EXPIRING");
          return { d, state, hours: driverHoursForPlanning(d, now.getTime()), worst, work: resourceWork(jobs, (j) => j.assignedDriverId === d.id) };
        })
        .sort((a, b) => a.d.name.localeCompare(b.d.name, "pt")),
    [drivers, jobs, archived, now],
  );
  const working: DriverOperationalState[] = ["ASSIGNED", "ON_JOB"];
  const counts = {
    all: rows.length,
    available: rows.filter((r) => r.state === "AVAILABLE").length,
    working: rows.filter((r) => working.includes(r.state)).length,
    attention: rows.filter((r) => r.worst).length,
  };
  const shown = rows.filter((r) => {
    if (filter === "available" && r.state !== "AVAILABLE") return false;
    if (filter === "working" && !working.includes(r.state)) return false;
    if (filter === "attention" && !r.worst) return false;
    return !q || norm(`${r.d.name} ${r.d.employeeNumber ?? ""} ${r.d.homeTerminal ?? ""}`).includes(norm(q));
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Motoristas" meta={`${drivers.filter((d) => !d.archivedAt).length} ativos`} actions={<Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => ed.openDriver()}>Novo motorista</Button>}>
        <div className="flex items-center gap-3 pb-2">
          <input className="ui-input w-[260px]" placeholder="Procurar nome, n.º, base…" aria-label="Procurar motoristas" value={q} onChange={(e) => setQ(e.target.value)} />
          <Checkbox label="Incluir arquivados" checked={archived} onChange={setArchived} />
          <span className="ml-auto text-[12px] text-[var(--text-3)]">Horas de condução: base registada manualmente — não é leitura de tacógrafo.</span>
        </div>
        <Tabs value={filter} onChange={setFilter} items={[{ value: "all", label: "Todos", count: counts.all }, { value: "available", label: "Disponíveis", count: counts.available }, { value: "working", label: "Atribuídos / em trabalho", count: counts.working }, { value: "attention", label: "Qualificações", count: counts.attention }]} />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface)] scroll-thin">
        {shown.length === 0 ? (
          <EmptyState title="Sem motoristas neste filtro" />
        ) : (
          <table className="ui-table min-w-[1000px]">
            <thead>
              <tr>
                <th>Motorista</th>
                <th>Estado</th>
                <th className="r">Hoje</th>
                <th className="r">Semana</th>
                <th>Qualificações</th>
                <th>Trabalho</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ d, state, hours, worst, work }) => (
                <tr key={d.id} data-clickable="true" onClick={() => navigate(paths.driver(d.id))} data-testid="driver-row">
                  <td className="w-[230px]">
                    <span className="block font-medium">{d.name}{d.isDemo ? <ProvenanceTag kind="DEMO" className="ml-1.5" /> : null}</span>
                    <span className="block text-[12px] text-[var(--text-3)]">{[d.employeeNumber, d.homeTerminal].filter(Boolean).join(" · ") || "—"}</span>
                  </td>
                  <td className="w-[150px]"><StatusBadge status={DRIVER_STATE[state]} /></td>
                  <td className="num r w-[70px]" title={d.hours ? `Base de horas ${d.hours.source === "DEMO" ? "demo" : "manual"} · registada ${fmtAge(d.hours.recordedAt, now)}` : "Sem base de horas registada"}>{hours.todayKnown ? fmtHours(hours.hoursToday) : <span className="text-[var(--text-3)]">—</span>}</td>
                  <td className="num r w-[80px]" title={d.hours ? `Registada ${fmtAge(d.hours.recordedAt, now)}` : "Sem base de horas registada"}>{hours.weekKnown ? <>{fmtHours(hours.hoursWeek)}{d.hours?.source !== "DEMO" ? <span aria-label="valor manual" className="ml-1 text-[10px] text-[var(--text-3)]">M</span> : null}</> : <span className="text-[var(--text-3)]">—</span>}</td>
                  <td className="w-[200px]">
                    <span className="num">{licenceSummary(d.licence.categories, d.adr.certified)}</span>
                    {worst ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-[12px]" style={{ color: toneVars(worst.state === "EXPIRED" ? "danger" : "warn").fg }} title={`${worst.label}: ${worst.expiresOn}`}>
                        <AlertTriangle className="h-3 w-3" />{worst.kind === "licence" ? "Carta" : worst.kind === "cpc" ? "CAM" : worst.kind === "adr" ? "ADR" : "Tacógrafo"}
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-[240px]"><JobRef job={work.current ?? work.next} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
