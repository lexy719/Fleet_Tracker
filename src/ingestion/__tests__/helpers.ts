import type { FetchImpl } from "../pipeline";
import type { RawSnapshot } from "../types";

/** Real payloads captured from the official sources on 2026-09-30 (see __fixtures__). */
const FIXTURES = import.meta.glob<string>("../__fixtures__/*", { query: "?raw", import: "default", eager: true });

export function fixture(name: string): string {
  const body = FIXTURES[`../__fixtures__/${name}`];
  if (body === undefined) throw new Error(`fixture ${name} missing`);
  return body;
}

export function snapshot(sourceId: string, body: string, fetchedAt = "2026-09-30T18:00:00.000Z"): RawSnapshot {
  return { id: `${sourceId}@${fetchedAt}`, sourceId, fetchedAt, httpStatus: 200, contentType: "", byteLength: body.length, sha256: "x", body };
}

/** fetch stub: each call pops the next scripted response (or error). */
export function scriptedFetch(steps: (string | { status: number; body?: string } | Error | "hang")[]): FetchImpl & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string, init: { signal: AbortSignal }) => {
    calls.push(url);
    const step = steps.shift();
    if (step === undefined) throw new Error("no scripted response");
    if (step instanceof Error) throw step;
    if (step === "hang") {
      return new Promise<Response>((_, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    if (typeof step === "string") return new Response(step, { status: 200 });
    return new Response(step.body ?? "", { status: step.status });
  }) as unknown as FetchImpl & { calls: string[] };
  f.calls = calls;
  return f;
}

/**
 * SYNTHETIC DATEX II v3 payload — same structure as Porto's feed, but with record types
 * the real feed does not contain today (roadClosed, gmlLineString). Used only to prove
 * the path from a structured closure to the evaluator. Never shipped as data.
 */
export function syntheticDatex(opts: {
  publicationTime: string;
  records: {
    id: string;
    mgmt?: string;
    type?: string;
    start: string;
    end?: string;
    comment?: string;
    line?: [number, number][];
    polygon?: [number, number][];
    vehicles?: string;
  }[];
}): string {
  const rec = (r: (typeof opts.records)[number]) => `
    <sit:situation id="${r.id}">
      <sit:situationRecord id="${r.id}" version="1.0" xsi:type="sit:${r.type ?? "RoadOrCarriagewayOrLaneManagement"}">
        <sit:validity>
          <com:validityStatus>definedByValidityTimeSpec</com:validityStatus>
          <com:validityTimeSpecification>
            <com:overallStartTime>${r.start}</com:overallStartTime>${r.end ? `
            <com:overallEndTime>${r.end}</com:overallEndTime>` : ""}
          </com:validityTimeSpecification>
        </sit:validity>${r.comment ? `
        <sit:generalPublicComment><sit:comment><com:values><com:value lang="pt">${r.comment}</com:value></com:values></sit:comment></sit:generalPublicComment>` : ""}
        <sit:locationReference xsi:type="loc:${r.line ? "LinearLocation" : "AreaLocation"}">${r.line ? `
          <loc:gmlLineString><loc:posList>${r.line.map((p) => `${p[0]} ${p[1]}`).join(" ")}</loc:posList></loc:gmlLineString>` : `
          <loc:gmlMultiPolygon><loc:gmlPolygon><loc:exterior><loc:posList>${(r.polygon ?? []).map((p) => `${p[0]} ${p[1]}`).join(" ")}</loc:posList></loc:exterior></loc:gmlPolygon></loc:gmlMultiPolygon>`}
        </sit:locationReference>${r.vehicles ? `
        <sit:forVehiclesWithCharacteristicsOf>${r.vehicles}</sit:forVehiclesWithCharacteristicsOf>` : ""}${r.mgmt ? `
        <sit:roadOrCarriagewayOrLaneManagementType>${r.mgmt}</sit:roadOrCarriagewayOrLaneManagementType>` : ""}
      </sit:situationRecord>
    </sit:situation>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<con:messageContainer xmlns:con="http://datex2.eu/schema/3/messageContainer">
  <con:payload xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="sit:SituationPublication">
    <com:publicationTime>${opts.publicationTime}</com:publicationTime>${opts.records.map(rec).join("")}
  </con:payload>
</con:messageContainer>`;
}
