/** XLSX reader + normalise edge cases (spec section 6 / QA matrix section 11). */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { loadSource } from '../../src/import/source';
import { parseRows } from '../../src/import/parse';
import { normaliseRows } from '../../src/import/normalise';
import type { ColumnMapping, NormaliseOptions, ProjectScope } from '../../src/import';

const SCOPE: ProjectScope = {
  projectId: 'p',
  sourceId: 'src',
  supplierId: 'SUP001',
  currency: 'AUD',
  cutoffDate: '2026-09-30'
};
const OPTS: NormaliseOptions = {
  signMode: 'by_document_type',
  dateFormat: 'DD/MM/YYYY',
  decimalSeparator: '.',
  allowParentheses: true,
  mappingVersion: 1
};
// Columns: Reference(0), Type(1), Date(2), Amount(3)
const MAP: ColumnMapping = {
  reference: 0,
  documentType: 1,
  documentDate: 2,
  outstanding: 3,
  supplier: -1,
  currency: -1,
  asOfDate: -1
};

let dir: string;

/**
 * Build a workbook whose data starts on row 4 (two preamble rows + header),
 * covering: a clean row, a hidden row, a formula cell with a cached result,
 * a formula cell with no cached value, and a numeric-stored reference.
 */
async function buildWorkbook(path: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Statement');
  ws.addRow(['Supplier statement export']); // row 1 preamble
  ws.addRow([]); // row 2 blank
  ws.addRow(['Reference', 'Type', 'Date', 'Amount']); // row 3 header
  ws.addRow(['INV200', 'Invoice', '01/09/2026', 100]); // row 4 clean
  const hiddenRow = ws.addRow(['INV201', 'Invoice', '02/09/2026', 50]); // row 5 hidden
  hiddenRow.hidden = true;
  // row 6: amount is a formula WITH a cached result (200)
  const formulaRow = ws.addRow(['INV202', 'Invoice', '03/09/2026', null]);
  formulaRow.getCell(4).value = { formula: 'A1', result: 200 };
  // row 7: amount is a formula WITHOUT a cached result
  const noValueRow = ws.addRow(['INV203', 'Invoice', '04/09/2026', null]);
  noValueRow.getCell(4).value = { formula: 'A1', result: undefined } as unknown as ExcelJS.CellFormulaValue;
  // row 8: reference stored as a number
  ws.addRow([204, 'Invoice', '05/09/2026', 75]);
  await wb.xlsx.writeFile(path);
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sd-xlsx-'));
  await buildWorkbook(join(dir, 'book.xlsx'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function runBook(mapping: ColumnMapping = MAP, opts: NormaliseOptions = OPTS) {
  const source = await loadSource(join(dir, 'book.xlsx'));
  const grid = source.gridFor('Statement');
  const parsed = parseRows({ grid, headerRow: 3, dataStartRow: 4, dataEndRow: null, excludedRows: [] });
  return { source, grid, parsed, result: normaliseRows(parsed, 'statement', mapping, SCOPE, opts) };
}

describe('XLSX reader', () => {
  it('lists worksheets and reads saved values only', async () => {
    const source = await loadSource(join(dir, 'book.xlsx'));
    expect(source.kind).toBe('xlsx');
    expect(source.sheets.map((s) => s.name)).toContain('Statement');
  });

  it('respects a header offset: data begins below preamble rows', async () => {
    const { parsed } = await runBook();
    expect(parsed.header).toEqual(['Reference', 'Type', 'Date', 'Amount']);
    // Five data rows (rows 4-8), none dropped by the range slice.
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.rows[0]!.sourceRow).toBe(4);
  });

  it('flags a hidden row with a warning but still imports it', async () => {
    const { result } = await runBook();
    const hidden = result.rows.find((r) => r.sourceRow === 5)!;
    expect(hidden.warnings.map((w) => w.code)).toContain('HIDDEN_ROW');
    expect(hidden.status).toBe('valid');
  });

  it('accepts a formula cell that carries a cached result (with warning)', async () => {
    const { result } = await runBook();
    const formula = result.rows.find((r) => r.sourceRow === 6)!;
    expect(formula.warnings.map((w) => w.code)).toContain('FORMULA_CELL');
    expect(formula.status).toBe('valid');
    expect(formula.canonical!.outstandingCents).toBe(20000);
  });

  it('rejects a formula cell with no cached value', async () => {
    const { result } = await runBook();
    const noValue = result.rows.find((r) => r.sourceRow === 7)!;
    expect(noValue.errors.map((e) => e.code)).toContain('FORMULA_NO_VALUE');
    expect(noValue.status).toBe('invalid');
  });

  it('warns when an identifier column is stored numerically', async () => {
    const { result } = await runBook();
    const numeric = result.rows.find((r) => r.sourceRow === 8)!;
    expect(numeric.warnings.map((w) => w.code)).toContain('NUMERIC_STORED_IDENTIFIER');
  });

  it('produces the expected overall counts', async () => {
    const { result } = await runBook();
    // 5 imported: rows 4,5,6,8 valid (4), row 7 invalid (1).
    expect(result.counts).toMatchObject({ imported: 5, valid: 4, invalid: 1, excluded: 0 });
  });
});
