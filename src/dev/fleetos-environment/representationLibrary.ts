import { DEMO_CONTENT, type DemoRow } from "./demoContent";
import type { Domain } from "./livingEnvironment";
import type { Representation, Role } from "./representationEngine";

export type DataShape = {
  count: number;
  urgency: number;
  detail: number;
  selected: string | null;
  mapRelevance: number;
};
export type UserIntent =
  | "overview"
  | "dispatch"
  | "inspect"
  | "compare"
  | "relations"
  | "monitor";
export type RepresentationFamily = {
  id: string;
  title: string;
  form: Representation;
  domain: Domain;
};
const grammars: Representation[] = [
  "indicator",
  "micro-summary",
  "strip",
  "vertical-strip",
  "list",
  "wide-list",
  "grid",
  "dense-grid",
  "timeline",
  "flow",
  "workspace",
  "analysis",
  "relation",
  "contextual",
  "takeover",
];
const titles: Record<Domain, string[]> = {
  Jobs: [
    "Work signal",
    "Urgent pulse",
    "Departure queue",
    "Related work rail",
    "Narrow queue",
    "Dispatch ledger",
    "Status board",
    "Dense movement register",
    "Window timeline",
    "Handoff flow",
    "Selected itinerary",
    "Window analysis",
    "Transport relations",
    "Floating job",
    "Dispatch takeover",
  ],
  Drivers: [
    "Team signal",
    "Duty clock",
    "Availability strip",
    "Duty rail",
    "Team roster",
    "Duty register",
    "Crew matrix",
    "Dense shift register",
    "Shift timeline",
    "Shift handoff",
    "Driver profile",
    "Hours comparison",
    "Driver / truck pairing",
    "Floating driver",
    "Crew workspace",
  ],
  Trucks: [
    "Asset signal",
    "Capacity pulse",
    "Availability band",
    "Asset rail",
    "Fleet register",
    "Capacity ledger",
    "Asset matrix",
    "Dense vehicle register",
    "Readiness timeline",
    "Turnaround flow",
    "Truck profile",
    "Capacity analysis",
    "Truck / driver pairing",
    "Floating vehicle",
    "Fleet workspace",
  ],
  Fuel: [
    "Stop signal",
    "Price pulse",
    "Price strip",
    "Station rail",
    "Stop shortlist",
    "Detour ledger",
    "Station comparison",
    "Dense price register",
    "Corridor timeline",
    "Route stop flow",
    "Stop workspace",
    "Price / detour analysis",
    "Job / stop relation",
    "Floating stop",
    "Fuel workspace",
  ],
  Restrictions: [
    "Risk signal",
    "Segment pulse",
    "Severity band",
    "Segment rail",
    "Signal register",
    "Applicability ledger",
    "Severity matrix",
    "Dense segment register",
    "Restriction timeline",
    "Affected route flow",
    "Segment workspace",
    "Severity analysis",
    "Route / segment relations",
    "Floating segment",
    "Restriction workspace",
  ],
  Documents: [
    "File signal",
    "Readiness pulse",
    "Document strip",
    "Dossier rail",
    "File index",
    "Document register",
    "Document gallery",
    "Dense file register",
    "Document lifecycle",
    "Approval flow",
    "Paper workspace",
    "Readiness analysis",
    "Job / dossier relation",
    "Floating document",
    "Dossier takeover",
  ],
};
export const DOMAIN_LIBRARY = Object.fromEntries(
  Object.entries(titles).map(([domain, labels]) => [
    domain,
    labels.map((title, i) => ({
      domain,
      title,
      id: `${domain.toUpperCase()}_${title.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
      form: grammars[i],
    })),
  ]),
) as Record<Domain, RepresentationFamily[]>;
export function dataShape(
  domain: Domain,
  override?: Partial<DataShape>,
): DataShape {
  return {
    count: DEMO_CONTENT[domain].rows.length,
    urgency: 0.25,
    detail: 0.5,
    selected: null,
    mapRelevance:
      domain === "Documents"
        ? 0.12
        : domain === "Fuel" || domain === "Restrictions"
          ? 0.9
          : 0.65,
    ...override,
  };
}
export function demoRows(domain: Domain, shape: DataShape): DemoRow[] {
  const rows = DEMO_CONTENT[domain].rows;
  return Array.from(
    { length: Math.max(0, Math.min(60, Math.round(shape.count))) },
    (_, i) => ({
      ...rows[i % rows.length],
      id:
        i < rows.length
          ? rows[i].id
          : `${rows[i % rows.length].id}-${Math.floor(i / rows.length) + 1}`,
      tone:
        i < Math.ceil(shape.count * shape.urgency)
          ? "amber"
          : rows[i % rows.length].tone,
    }),
  );
}
/** Data fit is independent of x/y/w/h; region shape is scored by the geometry layer. */
export function dataSuitability(
  domain: Domain,
  form: Representation,
  shape: DataShape,
  role: Role,
  intent: UserIntent,
  depth: number,
  merged: boolean,
) {
  const primary = role === "PRIMARY" || role === "TAKEOVER";
  const dense = Math.min(1, shape.count / 30),
    selected = shape.selected !== null;
  let score = 0;
  if (shape.count === 0)
    score += form === "indicator" || form === "micro-summary" ? 1.7 : -1;
  if (dense > 0.5)
    score += ["dense-grid", "wide-list"].includes(form)
      ? dense * 1.3
      : ["contextual", "micro-summary"].includes(form)
        ? -0.7
        : 0;
  if (shape.count <= 4 && shape.urgency > 0.5)
    score += ["strip", "flow", "timeline"].includes(form) ? 0.9 : 0;
  if (selected)
    score += ["workspace", "relation", "contextual"].includes(form)
      ? 0.6 + shape.detail * 0.5
      : 0;
  if (intent === "compare")
    score += ["analysis", "grid", "wide-list"].includes(form) ? 0.9 : 0;
  if (intent === "dispatch")
    score += ["timeline", "wide-list", "flow"].includes(form) ? 0.8 : 0;
  if (intent === "monitor")
    score += ["micro-summary", "strip", "dense-grid"].includes(form) ? 0.7 : 0;
  if (intent === "relations" || merged) score += form === "relation" ? 1.1 : 0;
  if (intent === "inspect")
    score += ["workspace", "contextual"].includes(form) ? 0.9 : 0;
  if (primary && shape.detail > 0.6)
    score += ["analysis", "workspace", "grid"].includes(form)
      ? shape.detail * 0.65
      : 0;
  if (!primary && depth > 1)
    score += [
      "micro-summary",
      "strip",
      "vertical-strip",
      "contextual",
    ].includes(form)
      ? 0.25
      : 0;
  if (domain === "Documents")
    score += ["workspace", "grid", "timeline"].includes(form) ? 0.2 : 0;
  if (domain === "Drivers")
    score += ["timeline", "grid", "relation"].includes(form) ? 0.22 : 0;
  if (domain === "Trucks")
    score += ["grid", "wide-list", "micro-summary"].includes(form) ? 0.22 : 0;
  if (domain === "Fuel")
    score += ["analysis", "flow", "wide-list"].includes(form) ? 0.22 : 0;
  if (domain === "Restrictions")
    score += ["vertical-strip", "timeline", "relation"].includes(form)
      ? 0.22
      : 0;
  return score;
}
