import {
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { ArrowUpRight, Maximize2, Minimize2, X } from "lucide-react";
import type { Bounds, SurfaceAllocation } from "./workspaceGeometry";
import type { Domain } from "./livingEnvironment";
export function DomainSurface({
  domain,
  allocation,
  fallback,
  expanded,
  focused,
  onToggle,
  onExpand,
  onFocus,
  children,
}: {
  domain: Domain;
  allocation?: SurfaceAllocation;
  fallback: Bounds;
  expanded: boolean;
  focused: boolean;
  onToggle(): void;
  onExpand(): void;
  onFocus(): void;
  children?: ReactNode;
}) {
  const node = useRef<HTMLElement>(null),
    hasAppeared = useRef(false);
  const [lastBounds, setLastBounds] = useState(fallback);
  const bounds = allocation?.bounds ?? lastBounds,
    visible = Boolean(allocation?.bounds);
  const x = allocation?.bounds?.x,
    y = allocation?.bounds?.y,
    w = allocation?.bounds?.width,
    h = allocation?.bounds?.height;
  useLayoutEffect(() => {
    if (
      x !== undefined &&
      y !== undefined &&
      w !== undefined &&
      h !== undefined
    )
      setLastBounds({ x, y, width: w, height: h });
  }, [x, y, w, h]);
  const checkSettled = useCallback(() => {
    const el = node.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.dataset.surfaceMoving = String(
      Math.abs(r.x - bounds.x) > 1 ||
        Math.abs(r.y - bounds.y) > 1 ||
        Math.abs(r.width - bounds.width) > 1 ||
        Math.abs(r.height - bounds.height) > 1,
    );
  }, [bounds.x, bounds.y, bounds.width, bounds.height]);
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    el.dataset.entering = String(visible && !hasAppeared.current);
    checkSettled();
    const frame = requestAnimationFrame(() => {
      el.dataset.entering = "false";
      checkSettled();
    });
    const content = el.querySelector<HTMLElement>(
      ".environment-domain-content",
    );
    const duration =
      parseFloat(
        getComputedStyle(el).getPropertyValue("--environment-motion-compose"),
      ) || 0;
    let animation: Animation | undefined;
    if (visible && content && duration)
      animation = content.animate(
        [
          {
            opacity: hasAppeared.current ? 0.65 : 0,
            transform: hasAppeared.current
              ? "translateY(2px)"
              : "translateY(9px)",
          },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration, easing: "cubic-bezier(0.22,1,0.36,1)" },
      );
    hasAppeared.current = visible;
    return () => {
      cancelAnimationFrame(frame);
      animation?.cancel();
    };
    // Scalar dependencies prevent unrelated renders from restarting motion.
  }, [x, y, w, h, visible, checkSettled]);
  return (
    <section
      ref={node}
      className="environment-domain-surface"
      aria-label={`Contexto ${domain}`}
      aria-hidden={!visible}
      inert={!visible}
      data-surface-id={domain}
      data-surface-status={allocation?.status ?? "inactive"}
      data-visible={visible}
      data-focused={focused}
      onTransitionEnd={checkSettled}
      onTransitionCancel={checkSettled}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height),
        opacity: visible ? 1 : 0,
      }}
    >
      <div className="environment-domain-content">
        <header>
          <div>
            <span className="environment-eyebrow">CONTEXT LAB</span>
            <h2>{domain}</h2>
          </div>
          <div className="environment-shell-actions">
            <button
              type="button"
              aria-label={`${expanded ? "Comprimir" : "Expandir"} ${domain}`}
              onClick={onExpand}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              type="button"
              aria-label={`Fechar ${domain}`}
              onClick={onToggle}
            >
              <X size={15} />
            </button>
          </div>
        </header>
        <div className="environment-domain-empty">
          <span className="environment-empty-rule" />
          <p>Espaço para contexto.</p>
          <span>Sem dados operacionais.</span>
        </div>
        {children}
        <footer>
          <span>
            DEV ·{" "}
            {focused
              ? "Foco sintético"
              : allocation?.status === "compressed"
                ? "Compacto"
                : "Shell vazio"}
          </span>
          <button
            type="button"
            onClick={onFocus}
            aria-label={`Focar ${domain} — demonstração`}
          >
            Explorar foco <ArrowUpRight size={13} />
          </button>
        </footer>
      </div>
    </section>
  );
}
