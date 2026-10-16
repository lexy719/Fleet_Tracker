import type { ReactNode } from "react";
import { ParameterControl } from "./ParameterControl";
import {
  LAB_INTENTS,
  PARAMETER_GROUPS,
  type CompositionVariables,
  type NumericVariable,
  type SemanticIntent,
} from "./composition";

export function CompositionExplorer({
  open,
  values,
  intent,
  reducedMotion,
  reference,
  onClose,
  onNumericChange,
  onPatch,
  onIntent,
  onReducedMotion,
  onReference,
  onFit,
  onResetCamera,
  children,
  mapAvailable,
}: {
  children?: ReactNode;
  mapAvailable: boolean;
  open: boolean;
  values: CompositionVariables;
  intent: SemanticIntent;
  reducedMotion: boolean;
  reference: boolean;
  onClose(): void;
  onNumericChange(key: NumericVariable, value: number): void;
  onPatch(patch: Partial<CompositionVariables>): void;
  onIntent(intent: SemanticIntent): void;
  onReducedMotion(value: boolean): void;
  onReference(value: boolean): void;
  onFit(): void;
  onResetCamera(): void;
}) {
  return (
    <aside
      className="environment-explorer"
      aria-label="Explorador de composição DEV"
      aria-hidden={!open}
      inert={!open}
      data-open={open}
    >
      <div className="environment-explorer-heading">
        <div>
          <strong>Composition explorer</strong>
          <span>DEV · valores contínuos</span>
        </div>
        <button type="button" aria-label="Fechar explorador" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="environment-explorer-body">
        <label className="environment-select">
          Intenção
          <select
            aria-label="Intenção de composição"
            value={intent}
            onChange={(e) => onIntent(e.target.value as SemanticIntent)}
          >
            {LAB_INTENTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="environment-toggle">
          <input
            type="checkbox"
            checked={values.visible}
            onChange={(e) => onPatch({ visible: e.target.checked })}
          />{" "}
          Mostrar mapa
        </label>
        {children}
        {PARAMETER_GROUPS.map((group) => (
          <details key={group.label} open>
            <summary>{group.label}</summary>
            {group.parameters.map((parameter) => (
              <ParameterControl
                key={parameter.key}
                parameter={parameter}
                value={values[parameter.key]}
                onChange={(value) => onNumericChange(parameter.key, value)}
              />
            ))}
          </details>
        ))}
        <label className="environment-select">
          Easing
          <select
            aria-label="Easing da transição"
            value={values.easing}
            onChange={(e) =>
              onPatch({
                easing: e.target.value as CompositionVariables["easing"],
              })
            }
          >
            <option value="controlled">Controlled</option>
            <option value="snappy">Snappy</option>
            <option value="gentle">Gentle</option>
            <option value="linear">Linear</option>
          </select>
        </label>
        <label className="environment-toggle">
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => onReducedMotion(e.target.checked)}
          />{" "}
          Reduzir movimento
        </label>
        <label className="environment-toggle">
          <input
            type="checkbox"
            checked={reference}
            onChange={(e) => onReference(e.target.checked)}
          />{" "}
          Referência geométrica
        </label>
        <div className="environment-explorer-camera">
          <button type="button" disabled={!mapAvailable} onClick={onFit}>
            Enquadrar referência
          </button>
          <button
            type="button"
            disabled={!mapAvailable}
            onClick={onResetCamera}
          >
            Repor câmara
          </button>
        </div>
      </div>
    </aside>
  );
}
