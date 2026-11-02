/**
 * CSV reader built on PapaParse. Handles UTF-8 with an optional BOM, quoted
 * fields and embedded newlines. Produces a RawGrid with 1-based row indices.
 */
import Papa from 'papaparse';
import { LIMITS } from './limits';
import { ImportError, type RawGrid, type RawRow } from './types';

export function parseCsvToGrid(content: string): RawGrid {
  // Strip a leading UTF-8 BOM if present; PapaParse would otherwise keep it on cell 0.
  const text = content.replace(/^\uFEFF/, '');
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
    // Keep everything as strings; never let PapaParse coerce types.
    dynamicTyping: false
  });

  const data = result.data.filter((row) => Array.isArray(row));
  // Drop trailing fully-empty records produced by the file's terminating newline(s),
  // so a single trailing "\n" is not counted as a blank data row (matches XLSX, which
  // ExcelJS already trims). Blank rows *between* data are preserved for flagging.
  while (data.length > 0 && data[data.length - 1]!.every((c) => (c ?? '').toString().trim() === '')) {
    data.pop();
  }
  if (data.length > LIMITS.maxScanRows) {
    throw new ImportError('TOO_MANY_ROWS', `File has more than ${LIMITS.maxScanRows} rows`);
  }

  let columnCount = 0;
  for (const cells of data) columnCount = Math.max(columnCount, cells.length);
  if (columnCount > LIMITS.maxColumns) {
    throw new ImportError('TOO_MANY_COLUMNS', `File has more than ${LIMITS.maxColumns} columns`);
  }

  const rows: RawRow[] = data.map((cells, i) => {
    const padded = cells.map((c) => (c ?? '').toString());
    while (padded.length < columnCount) padded.push('');
    return {
      index: i + 1,
      cells: padded,
      hidden: false,
      formulaColumns: [],
      formulaWithoutValue: [],
      numericColumns: []
    };
  });

  return { sheetName: null, rows, columnCount };
}
