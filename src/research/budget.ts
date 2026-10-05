/*
 * Research budgets. Every research operation runs under explicit limits; when one is
 * exhausted the agent stops that line of work and reports a BUDGET_EXHAUSTED gap —
 * discovery is never presented as complete when it was cut short.
 */

export type ResearchBudget = {
  maxSearchQueries: number;
  maxPagesRetrieved: number;
  maxRedirects: number;
  maxDocuments: number;
  maxExtractionCalls: number;
  maxElapsedMs: number;
  maxRetries: number;
};

export const DEFAULT_RESEARCH_BUDGET: ResearchBudget = {
  maxSearchQueries: 8,
  maxPagesRetrieved: 20,
  maxRedirects: 3,
  maxDocuments: 12,
  maxExtractionCalls: 12,
  maxElapsedMs: 60_000,
  maxRetries: 1,
};

export type BudgetKind = "searchQueries" | "pagesRetrieved" | "documents" | "extractionCalls";

const LIMIT: Record<BudgetKind, keyof ResearchBudget> = {
  searchQueries: "maxSearchQueries",
  pagesRetrieved: "maxPagesRetrieved",
  documents: "maxDocuments",
  extractionCalls: "maxExtractionCalls",
};

export class BudgetTracker {
  readonly used: Record<BudgetKind, number> = { searchQueries: 0, pagesRetrieved: 0, documents: 0, extractionCalls: 0 };
  readonly exhausted = new Set<BudgetKind | "elapsed">();
  private readonly t0: number;

  constructor(
    readonly budget: ResearchBudget,
    private readonly clock: () => number = () => Date.now(),
  ) {
    this.t0 = clock();
  }

  elapsedMs(): number {
    return this.clock() - this.t0;
  }

  /** Reserve one unit; false (and recorded) when the limit or the time budget is reached. */
  take(kind: BudgetKind): boolean {
    if (this.elapsedMs() > this.budget.maxElapsedMs) {
      this.exhausted.add("elapsed");
      return false;
    }
    if (this.used[kind] >= this.budget[LIMIT[kind]]) {
      this.exhausted.add(kind);
      return false;
    }
    this.used[kind]++;
    return true;
  }
}
