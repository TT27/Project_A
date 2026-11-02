/**
 * End-to-end Phase 3 import: drive the REAL import layer (loadSource -> parseRows ->
 * normaliseRows, with SHA-256 and control totals) over the golden CSV *and* XLSX
 * fixtures, then feed the canonical rows to the domain engine and assert the spec's
 * golden results (section 10). This is the Phase 3 exit test.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectInput, runImport } from '../../src/import';
import type { ColumnMapping, ImportConfig, NormaliseOptions, ProjectScope } from '../../src/import';
import { compareOpenItems } from '../../src/domain/reconciliation/compareOpenItems';
import { formatSignedCents } from '../../src/domain/money';
import type { Side } from '../../src/domain/models';

const SAMPLES_DIR = join(__dirname, '..', '..', 'samples');
const CUTOFF = '2026-09-30';

// Columns in both fixtures: Supplier, Reference, Document Type, Document Date, Outstanding AUD
const MAPPING: ColumnMapping = { reference: 1, documentType: 2, documentDate: 3, outstanding: 4, supplier: 0, currency: -1, asOfDate: -1 };

function scope(side: Side): ProjectScope {
  return { projectId: 'proj', sourceId: `src-${side}`, supplierId: 'SUP001', currency: 'AUD', cutoffDate: CUTOFF };
}

function options(side: Side): NormaliseOptions {
  // Fixture amounts are already signed (credit note is -110.00).
  return {
    signMode: 'signed_amount',
    dateFormat: side === 'statement' ? 'DD/MM/YYYY' : 'YYYY-MM-DD',
    decimalSeparator: '.',
    allowParentheses: true,
    mappingVersion: 1
  };
}

async function importSide(side: Side, kind: 'csv' | 'xlsx', controlTotalText: string | null = null) {
  const base = side === 'statement' ? 'statement_SUP001_2026-09-30' : 'ap_ledger_SUP001_2026-09-30';
  const path = join(SAMPLES_DIR, `${base}.${kind}`);
  // Ask the real inspector for the sheet name (CSV returns a synthetic one).
  const inspected = await inspectInput(path, kind);
  const sheetName = kind === 'xlsx' ? inspected.defaultSheet : null;
  const config: ImportConfig = {
    side,
    path,
    kind,
    sheetName,
    headerRow: 1,
    dataStartRow: 2,
    dataEndRow: null,
    excludedRows: [],
    mapping: MAPPING,
    scope: scope(side),
    options: options(side),
    controlTotalText
  };
  return runImport(config);
}

for (const kind of ['csv', 'xlsx'] as const) {
  describe(`Golden SUP001 import via ${kind.toUpperCase()} (spec section 10)`, () => {
    it('reproduces 4 exact matches, 4 exceptions and +327.00 difference', async () => {
      const statement = await importSide('statement', kind);
      const ledger = await importSide('ledger', kind);

      expect(statement.counts.imported).toBe(8);
      expect(statement.counts.valid).toBe(8);
      expect(ledger.counts.imported).toBe(7);
      expect(ledger.counts.valid).toBe(7);
      expect(statement.sha256).toHaveLength(64);

      const rows = [...statement.canonicalRows, ...ledger.canonicalRows];
      expect(rows).toHaveLength(15);

      const result = compareOpenItems(rows);
      expect(result.summary.exactMatchCount).toBe(4);
      expect(result.summary.exceptionCount).toBe(4);
      expect(result.summary.statementTotalCents).toBe(286000);
      expect(result.summary.ledgerTotalCents).toBe(253300);
      expect(result.summary.differenceCents).toBe(32700);
      expect(formatSignedCents(result.summary.differenceCents)).toBe('+327.00');
      expect(result.summary.countsByCategory).toEqual({
        EXACT_MATCH: 4,
        AMOUNT_DIFFERENCE: 1,
        DATE_DIFFERENCE: 0,
        STATEMENT_ONLY: 1,
        LEDGER_ONLY: 1,
        AMBIGUOUS_DUPLICATE_GROUP: 1
      });

      const byRef = Object.fromEntries(result.outcomes.map((o) => [o.referenceKey, o]));
      expect(byRef['INV102']?.category).toBe('AMOUNT_DIFFERENCE');
      expect(byRef['INV103']?.category).toBe('STATEMENT_ONLY');
      expect(byRef['INV105']?.category).toBe('AMBIGUOUS_DUPLICATE_GROUP');
      expect(byRef['INV106']?.category).toBe('LEDGER_ONLY');
      expect(byRef['CN010']?.documentType).toBe('credit_note');
      expect(byRef['CN010']?.statementCents).toBe(-11000);
    });

    it('verifies control totals when supplied and flags a mismatch', async () => {
      const ok = await importSide('statement', kind, '2860.00');
      expect(ok.control.controlCents).toBe(286000);
      expect(ok.control.varianceCents).toBe(0);
      expect(ok.control.status).toBe('Verified');

      const bad = await importSide('statement', kind, '2860.01');
      expect(bad.control.status).toBe('Mismatch');
      expect(bad.control.varianceCents).toBe(-1);

      const none = await importSide('statement', kind, null);
      expect(none.control.status).toBe('Unverified');
      expect(none.control.controlCents).toBeNull();
    });
  });
}
