import type { LabSurface } from "./labSurfaces";
import { ParameterControl } from "./ParameterControl";
import type { WorkspaceAllocation } from "./workspaceGeometry";

const FIELDS = [
  { key: "demand", label: "Procura", min: 0, max: 100, scale: 100, unit: "%" },
  {
    key: "prominence",
    label: "Proeminência",
    min: 0,
    max: 100,
    scale: 100,
    unit: "%",
  },
  {
    key: "priority",
    label: "Prioridade",
    min: 0,
    max: 100,
    scale: 1,
    unit: "",
  },
  {
    key: "width",
    label: "Largura preferida",
    min: 16,
    max: 100,
    scale: 100,
    unit: "%",
  },
  {
    key: "height",
    label: "Altura preferida",
    min: 16,
    max: 100,
    scale: 100,
    unit: "%",
  },
  { key: "x", label: "Posição X", min: 0, max: 100, scale: 100, unit: "%" },
  { key: "y", label: "Posição Y", min: 0, max: 100, scale: 100, unit: "%" },
] as const;
export function WorkspaceTools({
  surfaces,
  allocation,
  diagnostics,
  selected,
  cycle,
  onPatchSurface,
  onDiagnostics,
  onSelected,
  onRandom,
  onCycle,
  onRestore,
  onFullMap,
  onRemoveSurfaces,
}: {
  surfaces: LabSurface[];
  allocation: WorkspaceAllocation;
  diagnostics: boolean;
  selected: string;
  cycle: "stress" | "random" | null;
  onPatchSurface(id: string, patch: Partial<LabSurface>): void;
  onDiagnostics(value: boolean): void;
  onSelected(value: string): void;
  onRandom(): void;
  onCycle(value: "stress" | "random" | null): void;
  onRestore(): void;
  onFullMap(): void;
  onRemoveSurfaces(): void;
}) {
  const chosen = allocation.surfaces.find((s) => s.id === selected);
  return (
    <>
      <div
        className="environment-dev-actions"
        role="group"
        aria-label="DEV · Composition"
      >
        <button type="button" onClick={onFullMap}>
          Mapa 100×100
        </button>
        <button type="button" onClick={onRandom}>
          Aleatório
        </button>
        <button
          type="button"
          aria-pressed={cycle === "random"}
          onClick={() => onCycle("random")}
        >
          Ciclo aleatório
        </button>
        <button
          type="button"
          aria-pressed={cycle === "stress"}
          onClick={() => onCycle("stress")}
        >
          Ciclo de stress
        </button>
        <button type="button" disabled={!cycle} onClick={() => onCycle(null)}>
          Parar
        </button>
        <button type="button" onClick={onRemoveSurfaces}>
          Remover superfícies
        </button>
        <button type="button" onClick={onRestore}>
          Restaurar base
        </button>
      </div>
      <details className="environment-spatial-tools">
        <summary>Diagnóstico espacial</summary>
        <label className="environment-toggle">
          <input
            type="checkbox"
            checked={diagnostics}
            onChange={(e) => onDiagnostics(e.target.checked)}
          />
          Mostrar geometria espacial
        </label>
        <label className="environment-select">
          Alocação
          <select
            aria-label="Alocação em diagnóstico"
            value={selected}
            onChange={(e) => onSelected(e.target.value)}
          >
            {["map", ...surfaces.map((s) => s.id)].map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <dl className="environment-spatial-ledger">
          <dt>Viewport</dt>
          <dd>
            {Math.round(allocation.viewportBounds.width)} ×{" "}
            {Math.round(allocation.viewportBounds.height)}
          </dd>
          <dt>Workspace utilizável</dt>
          <dd>
            {Math.round(allocation.usableWorkspaceBounds.width)} ×{" "}
            {Math.round(allocation.usableWorkspaceBounds.height)}
          </dd>
          <dt>Utilização</dt>
          <dd>{(allocation.utilizationRatio * 100).toFixed(1)}%</dd>
          <dt>Área livre</dt>
          <dd>{Math.round(allocation.area.free).toLocaleString()} px²</dd>
          <dt>Vazio intencional</dt>
          <dd>
            {Math.round(allocation.area.intentional).toLocaleString()} px²
          </dd>
          <dt>Candidatos livres</dt>
          <dd>{allocation.availableRegions.length}</dd>
          <dt>{selected}</dt>
          <dd>{chosen?.status ?? "inactive"}</dd>
        </dl>
        <p className="environment-spatial-rule">
          Gutter ≥ {allocation.design.minimumGutter}px · até{" "}
          {allocation.design.maximumProminentSurfaces} superfícies proeminentes.
          A procura interpola mínimo → preferido → máximo.
        </p>
        <ul className="environment-candidate-reasons">
          {chosen?.candidates.slice(0, 8).map((candidate, index) => (
            <li key={index}>
              {Math.round(candidate.region.width)} ×{" "}
              {Math.round(candidate.region.height)} ·{" "}
              {candidate.reasons.join(", ") ||
                `score ${candidate.score.toFixed(2)}`}
            </li>
          ))}
        </ul>
        <div className="environment-spatial-legend">
          Chrome protegido · Ocupação · Candidatos livres · Gutters / espaço
          intencional · Candidato selecionado
        </div>
      </details>
      {surfaces.map((surface) => {
        const result = allocation.surfaces.find((s) => s.id === surface.id);
        return (
          <details className="environment-abstract-controls" key={surface.id}>
            <summary>
              {surface.id} · {surface.enabled ? result?.status : "inactive"}
            </summary>
            <label className="environment-toggle">
              <input
                type="checkbox"
                aria-label={`Ativar ${surface.id}`}
                checked={surface.enabled}
                onChange={(e) =>
                  onPatchSurface(surface.id, { enabled: e.target.checked })
                }
              />
              Ativar {surface.id}
            </label>
            <label className="environment-select">
              Estado
              <select
                aria-label={`${surface.id} estado`}
                value={surface.state}
                onChange={(e) =>
                  onPatchSurface(surface.id, {
                    state: e.target.value as LabSurface["state"],
                  })
                }
              >
                <option value="active">Ativa</option>
                <option value="suspended">Suspensa</option>
                <option value="hidden">Oculta</option>
              </select>
            </label>
            {FIELDS.map((field) => (
              <ParameterControl
                key={field.key}
                parameter={{
                  ...field,
                  key: `${surface.id}-${field.key}`,
                  label: `${surface.id} ${field.label}`,
                  step: 1,
                }}
                value={surface[field.key]}
                onChange={(value) =>
                  onPatchSurface(surface.id, { [field.key]: value })
                }
              />
            ))}
            <label className="environment-select">
              Afinidade
              <select
                aria-label={`${surface.id} afinidade`}
                value={surface.affinity}
                onChange={(e) =>
                  onPatchSurface(surface.id, {
                    affinity: e.target.value as LabSurface["affinity"],
                  })
                }
              >
                <option value="balanced">Livre / equilibrada</option>
                <option value="near">Próxima do contexto</option>
                <option value="away">Afastada do contexto</option>
                <option value="edge">Próxima de uma borda</option>
              </select>
            </label>
            <label className="environment-toggle">
              <input
                type="checkbox"
                aria-label={`${surface.id} mesmo grupo`}
                checked={surface.grouped}
                onChange={(e) =>
                  onPatchSurface(surface.id, { grouped: e.target.checked })
                }
              />
              Mesmo grupo abstrato
            </label>
            <p className="environment-spatial-rule">
              Mínimo 220 × 160 · largura útil máxima 1000px para apoio; uma
              superfície proeminente pode usar todo o workspace.
            </p>
          </details>
        );
      })}
    </>
  );
}
