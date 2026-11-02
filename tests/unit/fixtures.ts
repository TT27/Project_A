/**
 * Test-only helpers: load the golden CSV fixtures into CanonicalRows using the
 * domain parsers (no import layer yet — Phase 3 replaces this with the real reader).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CanonicalRow, DocumentType, Side } from '../../src/domain/models';
import { parseMoney, applySignConvention } from '../../src/domain/money';
import { parseDocumentDate, type DateFormat } from '../../src/domain/dates';
import { referenceKey } from '../../src/domain/references';

export const SAMPLES_DIR = join(__dirname, '..', '..', 'samples');
export const GOLDEN_CUTOFF = '2026-09-30';

export function loadGoldenCsv(side: Side): CanonicalRow[] {
  const file = side === 'statement' ? 'statement_SUP001_2026-09-30.csv' : 'ap_ledger_SUP001_2026-09-30.csv';
  const dateFormat: DateFormat = side === 'statement' ? 'DD/MM/YYYY' : 'YYYY-MM-DD';
  const lines = readFileSync(join(SAMPLES_DIR, file), 'utf8').trim().split(/\r?\n/);
  return lines.slice(1).map((line, i) => {
    const cells = line.split(',');
    const [supplierId, reference, typeText, dateText, amountText] = cells as [string, string, string, string, string];
    const documentType: DocumentType = typeText === 'Credit Note' ? 'credit_note' : 'invoice';
    const money = parseMoney(amountText);
    if (!money.ok) throw new Error(money.message);
    const signed = applySignConvention(money.cents, documentType, 'signed_amount');
    if (!signed.ok) throw new Error(signed.message);
    const date = parseDocumentDate(dateText, dateFormat, GOLDEN_CUTOFF);
    if (!date.ok) throw new Error(date.message);
    return makeRow({
      id: `${side}-${i + 2}`,
      side,
      sourceRow: i + 2,
      supplierId,
      documentType,
      referenceRaw: reference,
      documentDate: date.isoDate,
      outstandingCents: signed.cents,
      rawCells: cells
    });
  });
}

export function makeRow(partial: Partial<CanonicalRow> & Pick<CanonicalRow, 'id' | 'side' | 'referenceRaw' | 'outstandingCents'>): CanonicalRow {
  return {
    projectId: 'proj',
    sourceId: `src-${partial.side}`,
    sheetName: null,
    sourceRow: 2,
    supplierId: 'SUP001',
    currency: 'AUD',
    asOfDate: GOLDEN_CUTOFF,
    documentType: 'invoice',
    referenceKey: referenceKey(partial.referenceRaw),
    documentDate: '2026-09-01',
    rawCells: [],
    mappingVersion: 1,
    ...partial
  };
}
