// One world per page load. Set once before the studio renders (see index.tsx);
// switching source reloads the page, so no component ever sees two worlds.
import type { StudioWorld } from "./types";

let current: StudioWorld | null = null;

export function setWorld(w: StudioWorld) {
  current = w;
}

export function W(): StudioWorld {
  if (!current) throw new Error("Studio world not loaded");
  return current;
}
