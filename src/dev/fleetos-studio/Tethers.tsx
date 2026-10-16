// Tethers: live curves from an object in the UI (a card, a stop row, a person) to the
// same object on the map. Paths are recomputed every frame while visible, so they stay
// attached through camera moves, playback and panel morphs. Drawn in once, then held.
import { useEffect, useLayoutEffect, useRef } from "react";
import { stageApi } from "./StageMap";
import type { Point } from "./model";

export type Tether = { key: string; from: string; to: Point; strong?: boolean };

export function Tethers({ links }: { links: Tether[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const live = useRef(links);
  useLayoutEffect(() => {
    live.current = links;
  });

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const root = svg.current;
      const project = stageApi.project;
      if (root && project) {
        for (const l of live.current) {
          const g = root.querySelector<SVGGElement>(`[data-k="${CSS.escape(l.key)}"]`);
          const el = document.querySelector<HTMLElement>(l.from);
          if (!g) continue;
          if (!el) {
            g.style.opacity = "0";
            continue;
          }
          const r = el.getBoundingClientRect();
          // Hidden while its row is scrolled out of its list.
          const box = el.closest(".panel-scroll, .deck-list")?.getBoundingClientRect();
          const sy0 = r.top + Math.min(r.height / 2, 28);
          if (box && (sy0 < box.top + 4 || sy0 > box.bottom - 4)) {
            g.style.opacity = "0";
            continue;
          }
          const end = project(l.to);
          const right = end.x > r.left + r.width / 2;
          const sx = right ? r.right : r.left;
          const sy = r.top + Math.min(r.height / 2, 28);
          const dx = Math.max(60, Math.abs(end.x - sx) * 0.45) * (right ? 1 : -1);
          const d = `M${sx},${sy} C${sx + dx},${sy} ${end.x - dx * 0.6},${end.y} ${end.x},${end.y}`;
          g.style.opacity = "";
          g.querySelector("path")!.setAttribute("d", d);
          const [a, b] = g.querySelectorAll("circle");
          a.setAttribute("cx", String(sx));
          a.setAttribute("cy", String(sy));
          b.setAttribute("cx", String(end.x));
          b.setAttribute("cy", String(end.y));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    if (links.length) raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [links.length]);

  return (
    <svg ref={svg} className="tethers" aria-hidden>
      {links.map((l, i) => (
        <g key={l.key} data-k={l.key} data-strong={l.strong || undefined} style={{ animationDelay: `${i * 70}ms` }}>
          <path pathLength={1} />
          <circle r={3} className="t-from" />
          <circle r={5} className="t-to" />
        </g>
      ))}
    </svg>
  );
}
