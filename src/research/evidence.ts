import type { DocumentSnapshot, ExtractionRun, Observation, RetrievalRecord } from "./types";

/*
 * Evidence store: immutable, append-only research history.
 *  - Snapshots are content-addressed (id from the SHA-256 of the original bytes) and are
 *    NEVER overwritten: storing identical bytes again only adds an Observation.
 *  - Retrieval records, observations, extraction runs and candidate versions are append-only.
 * Persistence is injected (IndexedDB in the app, memory in tests) through this narrow
 * interface, so the research subsystem does not depend on FleetOS storage.
 */

export type ResearchCollection = "researchSnapshots" | "researchObservations" | "researchRetrievals" | "extractionRuns" | "candidateVersions" | "researchRuns";

export interface ResearchPersistence {
  putResearchRecord(store: ResearchCollection, rec: { id: string }): Promise<void>;
  getResearchRecord(store: ResearchCollection, id: string): Promise<unknown>;
  listResearchRecords(store: ResearchCollection): Promise<unknown[]>;
}

/** One immutable version of a candidate as produced from one snapshot. */
export type CandidateVersion = {
  /** `${candidateKey}@${contentHash}` */
  id: string;
  candidateKey: string;
  contentHash: string;
  snapshotId: string;
  documentUrl: string;
  createdAt: string;
  /** Previous version id of the same key (null for the first). */
  previous: string | null;
  candidate: unknown;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export class EvidenceStore {
  constructor(private readonly raw: ResearchPersistence) {}

  /** Store a snapshot unless identical bytes are already stored. Never overwrites. */
  async preserveSnapshot(s: DocumentSnapshot): Promise<{ snapshot: DocumentSnapshot; created: boolean }> {
    const existing = await this.getSnapshot(s.id);
    if (existing) {
      if (existing.sha256 !== s.sha256) throw new Error(`colisão de identificador de snapshot ${s.id}`);
      return { snapshot: existing, created: false };
    }
    await this.raw.putResearchRecord("researchSnapshots", s);
    return { snapshot: s, created: true };
  }

  async getSnapshot(id: string): Promise<DocumentSnapshot | undefined> {
    const v = await this.raw.getResearchRecord("researchSnapshots", id);
    return isObj(v) && typeof v.sha256 === "string" && typeof v.bytesBase64 === "string" ? (v as DocumentSnapshot) : undefined;
  }

  async addObservation(o: Observation): Promise<void> {
    if (await this.raw.getResearchRecord("researchObservations", o.id)) return;
    await this.raw.putResearchRecord("researchObservations", o);
  }

  async observationsFor(url: string): Promise<Observation[]> {
    return ((await this.raw.listResearchRecords("researchObservations")) as Observation[])
      .filter((o) => isObj(o) && o.url === url)
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  }

  async addRetrieval(r: RetrievalRecord): Promise<void> {
    await this.raw.putResearchRecord("researchRetrievals", r);
  }

  async retrievals(): Promise<RetrievalRecord[]> {
    return ((await this.raw.listResearchRecords("researchRetrievals")) as RetrievalRecord[]).filter(isObj).sort((a, b) => b.retrievedAt.localeCompare(a.retrievedAt));
  }

  /** An earlier successful run of the SAME extractor version on the SAME bytes (reuse, no new call). */
  async findExtraction(snapshotId: string, extractorId: string, extractorVersion: number, schemaVersion: number): Promise<ExtractionRun | undefined> {
    const all = (await this.raw.listResearchRecords("extractionRuns")) as ExtractionRun[];
    return all.find(
      (r) => isObj(r) && r.snapshotId === snapshotId && r.extractorId === extractorId && r.extractorVersion === extractorVersion && r.schemaVersion === schemaVersion && r.status === "OK" && !r.reusedFrom,
    );
  }

  async addExtraction(r: ExtractionRun): Promise<void> {
    await this.raw.putResearchRecord("extractionRuns", r);
  }

  async extractions(): Promise<ExtractionRun[]> {
    return ((await this.raw.listResearchRecords("extractionRuns")) as ExtractionRun[]).filter(isObj);
  }

  /** Append a candidate version (idempotent for identical content). Earlier versions are kept as they were. */
  async addCandidateVersion(v: Omit<CandidateVersion, "id" | "previous">): Promise<{ version: CandidateVersion; created: boolean }> {
    const id = `${v.candidateKey}@${v.contentHash}`;
    const existing = (await this.raw.getResearchRecord("candidateVersions", id)) as CandidateVersion | undefined;
    if (existing) return { version: existing, created: false };
    const prior = await this.versionsOf(v.candidateKey);
    const version: CandidateVersion = { ...v, id, previous: prior.at(-1)?.id ?? null };
    await this.raw.putResearchRecord("candidateVersions", version);
    return { version, created: true };
  }

  async versionsOf(candidateKey: string): Promise<CandidateVersion[]> {
    return ((await this.raw.listResearchRecords("candidateVersions")) as CandidateVersion[])
      .filter((v) => isObj(v) && v.candidateKey === candidateKey)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addRun(run: { id: string }): Promise<void> {
    await this.raw.putResearchRecord("researchRuns", run);
  }

  async runs(): Promise<unknown[]> {
    return this.raw.listResearchRecords("researchRuns");
  }
}
