import { describe, expect, it } from 'vitest';
import { compareOpenItems, outcomeIdFor } from '../../src/domain/reconciliation/compareOpenItems';
import { validateControls } from '../../src/domain/reconciliation/validateControls';
import { ENGINE_VERSION } from '../../src/domain/version';
import { makeRow } from './fixtures';

const s = (id: string, ref: string, cents: number, extra: Partial<Parameters<typeof makeRow>[0]> = {}) =>
  makeRow({ id, side: 'statement', referenceRaw: ref, outstandingCents: cents, ...extra });
const l = (id: string, ref: string, cents: number, extra: Partial<Parameters<typeof makeRow>[0]> = {}) =>
  makeRow({ id, side: 'ledger', referenceRaw: ref, outstandingCents: cents, ...extra });

describe('compareOpenItems rules', () => {
  it('Rule 1: exact match requires identical amount and date', () => {
    const r = compareOpenItems([s('a', 'INV1', 100), l('b', 'INV1', 100)]);
    expect(r.outcomes[0]).toMatchObject({ category: 'EXACT_MATCH', differenceCents: 0, reasonCodes: ['EXACT'] });
    expect(r.engineVersion).toBe(ENGINE_VERSION);
  });
  it('Rule 2: amount difference = statement − ledger and keeps date reason', () => {
    const r = compareOpenItems([s('a', 'INV1', 330), l('b', 'INV1', 300, { documentDate: '2026-09-02' })]);
    expect(r.outcomes[0]).toMatchObject({ category: 'AMOUNT_DIFFERENCE', differenceCents: 30, reasonCodes: ['AMOUNT_MISMATCH', 'DATE_MISMATCH'] });
  });
  it('Rule 3: date difference with equal amounts', () => {
    const r = compareOpenItems([s('a', 'INV1', 100), l('b', 'INV1', 100, { documentDate: '2026-09-02' })]);
    expect(r.outcomes[0]).toMatchObject({ category: 'DATE_DIFFERENCE', differenceCents: 0, reasonCodes: ['DATE_MISMATCH'] });
  });
  it('Rules 4 & 5: one-sided records', () => {
    const r = compareOpenItems([s('a', 'INV1', 100), l('b', 'INV2', 50)]);
    expect(r.outcomes.map((o) => [o.referenceKey, o.category, o.differenceCents])).toEqual([
      ['INV1', 'STATEMENT_ONLY', 100],
      ['INV2', 'LEDGER_ONLY', -50]
    ]);
  });
  it('Rule 6: duplicates on either side take precedence and are never auto-paired', () => {
    const r = compareOpenItems([s('a', 'INV1', 100), s('b', 'INV1', 100), l('c', 'INV1', 100)]);
    expect(r.outcomes[0]).toMatchObject({ category: 'AMBIGUOUS_DUPLICATE_GROUP', statementRowIds: ['a', 'b'], ledgerRowIds: ['c'], differenceCents: 100, reasonCodes: ['DUPLICATE_ON_STATEMENT'] });
    const r2 = compareOpenItems([s('a', 'INV1', 100), l('b', 'INV1', 100), l('c', 'INV1', 100)]);
    expect(r2.outcomes[0]?.reasonCodes).toEqual(['DUPLICATE_ON_LEDGER']);
    const r3 = compareOpenItems([s('a', 'INV1', 100), s('b', 'INV1', 100), l('c', 'INV1', 100), l('d', 'INV1', 100)]);
    expect(r3.outcomes[0]?.reasonCodes).toEqual(['DUPLICATE_ON_STATEMENT', 'DUPLICATE_ON_LEDGER']);
    expect(r3.summary.exactMatchCount).toBe(0);
  });
  it('matching key includes document type: invoice INV1 and credit note INV1 are different documents', () => {
    const r = compareOpenItems([s('a', 'INV1', 100), l('b', 'INV1', -100, { documentType: 'credit_note' })]);
    expect(r.outcomes.map((o) => o.category)).toEqual(['LEDGER_ONLY', 'STATEMENT_ONLY']);
  });
  it('credit notes match on negative amounts', () => {
    const r = compareOpenItems([s('a', 'CN1', -110, { documentType: 'credit_note' }), l('b', 'CN1', -110, { documentType: 'credit_note' })]);
    expect(r.outcomes[0]?.category).toBe('EXACT_MATCH');
    expect(r.summary.statementTotalCents).toBe(-110);
  });
  it('references differing only by leading zeros or case are distinct keys', () => {
    const r = compareOpenItems([s('a', '00123', 100), l('b', '123', 100), s('c', 'inv9', 1), l('d', 'INV9', 1)]);
    expect(r.outcomes.every((o) => o.category !== 'EXACT_MATCH')).toBe(true);
    expect(r.outcomes).toHaveLength(4);
  });
  it('outcome ids are deterministic and derived from the key', () => {
    expect(outcomeIdFor(['SUP001', 'AUD', 'invoice', 'INV 1/2'])).toBe('oc:SUP001:AUD:invoice:INV%201%2F2');
    const a = compareOpenItems([s('x', 'INV1', 1)]).outcomes[0]!.id;
    const b = compareOpenItems([s('y', 'INV1', 2)]).outcomes[0]!.id;
    expect(a).toBe(b);
  });
  it('rejects duplicate row ids and unsupported currencies', () => {
    expect(() => compareOpenItems([s('a', 'INV1', 1), s('a', 'INV2', 1)])).toThrow(/Duplicate row id/);
    expect(() => compareOpenItems([s('a', 'INV1', 1, { currency: 'USD' as never })])).toThrow(/Unsupported currency/);
  });
  it('handles an empty input', () => {
    const r = compareOpenItems([]);
    expect(r.outcomes).toEqual([]);
    expect(r.summary).toMatchObject({ statementTotalCents: 0, ledgerTotalCents: 0, differenceCents: 0, exactMatchCount: 0, exceptionCount: 0, completeness: 'Unverified' });
  });
});

describe('validateControls', () => {
  const rows = [s('a', 'INV1', 100), s('b', 'INV2', 50), l('c', 'INV1', 100)];
  it('verifies when both sides match, Unverified when absent, Mismatch on variance', () => {
    expect(validateControls(rows, { statementCents: 150, ledgerCents: 100 }).completeness).toBe('Verified');
    expect(validateControls(rows, { statementCents: 150, ledgerCents: null })).toMatchObject({ completeness: 'Unverified', statement: { status: 'Verified' }, ledger: { status: 'Unverified', varianceCents: null } });
    expect(validateControls(rows, { statementCents: 160, ledgerCents: 100 })).toMatchObject({ completeness: 'Mismatch', statement: { varianceCents: -10 } });
    expect(validateControls(rows, { statementCents: 160, ledgerCents: null }).completeness).toBe('Mismatch');
  });
  it('rejects non-integer control totals', () => {
    expect(() => validateControls(rows, { statementCents: 1.5, ledgerCents: null })).toThrow();
  });
});
