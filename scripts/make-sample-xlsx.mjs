// Generates the .xlsx variants of the golden sample CSVs using ExcelJS.
// References are written as text cells so leading zeros/identifiers are preserved.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const samples = join(dirname(fileURLToPath(import.meta.url)), '..', 'samples');
const files = ['statement_SUP001_2026-09-30', 'ap_ledger_SUP001_2026-09-30'];

for (const name of files) {
  const lines = readFileSync(join(samples, `${name}.csv`), 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'StatementDesk samples';
  workbook.created = new Date('2026-09-30T00:00:00Z');
  const sheet = workbook.addWorksheet('OpenItems');
  sheet.addRow(header);
  sheet.getRow(1).font = { bold: true };
  for (const line of lines.slice(1)) {
    const [supplier, reference, type, date, amount] = line.split(',');
    const row = sheet.addRow([supplier, reference, type, date, Number(amount)]);
    row.getCell(2).numFmt = '@';
    row.getCell(5).numFmt = '#,##0.00;-#,##0.00';
  }
  sheet.columns.forEach((c) => (c.width = 18));
  await workbook.xlsx.writeFile(join(samples, `${name}.xlsx`));
  console.log(`wrote samples/${name}.xlsx (${lines.length - 1} data rows)`);
}
