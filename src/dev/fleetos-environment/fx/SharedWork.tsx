import type { ReactNode } from "react";
import type { GuidedAction, GuidedState } from "../guidedWorkspace";
import {
  sharedWork,
  sharedWorkQuestions,
  type WorkDomain,
  type SharedWork,
} from "../sharedComposition";
import {
  sharedScope,
  sharedWorkRows,
  sharedWorkSituation,
  type SharedWorkRow,
} from "../sharedReadModel";
import { NOW, STATUS_LABEL, SPELL_LIMIT, hm, dur } from "../world";
import { minOf, providerFor } from "../engine/synthetic";
import type { EntityKind, OperationalValue } from "../engine/contracts";
import { VehicleDrawing } from "./VehicleDrawing";
import { Id, Status, Tri } from "./honesty";
import { LENS_LABEL } from "./model";
import { ObjectSlot } from "./PersistentObjects";

type Props = { state: GuidedState; act: (action: GuidedAction) => void };
type WorkingProps = {
  row: SharedWorkRow;
  domains: WorkDomain[];
  act: Props["act"];
};
const OBJECT_INSPECTION: Record<Exclude<EntityKind, "job">, GuidedAction> = {
  driver: { type: "facet", domain: "Drivers", facet: "legality" },
  truck: { type: "facet", domain: "Trucks", facet: "load" },
  trailer: { type: "facet", domain: "Trucks", facet: "assignment" },
  document: { type: "facet", domain: "Documents", facet: "dossier" },
  restriction: { type: "facet", domain: "Restrictions", facet: "logic" },
  stop: { type: "facet", domain: "Fuel", facet: "management" },
};
const INSTRUMENT: Partial<
  Record<WorkDomain, { label: string; action: GuidedAction }>
