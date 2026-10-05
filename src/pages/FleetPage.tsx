import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFleetData } from "../context/FleetDataContext";
import { useJobs } from "../context/JobsContext";
import { trailerOperationalState, trailerTypeLabel } from "../domain/fleet/trailers";
import { truckDisplayName, truckOperationalState, truckPayloadKg } from "../domain/fleet/trucks";
import { paths } from "../lib/appLinks";
import { fmtTonnes } from "../ui/format";
import { Button, Checkbox, EmptyState, PageHeader, ProvenanceTag, StatusBadge, Tabs } from "../ui/kit";
import { JobRef, resourceWork } from "../ui/resources/resourceParts";
import { useEditors } from "../ui/shell/editors";
import { TRAILER_STATE, TRUCK_STATE } from "../ui/status";

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function TrucksTable({ q, archived }: { q: string; archived: boolean }) {
  const { trucks, getDriver } = useFleetData();
  const { jobs } = useJobs();
  const navigate = useNavigate();
  const rows = useMemo(
    () =>
      trucks
        .filter((t) => (archived ? true : !t.archivedAt))
        .filter((t) => !q || norm(`${t.plate} ${t.unitNumber ?? ""} ${truckDisplayName(t)}`).includes(norm(q)))
        .sort((a, b) => a.plate.localeCompare(b.plate))
        .map((t) => ({ t, state: truckOperationalState(t, jobs), work: resourceWork(jobs, (j) => j.assignedTruckId === t.id) })),
    [trucks, jobs, q, archived],
  );
  if (!rows.length) return <EmptyState title="Sem viaturas" detail={q ? "Nenhuma viatura corresponde à pesquisa." : "Registe a primeira viatura da frota."} />;
  return (
    <table className="ui-table min-w-[900px]">
      <thead>
        <tr>
          <th>Matrícula</th>
          <th>Viatura</th>
          <th>Estado</th>
          <th className="r">Carga útil</th>
          <th>Trabalho atual / próximo</th>
          <th>Motorista</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ t, state, work }) => {
          const d = getDriver((work.current ?? work.next)?.assignedDriverId);
          return (
            <tr key={t.id} data-clickable="true" onClick={() => navigate(paths.truck(t.id))} data-testid="truck-row">
              <td className="w-[150px]">
                <span className="num block font-medium">{t.plate}</span>
                <span className="block text-[12px] text-[var(--text-3)]">{t.unitNumber ?? "—"}{t.isDemo ? <ProvenanceTag kind="DEMO" className="ml-1.5" /> : null}</span>
              </td>
              <td className="max-w-[220px]">
                <span className="block truncate">{truckDisplayName(t)}</span>
                <span className="block text-[12px] text-[var(--text-3)]">{t.vehicleType === "TRACTOR" ? "Trator" : t.vehicleType === "RIGID" ? "Rígido" : "Furgão"}{t.yearManuf ? ` · ${t.yearManuf}` : ""}</span>
              </td>
              <td className="w-[140px]"><StatusBadge status={TRUCK_STATE[state]} /></td>
              <td className="num r w-[100px]">{fmtTonnes(truckPayloadKg(t))}</td>
              <td className="max-w-[280px]">
                {work.current ? <JobRef job={work.current} /> : work.next ? <><span className="block text-[11px] text-[var(--text-3)]">Próximo</span><JobRef job={work.next} /></> : <span className="text-[var(--text-3)]">—</span>}
              </td>
              <td className="max-w-[180px] truncate text-[var(--text-2)]">{d?.name ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TrailersTable({ q, archived }: { q: string; archived: boolean }) {
  const { trailers } = useFleetData();
  const { jobs } = useJobs();
  const navigate = useNavigate();
  const rows = useMemo(
    () =>
      trailers
        .filter((t) => (archived ? true : !t.archivedAt))
        .filter((t) => !q || norm(`${t.plate} ${t.unitNumber ?? ""} ${trailerTypeLabel(t)}`).includes(norm(q)))
        .sort((a, b) => a.plate.localeCompare(b.plate))
        .map((t) => ({ t, state: trailerOperationalState(t, jobs), work: resourceWork(jobs, (j) => j.assignedTrailerId === t.id) })),
    [trailers, jobs, q, archived],
  );
  if (!rows.length) return <EmptyState title="Sem reboques" detail={q ? "Nenhum reboque corresponde à pesquisa." : "Registe o primeiro reboque."} />;
  return (
    <table className="ui-table min-w-[960px]">
      <thead>
        <tr><th>Matrícula</th><th>Tipo</th><th>Estado</th><th className="r">Carga útil</th><th className="r">Paletes</th><th>Capacidades</th><th>Trabalho atual / próximo</th></tr>
      </thead>
      <tbody>
        {rows.map(({ t, state, work }) => {
          const caps = [t.capabilities.refrigerated && `Frio ${t.capabilities.tempMinC ?? "?"}…${t.capabilities.tempMaxC ?? "?"} °C`, t.capabilities.adrSuitable && "ADR", t.capabilities.tailLift && "Plataforma elevatória", ...(t.capabilities.other ?? [])].filter(Boolean) as string[];
          return (
            <tr key={t.id} data-clickable="true" onClick={() => navigate(paths.trailer(t.id))} data-testid="trailer-row">
              <td className="w-[150px]"><span className="num block font-medium">{t.plate}</span><span className="block text-[12px] text-[var(--text-3)]">{t.unitNumber ?? "—"}{t.isDemo ? <ProvenanceTag kind="DEMO" className="ml-1.5" /> : null}</span></td>
              <td>{trailerTypeLabel(t)}<span className="block text-[12px] text-[var(--text-3)]">{[t.make, t.model].filter(Boolean).join(" ") || "—"}</span></td>
              <td className="w-[140px]"><StatusBadge status={TRAILER_STATE[state]} /></td>
              <td className="num r w-[100px]">{fmtTonnes(t.payloadKg)}</td>
              <td className="num r w-[80px]">{t.palletCapacity ?? "—"}</td>
              <td className="text-[12.5px] text-[var(--text-2)]">{caps.length ? caps.join(" · ") : "—"}</td>
              <td className="max-w-[240px]"><JobRef job={work.current ?? work.next} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function FleetPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tab = pathname.startsWith("/fleet/trailers") ? "trailers" : "trucks";
  const { trucks, trailers } = useFleetData();
  const ed = useEditors();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Frota"
        meta={`${trucks.filter((t) => !t.archivedAt).length} viaturas · ${trailers.filter((t) => !t.archivedAt).length} reboques`}
        actions={
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => (tab === "trucks" ? ed.openTruck() : ed.openTrailer())}>
            {tab === "trucks" ? "Nova viatura" : "Novo reboque"}
          </Button>
        }
      >
        <div className="flex items-center gap-3 pb-2">
          <input className="ui-input w-[260px]" placeholder={tab === "trucks" ? "Procurar matrícula, unidade, modelo…" : "Procurar matrícula, tipo…"} aria-label="Procurar" value={q} onChange={(e) => setQ(e.target.value)} />
          <Checkbox label="Incluir arquivados" checked={archived} onChange={setArchived} />
        </div>
        <Tabs value={tab} onChange={(t) => navigate(t === "trucks" ? paths.trucks() : paths.trailers())} items={[{ value: "trucks", label: "Viaturas" }, { value: "trailers", label: "Reboques" }]} />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface)] scroll-thin">
        {tab === "trucks" ? <TrucksTable q={q} archived={archived} /> : <TrailersTable q={q} archived={archived} />}
      </div>
    </div>
  );
}
