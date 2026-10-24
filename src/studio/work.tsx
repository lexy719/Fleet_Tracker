// Trabalhos: every transport (also delivered and invoiced), in the same deck language as
// Operação — headline, a short row of chips, the transport cards. Groups come from the
// application's own work model.
import { useState } from "react";
import type { Job } from "../data/types";
import { inGroup, isOpen, jobAnchor } from "../ui/work/workModel";
import type { Row } from "./types";

export type WorkItem = { r: Row; s?: Job };
export type WorkChip = "open" | "unassigned" | "active" | "completed";

export const WORK_CHIPS: [WorkChip, string][] = [
  ["open", "Abertos"],
  ["unassigned", "Por atribuir"],
  ["active", "Em curso"],
  ["completed", "Feitos"],
];

const inChip = (s: Job, c: WorkChip, now: Date) => (c === "open" ? isOpen(s) : inGroup(s, c, now));

export function useWork(items: WorkItem[], now: Date) {
  const [chip, setChip] = useState<WorkChip>("open");
  const stored = items.filter((x): x is Required<WorkItem> => !!x.s);
  const count = (c: WorkChip) => stored.filter((x) => inChip(x.s, c, now)).length;
  const rows = stored
    .filter((x) => inChip(x.s, chip, now))
    .sort((a, b) => (chip === "completed" ? jobAnchor(b.s) - jobAnchor(a.s) : jobAnchor(a.s) - jobAnchor(b.s)))
    .map((x) => x.r);
  return { chip, setChip, count, rows, total: stored.length };
}
