import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo,
  useReducer, useRef, type ReactNode, type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { ObjectSnapshot } from "./sceneSnapshot";

type Slot = { element: HTMLDivElement; content: ReactNode };
type ObjectEntry = {
  host: HTMLDivElement; slots: Map<HTMLDivElement, Slot>;
  selected: Slot | null; content: ReactNode; animation?: Animation; animatedRevision?: number;
};
type ObjectContext = {
  revision: number;
  register: (id: string, slot: Slot) => () => void;
};
const Objects = createContext<ObjectContext | null>(null);
let instance = 0;

/** Portals keep the actual object host alive while its authored representation
 * moves between regions. There are no cloned instruments or animation ghosts.
 * Each transport scope can have its own simultaneous reading of an object. */
export function PersistentObjects({ children, revision, before, reduced, root }: {
  children: ReactNode; revision: number; before: ObjectSnapshot | null;
  reduced: boolean; root: RefObject<HTMLElement | null>;
}) {
  const catalog = useRef(new Map<string, ObjectEntry>());
  const latest = useRef({ before, reduced });
  latest.current = { before, reduced };
  const [version, refresh] = useReducer((n: number) => n + 1, 0);
  const elect = useCallback(() => {
    let changed = false;
    for (const entry of catalog.current.values()) {
      entry.host.dataset.objectSlots = String(entry.slots.size);
      const visible = [...entry.slots.values()].filter(({ element }) =>
        element.isConnected && !element.closest('[data-visible="false"], [aria-hidden="true"], [inert], [hidden]'),
      );
      const next = visible.at(-1) ?? null;
      if (entry.selected?.element === next?.element && entry.selected?.content === next?.content) continue;
      entry.animation?.cancel();
      entry.selected = next;
      if (next) { next.element.appendChild(entry.host); entry.content = next.content; }
      changed = true;
    }
    if (changed) refresh();
  }, []);
  const register = useCallback((id: string, slot: Slot) => {
    let entry = catalog.current.get(id);
    if (!entry) {
      const host = document.createElement("div");
      host.className = "fx-object-host";
      host.dataset.object = id;
      host.dataset.persistentObject = id;
      host.dataset.objectInstance = String(++instance);
      entry = { host, slots: new Map(), selected: null, content: null };
      catalog.current.set(id, entry);
    }
    entry.slots.set(slot.element, slot);
    elect();
    return () => {
      if (entry.slots.get(slot.element) === slot) entry.slots.delete(slot.element);
      elect();
    };
  }, [elect]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    // Retained scene hosts change visibility without remounting their children.
    const observer = new MutationObserver(elect);
    observer.observe(element, { subtree: true, attributes: true,
      attributeFilter: ["data-visible", "aria-hidden", "inert", "hidden"] });
    elect();
    return () => observer.disconnect();
  }, [elect, root]);
  useLayoutEffect(() => {
    const bounds = root.current?.getBoundingClientRect();
    if (!bounds || latest.current.reduced) return;
    for (const [id, entry] of catalog.current) {
      if (!entry.selected) continue;
      if (entry.animatedRevision === revision) continue;
      entry.animatedRevision = revision;
      const origin = latest.current.before?.objects.get(id)?.rect;
      if (!origin) continue;
      const rect = entry.host.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const dx = Number(origin.left) + bounds.left - rect.left;
      const dy = Number(origin.top) + bounds.top - rect.top;
      // Keep type and diagrams at their authored scale. Translation connects the
      // object; its new instrument unfolds instead of stretching a text bitmap.
      if (Math.abs(dx) + Math.abs(dy) < 3) continue;
      entry.animation?.cancel();
      entry.animation = entry.host.animate([
        { transform: `translate(${dx}px, ${dy}px)`, opacity: 0.75 },
        { transform: "translate(0, 0)", opacity: 1 },
      ], { duration: 520, easing: "cubic-bezier(.22,1,.36,1)" });
    }
  }, [version, revision, root]);
  useLayoutEffect(() => {
    const entries = catalog.current;
    return () => { for (const entry of entries.values()) entry.animation?.cancel(); };
  }, []);
  const value = useMemo(() => ({ revision, register }), [revision, register]);
  return <Objects.Provider value={value}>
    {children}
    {[...catalog.current.entries()].map(([id, entry]) =>
      createPortal(entry.content, entry.host, id),
    )}
  </Objects.Provider>;
}

export function ObjectSlot({ id, children }: { id: string; children: ReactNode }) {
  const context = useContext(Objects);
  const element = useRef<HTMLDivElement>(null);
  const register = context?.register;
  const revision = context?.revision;
  useLayoutEffect(() => {
    if (!register || !element.current) return;
    return register(id, { element: element.current, content: children });
  }, [id, children, register, revision]);
  return context
    ? <div ref={element} className="fx-object-slot" data-object-slot={id} />
    : <>{children}</>;
}
