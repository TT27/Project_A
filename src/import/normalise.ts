/**
 * normaliseRows: turn parsed source rows into canonical rows via the pure domain
 * parsers, producing actionable row-level errors and warnings. Nothing here does
 * floating-point money maths — all amounts flow through the domain money parser.
 */
import type { CanonicalRow, DocumentType } from '@domain/models';
import { parseMoney, applySignConvention } from '@domain/money';
import { parseDocumentDate, parseDate } from '@domain/dates';
import { referenceKey, inspectReference } from '@domain/references';
import type { ParsedSource } from './parse';
import type {
  ColumnMapping,
  NormaliseOptions,
  NormaliseResult,
  NormalisedRow,
  ProjectScope,
  RowIssue
} from './types';
import type { Side } from '@domain/models';

/** Maps a raw document-type token to the canonical type, or null if unsupported. */
export function mapDocumentType(raw: string): DocumentType | null {
  const t = raw.trim().toLowerCase();
  if (t === '') return null;
  if (t === 'inv' || t === 'i' || t.startsWith('invoice') || t.startsWith('tax invoice')) return 'invoice';
  if (t === 'cn' || t === 'cr' || t === 'credit' || t.startsWith('credit')) return 'credit_note';
  return null;
}

function cellAt(cells: string[], index: number): string {
  return index >= 0 && index < cells.length ? cells[index]! : '';
}

