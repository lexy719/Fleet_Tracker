import { useEffect, useState } from "react";
import { reverseGeocode } from "../../tomtom/reverseGeocode";

export function PopupAddress({
  apiKey,
  lat,
  lng,
}: {
  apiKey: string | undefined;
  lat: number;
  lng: number;
}) {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    let cancel = false;
    reverseGeocode(apiKey, lat, lng).then((a) => {
      if (!cancel) setLine(a);
    });
    return () => {
      cancel = true;
    };
  }, [apiKey, lat, lng]);

  if (!apiKey) return null;
  return <div className="mt-1 text-[11px] leading-snug" style={{ color: "#6B6B6B" }}>{line ?? "…"}</div>;
}
