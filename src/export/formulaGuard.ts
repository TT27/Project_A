/**
 * Spreadsheet / CSV formula-injection neutralisation.
 *
 * A text cell whose first character is one of = + - @ (or a leading TAB / CR, which
 * some spreadsheet apps also treat as a formula lead-in) can be executed as a formula
 * when the exported file is re-opened in Excel / Numbers / LibreOffice. We neutralise
 * such values in the EXPORTED copy only by prefixing a single apostrophe, which those
 * apps render as literal text. The value preserved in the local database is never
 * altered — callers pass the original string and receive a safe copy.
 *
 * This is applied to free-text / identifier cells. Numeric financial cells are written
 * as real numbers (never as strings), so they are not — and must not be — guarded here,
 * otherwise legitimate negative amounts like -88.00 would be corrupted.
 */

const TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/** True when `value` would be interpreted as a formula by a spreadsheet application. */
export function needsFormulaGuard(value: string): boolean {
  return value.length > 0 && TRIGGERS.includes(value[0]!);
}

/** Returns a copy of `value` that is safe to place in a spreadsheet/CSV text cell. */
export function guardText(value: string): string {
  return needsFormulaGuard(value) ? `'${value}` : value;
}
