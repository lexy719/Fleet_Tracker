/** Search API — reverse geocode (coordinates → address) */

import { getTomTomRestBase } from "./config";
import { tomtomFetchJson } from "./httpClient";

export async function reverseGeocode(
  key: string,
  lat: number,
  lng: number,
): Promise<string | null> {
  const params = new URLSearchParams({
    key,
    limit: "1",
  });
  const url = `${getTomTomRestBase()}/search/2/reverseGeocode/${lat},${lng}.json?${params.toString()}`;
  try {
    const data = await tomtomFetchJson<{
      addresses?: { address?: { freeformAddress?: string } }[];
    }>(url, { timeoutMs: 9_000, retries: 1 });
    return data.addresses?.[0]?.address?.freeformAddress ?? null;
  } catch {
    return null;
  }
}
