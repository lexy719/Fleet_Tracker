import { getTomTomKey, tomTomMapStyleUrl, TOMTOM } from "./config";

/** Reuses production credentials/custom style and its MapLibre renderer. Never substitutes another provider. */
export function environmentTomTomStyle(): string | null {
  const key = getTomTomKey();
  if (!key) return null;
  return (
    tomTomMapStyleUrl(key) ??
    `https://api.tomtom.com/map/1/style/22.2.1-9/2/basic_street-light.json?key=${encodeURIComponent(key)}`
  );
}
export const TOMTOM_ATTRIBUTION = TOMTOM.attribution;