> = {
  Drivers: { label: "Tempo e qualificações", action: OBJECT_INSPECTION.driver },
  Trucks: { label: "Conjunto e carga", action: OBJECT_INSPECTION.truck },
  Fuel: { label: "Percurso e paragens", action: OBJECT_INSPECTION.stop },
  Restrictions: {
    label: "Condições de passagem",
    action: OBJECT_INSPECTION.restriction,
  },
  Documents: { label: "Guia e registos", action: OBJECT_INSPECTION.document },
};
function workInstrument(work: SharedWork, domain: WorkDomain) {
  const facet = (label: string, domain: WorkDomain, facet: string) => ({
    label,
    action: { type: "facet", domain, facet } as GuidedAction,
  });
  if (work.variant === "credentials") {
    if (domain === "Documents")
      return facet("Registos do motorista", "Drivers", "qualifications");
    if (domain === "Drivers")
      return facet("Atribuição do motorista", "Drivers", "assignment");
  }
  if (work.variant === "range") {
    if (domain === "Trucks")
      return facet("Leitura do depósito", "Trucks", "fuel");
    if (domain === "Fuel")
      return facet("Paragens de abastecimento", "Fuel", "stops");
  }
  if (work.variant === "clearance" && domain === "Trucks")
    return facet("Medições do conjunto", "Trucks", "restriction");
  if (work.variant === "route-choice" && domain === "Fuel")
    return facet("Comparação dos percursos", "Fuel", "comparison");
  if (work.variant === "schedule") {
    if (domain === "Drivers")
      return facet("Turno e horas", "Drivers", "legality");
    if (domain === "Fuel") return facet("Percurso e etapas", "Fuel", "journey");
  }
  return INSTRUMENT[domain];
}
function Clock({ value }: { value: OperationalValue<number> | undefined }) {
  if (!value || value.status === "UNKNOWN")
    return (
      <span className="sw-unknown" title={value?.reason}>
        hora por calcular
      </span>
    );
  return (
    <span
      title={
        value.status === "ASSUMED"
          ? value.reason
          : "Hora simulada no cenário de demonstração"
      }
    >
      {hm(minOf(value.value))}
      {value.status === "ASSUMED" ? " · assumida" : " · cenário"}
    </span>
  );
}
function ObjectLink({
  row,
  kind,
  id,
  children,
  act,
}: {
  row: SharedWorkRow;
  kind: EntityKind;
  id: string;
  children: ReactNode;
  act: Props["act"];
}) {
  const self =
    row.anchor.kind === kind && "id" in row.anchor && row.anchor.id === id;
  if (self && kind === "job")
    return <span className="sw-static">{children}</span>;
  return (
    <button
      className="sw-link"
      data-ix="follow"
      data-map-entity={kind}
      data-entity-id={id}
      onClick={() =>
        act(
          self && kind !== "job"
            ? OBJECT_INSPECTION[kind]
            : kind === "job"
              ? { type: "follow", object: { kind, id } }
              : { type: "entity", kind, id, job: row.world.jobId },
        )
      }
    >
      {children}
    </button>
  );
}
function WorkIdentity({ row, act }: Pick<WorkingProps, "row" | "act">) {
  if (row.anchor.kind === "job") return null;
  const { job } = row.world;
  return (
    <div className="sw-work-identity">
      <ObjectLink row={row} kind="job" id={job.id} act={act}>
        <Id>{job.id}</Id>{" "}
        <b>
          {job.stops[0].city} → {job.stops.at(-1)!.city}
        </b>
      </ObjectLink>
      <small>
        {job.client} · {STATUS_LABEL[job.status]}
      </small>
    </div>
  );
}
function Crew({ row, act }: Pick<WorkingProps, "row" | "act">) {
  return <ObjectSlot id={`driver:${row.world.driver.id}:job:${row.world.jobId}`}>
    <CrewBody row={row} act={act} />
  </ObjectSlot>;
}
function CrewBody({ row, act }: Pick<WorkingProps, "row" | "act">) {
  const { driver, job } = row.world;
  const expired = driver.qualifications.filter(
    (qualification) =>
      ["EXPIRED", "MISSING", "NOT_HELD"].includes(qualification.state) &&
      (qualification.kind !== "adr" || job.cargo.some((cargo) => cargo.adr)),
  );
  return (
    <div
      className="sw-crew"
      data-contribution="Drivers"
      data-object={`driver:${driver.id}`}
    >
      <ObjectLink row={row} kind="driver" id={driver.id} act={act}>
        <span className="sw-person">
          {driver.name
            .split(" ")
            .map((word) => word[0])
            .slice(0, 2)
            .join("")}
        </span>
        <b>{driver.name}</b>
      </ObjectLink>
      <small>
        {expired.length
          ? expired
              .map(
                (q) =>
                  `${q.label} ${q.state === "EXPIRED" ? "caducado" : "em falta"}`,
              )
              .join(" · ")
          : "Registos exigidos para esta carga válidos"}
      </small>
      <span
        className={row.timeline.status === "STALE" ? "sw-unknown" : "sw-duty"}
      >
        {row.timeline.status === "STALE"
          ? "Base de horas por confirmar"
          : "Próximo limite no cenário: "}
        {row.timeline.status !== "STALE" && (
          <Clock value={row.timeline.timeline?.spellLimit} />
        )}
      </span>
    </div>
  );
}
function Machine({
  row,
  act,
  drawing = false,
}: Pick<WorkingProps, "row" | "act"> & { drawing?: boolean }) {
  return <ObjectSlot id={`truck:${row.world.truck.id}:job:${row.world.jobId}`}>
    <MachineBody row={row} act={act} drawing={drawing} />
  </ObjectSlot>;
}
function MachineBody({ row, act, drawing = false }: Pick<WorkingProps, "row" | "act"> & { drawing?: boolean }) {
  const w = row.world;
  const pallets = w.job.cargo.reduce((sum, cargo) => sum + cargo.pallets, 0);
  return (
    <div
      className="sw-machine"
      data-contribution="Trucks"
      data-object={`truck:${w.truck.plate}`}
    >
      <ObjectLink row={row} kind="truck" id={w.truck.id} act={act}>
        <b>{w.truck.plate}</b> · {w.truck.make} {w.truck.model}
      </ObjectLink>
      {drawing && (
        <VehicleDrawing
          aspect="load"
          groups={w.job.cargo.map((cargo) => ({
            city:
              w.job.stops.find(
                (stop) =>
                  stop.id === cargo.dropAt || stop.city === cargo.dropAt,
              )?.city ?? cargo.dropAt,
            pallets: cargo.pallets,
            kg: cargo.weightKg,
            order: Math.max(
              0,
              w.job.stops.findIndex(
                (stop) =>
                  stop.id === cargo.dropAt || stop.city === cargo.dropAt,
              ),
            ),
            adr: cargo.adr,
            tempC: cargo.tempC,
          }))}
          capacity={w.trailer?.pallets ?? 0}
          grossKg={w.cargoKg + w.truck.tareKg + (w.trailer?.tareKg ?? 0)}
          firstAxleKnown={w.truck.firstAxleHeightM != null}
          firstAxleM={w.truck.firstAxleHeightM}
          fuelReadPct={w.truck.fuel.value}
          fuelNowPct={w.fuelNowPct}
          rules={{}}
          annotations={false}
          trailerMissing={w.trailerMissing}
        />
      )}
      <small>
        {w.truck.availability !== "AVAILABLE" ? "Viatura indisponível · " : ""}
        {w.trailer
          ? `${w.trailer.plate} · ${pallets}/${w.trailer.pallets} paletes`
          : `${w.job.trailerId} · reboque em falta`}
      </small>
      {w.trailer && (
        <ObjectLink row={row} kind="trailer" id={w.trailer.id} act={act}>
          Ver conjunto e capacidade →
        </ObjectLink>
      )}
    </div>
  );
}
function Passage({ row, act }: Pick<WorkingProps, "row" | "act">) {
  return (
    <div className="sw-passages" data-contribution="Restrictions">
      {row.passages.length ? (
        row.passages.map(({ restriction, impact }) => (
          <div key={restriction.id} data-outcome={impact.status}>
            <ObjectLink
              row={row}
              kind="restriction"
              id={restriction.id}
              act={act}
            >
              <b>{restriction.title.split(" — ")[0]}</b>
            </ObjectLink>
            <small>
              <Clock value={impact.passage} /> ·{" "}
              {impact.status === "PASS"
                ? "regra não aplicável"
                : impact.status === "FAIL"
                  ? "passagem condicionada"
                  : "aplicabilidade por confirmar"}
            </small>
            {impact.missingFacts.length > 0 && (
              <small>
                {impact.missingFacts
                  .map((fact) =>
                    fact === "vehicle.firstAxleHeightM"
                      ? "Altura ao 1.º eixo em falta"
                      : fact === "authorization.pt-vci-habilitacao"
                        ? "Habilitação VCI por confirmar"
                        : "Facto de passagem por confirmar",
                  )
                  .join(" · ")}
              </small>
            )}
          </div>
        ))
      ) : (
        <small>Sem condições registadas neste percurso</small>
      )}
    </div>
  );
}
function Paper({ row, act }: Pick<WorkingProps, "row" | "act">) {
  const cmr = row.world.ledger.find(
    (document) => document.type === "CMR" && document.state !== "VOID",
  );
  return (
    <div className="sw-paper" data-contribution="Documents">
      {cmr ? (
        <>
          <ObjectLink row={row} kind="document" id={cmr.id} act={act}>
            <span className="sw-paper-mark">CMR</span>
            <b>{cmr.stateText}</b>
          </ObjectLink>
          <small>{cmr.number ?? cmr.required}</small>
          {cmr.diverges ? (
            <small className="sw-caution">
              {cmr.diverges} diferenças entre a guia emitida e o trabalho atual
              · rever
            </small>
          ) : (
            cmr.reason && <small>{cmr.reason}</small>
          )}
          {cmr.state === "ISSUED" && <small>Snapshot emitido preservado</small>}
        </>
      ) : (
        <small>Sem registo documental</small>
      )}
    </div>
  );
}
function Journey({ row, domains, act }: WorkingProps) {
  const w = row.world;
  return (
    <div className="sw-journey">
      <WorkIdentity row={row} act={act} />
      <ol
        className="sw-stop-axis"
        data-contribution={domains.includes("Fuel") ? "Fuel" : "Jobs"}
      >
        {w.job.stops.map((stop) => (
          <li
            key={stop.id}
            data-done={!!stop.completedAt}
            data-next={stop.id === row.next?.id}
          >
            <span className="sw-stop-dot" />
            <b>{stop.city}</b>
            <small>
              {stop.completedAt ? (
                `Concluída ${stop.completedAt}`
              ) : (
                <Clock
                  value={
                    row.timeline.timeline?.stops.find(
                      (reading) => reading.stopId === stop.id,
                    )?.arrival
                  }
                />
              )}
            </small>
            <small>Janela {stop.window.join("–")}</small>
          </li>
        ))}
      </ol>
      {domains.includes("Fuel") && (
        <div className="sw-next" data-contribution="Fuel">
          <b>Próxima decisão de percurso</b>
          {w.planned ? (
            <ObjectLink row={row} kind="stop" id={w.planned.id} act={act}>
              {w.planned.name} · pausa e abastecimento →
            </ObjectLink>
          ) : row.anchor.kind === "job" ? (
            <button
              className="sw-link"
              data-ix="inspect"
              onClick={() =>
                act({ type: "facet", domain: "Fuel", facet: "journey" })
              }
            >
              Rever a etapa para {row.next?.city ?? "o destino"} →
            </button>
          ) : (
            <ObjectLink row={row} kind="job" id={w.jobId} act={act}>
              {row.next
                ? `Rever a etapa para ${row.next.city}`
                : "Rever percurso concluído"}{" "}
              →
            </ObjectLink>
          )}
          <small>
            {w.positionKnown
              ? `Autonomia estimada no cenário: ${Math.round(w.rangeKm)} km · consumo assumido`
              : "Autonomia atual desconhecida · posição sem registo"}
          </small>
        </div>
      )}
      <div className="sw-journey-responsibilities">
        {domains.includes("Drivers") && <Crew row={row} act={act} />}
        {domains.includes("Trucks") && <Machine row={row} act={act} />}
        {domains.includes("Restrictions") && <Passage row={row} act={act} />}
        {domains.includes("Documents") && <Paper row={row} act={act} />}
      </div>
      {domains.includes("Jobs") && (
        <small data-contribution="Jobs" className="sw-demand">
          {w.pallets} paletes · {w.cargoKg.toLocaleString("pt-PT")} kg ·{" "}
          {w.job.planNote ?? "Carga e janelas vinculadas às etapas"}
        </small>
      )}
    </div>
  );
}
function Matching({ row, domains, act }: WorkingProps) {
  const w = row.world;
  if (
    domains.includes("Trucks") &&
    (w.trailerMissing || w.truck.availability !== "AVAILABLE")
  )
    return (
      <>
        <EquipmentRecovery row={row} domains={domains} act={act} />
        <UnitRequirements row={row} domains={domains} act={act} />
      </>
    );
  const expired = w.driver.qualifications.find(
    (q) =>
      ["EXPIRED", "MISSING", "NOT_HELD"].includes(q.state) &&
      (q.kind !== "adr" || w.job.cargo.some((c) => c.adr)),
  );
  return (
    <div className="sw-matching">
      <WorkIdentity row={row} act={act} />
      {domains.includes("Drivers") && expired && (
        <section className="sw-qualification-issue" data-contribution="Drivers">
          <small>Habilitação para este conjunto</small>
          <h2>
            {expired.label}{" "}
            {expired.state === "EXPIRED" ? "caducado" : "em falta"} ·{" "}
            {w.driver.name}
          </h2>
          <p>
            Validade registada: {expired.until ?? "em falta"}. Rever a
            habilitação antes de decidir quem executa este transporte.
          </p>
          <button
            className="sw-link"
            data-ix="edit"
            onClick={() =>
              act(
                scopedInspect(row, {
                  type: "edit",
                  kind: "driver",
                  target: w.jobId,
                }),
              )
            }
          >
            Comparar outro motorista para este trabalho →
          </button>
        </section>
      )}
      <div className="sw-working-unit">
        {domains.includes("Drivers") && <Crew row={row} act={act} />}
        {domains.includes("Trucks") && <Machine row={row} act={act} drawing />}
      </div>
      {domains.includes("Jobs") && (
        <div className="sw-demand" data-contribution="Jobs">
          <b>Trabalho a executar</b>
          <span>
            {w.pallets} paletes · {w.cargoKg.toLocaleString("pt-PT")} kg ·{" "}
            {row.next?.city ?? "Etapas concluídas"}
          </span>
          <small>Próxima janela: {row.next?.window.join("–") ?? "—"}</small>
        </div>
      )}
      <p className="sw-unit-result">
        {row.assignment.status === "CURRENT"
          ? "Atribuição registada · rever aptidão para a próxima etapa"
          : "Conjunto exige revisão antes de avançar"}
      </p>
      <UnitRequirements row={row} domains={domains} act={act} />
      <button
        className="sw-link"
        data-ix="inspect"
        onClick={() =>
          act(
            scopedInspect(row, {
              type: "facet",
              domain: domains.includes("Trucks") ? "Trucks" : "Drivers",
              facet: "assignment",
            }),
          )
        }
      >
        Rever a atribuição deste trabalho →
      </button>
    </div>
  );
}
function UnitRequirements({ row, domains, act }: WorkingProps) {
  return (
    <div
      className="sw-unit-requirements"
      aria-label="Exigências para este conjunto"
    >
      {domains.includes("Fuel") && (
        <section data-contribution="Fuel">
          <h3>O conjunto na próxima etapa</h3>
          <small>
            {row.next?.city ?? "Etapas concluídas"} · janela{" "}
            {row.next?.window.join("–")}
          </small>
          {row.world.planned ? (
            <ObjectLink
              row={row}
              kind="stop"
              id={row.world.planned.id}
              act={act}
            >
              {row.world.planned.name} · pausa e abastecimento →
            </ObjectLink>
          ) : (
            <button
              className="sw-link"
              data-ix="inspect"
              onClick={() =>
                act(
                  scopedInspect(row, {
                    type: "facet",
                    domain: "Fuel",
                    facet: "management",
                  }),
                )
              }
            >
              Rever percurso e libertação do conjunto →
            </button>
          )}
        </section>
      )}
      {domains.includes("Restrictions") && (
        <section>
          <h3>Exigências sobre este conjunto</h3>
          <Passage row={row} act={act} />
        </section>
      )}
      {domains.includes("Documents") && (
        <section>
          <h3>Identidades fixadas na guia</h3>
          <Paper row={row} act={act} />
          <small>
            Uma mudança de motorista ou reboque deve ser confrontada com o
            registo emitido.
          </small>
        </section>
      )}
    </div>
  );
}
function Handover({ row, domains, act }: WorkingProps) {
  const w = row.world;
  return (
    <div className="sw-handover">
      <WorkIdentity row={row} act={act} />
      <ol className="sw-release-chain">
        {domains.includes("Jobs") && (
          <li data-contribution="Jobs">
            <span className="sw-chain-number">1</span>
            <div>
              <b>
                {row.next
                  ? `Avançar para ${row.next.city}`
                  : "Etapas concluídas"}
              </b>
              <small>
                {row.next?.window.join("–")} · {w.pallets} paletes ·{" "}
                {w.job.planNote ?? "Verificar carga e janela"}
              </small>
            </div>
          </li>
        )}
        {(domains.includes("Drivers") || domains.includes("Trucks")) && (
          <li>
            <span className="sw-chain-number">↔</span>
            <div className="sw-working-unit">
              {domains.includes("Drivers") && <Crew row={row} act={act} />}
              {domains.includes("Trucks") && <Machine row={row} act={act} />}
            </div>
          </li>
        )}
        {domains.includes("Restrictions") && (
          <li>
            <span className="sw-chain-number">!</span>
            <Passage row={row} act={act} />
          </li>
        )}
        {domains.includes("Fuel") && (
          <li data-contribution="Fuel">
            <span className="sw-chain-number">↗</span>
            <div>
              <b>Percurso da próxima passagem</b>
              <small>
                {row.next?.city ?? "Etapas concluídas"} · janela{" "}
                {row.next?.window.join("–")}
              </small>
              <button
                className="sw-link"
                data-ix="inspect"
                onClick={() =>
                  act(
                    scopedInspect(row, {
                      type: "facet",
                      domain: "Fuel",
                      facet: "management",
                    }),
                  )
                }
              >
                Rever as etapas e o que falta validar →
              </button>
            </div>
          </li>
        )}
        <li>
          <span className="sw-chain-number">CMR</span>
          <Paper row={row} act={act} />
        </li>
        <li className="sw-release-end">
          <span className="sw-chain-number">→</span>
          <div>
            <b>Passagem com evidência</b>
            <small>
              {["in_transit", "delivered", "invoiced"].includes(w.job.status)
                ? "Verificar registo emitido e alterações posteriores"
                : "Rever pré-requisitos antes da partida"}
            </small>
            <button
              className="sw-link"
              data-ix="inspect"
              onClick={() =>
                act(
                  scopedInspect(row, {
                    type: "facet",
                    domain: "Documents",
                    facet: "dossier",
                  }),
                )
              }
            >
              Rever os registos desta passagem →
            </button>
          </div>
        </li>
      </ol>
    </div>
  );
}

