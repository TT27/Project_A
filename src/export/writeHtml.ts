/**
 * Self-contained printable HTML report. Pure: returns a complete HTML document.
 * No <script> tags, no external resources (CSS is inlined). Every value that could
 * originate from imported data is HTML-escaped via {@link escapeHtml}.
 */
import type { OutcomeView } from '@shared/contracts';
import { centsToFixed, EXCEPTION_CATEGORIES, type ReportModel } from './types';

/** Escapes the five XML/HTML-significant characters. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(cents: number): string {
  return escapeHtml(centsToFixed(cents));
}

const CATEGORY_LABELS: Record<string, string> = {
  EXACT_MATCH: 'Exact match',
  AMOUNT_DIFFERENCE: 'Amount difference',
  DATE_DIFFERENCE: 'Date difference',
  STATEMENT_ONLY: 'On statement only',
  LEDGER_ONLY: 'In ledger only',
  AMBIGUOUS_DUPLICATE_GROUP: 'Ambiguous duplicate group'
};

function exceptionRow(o: OutcomeView): string {
  const reasons = o.reasonCodes.map(escapeHtml).join(', ');
  const decision = escapeHtml(o.review?.decision ?? 'unreviewed');
  const note = escapeHtml(o.review?.note ?? '');
  return `<tr>
    <td>${escapeHtml(o.referenceKey)}</td>
    <td>${escapeHtml(CATEGORY_LABELS[o.category] ?? o.category)}</td>
    <td class="num">${money(o.statementCents)}</td>
    <td class="num">${money(o.ledgerCents)}</td>
    <td class="num">${money(o.differenceCents)}</td>
    <td>${reasons}</td>
    <td>${decision}</td>
    <td>${note}</td>
  </tr>`;
}

const COMPLETENESS_NOTE: Record<string, string> = {
  Verified: 'Both control totals matched the imported line items.',
  Mismatch: 'A control total did not match the imported line items — some rows may be missing from the import.',
  Unverified: 'No control total was supplied for one or both sides, so import completeness could not be verified.'
};

export function buildHtmlReport(model: ReportModel): string {
  const { setup } = model.project;
  const s = model.summary;
  const exceptions = model.outcomes.filter((o) => EXCEPTION_CATEGORIES.has(o.category));
  const invalidRows = model.run.settings.invalidRowCount;

  const exceptionsBody =
    exceptions.length === 0
      ? `<p class="ok">No differences found within the imported data.</p>`
      : `<table>
          <thead><tr>
            <th>Reference</th><th>Category</th><th class="num">Statement</th>
            <th class="num">Ledger</th><th class="num">Difference</th>
            <th>Reason codes</th><th>Review decision</th><th>Review note</th>
          </tr></thead>
          <tbody>${exceptions.map(exceptionRow).join('')}</tbody>
        </table>`;

  const sourceRows = model.sources
    .map(
      (src) => `<tr>
        <td>${escapeHtml(src.side)}</td>
        <td>${escapeHtml(src.fileName)}</td>
        <td>${escapeHtml(src.kind)}</td>
        <td class="mono">${escapeHtml(src.sha256)}</td>
        <td class="num">${escapeHtml(String(src.sizeBytes))}</td>
      </tr>`
    )
    .join('');

  const completeness = escapeHtml(s.completeness);
  const completenessNote = escapeHtml(COMPLETENESS_NOTE[s.completeness] ?? '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StatementDesk reconciliation report — ${escapeHtml(setup.supplierName)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1d1d1f; margin: 2rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 1.75rem 0 0.5rem; border-bottom: 1px solid #d2d2d7; padding-bottom: 0.25rem; }
  table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; font-size: 13px; }
  th, td { border: 1px solid #d2d2d7; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f5f5f7; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; word-break: break-all; }
  .ok { color: #1a7f37; font-weight: 600; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 1rem; margin: 0.5rem 0; }
  dt { font-weight: 600; }
  .disclaimer { margin-top: 2rem; padding: 0.75rem 1rem; background: #f5f5f7; border-radius: 8px; font-size: 12px; color: #515154; }
  footer { margin-top: 1.5rem; font-size: 12px; color: #86868b; }
</style>
</head>
<body>
  <h1>Supplier statement reconciliation</h1>
  <p>${escapeHtml(setup.supplierName)} (${escapeHtml(setup.supplierId)}) — as at ${escapeHtml(setup.cutoffDate)}</p>
  ${invalidRows ? `<p><strong>Incomplete draft.</strong> ${invalidRows} invalid source rows were omitted.</p>` : ''}

  <h2>Project</h2>
  <dl>
    <dt>Project</dt><dd>${escapeHtml(setup.projectName)}</dd>
    <dt>Supplier</dt><dd>${escapeHtml(setup.supplierName)} (${escapeHtml(setup.supplierId)})</dd>
    <dt>Cut-off date</dt><dd>${escapeHtml(setup.cutoffDate)}</dd>
    <dt>Currency</dt><dd>${escapeHtml(setup.currency)}</dd>
  </dl>

  <h2>Reconciliation summary</h2>
  <dl>
    <dt>Statement rows</dt><dd>${escapeHtml(String(s.statementRowCount))}</dd>
    <dt>Ledger rows</dt><dd>${escapeHtml(String(s.ledgerRowCount))}</dd>
    <dt>Statement total</dt><dd class="num">${money(s.statementTotalCents)} ${escapeHtml(setup.currency)}</dd>
    <dt>Ledger total</dt><dd class="num">${money(s.ledgerTotalCents)} ${escapeHtml(setup.currency)}</dd>
    <dt>Difference</dt><dd class="num">${money(s.differenceCents)} ${escapeHtml(setup.currency)}</dd>
    <dt>Exact matches</dt><dd>${escapeHtml(String(s.exactMatchCount))}</dd>
    <dt>Exceptions</dt><dd>${escapeHtml(String(s.exceptionCount))}</dd>
    <dt>Unresolved</dt><dd>${escapeHtml(String(s.unresolvedCount))}</dd>
  </dl>

  <h2>Control-total status</h2>
  <p><strong>${completeness}.</strong> ${completenessNote}</p>

  <h2>Exceptions</h2>
  ${exceptionsBody}

  <h2>Source identification</h2>
  <table>
    <thead><tr><th>Side</th><th>File</th><th>Type</th><th>SHA-256</th><th class="num">Bytes</th></tr></thead>
    <tbody>${sourceRows}</tbody>
  </table>

  <div class="disclaimer">
    <p>This report compares only the supplier statement and the accounts-payable ledger export
    that were imported into this project. It does not verify the complete accounting ledger, and
    it does not constitute advice to pay, withhold, or adjust any specific invoice. Review each
    exception against your source records before acting.</p>
  </div>

  <footer>
    Generated by StatementDesk ${escapeHtml(model.appVersion)} ·
    reconciliation engine ${escapeHtml(model.engineVersion)} ·
    ${escapeHtml(model.generatedAt)}
  </footer>
</body>
</html>
`;
}
