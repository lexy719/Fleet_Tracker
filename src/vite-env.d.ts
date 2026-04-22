/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOMTOM_API_KEY?: string;
  /** Optional override for TomTom Search `countrySet` (e.g. `PT,ES,FR`). Empty string = no country filter. */
  readonly VITE_TOMTOM_SEARCH_COUNTRY_SET?: string;
  readonly VITE_TOMTOM_REST_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
