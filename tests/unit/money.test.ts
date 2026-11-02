import { describe, expect, it } from 'vitest';
import { addCents, applySignConvention, formatCents, formatSignedCents, parseMoney, sumCents, MAX_ABS_LINE_CENTS } from '../../src/domain/money';

const ok = (s: string, o?: Parameters<typeof parseMoney>[1]) => {
  const r = parseMoney(s, o);
  if (!r.ok) throw new Error(`${s}: ${r.message}`);
  return r.cents;
};
const code = (s: string, o?: Parameters<typeof parseMoney>[1]) => {
  const r = parseMoney(s, o);
  return r.ok ? 'OK' : r.code;
};

describe('parseMoney', () => {
  it('parses plain, thousands-separated and currency-prefixed decimals', () => {
    expect(ok('1100.00')).toBe(110000);
    expect(ok('1,234.56')).toBe(123456);
    expect(ok('$1,234.56')).toBe(123456);
    expect(ok('AUD 12.5')).toBe(1250);
    expect(ok('7')).toBe(700);
    expect(ok('0.01')).toBe(1);
    expect(ok(' 42.10 ')).toBe(4210);
  });
  it('parses negatives: leading, trailing, unicode minus, parentheses when configured', () => {
    expect(ok('-110.00')).toBe(-11000);
    expect(ok('−110.00')).toBe(-11000);
    expect(ok('110.00-')).toBe(-11000);
    expect(ok('(110.00)', { allowParentheses: true })).toBe(-11000);
    expect(code('(110.00)')).toBe('PARENTHESES_NOT_ALLOWED');
    expect(code('-(110.00)', { allowParentheses: true })).toBe('MALFORMED');
  });
  it('supports comma decimal separator', () => {
    expect(ok('1.234,56', { decimalSeparator: ',' })).toBe(123456);
    expect(code('1,234.56', { decimalSeparator: ',' })).toBe('MALFORMED');
  });
  it('rejects empty, malformed, >2dp and out-of-range values', () => {
    expect(code('')).toBe('EMPTY');
    expect(code('   ')).toBe('EMPTY');
    expect(code('abc')).toBe('MALFORMED');
    expect(code('1.2.3')).toBe('MALFORMED');
    expect(code('12,34.00')).toBe('MALFORMED');
    expect(code('1e5')).toBe('MALFORMED');
    expect(code('12.345')).toBe('TOO_MANY_DECIMALS');
    expect(code('100 CR')).toBe('MALFORMED');
    expect(ok('999,999,999.99')).toBe(MAX_ABS_LINE_CENTS);
    expect(code('1,000,000,000.00')).toBe('OUT_OF_RANGE');
    expect(code('99999999999999999999')).toBe('OUT_OF_RANGE');
  });
});

describe('formatCents', () => {
  it('formats with thousands separators and two decimals', () => {
    expect(formatCents(123456)).toBe('1,234.56');
    expect(formatCents(286000)).toBe('2,860.00');
    expect(formatCents(-8800)).toBe('-88.00');
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(5)).toBe('0.05');
    expect(formatSignedCents(32700)).toBe('+327.00');
    expect(formatSignedCents(-1)).toBe('-0.01');
    expect(formatSignedCents(0)).toBe('0.00');
  });
  it('round-trips parse(format(x)) for integer cents', () => {
    for (const c of [0, 1, 99, 100, -100, 123456789, -99999999999]) expect(ok(formatCents(c))).toBe(c);
  });
});

describe('sign conventions', () => {
  it('signed_amount keeps sign and rejects contradictions', () => {
    expect(applySignConvention(1000, 'invoice', 'signed_amount')).toEqual({ ok: true, cents: 1000 });
    expect(applySignConvention(-1000, 'credit_note', 'signed_amount')).toEqual({ ok: true, cents: -1000 });
    expect(applySignConvention(-1000, 'invoice', 'signed_amount')).toMatchObject({ ok: false, code: 'CONTRADICTORY_SIGN' });
    expect(applySignConvention(1000, 'credit_note', 'signed_amount')).toMatchObject({ ok: false, code: 'CONTRADICTORY_SIGN' });
    expect(applySignConvention(0, 'credit_note', 'signed_amount')).toEqual({ ok: true, cents: 0 });
  });
  it('by_document_type signs by type and never double-negates a credit', () => {
    expect(applySignConvention(1000, 'invoice', 'by_document_type')).toEqual({ ok: true, cents: 1000 });
    expect(applySignConvention(1000, 'credit_note', 'by_document_type')).toEqual({ ok: true, cents: -1000 });
    expect(applySignConvention(-1000, 'credit_note', 'by_document_type')).toEqual({ ok: true, cents: -1000 });
    expect(applySignConvention(-1000, 'invoice', 'by_document_type')).toMatchObject({ ok: false, code: 'CONTRADICTORY_SIGN' });
  });
});

describe('aggregation overflow', () => {
  it('sums safely and throws on overflow', () => {
    expect(sumCents([100, 200, -50])).toBe(250);
    expect(addCents(Number.MAX_SAFE_INTEGER - 1, 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => addCents(Number.MAX_SAFE_INTEGER, 1)).toThrow(/overflow|safe integer/i);
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow();
    expect(() => addCents(1.5, 1)).toThrow();
  });
});
