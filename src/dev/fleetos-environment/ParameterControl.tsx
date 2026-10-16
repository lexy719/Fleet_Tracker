import { useEffect, useRef, useState } from "react";
import type { ParameterDefinition } from "./composition";
export function ParameterControl({
  parameter,
  value,
  onChange,
}: {
  parameter: Omit<ParameterDefinition, "key"> & { key: string };
  value: number;
  onChange: (value: number) => void;
}) {
  const displayed = Math.round(value * parameter.scale * 100) / 100;
  const controlId = `parameter-${parameter.key.replace(/[^a-z0-9-]/gi, "-")}`;
  const [draft, setDraft] = useState(String(displayed));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(String(displayed));
  }, [displayed]);
  function commit() {
    editing.current = false;
    const number = draft.trim() ? Number(draft) : displayed;
    const bounded = Math.max(
      parameter.min,
      Math.min(parameter.max, Number.isFinite(number) ? number : displayed),
    );
    onChange(bounded / parameter.scale);
    setDraft(String(bounded));
  }
  return (
    <div className="environment-parameter">
      <label htmlFor={controlId}>
        {parameter.label}
        <span>{parameter.unit}</span>
      </label>
      <input
        type="number"
        aria-label={parameter.label}
        min={parameter.min}
        max={parameter.max}
        step={parameter.step}
        value={draft}
        onFocus={() => {
          editing.current = true;
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = Number(e.target.value);
          if (e.target.value && next >= parameter.min && next <= parameter.max)
            onChange(next / parameter.scale);
        }}
      />
      <input
        id={controlId}
        type="range"
        aria-label={`${parameter.label} — slider`}
        min={parameter.min}
        max={parameter.max}
        step={parameter.step}
        value={displayed}
        onChange={(e) => onChange(Number(e.target.value) / parameter.scale)}
      />
    </div>
  );
}
