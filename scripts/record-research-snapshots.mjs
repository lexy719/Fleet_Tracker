#!/usr/bin/env node
/*
 * Records REAL official documents used by the Phase 4 research tests (replayed offline).
 * Each file is stored byte-for-byte with its retrieval metadata (requested/final URL,
 * HTTP status, selected headers, SHA-256, retrieval time). Nothing is edited.
 *
 *   node scripts/record-research-snapshots.mjs
 *
 * Output: src/research/__fixtures__/real/<name> + manifest.json
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const OUT = resolve(import.meta.dirname, "../src/research/__fixtures__/real");
const IP = "https://servicos.infraestruturasdeportugal.pt";
const DOCS = [
  { name: "ip-alertas-ips-p0.html", url: `${IP}/pt-pt/alertas-ips` },
  { name: "ip-alertas-ips-p1.html", url: `${IP}/pt-pt/alertas-ips?page=1` },
  { name: "ip-alertas-ips-p2.html", url: `${IP}/pt-pt/alertas-ips?page=2` },
  { name: "ip-alertas-ips-p3.html", url: `${IP}/pt-pt/alertas-ips?page=3` },
  { name: "ip-ip3-vegetacao.html", url: `${IP}/pt-pt/alertas/rodovia/ip3-trabalhos-de-gestao-da-vegetacao` },
  { name: "ip-ip3-duplicacao-16.html", url: `${IP}/pt-pt/alertas/rodovia/ip3-coimbraviseu-troco-santa-comba-daoviseu-duplicacaorequalificacao-16` },
  { name: "ip-ip3-duplicacao-17.html", url: `${IP}/pt-pt/alertas/rodovia/ip3-coimbraviseu-troco-santa-comba-daoviseu-duplicacaorequalificacao-17` },
  { name: "ip-en378-encerramento.html", url: `${IP}/pt-pt/alertas/rodovia/encerramento-da-en378-no-acesso-ao-porto-de-abrigo-de-sesimbra` },
  { name: "ip-en119-pavimentos.html", url: `${IP}/pt-pt/alertas/rodovia/en119-intervencao-em-pavimentos-e-obras-acessorias` },
  { name: "ip-en264-pavimentacao.html", url: `${IP}/pt-pt/alertas/rodovia/trabalhos-de-pavimentacao-na-en264` },
  { name: "ip-en10-ponte-marechal-carmona.html", url: `${IP}/pt-pt/alertas/rodovia/empreitada-de-reabilitacao-na-ponte-marechal-carmona-na-en10` },
  { name: "ip-ic8-campores.html", url: `${IP}/pt-pt/alertas/rodovia/condicionamento-de-transito-no-ic8-acesso-ao-parque-empresarial-do-campores-0` },
  { name: "ip-ic2-peregrinos.html", url: `${IP}/pt-pt/alertas/rodovia/ic2-campanha-de-apoio-aos-peregrinos` },
  { name: "porto-datex-nao-programados.xml", url: "https://dadosabertos.cm-porto.pt/dataset/539db002-9e19-11f1-84ed-6abdb6d5cf34/resource/75a3447c-bf9d-4c02-b3b7-aaecf5f00d2c/download/condicionamentos_nao_programados.xml" },
  { name: "dr-dl-155-a-2026.pdf", url: "https://files.diariodarepublica.pt/1s/2026/07/14703/0000200005.pdf" },
];
const KEEP = ["content-type", "content-length", "last-modified", "etag", "date", "cache-control", "expires"];

await mkdir(OUT, { recursive: true });
const manifest = [];
for (const d of DOCS) {
  const res = await fetch(d.url, { redirect: "follow", headers: { "User-Agent": "FleetOS-research/0.1 (portfolio prototype; test fixture recording)" } });
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(resolve(OUT, d.name), bytes);
  manifest.push({
    name: d.name,
    label: "REAL SNAPSHOT — recorded from the official source, unedited",
    requestedUrl: d.url,
    finalUrl: res.url,
    httpStatus: res.status,
    headers: Object.fromEntries(KEEP.flatMap((k) => (res.headers.get(k) ? [[k, res.headers.get(k)]] : []))),
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    retrievedAt: new Date().toISOString(),
  });
  console.log(res.status, bytes.length, d.name);
}
await writeFile(resolve(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
