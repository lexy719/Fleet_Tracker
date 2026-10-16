import { useEffect, useRef, useState } from "react";
import {
  dataShape,
  DOMAIN_LIBRARY,
  type UserIntent,
} from "./representationLibrary";
import type { StressReport } from "./synthesisStress";
import { DOMAINS } from "./livingEnvironment";
import {
  MAP_MODES,
  type Actor,
  type MapMode,
  type Representation,
  type RepresentationComposition,
  type TopologyOperation,
} from "./representationEngine";
export function TopologyTools({
  composition,
  onOperation,
  solverMs,
}: {
  composition: RepresentationComposition;
  onOperation(operation: TopologyOperation): void;
  solverMs: number;
}) {
  const [actor, setActor] = useState<Actor>("Jobs"),
    [related, setRelated] = useState<Actor>("Fuel");
  const worker = useRef<Worker | null>(null),
    [progress, setProgress] = useState(0),
    [running, setRunning] = useState(false),
    [report, setReport] = useState<StressReport | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  function runStress() {
    worker.current?.terminate();
    setProgress(0);
    setReport(null);
    setRunning(true);
    const next = new Worker(new URL("./synthesis.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = next;
    next.onmessage = (
      event: MessageEvent<{ done?: number; report?: StressReport }>,
    ) => {
      if (event.data.report) {
        setReport(event.data.report);
        setRunning(false);
        next.terminate();
      } else setProgress(event.data.done ?? 0);
    };
    next.onerror = () => {
      setRunning(false);
      next.terminate();
    };
    next.postMessage(1024);
  }
  const actors = ["map", ...DOMAINS] as Actor[];
  const decision = composition.representations.find((d) => d.actor === actor);
  return (
    <details className="environment-topology-tools" open>
      <summary>Representation + topology · DEV</summary>
      <label className="environment-select">
        Intenção semântica
        <select
          aria-label="Intenção semântica"
          value={composition.topology.intent ?? "overview"}
          onChange={(e) =>
            onOperation({
              type: "INTENT",
              intent: e.target.value as UserIntent,
            })
          }
        >
          {[
            "overview",
            "dispatch",
            "inspect",
            "compare",
            "relations",
            "monitor",
          ].map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
      </label>
      <label className="environment-select">
        Contexto
        <select
          aria-label="Ator da topologia"
          value={actor}
          onChange={(e) => setActor(e.target.value as Actor)}
        >
          {actors.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className="environment-select">
        Relacionado
        <select
          aria-label="Ator relacionado"
          value={related}
          onChange={(e) => setRelated(e.target.value as Actor)}
        >
          {actors.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <div
        className="environment-dev-actions"
        role="group"
        aria-label="Operações de topologia"
      >
        <button onClick={() => onOperation({ type: "PROMOTE", actor })}>
          Promover
        </button>
        <button onClick={() => onOperation({ type: "DEMOTE", actor })}>
          Reduzir
        </button>
        <button
          onClick={() => onOperation({ type: "SWAP", a: actor, b: related })}
        >
          Trocar papéis
        </button>
        <button
          onClick={() =>
            onOperation({ type: "MERGE", actors: [actor, related] })
          }
        >
          Fundir
        </button>
        <button onClick={() => onOperation({ type: "SPLIT", actor })}>
          Separar
        </button>
        <button onClick={() => onOperation({ type: "TAKEOVER", actor })}>
          Takeover
        </button>
        <button onClick={() => onOperation({ type: "SUSPEND", actor })}>
          Suspender
        </button>
        <button onClick={() => onOperation({ type: "STRIP" })}>Bandas</button>
        <button onClick={() => onOperation({ type: "STACK" })}>Vertical</button>
        <button onClick={() => onOperation({ type: "CLUSTER" })}>
          Cluster
        </button>
      </div>
      {actor !== "map" && (
        <>
          <label className="environment-select">
            Biblioteca de {actor} · 15 famílias
            <select
              aria-label="Família de representação"
              value={decision?.form ?? "auto"}
              onChange={(e) =>
                onOperation({
                  type: "MORPH",
                  actor,
                  form: e.target.value as Representation,
                })
              }
            >
              <option value="auto" disabled>
                Escolha autónoma
              </option>
              {DOMAIN_LIBRARY[actor].map((family, i) => (
                <option key={family.id} value={family.form}>
                  {String(i + 1).padStart(2, "0")} · {family.title}
                </option>
              ))}
            </select>
          </label>
          <label className="environment-select">
            Itens sintéticos
            <input
              aria-label="Itens sintéticos"
              type="number"
              min="0"
              max="60"
              value={
                dataShape(actor, composition.topology.facts?.[actor]).count
              }
              onChange={(e) =>
                onOperation({
                  type: "DATA_SHAPE",
                  actor,
                  values: {
                    count: Math.max(0, Math.min(60, Number(e.target.value))),
                  },
                })
              }
            />
          </label>
          {(["urgency", "detail", "mapRelevance"] as const).map((key) => (
            <label className="environment-select" key={key}>
              {key}
              <input
                aria-label={`Dados ${key}`}
                type="range"
                min="0"
                max="1"
                step=".05"
                value={
                  dataShape(actor, composition.topology.facts?.[actor])[key]
                }
                onChange={(e) =>
                  onOperation({
                    type: "DATA_SHAPE",
                    actor,
                    values: { [key]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
          <label>
            <input
              aria-label="Entidade selecionada"
              type="checkbox"
              checked={Boolean(
                dataShape(actor, composition.topology.facts?.[actor]).selected,
              )}
              onChange={(e) =>
                onOperation({
                  type: "DATA_SHAPE",
                  actor,
                  values: {
                    selected: e.target.checked ? `DEMO-${actor[0]}01` : null,
                  },
                })
              }
            />{" "}
            Entidade selecionada
          </label>
        </>
      )}
      <label className="environment-select">
        Mapa
        <select
          aria-label="Representação do mapa"
          value={composition.topology.mapMode}
          onChange={(e) =>
            onOperation({ type: "MAP_MODE", mode: e.target.value as MapMode })
          }
        >
          {MAP_MODES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <div className="environment-dev-actions">
        <button onClick={() => onOperation({ type: "MAP_FOCUS" })}>
          Foco mapa
        </button>
        <button onClick={() => onOperation({ type: "CONTENT_FOCUS", actor })}>
          Foco conteúdo
        </button>
        <button onClick={() => onOperation({ type: "CONTEXTUALIZE", actor })}>
          Contextualizar
        </button>
        <button onClick={() => onOperation({ type: "RESTORE", actor })}>
          Restaurar ator
        </button>
      </div>
      <section
        className="environment-liquid-tools"
        aria-label="Diagnóstico autónomo"
      >
        <div className="environment-liquid-metrics">
          <b>
            {composition.synthesis?.generated} / {composition.synthesis?.budget}{" "}
            candidatos · {solverMs.toFixed(1)} ms
          </b>
          <p>
            Vencedor #{composition.synthesis?.winner} ·{" "}
            {composition.synthesis?.rejected} inválidos
          </p>
          <ul>
            {composition.synthesis?.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <details>
            <summary>Pontuações e rejeições</summary>
            {composition.synthesis?.candidates.map((c) => (
              <p key={c.id}>
                #{c.id}: {c.score.toFixed(2)} ·{" "}
                {c.accepted ? "válido" : c.rejection.join(", ")} · grid{" "}
                {c.terms.ghostGrid.toFixed(2)} · simetria{" "}
                {c.terms.symmetry.toFixed(2)}
              </p>
            ))}
          </details>
        </div>
        <button onClick={runStress} disabled={running}>
          Stress semântico · 1024
        </button>
        {running && (
          <>
            <output>{progress} / 1024</output>
            <button
              onClick={() => {
                worker.current?.terminate();
                setRunning(false);
              }}
            >
              Parar pesquisa
            </button>
          </>
        )}
        {report && (
          <output
            className="environment-liquid-metrics"
            aria-label="Diversidade do motor"
            data-synthesis-stress={JSON.stringify(report)}
          >
            {report.topologies} topologias · {report.geometries} geometrias ·{" "}
            {report.representations} combinações de representações. Repetição{" "}
            {(report.repeatedLayoutRate * 100).toFixed(1)}%. Mesmos contextos:{" "}
            {report.sameSetTopologies} topologias. p95{" "}
            {report.solverMs.p95.toFixed(1)} ms · {report.invalidWinners}{" "}
            inválidos.
          </output>
        )}
      </section>
      <p className="environment-spatial-rule">
        {Math.round(composition.utilizationRatio * 100)}% ocupado ·{" "}
        {Math.round(composition.accidentalFreeRatio * 100)}% disponível além da
        margem de respiro. As famílias são gramáticas de conteúdo. A pesquisa é
        determinística e limitada.
      </p>
      <div className="environment-representation-ledger">
        {composition.representations.map((d) => (
          <span key={d.actor}>
            <b>{d.actor}</b> {d.role.toLowerCase()} / {d.form}
          </span>
        ))}
      </div>
    </details>
  );
}
