import type { GuidedLens, GuidedState } from "../guidedWorkspace";
import { TRAILERS, TRUCKS, driverWorld, dur, hm, NOW, SPELL_LIMIT, type RestrictionWorld } from "../world";
import { labWorld } from "./model";

export type ImpactLine = {
  tone: "ok" | "unknown" | "action" | "history" | "neutral";
  text: string;
  domain?: GuidedLens;
};
export type Impact = {
  title: string;
  from: string;
  to: string;
  why: string;
  changes: ImpactLine[];
  unchanged: string[];
  /** Facts that stay unknown after the change: Confirm needs an explicit acknowledgement. */
  uncertain: string[];
  affected: GuidedLens[];
  event: string;
};
const VERDICT: Record<RestrictionWorld["result"], string> = {
  APPLIES: "Aplica-se",
  DOES_NOT_APPLY: "Não se aplica",
  UNKNOWN: "Desconhecido",
};
const m = (v: number) => `${v.toFixed(2).replace(".", ",")} m`;

/** Compares the committed world with the previewed one. Nothing is invented: where the lab cannot compute, it says so. */
export function impactOf(state: GuidedState): Impact | null {
  const p = state.pending;
  if (!p) return null;
  const now = labWorld(state, false);
  const next = labWorld(state, true);
  const vciNow = now.restrictions.find((r) => r.id === "RI-042");
  const vciNext = next.restrictions.find((r) => r.id === "RI-042");
  const verdictLine = (): ImpactLine[] =>
    vciNow && vciNext && vciNow.result !== vciNext.result
      ? [{ tone: vciNext.result === "UNKNOWN" ? "unknown" : vciNext.result === "APPLIES" ? "action" : "ok", text: `VCI Porto: ${VERDICT[vciNow.result]} → ${VERDICT[vciNext.result]}`, domain: "Restrictions" }]
      : vciNext
        ? [{ tone: vciNext.result === "UNKNOWN" ? "unknown" : "neutral", text: `VCI Porto continua «${VERDICT[vciNext.result]}»`, domain: "Restrictions" }]
        : [];
  const cmr = now.ledger[0];
  const docLine = (what: string): ImpactLine =>
    cmr.state === "ISSUED"
      ? { tone: "history", text: `${cmr.number} continua histórica: o snapshot emitido não muda · reemitir para fixar ${what}`, domain: "Documents" }
      : { tone: "neutral", text: `A guia CMR ainda não foi emitida: vai fixar ${what} na emissão`, domain: "Documents" };
  const job = now.job;
  switch (p.kind) {
    case "trailer": {
      const a = TRAILERS[p.from], b = TRAILERS[p.to!];
      const adr = job.cargo.some((c) => c.adr);
      const cold = job.cargo.some((c) => c.tempC != null);
      const fitsAdr = !adr || b.capabilities.includes("Equipado ADR");
      const fitsCold = !cold || b.type === "Frigorífico";
      return {
        title: "Reboque",
        from: a ? `${a.id} · ${a.type.toLowerCase()}` : `${p.from} (não existe)`,
        to: `${b.id} · ${b.type.toLowerCase()}`,
        why: a ? "Troca do reboque do conjunto" : "O reboque atribuído não existe na frota",
        changes: [
          { tone: next.pallets <= b.pallets ? "ok" : "action", text: `${next.pallets} paletes em ${b.pallets} posições`, domain: "Trucks" },
          { tone: fitsAdr ? "ok" : "action", text: adr ? (fitsAdr ? "Mercadoria ADR: reboque equipado" : "Mercadoria ADR: reboque sem equipamento ADR") : "Carga sem ADR", domain: "Trucks" },
          ...(cold ? [{ tone: fitsCold ? ("ok" as const) : ("action" as const), text: fitsCold ? "Carga refrigerada: reboque frigorífico" : "Carga refrigerada num reboque sem frio", domain: "Trucks" as const }] : []),
          { tone: "ok", text: `Altura ${m(b.heightM)} · ${b.axles} eixos (o conjunto mantém ${now.truck.axles + b.axles} eixos)`, domain: "Restrictions" },
          docLine("o novo reboque"),
          { tone: "action", text: "O plano fica «A replanear» até reconfirmar o conjunto", domain: "Jobs" },
        ],
        unchanged: ["Motorista e viatura", "Rota e paragens", "Janela de entrega"],
        uncertain: [],
        affected: ["Trucks", "Documents", "Restrictions", "Jobs"],
        event: "ASSIGNMENT_UPDATED · trailerId",
      };
    }
    case "truck": {
      const a = TRUCKS[p.from], b = TRUCKS[p.to!];
      return {
        title: "Viatura",
        from: `${a.plate} · ${a.make} ${a.model}`,
        to: `${b.plate} · ${b.make} ${b.model}`,
        why: a.availability === "MAINTENANCE" ? `${a.plate} está em oficina` : "Troca da viatura do conjunto",
        changes: [
          { tone: b.availability === "AVAILABLE" ? "ok" : "action", text: b.availability === "AVAILABLE" ? `${b.plate} disponível (registo manual)` : `${b.plate} também está indisponível`, domain: "Trucks" },
          { tone: !job.cargo.some((c) => c.adr) || b.adrEquipped ? "ok" : "action", text: job.cargo.some((c) => c.adr) ? (b.adrEquipped ? "ADR equipado" : "Sem equipamento ADR para esta carga") : "Carga sem ADR", domain: "Trucks" },
          { tone: b.firstAxleHeightM == null ? "unknown" : "ok", text: b.firstAxleHeightM == null ? "Altura ao 1.º eixo não registada" : `1.º eixo ${m(b.firstAxleHeightM)}`, domain: "Restrictions" },
          { tone: "neutral", text: `Combustível ${b.fuel.value}% (${b.fuel.prov.source}, ${b.fuel.prov.at})`, domain: "Trucks" },
          docLine("a nova matrícula"),
        ],
        unchanged: ["Reboque e carga", "Motorista", "Rota"],
        uncertain: b.firstAxleHeightM == null ? ["Altura ao 1.º eixo da nova viatura"] : [],
        affected: ["Trucks", "Restrictions", "Documents", "Jobs"],
        event: "ASSIGNMENT_UPDATED · truckId",
      };
    }
    case "driver": {
      const a = driverWorld(p.from), b = driverWorld(p.to!);
      const qual = b.qualifications.find((q) => q.state === "EXPIRED" || q.state === "EXPIRING");
      const adr = job.cargo.some((c) => c.adr);
      return {
        title: "Motorista",
        from: `${a.name} · ${a.id}`,
        to: `${b.name} · ${b.id}`,
        why: "Reatribuição do motorista",
        changes: [
          { tone: qual?.state === "EXPIRED" ? "action" : qual ? "unknown" : "ok", text: qual ? `${qual.label} ${qual.state === "EXPIRED" ? "caducada" : `a caducar ${qual.until}`}` : "Habilitações válidas", domain: "Documents" },
          ...(adr ? [{ tone: "action" as const, text: "Carga ADR: certificado ADR do motorista não registado", domain: "Documents" as const }] : []),
          { tone: "unknown", text: `Horas de ${b.name.split(" ")[0]}: base manual ${b.baseline.recordedLabel} — o dia tem de ser recalculado`, domain: "Drivers" },
          docLine("o novo motorista"),
        ],
        unchanged: ["Viatura e reboque", "Rota e janela"],
        uncertain: [`Tempo de condução disponível de ${b.name}`],
        affected: ["Drivers", "Documents", "Jobs"],
        event: "ASSIGNMENT_UPDATED · driverId",
      };
    }
    case "axle": {
      const v = Number(p.to);
      return {
        title: "Altura ao 1.º eixo",
        from: p.from === "" ? "não registada" : m(Number(p.from)),
        to: m(v),
        why: "Facto em falta usado pela VCI Porto",
        changes: [
          { tone: v >= 1.1 ? "neutral" : "ok", text: `${m(v)} ${v >= 1.1 ? "≥" : "<"} 1,10 m → condição «Altura ao 1.º eixo» ${v >= 1.1 ? "verifica-se" : "falha"}`, domain: "Restrictions" },
          ...verdictLine(),
          { tone: "neutral", text: `Fica no registo de ${now.truck.plate} para todos os transportes`, domain: "Trucks" },
        ],
        unchanged: ["Peso, eixos e tipo de viatura", "Janela da VCI", "Guia CMR"],
        uncertain: vciNext?.result === "UNKNOWN" ? ["Habilitação VCI continua por confirmar"] : [],
        affected: ["Trucks", "Restrictions"],
        event: "VEHICLE_FACT_RECORDED · firstAxleHeightM",
      };
    }
    case "authorization":
      return {
        title: "Habilitação VCI",
        from: "não registada",
        to: p.to === "1" ? "registada" : "não detém",
        why: "Isenção que decide a VCI quando as condições se verificam",
        changes: verdictLine(),
        unchanged: ["Factos físicos da viatura", "Rota"],
        uncertain: p.to === "1" ? ["Sem documento da habilitação anexado"] : [],
        affected: ["Restrictions", "Documents"],
        event: "AUTHORIZATION_RECORDED · pt-vci-habilitacao",
      };
    case "fuel-reading": {
      const before = now.rangeKm, after = next.rangeKm;
      return {
        title: "Leitura de combustível",
        from: `${now.truck.fuel.value}% · ${now.truck.fuel.prov.at}`,
        to: `${p.to}% · agora`,
        why: "Nova leitura manual substitui a estimativa",
        changes: [
          { tone: "ok", text: `Autonomia ≈ ${before} → ≈ ${after} km (consumo assumido)`, domain: "Trucks" },
          { tone: "neutral", text: after >= now.route.km - (job.positionKm ?? 0) ? "Chega ao destino sem abastecer" : "Continua a precisar de abastecer", domain: "Fuel" },
        ],
        unchanged: ["Consumo assumido do cenário", "Paragem planeada"],
        uncertain: [],
        affected: ["Trucks", "Fuel"],
        event: "VEHICLE_READING_RECORDED · fuel",
      };
    }
    case "maintenance":
      return {
        title: "Estado de oficina",
        from: "Em manutenção",
        to: "Disponível",
        why: "Reparação dada como concluída",
        changes: [
          { tone: "ok", text: `${job.id} deixa de estar bloqueado pela viatura`, domain: "Jobs" },
          { tone: "neutral", text: "Disponibilidade continua a ser registo manual", domain: "Trucks" },
        ],
        unchanged: ["Motorista", "Carga e reboque"],
        uncertain: ["Sem confirmação escrita da oficina"],
        affected: ["Trucks", "Jobs"],
        event: "VEHICLE_AVAILABILITY_UPDATED",
      };
    case "qualification": {
      const d = driverWorld(p.id.split(":")[0]);
      return {
        title: "CQM (CPC)",
        from: d.qualifications.find((q) => q.kind === "cpc")?.until ?? "—",
        to: `válido até ${p.to}`,
        why: `Renovação de ${d.name}`,
        changes: [
          { tone: "ok", text: `${d.name} pode conduzir transportes com o CQM em dia`, domain: "Drivers" },
          { tone: "neutral", text: "A guia CMR não fixa habilitações: nada a reemitir", domain: "Documents" },
        ],
        unchanged: ["Carta CE e tacógrafo", "Horas de condução"],
        uncertain: ["Comprovativo da renovação ainda não anexado"],
        affected: ["Documents", "Drivers"],
        event: "QUALIFICATION_RECORDED · cpc",
      };
    }
    case "baseline": {
      const limitNow = hm(NOW.min + (SPELL_LIMIT - now.driver.spellMin)),
        limitNext = hm(NOW.min + (SPELL_LIMIT - next.driver.spellMin));
      return {
        title: "Base de horas",
        from: `${dur(now.driver.baseline.drivenBeforeMin)} antes das 06:45`,
        to: `${dur(Number(p.to))} antes das 06:45`,
        why: "Correção manual da condução anterior ao turno",
        changes: [
          { tone: limitNext < limitNow ? "action" : "ok", text: `Limite de 4h30: ${limitNow} → ${limitNext}`, domain: "Drivers" },
          { tone: "unknown", text: "A pausa planeada tem de ser revista contra o novo limite", domain: "Fuel" },
        ],
        unchanged: ["Rota", "Viatura"],
        uncertain: ["Continua a não ser leitura de tacógrafo"],
        affected: ["Drivers", "Fuel"],
        event: "DRIVER_BASELINE_CORRECTED",
      };
    }
    case "issue":
      return {
        title: "Guia CMR",
        from: cmr.state === "MISSING" ? "Em falta" : "Por emitir",
        to: "Emitida · CMR 2026/000413",
        why: cmr.reason ?? "Obrigatória antes da partida",
        changes: [
          { tone: "ok", text: `Snapshot da revisão ${job.revision}: ${next.pallets} paletes · ${next.cargoKg.toLocaleString("pt-PT")} kg`, domain: "Documents" },
          { tone: next.trailer ? "ok" : "action", text: next.trailer ? `Reboque ${next.trailer.plate} · ${next.driver.name}` : "Sem reboque válido: a guia não pode ser emitida", domain: "Trucks" },
          { tone: "history", text: "Depois de emitida, alterações ao transporte não mudam a guia", domain: "Documents" },
        ],
        unchanged: ["Fatura continua bloqueada até à entrega"],
        uncertain: [],
        affected: ["Documents", "Jobs"],
        event: "DOCUMENT_ISSUED · origem LOCAL_USER",
      };
    case "reissue":
      return {
        title: "Guia CMR",
        from: "CMR 2026/000412 · 22 paletes",
        to: "CMR 2026/000413 · 24 paletes",
        why: "A carga mudou depois da emissão",
        changes: [
          { tone: "ok", text: "Nova guia com 24 paletes · 13 100 kg (snapshot da revisão 7)", domain: "Documents" },
          { tone: "action", text: "A guia em viagem deixa de ser válida — enviar a nova ao motorista", domain: "Drivers" },
          { tone: "history", text: "CMR 2026/000412 fica anulada e consultável", domain: "Documents" },
        ],
        unchanged: ["Rota, paragens e conjunto"],
        uncertain: [],
        affected: ["Documents", "Drivers"],
        event: "DOCUMENT_VOIDED · DOCUMENT_ISSUED · origem LOCAL_USER",
      };
    case "stop": {
      const to = next.candidates.find((c) => c.id === p.id);
      const from = now.candidates.find((c) => c.id === p.from);
      const short = (n?: string) => n?.replace("Área de serviço de ", "") ?? "—";
      return {
        title: "Paragem da pausa",
        from: short(from?.name),
        to: short(to?.name),
        why: to?.recommended ? "Paragem recomendada" : "Escolha do operador",
        changes: [
          { tone: to?.breakFits ? "ok" : "action", text: `Pausa às ${to?.arrival} · ${to?.marginMin} min de margem`, domain: "Drivers" },
          { tone: "neutral", text: `Coimbra às ${to?.coimbraEta} (era ${from?.coimbraEta})`, domain: "Jobs" },
          { tone: "action", text: "O plano fica «A replanear» até a rota ser reconfirmada", domain: "Jobs" },
        ],
        unchanged: ["Viatura, reboque e motorista", "Guia CMR"],
        uncertain: next.restrictions.some((r) => r.result === "UNKNOWN") ? ["Aplicabilidade da VCI desconhecida"] : [],
        affected: ["Fuel", "Drivers", "Jobs"],
        event: "STOP_UPDATED · origem LOCAL_USER",
      };
    }
  }
}
