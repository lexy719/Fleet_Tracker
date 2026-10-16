import { useState } from "react";
import type { GuidedAction, GuidedState } from "../guidedWorkspace";
import { docEvents, snapshotDiff, type LedgerItem } from "../world";
import type { LabWorld } from "./model";
import { Id, Plate, Status, type Tone } from "./honesty";
import { labWorld } from "./model";
import { FacetBar, facetOf } from "./Facets";
import { IssuePreview, QualificationEditor } from "./Editors";
import { isProposed } from "../edits";
import { NOW, driverWorld } from "../world";
import { DocumentWork } from "./DocumentWork";

type Props = {
  state: GuidedState;
  act: (a: GuidedAction) => void;
  detail?: boolean;
};
const TONE: Record<LedgerItem["state"], Tone> = {
  ISSUED: "ok",
  VOID: "neutral",
  BLOCKED: "unknown",
  MISSING: "action",
  DRAFT: "info",
};

/** Documents = a dossier: what is required, what exists, and what it froze. */
export function DossierInstrument({ state, act, detail }: Props) {
  const [hotEvent, setHotEvent] = useState<string | null>(null);
  const w = labWorld(state);
  const items = w.ledger;
  const selected =
    items.find((d) => d.id === state.selection.document) ?? items[0];
  const facet = facetOf(state, "Documents");
  const seededDiff = snapshotDiff(w.jobId);
  const reissued = items.some((d) => d.id.endsWith("-V"));
  // The issued snapshot never changes; current facts (also committed DEV edits) are compared against it.
  const diff = seededDiff.map((d) => {
    const issuedValue = reissued ? d.current : d.issued;
    const current =
      d.field === "Reboque"
        ? (w.trailer?.plate ?? w.job.trailerId)
        : d.field === "Motorista"
          ? w.driver.name
          : d.current;
    return {
      ...d,
      issued: issuedValue,
      current,
      changed: issuedValue !== current,
    };
  });
  const events = [
    ...docEvents(w.jobId),
    ...(reissued
      ? [
          {
            at: NOW.clock,
            text: "CMR 2026/000412 anulada · CMR 2026/000413 emitida",
            detail: "Reemissão · snapshot da revisão 7 · LOCAL_USER",
          },
        ]
      : items[0].state === "ISSUED" && items[0].at === NOW.clock
        ? [
            {
              at: NOW.clock,
              text: `${items[0].number} emitida`,
              detail: `Snapshot da revisão ${w.job.revision} · LOCAL_USER`,
            },
          ]
        : []),
  ];
  const qualFocus = state.focus?.kind === "qualification" ? state.focus : null;
  const diverging = diff.filter((d) => d.changed).length;
  const cmr = items[0];
  const issued = cmr.state === "ISSUED";
  const reissuing = state.pending?.kind === "reissue";
  const qual = w.driver.qualifications.find(
    (q) => q.state === "EXPIRED" || q.state === "EXPIRING",
  );
  const qDriver = qualFocus
    ? qualFocus.driver === w.driver.id
      ? w.driver
      : driverWorld(qualFocus.driver)
    : w.driver;
  const qItem = qDriver.qualifications.find(
    (q) => q.kind === (qualFocus?.qual ?? "cpc"),
  )!;
  const headline =
    facet === "history"
      ? "Rastrear os registos deste transporte"
      : facet === "diff"
        ? `${issued ? diverging : 0} diferenças entre a guia e o trabalho`
        : facet === "qualification"
          ? `${qItem.label} de ${qDriver.name}: ${qItem.state === "EXPIRED" ? "caducado" : qItem.state === "EXPIRING" ? `caduca a ${qItem.until}` : qItem.state === "VALID" ? `válido até ${qItem.until}` : "não detém"}`
          : facet === "issue"
            ? cmr.state === "ISSUED"
              ? `${cmr.number} emitida`
              : "Preparar a emissão da guia CMR"
            : cmr.state === "MISSING"
              ? "Guia CMR em falta — carga a decorrer sem guia"
              : cmr.state === "DRAFT"
                ? `Guia CMR a emitir antes da partida às ${w.job.stops[0].window[0]}`
                : cmr.diverges
                  ? "CMR emitida antes da alteração de carga"
                  : "Documentação em ordem para a viagem";
  const sub =
    facet === "history"
      ? "Seguir as versões, os eventos e o trabalho que lhes deu origem."
      : facet === "diff"
        ? "Comparar o que ficou declarado com os dados atuais e rever a origem de cada alteração."
        : facet === "qualification"
          ? qItem.state === "EXPIRED"
            ? `Sem CQM válido, ${qDriver.name.split(" ")[0]} não pode conduzir profissionalmente. A renovação regista-se aqui; o motorista continua visível como contexto.`
            : `A habilitação pertence ao motorista, não ao transporte: nenhuma guia emitida muda.`
          : facet === "issue" && cmr.state !== "ISSUED"
            ? "A emissão fixa um snapshot imutável do transporte atual. Confirmar cria a guia com o próximo número da série."
            : cmr.state === "MISSING"
              ? `A carga em ${w.job.stops[0].city} já começou e não há guia emitida. Tem de existir antes da partida. A fatura só depois da entrega.`
              : cmr.state === "DRAFT"
                ? `Ainda nada foi emitido. Na emissão, a guia fixa os dados abaixo como snapshot imutável.`
                : cmr.diverges
                  ? `O snapshot das ${cmr.at} tem ${diff[0].issued} paletes; o transporte tem agora ${diff[0].current}. A fatura só pode ser emitida depois da entrega.`
                  : `A guia ${cmr.number} corresponde aos dados atuais do transporte. A fatura só pode ser emitida depois da entrega.`;
  return (
    <article
      className="fx-instrument fx-dossier"
      data-detail={!!detail}
      data-facet={facet}
      data-preview={
        state.pending?.kind === "issue" || state.pending?.kind === "reissue"
      }
      data-tone={
        facet === "qualification"
          ? qItem.state === "EXPIRED"
            ? "action"
            : "ok"
          : cmr.state === "MISSING"
            ? "action"
            : diverging
              ? "risk"
              : "ok"
      }
    >
      <header className="fx-answer">
        <h1>{headline}</h1>
        <p>{sub}</p>
        <div className="fx-answer-meta">
          <span className="fx-who">
            Dossier <Id>{w.jobId}</Id> · {w.job.client}
          </span>
          <span className="fx-prov-line">
            Documentos emitidos são snapshots imutáveis · reimpressão nunca lê
            dados atuais
          </span>
          {(state.pending?.kind === "issue" ||
            state.pending?.kind === "reissue") && (
            <p className="fx-preview-note">
              Pré-visualização:{" "}
              {state.pending.kind === "issue"
                ? "a guia ainda não foi emitida"
                : "a guia em viagem continua válida"}{" "}
              · nada muda até confirmar.
            </p>
          )}
          {!detail && (
            <FacetBar
              state={state}
              act={act}
              domain="Documents"
              only={
                qualFocus || facet === "qualification"
                  ? undefined
                  : ["dossier", "diff", "history", "issue"]
              }
            />
          )}
        </div>
      </header>
      {!detail &&
        (facet === "diff" ||
          facet === "history" ||
          (facet === "issue" && issued)) && (
          <DocumentWork
            w={w}
            act={act}
            cmr={cmr}
            diff={diff}
            events={events}
            facet={facet}
            reissuing={reissuing}
          />
        )}
      {facet === "qualification" && !detail && (
        <div className="fx-qualdoc">
          <section className="fx-qualdoc-main">
            <button
              className="fx-party"
              data-ix="follow"
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "driver", id: qDriver.id },
                })
              }
            >
              <span>
                <b>{qDriver.name}</b> <Id>{qDriver.id}</Id>{" "}
                <small>{qDriver.employee}</small>
              </span>
              <small>Motorista de {w.jobId} · ver o dia →</small>
            </button>
            <div
              className="fx-qualdoc-card"
              data-state={qItem.state}
              data-proposed={isProposed(
                state,
                "qualification",
                `${qDriver.id}:cpc`,
              )}
            >
              <small>{qItem.label}</small>
              <b>{qItem.until ?? "—"}</b>
              <Status
                tone={
                  qItem.state === "VALID"
                    ? "ok"
                    : qItem.state === "EXPIRED"
                      ? "action"
                      : "risk"
                }
              >
                {qItem.state === "VALID"
                  ? "Válido"
                  : qItem.state === "EXPIRED"
                    ? "Caducado"
                    : qItem.state === "EXPIRING"
                      ? "A caducar"
                      : "Não detém"}
              </Status>
              <span>{qItem.detail}</span>
              {isProposed(state, "qualification", `${qDriver.id}:cpc`) && (
                <em className="fx-proposed-tag">pré-visualização</em>
              )}
            </div>
            <dl className="fx-facts">
              {qDriver.qualifications
                .filter((q) => q.kind !== qItem.kind)
                .map((q) => (
                  <div key={q.kind}>
                    <dt>{q.label}</dt>
                    <dd>{q.until ?? q.detail}</dd>
                  </div>
                ))}
            </dl>
          </section>
          <section className="fx-qualdoc-side">
            <h2>Exigência</h2>
            <p>
              {qItem.label} ·{" "}
              {qItem.kind === "adr" && !w.job.cargo.some((cargo) => cargo.adr)
                ? "Sem requisito ADR nesta carga."
                : `Registo a confrontar com os requisitos de ${w.jobId}.`}{" "}
              {qItem.state === "EXPIRED"
                ? "A validade registada terminou; rever a habilitação e a atribuição."
                : qItem.state === "VALID"
                  ? "Este registo está válido. A decisão sobre a viagem depende também das restantes condições."
                  : "A validade ou a habilitação precisa de revisão antes de decidir sobre o trabalho."}
            </p>
            {state.edit?.kind === "qualification" ? (
              <QualificationEditor
                state={state}
                act={act}
                driverId={qDriver.id}
              />
            ) : (
              qItem.kind === "cpc" &&
              qItem.state !== "VALID" && (
                <button
                  className="fx-btn"
                  data-kind="quiet"
                  data-ix="edit"
                  onClick={() =>
                    act({
                      type: "edit",
                      kind: "qualification",
                      target: `${qDriver.id}:cpc`,
                    })
                  }
                >
                  Registar renovação
                </button>
              )
            )}
          </section>
        </div>
      )}
      {facet === "issue" && !detail && cmr.state !== "ISSUED" && (
        <div className="fx-issue-stage">
          <IssuePreview state={state} act={act} w={w} />
          <p className="fx-consequence" data-tone="neutral">
            Depois de emitida, a guia não acompanha alterações ao transporte:
            uma mudança de carga, reboque ou motorista passa a aparecer como
            diferença e exige reemissão.
          </p>
        </div>
      )}

      {(detail || facet === "dossier") && (
        <div
          className="fx-dossier-body"
          data-facet={detail ? "dossier" : facet}
        >
          {detail && (
            <section className="fx-paper-col" aria-label="Documento">
              <Paper item={selected} w={w} />
            </section>
          )}
          {!detail && (
            <section className="fx-ledger" aria-label="Requisitos documentais">
              <h2>Requisitos</h2>
              <ol>
                {items.map((d) => (
                  <li
                    key={d.id}
                    data-state={d.state}
                    data-selected={selected.id === d.id}
                    data-map-entity="document"
                    data-entity-id={d.id}
                    data-object={
                      d.state === "ISSUED" ? `doc:${d.id}` : undefined
                    }
                  >
                    <button
                      data-ix="inspect"
                      onClick={() =>
                        act(
                          selected.id === d.id &&
                            (d.state === "ISSUED" ||
                              d.state === "VOID" ||
                              d.state === "BLOCKED")
                            ? {
                                type: "inspect",
                                takeover: { kind: "document", id: d.id },
                              }
                            : selected.id === d.id && d.type === "CMR"
                              ? { type: "edit", kind: "issue", target: d.id }
                              : { type: "document", id: d.id },
                        )
                      }
                    >
                      <span className="fx-ledger-req">{d.required}</span>
                      <b>
                        {d.title} {d.number && <Id>{d.number}</Id>}
                      </b>
                      <Status
                        tone={
                          d.state === "ISSUED" && d.diverges
                            ? "risk"
                            : TONE[d.state]
                        }
                      >
                        {d.state === "ISSUED" && d.diverges
                          ? `Emitida ${d.at} · difere em ${d.diverges} campos`
                          : d.at
                            ? `${d.stateText} ${d.at}`
                            : d.stateText}
                      </Status>
                      {d.reason && <small>{d.reason}</small>}
                    </button>
                    {d.type === "CMR" &&
                      (d.state === "DRAFT" || d.state === "MISSING") && (
                        <button
                          className="fx-link"
                          data-ix="edit"
                          onClick={() =>
                            act({ type: "edit", kind: "issue", target: d.id })
                          }
                        >
                          {isProposed(state, "issue", d.id)
                            ? "Emissão proposta"
                            : "Preparar emissão →"}
                        </button>
                      )}
                    {d.state === "VOID" && (
                      <button
                        className="fx-link"
                        data-ix="inspect"
                        onClick={() =>
                          act({
                            type: "inspect",
                            takeover: { kind: "document", id: d.id },
                          })
                        }
                      >
                        Ver versão anulada ↗
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              {
                <div className="fx-parties">
                  <h2 className="fx-sub">Intervenientes na guia</h2>
                  {
                    <button
                      className="fx-party"
                      data-ix="follow"
                      onClick={() =>
                        act({
                          type: "follow",
                          object: { kind: "driver", id: w.driver.id },
                        })
                      }
                      data-object={`driver:${w.driver.id}`}
                    >
                      <span>
                        <b>{w.driver.name}</b> <Id>{w.driver.id}</Id>
                      </span>
                      <small>
                        {issued
                          ? "Identidade igual ao snapshot"
                          : "Será fixado na emissão"}
                        {qual && (
                          <>
                            {" · "}
                            <Status
                              tone={
                                qual.state === "EXPIRED" ? "action" : "risk"
                              }
                            >
                              {qual.label}{" "}
                              {qual.state === "EXPIRED"
                                ? "caducado"
                                : `a caducar ${qual.until}`}
                            </Status>
                          </>
                        )}
                      </small>
                    </button>
                  }
                  {
                    <button
                      className="fx-party"
                      data-ix="follow"
                      onClick={() =>
                        act({
                          type: "follow",
                          object: { kind: "truck", id: w.truck.id },
                        })
                      }
                    >
                      <span>
                        <Plate small>{w.truck.plate}</Plate> reboque{" "}
                        <Id>{w.trailer?.plate ?? w.job.trailerId}</Id>
                      </span>
                      <small>
                        {!w.trailer
                          ? "Reboque inexistente — guia não pode ser emitida"
                          : issued
                            ? "Conjunto igual ao snapshot"
                            : "Será fixado na emissão"}
                      </small>
                    </button>
                  }
                </div>
              }
              <dl className="fx-facts fx-series">
                <div>
                  <dt>Série CMR 2026</dt>
                  <dd>próximo n.º 000413</dd>
                </div>
                <div>
                  <dt>Série FT 2026</dt>
                  <dd>próximo n.º 000231</dd>
                </div>
              </dl>
            </section>
          )}

          <section
            className="fx-snapshot"
            aria-label="Snapshot emitido e dados atuais"
          >
            <h2>
              {issued ? (
                <>
                  Snapshot emitido <span>vs</span> transporte atual
                </>
              ) : (
                "O que a guia vai fixar na emissão"
              )}
            </h2>
            {!issued && (
              <dl className="fx-facts">
                {diff.map((d) => (
                  <div key={d.field}>
                    <dt>{d.field}</dt>
                    <dd>{d.current}</dd>
                  </div>
                ))}
              </dl>
            )}
            {issued && (
              <table className="fx-diff">
                <thead>
                  <tr>
                    <th />
                    <th>
                      Emitido{" "}
                      <small>
                        {cmr.number} · {cmr.at} · rev.{" "}
                        {w.jobId === "J-4217" ? 5 : w.job.revision}
                      </small>
                    </th>
                    <th>
                      Atual <small>rev. {w.job.revision}</small>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map((d) => (
                    <tr
                      key={d.field}
                      data-changed={d.changed}
                      data-focused={
                        state.focus?.kind === "revision" &&
                        state.focus.field === d.field
                      }
                      onMouseEnter={() => d.changed && setHotEvent("09:05")}
                      onMouseLeave={() => setHotEvent(null)}
                    >
                      <th>
                        {d.changed ? (
                          <button
                            className="fx-inline"
                            data-ix="follow"
                            onClick={() =>
                              act({
                                type: "follow",
                                object: { kind: "revision", field: d.field },
                              })
                            }
                          >
                            {d.field} →
                          </button>
                        ) : d.field === "Destinatário" ? (
                          <button
                            className="fx-inline"
                            data-ix="follow"
                            onClick={() =>
                              act({
                                type: "follow",
                                object: {
                                  kind: "delivery",
                                  stop: w.job.stops.at(-1)!.id,
                                },
                              })
                            }
                          >
                            {d.field}
                          </button>
                        ) : (
                          d.field
                        )}
                      </th>
                      <td>{d.issued}</td>
                      <td>
                        {d.changed ? (
                          <span className="fx-delta">
                            <s>{d.issued}</s> → <b>{d.current}</b>
                          </span>
                        ) : (
                          <span className="fx-same">igual</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {diverging > 0 && (
              <p className="fx-diff-summary" data-object="cmr:diff">
                {diff
                  .filter((d) => d.changed)
                  .map(
                    (d) =>
                      `${d.field.toLowerCase()} ${d.issued} → ${d.current}`,
                  )
                  .join(" · ")}
                <em>
                  {" "}
                  ·{" "}
                  {w.jobId === "J-4217" && !reissued
                    ? "alterado às 09:05 (revisão 7)"
                    : "alterado depois da emissão"}
                </em>
              </p>
            )}
            {diverging > 0 && (
              <p className="fx-consequence" data-tone="risk">
                A guia em viagem declara {diff[0].issued} paletes. Para
                corresponder à carga, anular e reemitir cria uma nova guia com o
                número seguinte.{" "}
                {!reissuing && (
                  <button
                    className="fx-btn"
                    data-ix="propose"
                    onClick={() => act({ type: "stage-reissue", id: cmr.id })}
                  >
                    Preparar reemissão
                  </button>
                )}
              </p>
            )}
            <h2 className="fx-sub">Histórico</h2>
            <ol className="fx-events">
              {events.map((e) => (
                <li key={e.at + e.text} data-hot={hotEvent === e.at}>
                  <time>{e.at}</time>
                  <b>{e.text}</b>
                  <small>{e.detail}</small>
                </li>
              ))}
            </ol>
          </section>

          {!detail && (
            <section className="fx-paper-col" aria-label="Pré-visualização">
              <div className="fx-paper-head">
                <span>
                  {selected.title}{" "}
                  {selected.number && <Id>{selected.number}</Id>}
                </span>
                {!detail && selected.state === "ISSUED" && (
                  <button
                    data-ix="inspect"
                    className="fx-link"
                    onClick={() =>
                      act({
                        type: "inspect",
                        takeover: { kind: "document", id: selected.id },
                      })
                    }
                  >
                    Abrir documento ↗
                  </button>
                )}
              </div>
              <Paper item={selected} w={w} />
            </section>
          )}
        </div>
      )}
    </article>
  );
}

/** One numbered CMR box (numbering follows the production CMR renderer). */
function Box({
  n,
  label,
  children,
  wide,
}: {
  n: number;
  label: string;
  children?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="cmr-box" data-wide={!!wide}>
      <small>
        <i>{n}</i>
        {label}
      </small>
      {children ?? <span className="cmr-blank" />}
    </div>
  );
}

function Paper({ item, w }: { item: LedgerItem; w: LabWorld }) {
  const job = w.job;
  const first = job.stops[0];
  const last = job.stops.at(-1)!;
  if (item.state === "BLOCKED")
    return (
      <div className="fx-paper" data-empty>
        <p className="fx-paper-empty">
          <b>Fatura ainda não existe</b>
          <span>
            Só pode ser emitida depois da entrega final em {last.city}. Nada é
            pré-preenchido como se fosse fiscal.
          </span>
          <small>
            Série FT 2026 · próximo n.º 000231 reservado na emissão, não antes
          </small>
        </p>
      </div>
    );
  if (item.state === "MISSING" || item.state === "DRAFT")
    return (
      <div className="fx-paper" data-empty>
        <p className="fx-paper-empty">
          <b>
            {item.state === "MISSING"
              ? "Guia CMR em falta"
              : "Guia CMR ainda não emitida"}
          </b>
          <span>
            {item.reason}. Não existe documento para pré-visualizar até à
            emissão.
          </span>
          <small>
            Série CMR 2026 · próximo n.º 000413 reservado na emissão
          </small>
        </p>
      </div>
    );
  const voided = item.state === "VOID";
  const diff = snapshotDiff(w.jobId);
  const cargo = job.cargo.map((c) => c.description.toLowerCase()).join(" · ");
  const d = (t: string) => `06/10/2026 ${t}`;
  return (
    <div className="fx-paper fx-cmr" data-void={voided}>
      {voided && <span className="fx-paper-void">ANULADA</span>}
      <div className="cmr-meta">
        <span>
          Snapshot emitido {item.at} · revisão{" "}
          {w.jobId === "J-4217" ? 5 : job.revision} · imutável
        </span>
        <span>Origem LOCAL_USER</span>
      </div>
      <div className="cmr-title">
        <div>
          <b>CARTA DE PORTE (CMR)</b>
          <small>Convenção CMR · transporte rodoviário de mercadorias</small>
        </div>
        <span className="cmr-serial">
          N.º {item.number?.replace("CMR ", "")}
        </span>
      </div>
      <div className="cmr-carrier">
        <b>Transportes Atlântico, S.A.</b> · Rua do Porto 120 · 4470-123 Maia ·
        Portugal · NIF 500 000 000 · licença comunitária
      </div>
      <div className="cmr-grid">
        <Box n={1} label="Expedidor">
          <b>{job.client}</b>
          <span>
            {first.site} · {first.city}
          </span>
        </Box>
        <Box n={2} label="Destinatário">
          <b>{voided ? "Plataforma Maia" : last.site}</b>
          <span>{voided ? "Maia" : last.city} · Portugal</span>
        </Box>
        <Box n={3} label="Lugar previsto para entrega">
          <span>
            {job.stops
              .filter((st) => st.type !== "pickup")
              .map((st) => `${st.site}, ${st.city}`)
              .join(" · ")}
          </span>
        </Box>
        <Box n={4} label="Lugar e data da tomada a cargo">
          <span>
            {first.city} · {d(first.completedAt ?? first.window[0])}
          </span>
        </Box>
        <Box n={5} label="Documentos anexos">
          <span>
            Ref. {job.reference} · <Id>{job.id}</Id>
          </span>
        </Box>
        <Box n={6} label="N.º de volumes">
          <b>{diff[0].issued} paletes</b>
        </Box>
        <Box n={7} label="Designação da mercadoria" wide>
          <span>
            {cargo}
            {job.cargo.some((c) => c.adr) &&
              ` · ADR ${job.cargo.find((c) => c.adr)!.adr}`}
          </span>
        </Box>
        <Box n={9} label="Peso bruto (kg)">
          <b>{diff[1].issued.replace(" kg", "")}</b>
        </Box>
        <Box n={16} label="Transportador (viatura e motorista)" wide>
          <span>
            <Plate small>{w.truck.plate}</Plate> · semirreboque{" "}
            {w.trailer?.plate ?? "—"} · {w.driver.name}
          </span>
        </Box>
        <Box n={19} label="Lugar e data de emissão">
          <span>{first.city}, 06/10/2026</span>
        </Box>
        <Box n={20} label="Assinatura do expedidor" />
        <Box n={21} label="Assinatura do transportador" />
        <Box n={22} label="Entrega · assinatura do destinatário" />
      </div>
      <footer>
        Documento sintético do laboratório · sem validade · reimpressão lê
        apenas o snapshot
      </footer>
    </div>
  );
}
