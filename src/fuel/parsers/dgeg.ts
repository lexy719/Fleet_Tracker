import { fromLocalMinute, LISBON } from "../../ingestion/time";
import type { FuelParseOutput, FuelType, PriceUnit } from "../types";

/*
 * DGEG «Preços dos Combustíveis Online» — internal portal API (undocumented):
 * GET /api/PrecoComb/PesquisarPostos?idsTiposComb={id}&qtdPorPagina=9999&pagina=1
 * → { status, mensagem, resultado: [{ Id, Nome, TipoPosto, Municipio, Preco: "1,999 €",
 *     Marca, Combustivel, DataAtualizacao: "yyyy-mm-dd hh:mm" (Lisbon), Distrito, Morada,
 *     Localidade, CodPostal, Latitude, Longitude, Quantidade }] }  (verified 2026-10-10)
 * One response per fuel type; `DataAtualizacao` = last communicated price change.
 */

export const DGEG_PARSER_VERSION = 1;

export const DGEG_FUELS: Record<string, { type: FuelType; unit: PriceUnit }> = {
  "Gasóleo simples": { type: "diesel", unit: "EUR/L" },
  "Gasóleo especial": { type: "diesel_premium", unit: "EUR/L" },
  "Gasóleo colorido": { type: "diesel_agricultural", unit: "EUR/L" },
  "Gasolina simples 95": { type: "gasoline95", unit: "EUR/L" },
  "Gasolina especial 95": { type: "gasoline95_premium", unit: "EUR/L" },
  "Gasolina 98": { type: "gasoline98", unit: "EUR/L" },
  "Gasolina especial 98": { type: "gasoline98", unit: "EUR/L" },
  "GPL Auto": { type: "lpg", unit: "EUR/L" },
  "GNC (gás natural comprimido) - €/kg": { type: "cng", unit: "EUR/kg" },
  "GNC (gás natural comprimido) - €/m3": { type: "cng", unit: "EUR/m3" },
  "GNL (gás natural liquefeito) - €/kg": { type: "lng", unit: "EUR/kg" },
  "Biodiesel B15": { type: "biodiesel", unit: "EUR/L" },
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ") : undefined);

/** "1,999 €" → 1.999 */
function price(v: unknown): number | undefined {
  const m = typeof v === "string" ? v.match(/(\d+)[,.](\d+)/) : null;
  return m ? Number(`${m[1]}.${m[2]}`) : undefined;
}

/** "2026-10-06 11:35" (Lisbon) → ISO UTC. */
function dgegTime(v: unknown): string | undefined {
  const m = typeof v === "string" ? v.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/) : null;
  if (!m) return undefined;
  const ms = fromLocalMinute(`${m[1]}T${m[2]}`, LISBON);
  return ms === null ? undefined : new Date(ms).toISOString();
}

/** Parse ONE PesquisarPostos response (one fuel type). Combine several with `mergeParses`. */
export function parseDgeg(body: string, ctx: { sourceId: string; snapshotId: string }): FuelParseOutput {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (e) {
    return { stations: [], prices: [], errors: [`JSON inválido: ${String(e).slice(0, 120)}`], recordCount: 0 };
  }
  const root = json as { status?: unknown; mensagem?: unknown; resultado?: unknown };
  if (root.status !== true || !Array.isArray(root.resultado)) {
    return { stations: [], prices: [], errors: [`resposta DGEG sem resultado (status=${String(root.status)}, mensagem=${String(root.mensagem)})`], recordCount: 0 };
  }
  const out: FuelParseOutput = { stations: [], prices: [], errors: [], recordCount: root.resultado.length };
  let newest = "";
  for (const [i, r] of (root.resultado as Record<string, unknown>[]).entries()) {
    const ext = typeof r.Id === "number" || typeof r.Id === "string" ? String(r.Id) : undefined;
    const lat = typeof r.Latitude === "number" ? r.Latitude : undefined;
    const lon = typeof r.Longitude === "number" ? r.Longitude : undefined;
    if (!ext || lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      out.errors.push(`posto ${i} sem Id ou coordenadas válidas`);
      continue;
    }
    const stationId = `${ctx.sourceId}:${ext}`;
    out.stations.push({
      id: stationId,
      sourceId: ctx.sourceId,
      externalId: ext,
      country: "PT",
      ...(str(r.Nome) ? { name: str(r.Nome)! } : {}),
      ...(str(r.Marca) ? { brand: str(r.Marca)! } : {}),
      ...(str(r.Morada) ? { address: str(r.Morada)! } : {}),
      ...(str(r.CodPostal) ? { postcode: str(r.CodPostal)! } : {}),
      ...(str(r.Localidade) ? { locality: str(r.Localidade)! } : {}),
      ...(str(r.Municipio) ? { municipality: str(r.Municipio)! } : {}),
      ...(str(r.Distrito) ? { region: str(r.Distrito)! } : {}),
      ...(str(r.TipoPosto) ? { stationType: str(r.TipoPosto)! } : {}),
      lat,
      lon,
    });
    const label = str(r.Combustivel);
    const def = label ? DGEG_FUELS[label] : undefined;
    const p = price(r.Preco);
    if (!label || !def) {
      out.errors.push(`${stationId}: combustível não mapeado («${label ?? "?"}»)`);
      continue;
    }
    if (p === undefined || p <= 0 || p > 50) {
      out.errors.push(`${stationId} ${label}: preço ilegível ou implausível («${String(r.Preco)}»)`);
      continue;
    }
    const validFrom = dgegTime(r.DataAtualizacao);
    if (validFrom && validFrom > newest) newest = validFrom;
    out.prices.push({
      stationId,
      fuelType: def.type,
      sourceLabel: label,
      price: p,
      unit: def.unit,
      currency: "EUR",
      taxBasis: "PVP (preço de venda ao público) — inclusão de IVA/ISP presumida, não declarada pela API",
      ...(validFrom ? { sourceValidFrom: validFrom } : {}),
      sourceId: ctx.sourceId,
      snapshotId: ctx.snapshotId,
      parserVersion: DGEG_PARSER_VERSION,
    });
  }
  if (newest) {
    out.publishedAt = newest;
    out.publishedAtBasis = "máximo de DataAtualizacao (última alteração comunicada) dos postos";
  }
  return out;
}
