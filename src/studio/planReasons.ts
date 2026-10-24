// Portuguese wording for the planner's reason codes (studio presentation only; the codes and
// their meaning belong to domain/planning). Unknown codes fall back to the code itself.
import { reasonLabels } from "../components/dispatch/useOperationalPlanning";

const LABELS: Record<string, string> = {
  ...reasonLabels,
  PAYLOAD_EXCEEDED: "Carga acima da capacidade útil",
  PALLET_CAPACITY_EXCEEDED: "Mais paletes do que cabem",
  PALLET_CAPACITY_UNKNOWN: "Capacidade em paletes desconhecida",
  CAPACITY_UNKNOWN: "Capacidade da viatura desconhecida",
  TRAILER_CAPACITY_UNKNOWN: "Capacidade do reboque desconhecida",
  COMBINATION_GROSS_WEIGHT_EXCEEDED: "Peso bruto do conjunto excedido",
  CARGO_DIMENSIONS_EXCEEDED: "Dimensões da carga excedidas",
  TRAILER_REQUIRED: "O transporte exige reboque",
  TRAILER_INCOMPATIBLE: "Reboque incompatível com a carga",
  TRAILER_UNAVAILABLE: "Reboque indisponível",
  TRUCK_CANNOT_TOW: "A viatura não reboca",
  TRUCK_UNAVAILABLE: "Viatura indisponível",
  TRUCK_POSITION_UNKNOWN: "Posição da viatura desconhecida",
  BULK_EQUIPMENT_REQUIRED: "Exige equipamento de granel",
  AUTOMOTIVE_EQUIPMENT_REQUIRED: "Exige porta-automóveis",
  DRY_CARGO_EQUIPMENT_INCOMPATIBLE: "Equipamento incompatível com carga seca",
  REFRIGERATION_REQUIRED: "Exige frio",
  TEMPERATURE_INCOMPATIBLE: "Gama de temperatura incompatível",
  TEMPERATURE_RANGE_UNKNOWN: "Gama de temperatura do reboque desconhecida",
  ADR_INCOMPATIBLE: "Equipamento sem ADR",
  ADR_CLASS_INCOMPATIBLE: "Classe ADR não coberta",
  ADR_TANK_QUALIFICATION_REQUIRED: "Exige ADR cisternas do motorista",
  DRIVER_UNAVAILABLE: "Motorista indisponível",
  LICENCE_CATEGORY_INCOMPATIBLE: "Categoria da carta incompatível",
  QUALIFICATION_EXPIRED_OR_MISSING: "Qualificação caducada ou em falta",
  QUALIFICATION_EXPIRES_BEFORE_COMPLETION: "Qualificação caduca antes de terminar",
  QUALIFICATION_VALIDITY_UNKNOWN: "Validade de qualificação desconhecida",
  WEEKLY_DRIVING_EXHAUSTED: "Horas semanais de condução esgotadas",
  LEGAL_DRIVING_INFEASIBLE: "Impossível cumprir as regras de condução",
  STOP_WINDOW_MISSED: "Falha uma janela de paragem",
  STOP_WINDOW_DATE_UNKNOWN: "Janela sem data",
  INVALID_DATED_WINDOW: "Janela inválida",
  PICKUP_OR_HORIZON_INFEASIBLE: "Recolha fora do horizonte de planeamento",
  HORIZON_OR_LOADED_ROUTE_UNAVAILABLE: "Sem rota carregada no horizonte",
  MANDATORY_ROUTE_REJECTED: "Rota obrigatória rejeitada por restrição",
  ROUTING_BUDGET_REACHED: "Limite de pedidos de rota atingido",
  SEARCH_SHORTLIST_LIMIT: "Limite da lista curta de candidatos",
  BEAM_LIMIT: "Limite da pesquisa",
  COMMITMENT_WITHOUT_REPRODUCIBLE_TIMELINE: "Compromisso atual sem cronograma reproduzível",
  COMMITMENT_REPLAN_REQUIRED: "Compromisso atual precisa de replaneamento",
  COMMITTED_EXECUTION_CHANGED: "Compromisso atual mudou desde que foi confirmado",
  COMMITTED_DEMAND_CHANGED: "Transporte confirmado mudou desde a confirmação",
  COMMITTED_DRIVING_BASELINE_CHANGED: "Horas do motorista mudaram desde a confirmação",
  COMMITTED_RESOURCE_SPECIFICATION_CHANGED: "Recurso confirmado mudou desde a confirmação",
  COMMITTED_ROUTE_REQUIRES_REVIEW: "Rota confirmada precisa de revisão",
  RESOURCE_NOT_AT_TRUCK: "Motorista/reboque não está junto da viatura",
  RESOURCE_POSITION_INVALID: "Posição do recurso inválida",
  RESOURCE_AVAILABILITY_INVALID: "Disponibilidade do recurso inválida",
  PROVIDER_ERROR: "Erro do fornecedor de rotas",
  INVALID_PROVIDER_ROUTE: "Rota do fornecedor inválida",
  JOB_GEOMETRY_OR_STOP_ORDER_INVALID: "Paragens ou ordem inválidas",
  INVALID_SERVICE_DURATION: "Tempo de serviço inválido",
};

export const reasonLabel = (code: string) => LABELS[code] ?? code;

/** Same code reported by several search stages → one line, counts summed, biggest first. */
export function mergeDiagnostics(d: { reason: { code: string }; count: number }[]) {
  const m = new Map<string, number>();
  for (const x of d) m.set(x.reason.code, (m.get(x.reason.code) ?? 0) + x.count);
  return [...m.entries()].map(([code, count]) => ({ code, count, label: reasonLabel(code) })).sort((a, b) => b.count - a.count);
}
