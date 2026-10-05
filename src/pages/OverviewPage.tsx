import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFleetData, useOpsAlerts } from "../context/FleetDataContext";
import { useJobs } from "../context/JobsContext";
import type { Job } from "../data/types";
import { driverOperationalState } from "../domain/drivers/drivers";
import { truckOperationalState } from "../domain/fleet/trucks";
import { isoToLocalDate } from "../domain/time";
import { alertHref, paths } from "../lib/appLinks";
import { fmtClock, fmtDayLabel, fmtLongDate, stopWindowText } from "../ui/format";
import { upcomingMoments } from "../ui/overviewModel";
import { Button, EmptyState, SectionTitle, StatusBadge } from "../ui/kit";
import { useEditors } from "../ui/shell/editors";
import { ALERT_GROUP, ALERT_ORDER, JOB_STATUS, toneVars } from "../ui/status";
import { attentionReasons, firstStop, isOpen, jobAnchor, lastStop, type ResolveRefs } from "../ui/work/workModel";
import { complianceCounts, driverComplianceItems } from "../domain/compliance";

function route(j: Job) {
  return `${firstStop(j)?.city ?? "—"} → ${lastStop(j)?.city ?? "—"}`;
}

function Metric({ value, label, to, tone }: { value: number; label: string; to: string; tone?: "warn" | "danger" }) {
  return (
    <Link to={to} className="group flex items-baseline gap-2 rounded-[var(--r-md)] px-2 py-1 -mx-2 transition-colors hover:bg-[var(--surface-2)]">
      <span className="num text-[22px] font-semibold leading-none tracking-[-0.02em]" style={{ color: tone && value ? toneVars(tone).fg : "var(--text)" }}>{value}</span>
      <span className="text-[13px] text-[var(--text-2)] group-hover:text-[var(--text)]">{label}</span>
    </Link>
  );
}

function Block({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--border)] pt-4">
      <SectionTitle action={action} className="mb-2">{title}</SectionTitle>
      {children}
    </section>
  );
}

