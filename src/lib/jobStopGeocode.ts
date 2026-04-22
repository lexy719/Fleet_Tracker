/**
 * Resolve lat/lng for job stops using Nominatim (OpenStreetMap).
 *
 * Fallback chain:
 *  1. Full address as entered (works for PT, ES, FR, DE, etc.)
 *  2. Business name alone (e.g. "Pingo Doce Vieira do Minho")
 *  3. null — caller shows an error, no silent city-centre fallback
 *
 * Country restriction:
 *  - Iberian-only (pt,es) when forceWorldwide=false AND address looks domestic
 *  - Worldwide when forceWorldwide=true OR address contains a non-PT/ES postal
 *    code pattern (FR 5-digit, DE 5-digit, NL 4-digit+letters, etc.)
 *
 * City-only geocoding was intentionally removed: it caused every stop in the
 * same city to land on the exact same pin (city centre).
 */
import { nominatimGeocode } from "./nominatim";

/** Heuristic: does this address look like it's outside the Iberian Peninsula? */
function looksInternational(address: string): boolean {
  const a = address.toLowerCase();
  // FR postal codes: 5 digits starting 01–98
  // DE postal codes: 5 digits starting 01–99
  // FR/DE/BE/NL/IT keywords in address
  const foreignPatterns = [
    /\b\d{5}\b.*(?:france|fr\b)/i,
    /\b(?:rue|avenue|av\.|boulevard|bd\.|chemin|allée|place)\b/i, // French street types
    /\b(?:straße|strasse|str\.|gasse|weg|platz|allee)\b/i,         // German street types
    /\b(?:via |corso |piazza |viale )/i,                           // Italian
    /\b\d{4}\s?[a-z]{2}\b/i,                                      // NL postal (1234 AB)
    /saint.martin|grenoble|paris|lyon|marseille|bordeaux|lille|toulouse|nantes|strasbourg|montpellier/i,
    /berlin|munich|münchen|hamburg|frankfurt|köln|düsseldorf|stuttgart/i,
    /london|manchester|birmingham|glasgow/i,
    /\b(france|allemagne|germany|italia|italy|nederland|netherlands|belgique|belgium|suisse|switzerland)\b/i,
  ];
  return foreignPatterns.some((re) => re.test(a));
}

export async function resolveStopCoordinates(
  address: string,
  _apiKey?: string,          // kept for API compatibility — routing still uses TomTom
  businessName?: string,
  forceWorldwide?: boolean,
): Promise<{ lat: number; lng: number } | null> {
  const addr    = address.trim();
  const bizName = businessName?.trim() || "";

  // Determine country scope: worldwide for international addresses
  const worldwide = forceWorldwide || looksInternational(addr) || looksInternational(bizName);
  const geoOpts = worldwide ? { countrycodes: null } : undefined;

  try {
    // 1. Full address
    if (addr) {
      const hit = await nominatimGeocode(addr, geoOpts);
      if (hit) return hit;
    }

    // 2. Business name
    if (bizName) {
      const hit = await nominatimGeocode(bizName, geoOpts);
      if (hit) return hit;
    }

    // 3. If we used country restriction and still failed, retry worldwide
    if (!worldwide && addr) {
      const hit = await nominatimGeocode(addr, { countrycodes: null });
      if (hit) return hit;
    }
  } catch {
    /* network error */
  }

  return null;
}