export function normaliseRows(
  parsed: ParsedSource,
  side: Side,
  mapping: ColumnMapping,
  scope: ProjectScope,
  options: NormaliseOptions
): NormaliseResult {
  const rows: NormalisedRow[] = [];
  const canonicalRows: CanonicalRow[] = [];
  let valid = 0;
  let invalid = 0;
  let excluded = 0;

  for (const row of parsed.rows) {
    const warnings: RowIssue[] = [];
    const errors: RowIssue[] = [];
    const referenceText = cellAt(row.cells, mapping.reference);
    const documentTypeText = cellAt(row.cells, mapping.documentType);
    const documentDateText = cellAt(row.cells, mapping.documentDate);
    const outstandingText = cellAt(row.cells, mapping.outstanding);

    const interpreted = {
      reference: referenceKey(referenceText),
      documentType: documentTypeText.trim(),
      documentDate: documentDateText.trim(),
      outstanding: outstandingText.trim()
    };

    const base: NormalisedRow = {
      sourceRow: row.sourceRow,
      status: 'invalid',
      warnings,
      errors,
      interpreted,
      rawCells: row.cells
    };

    // Explicit user exclusion and empty rows become clearly-labelled excluded items.
    if (row.userExcluded) {
      excluded += 1;
      rows.push({ ...base, status: 'excluded', excludedReason: 'Excluded by reviewer' });
      continue;
    }
    if (row.isEmpty) {
      excluded += 1;
      rows.push({ ...base, status: 'excluded', excludedReason: 'Blank row' });
      continue;
    }

    if (row.hidden) warnings.push({ code: 'HIDDEN_ROW', message: 'Row is hidden in the source worksheet but was still imported' });

    // Formula cells: a mapped formula cell without a usable saved value is rejected.
    const mappedCols = [mapping.reference, mapping.documentType, mapping.documentDate, mapping.outstanding].filter((c) => c >= 0);
    for (const col of mappedCols) {
      if (row.formulaWithoutValue.includes(col)) {
        errors.push({ code: 'FORMULA_NO_VALUE', message: `Column ${col + 1} is a formula with no saved result; re-save the workbook with calculated values` });
      } else if (row.formulaColumns.includes(col)) {
        warnings.push({ code: 'FORMULA_CELL', message: `Column ${col + 1} is a formula; the last saved result was used` });
      }
    }
    if (row.numericColumns.includes(mapping.reference)) {
      warnings.push({ code: 'NUMERIC_STORED_IDENTIFIER', message: 'The reference was stored numerically; leading zeros may have been lost by the spreadsheet' });
    }

    // Reference.
    const refKey = referenceKey(referenceText);
    if (refKey === '') {
      errors.push({ code: 'EMPTY_REFERENCE', field: 'reference', message: 'Document reference is empty' });
    } else {
      for (const w of inspectReference(referenceText)) {
        if (w.code === 'NUMERIC_REFERENCE') warnings.push({ code: 'NUMERIC_REFERENCE', field: 'reference', message: w.message });
      }
    }

    // Document type.
    const docType = mapDocumentType(documentTypeText);
    if (docType === null) {
      errors.push({ code: 'UNSUPPORTED_DOCUMENT_TYPE', field: 'documentType', message: `Document type "${documentTypeText.trim()}" is not supported (expected invoice or credit note)` });
    }

    // Optional supplier column consistency.
    if (mapping.supplier >= 0) {
      const supplierText = cellAt(row.cells, mapping.supplier).trim();
      if (supplierText !== '' && supplierText !== scope.supplierId) {
        errors.push({ code: 'SUPPLIER_MISMATCH', field: 'supplier', message: `Supplier "${supplierText}" does not match the project supplier "${scope.supplierId}"` });
      }
    }

    // Optional currency column consistency.
    if (mapping.currency >= 0) {
      const currencyText = cellAt(row.cells, mapping.currency).trim();
      if (currencyText !== '' && currencyText.toUpperCase() !== scope.currency) {
        errors.push({ code: 'UNSUPPORTED_CURRENCY', field: 'currency', message: `Currency "${currencyText}" is not supported; only ${scope.currency} is allowed` });
      }
    }

    // Optional as-of date column: informational only.
    if (mapping.asOfDate >= 0) {
      const asOfText = cellAt(row.cells, mapping.asOfDate).trim();
      if (asOfText !== '') {
        const asOf = parseDate(asOfText, row.dateColumns.includes(mapping.asOfDate) ? 'YYYY-MM-DD' : options.dateFormat);
        if (!asOf.ok) warnings.push({ code: 'AS_OF_DATE_UNPARSED', field: 'asOfDate', message: `As-of date "${asOfText}" could not be parsed` });
        else if (asOf.isoDate !== scope.cutoffDate) warnings.push({ code: 'AS_OF_DATE_DIFFERS', field: 'asOfDate', message: `As-of date ${asOf.isoDate} differs from the project cutoff ${scope.cutoffDate}` });
      }
    }

    // Amount + sign convention.
    let signedCents: number | null = null;
    const money = parseMoney(outstandingText, { decimalSeparator: options.decimalSeparator, allowParentheses: options.allowParentheses });
    if (!money.ok) {
      errors.push({ code: `AMOUNT_${money.code}`, field: 'outstanding', message: `Outstanding amount: ${money.message}` });
    } else if (docType !== null) {
      const signed = applySignConvention(money.cents, docType, options.signMode);
      if (!signed.ok) errors.push({ code: `AMOUNT_${signed.code}`, field: 'outstanding', message: signed.message });
      else signedCents = signed.cents;
    }

    // Date.
    let isoDate: string | null = null;
    const dateFormat = row.dateColumns.includes(mapping.documentDate) ? 'YYYY-MM-DD' : options.dateFormat;
    const date = parseDocumentDate(documentDateText, dateFormat, scope.cutoffDate);
    if (!date.ok) errors.push({ code: `DATE_${date.code}`, field: 'documentDate', message: `Document date: ${date.message}` });
    else isoDate = date.isoDate;

    // Zero-balance records are retained as explicitly excluded closed items.
    if (errors.length === 0 && signedCents === 0) {
      excluded += 1;
      rows.push({ ...base, status: 'excluded', excludedReason: 'Zero-balance closed item' });
      continue;
    }

    if (errors.length > 0 || signedCents === null || isoDate === null || docType === null) {
      invalid += 1;
      rows.push({ ...base, status: 'invalid' });
      continue;
    }

    const canonical: CanonicalRow = {
      id: `${scope.sourceId}:${row.sourceRow}`,
      projectId: scope.projectId,
      sourceId: scope.sourceId,
      side,
      sheetName: parsed.sheetName,
      sourceRow: row.sourceRow,
      supplierId: scope.supplierId,
      currency: scope.currency,
      asOfDate: scope.cutoffDate,
      documentType: docType,
      referenceRaw: referenceText,
      referenceKey: refKey,
      documentDate: isoDate,
      outstandingCents: signedCents,
      rawCells: row.cells,
      mappingVersion: options.mappingVersion
    };
    canonicalRows.push(canonical);
    valid += 1;
    rows.push({ ...base, status: 'valid', canonical });
  }

  return {
    rows,
    canonicalRows,
    counts: { imported: parsed.rows.length, valid, invalid, excluded }
  };
}
