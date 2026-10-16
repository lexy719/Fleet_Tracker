import { ArrowLeft } from "lucide-react";
import { DOMAINS, type Domain } from "./livingEnvironment";
import type { Actor } from "./representationEngine";
export function FocusControls({
  focus,
  depth,
  primary,
  onBack,
  onFocus,
}: {
  focus: Domain | null;
  depth: number;
  primary?: Actor;
  onBack(): void;
  onFocus(domain: Domain): void;
}) {
  return (
    <div className="environment-focus-controls" aria-label="Foco sintético">
      <button
        type="button"
        onClick={onBack}
        aria-label="Voltar ao contexto anterior"
      >
        <ArrowLeft size={14} />
        <span>Esc</span>
      </button>
      <div>
        <strong>
          {primary
            ? `${primary === "map" ? "Mapa" : primary}${focus ? ` · ${focus}${focus === "Fuel" ? " / Stop 3" : " focus"}` : " · composição"}`
            : `${focus ?? "Workspace"} focus`}
        </strong>
        <span>DEV · geometria sintética · nível {depth}</span>
      </div>
      <select
        aria-label="Explorar outro foco"
        value={focus ?? ""}
        onChange={(e) => onFocus(e.target.value as Domain)}
      >
        {!focus && (
          <option value="" disabled>
            Explorar foco
          </option>
        )}
        {DOMAINS.map((domain) => (
          <option key={domain} value={domain}>
            {domain}
          </option>
        ))}
      </select>
    </div>
  );
}
