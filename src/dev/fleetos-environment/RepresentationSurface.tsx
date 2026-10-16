import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronUp, Maximize2, Split, X } from "lucide-react";
import type { Domain } from "./livingEnvironment";
import type { RepresentationDecision } from "./representationEngine";
import type { Bounds } from "./workspaceGeometry";
import {
  DomainGrammar,
  RelationGrammar,
  type SelectEntity,
} from "./DomainGrammar";

export function RepresentationBody({
  decision,
  onSelect,
}: {
  decision: RepresentationDecision;
  onSelect?: SelectEntity;
}) {
  const domains = decision.members.filter((a) => a !== "map") as Domain[];
  return (
    <div className="environment-representation-body" data-form={decision.form}>
      {domains.length > 1 ? (
        <RelationGrammar decision={decision} onSelect={onSelect} />
      ) : (
        domains.map((domain) => (
          <DomainGrammar
            key={domain}
            domain={domain}
            decision={decision}
            onSelect={onSelect}
          />
        ))
      )}
    </div>
  );
}
export function RepresentationSurface({
  domain,
  decision,
  fallback,
  onToggle,
  onPromote,
  onFocus,
  onMap,
  onSplit,
  onSelect,
  children,
}: {
  domain: Domain;
  decision?: RepresentationDecision;
  fallback: Bounds;
  onToggle(): void;
  onPromote(): void;
  onDemote(): void;
  onFocus(): void;
  onMap(): void;
  onSplit(): void;
  onSelect?: SelectEntity;
  children?: ReactNode;
}) {
  const host = useRef<HTMLElement>(null),
    lastBounds = useRef(fallback),
    lastDecision = useRef(decision);
  const [outgoing, setOutgoing] = useState<RepresentationDecision | null>(null);
  const bounds = decision?.bounds ?? lastBounds.current,
    visible = Boolean(decision?.bounds);
  const form = decision?.form ?? "suspended",
    role = decision?.role ?? "SUSPENDED",
    members = decision?.members.join("|") ?? "";
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      el.style.setProperty(
        "--representation-detail",
        String(Math.max(0, Math.min(1, (r.width - 300) / 180))),
      );
      el.style.setProperty(
        "--representation-depth",
        String(Math.max(0, Math.min(1, (r.height - 210) / 170))),
      );
      el.dataset.surfaceMoving = String(
        Math.abs(r.x - bounds.x) > 1 ||
          Math.abs(r.y - bounds.y) > 1 ||
          Math.abs(r.width - bounds.width) > 1 ||
          Math.abs(r.height - bounds.height) > 1,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [bounds.x, bounds.y, bounds.width, bounds.height]);
  useLayoutEffect(() => {
    if (decision?.bounds) lastBounds.current = decision.bounds;
  }, [decision]);
  useLayoutEffect(() => {
    const previous = lastDecision.current;
    if (
      previous &&
      decision &&
      (previous.form !== decision.form ||
        previous.family !== decision.family ||
        previous.members.join("|") !== members)
    )
      setOutgoing(previous);
    lastDecision.current = decision;
    const el = host.current;
    if (!el) return;
    const duration =
      parseFloat(
        getComputedStyle(el).getPropertyValue("--environment-motion-compose"),
      ) || 0;
    const easing =
      getComputedStyle(el)
        .getPropertyValue("--environment-motion-ease")
        .trim() || "linear";
    const incoming = el.querySelector<HTMLElement>(
      ".environment-incoming-representation",
    );
    const animation =
      visible && incoming && duration
        ? incoming.animate(
            [
              { opacity: 0.4, transform: "translateY(5px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration, easing },
          )
        : undefined;
    const timer = window.setTimeout(() => setOutgoing(null), duration);
    return () => {
      clearTimeout(timer);
      animation?.cancel();
    };
    // Geometry retargets independently; content morphs only when its meaning changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, members, visible]);
  return (
    <section
      ref={host}
      className="environment-domain-surface environment-representation-surface"
      aria-label={`Contexto ${domain}`}
      aria-hidden={!visible}
      inert={!visible}
      data-surface-id={domain}
      data-visible={visible}
      data-role={role}
      data-representation={form}
      data-family={decision?.family}
      data-domain={domain}
      data-layer={decision?.layer ?? "workspace"}
      role={decision?.layer === "overlay" ? "dialog" : undefined}
      data-members={members}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height),
        opacity: visible ? 1 : 0,
      }}
    >
      <div className="environment-representation-header">
        <div>
          <span className="environment-eyebrow">
            DEV / DEMO · {role.toLowerCase()}
          </span>
          <h2>
            {decision?.members.filter((a) => a !== "map").join(" + ") ?? domain}
          </h2>
        </div>
        <div className="environment-shell-actions">
          <button
            aria-label={`Promover ${domain}`}
            title="Promover"
            onClick={onPromote}
          >
            <ChevronUp size={14} />
          </button>
          <button
            aria-label={`Mapa em ecrã inteiro — ${domain}`}
            title="Mapa em ecrã inteiro"
            onClick={onMap}
          >
            <Maximize2 size={14} />
            <span className="environment-map-button-label">Mapa</span>
          </button>
          {decision && decision.members.length > 1 && (
            <button
              aria-label={`Separar ${domain}`}
              title="Separar"
              onClick={onSplit}
            >
              <Split size={13} />
            </button>
          )}
          <button
            aria-label={`Focar ${domain} — demonstração`}
            title="Foco sintético"
            onClick={onFocus}
          >
            <ArrowUpRight size={14} />
          </button>
          <button
            aria-label={`Fechar ${domain}`}
            title="Fechar"
            onClick={onToggle}
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="environment-morph-viewport">
        {outgoing && (
          <div
            className="environment-outgoing-representation"
            aria-hidden
            inert
          >
            <RepresentationBody decision={outgoing} />
          </div>
        )}
        {decision && (
          <div className="environment-incoming-representation">
            <RepresentationBody decision={decision} onSelect={onSelect} />
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
