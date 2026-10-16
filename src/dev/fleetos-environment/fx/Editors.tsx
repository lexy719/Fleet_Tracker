import { useState } from "react";
import type { GuidedAction, GuidedState } from "../guidedWorkspace";
import { EDIT_HOME, isProposed } from "../edits";
import {
  DRIVER_POOL,
  TRAILERS,
  TRUCKS,
  driverWorld,
  dur,
  holderOf,
  type TrailerWorld,
} from "../world";
import { Id, Plate, Status, Tri } from "./honesty";
import { labWorld, type LabWorld } from "./model";

type Props = { state: GuidedState; act: (a: GuidedAction) => void };
const short = (v: number) => v.toFixed(2).replace(".", ",");

/** Header shared by every in-place editor: what is being edited and how to leave. */
function EditHead({ state, act, title, note, kind }: Props & { title: string; note: string; kind?: keyof typeof EDIT_HOME }) {
  const k = state.edit?.kind ?? kind;
  return (
    <div className="fx-edit-head">
      <span className="fx-edit-kicker">{state.edit ? "A editar" : "Preparar"} · {k ? EDIT_HOME[k].label : "Edição"}</span>
      <b>{title}</b>
      <small>{note}</small>
      {state.edit && (
        <button className="fx-link" data-ix="propose" onClick={() => act({ type: "edit-close" })}>
          Fechar sem alterar
        </button>
      )}
    </div>
  );
}

/* ─── Trailer / truck assignment: the workspace becomes the comparison ──── */

