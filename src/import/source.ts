/** Uniform access to a source file as one or more named grids. */
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseCsvToGrid } from './csvReader';
import { readXlsxWorkbook } from './xlsxReader';
import { LIMITS } from './limits';
import { ImportError, type InputKind, type RawGrid, type SheetInfo } from './types';

export const CSV_SHEET_NAME = 'CSV';

export interface LoadedSource {
  kind: InputKind;
  fileName: string;
  sizeBytes: number;
  sheets: SheetInfo[];
  gridFor(sheetName: string | null): RawGrid;
}

export function inferKind(path: string): InputKind {
  const lower = path.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  throw new ImportError('UNSUPPORTED_KIND', 'Only .csv and .xlsx files are supported');
}

export async function loadSource(path: string, kind?: InputKind): Promise<LoadedSource> {
  const resolvedKind = kind ?? inferKind(path);
  const info = await stat(path);
  if (!info.isFile()) throw new ImportError('NOT_A_FILE', 'The selected path is not a file');
  if (info.size > LIMITS.maxFileBytes) {
    throw new ImportError('FILE_TOO_LARGE', `File exceeds the ${Math.round(LIMITS.maxFileBytes / (1024 * 1024))} MB limit`);
  }
  const fileName = basename(path);

  if (resolvedKind === 'csv') {
    const content = await readFile(path, 'utf8');
    const grid = parseCsvToGrid(content);
    return {
      kind: 'csv',
      fileName,
      sizeBytes: info.size,
      sheets: [{ name: CSV_SHEET_NAME, rowCount: grid.rows.length, columnCount: grid.columnCount, hidden: false }],
      gridFor: () => grid
    };
  }

  const workbook = await readXlsxWorkbook(path);
  return {
    kind: 'xlsx',
    fileName,
    sizeBytes: info.size,
    sheets: workbook.sheets,
    gridFor: (sheetName) => workbook.gridFor(sheetName ?? workbook.sheets[0]!.name)
  };
}
