/** CSV reader + normalise edge cases (spec section 6 / QA matrix section 11). */
import { describe, expect, it } from 'vitest';
import { parseCsvToGrid } from '../../src/import/csvReader';
import { parseRows } from '../../src/import/parse';
import { normaliseRows } from '../../src/import/normalise';
import type { ColumnMapping, NormaliseOptions, ProjectScope } from '../../src/import';

const SCOPE: ProjectScope = { projectId: 'p', sourceId: 'src', supplierId: 'SUP001', currency: 'AUD', cutoffDate: '2026-09-30' };
const OPTS: NormaliseOptions = { signMode: 'by_document_type', dateFormat: 'DD/MM/YYYY', decimalSeparator: '.', allowParentheses: true, mappingVersion: 1 };
// Reference, Type, Date, Amount[, Currency]
const MAP: ColumnMapping = { reference: 0, documentType: 1, documentDate: 2, outstanding: 3, supplier: -1, currency: -1, asOfDate: -1 };

function run(content: string, mapping: ColumnMapping = MAP, opts: NormaliseOptions = OPTS) {
  const grid = parseCsvToGrid(content);
  const parsed = parseRows({ grid, headerRow: 1, dataStartRow: 2, dataEndRow: null, excludedRows: [] });
  return { grid, parsed, result: normaliseRows(parsed, 'statement', mapping, SCOPE, opts) };
}

describe('CSV reader', () => {
  it('strips a leading UTF-8 BOM from the first cell', () => {
    const grid = parseCsvToGrid('\uFEFFReference,Type,Date,Amount\nINV1,Invoice,01/09/2026,100.00\n');
    expect(grid.rows[0]!.cells[0]).toBe('Reference');
  });

  it('keeps quoted fields containing commas as a single cell', () => {
    const grid = parseCsvToGrid('Reference,Name\nINV1,"Smith, Co Pty Ltd"\n');
    expect(grid.rows[1]!.cells).toEqual(['INV1', 'Smith, Co Pty Ltd']);
  });

  it('keeps embedded newlines inside quoted fields', () => {
    const grid = parseCsvToGrid('Reference,Note\nINV1,"line one\nline two"\n');
    expect(grid.rows[1]!.cells[1]).toBe('line one\nline two');
    expect(grid.rows).toHaveLength(2);
  });

  it('pads short rows to the widest column count', () => {
    const grid = parseCsvToGrid('A,B,C,D\nINV1,Invoice\n');
    expect(grid.columnCount).toBe(4);
    expect(grid.rows[1]!.cells).toEqual(['INV1', 'Invoice', '', '']);
  });

  it('does not count a trailing newline as a blank data row', () => {
    const { result } = run('Reference,Type,Date,Amount\nINV1,Invoice,01/09/2026,100.00\n');
    expect(result.counts.imported).toBe(1);
    expect(result.counts.excluded).toBe(0);
  });

  it('rejects a file whose column count exceeds the cap', () => {
    const header = Array.from({ length: 300 }, (_, i) => `C${i}`).join(',');
    expect(() => parseCsvToGrid(`${header}\n`)).toThrow(/column/i);
  });
});

describe('normalise row-level validation', () => {
  it('imports a clean invoice row as valid', () => {
    const { result } = run('Reference,Type,Date,Amount\nINV1,Invoice,01/09/2026,100.00\n');
    expect(result.counts).toMatchObject({ imported: 1, valid: 1, invalid: 0, excluded: 0 });
    expect(result.canonicalRows[0]!.outstandingCents).toBe(10000);
  });

  it('negates credit notes under by-document-type sign mode', () => {
    const { result } = run('Reference,Type,Date,Amount\nCN1,Credit Note,01/09/2026,110.00\n');
    expect(result.canonicalRows[0]!.documentType).toBe('credit_note');
    expect(result.canonicalRows[0]!.outstandingCents).toBe(-11000);
  });

  it('flags a wrong date format as an invalid row', () => {
    const { result } = run('Reference,Type,Date,Amount\nINV1,Invoice,2026-09-01,100.00\n');
    expect(result.counts.invalid).toBe(1);
    expect(result.rows[0]!.errors.some((e) => e.code.startsWith('DATE_'))).toBe(true);
  });

  it('rejects an unsupported document type', () => {
    const { result } = run('Reference,Type,Date,Amount\nX1,Statement Fee,01/09/2026,100.00\n');
    expect(result.counts.invalid).toBe(1);
    expect(result.rows[0]!.errors.some((e) => e.code === 'UNSUPPORTED_DOCUMENT_TYPE')).toBe(true);
  });

  it('rejects an unsupported currency when a currency column is mapped', () => {
    const map: ColumnMapping = { ...MAP, currency: 4 };
    const { result } = run('Reference,Type,Date,Amount,Ccy\nINV1,Invoice,01/09/2026,100.00,USD\n', map);
    expect(result.counts.invalid).toBe(1);
    expect(result.rows[0]!.errors.some((e) => e.code === 'UNSUPPORTED_CURRENCY')).toBe(true);
  });

  it('excludes a zero-balance row as a closed item', () => {
    const { result } = run('Reference,Type,Date,Amount\nINV1,Invoice,01/09/2026,0.00\n');
    expect(result.counts.excluded).toBe(1);
    expect(result.rows[0]!.excludedReason).toMatch(/zero-balance/i);
  });

  it('flags an empty reference', () => {
    const { result } = run('Reference,Type,Date,Amount\n,Invoice,01/09/2026,100.00\n');
    expect(result.rows[0]!.errors.some((e) => e.code === 'EMPTY_REFERENCE')).toBe(true);
  });

  it('warns on a numeric reference but still imports it', () => {
    const { result } = run('Reference,Type,Date,Amount\n100245,Invoice,01/09/2026,100.00\n');
    expect(result.counts.valid).toBe(1);
    expect(result.rows[0]!.warnings.some((w) => w.code === 'NUMERIC_REFERENCE')).toBe(true);
  });

  it('honours an explicit row exclusion', () => {
    const grid = parseCsvToGrid('Reference,Type,Date,Amount\nINV1,Invoice,01/09/2026,100.00\nINV2,Invoice,01/09/2026,50.00\n');
    const parsed = parseRows({ grid, headerRow: 1, dataStartRow: 2, dataEndRow: null, excludedRows: [3] });
    const result = normaliseRows(parsed, 'statement', MAP, SCOPE, OPTS);
    expect(result.counts.excluded).toBe(1);
    expect(result.counts.valid).toBe(1);
    expect(result.rows.find((r) => r.sourceRow === 3)?.excludedReason).toMatch(/reviewer/i);
  });
});
