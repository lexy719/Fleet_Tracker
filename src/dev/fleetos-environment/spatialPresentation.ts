import type { SpatialQuestion } from "./spatialQuestions";
import type { InformationForm } from "./compositionGrammar";
export const SPATIAL_PRESENTATIONS: Record<
  SpatialQuestion,
  {
    character: "local" | "corridor" | "overview" | "none";
    aspect: number;
    prominence: number;
  }
> = {
  NONE: { character: "none", aspect: 1, prominence: 0 },
  CURRENT_ENTITY: { character: "local", aspect: 1.05, prominence: 0.28 },
  AFFECTED_SEGMENT: { character: "local", aspect: 1.15, prominence: 0.42 },
  NEXT_LEG: { character: "corridor", aspect: 1.75, prominence: 0.38 },
  FULL_ROUTE: { character: "overview", aspect: 2.6, prominence: 0.44 },
  ROUTE_AND_STOP: { character: "overview", aspect: 2.2, prominence: 0.4 },
  MULTI_ENTITY: { character: "overview", aspect: 2.2, prominence: 0.55 },
  RESOURCE_AND_JOB: { character: "overview", aspect: 2.6, prominence: 0.4 },
  ORIGIN_DESTINATION: { character: "overview", aspect: 2.8, prominence: 0.4 },
  USER_REQUESTED: { character: "overview", aspect: 2.4, prominence: 0.38 },
};
export function informationDepth(
  width: number,
  height: number,
  lead: boolean,
): InformationForm {
  if (!lead) return height >= 390 ? "MEDIUM" : "SUPPORT";
  return width >= 840 && height >= 480 ? "DEEP_LEAD" : "LEAD";
}
