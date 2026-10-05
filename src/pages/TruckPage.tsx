import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useFleetData } from "../context/FleetDataContext";
import { useJobs } from "../context/JobsContext";
import { routingProfileForTruck } from "../domain/fleet/routingProfile";
import { truckDisplayName, truckOperationalState, truckPayloadKg } from "../domain/fleet/trucks";
import { paths } from "../lib/appLinks";
import { fmtInt, fmtKg } from "../ui/format";
import { Button, DataList, EmptyState, IconButton, Notice, PageHeader, ProvenanceTag, SectionTitle, StatusBadge, Tabs } from "../ui/kit";
import { EventHistory } from "../ui/job/JobParts";
import { ResourceHeaderActions } from "../ui/resources/ResourceHeaderActions";
import { JobRef, Known, MeasuredValue, resourceWork, WorkTable } from "../ui/resources/resourceParts";
import { useEditors } from "../ui/shell/editors";
import { TRUCK_STATE } from "../ui/status";

type Tab = "overview" | "specs" | "work" | "records" | "history";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--border)] px-6 py-4">
      <SectionTitle className="mb-3">{title}</SectionTitle>
      {children}
    </section>
  );
}

const BODY: Record<string, string> = { curtainsider: "Cortinas", reefer: "Frigorífico", flatbed: "Plataforma", box: "Caixa", tanker: "Cisterna" };

