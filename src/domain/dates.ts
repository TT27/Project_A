/**
 * Strict calendar-date handling. Dates are plain "YYYY-MM-DD" strings; the JavaScript
 * Date object is never used so no timezone conversion can occur.
 */
export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD';

export type DateParse = { ok: true; isoDate: string } | { ok: false; code: 'EMPTY' | 'MALFORMED' | 'IMPOSSIBLE' | 'AFTER_CUTOFF'; message: string };

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2199) return false;
  if (month < 1 || month > 12) return false;
  const max = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1]!;
  return day >= 1 && day <= max;
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function parseDate(input: string, format: DateFormat): DateParse {
  const text = input.trim();
  if (text === '') return { ok: false, code: 'EMPTY', message: 'Date is empty' };
  let year: number, month: number, day: number;
  if (format === 'DD/MM/YYYY') {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (!m) return { ok: false, code: 'MALFORMED', message: `Date "${input}" is not in DD/MM/YYYY form` };
    day = Number(m[1]);
    month = Number(m[2]);
    year = Number(m[3]);
  } else {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!m) return { ok: false, code: 'MALFORMED', message: `Date "${input}" is not in YYYY-MM-DD form` };
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  }
  if (!isValidCalendarDate(year, month, day)) {
    return { ok: false, code: 'IMPOSSIBLE', message: `Date "${input}" is not a real calendar date` };
  }
  return { ok: true, isoDate: toIsoDate(year, month, day) };
}

/** Lexicographic comparison is correct for zero-padded ISO dates. */
export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isAfterCutoff(isoDate: string, cutoffIsoDate: string): boolean {
  return compareIsoDates(isoDate, cutoffIsoDate) > 0;
}

/** Parses a document date and rejects dates later than the confirmed cutoff. */
export function parseDocumentDate(input: string, format: DateFormat, cutoffIsoDate: string): DateParse {
  const parsed = parseDate(input, format);
  if (!parsed.ok) return parsed;
  if (isAfterCutoff(parsed.isoDate, cutoffIsoDate)) {
    return { ok: false, code: 'AFTER_CUTOFF', message: `Document date ${parsed.isoDate} is later than the statement cutoff ${cutoffIsoDate}` };
  }
  return parsed;
}

/** Formats an ISO date as DD/MM/YYYY for Australian display. */
export function formatIsoDateAu(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoDate;
}
