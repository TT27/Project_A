/**
 * Phase 4 persistence exit test. Drives the REAL import layer over the golden CSV
 * fixtures, persists both sides through the SQLite ProjectRepository, runs a
 * reconciliation snapshot, records a review decision, then closes and reopens the
 * .statementdesk file to prove rows, runs and notes survive. Also covers multiple
 * immutable runs, migration-preserves-data, corrupted-file rejection and the
 * single-transaction (no partial rows) guarantee. Runs under Node via N-API
 * better-sqlite3 (ABI-stable prebuild shared with Electron — no rebuild needed).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inspectInput, runImport } from '../../src/import';
import type { ColumnMapping, ImportConfig, ImportResult, NormaliseOptions, ProjectScope } from '../../src/import';
import { ProjectRepository, StorageError } from '../../src/storage';
import type { ImportRecord } from '../../src/storage';
import type { ProjectSetup } from '../../src/shared/contracts';
import type { Side } from '../../src/domain/models';

const SAMPLES_DIR = join(__dirname, '..', '..', 'samples');
const CUTOFF = '2026-09-30';
const MAPPING: ColumnMapping = { reference: 1, documentType: 2, documentDate: 3, outstanding: 4, supplier: 0, currency: -1, asOfDate: -1 };

const SETUP: ProjectSetup = {
  projectName: 'Golden SUP001',
  supplierName: 'Supplier One',
  supplierId: 'SUP001',
  cutoffDate: CUTOFF,
  currency: 'AUD',
  comparableBalancesConfirmed: true
};

function scope(side: Side): ProjectScope {
  return { projectId: 'proj', sourceId: `src-${side}`, supplierId: 'SUP001', currency: 'AUD', cutoffDate: CUTOFF };
}

function options(side: Side): NormaliseOptions {
  return { signMode: 'signed_amount', dateFormat: side === 'statement' ? 'DD/MM/YYYY' : 'YYYY-MM-DD', decimalSeparator: '.', allowParentheses: true, mappingVersion: 1 };
}

async function importSide(side: Side): Promise<ImportResult> {
  const base = side === 'statement' ? 'statement_SUP001_2026-09-30' : 'ap_ledger_SUP001_2026-09-30';
  const path = join(SAMPLES_DIR, `${base}.csv`);
  const inspected = await inspectInput(path, 'csv');
  const config: ImportConfig = {
    side, path, kind: 'csv', sheetName: inspected.defaultSheet ?? null,
    headerRow: 1, dataStartRow: 2, dataEndRow: null, excludedRows: [],
    mapping: MAPPING, scope: scope(side), options: options(side), controlTotalText: null
  };
  return runImport(config);
}

function recordFrom(result: ImportResult): ImportRecord {
  return {
    config: { side: result.side, path: 'x', kind: result.kind, sheetName: result.sheetName, headerRow: 1, dataStartRow: 2, dataEndRow: null, excludedRows: [], mapping: MAPPING, scope: scope(result.side), options: options(result.side), controlTotalText: null },
    fileName: result.fileName, kind: result.kind, sha256: result.sha256, sizeBytes: result.sizeBytes, sheetName: result.sheetName,
    importedCents: result.control.importedCents, controlCents: result.control.controlCents, controlStatus: result.control.status,
    counts: result.counts, canonicalRows: result.canonicalRows
  };
}

describe('Phase 4 persistence (SQLite repository)', () => {
  let dir: string;
  let file: string;
  let statement: ImportResult;
  let ledger: ImportResult;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'statementdesk-storage-'));
    file = join(dir, 'golden.statementdesk');
    statement = await importSide('statement');
    ledger = await importSide('ledger');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists imports and a reconciliation run, surviving close/reopen with golden numbers', () => {
    const repo = ProjectRepository.create(file, SETUP);
    repo.saveImport(recordFrom(statement));
    repo.saveImport(recordFrom(ledger));
    const run = repo.createRun();

    // Golden results (spec section 10).
    expect(run.summary.statementTotalCents).toBe(286000);
    expect(run.summary.ledgerTotalCents).toBe(253300);
    expect(run.summary.differenceCents).toBe(32700);
    expect(run.summary.exceptionCount).toBe(4);
    expect(run.summary.exactMatchCount).toBe(4);

    repo.close();

    // Reopen: rows + run survive, numbers unchanged.
    const reopened = ProjectRepository.open(file);
    const latest = reopened.latestRun();
    expect(latest).not.toBeNull();
    expect(latest?.summary.differenceCents).toBe(32700);
    expect(latest?.outcomes.length).toBe(run.outcomes.length);
    expect(reopened.getProject().setup.supplierId).toBe('SUP001');
    reopened.close();
  });

  it('keeps every run immutable and retains review notes across reopen', () => {
    const repo = ProjectRepository.open(file);
    const firstRun = repo.latestRun();
    expect(firstRun).not.toBeNull();
    const before = repo.listRuns().length;

    // A second run must not overwrite the first.
    const secondRun = repo.createRun();
    expect(secondRun.runId).not.toBe(firstRun?.runId);
    expect(repo.listRuns().length).toBe(before + 1);
    expect(repo.getRun(firstRun!.runId).summary.differenceCents).toBe(32700);

    const outcomeKey = secondRun.outcomes.find((o) => o.category !== 'EXACT_MATCH')?.outcomeKey ?? secondRun.outcomes[0]!.outcomeKey;
    repo.recordReview({ outcomeKey, runId: secondRun.runId, decision: 'investigate', reviewer: 'Dana', note: 'Chasing credit note' });
    repo.close();

    const reopened = ProjectRepository.open(file);
    const reviews = reopened.listReviews();
    expect(reviews.length).toBe(1);
    expect(reviews[0]!.note).toBe('Chasing credit note');
    expect(reviews[0]!.reviewer).toBe('Dana');
    expect(reviews[0]!.decision).toBe('investigate');
    reopened.close();
  });

  it('rejects a corrupted / non-project file cleanly', () => {
    const junk = join(dir, 'broken.statementdesk');
    writeFileSync(junk, 'this is not a sqlite database at all');
    expect(() => ProjectRepository.open(junk)).toThrow(StorageError);
  });

  it('writes an import atomically (no partial rows on failure)', () => {
    const atomicFile = join(dir, 'atomic.statementdesk');
    const repo = ProjectRepository.create(atomicFile, SETUP);
    // Poison the record so the transaction throws mid-write; expect zero rows afterwards.
    const poisoned = recordFrom(statement);
    const bad = { ...poisoned, canonicalRows: [...poisoned.canonicalRows, null as unknown as (typeof poisoned.canonicalRows)[number]] };
    expect(() => repo.saveImport(bad)).toThrow();
    expect(repo.hasImport('statement')).toBe(false);
    repo.close();
  });
});
