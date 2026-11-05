/** Exceptions CSV exporter. Pure: returns the CSV text for a {@link ReportModel}. */
import { guardText } from './formulaGuard';
import { centsToFixed, EXCEPTION_CATEGORIES, type ReportModel } from './types';

/** Fixed column order of the exceptions export. Do not reorder or rename. */
export const CSV_COLUMNS = [
  'run_id',
  'outcome_id',
  'category',
  'supplier_id',
  'reference',
  'statement_rows',
  'ledger_rows',
  'statement_outstanding',
  'ledger_outstanding',
  'difference',
  'currency',
  'reason_codes',
  'review_decision',
  'review_note'
] as const;

/** RFC-4180 quoting, applied after formula-guarding text fields. */
function csvField(value: string): string {
  const needsQuote = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

export function buildExceptionsCsv(model: ReportModel): string {
  const { setup } = model.project;
  const lines: string[] = [CSV_COLUMNS.join(',')];

  for (const o of model.outcomes) {
    if (!EXCEPTION_CATEGORIES.has(o.category)) continue;
    const statementRows = o.rows.filter((r) => r.side === 'statement').length;
    const ledgerRows = o.rows.filter((r) => r.side === 'ledger').length;
    // Numeric columns are written as plain decimals (never formula-guarded, so negatives survive).
    const record: Record<(typeof CSV_COLUMNS)[number], string> = {
      run_id: guardText(model.run.runId),
      outcome_id: guardText(o.id),
      category: guardText(o.category),
      supplier_id: guardText(setup.supplierId),
      reference: guardText(o.referenceKey),
      statement_rows: String(statementRows),
      ledger_rows: String(ledgerRows),
      statement_outstanding: centsToFixed(o.statementCents),
      ledger_outstanding: centsToFixed(o.ledgerCents),
      difference: centsToFixed(o.differenceCents),
      currency: guardText(setup.currency),
      reason_codes: guardText(o.reasonCodes.join(';')),
      review_decision: guardText(o.review?.decision ?? 'unreviewed'),
      review_note: guardText(o.review?.note ?? '')
    };
    lines.push(CSV_COLUMNS.map((c) => csvField(record[c])).join(','));
  }
  // CRLF line endings for maximal spreadsheet compatibility.
  return lines.join('\r\n') + '\r\n';
}