export function OverviewPage() {
  const { jobs } = useJobs();
  const { trucks, drivers, getTruck, getDriver, getTrailer } = useFleetData();
  const alerts = useOpsAlerts();
  const ed = useEditors();
  const [now] = useState(() => new Date());
  const today = isoToLocalDate(now.getTime());
  const refs = useMemo<ResolveRefs>(() => ({ truck: (id) => !!getTruck(id), driver: (id) => !!getDriver(id), trailer: (id) => !!getTrailer(id) }), [getTruck, getDriver, getTrailer]);

  const m = useMemo(() => {
    const open = jobs.filter(isOpen);
    const touchesToday = (j: Job) => j.stops.some((s) => [s.windowStartAt, s.windowEndAt].some((x) => x && isoToLocalDate(Date.parse(x)) === today)) || isoToLocalDate(Date.parse(j.deliveryDeadline)) === today;
    const attention = open
      .map((j) => ({ j, r: attentionReasons(j, now, refs) }))
      .filter((x) => x.r.length)
      .sort((a, b) => (a.r[0]!.tone === "danger" ? 0 : 1) - (b.r[0]!.tone === "danger" ? 0 : 1) || jobAnchor(a.j) - jobAnchor(b.j));
    const active = open.filter((j) => j.status === "loading" || j.status === "in_transit").sort((a, b) => jobAnchor(a) - jobAnchor(b));
    const moments = upcomingMoments(open, now, 12);
    return {
      today: jobs.filter((j) => j.status !== "cancelled" && touchesToday(j)).length,
      active,
      unassigned: open.filter((j) => j.status === "backlog").length,
      attention,
      moments,
    };
  }, [jobs, now, today, refs]);

  const res = useMemo(() => {
    const comp = complianceCounts(driverComplianceItems(drivers, now));
    return {
      trucks: trucks.filter((x) => !x.archivedAt && truckOperationalState(x, jobs) === "AVAILABLE").length,
      drivers: drivers.filter((x) => !x.archivedAt && driverOperationalState(x, jobs) === "AVAILABLE").length,
      credentials: comp.expired + comp.expiring,
      expired: comp.expired,
    };
  }, [trucks, drivers, jobs, now]);

  const grouped = ALERT_ORDER.map((sev) => ({ sev, items: alerts.filter((a) => a.severity === sev) })).filter((g) => g.items.length);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scroll-thin bg-[var(--surface)]">
      <div className="mx-auto max-w-[1360px] px-8 py-5">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-[18px] font-semibold tracking-[-0.01em]">Visão geral</h1>
          <span className="text-[13px] text-[var(--text-3)]">{fmtLongDate(now)}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 pb-4" aria-label="Hoje">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">Hoje</span>
          <Metric value={m.today} label="trabalhos com paragens hoje" to={paths.work()} />
          <Metric value={m.active.length} label="em curso" to={`${paths.work()}?group=active`} />
          <Metric value={m.unassigned} label="por atribuir" to={`${paths.work()}?group=unassigned`} tone="warn" />
          <Metric value={m.attention.length} label="requerem atenção" to={`${paths.work()}?group=attention`} tone="danger" />
        </div>

        <div className="grid grid-cols-1 gap-x-10 gap-y-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Block title="Requer atenção" action={m.attention.length ? <Link className="text-[12px] text-[var(--accent)] hover:underline" to={`${paths.work()}?group=attention`}>Trabalhos com atenção ({m.attention.length})</Link> : undefined}>
              {grouped.length === 0 ? (
                <p className="py-2 text-[13px] text-[var(--text-3)]">Nada requer atenção. Prazos, rotas, recursos e documentos estão em ordem.</p>
              ) : (
                <div className="space-y-3">
                  {grouped.map(({ sev, items }) => (
                    <div key={sev}>
                      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: toneVars(ALERT_GROUP[sev].tone).fg }}>{ALERT_GROUP[sev].label} · {items.length}</h3>
                      <ul className="divide-y divide-[var(--border)]">
                        {items.slice(0, 5).map((a) => (
                          <li key={a.id}>
                            <Link to={alertHref(a)} className="flex items-baseline gap-3 py-1.5 hover:bg-[var(--surface-2)]" data-testid="overview-alert">
                              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">{a.title}</span>
                              <span className="max-w-[45%] shrink-0 truncate text-[12px] text-[var(--text-3)]">{a.detail}</span>
                            </Link>
                          </li>
                        ))}
                        {items.length > 5 ? <li className="py-1 text-[12px] text-[var(--text-3)]">+ {items.length - 5} — ver no sino de alertas</li> : null}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Block>

            <Block title={`Em curso · ${m.active.length}`}>
              {m.active.length === 0 ? (
                <p className="py-2 text-[13px] text-[var(--text-3)]">Nenhum trabalho em carga ou em viagem.</p>
              ) : (
                <table className="ui-table">
                  <tbody>
                    {m.active.slice(0, 10).map((j) => {
                      const t = getTruck(j.assignedTruckId);
                      const d = getDriver(j.assignedDriverId);
                      const next = [...j.stops].sort((a, b) => a.sequence - b.sequence).find((s) => !s.completed);
                      return (
                        <tr key={j.id}>
                          <td className="num w-[100px] font-medium"><Link to={paths.workJob(j.id)} className="hover:underline">{j.jobNumber}</Link></td>
                          <td className="max-w-[240px]"><span className="block truncate">{route(j)}</span><span className="block truncate text-[12px] text-[var(--text-3)]">{j.client}</span></td>
                          <td className="w-[180px]"><span className="block truncate">{d?.name ?? "—"}</span><span className="num block text-[12px] text-[var(--text-3)]">{t?.plate ?? "—"}</span></td>
                          <td className="w-[200px] text-[12.5px] text-[var(--text-2)]">{next ? <>Próxima: {next.city}<span className="num block text-[var(--text-3)]">{stopWindowText(next, now)}</span></> : "Todas as paragens concluídas"}</td>
                          <td className="r w-[110px]"><StatusBadge status={JOB_STATUS[j.status]} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Block>

            <Block title="Próximas horas" action={<Link className="text-[12px] text-[var(--accent)] hover:underline" to={`${paths.work()}?group=planned`}>Planeados</Link>}>
              {m.moments.length === 0 ? (
                <EmptyState className="py-6" title="Sem recolhas, entregas ou prazos nas próximas 12 horas" action={<Button variant="secondary" onClick={() => ed.openJob()}>Novo trabalho</Button>} />
              ) : (
                <ol className="relative ml-[64px] border-l border-[var(--border)]" data-testid="next-hours">
                  {m.moments.map((x) => (
                    <li key={x.key} className="relative py-1.5 pl-4">
                      <span className="num absolute -left-[64px] top-1.5 w-[52px] text-right text-[12.5px] text-[var(--text-2)]">{fmtClock(x.at)}</span>
                      <span aria-hidden className="absolute -left-[4.5px] top-[11px] h-2 w-2 rounded-full" style={{ background: x.kind === "deadline" ? "var(--warn)" : x.kind === "pickup" ? "var(--accent)" : "var(--text-3)" }} />
                      <Link to={paths.workJob(x.job.id)} className="flex items-baseline gap-2 hover:underline">
                        <span className="text-[12px] text-[var(--text-3)]">{x.kind === "pickup" ? "Recolha" : x.kind === "delivery" ? "Entrega" : "Prazo de entrega"}</span>
                        <span className="text-[13px] font-medium text-[var(--text)]">{x.place}</span>
                        <span className="num text-[12px] text-[var(--text-2)]">{x.job.jobNumber}</span>
                        <span className="truncate text-[12px] text-[var(--text-3)]">{x.job.client}</span>
                        {fmtDayLabel(x.at, now) !== "Hoje" ? <span className="text-[11px] text-[var(--text-3)]">{fmtDayLabel(x.at, now)}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-1.5 text-[11.5px] text-[var(--text-3)]">Horas planeadas (janelas e prazos), não posições reais.</p>
            </Block>
          </div>

          <aside className="space-y-6">
            <Block title="Recursos" action={<Link to={paths.trucks()} className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline">Frota <ArrowRight className="h-3 w-3" /></Link>}>
              <div className="space-y-2">
                <Metric value={res.trucks} label="viaturas disponíveis" to={paths.trucks()} />
                <Metric value={res.drivers} label="motoristas disponíveis" to={paths.drivers()} />
                <Metric value={res.credentials} label="documentos de motorista a caducar ou caducados" to={paths.compliance(res.expired ? "expired" : "expiring")} tone={res.expired ? "danger" : "warn"} />
              </div>
            </Block>
          </aside>
        </div>
      </div>
    </div>
  );
}
