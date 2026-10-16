import { useEffect, useState, useSyncExternalStore } from "react";
import { OperationsService } from "../application/operations";
import {
  IdbOperationalStore,
  type OperationalStore,
} from "../repositories/operationalStore";
import { OperationalPlanningPanel } from "../components/dispatch/OperationalPlanningPanel";
import {
  fleetFixture,
  fixturePosition,
  FIXTURE_NOW,
  planningDriver,
  planningJob,
  singleJobFixture,
  syntheticOption,
} from "../domain/planning/fixtures";
import type {
  ConfirmedOperationalPlan,
  PlanningRequest,
} from "../domain/planning/types";
import { canonicalJson, hashString } from "../regulations/decisionInputs";
import { jobToDraft } from "../domain/jobs/jobDraft";
import type { Job } from "../data/types";
import { Button, Notice, PageHeader } from "../ui/kit";

const CASES = [
  "Sem recursos: Amadora–Porto",
  "Motorista alternativo evita descanso",
  "Descanso útil com próximo trabalho",
  "Frota: 20 pedidos",
] as const;
type Case = (typeof CASES)[number];
type Receipt = { record: ConfirmedOperationalPlan; lockedJobs: Job[] };
function scenario(name: Case): PlanningRequest {
  const r = name === "Frota: 20 pedidos" ? fleetFixture() : singleJobFixture();
  if (
    name === "Motorista alternativo evita descanso" ||
    name === "Descanso útil com próximo trabalho"
  ) {
    r.initialState!.drivers![r.drivers[0].id].driving = {
      drivenTodaySec: 8.5 * 3600,
      continuousSec: 0,
      weekSec: 8.5 * 3600,
      known: true,
    };
    const driver = planningDriver("Motorista teste com horas", r.nowMs);
    r.drivers.push(driver);
    r.initialState!.drivers![driver.id] = {
      availableAt: r.nowMs,
      position: fixturePosition(
        r.jobs[0].stops.map((s) => [s.lat, s.lng] as [number, number])[0],
      ),
      driving: {
        drivenTodaySec: 0,
        continuousSec: 0,
        weekSec: name === "Descanso útil com próximo trabalho" ? 55 * 3600 : 0,
        known: true,
      },
    };
  }
  if (name === "Descanso útil com próximo trabalho") {
    r.jobs = [
      planningJob("Primeiro trabalho teste", [38.753, -9.23], [39.25, -9.23]),
    ];
    const a = r.jobs[0],
      last = a.stops.at(-1)!;
    r.jobs.push(
      planningJob(
        "Próximo trabalho teste",
        [last.lat, last.lng],
        [39.65, -9.23],
      ),
    );
    r.constraints = [{ jobId: r.jobs[1].id, afterJobId: a.id }];
    r.route = async (m) => [
      syntheticOption(m, { durationSec: 3600, legDurationSec: [3600] }),
    ];
  }
  return r;
}
function Acceptance({
  store,
  service,
}: {
  store: OperationalStore;
  service: OperationsService;
}) {
  const state = useSyncExternalStore(service.subscribe, service.getState),
    [name, setName] = useState<Case>("Sem recursos: Amadora–Porto"),
    [generation, setGeneration] = useState(0),
    [scope, setScope] = useState<"all" | "first">("all"),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void store
      .getMeta<{ name: Case; receipt: Receipt | null }>("acceptance:state")
      .then((v) => {
        if (v) {
          setName(v.name);
          setReceipt(v.receipt);
        }
      });
  }, [store]);
  const config = scenario(name),
    snapshot = receipt?.lockedJobs ?? [],
    current = state.jobs.filter((j) => snapshot.some((old) => old.id === j.id));
  const immutable =
    canonicalJson(snapshot) ===
    canonicalJson(current.sort((a, b) => a.id.localeCompare(b.id)));
  async function loadFixture(next: Case) {
    setError(null);
    setMessage(null);
    try {
      const r = scenario(next);
      await store.commit({
        remove: {
          jobs: state.jobs.map((j) => j.id),
          trucks: state.trucks.map((t) => t.id),
          drivers: state.drivers.map((d) => d.id),
          trailers: state.trailers.map((t) => t.id),
        },
        put: {
          jobs: r.jobs,
          trucks: r.trucks,
          drivers: r.drivers,
          trailers: r.trailers,
        },
        meta: { "acceptance:state": { name: next, receipt: null } },
      });
      await service.load();
      setName(next);
      setReceipt(null);
      setScope("all");
      setGeneration((n) => n + 1);
    } catch (e) {
      setError(String(e));
    }
  }
  async function mutate(kind: "geography" | "window") {
    const job = state.jobs.find(
      (j) => j.id === "TESTE-J1-2" && j.status === "backlog",
    );
    if (!job) {
      setError(
        "Carregue a frota de 20 pedidos; J1-2 tem de estar por atribuir.",
      );
      return;
    }
    const draft = jobToDraft(job);
    if (kind === "geography")
      draft.stops = [
        { ...draft.stops[0], lat: 41.75, lng: -8.1 },
        { ...draft.stops[1], lat: 41.82, lng: -8.07 },
      ];
    else {
      draft.stops[0] = {
        ...draft.stops[0],
        windowStartAt: new Date(FIXTURE_NOW + 600000).toISOString(),
        windowEndAt: new Date(FIXTURE_NOW + 25 * 60000).toISOString(),
      };
      draft.stops[1] = {
        ...draft.stops[1],
        windowStartAt: new Date(FIXTURE_NOW + 600000).toISOString(),
      };
    }
    const r = await service.editJob(job.id, draft);
    if (!r.ok) setError(r.errors.join("; "));
    else {
      setMessage(
        kind === "geography"
          ? "J1-2 deslocado: volte a planear e compare a sequência."
          : "J1-2 agora tem recolha até às 08:25 de Lisboa: volte a planear.",
      );
      setGeneration((n) => n + 1);
    }
  }
  async function saveReceipt(record: ConfirmedOperationalPlan) {
    const value = {
      record,
      lockedJobs: service
        .getState()
        .jobs.filter((j) =>
          record.selected.executions.some((e) => e.jobId === j.id),
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
    await store.commit({
      meta: { "acceptance:state": { name, receipt: value } },
    });
    setReceipt(value);
    setScope("all");
  }
  return (
    <div className="flex-1 overflow-auto bg-[var(--surface)]">
      <PageHeader
        title="Aceitação do planeamento operacional"
        meta="DEV · dados sintéticos · base IndexedDB isolada · zero pedidos ao fornecedor"
      />
      <div className="space-y-3 p-5 text-[13px]">
        <p>
          Estes cenários usam o motor real e a informação rodoviária incluída,
          com rotas sintéticas explicitamente identificadas. Não alteram os
          trabalhos ou a frota do utilizador. A confirmação fica guardada em
          «fleetos-planning-acceptance».
        </p>
        <div className="flex flex-wrap gap-2">
          {CASES.map((c) => (
            <Button key={c} onClick={() => void loadFixture(c)}>
              Carregar · {c}
            </Button>
          ))}
        </div>
        <p data-testid="acceptance-inventory">
          {name} · {state.jobs.length} trabalhos · {state.trucks.length}{" "}
          viaturas · {state.drivers.length} motoristas · {state.trailers.length}{" "}
          reboques
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void mutate("geography")}>
            Alterar geografia J1-2
          </Button>
          <Button variant="ghost" onClick={() => void mutate("window")}>
            Alterar janela J1-2
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setScope(scope === "first" ? "all" : "first");
              setGeneration((n) => n + 1);
            }}
          >
            {scope === "first"
              ? "Planear toda a frota"
              : "Planear só primeiro pedido"}
          </Button>
        </div>
        {error ? (
          <Notice tone="danger" title="Erro de aceitação">
            {error}
          </Notice>
        ) : null}
        {message ? <p>{message}</p> : null}
        {receipt ? (
          <Notice
            tone={immutable ? "ok" : "danger"}
            title={
              immutable ? "Histórico confirmado intacto" : "Histórico diferente"
            }
          >
            <p data-testid="immutable-history">
              {snapshot.length} trabalhos bloqueados · hash{" "}
              {hashString(canonicalJson(snapshot))} · hash atual{" "}
              {hashString(canonicalJson(current))} · decisão {receipt.record.id}
            </p>
            <details>
              <summary>Recomendação vs confirmação guardadas</summary>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-[11px]">
                {JSON.stringify(
                  {
                    source: receipt.record.source,
                    recommended: receipt.record.recommended.id,
                    selected: receipt.record.selected.id,
                    confirmedAt: receipt.record.confirmedAt,
                    jobs: snapshot.map((j) => ({
                      id: j.id,
                      status: j.status,
                      revision: j.revision,
                      planId: j.operationalPlan?.planId,
                    })),
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </Notice>
        ) : null}
      </div>
      {state.jobs.length ? (
        <OperationalPlanningPanel
          key={`${name}-${generation}`}
          service={service}
          defaultDepartureMs={FIXTURE_NOW + 600000}
          overrideJobId={scope === "first" ? config.jobs[0].id : undefined}
          makeRequest={(constraints, departureMs) => ({
            ...config,
            ...service.getState(),
            scopeJobIds: scope === "first" ? [config.jobs[0].id] : undefined,
            earliestStartMs: departureMs,
            constraints: [...(config.constraints ?? []), ...constraints],
          })}
          onConfirmed={(record) => void saveReceipt(record)}
        />
      ) : (
        <p className="p-5">Carregue um cenário para começar.</p>
      )}
    </div>
  );
}
export function OperationalPlanningAcceptancePage() {
  const [runtime, setRuntime] = useState<{
      store: OperationalStore;
      service: OperationsService;
    } | null>(null),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void IdbOperationalStore.open("fleetos-planning-acceptance")
      .then(async (store) => {
        const service = new OperationsService(
          store,
          () => new Date(FIXTURE_NOW),
        );
        await service.load();
        if (alive) setRuntime({ store, service });
        else store.close();
      })
      .catch((e) => setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);
  return error ? (
    <p>{error}</p>
  ) : runtime ? (
    <Acceptance {...runtime} />
  ) : (
    <p>A abrir base de aceitação…</p>
  );
}
