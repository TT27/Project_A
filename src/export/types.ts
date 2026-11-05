/**
 * The in-memory report model assembled from a reconciliation run. Every exporter
 * (XLSX, CSV, HTML) is a pure function of this model, which keeps the exporters
 * testable without a database and guarantees all three formats agree.
 */
import type {
  OutcomeCategory,
  OutcomeView,
  ProjectSummary,
  ReconciliationSummaryView,
  RunView,
  Side
} from '@shared/contracts';
import type { ImportedRowInfo, SourceInfo } from '../storage';

export interface ReportModel {
  generatedAt: string;
  engineVersion: string;
  appVersion: string;
  project: ProjectSummary;
  run: RunView;
  summary: ReconciliationSummaryView;
  outcomes: OutcomeView[];
  sources: SourceInfo[];
  imported: Record<Side, ImportedRowInfo[]>;
}

export const EXCEPTION_CATEGORIES: ReadonlySet<OutcomeCategory> = new Set<OutcomeCategory>([
  'AMOUNT_DIFFERENCE',
  'DATE_DIFFERENCE',
  'STATEMENT_ONLY',
  'LEDGER_ONLY',
  'AMBIGUOUS_DUPLICATE_GROUP'
]);

/** AUD cents -> "1234.56" (always two decimals, no thousands separators, safe for CSV). */
export function centsToFixed(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** AUD cents -> number with two decimals, for numeric spreadsheet cells. */
export function centsToNumber(cents: number): number {
  return cents / 100;
}
