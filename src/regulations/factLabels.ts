/** Portuguese labels for fact ids used in regulation conditions (explanations only). */
const FACT_LABELS: Record<string, string> = {
  "vehicle.grossWeightKg": "Peso bruto da viatura",
  "vehicle.axleCount": "Número de eixos",
  "vehicle.firstAxleHeightM": "Altura medida na vertical do primeiro eixo",
  "vehicle.isGoodsVehicle": "Viatura destinada ao transporte de carga",
  "vehicle.ownerCategory": "Categoria do proprietário da viatura",
};

export function factLabel(factId: string): string {
  if (FACT_LABELS[factId]) return FACT_LABELS[factId]!;
  if (factId.startsWith("authorization.")) return `Autorização "${factId.slice("authorization.".length)}"`;
  return factId;
}
