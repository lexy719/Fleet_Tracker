// What every palco shares: the one-variation-at-a-time switch (an ink pill that slides), the entrance out of
// the thing that was tapped (a sidebar row, a pin on the map, a name), and rows that glide to their new order
// when the variation changes.
import { useLayoutEffect, useRef, type RefObject } from "react";
import { palcoFlight } from "./Layers";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Variations<K extends string>({ options, value, onChange }: { options: [K, string][]; value: K; onChange: (k: K) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLElement>(null);
  // The pill sits under the chosen option and slides to the next one (measured again once the fonts load
  // or the buttons change size, so it never sits off its label).
  useLayoutEffect(() => {
    const place = () => {
      const b = box.current?.querySelector<HTMLElement>(`[data-v="${value}"]`);
      if (!b || !pill.current) return;
      pill.current.style.left = `${b.offsetLeft}px`;
      pill.current.style.width = `${b.offsetWidth}px`;
    };
    place();
    void document.fonts?.ready.then(place);
    const ro = new ResizeObserver(place);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [value]);
  return (
    <div className="pv-vars" role="tablist" aria-label="Variação" ref={box}>
      <i ref={pill} aria-hidden />
      {options.map(([k, label]) => (
        <button key={k} role="tab" data-v={k} aria-selected={k === value} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** The palco opens out of the tapped thing: a clip that grows from its box to the whole page. */
export function usePalcoEntrance(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const from = palcoFlight.from;
    palcoFlight.from = null;
    const el = root.current;
    if (!from || !el || !from.width || reduced()) return;
    const W = window.innerWidth, H = window.innerHeight;
    const inset = `inset(${from.top}px ${W - from.right}px ${H - from.bottom}px ${from.left}px round 16px)`;
    el.animate([{ clipPath: inset }, { clipPath: "inset(0px 0px 0px 0px round 0px)" }], { duration: 900, easing: EASE, fill: "backwards" });
  }, [root]);
}

/** Rows (data-row="key") glide from where they were to their new place when `dep` changes. Call the returned
 *  function just before the change. */
export function useRowFlip(root: RefObject<HTMLElement | null>, dep: unknown) {
  const rects = useRef(new Map<string, DOMRect>());
  const last = useRef(dep);
  useLayoutEffect(() => {
    if (last.current === dep) return;
    last.current = dep;
    const el = root.current;
    if (!el || !rects.current.size || reduced()) return;
    el.querySelectorAll<HTMLElement>("[data-row]").forEach((r) => {
      const from = rects.current.get(r.dataset.row!);
      const to = r.getBoundingClientRect();
      if (!from) {
        r.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 160, easing: EASE, fill: "backwards" });
        return;
      }
      const dy = from.top - to.top;
      if (Math.abs(dy) > 1) r.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 700, easing: EASE });
    });
    rects.current.clear();
  }, [dep, root]);
  return () => {
    rects.current.clear();
    root.current?.querySelectorAll<HTMLElement>("[data-row]").forEach((r) => rects.current.set(r.dataset.row!, r.getBoundingClientRect()));
  };
}
