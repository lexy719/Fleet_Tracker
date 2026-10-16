/* ─────────────────────────────────────────────────────
   Fuel Intelligence (Project 2) — station-level fuel prices, Iberia.

   Sources publish the CURRENT price per station; history is built here by keeping
   one observation per distinct price (run-length), never by overwriting.
   Every observation is traceable to source, snapshot and parser version.
   ───────────────────────────────────────────────────── */

export type Country = "PT" | "ES";

/** Normalised fuel types. The source's own label is always kept next to it. */
export type FuelType =
  | "diesel"
  | "diesel_premium"
  /** Rebated agricultural/off-road diesel (PT «gasóleo colorido», ES «gasóleo B») — not for road trucks. */
  | "diesel_agricultural"
  | "hvo"
  | "biodiesel"
  | "gasoline95"
  | "gasoline95_premium"
  | "gasoline98"
  | "lpg"
  | "cng"
  | "lng"
  | "hydrogen"
  | "adblue"
  | "other";

export type PriceUnit = "EUR/L" | "EUR/kg" | "EUR/m3";

/** Whether the publisher's terms allow commercial reuse — decides what may leave research mode. */
export type CommercialUse = "permitted" | "prohibited" | "unknown";

export type FuelSource = {
  id: string;
  name: string;
  authority: string;
  country: Country;
  landingUrl: string;
  /** One or more GETs whose responses together form one snapshot (e.g. one per fuel type). */
  requests: { url: string; label: string; accept?: string }[];
  parser: "miteco-stations" | "dgeg-stations";
  license: string;
  commercialUse: CommercialUse;
  /** How often to check; source update cadence noted in `notes`. */
  checkEveryMin: number;
  notes: string[];
};

export type FuelStation = {
  /** `${sourceId}:${externalId}` */
  id: string;
  sourceId: string;
  externalId: string;
  country: Country;
  name?: string;
  brand?: string;
  address?: string;
  postcode?: string;
  locality?: string;
  municipality?: string;
  region?: string;
  lat: number;
  lon: number;
  /** e.g. DGEG «Auto-estrada» / «Área comercial (Hipermercados)». */
  stationType?: string;
  openingHours?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Set when the station stops appearing in the source. Absence is not closure. */
  missingSinceAt?: string;
};

export type FuelPriceObservation = {
  stationId: string;
  fuelType: FuelType;
  /** Verbatim source label, e.g. «Gasóleo simples», «Precio Gasoleo A». */
  sourceLabel: string;
  price: number;
  unit: PriceUnit;
  currency: "EUR";
  /** Price basis as published (retail pump price incl. taxes unless stated otherwise). */
  taxBasis: string;
  /**
   * When the source says this price took effect, if it says so per station
   * (DGEG: last communicated change). MITECO publishes only a feed-wide time.
   */
  sourceValidFrom?: string;
  /** Feed-wide publication time, if the source declares one. */
  sourcePublishedAt?: string;
  sourceId: string;
  snapshotId: string;
  parserVersion: number;
  /** First and last time Project 2 saw this exact price. */
  firstSeenAt: string;
  lastSeenAt: string;
  /** Set when a different price replaced this one. Never deleted. */
  supersededAt?: string;
};

export type FuelParseOutput = {
  stations: Omit<FuelStation, "firstSeenAt" | "lastSeenAt" | "missingSinceAt">[];
  prices: Omit<FuelPriceObservation, "firstSeenAt" | "lastSeenAt" | "supersededAt">[];
  errors: string[];
  publishedAt?: string;
  publishedAtBasis?: string;
  recordCount: number;
};