export function AssignmentSurface({ state, act }: Props) {
  const w = labWorld(state);
  const committed = labWorld(state, false);
  const kind = state.edit?.kind === "truck" ? "truck" : "trailer";
  const adr = w.job.cargo.some((c) => c.adr);
  const cold = w.job.cargo.some((c) => c.tempC != null);
  const clearance = w.restrictions.find((r) => r.limitM)?.limitM;
  if (kind === "truck") {
    const current = committed.truck;
    const rows = Object.values(TRUCKS).filter((t) => t.id !== current.id);
    return (
      <section className="fx-assign" aria-label="Viaturas compatíveis">
        <EditHead state={state} act={act} title={`Conjunto atual: ${current.plate} + ${w.trailer?.id ?? "sem reboque"}`} note="Escolher uma viatura cria uma proposta; nada muda até confirmar." />
        <table className="fx-compare">
          <thead>
            <tr>
              <th>Viatura</th>
              <th>Hoje</th>
              <th>ADR</th>
              <th>1.º eixo · VCI</th>
              <th>Combustível</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const holder = holderOf("truckId", t.id);
              const chosen = isProposed(state, "truck", w.jobId) && state.pending?.to === t.id;
              return (
                <tr key={t.id} data-chosen={chosen} data-conflict={!!holder || t.availability !== "AVAILABLE"}>
                  <td>
                    <Plate small>{t.plate}</Plate> <small>{t.make} {t.model}</small>
                  </td>
                  <td>{t.availability !== "AVAILABLE" ? <Status tone="action">Em oficina</Status> : holder ? <span>com <Id>{holder}</Id></span> : <Status tone="ok">Livre</Status>}</td>
                  <td>{adr ? <Tri outcome={t.adrEquipped ? "yes" : "no"} /> : "—"}</td>
                  <td>{t.firstAxleHeightM == null ? <Tri outcome="unknown" /> : `${short(t.firstAxleHeightM)} m`}</td>
                  <td>{t.fuel.value}% <small>{t.fuel.prov.at}</small></td>
                  <td>
                    <button
                      className="fx-btn"
                      data-kind={chosen ? "primary" : "quiet"}
                      data-ix={chosen ? undefined : "propose"}
                      disabled={chosen}
                      onClick={() => act({ type: "propose", proposal: { kind: "truck", id: w.jobId, from: current.id, to: t.id } })}
                    >
                      {chosen ? "Proposta" : "Propor"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );
  }
  const current = committed.trailer;
  const rows = Object.values(TRAILERS).filter((t) => t.id !== committed.job.trailerId);
  const verdict = (t: TrailerWorld) => {
    const fail = (adr && !t.capabilities.includes("Equipado ADR")) || (cold && t.type !== "Frigorífico") || w.pallets > t.pallets;
    return fail ? "no" : "yes";
  };
  return (
    <section className="fx-assign" aria-label="Reboques compatíveis">
      <EditHead
        state={state}
        act={act}
        title={current ? `Conjunto atual: ${committed.truck.plate} + ${current.id} (${current.type.toLowerCase()})` : `Conjunto atual: ${committed.truck.plate} + ${committed.job.trailerId} — não existe`}
        note={`${w.pallets} paletes${adr ? " · ADR" : ""}${cold ? " · frio" : ""}. Escolher um reboque cria uma proposta; nada muda até confirmar.`}
      />
      <table className="fx-compare">
        <thead>
          <tr>
            <th>Reboque</th>
            <th>Onde</th>
            <th>Posições</th>
            <th>ADR / frio</th>
            <th>Altura{clearance ? " · gabarito" : ""}</th>
            <th>Guia CMR</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows
            .sort((a, b) => (verdict(a) === verdict(b) ? Number(!!holderOf("trailerId", a.id)) - Number(!!holderOf("trailerId", b.id)) : verdict(a) === "yes" ? -1 : 1))
            .map((t) => {
              const holder = holderOf("trailerId", t.id);
              const chosen = isProposed(state, "trailer", w.jobId) && state.pending?.to === t.id;
              const ok = verdict(t) === "yes";
              return (
                <tr key={t.id} data-chosen={chosen} data-conflict={!ok || !!holder}>
                  <td>
                    <Id>{t.id}</Id> <small>{t.type}</small>
                  </td>
                  <td>{holder ? <span>com <Id>{holder}</Id></span> : <small>{t.location}</small>}</td>
                  <td>
                    <Tri outcome={w.pallets <= t.pallets ? "yes" : "no"} /> {t.pallets}
                  </td>
                  <td>
                    {adr && <Tri outcome={t.capabilities.includes("Equipado ADR") ? "yes" : "no"} />}
                    {cold && <Tri outcome={t.type === "Frigorífico" ? "yes" : "no"} />}
                    {!adr && !cold && "—"}
                  </td>
                  <td>
                    {short(t.heightM)} m{clearance ? <Tri outcome={t.heightM <= clearance ? "yes" : "no"} /> : null}
                  </td>
                  <td>
                    <small>{committed.ledger[0].state === "ISSUED" ? "reemitir" : "fixa na emissão"}</small>
                  </td>
                  <td>
                    <button
                      className="fx-btn"
                      data-kind={chosen ? "primary" : "quiet"}
                      data-ix={chosen ? undefined : "propose"}
                      disabled={!ok || chosen}
                      title={ok ? undefined : "Incompatível com a carga"}
                      onClick={() => act({ type: "propose", proposal: { kind: "trailer", id: w.jobId, from: committed.job.trailerId, to: t.id } })}
                    >
                      {chosen ? "Proposta" : ok ? "Propor" : "Incompatível"}
                    </button>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      {holderFree(rows) === 0 && <p className="fx-footnote">Todos os reboques compatíveis estão atribuídos.</p>}
    </section>
  );
}
const holderFree = (rows: TrailerWorld[]) => rows.filter((t) => !holderOf("trailerId", t.id)).length;

/* ─── Driver assignment ─────────────────────────────────────────────────── */

export function DriverAssignment({ state, act }: Props) {
  const w = labWorld(state);
  const committed = labWorld(state, false);
  const adr = w.job.cargo.some((c) => c.adr);
  return (
    <section className="fx-assign" aria-label="Motoristas disponíveis">
      <EditHead
        state={state}
        act={act}
        title={`Atribuído: ${committed.driver.name} · ${committed.driver.id}`}
        note={`${w.job.id} · ${w.job.stops[0].city} → ${w.job.stops.at(-1)!.city}${adr ? " · carga ADR" : ""}. Escolher cria uma proposta.`}
      />
      <table className="fx-compare">
        <thead>
          <tr>
            <th>Motorista</th>
            <th>Hoje</th>
            <th>Condução contínua</th>
            <th>CQM</th>
            <th>ADR</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {DRIVER_POOL.filter((d) => d.id !== committed.driver.id).map((d) => {
            const dw = driverWorld(d.id);
            const holder = holderOf("driverId", d.id);
            const cpc = dw.qualifications.find((q) => q.kind === "cpc")!;
            const adrQ = dw.qualifications.find((q) => q.kind === "adr")!;
            const chosen = isProposed(state, "driver", w.jobId) && state.pending?.to === d.id;
            return (
              <tr key={d.id} data-chosen={chosen} data-conflict={!!holder || cpc.state === "EXPIRED"}>
                <td>
                  <b>{dw.name}</b> <Id>{d.id}</Id>
                </td>
                <td>{holder ? <span>com <Id>{holder}</Id> · {d.where}</span> : <small>{d.where}</small>}</td>
                <td>{dw.spellMin ? dur(dw.spellMin) : "sem condução"}</td>
                <td>
                  <Status tone={cpc.state === "VALID" ? "ok" : cpc.state === "EXPIRED" ? "action" : "risk"}>{cpc.state === "VALID" ? "válido" : cpc.state === "EXPIRED" ? "caducado" : `até ${cpc.until}`}</Status>
                </td>
                <td>{adr ? <Tri outcome={adrQ.state === "VALID" ? "yes" : "unknown"} /> : "—"}</td>
                <td>
                  <button
                    className="fx-btn"
                    data-kind={chosen ? "primary" : "quiet"}
                    data-ix={chosen ? undefined : "propose"}
                    disabled={chosen}
                    onClick={() => act({ type: "propose", proposal: { kind: "driver", id: w.jobId, from: committed.driver.id, to: d.id } })}
                  >
                    {chosen ? "Proposta" : "Propor"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/* ─── Single-value editors ──────────────────────────────────────────────── */

export function AxleEditor({ state, act }: Props) {
  const w = labWorld(state);
  const base = labWorld(state, false).truck.firstAxleHeightM;
  const proposed = isProposed(state, "axle", w.truck.id) ? state.pending!.to! : null;
  const [value, setValue] = useState(proposed ?? (base != null ? String(base) : "1.06"));
  const v = Number(value);
  const valid = v > 0.4 && v < 2;
  return (
    <form
      className="fx-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) act({ type: "propose", proposal: { kind: "axle", id: w.truck.id, from: base == null ? "" : String(base), to: String(v) } });
      }}
    >
      <EditHead state={state} act={act} title={`Altura ao 1.º eixo · ${w.truck.plate}`} note="Medição manual. Fica registada na viatura, não no transporte." />
      <label className="fx-field" data-ix="edit">
        <span>Altura medida</span>
        <input type="number" step="0.01" min="0.5" max="1.9" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Altura ao 1.º eixo em metros" />
        <em>m</em>
      </label>
      <p className="fx-edit-preview" data-outcome={!valid ? "unknown" : v >= 1.1 ? "yes" : "no"}>
        {valid ? (
          <>
            <Tri outcome={v >= 1.1 ? "yes" : "no"} /> {short(v)} {v >= 1.1 ? "≥" : "<"} 1,10 m → a condição da VCI {v >= 1.1 ? "verifica-se" : "falha"}
          </>
        ) : (
          "Valor fora do intervalo de medição"
        )}
      </p>
      <button className="fx-btn" data-kind="primary" data-ix="propose" disabled={!valid}>
        {proposed ? "Atualizar proposta" : "Propor medição"}
      </button>
    </form>
  );
}

export function FuelReadingEditor({ state, act }: Props) {
  const w = labWorld(state, false);
  const [value, setValue] = useState(String(w.truck.fuel.value));
  return (
    <form
      className="fx-editor"
      onSubmit={(e) => {
        e.preventDefault();
        act({ type: "propose", proposal: { kind: "fuel-reading", id: w.truck.id, from: String(w.truck.fuel.value), to: value } });
      }}
    >
      <EditHead state={state} act={act} title={`Leitura de combustível · ${w.truck.plate}`} note={`Última: ${w.truck.fuel.value}% (${w.truck.fuel.prov.source}, ${w.truck.fuel.prov.at})`} />
      <label className="fx-field" data-ix="edit">
        <span>Depósito agora</span>
        <input type="range" min="0" max="100" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Nível do depósito" />
        <b>{value}%</b>
      </label>
      <button className="fx-btn" data-kind="primary" data-ix="propose">
        Propor leitura
      </button>
    </form>
  );
}

export function MaintenanceEditor({ state, act }: Props) {
  const w = labWorld(state, false);
  return (
    <div className="fx-editor">
      <EditHead state={state} act={act} title={`${w.truck.plate} · ${w.truck.service}`} note={`${w.job.id} carrega às ${w.job.stops[0].window[0]} em ${w.job.stops[0].city}.`} />
      <div className="fx-edit-choices">
        <button
          className="fx-choice"
          data-ix="propose"
          aria-pressed={isProposed(state, "maintenance", w.truck.id)}
          onClick={() => act({ type: "propose", proposal: { kind: "maintenance", id: w.truck.id, from: "MAINTENANCE", to: "AVAILABLE" } })}
        >
          <b>Reparação concluída</b>
          <span>A viatura volta a disponível e mantém {w.job.id}.</span>
        </button>
        <button className="fx-choice" data-ix="edit" onClick={() => act({ type: "edit", kind: "truck", target: w.jobId })}>
          <b>Mantém-se em oficina</b>
          <span>Reatribuir {w.job.id} a outra viatura →</span>
        </button>
      </div>
    </div>
  );
}

export function QualificationEditor({ state, act, driverId }: Props & { driverId: string }) {
  const d = labWorld(state, false).driver.id === driverId ? labWorld(state, false).driver : driverWorld(driverId);
  const q = d.qualifications.find((x) => x.kind === "cpc")!;
  const options = ["2 out 2031", "16 nov 2031"];
  const proposed = isProposed(state, "qualification", `${driverId}:cpc`) ? state.pending!.to : null;
  return (
    <div className="fx-editor">
      <EditHead state={state} act={act} title={`${q.label} · ${d.name}`} note={`Estado atual: ${q.state === "EXPIRED" ? "caducado" : q.state === "EXPIRING" ? "a caducar" : "válido"} · ${q.until ?? "—"}`} />
      <div className="fx-edit-choices">
        {options.map((o) => (
          <button
            key={o}
            className="fx-choice"
            data-ix="propose"
            aria-pressed={proposed === o}
            onClick={() => act({ type: "propose", proposal: { kind: "qualification", id: `${driverId}:cpc`, from: q.until ?? "", to: o } })}
          >
            <b>Renovado até {o}</b>
            <span>Formação contínua de 35 h concluída</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AuthorizationEditor({ state, act }: Props) {
  const w = labWorld(state, false);
  const proposed = isProposed(state, "authorization", w.truck.id) ? state.pending!.to : null;
  return (
    <div className="fx-editor">
      <EditHead state={state} act={act} title={`Habilitação VCI · ${w.truck.plate}`} note="Isenção da restrição VCI Porto. Registo manual." />
      <div className="fx-edit-choices">
        <button className="fx-choice" data-ix="propose" aria-pressed={proposed === "1"} onClick={() => act({ type: "propose", proposal: { kind: "authorization", id: w.truck.id, from: "", to: "1" } })}>
          <b>Tem habilitação</b>
          <span>A isenção afasta a regra</span>
        </button>
        <button className="fx-choice" data-ix="propose" aria-pressed={proposed === "0"} onClick={() => act({ type: "propose", proposal: { kind: "authorization", id: w.truck.id, from: "", to: "0" } })}>
          <b>Não tem habilitação</b>
          <span>A regra decide pelos factos físicos</span>
        </button>
      </div>
    </div>
  );
}

export function BaselineEditor({ state, act }: Props) {
  const w = labWorld(state, false);
  const [value, setValue] = useState(String(w.driver.baseline.drivenBeforeMin));
  return (
    <form
      className="fx-editor"
      onSubmit={(e) => {
        e.preventDefault();
        act({ type: "propose", proposal: { kind: "baseline", id: w.driver.id, from: String(w.driver.baseline.drivenBeforeMin), to: value } });
      }}
    >
      <EditHead state={state} act={act} title={`Base de horas · ${w.driver.name}`} note={`Registada ${w.driver.baseline.recordedLabel} · não é leitura de tacógrafo`} />
      <label className="fx-field" data-ix="edit">
        <span>Condução antes das 06:45</span>
        <input type="number" min="0" max="270" step="5" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Minutos de condução antes do turno" />
        <em>min</em>
      </label>
      <button className="fx-btn" data-kind="primary" data-ix="propose">
        Propor correção
      </button>
    </form>
  );
}

export function IssuePreview({ state, act, w }: Props & { w: LabWorld }) {
  const cmr = labWorld(state, false).ledger[0];
  const proposed = isProposed(state, "issue", cmr.id);
  return (
    <div className="fx-editor" data-wide>
      <EditHead state={state} act={act} kind="issue" title={`Emitir ${cmr.title}`} note={cmr.reason ?? cmr.required} />
      <dl className="fx-facts">
        <div>
          <dt>Paletes</dt>
          <dd>{w.pallets}</dd>
        </div>
        <div>
          <dt>Peso bruto da carga</dt>
          <dd>{w.cargoKg.toLocaleString("pt-PT")} kg</dd>
        </div>
        <div>
          <dt>Reboque</dt>
          <dd>{w.trailer ? w.trailer.plate : <Status tone="blocker">sem reboque válido</Status>}</dd>
        </div>
        <div>
          <dt>Motorista</dt>
          <dd>{w.driver.name}</dd>
        </div>
      </dl>
      <button
        className="fx-btn"
        data-kind="primary"
        data-ix="propose"
        disabled={!w.trailer || proposed}
        onClick={() => act({ type: "propose", proposal: { kind: "issue", id: cmr.id, from: cmr.state, to: "1" } })}
      >
        {proposed ? "Emissão proposta" : "Preparar emissão"}
      </button>
    </div>
  );
}
