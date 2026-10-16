import { fromLocalMinute } from "../../ingestion/time";
import type { FuelParseOutput, FuelType, PriceUnit } from "../types";

/*
 * MITECO «Precios de carburantes — Estaciones terrestres» (REST, JSON with Accept header).
 * Root: { Fecha: "dd/mm/yyyy hh:mm:ss" (Europe/Madrid), ListaEESSPrecio: [...], Nota, ResultadoConsulta }.
 * Station fields (verified 2026-10-11): IDEESS, Rótulo, Dirección, C.P., Localidad, Municipio,
 * Provincia, Latitud / Longitud (WGS84) with decimal comma, Horario, Tipo Venta (P = público),
 * and one «Precio …» field per product (empty string = not sold). Prices are retail, incl. taxes.
 */

export const MITECO_PARSER_VERSION = 1;
export const MADRID = "Europe/Madrid";

/** «Precio …» field → normalised type and unit. Units checked against the published values. */
export const MITECO_PRODUCTS: Record<string, { type: FuelType; unit: PriceUnit }> = {
  "Precio Gasoleo A": { type: "diesel", unit: "EUR/L" },
  "Precio Gasoleo Premium": { type: "diesel_premium", unit: "EUR/L" },
  "Precio Gasoleo B": { type: "diesel_agricultural", unit: "EUR/L" },
  "Precio Diésel Renovable": { type: "hvo", unit: "EUR/L" },
  "Precio Biodiesel": { type: "biodiesel", unit: "EUR/L" },
  "Precio Gasolina 95 E5": { type: "gasoline95", unit: "EUR/L" },
  "Precio Gasolina 95 E5 Premium": { type: "gasoline95_premium", unit: "EUR/L" },
  "Precio Gasolina 98 E5": { type: "gasoline98", unit: "EUR/L" },
  "Precio Gases licuados del petróleo": { type: "lpg", unit: "EUR/L" },
  "Precio Gas Natural Comprimido": { type: "cng", unit: "EUR/kg" },
  "Precio Gas Natural Licuado": { type: "lng", unit: "EUR/kg" },
  "Precio Hidrogeno": { type: "hydrogen", unit: "EUR/kg" },
  "Precio Adblue": { type: "adblue", unit: "EUR/L" },
};

const num = (v: unknown): number | undefined => {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ") : undefined);

/** "11/10/2026 12:24:55" (Madrid) → ISO UTC. */
function mitecoTime(s: unknown): string | undefined {
  const m = typeof s === "string" ? s.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/) : null;
  if (!m) return undefined;
  const ms = fromLocalMinute(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}`, MADRID);
  return ms === null ? undefined : new Date(ms).toISOString();
}

export function parseMiteco(body: string, ctx: { sourceId: string; snapshotId: string }): FuelParseOutput {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (e) {
    return { stations: [], prices: [], errors: [`JSON inválido (o serviço responde XML sem Accept: application/json): ${String(e).slice(0, 120)}`], recordCount: 0 };
  }
  const root = json as { Fecha?: unknown; ListaEESSPrecio?: unknown; ResultadoConsulta?: unknown };
  if (!Array.isArray(root.ListaEESSPrecio)) return { stations: [], prices: [], errors: [`resposta sem «ListaEESSPrecio» (ResultadoConsulta = ${String(root.ResultadoConsulta)})`], recordCount: 0 };
  const publishedAt = mitecoTime(root.Fecha);
  const out: FuelParseOutput = {
    stations: [],
    prices: [],
    errors: [],
    recordCount: root.ListaEESSPrecio.length,
    ...(publishedAt ? { publishedAt, publishedAtBasis: "campo «Fecha» do serviço (hora de Madrid)" } : {}),
  };
  const seen = new Set<string>();
  for (const [i, raw] of (root.ListaEESSPrecio as Record<string, unknown>[]).entries()) {
    const ext = str(raw.IDEESS);
    const lat = num(raw.Latitud);
    const lon = num(raw["Longitud (WGS84)"]);
    if (!ext || lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      out.errors.push(`estação ${i} sem IDEESS ou coordenadas válidas`);
      continue;
    }
    if (seen.has(ext)) {
      out.errors.push(`IDEESS ${ext} duplicado (ignorado)`);
      continue;
    }
    seen.add(ext);
    if (str(raw["Tipo Venta"]) && str(raw["Tipo Venta"]) !== "P") continue; // restricted-sale stations are not public pumps
    const stationId = `${ctx.sourceId}:${ext}`;
    const brand = str(raw["Rótulo"]);
    out.stations.push({
      id: stationId,
      sourceId: ctx.sourceId,
      externalId: ext,
      country: "ES",
      ...(brand ? { brand, name: brand } : {}),
      ...(str(raw["Dirección"]) ? { address: str(raw["Dirección"])! } : {}),
      ...(str(raw["C.P."]) ? { postcode: str(raw["C.P."])! } : {}),
      ...(str(raw.Localidad) ? { locality: str(raw.Localidad)! } : {}),
      ...(str(raw.Municipio) ? { municipality: str(raw.Municipio)! } : {}),
      ...(str(raw.Provincia) ? { region: str(raw.Provincia)! } : {}),
      ...(str(raw.Horario) ? { openingHours: str(raw.Horario)! } : {}),
      lat,
      lon,
    });
    for (const [label, def] of Object.entries(MITECO_PRODUCTS)) {
      const price = num(raw[label]);
      if (price === undefined) continue;
      if (price <= 0 || price > 50) {
        out.errors.push(`${stationId} ${label}: preço fora do intervalo plausível (${price}) — ignorado`);
        continue;
      }
      out.prices.push({
        stationId,
        fuelType: def.type,
        sourceLabel: label,
        price,
        unit: def.unit,
        currency: "EUR",
        taxBasis: "PVP com impostos (preço de venda ao público)",
        ...(publishedAt ? { sourcePublishedAt: publishedAt } : {}),
        sourceId: ctx.sourceId,
        snapshotId: ctx.snapshotId,
        parserVersion: MITECO_PARSER_VERSION,
      });
    }
  }
  return out;
}
