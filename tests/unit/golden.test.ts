import { describe, expect, it } from 'vitest';
import { compareOpenItems } from '../../src/domain/reconciliation/compareOpenItems';
import { validateControls } from '../../src/domain/reconciliation/validateControls';
import { formatSignedCents } from '../../src/domain/money';
import { loadGoldenCsv } from './fixtures';

describe('Golden case: SUP001 @ 2026-09-30 (spec section 10)', () => {
  const statement = loadGoldenCsv('statement');
  const ledger = loadGoldenCsv('ledger');
  const rows = [...statement, ...ledger];
  const result = compareOpenItems(rows);
  const byRef = Object.fromEntries(result.outcomes.map((o) => [o.referenceKey, o]));

  it('imports 8 statement rows and 7 ledger rows', () => {
    expect(statement).toHaveLength(8);
    expect(ledger).toHaveLength(7);
    expect(result.summary.statementRowCount).toBe(8);
    expect(result.summary.ledgerRowCount).toBe(7);
  });

  it('produces 4 exact matches and 4 exception groups', () => {
    expect(result.summary.exactMatchCount).toBe(4);
    expect(result.summary.exceptionCount).toBe(4);
    expect(result.outcomes).toHaveLength(8);
    expect(result.summary.countsByCategory).toEqual({
      EXACT_MATCH: 4,
      AMOUNT_DIFFERENCE: 1,
      DATE_DIFFERENCE: 0,
      STATEMENT_ONLY: 1,
      LEDGER_ONLY: 1,
      AMBIGUOUS_DUPLICATE_GROUP: 1
    });
  });

  it('computes totals 2,860.00 / 2,533.00 and difference +327.00', () => {
    expect(result.summary.statementTotalCents).toBe(286000);
    expect(result.summary.ledgerTotalCents).toBe(253300);
    expect(result.summary.differenceCents).toBe(32700);
    expect(formatSignedCents(result.summary.differenceCents)).toBe('+327.00');
  });

  it('classifies each reference as expected', () => {
    for (const ref of ['INV100', 'INV101', 'CN010', 'INV104']) expect(byRef[ref]?.category).toBe('EXACT_MATCH');
    expect(byRef['INV102']?.category).toBe('AMOUNT_DIFFERENCE');
    expect(byRef['INV103']?.category).toBe('STATEMENT_ONLY');
    expect(byRef['INV105']?.category).toBe('AMBIGUOUS_DUPLICATE_GROUP');
    expect(byRef['INV106']?.category).toBe('LEDGER_ONLY');
    expect(byRef['CN010']?.documentType).toBe('credit_note');
    expect(byRef['CN010']?.statementCents).toBe(-11000);
  });

  it('reports the exception components INV102 +30, INV103 +220, INV105 +165, INV106 −88', () => {
    expect(byRef['INV102']?.differenceCents).toBe(3000);
    expect(byRef['INV103']?.differenceCents).toBe(22000);
    expect(byRef['INV105']?.differenceCents).toBe(16500);
    expect(byRef['INV106']?.differenceCents).toBe(-8800);
    const exceptionSum = result.outcomes.filter((o) => o.category !== 'EXACT_MATCH').reduce((n, o) => n + o.differenceCents, 0);
    expect(exceptionSum).toBe(32700);
  });

  it('assigns all 15 rows exactly once', () => {
    const assigned = result.outcomes.flatMap((o) => [...o.statementRowIds, ...o.ledgerRowIds]);
    expect(assigned).toHaveLength(15);
    expect(new Set(assigned).size).toBe(15);
    expect(new Set(assigned)).toEqual(new Set(rows.map((r) => r.id)));
    expect(byRef['INV105']?.statementRowIds).toHaveLength(2);
    expect(byRef['INV105']?.ledgerRowIds).toHaveLength(1);
    expect(byRef['INV105']?.reasonCodes).toEqual(['DUPLICATE_ON_STATEMENT']);
  });

  it('verifies completeness against matching control totals and flags mismatches', () => {
    const ok = validateControls(rows, { statementCents: 286000, ledgerCents: 253300 });
    expect(ok.completeness).toBe('Verified');
    const bad = validateControls(rows, { statementCents: 286001, ledgerCents: 253300 });
    expect(bad.completeness).toBe('Mismatch');
    expect(bad.statement.varianceCents).toBe(-1);
    const none = validateControls(rows, { statementCents: null, ledgerCents: null });
    expect(none.completeness).toBe('Unverified');
    expect(compareOpenItems(rows, { completeness: ok.completeness }).summary.completeness).toBe('Verified');
  });

  it('is independent of input order', () => {
    const shuffled = [...rows].reverse();
    expect(compareOpenItems(shuffled)).toEqual(result);
  });
});
