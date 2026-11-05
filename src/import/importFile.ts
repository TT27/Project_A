/** runImport: end-to-end single-side import (read → parse → normalise → controls). */
import { sumCents, parseMoney } from '@domain/money';
import type { CompletenessStatus } from '@domain/models';
import { loadSource } from './source';
import { parseRows } from './parse';
import { normaliseRows } from './normalise';
import { sha256File } from './hash';
import type { MappingPreview, MappingPreviewRow } from '@shared/contracts';
import { ImportError, type ImportConfig, type ImportResult, type NormalisedRow, type RowIssue, type SideControlReport } from './types';

function buildControl(importedCents: number, controlTotalText: string | null): SideControlReport {
  if (controlTotalText === null || controlTotalText.trim() === '') {
    return { importedCents, controlCents: null, varianceCents: null, status: 'Unverified' };
  }
  const parsed = parseMoney(controlTotalText, { allowParentheses: true });
  if (!parsed.ok) {
    throw new ImportError('BAD_CONTROL_TOTAL', `The source control total could not be parsed: ${parsed.message}`);
  }
  const varianceCents = importedCents - parsed.cents;
  const status: CompletenessStatus = varianceCents === 0 ? 'Verified' : 'Mismatch';
  return { importedCents, controlCents: parsed.cents, varianceCents, status };
}

function summariseWarnings(rowWarnings: RowIssue[][]): RowIssue[] {
  const counts = new Map<string, { message: string; n: number }>();
  for (const list of rowWarnings) {
    for (const w of list) {
      const entry = counts.get(w.code) ?? { message: w.message, n: 0 };
      entry.n += 1;
      counts.set(w.code, entry);
    }
  }
  const summary: RowIssue[] = [];
  for (const [code, { n }] of counts) {
    summary.push({ code, message: `${n} row${n === 1 ? '' : 's'} flagged: ${code.replace(/_/g, ' ').toLowerCase()}` });
  }
  return summary;
}

function toPreviewRow(row: NormalisedRow): MappingPreviewRow {
  return {
    sourceRow: row.sourceRow,
    status: row.status,
    ...(row.excludedReason === undefined ? {} : { excludedReason: row.excludedReason }),
    warnings: row.warnings,
    errors: row.errors,
    interpreted: row.interpreted,
    rawCells: row.rawCells
  };
}

/** Lightweight preview: same pipeline, first `limit` rows, no file hashing. */
export async function runPreview(config: ImportConfig, limit = 100): Promise<MappingPreview> {
  const source = await loadSource(config.path, config.kind);
  const grid = source.gridFor(config.sheetName);
  const parsed = parseRows({
    grid,
    headerRow: config.headerRow,
    dataStartRow: config.dataStartRow,
    dataEndRow: config.dataEndRow,
    excludedRows: config.excludedRows
  });
  const normalised = normaliseRows(parsed, config.side, config.mapping, config.scope, config.options);
  const importedCents = sumCents(normalised.canonicalRows.map((r) => r.outstandingCents));
  return {
    sheetName: parsed.sheetName,
    header: parsed.header,
    rows: normalised.rows.slice(0, limit).map(toPreviewRow),
    counts: normalised.counts,
    control: buildControl(importedCents, config.controlTotalText)
  };
}

export async function runImport(config: ImportConfig, onProgress?: (fraction: number) => void): Promise<ImportResult> {
  onProgress?.(0.05);
  const source = await loadSource(config.path, config.kind);
  onProgress?.(0.3);
  const grid = source.gridFor(config.sheetName);
  const parsed = parseRows({
    grid,
    headerRow: config.headerRow,
    dataStartRow: config.dataStartRow,
    dataEndRow: config.dataEndRow,
    excludedRows: config.excludedRows
  });
  onProgress?.(0.5);
  const normalised = normaliseRows(parsed, config.side, config.mapping, config.scope, config.options);
  onProgress?.(0.8);
  const sha256 = await sha256File(config.path);
  const importedCents = sumCents(normalised.canonicalRows.map((r) => r.outstandingCents));
  const control = buildControl(importedCents, config.controlTotalText);
  onProgress?.(1);

  return {
    side: config.side,
    kind: source.kind,
    fileName: source.fileName,
    sizeBytes: source.sizeBytes,
    sha256,
    sheetName: parsed.sheetName,
    header: parsed.header,
    rows: normalised.rows,
    canonicalRows: normalised.canonicalRows,
    counts: normalised.counts,
    control,
    warnings: summariseWarnings(normalised.rows.map((r) => r.warnings))
  };
}