export function TruckPage() {
  const { truckId = "" } = useParams();
  const { getTruck, getDriver } = useFleetData();
  const { jobs } = useJobs();
  const ed = useEditors();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";
  const t = getTruck(truckId);
  const work = useMemo(() => resourceWork(jobs, (j) => j.assignedTruckId === truckId), [jobs, truckId]);
  if (!t) return <div className="flex-1 bg-[var(--surface)]"><EmptyState title="Viatura não encontrada" action={<Link to={paths.trucks()}><Button>Voltar à frota</Button></Link>} /></div>;

  const state = truckOperationalState(t, jobs);
  const profile = routingProfileForTruck(t);
  const driver = getDriver((work.current ?? work.next)?.assignedDriverId);
  const assumedSet = new Set(profile.assumed.map((a) => a.split(" = ")[0]));
  const spec = (label: string, key: string, v: number | undefined, unit: string) => ({
    label,
    value: v !== undefined ? <span className="num">{v.toLocaleString("pt-PT")} {unit}</span> : assumedSet.has(key) ? <span className="inline-flex items-center gap-1.5 text-[var(--text-2)]">{profile.assumed.find((a) => a.startsWith(key))?.split(" = ")[1]?.split(" (")[0]} {unit} <ProvenanceTag kind="ASSUMED" detail="perfil genérico" /></span> : <Known v={undefined} />,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <IconButton label="Voltar" onClick={() => navigate(paths.trucks())}><ArrowLeft className="h-4 w-4" /></IconButton>
            <span className="num">{t.plate}</span>
            <span className="font-normal text-[var(--text-2)]">{truckDisplayName(t)}</span>
          </span>
        }
        meta={<span className="inline-flex items-center gap-2"><StatusBadge status={TRUCK_STATE[state]} />{t.isDemo ? <ProvenanceTag kind="DEMO" /> : null}</span>}
        actions={<ResourceHeaderActions kind="truck" id={t.id} label={t.plate} archived={!!t.archivedAt} onEdit={() => ed.openTruck(t.id)} listPath={paths.trucks()} />}
      >
        <Tabs value={tab} onChange={(v) => setParams(v === "overview" ? {} : { tab: v }, { replace: true })} items={[{ value: "overview", label: "Resumo" }, { value: "specs", label: "Especificações" }, { value: "work", label: "Trabalho", count: work.upcoming.length + (work.current ? 1 : 0) }, { value: "records", label: "Registos" }, { value: "history", label: "Histórico" }]} />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)] scroll-thin">
        <div className="mx-auto max-w-[1280px]">
          {tab === "overview" && (
            <>
              {t.availability !== "AVAILABLE" && (work.current || work.next) ? <div className="px-6 pt-4"><Notice tone="warn" title="Viatura indisponível com trabalho atribuído">Reatribua ou ajuste a disponibilidade antes da carga.</Notice></div> : null}
              {profile.assumed.length ? <div className="px-6 pt-4"><Notice tone="info" title={`Ficha incompleta: ${profile.assumed.length} valor(es) de rota assumidos do perfil genérico`}>Complete as dimensões e pesos para que as rotas usem os valores reais desta viatura.</Notice></div> : null}
              <div className="grid grid-cols-1 xl:grid-cols-2 xl:divide-x xl:divide-[var(--border)]">
<div>
<Panel title="Identificação e estado">
                <DataList rows={[
                  { label: "Matrícula", value: <span className="num">{t.plate}</span> },
                  { label: "Unidade", value: t.unitNumber ?? "—" },
                  { label: "Viatura", value: `${truckDisplayName(t)}${t.yearManuf ? ` · ${t.yearManuf}` : ""}` },
                  { label: "Tipo", value: `${t.vehicleType === "TRACTOR" ? "Trator" : t.vehicleType === "RIGID" ? "Rígido" : "Furgão"}${t.bodyType ? ` · ${BODY[t.bodyType]}` : ""}` },
                  { label: "Disponibilidade", value: t.availability === "AVAILABLE" ? "Disponível (manual)" : t.availability === "MAINTENANCE" ? "Em manutenção (manual)" : "Fora de serviço (manual)" },
                  { label: "Estado operacional", value: <StatusBadge status={TRUCK_STATE[state]} /> },
                ]} />
              </Panel>
              </div>
<div>
<Panel title="Trabalho">
                <DataList rows={[
                  { label: "Atual", value: <JobRef job={work.current} /> },
                  { label: "Próximo", value: <JobRef job={work.next} /> },
                  { label: "Motorista", value: driver ? <Link className="hover:underline" to={paths.driver(driver.id)}>{driver.name}</Link> : <span className="text-[var(--text-3)]">— (definido por trabalho)</span> },
                ]} />
              </Panel>
              <Panel title="Últimos registos">
                <DataList rows={[
                  { label: "Conta-quilómetros", value: <MeasuredValue m={t.odometerKm} format={(v) => `${fmtInt(v)} km`} /> },
                  { label: "Combustível", value: <MeasuredValue m={t.fuelLevelPct} format={(v) => `${v}%${t.fuelCapacityL ? ` de ${t.fuelCapacityL} L` : ""}`} /> },
                  { label: "Posição", value: t.demoTelemetry ? <span className="inline-flex items-center gap-1.5">Simulada <ProvenanceTag kind="DEMO" /></span> : <ProvenanceTag kind="UNKNOWN" detail="sem telemetria" /> },
                ]} />
              </Panel>
</div>
</div>
            </>
          )}
          {tab === "specs" && (
            <>
              <Panel title="Dimensões">
                <DataList rows={[spec("Comprimento", "comprimento", t.lengthM, "m"), spec("Largura", "largura", t.widthM, "m"), spec("Altura", "altura", t.heightM, "m"), { label: "Altura ao 1.º eixo", value: <Known v={t.firstAxleHeightM} unit="m" /> }]} />
              </Panel>
              <Panel title="Pesos e eixos">
                <DataList rows={[spec("Peso bruto (PBT)", "peso bruto", t.grossVehicleWeightKg, "kg"), spec("Tara", "tara", t.kerbWeightKg, "kg"), { label: "Carga útil", value: truckPayloadKg(t) !== null ? <span className="num">{fmtKg(truckPayloadKg(t))}{t.payloadKg === undefined ? " (PBT − tara)" : ""}</span> : <Known v={undefined} /> }, spec("Eixos", "eixos", t.axleCount, ""), spec("Peso máx. por eixo", "peso por eixo", t.maxAxleWeightKg, "kg"), { label: "Lugares de palete", value: <Known v={t.palletCapacity} /> }]} />
              </Panel>
              <Panel title="Regulamentar e rotas">
                <DataList rows={[
                  { label: "Classe de emissões", value: <Known v={t.emissionClass} /> },
                  { label: "Equipamento ADR", value: t.adrEquipped ? "Sim" : "Não registado" },
                  { label: "Categoria do proprietário", value: <Known v={t.ownerCategory} /> },
                  { label: "Perfil genérico", value: `${profile.fallbackPresetId}${t.routingPresetId ? " (escolhido)" : " (automático)"} — só preenche valores em falta` },
                  { label: "Da ficha", value: profile.fromRecord.join(", ") || "nenhum" },
                ]} />
              </Panel>
            </>
          )}
          {tab === "work" && (
            <>
              <Panel title="Atual e próximos"><WorkTable jobs={[...(work.current ? [work.current] : []), ...work.upcoming]} empty="Sem trabalho atribuído" /></Panel>
              <Panel title="Concluídos e cancelados"><WorkTable jobs={work.past.slice(0, 50)} empty="Sem trabalhos anteriores" /></Panel>
              <p className="px-6 py-3 text-[12px] text-[var(--text-3)]">A ocupação por intervalos de tempo (disponibilidade) será introduzida numa fase seguinte.</p>
            </>
          )}
          {tab === "records" && (
            <Panel title="Registos manuais">
              <DataList rows={[
                { label: "Conta-quilómetros", value: <MeasuredValue m={t.odometerKm} format={(v) => `${fmtInt(v)} km`} /> },
                { label: "Nível de combustível", value: <MeasuredValue m={t.fuelLevelPct} format={(v) => `${v}%`} /> },
                { label: "Capacidade do depósito", value: <Known v={t.fuelCapacityL} unit="L" /> },
                { label: "Notas", value: t.notes ?? "—" },
              ]} />
              <p className="mt-3 text-[12px] text-[var(--text-3)]">Valores introduzidos à mão (não é telemetria). Para atualizar, edite a viatura — a data do registo é guardada.</p>
            </Panel>
          )}
          {tab === "history" && <Panel title="Histórico"><EventHistory entityId={t.id} revisionKey={t.updatedAt} /></Panel>}
        </div>
      </div>
    </div>
  );
}
