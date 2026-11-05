/** inspectInput: sheet list, header-row guess and a preview grid. */
import { LIMITS } from './limits';
import { CSV_SHEET_NAME, loadSource } from './source';
import type { InputKind, InspectResult, RawGrid } from './types';

type PreviewGrid = InspectResult['preview'];
type PreviewRow = PreviewGrid['rows'][number];

/**
 * Best-effort header-row guess: the first non-empty row (within the preview window)
 * that has the most non-empty text cells. Ties resolve to the earliest row.
 */
export function guessHeaderRow(grid: RawGrid): number {
  let bestRow = grid.rows[0]?.index ?? 1;
  let bestScore = -1;
  const limit = Math.min(grid.rows.length, LIMITS.previewRows);
  for (let i = 0; i < limit; i++) {
    const row = grid.rows[i]!;
    const nonEmpty = row.cells.filter((c) => c.trim() !== '').length;
    // Prefer rows whose cells look like labels (contain a letter) over pure data.
    const labelLike = row.cells.filter((c) => /[a-z]/i.test(c)).length;
    const score = nonEmpty * 2 + labelLike;
    if (nonEmpty >= 2 && score > bestScore) {
      bestScore = score;
      bestRow = row.index;
    }
  }
  return bestRow;
}

function buildPreview(grid: RawGrid, sheetName: string): PreviewGrid {
  const rows: PreviewRow[] = grid.rows.slice(0, LIMITS.previewRows).map((r) => ({
    index: r.index,
    cells: r.cells,
    hidden: r.hidden,
    hasFormula: r.formulaColumns.length > 0,
    formulaWithoutValue: r.formulaWithoutValue.length > 0
  }));
  return { sheetName, columnCount: grid.columnCount, rows };
}

export async function inspectInput(path: string, kind?: InputKind, sheetName?: string): Promise<InspectResult> {
  const source = await loadSource(path, kind);
  const defaultSheet = sheetName ?? source.sheets[0]?.name ?? CSV_SHEET_NAME;
  const grid = source.gridFor(source.kind === 'csv' ? null : defaultSheet);
  return {
    kind: source.kind,
    sheets: source.sheets,
    defaultSheet,
    headerRowGuess: guessHeaderRow(grid),
    preview: buildPreview(grid, defaultSheet)
  };
}
