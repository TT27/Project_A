import { describe, expect, it } from 'vitest';
import { compareIsoDates, formatIsoDateAu, parseDate, parseDocumentDate } from '../../src/domain/dates';
import { inspectReference, referenceKey } from '../../src/domain/references';

describe('parseDate', () => {
  it('parses DD/MM/YYYY and YYYY-MM-DD strictly', () => {
    expect(parseDate('01/09/2026', 'DD/MM/YYYY')).toEqual({ ok: true, isoDate: '2026-09-01' });
    expect(parseDate('5/9/2026', 'DD/MM/YYYY')).toEqual({ ok: true, isoDate: '2026-09-05' });
    expect(parseDate('2026-09-01', 'YYYY-MM-DD')).toEqual({ ok: true, isoDate: '2026-09-01' });
    expect(parseDate('2026-09-01', 'DD/MM/YYYY')).toMatchObject({ ok: false, code: 'MALFORMED' });
    expect(parseDate('01/09/2026', 'YYYY-MM-DD')).toMatchObject({ ok: false, code: 'MALFORMED' });
    expect(parseDate('2026-9-1', 'YYYY-MM-DD')).toMatchObject({ ok: false, code: 'MALFORMED' });
    expect(parseDate('', 'YYYY-MM-DD')).toMatchObject({ ok: false, code: 'EMPTY' });
    expect(parseDate('2026-09-01T00:00:00Z', 'YYYY-MM-DD')).toMatchObject({ ok: false, code: 'MALFORMED' });
  });
  it('rejects impossible dates, including leap-year rules', () => {
    expect(parseDate('31/09/2026', 'DD/MM/YYYY')).toMatchObject({ ok: false, code: 'IMPOSSIBLE' });
    expect(parseDate('29/02/2026', 'DD/MM/YYYY')).toMatchObject({ ok: false, code: 'IMPOSSIBLE' });
    expect(parseDate('29/02/2024', 'DD/MM/YYYY')).toEqual({ ok: true, isoDate: '2024-02-29' });
    expect(parseDate('29/02/1900', 'DD/MM/YYYY')).toMatchObject({ ok: false, code: 'IMPOSSIBLE' });
    expect(parseDate('29/02/2000', 'DD/MM/YYYY')).toEqual({ ok: true, isoDate: '2000-02-29' });
    expect(parseDate('00/01/2026', 'DD/MM/YYYY')).toMatchObject({ ok: false, code: 'IMPOSSIBLE' });
    expect(parseDate('01/13/2026', 'DD/MM/YYYY')).toMatchObject({ ok: false, code: 'IMPOSSIBLE' });
  });
  it('rejects document dates after the cutoff and never shifts by timezone', () => {
    expect(parseDocumentDate('30/09/2026', 'DD/MM/YYYY', '2026-09-30')).toEqual({ ok: true, isoDate: '2026-09-30' });
    expect(parseDocumentDate('01/10/2026', 'DD/MM/YYYY', '2026-09-30')).toMatchObject({ ok: false, code: 'AFTER_CUTOFF' });
    expect(compareIsoDates('2026-09-30', '2026-10-01')).toBe(-1);
    expect(formatIsoDateAu('2026-09-05')).toBe('05/09/2026');
  });
});

describe('referenceKey', () => {
  it('trims and NFC-normalises only', () => {
    expect(referenceKey('  INV100 ')).toBe('INV100');
    expect(referenceKey('e\u0301')).toBe('\u00e9');
    expect(referenceKey('00123')).toBe('00123');
    expect(referenceKey('00123')).not.toBe(referenceKey('123'));
    expect(referenceKey('inv-100')).toBe('inv-100');
    expect(referenceKey('INV-100')).not.toBe(referenceKey('inv-100'));
  });
  it('warns on numeric and empty references', () => {
    expect(inspectReference('12345').map((w) => w.code)).toEqual(['NUMERIC_REFERENCE']);
    expect(inspectReference(' 12345').map((w) => w.code)).toEqual(['WHITESPACE_TRIMMED', 'NUMERIC_REFERENCE']);
    expect(inspectReference('INV1').map((w) => w.code)).toEqual([]);
    expect(inspectReference('  ').map((w) => w.code)).toEqual(['EMPTY_REFERENCE']);
  });
});
