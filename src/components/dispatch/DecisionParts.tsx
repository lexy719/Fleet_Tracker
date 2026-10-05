import clsx from "clsx";
import { AlertTriangle, Check, ChevronRight, CircleHelp, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { WindowStatus } from "../../regulations/deliveryWindow";
import type { ComplianceStatus } from "../../regulations/types";
import type { StrategyOutcome } from "../../solver/types";
import { toneVars, type Tone } from "../../ui/status";

/*
 * Presentation pieces of the Dispatch decision column. No routing / regulatory logic here:
 * every value is computed by the planner and only rendered.
 */

/** Verdict vocabulary shared with the future Phase 6 resource checks. */
export type CheckVerdict = "OK" | "BLOCKS" | "RISK" | "UNKNOWN";
const VERDICT: Record<CheckVerdict, { tone: Tone; Icon: typeof Check; label: string }> = {
  OK: { tone: "ok", Icon: Check, label: "OK" },
  BLOCKS: { tone: "danger", Icon: X, label: "Bloqueia" },
  RISK: { tone: "warn", Icon: AlertTriangle, label: "Atenção" },
  UNKNOWN: { tone: "neutral", Icon: CircleHelp, label: "Desconhecido" },
};

export function Step({ n, title, aside, children, className }: { n: number; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("border-b border-[var(--border)] px-5 py-4", className)}>
      <header className="mb-3 flex items-center gap-2">
        <span className="num flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[11px] font-semibold text-[var(--text-2)]">{n}</span>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-2)]">{title}</h3>
        {aside ? <div className="ml-auto flex items-center gap-2 text-[12px]">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** Inline «Ver detalhes» disclosure; content stays out of the way until asked for. */
export function Details({ label, children, testId }: { label: ReactNode; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={testId}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-[12px] text-[var(--text-2)] hover:text-[var(--text)]">
        <ChevronRight className={clsx("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        {label}
      </button>
      {open ? <div className="mt-1.5 space-y-1 pl-[18px] text-[12px] text-[var(--text-2)]">{children}</div> : null}
    </div>
  );
}

export function CheckRow({ label, verdict, text, children, action, testId }: { label: string; verdict: CheckVerdict; text: ReactNode; children?: ReactNode; action?: ReactNode; testId?: string }) {
  const v = VERDICT[verdict];
  const c = toneVars(v.tone);
  return (
    <li className="grid grid-cols-[120px_1fr_auto] items-start gap-x-3 py-2" data-testid={testId} data-verdict={verdict}>
      <span className="pt-px text-[12.5px] text-[var(--text-2)]">{label}</span>
      <div className="min-w-0">
        <span className="flex items-start gap-1.5 text-[13px] text-[var(--text)]">
          <v.Icon className="mt-[3px] h-3.5 w-3.5 shrink-0" style={{ color: c.fg }} aria-label={v.label} />
          <span className="min-w-0">{text}</span>
        </span>
        {children ? <div className="mt-1 pl-5">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : <span />}
    </li>
  );
}

export const WINDOW_TEXT: Record<WindowStatus, { verdict: CheckVerdict; text: string }> = {
  achievable: { verdict: "OK", text: "Dentro da janela de entrega" },
  at_risk: { verdict: "RISK", text: "Janela de entrega em risco" },
  missed: { verdict: "BLOCKS", text: "Falha a janela de entrega" },
  unknown: { verdict: "UNKNOWN", text: "Janela por confirmar (horário sem data)" },
  no_window: { verdict: "OK", text: "Sem janela de entrega definida" },
};

/** Road Intelligence conclusion in one line (detail lives in the evidence drawer). */
export function riConclusion(status: ComplianceStatus | undefined, coverageComplete: boolean): { verdict: CheckVerdict; text: string; tone: Tone } {
  switch (status) {
    case "ROUTE_COMPLIANT":
      return coverageComplete ? { verdict: "OK", text: "Sem restrições conhecidas", tone: "ok" } : { verdict: "OK", text: "Sem restrições conhecidas · cobertura parcial", tone: "neutral" };
    case "POTENTIALLY_AFFECTED":
      return { verdict: "RISK", text: "Possivelmente afetada por uma restrição", tone: "warn" };
    case "ROUTE_AFFECTED":
      return { verdict: "BLOCKS", text: "Afetada por uma restrição verificada", tone: "danger" };
    case "EVALUATION_ERROR":
      return { verdict: "BLOCKS", text: "Erro na avaliação — não é possível confirmar", tone: "danger" };
    default:
      return { verdict: "UNKNOWN", text: "Por avaliar", tone: "neutral" };
  }
}

export const SOLVER_OUTCOME: Record<StrategyOutcome, string> = {
  UNCHANGED: "verificada pela Road Intelligence — sem alteração necessária",
  UNCHANGED_UNCERTAIN: "verificada pela Road Intelligence — restrições incertas",
  CLEANED: "corrigida pela Road Intelligence para evitar restrições",
  CLEANED_UNCERTAIN: "corrigida pela Road Intelligence — restrições incertas",
  UNRESOLVED: "Road Intelligence sem rota limpa",
  ERROR: "erro na Road Intelligence",
};

const sgn = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±");

/** A delta that reads as better / worse at a glance (lower is better for all route metrics). */
export function Delta({ value, unit, fmt }: { value: number; unit?: string; fmt: (abs: number) => string }) {
  if (Math.abs(value) < 1e-9) return <span className="text-[var(--text-3)]">igual</span>;
  return (
    <span style={{ color: value > 0 ? "var(--warn)" : "var(--ok)" }}>
      {sgn(value)}
      {fmt(Math.abs(value))}
      {unit ?? ""}
    </span>
  );
}
