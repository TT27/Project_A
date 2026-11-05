/**
 * XLSX workbook exporter (ExcelJS). Produces the seven standard report sheets.
 * Financial values are written as real numeric cells with a two-decimal display format;
 * identifiers and free text are written as text and formula-guarded. Returns a Buffer.
 */
import ExcelJS from 'exceljs';
import type { Worksheet } from 'exceljs';
import { guardText } from './formulaGuard';
import { centsToNumber, EXCEPTION_CATEGORIES, type ReportModel } from './types';

const MONEY_FMT = '0.00';

/** Writes a formula-guarded text value. */
function textCell(ws: Worksheet, row: number, col: number, value: string): void {
  ws.getCell(row, col).value = guardText(value);
}

/** Writes a numeric money cell (cents -> two-decimal number). */
function moneyCell(ws: Worksheet, row: number, col: number, cents: number): void {
  const cell = ws.getCell(row, col);
  cell.value = centsToNumber(cents);
  cell.numFmt = MONEY_FMT;
}

function headerRow(ws: Worksheet, headers: string[]): void {
  const row = ws.addRow(headers);
  row.font = { bold: true };
}

export async function buildWorkbookBuffer(model: ReportModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'StatementDesk';
  wb.created = new Date(model.generatedAt);
  const { setup } = model.project;
  const s = model.summary;

  /* ---- Summary ---- */
  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ width: 28 }, { width: 44 }];
  const kv: [string, string | number, boolean?][] = [
    ['Project', setup.projectName],
    ['Supplier', setup.supplierName],
    ['Supplier ID', setup.supplierId],
    ['Cut-off date', setup.cutoffDate],
    ['Currency', setup.currency],
    ['Reconciliation engine version', model.engineVersion],
    ['App version', model.appVersion],
    ['Report generated', model.generatedAt],
    ['Run ID', model.run.runId],
    ['Statement rows', s.statementRowCount],
    ['Ledger rows', s.ledgerRowCount],
    ['Exact matches', s.exactMatchCount],
    ['Exceptions', s.exceptionCount],
    ['Unresolved', s.unresolvedCount],
    ['Control totals', s.completeness],
    ['Run status', model.run.settings.invalidRowCount ? 'Incomplete draft' : 'Reconciliation'],
    ['Invalid rows omitted', model.run.settings.invalidRowCount ?? 'Unknown']
  ];
  for (const [k, v] of kv) {
    const row = summary.addRow([k, typeof v === 'number' ? v : undefined]);
    row.getCell(1).font = { bold: true };
    if (typeof v === 'number') row.getCell(2).value = v;
    else textCell(summary, row.number, 2, String(v));
  }
  // Control totals as numeric money cells.
  const money: [string, number][] = [
    ['Statement total', s.statementTotalCents],
    ['Ledger total', s.ledgerTotalCents],
    ['Difference', s.differenceCents]
  ];
  for (const [k, cents] of money) {
    const row = summary.addRow([k]);
    row.getCell(1).font = { bold: true };
    moneyCell(summary, row.number, 2, cents);
  }

  /* ---- Exceptions ---- */
  const exc = wb.addWorksheet('Exceptions');
  exc.columns = [{ width: 18 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 28 }, { width: 22 }, { width: 40 }];
  headerRow(exc, ['Reference', 'Category', 'Statement', 'Ledger', 'Difference', 'Reason codes', 'Review decision', 'Review note']);
  for (const o of model.outcomes) {
    if (!EXCEPTION_CATEGORIES.has(o.category)) continue;
    const r = exc.addRow([]);
    textCell(exc, r.number, 1, o.referenceKey);
    textCell(exc, r.number, 2, o.category);
    moneyCell(exc, r.number, 3, o.statementCents);
    moneyCell(exc, r.number, 4, o.ledgerCents);
    moneyCell(exc, r.number, 5, o.differenceCents);
    textCell(exc, r.number, 6, o.reasonCodes.join(';'));
    textCell(exc, r.number, 7, o.review?.decision ?? 'unreviewed');
    textCell(exc, r.number, 8, o.review?.note ?? '');
  }

  /* ---- Matched ---- */
  const matched = wb.addWorksheet('Matched');
  matched.columns = [{ width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }];
  headerRow(matched, ['Reference', 'Statement', 'Ledger', 'Difference']);
  for (const o of model.outcomes) {
    if (o.category !== 'EXACT_MATCH') continue;
    const r = matched.addRow([]);
    textCell(matched, r.number, 1, o.referenceKey);
    moneyCell(matched, r.number, 2, o.statementCents);
    moneyCell(matched, r.number, 3, o.ledgerCents);
    moneyCell(matched, r.number, 4, o.differenceCents);
  }

  /* ---- ImportedStatement / ImportedLedger ---- */
  for (const [sheetName, side] of [
    ['ImportedStatement', 'statement'],
    ['ImportedLedger', 'ledger']
  ] as const) {
    const ws = wb.addWorksheet(sheetName);
    ws.columns = [{ width: 10 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 14 }, { width: 14 }];
    headerRow(ws, ['Source row', 'Sheet', 'Reference', 'Document type', 'Document date', 'Outstanding']);
    for (const row of model.imported[side]) {
      const r = ws.addRow([row.sourceRow]);
      ws.getCell(r.number, 1).value = row.sourceRow;
      textCell(ws, r.number, 2, row.sheetName ?? '');
      textCell(ws, r.number, 3, row.referenceRaw);
      textCell(ws, r.number, 4, row.documentType);
      textCell(ws, r.number, 5, row.documentDate);
      moneyCell(ws, r.number, 6, row.outstandingCents);
    }
  }

  /* ---- Exclusions (per-side import counters) ---- */
  const exclusions = wb.addWorksheet('Exclusions');
  exclusions.columns = [{ width: 14 }, { width: 24 }, { width: 14 }];
  headerRow(exclusions, ['Side', 'Counter', 'Value']);
  for (const src of model.sources) {
    for (const [counter, value] of Object.entries(src.counts)) {
      const r = exclusions.addRow([]);
      textCell(exclusions, r.number, 1, src.side);
      textCell(exclusions, r.number, 2, counter);
      exclusions.getCell(r.number, 3).value = value;
    }
  }

  /* ---- ImportSettings (source identification + control totals) ---- */
  const settings = wb.addWorksheet('ImportSettings');
  settings.columns = [{ width: 12 }, { width: 32 }, { width: 10 }, { width: 70 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 14 }];
  headerRow(settings, ['Side', 'File name', 'Type', 'SHA-256', 'Bytes', 'Imported', 'Control total', 'Control status']);
  for (const src of model.sources) {
    const r = settings.addRow([]);
    textCell(settings, r.number, 1, src.side);
    textCell(settings, r.number, 2, src.fileName);
    textCell(settings, r.number, 3, src.kind);
    textCell(settings, r.number, 4, src.sha256);
    settings.getCell(r.number, 5).value = src.sizeBytes;
    moneyCell(settings, r.number, 6, src.importedCents);
    if (src.controlCents === null) textCell(settings, r.number, 7, '(none)');
    else moneyCell(settings, r.number, 7, src.controlCents);
    textCell(settings, r.number, 8, src.controlStatus);
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
