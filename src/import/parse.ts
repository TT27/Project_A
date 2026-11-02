/** parseRows: slice a grid into a header row and the selected data range. */
import { LIMITS } from './limits';
import { ImportError, type RawGrid } from './types';

export interface ParseRowsInput {
  grid: RawGrid;
  /** 1-based header row. */
  headerRow: number;
  /** 1-based first data row; defaults to headerRow + 1. */
  dataStartRow?: number;
  /** 1-based last data row (inclusive); null = to the end. */
  dataEndRow?: number | null;
  /** 1-based source row numbers the user explicitly excluded. */
  excludedRows?: number[];
}

export interface ParsedRow {
  sourceRow: number;
  cells: string[];
  hidden: boolean;
  formulaColumns: number[];
  formulaWithoutValue: number[];
  numericColumns: number[];
  userExcluded: boolean;
  isEmpty: boolean;
}

export interface ParsedSource {
  sheetName: string | null;
  header: string[];
  columnCount: number;
  rows: ParsedRow[];
}

export function parseRows(input: ParseRowsInput): ParsedSource {
  const { grid, headerRow } = input;
  const dataStartRow = input.dataStartRow ?? headerRow + 1;
  const dataEndRow = input.dataEndRow ?? null;
  const excluded = new Set(input.excludedRows ?? []);

  if (headerRow < 1) throw new ImportError('BAD_HEADER_ROW', 'Header row must be a positive row number');
  if (dataStartRow <= headerRow) {
    throw new ImportError('BAD_DATA_RANGE', 'The data range must start after the header row');
  }
  if (dataEndRow !== null && dataEndRow < dataStartRow) {
    throw new ImportError('BAD_DATA_RANGE', 'The data range end is before its start');
  }

  const byIndex = new Map(grid.rows.map((r) => [r.index, r]));
  const headerSource = byIndex.get(headerRow);
  const header = headerSource ? [...headerSource.cells] : [];

  const rows: ParsedRow[] = [];
  for (const raw of grid.rows) {
    if (raw.index < dataStartRow) continue;
    if (dataEndRow !== null && raw.index > dataEndRow) continue;
    const isEmpty = raw.cells.every((c) => c.trim() === '');
    rows.push({
      sourceRow: raw.index,
      cells: [...raw.cells],
      hidden: raw.hidden,
      formulaColumns: [...raw.formulaColumns],
      formulaWithoutValue: [...raw.formulaWithoutValue],
      numericColumns: [...raw.numericColumns],
      userExcluded: excluded.has(raw.index),
      isEmpty
    });
  }

  const dataRowCount = rows.filter((r) => !r.isEmpty).length;
  if (dataRowCount > LIMITS.maxDataRows) {
    throw new ImportError('TOO_MANY_DATA_ROWS', `The data range contains more than ${LIMITS.maxDataRows} rows`);
  }

  return { sheetName: grid.sheetName, header, columnCount: grid.columnCount, rows };
}