function scopedInspect(row: SharedWorkRow, action: GuidedAction): GuidedAction {
  return row.anchor.kind === "jobs"
    ? { type: "job-action", id: row.world.jobId, action }
    : action;
}
function Schedule({ row, domains, act }: WorkingProps) {
  const w = row.world;
  return (
    <div
      className="sw-schedule-task"
      data-window-changed={w.job.plan === "REPLAN_REQUIRED"}
    >
      <WorkIdentity row={row} act={act} />
      <div className="sw-turn-budget" data-contribution="Drivers">
        <ObjectLink row={row} kind="driver" id={w.driver.id} act={act}>
          <b>{w.driver.name}</b>
        </ObjectLink>
        <span>
          <strong>
            {w.driver.baseline.stale
              ? "?"
              : dur(Math.max(0, SPELL_LIMIT - w.driver.spellMin))}
          </strong>{" "}
          até ao limite no cenário
        </span>
        <small>
          {w.driver.baseline.stale
            ? "Base de horas por atualizar"
            : `Base manual · ${w.driver.baseline.recordedLabel}`}
        </small>
      </div>
      {w.job.plan === "REPLAN_REQUIRED" && (
        <section className="sw-changed-window">
          <small>Janela que mudou</small>
          <h2>
            {w.job.stops.at(-1)!.city} · {w.job.stops.at(-1)!.window.join("–")}
          </h2>
          <p>
            {w.job.planNote ??
              "O plano precisa de ser revisto com a nova janela."}
          </p>
          <p>
            O turno abaixo continua a ser o cenário registado. A nova chegada
            precisa de cálculo e validação.
          </p>
          {domains.includes("Fuel") && (
            <button
              className="sw-link"
              data-ix="inspect"
              onClick={() =>
                act(
                  scopedInspect(row, {
                    type: "facet",
                    domain: "Fuel",
                    facet: "comparison",
                  }),
                )
              }
            >
              Rever o percurso para esta janela →
            </button>
          )}
        </section>
      )}
      <ol className="sw-calendar" aria-label="Atividades restantes do turno">
        {w.driver.duty
          .filter((d) => d.to > NOW.min)
          .map((d, i) => (
            <li key={i} data-kind={d.kind}>
              <time>
                {hm(Math.max(NOW.min, d.from))}–{hm(d.to)}
              </time>
              <b>
                {d.label ??
                  {
                    drive: "Conduzir",
                    work: "Trabalho",
                    break: "Pausa",
                    rest: "Descanso",
                  }[d.kind]}
              </b>
              <small>
                {d.planned
                  ? "Planeado no cenário"
                  : "Atividade registada no cenário"}
              </small>
            </li>
          ))}
      </ol>
      <div className="sw-schedule-links">
        {domains.includes("Jobs") && (
          <div data-contribution="Jobs">
            <b>Próxima janela · {row.next?.city ?? "Etapas concluídas"}</b>
            <small>
              {row.next?.window.join("–")} · {row.next?.cargo}
            </small>
          </div>
        )}
        {domains.includes("Fuel") && (
          <div data-contribution="Fuel">
            <b>Pausa e percurso</b>
            {w.planned ? (
              <ObjectLink row={row} kind="stop" id={w.planned.id} act={act}>
                {w.planned.name} · {w.planned.arrival} →
              </ObjectLink>
            ) : (
              <small>Sem paragem intermédia registada</small>
            )}
          </div>
        )}
        {domains.includes("Restrictions") && <Passage row={row} act={act} />}
      </div>
      <button
        className="sw-link"
        data-ix="inspect"
        onClick={() =>
          act(
            scopedInspect(row, {
              type: "facet",
              domain: "Drivers",
              facet: "legality",
            }),
          )
        }
      >
        Rever os tempos e limites →
      </button>
    </div>
  );
}
function Credentials({ row, domains, act }: WorkingProps) {
  const w = row.world;
  const missing = w.driver.qualifications.filter(
    (q) =>
      ["EXPIRED", "MISSING", "NOT_HELD"].includes(q.state) &&
      (q.kind !== "adr" || w.job.cargo.some((c) => c.adr)),
  );
  return (
    <div className="sw-credentials-task">
      <WorkIdentity row={row} act={act} />
      <h2 data-contribution="Drivers">
        <ObjectLink row={row} kind="driver" id={w.driver.id} act={act}>
          {w.driver.name}
        </ObjectLink>
      </h2>
      {!!missing.length && (
        <section
          className="sw-qualification-issue"
          data-contribution="Documents"
        >
          <small>O que precisa de ser resolvido</small>
          {missing.map((q) => (
            <div key={q.kind}>
              <h3>
                {q.label} ·{" "}
                {q.state === "EXPIRED"
                  ? "caducada"
                  : "sem habilitação registada"}
              </h3>
              <p>
                {q.until
                  ? `Última validade registada: ${q.until}`
                  : "Não existe uma validade registada."}
              </p>
            </div>
          ))}
          <button
            className="sw-link"
            data-ix="inspect"
            onClick={() =>
              act(
                scopedInspect(row, {
                  type: "facet",
                  domain: "Drivers",
                  facet: "qualifications",
                }),
              )
            }
          >
            Rever a habilitação necessária →
          </button>
        </section>
      )}
      {domains.includes("Jobs") && (
        <p className="sw-cargo-requirement" data-contribution="Jobs">
          {w.job.cargo.some((c) => c.adr)
            ? "Carga com ADR · verificar habilitação específica"
            : "Esta carga não exige ADR"}{" "}
          · {w.pallets} paletes
        </p>
      )}
      <div className="sw-qualification-register" data-contribution="Documents">
        <table>
          <thead>
            <tr>
              <th>Habilitação</th>
              <th>Exigida para a carga</th>
              <th>Registo</th>
              <th>Validade</th>
            </tr>
          </thead>
          <tbody>
            {w.driver.qualifications.map((q) => (
              <tr key={q.kind} data-state={q.state}>
                <th>{q.label}</th>
                <td>
                  {q.kind === "adr" && !w.job.cargo.some((c) => c.adr)
                    ? "Não"
                    : "Sim"}
                </td>
                <td>
                  {
                    {
                      VALID: "Válida",
                      EXPIRING: "A caducar",
                      EXPIRED: "Caducada",
                      MISSING: "Em falta",
                      NOT_HELD: "Não detém",
                    }[q.state]
                  }
                </td>
                <td>{q.until ?? "Sem validade registada"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sw-record-note">
        Registos do motorista confrontados com a carga. O tempo disponível é
        verificado separadamente.
      </p>
      <button
        className="sw-link"
        data-ix="inspect"
        onClick={() =>
          act(
            scopedInspect(row, {
              type: "facet",
              domain: "Drivers",
              facet: "qualifications",
            }),
          )
        }
      >
        Abrir os registos e resolver →
      </button>
    </div>
  );
}
function Capacity({ row, act }: WorkingProps) {
  const w = row.world;
  if (w.trailerMissing || w.truck.availability !== "AVAILABLE")
    return (
      <EquipmentRecovery row={row} act={act} domains={["Jobs", "Trucks"]} />
    );
  return (
    <div className="sw-capacity-task">
      <WorkIdentity row={row} act={act} />
      <div className="sw-load-plan" data-contribution="Trucks">
        <Machine row={row} act={act} drawing />
        <div className="sw-load-total">
          <strong>
            {w.pallets}
            <small>paletes da carga</small>
          </strong>
          <span>
            de {w.trailer?.pallets ?? "?"} lugares registados no reboque
          </span>
          {w.trailerMissing && (
            <Status tone="action">
              Reboque em falta · capacidade por confirmar
            </Status>
          )}
        </div>
      </div>
      <ol
        className="sw-unload-sequence"
        data-contribution="Jobs"
        aria-label="Carga por destino"
      >
        {row.unloads.map(({ cargo, stop }, i) => (
          <li key={cargo.id}>
            <span>{stop ? i + 1 : "?"}</span>
            <div>
              <h3>{cargo.dropAt}</h3>
              <small>
                {stop
                  ? `Janela ${stop.window.join("–")}`
                  : "Destino sem etapa associada"}
              </small>
              <p>{cargo.description}</p>
              <div
                className="sw-pallet-bar"
                style={{
                  width: `${Math.max(3, (cargo.pallets / Math.max(1, w.trailer?.pallets ?? w.pallets)) * 100)}%`,
                }}
              />
              <small>
                {cargo.pallets} paletes ·{" "}
                {cargo.weightKg.toLocaleString("pt-PT")} kg
                {cargo.adr ? ` · ADR ${cargo.adr}` : ""}
              </small>
            </div>
          </li>
        ))}
      </ol>
      <button
        className="sw-link"
        data-ix="inspect"
        onClick={() =>
          act(
            scopedInspect(row, {
              type: "facet",
              domain: "Trucks",
              facet: "assignment",
            }),
          )
        }
      >
        Rever o conjunto para esta carga →
      </button>
    </div>
  );
}
function EquipmentRecovery({ row, domains, act }: WorkingProps) {
  const w = row.world;
  return (
    <div className="sw-equipment-recovery">
      <WorkIdentity row={row} act={act} />
      <div className="sw-equipment-gap" data-contribution="Trucks">
        <small>Ligação a resolver</small>
        <h2>
          {w.trailerMissing
            ? `Reboque ${w.job.trailerId} não encontrado`
            : `${w.truck.plate} indisponível`}
        </h2>
        <p>
          {w.trailerMissing
            ? "A carga não tem capacidade atribuída confirmada. Escolher um reboque existente e confrontar os requisitos."
            : "A viatura atribuída está em manutenção ou fora de serviço. Comparar outra viatura para o mesmo trabalho."}
        </p>
        <button
          className="fx-btn"
          data-kind="primary"
          data-ix="edit"
          onClick={() =>
            act(
              scopedInspect(row, {
                type: "edit",
                kind: w.trailerMissing ? "trailer" : "truck",
                target: w.jobId,
              }),
            )
          }
        >
          {w.trailerMissing
            ? "Escolher o reboque para esta carga"
            : "Comparar outra viatura"}{" "}
          →
        </button>
      </div>
      <div
        className="sw-recovery-requirements"
        data-contribution={domains.includes("Jobs") ? "Jobs" : "Trucks"}
      >
        <h3>O conjunto precisa de transportar</h3>
        <b>
          {w.pallets} paletes · {w.cargoKg.toLocaleString("pt-PT")} kg
        </b>
        <ol>
          {row.unloads.map(({ cargo, stop }) => (
            <li key={cargo.id}>
              <b>{cargo.dropAt}</b>
              <span>
                {cargo.pallets} paletes · {cargo.description}
                {cargo.adr ? ` · ADR ${cargo.adr}` : ""}
              </span>
              <small>
                {stop
                  ? `Janela ${stop.window.join("–")}`
                  : "Etapa por confirmar"}
              </small>
            </li>
          ))}
        </ol>
      </div>
      {domains.includes("Drivers") && (
        <div className="sw-recovery-partner">
          <h3>Motorista ligado ao trabalho</h3>
          <Crew row={row} act={act} />
        </div>
      )}
    </div>
  );
}
function Clearance({ row, domains, act }: WorkingProps) {
  const w = row.world;
  return (
    <div className="sw-clearance-task">
      <WorkIdentity row={row} act={act} />
      <div className="sw-physical-comparison">
        <div className="sw-physical-object" data-contribution="Trucks">
          <Machine row={row} act={act} drawing />
          <dl>
            <div>
              <dt>Altura ao 1.º eixo</dt>
              <dd>
                {w.truck.firstAxleHeightM == null
                  ? "Medição em falta"
                  : `${w.truck.firstAxleHeightM.toFixed(2)} m`}
              </dd>
            </div>
            <div>
              <dt>Massa do conjunto</dt>
              <dd>
                {w.trailerMissing
                  ? "Por confirmar · reboque em falta"
                  : `${((w.truck.tareKg + (w.trailer?.tareKg ?? 0) + w.cargoKg) / 1000).toLocaleString("pt-PT")} t · estimada`}
              </dd>
            </div>
          </dl>
          <button
            className="sw-link"
            data-ix="edit"
            onClick={() =>
              act(
                scopedInspect(row, {
                  type: "edit",
                  kind: "axle",
                  target: w.truck.id,
                }),
              )
            }
          >
            {w.truck.firstAxleHeightM == null
              ? "Registar a medição em falta"
              : "Rever a medição"}{" "}
            →
          </button>
        </div>
        <div className="sw-passage-tests" data-contribution="Restrictions">
          {row.passages.map(({ restriction: r, impact }) => (
            <section key={r.id}>
              <h3>
                <ObjectLink row={row} kind="restriction" id={r.id} act={act}>
                  {r.title.split(" — ")[0]}
                </ObjectLink>
              </h3>
              <Status
                tone={
                  impact.status === "UNKNOWN"
                    ? "unknown"
                    : impact.status === "FAIL"
                      ? "action"
                      : "ok"
                }
              >
                {impact.status === "UNKNOWN"
                  ? "Ainda por confirmar"
                  : impact.status === "FAIL"
                    ? "Condição aplica-se"
                    : "Regra não aplicável"}
              </Status>
              <ul>
                {r.all.map((p, i) => (
                  <li key={i}>
                    <Tri outcome={p.outcome} />
                    <span>
                      <b>{p.label}</b>
                      <small>
                        {p.value} · {p.source}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      {domains.includes("Jobs") && (
        <p data-contribution="Jobs" className="sw-cargo-requirement">
          {w.pallets} paletes · {w.cargoKg.toLocaleString("pt-PT")} kg de carga
          · {row.next?.city ?? "Etapas concluídas"}
        </p>
      )}
      {domains.includes("Documents") && (
        <div className="sw-clearance-evidence">
          <h3>Registo do transporte</h3>
          <Paper row={row} act={act} />
          <small>
            A guia de transporte não comprova uma autorização de passagem.
          </small>
        </div>
      )}
    </div>
  );
}
function Range({ row, domains, act }: WorkingProps) {
  const w = row.world;
  return (
    <div className="sw-range-task">
      <WorkIdentity row={row} act={act} />
      <div className="sw-range-reading" data-contribution="Trucks">
        <ObjectLink row={row} kind="truck" id={w.truck.id} act={act}>
          <b>{w.truck.plate}</b>
        </ObjectLink>
        <strong>
          {w.positionKnown
            ? `≈ ${Math.round(w.rangeKm)} km`
            : "Autonomia desconhecida"}
        </strong>
        <p>
          {w.positionKnown
            ? "Estimativa do cenário até esgotar o depósito"
            : "Falta posição para estimar o consumo desde a leitura"}
        </p>
        <div className="sw-fuel-reading">
          <span>Última leitura</span>
          <b>{w.truck.fuel.value}%</b>
          <small>
            {w.truck.fuel.prov.source} · {w.truck.fuel.prov.at}
          </small>
        </div>
        <div className="sw-fuel-reading">
          <span>Agora, no cenário</span>
          <b>{w.positionKnown ? `≈ ${Math.round(w.fuelNowPct)}%` : "?"}</b>
          <small>Consumo assumido · sem telemetria</small>
        </div>
      </div>
      <section data-contribution="Fuel">
        <h2>Onde abastecer</h2>
        {w.candidates.length ? (
          w.candidates.map((stop) => (
            <div className="sw-fuel-stop" key={stop.id}>
              <ObjectLink row={row} kind="stop" id={stop.id} act={act}>
                <b>{stop.name}</b>
              </ObjectLink>
              <small>
                Chegada {stop.arrival} · cenário · {stop.litres} L previstos
              </small>
            </div>
          ))
        ) : (
          <>
            <p>Sem candidatas calculadas para este percurso.</p>
            <button
              className="sw-link"
              data-ix="inspect"
              onClick={() =>
                act(
                  scopedInspect(row, {
                    type: "facet",
                    domain: "Fuel",
                    facet: "management",
                  }),
                )
              }
            >
              Rever as paragens do percurso →
            </button>
          </>
        )}
      </section>
      {domains.includes("Jobs") && (
        <small data-contribution="Jobs">
          Próxima etapa · {row.next?.city ?? "Etapas concluídas"} · janela{" "}
          {row.next?.window.join("–")}
        </small>
      )}
    </div>
  );
}
function RouteChoice({
  row,
  domains,
  act,
  state,
}: WorkingProps & { state: GuidedState }) {
  const alternatives = providerFor(state).getRouteAlternatives(row.world.jobId);
  return (
    <div className="sw-route-choice-task">
      <WorkIdentity row={row} act={act} />
      <div className="sw-corridor-options" data-contribution="Fuel">
        {alternatives.alternatives.map((alt) => (
          <section key={alt.id}>
            <h3>{alt.label}</h3>
            <small>
              {alt.scope === "official_segment"
                ? "Troço oficial · não é uma rota completa"
                : "Corredor registado"}
            </small>
            <dl>
              <div>
                <dt>Distância registada</dt>
                <dd>
                  {alt.distanceM.status === "UNKNOWN"
                    ? "Por calcular"
                    : `${Math.round(alt.distanceM.value / 1000)} km`}
                </dd>
              </div>
              <div>
                <dt>Duração completa</dt>
                <dd>
                  {alt.durationSec.status === "UNKNOWN"
                    ? "Por calcular"
                    : `${Math.round(alt.durationSec.value / 60)} min`}
                </dd>
              </div>
            </dl>
            <small>
              {alt.unknownReasons.join(" · ") ||
                "Viabilidade precisa de validação"}
            </small>
          </section>
        ))}
      </div>
      <div className="sw-choice-consequence">
        <Passage row={row} act={act} />
        {domains.includes("Documents") && <Paper row={row} act={act} />}
      </div>
      {domains.includes("Jobs") && (
        <p data-contribution="Jobs">
          Próxima janela · {row.next?.city ?? "Etapas concluídas"} ·{" "}
          {row.next?.window.join("–")}
        </p>
      )}
      <button
        className="sw-link"
        data-ix="inspect"
        onClick={() =>
          act(
            scopedInspect(row, {
              type: "facet",
              domain: "Fuel",
              facet: "comparison",
            }),
          )
        }
      >
        Abrir a comparação e rever o que falta →
      </button>
    </div>
  );
}

function ExecutionRecords({ row, domains, act }: WorkingProps) {
  const w = row.world;
  const cmr = w.ledger.find(
    (document) => document.type === "CMR" && document.state !== "VOID",
  );
  return (
    <div className="sw-execution-register" data-execution-register="true">
      <WorkIdentity row={row} act={act} />
      <div className="sw-record-assurance" data-contribution="Documents">
        <div>
          <small>Registo que acompanha o trabalho</small>
          <h3>{cmr?.number ?? "Guia ainda não emitida"}</h3>
          <p>
            {cmr?.state !== "ISSUED"
              ? "A partida continua sem guia emitida neste cenário."
              : cmr.diverges
                ? "Existem diferenças entre a guia emitida e o trabalho atual."
                : "Guia emitida disponível. A conclusão de uma etapa não equivale a um comprovativo assinado de entrega."}
          </p>
        </div>
        <button
          className="sw-link"
          data-ix="inspect"
          onClick={() =>
            act(
              scopedInspect(row, {
                type: "facet",
                domain: "Documents",
                facet: cmr?.diverges ? "diff" : "dossier",
              }),
            )
          }
        >
          {cmr?.diverges
            ? "Rever diferenças da guia"
            : "Rever os registos da passagem"}{" "}
          →
        </button>
      </div>
      <ol
        className="sw-record-stages"
        data-contribution="Fuel"
        aria-label="Etapas, execução e evidência"
      >
        {w.job.stops.map((stop, index) => {
          const reading = row.timeline.timeline?.stops.find(
            (item) => item.stopId === stop.id,
          );
          const unloads = row.unloads.filter(
            (item) => item.stop?.id === stop.id,
          );
          const previousKm = index ? w.job.stops[index - 1].km : -1;
          const passages = row.passages.filter(
            (item) =>
              item.restriction.km != null &&
              item.restriction.km > previousKm &&
              item.restriction.km <= stop.km,
          );
          return (
            <li
              key={stop.id}
              data-next={stop.id === row.next?.id}
              data-done={!!stop.completedAt}
            >
              <span className="sw-record-number">
                {stop.completedAt ? "✓" : String(index + 1).padStart(2, "0")}
              </span>
              <div className="sw-record-stop">
                <h3>{stop.city}</h3>
                <small>
                  {stop.type === "pickup"
                    ? "Carga"
                    : stop.type === "stop"
                      ? "Etapa intermédia"
                      : "Entrega"}{" "}
                  · janela {stop.window.join("–")}
                </small>
                <p>
                  {stop.completedAt ? (
                    <>
                      Conclusão registada às <b>{stop.completedAt}</b> · cenário
                    </>
                  ) : (
                    <>
                      Chegada prevista: <Clock value={reading?.arrival} />
                    </>
                  )}
                </p>
                <button
                  className="sw-link"
                  data-ix="follow"
                  onClick={() =>
                    act(
                      scopedInspect(row, {
                        type: "follow",
                        object: { kind: "delivery", stop: stop.id },
                      }),
                    )
                  }
                >
                  Abrir esta etapa e o trabalho associado →
                </button>
              </div>
              <div className="sw-record-proof">
                <small>Evidência da etapa</small>
                <b>
                  {stop.type === "pickup"
                    ? cmr?.state === "ISSUED"
                      ? "Guia emitida"
                      : "Guia a preparar"
                    : "Comprovativo assinado não registado"}
                </b>
                <p>
                  {stop.type === "pickup"
                    ? "A emissão fixa o transporte declarado na guia."
                    : stop.completedAt
                      ? "Há uma hora de conclusão no cenário; não há um comprovativo de entrega neste dossier."
                      : "Ainda sem conclusão registada. A previsão permanece separada da execução."}
                </p>
                {domains.includes("Jobs") && (
                  <div data-contribution="Jobs">
                    <small>Carga nesta etapa</small>
                    {stop.type === "pickup" ? (
                      <span>
                        {w.pallets} paletes ·{" "}
                        {w.cargoKg.toLocaleString("pt-PT")} kg
                      </span>
                    ) : unloads.length ? (
                      unloads.map(({ cargo }) => (
                        <span key={cargo.id}>
                          {cargo.pallets} paletes · {cargo.description}
                        </span>
                      ))
                    ) : (
                      <span>Sem descarga associada nesta etapa</span>
                    )}
                  </div>
                )}
                {domains.includes("Restrictions") && (
                  <div data-contribution="Restrictions">
                    <small>Passagens no intervalo do percurso</small>
                    {passages.length ? (
                      passages.map(({ restriction }) => (
                        <ObjectLink
                          key={restriction.id}
                          row={row}
                          kind="restriction"
                          id={restriction.id}
                          act={act}
                        >
                          {restriction.title.split(" — ")[0]} ·{" "}
                          {restriction.result === "UNKNOWN"
                            ? "por confirmar"
                            : restriction.result === "APPLIES"
                              ? "aplica-se"
                              : "não se aplica"}{" "}
                          →
                        </ObjectLink>
                      ))
                    ) : (
                      <span>
                        Sem condição associada a este intervalo; a cobertura não
                        é completa.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {(domains.includes("Drivers") || domains.includes("Trucks")) && (
        <section className="sw-record-responsibility">
          <h3>Responsáveis e conjunto destes registos</h3>
          <div>
            {domains.includes("Drivers") && <Crew row={row} act={act} />}
            {domains.includes("Trucks") && <Machine row={row} act={act} />}
          </div>
        </section>
      )}
      {domains.includes("Restrictions") &&
        row.passages.some((item) => item.restriction.km == null) && (
          <section className="sw-record-unlocated">
            <h3>Condições sem posição de etapa registada</h3>
            <Passage row={row} act={act} />
          </section>
        )}
    </div>
  );
}

export function SharedWorkInstrument({ state, act }: Props) {
  const work = sharedWork(state);
  if (!work) return null;
  const rows = sharedWorkRows(state);
  const scope = sharedScope(state);
  const day = state.anchor.kind === "jobs";
  const questions = sharedWorkQuestions(state);
  const situation =
    !day && rows.length === 1 ? sharedWorkSituation(rows[0], work) : null;
  return (
    <article
      className="fx-instrument sw-work"
      data-shared-work={work.kind}
      data-scope={day ? "day" : "object"}
      data-work-variant={work.variant}
      data-work-situation={situation?.mode ?? "day"}
      data-spatial-task={state.mapFull}
    >
      <header className="sw-heading">
        <div>
          <h1>{situation?.title ?? work.title}</h1>
          <p>{situation?.question ?? work.question}</p>
        </div>
        {day ? (
          <div className="sw-scope-controls" aria-label="Âmbito do trabalho">
            <button
              data-ix="inspect"
              aria-pressed={state.filter === "all"}
              disabled={state.filter === "all"}
              onClick={() => act({ type: "filter", value: "all" })}
            >
              Todos
            </button>
            <button
              data-ix="inspect"
              aria-pressed={state.filter === "moving"}
              disabled={state.filter === "moving"}
              onClick={() => act({ type: "filter", value: "moving" })}
            >
              Em curso
            </button>
          </div>
        ) : (
          <button
            className="sw-link sw-day-return"
            data-ix="follow"
            onClick={() => act({ type: "scope-day" })}
          >
            Ver o dia com este contexto →
          </button>
        )}
      </header>
      <p className="sw-participants">
        {work.domains.map((domain) => LENS_LABEL[domain]).join(" · ")}
      </p>
      {questions.length > 1 && (
        <nav
          className="sw-work-questions"
          aria-label="Pergunta do trabalho conjunto"
        >
          <small>Trabalhar sobre</small>
          {state.mapFull ? (
            <select
              aria-label="Pergunta do trabalho conjunto"
              value={state.workTask ?? "auto"}
              onChange={(event) =>
                act({
                  type: "work-task",
                  task: event.target.value as NonNullable<
                    GuidedState["workTask"]
                  >,
                })
              }
            >
              {questions.map((question) => (
                <option key={question.value} value={question.value}>
                  {question.label}
                </option>
              ))}
            </select>
          ) : (
            questions.map((question) => (
              <button
                key={question.value}
                data-work-task={question.value}
                data-ix={
                  question.value === (state.workTask ?? "auto")
                    ? undefined
                    : "inspect"
                }
                disabled={question.value === (state.workTask ?? "auto")}
                aria-pressed={question.value === (state.workTask ?? "auto")}
                onClick={() => act({ type: "work-task", task: question.value })}
              >
                {question.label}
              </button>
            ))
          )}
        </nav>
      )}
      {!day && scope.status === "SELECTED" && (
        <nav
          className="sw-instruments"
          aria-label="Inspecionar os instrumentos do trabalho"
        >
          {work.domains.map((domain) => {
            const instrument = workInstrument(work, domain);
            return instrument ? (
              <button
                key={domain}
                className="sw-link"
                data-ix="inspect"
                data-inspect-domain={domain}
                onClick={() => act(instrument.action)}
              >
                {instrument.label} →
              </button>
            ) : null;
          })}
        </nav>
      )}
      {rows.length === 0 && (
        <section className="sw-scope-empty" data-context-status={scope.status}>
          <h2>
            {scope.node?.label ??
              (state.anchor.kind === "jobs"
                ? "Sem transportes em curso"
                : "id" in state.anchor
                  ? state.anchor.id
                  : "Sem contexto")}
          </h2>
          <Status tone={scope.status === "MISSING" ? "action" : "unknown"}>
            {scope.status === "MISSING"
              ? "Objeto ou transporte não encontrado"
              : "Sem transporte associado neste âmbito"}
          </Status>
          {scope.node && (
            <p>
              {scope.node.detail} · {scope.node.status.text}
            </p>
          )}
          <p>
            As relações de percurso, carga, horários e documentos precisam de um
            transporte associado. Os dados deste objeto não são substituídos por
            outro trabalho.
          </p>
          <button
            className="sw-link"
            data-ix="follow"
            onClick={() => act({ type: "scope-day" })}
          >
            Ver os trabalhos do dia →
          </button>
        </section>
      )}
      <div
        className={`sw-work-items sw-${work.kind}-items sw-${work.variant}-items`}
      >
        {rows.map((row) => (
          <section
            key={row.world.jobId}
            data-work-id={row.world.jobId}
            data-work-situation={sharedWorkSituation(row, work).mode}
            data-map-entity="job"
            data-entity-id={row.world.jobId}
          >
            {work.variant === "schedule" ? (
              <Schedule row={row} domains={work.domains} act={act} />
            ) : work.variant === "credentials" ? (
              <Credentials row={row} domains={work.domains} act={act} />
            ) : work.variant === "capacity" ? (
              <Capacity row={row} domains={work.domains} act={act} />
            ) : work.variant === "clearance" ? (
              <Clearance row={row} domains={work.domains} act={act} />
            ) : work.variant === "range" ? (
              <Range row={row} domains={work.domains} act={act} />
            ) : work.variant === "route-choice" ? (
              <RouteChoice
                row={row}
                domains={work.domains}
                act={act}
                state={state}
              />
            ) : work.variant === "execution-records" ? (
              <ExecutionRecords row={row} domains={work.domains} act={act} />
            ) : work.kind === "journey" ? (
              <Journey row={row} domains={work.domains} act={act} />
            ) : work.kind === "matching" ? (
              <Matching row={row} domains={work.domains} act={act} />
            ) : (
              <Handover row={row} domains={work.domains} act={act} />
            )}
          </section>
        ))}
      </div>
      <footer className="sw-provenance">
        <Status tone="neutral">
          Demonstração · {NOW.label} {NOW.clock}
        </Status>{" "}
        Registos e horas do cenário · sem telemetria
      </footer>
    </article>
  );
}
