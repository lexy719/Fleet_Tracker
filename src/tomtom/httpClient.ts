type RequestOptions = {
  signal?: AbortSignal;
  /** When set, the request is a POST with this JSON body. */
  jsonBody?: unknown;
  timeoutMs?: number;
  retries?: number;
};

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function tomtomFetchJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const retries = Math.max(0, opts.retries ?? 1);
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    const abortListener = () => controller.abort();
    opts.signal?.addEventListener("abort", abortListener);

    try {
      const res = await fetch(
        url,
        opts.jsonBody === undefined
          ? { signal: controller.signal }
          : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(opts.jsonBody), signal: controller.signal },
      );
      if (!res.ok) {
        const body = await res.text();
        const short = body.slice(0, 220);
        if (isTransientStatus(res.status) && attempt < retries) {
          attempt += 1;
          await sleep(200 * attempt);
          continue;
        }
        throw new Error(`TomTom ${res.status}: ${short}`);
      }
      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        const message = opts.signal?.aborted ? "Request cancelled" : `TomTom timeout after ${timeoutMs}ms`;
        lastError = new Error(message);
      } else if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error("Unknown TomTom request failure");
      }
      if (attempt < retries) {
        attempt += 1;
        await sleep(200 * attempt);
        continue;
      }
      throw lastError;
    } finally {
      globalThis.clearTimeout(timeoutId);
      opts.signal?.removeEventListener("abort", abortListener);
    }
  }

  throw lastError ?? new Error("TomTom request failed");
}
