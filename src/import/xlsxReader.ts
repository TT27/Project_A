/**
 * XLSX reader built on ExcelJS. Reads *saved* scalar values only; it never
 * evaluates formulas or executes workbook content. Formula cells are accepted
 * when they carry a usable cached result and flagged otherwise.
 */
import ExcelJS from 'exceljs';
import { LIMITS } from './limits';
import { ImportError, type RawGrid, type RawRow, type SheetInfo } from './types';

export interface RawWorkbook {
  sheets: SheetInfo[];
  gridFor(sheetName: string): RawGrid;
}

interface CellRead {
  text: string;
  isFormula: boolean;
  /** True when the (formula or value) cell carries a usable scalar value. */
  hasValue: boolean;
  isNumeric: boolean;
}

function scalarToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) {
    // Format as YYYY-MM-DD using UTC components to avoid any timezone shift.
    const y = value.getUTCFullYear().toString().padStart(4, '0');
    const m = (value.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = value.getUTCDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

function readCell(cell: ExcelJS.Cell): CellRead {
  const raw = cell.value;
  if (raw !== null && typeof raw === 'object') {
    if ('formula' in raw || 'sharedFormula' in raw) {
      const result = (raw as ExcelJS.CellFormulaValue).result;
      if (result === null || result === undefined || (typeof result === 'object' && 'error' in result)) {
        return { text: '', isFormula: true, hasValue: false, isNumeric: false };
      }
      const text = scalarToText(result);
      return { text, isFormula: true, hasValue: text !== '', isNumeric: typeof result === 'number' };
    }
    if ('richText' in raw) {
      const text = raw.richText.map((r) => r.text).join('');
      return { text, isFormula: false, hasValue: text !== '', isNumeric: false };
    }
    if ('text' in raw && 'hyperlink' in raw) {
      const text = raw.text ?? '';
      return { text, isFormula: false, hasValue: text !== '', isNumeric: false };
    }
    if ('error' in raw) {
      return { text: '', isFormula: false, hasValue: false, isNumeric: false };
    }
    if (raw instanceof Date) {
      const text = scalarToText(raw);
      return { text, isFormula: false, hasValue: true, isNumeric: false };
    }
    return { text: '', isFormula: false, hasValue: false, isNumeric: false };
  }
  const text = scalarToText(raw);
  return { text, isFormula: false, hasValue: text !== '', isNumeric: typeof raw === 'number' };
}

function buildGrid(worksheet: ExcelJS.Worksheet): RawGrid {
  const rowCount = worksheet.actualRowCount || worksheet.rowCount || 0;
  if (rowCount > LIMITS.maxScanRows) {
    throw new ImportError('TOO_MANY_ROWS', `Worksheet has more than ${LIMITS.maxScanRows} rows`);
  }
  let columnCount = Math.min(worksheet.actualColumnCount || worksheet.columnCount || 0, LIMITS.maxColumns + 1);
  if (columnCount > LIMITS.maxColumns) {
    throw new ImportError('TOO_MANY_COLUMNS', `Worksheet has more than ${LIMITS.maxColumns} columns`);
  }
  columnCount = Math.max(columnCount, 0);

  const rows: RawRow[] = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = Array.from({ length: columnCount }, () => '');
    const formulaColumns: number[] = [];
    const formulaWithoutValue: number[] = [];
    const numericColumns: number[] = [];
    for (let c = 1; c <= columnCount; c++) {
      const read = readCell(row.getCell(c));
      cells[c - 1] = read.text;
      if (read.isFormula) {
        formulaColumns.push(c - 1);
        if (!read.hasValue) formulaWithoutValue.push(c - 1);
      }
      if (read.isNumeric) numericColumns.push(c - 1);
    }
    rows.push({
      index: rowNumber,
      cells,
      hidden: row.hidden === true,
      formulaColumns,
      formulaWithoutValue,
      numericColumns
    });
  });

  return { sheetName: worksheet.name, rows, columnCount };
}

export async function readXlsxWorkbook(path: string): Promise<RawWorkbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(path);
  } catch (err) {
    throw new ImportError('UNREADABLE_WORKBOOK', `The workbook could not be read: ${(err as Error).message}`);
  }
  const worksheets = workbook.worksheets.filter((ws) => ws.state !== 'veryHidden');
  if (worksheets.length === 0) {
    throw new ImportError('NO_WORKSHEETS', 'The workbook contains no readable worksheets');
  }

  const sheets: SheetInfo[] = worksheets.map((ws) => ({
    name: ws.name,
    rowCount: ws.actualRowCount || ws.rowCount || 0,
    columnCount: Math.min(ws.actualColumnCount || ws.columnCount || 0, LIMITS.maxColumns),
    hidden: ws.state === 'hidden'
  }));

  return {
    sheets,
    gridFor(sheetName: string): RawGrid {
      const ws = worksheets.find((w) => w.name === sheetName);
      if (!ws) throw new ImportError('SHEET_NOT_FOUND', `Worksheet "${sheetName}" was not found`);
      return buildGrid(ws);
    }
  };
}
