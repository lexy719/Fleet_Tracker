import type { GuidedAction } from "../guidedWorkspace";
import type { DiffRow, LedgerItem } from "../world";
import type { LabWorld } from "./model";
import { Status, Id } from "./honesty";

type Props = {
  w: LabWorld;
  act: (action: GuidedAction) => void;
  cmr: LedgerItem;
  diff: DiffRow[];
  events: { at: string; text: string; detail: string }[];
  facet: "diff" | "history" | "issue";
  reissuing: boolean;
};
const openDocument = (id: string): GuidedAction => ({
  type: "inspect",
  takeover: { kind: "document", id },
});

/** Each documentary question has its own work: resolve differences, trace
 * versions, or prepare an issuance. Issued records are never editable fields. */
export function DocumentWork({
  w,
  act,
  cmr,
  diff,
  events,
  facet,
  reissuing,
}: Props) {
  const changes = diff.filter((row) => row.changed);
  const issued = cmr.state === "ISSUED";
  const source = (field: string): GuidedAction =>
    field === "Motorista"
      ? { type: "follow", object: { kind: "driver", id: w.driver.id } }
      : field === "Reboque" && w.trailer
        ? { type: "follow", object: { kind: "trailer", id: w.trailer.id } }
        : field === "Destinatário"
          ? {
              type: "follow",
              object: { kind: "delivery", stop: w.job.stops.at(-1)!.id },
            }
          : { type: "follow", object: { kind: "revision", field } };
  const prepare = () =>
    act(
      issued
        ? { type: "stage-reissue", id: cmr.id }
        : { type: "edit", kind: "issue", target: cmr.id },
    );
  if (facet === "history")
    return (
      <section className="dw-history" data-document-work="history">
        <div className="dw-version-register">
          <h2>Versões do transporte</h2>
          {w.ledger
            .filter((item) => item.type === "CMR")
            .map((item) => (
              <article key={item.id} data-state={item.state}>
                <small>
                  {item.state === "VOID"
                    ? "Versão anulada"
                    : item.state === "ISSUED"
                      ? "Versão emitida"
                      : "Emissão pendente"}
                </small>
                <h3>{item.number ?? "Ainda sem número"}</h3>
                <p>{item.at ? `Registo às ${item.at}` : item.reason}</p>
                {item.state === "VOID" && <small>{item.reason}</small>}
                {item.state === "ISSUED" || item.state === "VOID" ? (
                  <button
                    className="fx-link"
                    data-ix="inspect"
                    onClick={() => act(openDocument(item.id))}
                  >
                    Abrir esta versão →
                  </button>
                ) : (
                  <button
                    className="fx-link"
                    data-ix="edit"
                    onClick={() =>
                      act({ type: "edit", kind: "issue", target: item.id })
                    }
                  >
                    Rever antes de emitir →
                  </button>
                )}
              </article>
            ))}
        </div>
        <div className="dw-event-trace">
          <h2>O que mudou e onde rever</h2>
          <ol>
            {events.map((event, index) => {
              const document = w.ledger.find(
                (item) => item.number && event.text.includes(item.number),
              );
              const cargoChange = event.text === "Carga editada";
              return (
                <li key={`${event.at}-${index}`}>
                  <time>{event.at}</time>
                  <div>
                    <h3>{event.text}</h3>
                    <p>{event.detail}</p>
                    <button
                      className="fx-link"
                      data-ix={document ? "inspect" : "follow"}
                      onClick={() =>
                        act(
                          document
                            ? openDocument(document.id)
                            : cargoChange
                              ? source("Paletes")
                              : {
                                  type: "follow",
                                  object: { kind: "job", id: w.jobId },
                                },
                        )
                      }
                    >
                      {document
                        ? "Ver o registo desta versão"
                        : cargoChange
                          ? "Rever a carga que mudou"
                          : "Abrir o trabalho relacionado"}{" "}
                      →
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="fx-footnote">
            Eventos disponíveis no cenário. Não substituem o histórico completo
            de revisões de produção.
          </p>
        </div>
      </section>
    );

  return (
    <section className="dw-review" data-document-work={facet}>
      <div
        className="dw-review-status"
        data-tone={!issued ? "unknown" : changes.length ? "risk" : "ok"}
      >
        <div>
          <small>
            {issued
              ? "Guia emitida / trabalho atual"
              : "Preparação / trabalho atual"}
          </small>
          <h2>
            {!issued
              ? "Ainda não há um snapshot emitido"
              : changes.length
                ? `${changes.length} campos precisam de revisão`
                : "Os campos comparados correspondem"}
          </h2>
          <p>
            {!issued
              ? "Rever carga, destinatário e conjunto antes de preparar a emissão."
              : changes.length
                ? "O registo emitido conserva os valores anteriores. Rever a origem de cada mudança antes de propor outra versão."
                : "Esta comparação não confirma os restantes requisitos de execução do transporte."}
          </p>
        </div>
        {issued && (
          <button
            className="fx-link"
            data-ix="inspect"
            onClick={() => act(openDocument(cmr.id))}
          >
            Abrir guia <Id>{cmr.number}</Id> →
          </button>
        )}
      </div>
      <div
        className="dw-field-register"
        aria-label="Campos documentais e origem das alterações"
      >
        {(issued
          ? [...changes, ...diff.filter((row) => !row.changed)]
          : diff
        ).map((row) => (
          <article key={row.field} data-changed={issued && row.changed}>
            <div>
              <h3>{row.field}</h3>
              <Status tone={!issued ? "neutral" : row.changed ? "risk" : "ok"}>
                {!issued
                  ? "A fixar na emissão"
                  : row.changed
                    ? "Diferente"
                    : "Corresponde"}
              </Status>
            </div>
            <dl>
              {issued && (
                <div>
                  <dt>Declarado na guia</dt>
                  <dd>{row.issued}</dd>
                </div>
              )}
              <div>
                <dt>Trabalho atual</dt>
                <dd>{row.current}</dd>
              </div>
            </dl>
            <button
              className="fx-link"
              data-ix="follow"
              onClick={() => act(source(row.field))}
            >
              Rever {row.field.toLowerCase()} no trabalho →
            </button>
          </article>
        ))}
      </div>
      <div className="dw-next-decision">
        <h2>{issued ? "Decidir a próxima versão" : "Preparar a guia"}</h2>
        <p>
          {issued
            ? changes.length
              ? "Uma reemissão cria outra versão e conserva o registo anterior. A pré-visualização mostra as consequências antes da confirmação."
              : "Não há diferenças nestes campos. A guia atual permanece disponível para consulta."
            : "A preparação verifica os dados deste transporte. Impedimentos continuam explícitos; abrir esta ação não emite o documento."}
        </p>
        {(!issued || changes.length > 0) && !reissuing && (
          <button
            className="fx-btn"
            data-kind="primary"
            data-ix={issued ? "propose" : "edit"}
            onClick={prepare}
          >
            {issued
              ? "Pré-visualizar reemissão"
              : "Rever requisitos da emissão"}
          </button>
        )}
        {reissuing && (
          <Status tone="risk">
            Reemissão em pré-visualização · confirmar ou descartar na proposta
          </Status>
        )}
      </div>
    </section>
  );
}
