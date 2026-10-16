import type { ReactNode } from "react";
import type { Honesty, Prov } from "../world";

/**
 * Provenance is typography, not badges. A value carries a quiet second line that
 * says where it came from and when; the honesty state changes the value's own
 * treatment (hatched unknown, faded stale, dotted simulated, italic assumed).
 */
export function Val({
  value,
  unit,
  prov,
  state = typeof prov === "object" ? prov.kind : "KNOWN",
  size = "m",
  label,
}: {
  value: ReactNode;
  unit?: string;
  prov?: Prov | string;
  state?: Honesty;
  size?: "s" | "m" | "l" | "xl";
  label?: string;
}) {
  const p = typeof prov === "string" ? prov : prov && provText(prov);
  return (
    <span className="fx-val" data-state={state} data-size={size}>
      {label && <span className="fx-val-label">{label}</span>}
      <span className="fx-val-main">
        {state === "UNKNOWN" ? <span className="fx-unknown">{value}</span> : value}
        {unit && <span className="fx-unit">{unit}</span>}
      </span>
      {p && (
        <span className="fx-prov">
          {state === "STALE" && <ClockGlyph />}
          {p}
        </span>
      )}
    </span>
  );
}
export function provText(p: Prov) {
  const head =
    p.kind === "ASSUMED"
      ? "assumido"
      : p.kind === "SIMULATED"
        ? "simulado"
        : p.kind === "STALE"
          ? "desatualizado"
          : p.kind === "UNKNOWN"
            ? "desconhecido"
            : p.kind === "UNCERTAIN"
              ? "incerto"
              : null;
  return [head, p.source, p.at].filter(Boolean).join(" · ");
}
export function ClockGlyph() {
  return (
    <svg className="fx-clock" viewBox="0 0 12 12" aria-hidden>
      <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 3.4V6l1.8 1.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
/** ✓ known satisfied · ✕ known not satisfied · ? missing. Never a colour alone. */
export function Tri({ outcome }: { outcome: "yes" | "no" | "unknown" }) {
  return (
    <span className="fx-tri" data-outcome={outcome} aria-label={outcome === "yes" ? "Confirmado" : outcome === "no" ? "Não se verifica" : "Desconhecido"}>
      {outcome === "yes" ? "✓" : outcome === "no" ? "✕" : "?"}
    </span>
  );
}
export type Tone = "ok" | "risk" | "action" | "blocker" | "unknown" | "neutral" | "info";
/** Status as a coloured word with a small mark; colour is never the only signal. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="fx-status" data-tone={tone}>
      <i aria-hidden />
      {children}
    </span>
  );
}
export function Plate({ children, small }: { children: ReactNode; small?: boolean }) {
  return (
    <span className="fx-plate" data-small={small}>
      <i aria-hidden>P</i>
      {children}
    </span>
  );
}
export function Id({ children }: { children: ReactNode }) {
  return <span className="fx-id">{children}</span>;
}
export function Num({ children }: { children: ReactNode }) {
  return <span className="fx-num">{children}</span>;
}
/** Legal / source citations read as references, not prose. */
export function Ref({ children }: { children: ReactNode }) {
  return <span className="fx-ref">{children}</span>;
}
export function Sim({ children }: { children: ReactNode }) {
  return (
    <span className="fx-sim" title="Valor simulado — não é uma leitura real">
      {children}
    </span>
  );
}
