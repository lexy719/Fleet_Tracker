import type { WorkspaceDomain } from "../../../application/environmentQueries";
import type { MapCamera } from "../mapTypes";
export type Selection = { kind: "job" | "driver" | "truck"; id: string };
export type ConnectedFrame = {
  base: WorkspaceDomain;
  active: WorkspaceDomain[];
  selected: Selection | null;
  filter: "all" | "attention" | "unassigned" | "moving";
  query: string;
  drafts: Record<string, { text: string; revision: number }>;
  mapOpen: boolean;
  scroll: number;
  detailScroll: number;
  camera?: MapCamera | null;
};
export type ConnectedTab = { id: string; frame: ConnectedFrame };
export type ConnectedWorkspace = {
  active: string;
  tabs: ConnectedTab[];
  history: ConnectedTab[];
};
export const frameKey = (f: ConnectedFrame) =>
  JSON.stringify([f.base, [...f.active].sort(), f.selected]);
export function initialConnectedWorkspace(): ConnectedWorkspace {
  const frame: ConnectedFrame = {
    base: "Jobs",
    active: ["Jobs"],
    selected: null,
    filter: "all",
    query: "",
    drafts: {},
    mapOpen: false,
    scroll: 0,
    detailScroll: 0,
  };
  const id = frameKey(frame);
  return { active: id, tabs: [{ id, frame }], history: [] };
}
export const currentFrame = (w: ConnectedWorkspace) =>
  w.tabs.find((t) => t.id === w.active)!.frame;
export function replaceFrame(
  w: ConnectedWorkspace,
  frame: ConnectedFrame,
): ConnectedWorkspace {
  return {
    ...w,
    tabs: w.tabs.map((t) => (t.id === w.active ? { ...t, frame } : t)),
  };
}
export function navigateConnected(
  w: ConnectedWorkspace,
  frame: ConnectedFrame,
  composition = false,
): ConnectedWorkspace {
  const before = structuredClone(w.tabs.find((t) => t.id === w.active)!);
  if (!composition)
    return { ...replaceFrame(w, frame), history: [...w.history, before] };
  const id = frameKey(frame);
  if (id === w.active) return w;
  const existing = w.tabs.find((t) => t.id === id);
  return {
    active: id,
    tabs: existing
      ? w.tabs
      : [
          ...w.tabs,
          {
            id,
            frame: {
              ...frame,
              drafts: {},
              scroll: 0,
              detailScroll: 0,
            },
          },
        ],
    history: [...w.history, before],
  };
}
export function contentConnected(
  w: ConnectedWorkspace,
  domain: WorkspaceDomain,
): ConnectedWorkspace {
  const frame = currentFrame(w);
  if (domain === frame.base)
    return navigateConnected(
      w,
      { ...frame, selected: null, mapOpen: false },
      true,
    );
  const active = frame.active.includes(domain)
    ? frame.active.filter((d) => d !== domain)
    : [...frame.active, domain];
  return navigateConnected(w, { ...frame, active }, true);
}
export function backConnected(w: ConnectedWorkspace): ConnectedWorkspace {
  const previous = w.history.at(-1);
  if (!previous) return w;
  return {
    active: previous.id,
    tabs: w.tabs.some((t) => t.id === previous.id)
      ? w.tabs.map((t) =>
          t.id === previous.id ? structuredClone(previous) : t,
        )
      : [...w.tabs, structuredClone(previous)],
    history: w.history.slice(0, -1),
  };
}
