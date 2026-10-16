import type { FuelSource } from "./types";

/*
 * Fuel source registry — DATA. Checked 2026-10-11: both services answer with CORS «*».
 */

const DGEG_API = "https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PesquisarPostos";
const dgeg = (id: number, label: string) => ({ url: `${DGEG_API}?idsTiposComb=${id}&qtdPorPagina=9999&pagina=1`, label });

export const FUEL_SOURCES: FuelSource[] = [
  {
    id: "miteco-estaciones-terrestres",
    name: "Espanha — Precios de carburantes (Geoportal, estações terrestres)",
    authority: "Ministerio para la Transición Ecológica y el Reto Demográfico (MITECO)",
    country: "ES",
    landingUrl: "https://geoportalgasolineras.es/",
    requests: [
      {
        url: "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/",
        label: "todas as estações e produtos",
        // Without this the service answers XML.
        accept: "application/json",
      },
    ],
    parser: "miteco-stations",
    license: "Dados públicos do MITECO (datos.gob.es); licença exata da ficha a confirmar antes de uso comercial",
    commercialUse: "unknown",
    checkEveryMin: 30,
    notes: ["Atualizado de 30 em 30 minutos (campo «Nota» do serviço). ~11 500 estações; ~3 000 com AdBlue (2026-10-11). Cerca de 12 MB por pedido."],
  },
  {
    id: "dgeg-precos-combustiveis",
    name: "Portugal — Preços dos Combustíveis Online (DGEG)",
    authority: "Direção-Geral de Energia e Geologia (DGEG)",
    country: "PT",
    landingUrl: "https://precoscombustiveis.dgeg.gov.pt/",
    requests: [
      dgeg(2101, "Gasóleo simples"),
      dgeg(2105, "Gasóleo especial"),
      dgeg(3201, "Gasolina simples 95"),
      dgeg(3205, "Gasolina especial 95"),
      dgeg(3400, "Gasolina 98"),
      dgeg(3405, "Gasolina especial 98"),
      dgeg(1120, "GPL Auto"),
      dgeg(1143, "GNC (gás natural comprimido) - €/kg"),
      dgeg(1142, "GNL (gás natural liquefeito) - €/kg"),
    ],
    parser: "dgeg-stations",
    license: "«A informação disponível neste sítio é gratuita, podendo ser utilizada livremente. É proibida a sua utilização para fins comerciais.»",
    commercialUse: "prohibited",
    checkEveryMin: 60,
    notes: [
      "Postos obrigados a comunicar cada alteração antes de a aplicar (DL 243/2008). Só continente.",
      "API interna do portal, não documentada. Sem AdBlue.",
      "Uso comercial proibido pelos termos do portal: só modo investigação até autorização escrita da DGEG.",
    ],
  },
];

export function getFuelSource(id: string): FuelSource | undefined {
  return FUEL_SOURCES.find((s) => s.id === id);
}
