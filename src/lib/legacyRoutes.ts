/** Where a pre-Phase-5.5 "/app/..." URL now lives (bookmarks keep working). */
export function legacyTarget(pathname: string, search: string): string {
  const q = new URLSearchParams(search);
  const rest = pathname.replace(/^\/app\/?/, "");
  const enc = encodeURIComponent;
  if (rest.startsWith("jobs")) return q.get("job") ? `/work?job=${enc(q.get("job")!)}` : "/work";
  if (rest.startsWith("dispatch")) return "/dispatch";
  if (rest.startsWith("fleet")) return q.get("truck") ? `/fleet/trucks/${enc(q.get("truck")!)}` : "/fleet";
  if (rest.startsWith("drivers")) return q.get("driver") ? `/drivers/${enc(q.get("driver")!)}` : "/drivers";
  if (rest.startsWith("intelligence")) return "/intelligence";
  if (rest.startsWith("settings")) return "/settings";
  return "/";
}
