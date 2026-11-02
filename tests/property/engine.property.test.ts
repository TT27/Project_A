import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { compareOpenItems } from '../../src/domain/reconciliation/compareOpenItems';
import type { CanonicalRow, DocumentType, Side } from '../../src/domain/models';
import { makeRow } from '../unit/fixtures';

const refArb = fc.oneof(fc.constantFrom('INV1', 'INV2', 'INV3', 'CN1', '00123', '123'), fc.stringMatching(/^[A-Z0-9-]{1,6}$/));
const dateArb = fc.constantFrom('2026-09-01', '2026-09-05', '2026-09-15');
const centsArb = fc.integer({ min: -1_000_000, max: 1_000_000 });

const rowArb = (side: Side, index: number) =>
  fc.record({ ref: refArb, cents: centsArb, date: dateArb, type: fc.constantFrom<DocumentType>('invoice', 'credit_note') }).map((r) =>
    makeRow({ id: `${side}-${index}`, side, referenceRaw: r.ref, outstandingCents: r.cents, documentDate: r.date, documentType: r.type })
  );

const rowsArb: fc.Arbitrary<CanonicalRow[]> = fc
  .tuple(fc.nat({ max: 12 }), fc.nat({ max: 12 }))
  .chain(([ns, nl]) => fc.tuple(fc.tuple(...Array.from({ length: ns }, (_, i) => rowArb('statement', i))), fc.tuple(...Array.from({ length: nl }, (_, i) => rowArb('ledger', i)))))
  .map(([a, b]) => [...a, ...b]);

const swapSides = (rows: CanonicalRow[]): CanonicalRow[] => rows.map((r) => ({ ...r, side: r.side === 'statement' ? 'ledger' : 'statement' }));

describe('engine properties', () => {
  it('row order does not affect the result', () => {
    fc.assert(
      fc.property(rowsArb, fc.array(fc.nat(), { minLength: 0, maxLength: 30 }), (rows, seeds) => {
        const shuffled = [...rows];
        seeds.forEach((seed, i) => {
          if (shuffled.length < 2) return;
          const j = seed % shuffled.length;
          const k = i % shuffled.length;
          [shuffled[j], shuffled[k]] = [shuffled[k]!, shuffled[j]!];
        });
        expect(compareOpenItems(shuffled)).toEqual(compareOpenItems(rows));
      })
    );
  });

  it('every row is assigned to exactly one outcome', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const assigned = compareOpenItems(rows).outcomes.flatMap((o) => [...o.statementRowIds, ...o.ledgerRowIds]);
        expect(assigned.length).toBe(rows.length);
        expect(new Set(assigned)).toEqual(new Set(rows.map((r) => r.id)));
      })
    );
  });

  it('swapping sides negates every signed difference and mirrors one-sided categories', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const a = compareOpenItems(rows);
        const b = compareOpenItems(swapSides(rows));
        expect(b.summary.differenceCents + a.summary.differenceCents).toBe(0);
        expect(b.outcomes.length).toBe(a.outcomes.length);
        a.outcomes.forEach((oa, i) => {
          const ob = b.outcomes[i]!;
          expect(ob.id).toBe(oa.id);
          expect(ob.differenceCents + oa.differenceCents).toBe(0);
          const mirror = { STATEMENT_ONLY: 'LEDGER_ONLY', LEDGER_ONLY: 'STATEMENT_ONLY' } as const;
          expect(ob.category).toBe(oa.category in mirror ? mirror[oa.category as keyof typeof mirror] : oa.category);
        });
      })
    );
  });

  it('repeated execution is deterministic', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        expect(compareOpenItems(rows)).toEqual(compareOpenItems(rows.map((r) => ({ ...r }))));
      })
    );
  });

  it('adding a duplicate never increases exact matches for that key', () => {
    fc.assert(
      fc.property(rowsArb, fc.nat(), (rows, pick) => {
        if (rows.length === 0) return;
        // A duplicate is a second record with the same key on the SAME side.
        const target = rows[pick % rows.length]!;
        const dup: CanonicalRow = { ...target, id: 'dup-row' };
        const before = compareOpenItems(rows);
        const after = compareOpenItems([...rows, dup]);
        const beforeKey = before.outcomes.find((o) => o.referenceKey === target.referenceKey && o.documentType === target.documentType)!;
        const afterKey = after.outcomes.find((o) => o.id === beforeKey.id)!;
        expect(afterKey.category).toBe('AMBIGUOUS_DUPLICATE_GROUP');
        expect(after.summary.exactMatchCount).toBeLessThanOrEqual(before.summary.exactMatchCount);
      })
    );
  });

  it('summary difference equals the sum of outcome differences', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const r = compareOpenItems(rows);
        expect(r.outcomes.reduce((n, o) => n + o.differenceCents, 0)).toBe(r.summary.differenceCents);
      })
    );
  });
});
