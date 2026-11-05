/**
 * Canonical financial models. Pure types: no runtime dependencies.
 * The Zod schemas for the same shapes live in src/shared/contracts.ts.
 */
export type Side = 'statement' | 'ledger';
export type DocumentType = 'invoice' | 'credit_note';
export type Currency = 'AUD';

export interface CanonicalRow {
  id: string;
  projectId: string;
  sourceId: string;
  side: Side;
  sheetName: string | null;
  sourceRow: number;
  supplierId: string;
  currency: Currency;
  asOfDate: string;
  documentType: DocumentType;
  referenceRaw: string;
  referenceKey: string;
  documentDate: string;
  outstandingCents: number;
  rawCells: string[];
  mappingVersion: number;
}

export type ReconciliationKey = readonly [supplierId: string, currency: Currency, documentType: DocumentType, referenceKey: string];

export type OutcomeCategory =
  | 'EXACT_MATCH'
  | 'AMOUNT_DIFFERENCE'
  | 'DATE_DIFFERENCE'
  | 'STATEMENT_ONLY'
  | 'LEDGER_ONLY'
  | 'AMBIGUOUS_DUPLICATE_GROUP';

export type ReasonCode =
  | 'EXACT'
  | 'AMOUNT_MISMATCH'
  | 'DATE_MISMATCH'
  | 'MISSING_IN_LEDGER'
  | 'MISSING_IN_STATEMENT'
  | 'DUPLICATE_ON_STATEMENT'
  | 'DUPLICATE_ON_LEDGER';

export interface Outcome {
  /** Deterministic id derived from the run-independent key. */
  id: string;
  category: OutcomeCategory;
  key: ReconciliationKey;
  supplierId: string;
  currency: Currency;
  documentType: DocumentType;
  referenceKey: string;
  statementRowIds: string[];
  ledgerRowIds: string[];
  statementCents: number;
  ledgerCents: number;
  /** statement − ledger, in signed integer cents. */
  differenceCents: number;
  reasonCodes: ReasonCode[];
}

export type CompletenessStatus = 'Verified' | 'Mismatch' | 'Unverified';

export interface ReconciliationSummary {
  statementRowCount: number;
  ledgerRowCount: number;
  statementTotalCents: number;
  ledgerTotalCents: number;
  /** statement − ledger */
  differenceCents: number;
  exactMatchCount: number;
  exceptionCount: number;
  unresolvedCount: number;
  countsByCategory: Record<OutcomeCategory, number>;
  completeness: CompletenessStatus;
}

export interface ReconciliationResult {
  engineVersion: string;
  outcomes: Outcome[];
  summary: ReconciliationSummary;
}
