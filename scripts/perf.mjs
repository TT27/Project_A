/**
 * Benchmark the reconciliation engine on generated statement and ledger rows.
 *
 * The engine is TypeScript with relative imports, so we bundle it in-memory with
 * esbuild (already a dependency) and import the bundle as a data: URL — no build step
 * and no path-alias resolution required. Run with:  node scripts/perf.mjs [rows]
 */
import { build } from 'esbuild';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

const ROWS = Number(process.argv[2] ?? 10000);

const bundled = await build({
  entryPoints: ['src/domain/reconciliation/compareOpenItems.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'node',
  logLevel: 'silent'
});
const code = bundled.outputFiles[0].text;
const { compareOpenItems } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

function row(side, i, { ref, type = 'invoice', cents, date = '2026-09-01' }) {
  return {
    id: `${side}-${i}`,
    projectId: 'perf',
    sourceId: `src-${side}`,
    side,
    sheetName: null,
    sourceRow: i + 2,
    supplierId: 'SUP001',
    currency: 'AUD',
    asOfDate: '2026-09-30',
    documentType: type,
    referenceRaw: ref,
    referenceKey: ref.toLowerCase(),
    documentDate: date,
    outstandingCents: cents,
    rawCells: [],
    mappingVersion: 1
  };
}

// Build N rows per side: ~90% exact matches, ~10% amount-difference exceptions.
const rows = [];
for (let i = 0; i < ROWS; i++) {
  const ref = `INV${i}`;
  const cents = 10000 + (i % 1000);
  rows.push(row('statement', i, { ref, cents }));
  const ledgerCents = i % 10 === 0 ? cents - 500 : cents; // 10% differ
  rows.push(row('ledger', i, { ref, cents: ledgerCents }));
}

// Warm-up (JIT) then timed runs.
compareOpenItems(rows.slice(0, 200));

const RUNS = 5;
const times = [];
let outcomes = 0;
for (let r = 0; r < RUNS; r++) {
  const t0 = performance.now();
  const result = compareOpenItems(rows);
  const t1 = performance.now();
  times.push(t1 - t0);
  outcomes = result.outcomes.length;
}
times.sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
const min = times[0];
const max = times[times.length - 1];

console.log(JSON.stringify(
  {
    rowsPerSide: ROWS,
    totalRows: rows.length,
    outcomes,
    runs: RUNS,
    medianMs: Number(median.toFixed(1)),
    minMs: Number(min.toFixed(1)),
    maxMs: Number(max.toFixed(1)),
    hardware: {
      cpus: os.cpus().length,
      model: os.cpus()[0]?.model?.trim(),
      totalMemGB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
      node: process.version,
      platform: `${os.platform()} ${os.release()}`
    }
  },
  null,
  2
));
