import type { RefuelPlan } from "../../domain/fuelPlanning/refuelPlanner";
import { Details } from "./DecisionParts";

/** Refuel plan of one route: where to fill, how much, detours, stops merged with mandatory pauses. */
export function RefuelPlanSummary({ plan }: { plan: RefuelPlan }) {
  const t = plan.totals;
  return (
    <div className="mt-1.5" data-testid="refuel-plan">
      <p className="font-medium text-[var(--text)]">Abastecimento</p>
      {plan.stops.length ? (
        <ul className="mt-0.5 space-y-0.5">
          {plan.stops.map((s) => (
            <li key={s.stationId} className="num">
              km {Math.round(s.alongKm)} · {s.brand || s.name || "Posto"}
              {s.municipality ? ` (${s.municipality}, ${s.country})` : ` (${s.country})`} · {Math.round(s.litres)} L a €{s.pricePerL.toFixed(3)}/L
              {s.detourKm >= 1 ? ` · desvio ~${s.detourKm.toFixed(1)} km` : " · na rota"}
              {s.pause ? (
                <span className="text-[var(--text)]"> · {s.pause.kind === "rest" ? "no descanso diário" : "na pausa obrigatória de 45 min"}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {plan.explanations.map((e) => (
        <p key={e} className="text-[var(--text-2)]">{e}</p>
      ))}
      {t ? (
        <p className="num text-[var(--text-2)]">
          {Math.round(t.litres)} L · €{t.fuelEur.toFixed(0)} em combustível{t.detourEur > 0 ? ` · desvios €${t.detourEur.toFixed(0)}` : ""} · chega com ~{Math.round(t.endFuelL)} L
          {plan.savingEur !== undefined && plan.savingEur >= 1 ? ` · poupa ~€${plan.savingEur.toFixed(0)} face a atestar quando a reserva chega a ¼` : ""}
        </p>
      ) : null}
      {plan.assumptions.length ? (
        <Details label="Pressupostos do abastecimento">
          <ul>
            {plan.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Details>
      ) : null}
    </div>
  );
}
