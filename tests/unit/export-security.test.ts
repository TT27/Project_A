import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  buildExceptionsCsv,
  buildHtmlReport,
  buildWorkbookBuffer,
  guardText,
  needsFormulaGuard,
  type ReportModel
} from '../../src/export';
import type { OutcomeView, ProjectSummary, ReconciliationSummaryView, RunView } from '../../src/shared/contracts';

const MALICIOUS_REF = '=HYPERLINK("http://evil","click")';
const MALICIOUS_NOTE = '<script>alert(1)</script> & "quoted" <b>';

function summary(exceptionCount: number): ReconciliationSummaryView {
  return {
    statementRowCount: 8,
    ledgerRowCount: 7,
    statementTotalCents: 286000,
    ledgerTotalCents: 253300,
    differenceCents: 32700,
    exactMatchCount: 4,
    exceptionCount,
    unresolvedCount: exceptionCount,
    countsByCategory: {
      EXACT_MATCH: 4,
      AMOUNT_DIFFERENCE: 1,
      DATE_DIFFERENCE: 0,
      STATEMENT_ONLY: 1,
      LEDGER_ONLY: 1,
      AMBIGUOUS_DUPLICATE_GROUP: 1
    },
    completeness: 'Verified'
  };
}

function exceptionOutcome(): OutcomeView {
  return {
    id: 'outcome-1',
    outcomeKey: 'k1',
    category: 'AMOUNT_DIFFERENCE',
    referenceKey: MALICIOUS_REF,
    documentType: 'invoice',
    statementCents: 13000,
    ledgerCents: 10000,
    differenceCents: 3000,
    reasonCodes: ['AMOUNT_MISMATCH'],
    statementDate: '2026-09-01',
    ledgerDate: '2026-09-01',
    rows: [
      { rowId: 's1', side: 'statement', fileName: 'stmt.csv', sheetName: null, sourceRow: 2, referenceRaw: MALICIOUS_REF, documentDate: '2026-09-01', outstandingCents: 13000 },
      { rowId: 'l1', side: 'ledger', fileName: 'led.csv', sheetName: null, sourceRow: 2, referenceRaw: MALICIOUS_REF, documentDate: '2026-09-01', outstandingCents: 10000 }
    ],
    review: { id: 'r1', outcomeKey: 'k1', runId: 'run-1', decision: 'investigate', reviewer: 'tester', note: MALICIOUS_NOTE, createdAt: '2026-10-01T00:00:00.000Z', supersedesId: null }
  };
}

function model(outcomes: OutcomeView[]): ReportModel {
  const setup = {
    projectName: 'Proj',
    supplierName: '<img src=x onerror=alert(1)>',
    supplierId: 'SUP001',
    cutoffDate: '2026-09-30',
    currency: 'AUD' as const,
    comparableBalancesConfirmed: true as const
  };
  const project: ProjectSummary = { projectId: 'p1', path: '/tmp/p.statementdesk', schemaVersion: 1, setup, createdAt: '', updatedAt: '' };
  const exceptionCount = outcomes.filter((o) => o.category !== 'EXACT_MATCH').length;
  const run: RunView = {
    runId: 'run-1',
    projectId: 'p1',
    engineVersion: '1.0.0',
    createdAt: '2026-10-01T00:00:00.000Z',
    settings: { statementControlCents: null, ledgerControlCents: null, invalidRowCount: 0 },
    hasSourceSnapshot: true,
    summary: summary(exceptionCount),
    outcomes
  };
  return {
    generatedAt: '2026-10-01T00:00:00.000Z',
    engineVersion: '1.0.0',
    appVersion: '0.1.0',
    project,
    run,
    summary: run.summary,
    outcomes,
    sources: [
      { side: 'statement', fileName: 'stmt.csv', kind: 'csv', sha256: 'a'.repeat(64), sizeBytes: 100, sheetName: null, importedCents: 286000, controlCents: 286000, controlStatus: 'match', counts: { included: 8 }, importedAt: '' }
    ],
    imported: { statement: [], ledger: [] }
  };
}

describe('formula guard', () => {
  it('flags the dangerous lead characters and leaves safe text alone', () => {
    for (const bad of ['=1+1', '+1', '-1', '@x', '\tx', '\rx']) expect(needsFormulaGuard(bad)).toBe(true);
    for (const ok of ['INV102', 'SUP001', '', '1-2', 'a=b']) expect(needsFormulaGuard(ok)).toBe(false);
  });

  it('prefixes a quote without mutating the original string', () => {
    const original = '=cmd';
    expect(guardText(original)).toBe("'=cmd");
    expect(original).toBe('=cmd'); // source value preserved
  });
});

describe('CSV export security', () => {
  it('neutralises a formula-leading reference and keeps the exact header', () => {
    const csv = buildExceptionsCsv(model([exceptionOutcome()]));
    const [header, firstRow] = csv.trim().split('\r\n');
    expect(header).toBe(
      'run_id,outcome_id,category,supplier_id,reference,statement_rows,ledger_rows,statement_outstanding,ledger_outstanding,difference,currency,reason_codes,review_decision,review_note'
    );
    // Reference is quoted (it contains a comma) and formula-guarded with a leading '.
    expect(firstRow).toContain('"\'=HYPERLINK');
    // Numeric columns are plain decimals, never formula-guarded.
    expect(firstRow).toContain('130.00');
    expect(firstRow).toContain('30.00');
  });
});

describe('XLSX export security', () => {
  it('writes the reference as formula-guarded text and amounts as real numbers', async () => {
    const buffer = await buildWorkbookBuffer(model([exceptionOutcome()]));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const exc = wb.getWorksheet('Exceptions')!;
    const dataRow = exc.getRow(2);
    expect(dataRow.getCell(1).text).toBe("'=HYPERLINK(\"http://evil\",\"click\")");
    // Statement amount cell is a number (13000 cents -> 130), not a string.
    expect(dataRow.getCell(3).value).toBe(130);
    expect(typeof dataRow.getCell(3).value).toBe('number');
    for (const name of ['Summary', 'Exceptions', 'Matched', 'ImportedStatement', 'ImportedLedger', 'Exclusions', 'ImportSettings']) {
      expect(wb.getWorksheet(name)).toBeDefined();
    }
  });
});

describe('HTML export security', () => {
  it('escapes untrusted content and embeds no script or external resource', () => {
    const html = buildHtmlReport(model([exceptionOutcome()]));
    // No live script tag and no raw injected markup survive.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x');
    // Self-contained: no external resources.
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/src=["']https?:/i);
    expect(html).not.toMatch(/<link\b[^>]*href=["']https?:/i);
    // Honest, bounded claims.
    expect(html).toContain('does not verify the complete accounting ledger');
  });

  it('uses the precise no-difference wording when there are no exceptions', () => {
    const html = buildHtmlReport(model([]));
    expect(html).toContain('No differences found within the imported data.');
  });
});
