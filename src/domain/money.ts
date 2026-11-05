/**
 * Money handling in signed integer cents. No floating-point arithmetic anywhere.
 */
import type { DocumentType } from './models';

export const MAX_ABS_LINE_CENTS = 99_999_999_999;

export type MoneyErrorCode =
  | 'EMPTY'
  | 'MALFORMED'
  | 'TOO_MANY_DECIMALS'
  | 'OUT_OF_RANGE'
  | 'PARENTHESES_NOT_ALLOWED'
  | 'CONTRADICTORY_SIGN'
  | 'OVERFLOW';

export class MoneyError extends Error {
  constructor(
    public readonly code: MoneyErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'MoneyError';
  }
}

export interface ParseMoneyOptions {
  /** '.' (default) or ','. The other symbol becomes the thousands separator. */
  decimalSeparator?: '.' | ',';
  /** Accept "(123.45)" as −123.45. Default false. */
  allowParentheses?: boolean;
}

export type MoneyParse = { ok: true; cents: number } | { ok: false; code: MoneyErrorCode; message: string };

/**
 * Parses decimal text into signed integer cents.
 * Accepts: optional leading/trailing sign, optional currency symbol "$"/"AUD", thousands
 * separators, at most two decimal places, optional parentheses for negatives when configured.
 */
export function parseMoney(input: string, options: ParseMoneyOptions = {}): MoneyParse {
  const decimalSep = options.decimalSeparator ?? '.';
  const thousandsSep = decimalSep === '.' ? ',' : '.';
  let text = input.replace(/\u00a0/g, ' ').trim();
  if (text === '') return { ok: false, code: 'EMPTY', message: 'Amount is empty' };

  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    if (!options.allowParentheses) {
      return { ok: false, code: 'PARENTHESES_NOT_ALLOWED', message: 'Parenthesised negatives are not enabled for this input' };
    }
    negative = true;
    text = text.slice(1, -1).trim();
  }

  // Strip a currency marker.
  text = text.replace(/^(AUD|A\$|\$)\s*/i, '').replace(/\s*(AUD)$/i, '');

  // Leading or trailing sign.
  if (text.startsWith('-') || text.startsWith('−') || text.startsWith('+')) {
    if (text.startsWith('+')) {
      /* positive */
    } else {
      if (negative) return { ok: false, code: 'MALFORMED', message: 'Conflicting negative markers' };
      negative = true;
    }
    text = text.slice(1).trim();
    text = text.replace(/^(AUD|A\$|\$)\s*/i, '');
  } else if (text.endsWith('-')) {
    if (negative) return { ok: false, code: 'MALFORMED', message: 'Conflicting negative markers' };
    negative = true;
    text = text.slice(0, -1).trim();
  } else if (/\s(CR|DR)$/i.test(text)) {
    return { ok: false, code: 'MALFORMED', message: 'CR/DR suffixes are not supported; use the sign convention setting' };
  }

  if (text === '') return { ok: false, code: 'MALFORMED', message: 'Amount has no digits' };

  const escThousands = thousandsSep === '.' ? '\\.' : ',';
  const escDecimal = decimalSep === '.' ? '\\.' : ',';
  // Integer part: digits optionally grouped in threes with the thousands separator.
  const pattern = new RegExp(`^(\\d{1,3}(?:${escThousands}\\d{3})+|\\d+)(?:${escDecimal}(\\d{0,2}))?$`);
  const match = pattern.exec(text);
  if (!match) {
    // Distinguish "too many decimals" from general malformation for better messages.
    const decimalsPattern = new RegExp(`^(?:\\d{1,3}(?:${escThousands}\\d{3})+|\\d+)${escDecimal}(\\d{3,})$`);
    if (decimalsPattern.test(text)) {
      return { ok: false, code: 'TOO_MANY_DECIMALS', message: 'Amount has more than two decimal places' };
    }
    return { ok: false, code: 'MALFORMED', message: `Amount "${input}" is not a valid decimal number` };
  }
  const intPart = match[1]!.split(thousandsSep).join('');
  const fracPart = (match[2] ?? '').padEnd(2, '0');
  if (intPart.length > 12) return { ok: false, code: 'OUT_OF_RANGE', message: 'Amount exceeds the supported range' };

  const cents = Number(intPart) * 100 + Number(fracPart);
  if (!Number.isSafeInteger(cents) || cents > MAX_ABS_LINE_CENTS) {
    return { ok: false, code: 'OUT_OF_RANGE', message: 'Amount exceeds the supported range of 999,999,999.99' };
  }
  return { ok: true, cents: negative ? -cents : cents };
}

/** Formats signed integer cents as "1,234.56" / "-1,234.56". */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new MoneyError('OUT_OF_RANGE', 'Cannot format a non-integer amount');
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${wholeText}.${frac.toString().padStart(2, '0')}`;
}

/** Formats with an explicit sign, e.g. "+327.00" / "-88.00" / "0.00". */
export function formatSignedCents(cents: number): string {
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);
}

export type SignMode = 'signed_amount' | 'by_document_type';

export interface ApplySignResult {
  cents: number;
  /** Set when the source sign contradicts the document type (and was therefore rejected). */
}

/**
 * Applies the selected sign convention.
 *
 * - signed_amount: the parsed sign is authoritative. A positive credit note or a negative
 *   invoice is a contradiction and is rejected.
 * - by_document_type: the parsed magnitude is used; invoices become positive and credit notes
 *   negative. A credit note already supplied as negative is accepted (never double-negated);
 *   an invoice supplied as negative is contradictory and rejected.
 */
export function applySignConvention(parsedCents: number, documentType: DocumentType, mode: SignMode): MoneyParse {
  if (mode === 'signed_amount') {
    if (documentType === 'invoice' && parsedCents < 0) {
      return { ok: false, code: 'CONTRADICTORY_SIGN', message: 'Invoice outstanding balance must be positive under the signed-amount convention' };
    }
    if (documentType === 'credit_note' && parsedCents > 0) {
      return { ok: false, code: 'CONTRADICTORY_SIGN', message: 'Credit note outstanding balance must be negative under the signed-amount convention' };
    }
    return { ok: true, cents: parsedCents };
  }
  const magnitude = Math.abs(parsedCents);
  if (documentType === 'invoice') {
    if (parsedCents < 0) {
      return { ok: false, code: 'CONTRADICTORY_SIGN', message: 'Invoice supplied as a negative amount contradicts the document-type sign convention' };
    }
    return { ok: true, cents: magnitude };
  }
  return { ok: true, cents: -magnitude };
}

/** Overflow-checked addition of cents. */
export function addCents(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) throw new MoneyError('OVERFLOW', 'Non-integer operand');
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new MoneyError('OVERFLOW', 'Aggregation exceeded the safe integer range');
  return sum;
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total = addCents(total, v);
  return total;
}
