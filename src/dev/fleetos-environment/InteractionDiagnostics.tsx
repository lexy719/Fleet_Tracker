import { useState } from "react";
import type { GuidedState, GuidedAction } from "./guidedWorkspace";
import {
  GROUP_RULES,
  PAIR_OVERRIDES,
  INTERACTION_GRAPH,
} from "./interactionGraph";
export type InteractionEvidence = {
  support: number;
  lead: number;
  screenshot: string | null;
  returned: boolean;
};
export type Coverage = Record<string, InteractionEvidence>;
export function InteractionDiagnostics({
  state,
  act,
  coverage,
  record,
  close,
}: {
  state: GuidedState;
  act: (action: GuidedAction) => void;
  coverage: Coverage;
  record: (key: string, file: string) => void;
  close: () => void;
}) {
  const [key, setKey] = useState("Drivers>Documents");
  const [file, setFile] = useState("");
  return (
    <section
      className="gw-graph"
      aria-label="Matriz de transições DEV"
      role="dialog"
    >
      <header>
        <div>
          <small>DEV · evidência desta sessão</small>
          <h2>Interaction Graph</h2>
        </div>
        <button onClick={close} aria-label="Fechar matriz DEV">
          Fechar
        </button>
      </header>
      <p>
        Contrato é arquitetura. Exercício regista ações reais nesta sessão.
        Captura exige associar um ficheiro depois de o guardar. Regresso só
        passa após comparar o frame restaurado.
      </p>
      <p>
        <strong>{Object.keys(PAIR_OVERRIDES).length} overrides</strong> ·{" "}
        {
          INTERACTION_GRAPH.filter((e) => e.classification !== "overridden")
            .length
        }{" "}
        relações herdadas/genéricas · {Object.keys(GROUP_RULES).length} grupos
        semânticos / 16 relações reutilizáveis.
      </p>
      <details>
        <summary>Regras de grupo e invalidação DEV</summary>
        <p>
          Fonte e destino herdam participação da lente, relação com a âncora e
          regra entre grupos. Só quatro relações têm especialização por par.
        </p>
        <label>
          Job do cenário{" "}
          <select
            aria-label="Alterar âncora DEV"
            value={state.anchor.kind === "job" ? state.anchor.id : ""}
            onChange={(e) => act({ type: "job", id: e.target.value })}
          >
            <option value="" disabled>
              Selecionar Job
            </option>
            <option value="J-4217">J-4217 · Porto–Madrid</option>
            <option value="J-4218">J-4218 · Lisboa–Sevilha</option>
          </select>
        </label>
        <button onClick={() => act({ type: "resource", id: "D-99" })}>
          Selecionar recurso não relacionado DEV
        </button>
        <button onClick={() => act({ type: "restriction", id: "RI-999" })}>
          Selecionar restrição incompatível DEV
        </button>
        <ol>
          {state.selectionLog.map((entry, i) => (
            <li key={i}>
              {entry.key} / {entry.id}:{" "}
              <strong>{entry.outcome === "kept" ? "mantida" : "limpa"}</strong>{" "}
              porque {entry.reason}
            </li>
          ))}
        </ol>
      </details>
      <table>
        <thead>
          <tr>
            <th>De → Para</th>
            <th>Contrato</th>
            <th>Browser</th>
            <th>Captura</th>
            <th>Regresso</th>
          </tr>
        </thead>
        <tbody>
          {INTERACTION_GRAPH.map((edge) => {
            const id = `${edge.from}>${edge.to}`,
              e = coverage[id];
            return (
              <tr key={id}>
                <th>
                  {edge.from} → {edge.to}
                </th>
                <td title={`${edge.derivedFrom}: ${edge.relevant}`}>
                  {edge.classification}
                </td>
                <td>
                  {e ? `Apoio ${e.support} · Lead ${e.lead}` : "Por exercer"}
                </td>
                <td title={e?.screenshot ?? "Sem ficheiro associado"}>
                  {e?.screenshot ? "Associada" : "Por captar"}
                </td>
                <td>{e?.returned ? "Verificado" : "Por verificar"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (file.trim() && coverage[key]) record(key, file.trim());
        }}
      >
        <label>
          Transição
          <select
            aria-label="Transição com captura"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          >
            {INTERACTION_GRAPH.map((e) => (
              <option key={`${e.from}>${e.to}`} value={`${e.from}>${e.to}`}>
                {e.from} → {e.to}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ficheiro guardado
          <input
            aria-label="Ficheiro de captura DEV"
            value={file}
            onChange={(e) => setFile(e.target.value)}
            placeholder="FleetOS-5.7G-....jpg"
          />
        </label>
        <button disabled={!coverage[key] || !file.trim()}>
          Associar captura DEV
        </button>
      </form>
    </section>
  );
}
