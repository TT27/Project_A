/**
 * Document reference normalisation: trim + Unicode NFC only.
 * Leading zeros, punctuation and case are preserved. "00123" ≠ "123".
 */
export function referenceKey(referenceRaw: string): string {
  return referenceRaw.trim().normalize('NFC');
}

export interface ReferenceWarning {
  code: 'NUMERIC_REFERENCE' | 'EMPTY_REFERENCE' | 'WHITESPACE_TRIMMED';
  message: string;
}

/** Returns non-blocking warnings about a reference value. */
export function inspectReference(referenceRaw: string): ReferenceWarning[] {
  const warnings: ReferenceWarning[] = [];
  const key = referenceKey(referenceRaw);
  if (key === '') {
    warnings.push({ code: 'EMPTY_REFERENCE', message: 'Document reference is empty' });
    return warnings;
  }
  if (key !== referenceRaw) {
    warnings.push({ code: 'WHITESPACE_TRIMMED', message: 'Surrounding whitespace was removed from the reference' });
  }
  if (/^\d+$/.test(key)) {
    warnings.push({
      code: 'NUMERIC_REFERENCE',
      message: 'Reference is purely numeric; spreadsheets may have dropped leading zeros or reformatted it'
    });
  }
  return warnings;
}
