/**
 * SQLite-backed repository for a single StatementDesk project (.statementdesk).
 *
 * One ProjectRepository owns one open database connection. It is a Node/Electron
 * layer (better-sqlite3) and must never be imported by src/domain. All multi-row
 * writes (imports, runs) happen in a single transaction so an interruption can
 * never leave partial rows behind.
 */
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { compareOpenItems, serialiseKey } from '@domain/reconciliation/compareOpenItems';
import { validateControls } from '@domain/reconciliation/validateControls';
import { ENGINE_VERSION } from '@domain/version';
import type { CanonicalRow } from '@domain/models';
import {
  type ImportConfig,
  type OutcomeRowDetail,
  type OutcomeView,
  type ProjectSettingsPatch,
  type ProjectSummary,
  type ReconciliationSummaryView,
  type ReviewDecision,
  type ReviewEvent,
  type RunMeta,
  type RunSettings,
  type RunView,
  type Side
} from '@shared/contracts';
import { LATEST_SCHEMA_VERSION, migrate } from './migrations';

export class StorageError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/** The canonical rows + control totals a caller persists after a successful import. */
export interface ImportRecord {
  config: ImportConfig;
  fileName: string;
  kind: ImportConfig['kind'];
  sha256: string;
  sizeBytes: number;
  sheetName: string | null;
  importedCents: number;
  controlCents: number | null;
  controlStatus: string;
  counts: unknown;
  canonicalRows: readonly CanonicalRow[];
}

interface ProjectRow {
  id: string;
  schema_version: number;
  project_name: string;
  supplier_name: string;
  supplier_id: string;
  cutoff_date: string;
  currency: string;
  comparable_confirmed: number;
  created_at: string;
  updated_at: string;
}

interface RowRecord {
  id: string;
  source_id: string;
  project_id: string;
  side: string;
  sheet_name: string | null;
  source_row: number;
  supplier_id: string;
  currency: string;
  as_of_date: string;
  document_type: string;
  reference_raw: string;
  reference_key: string;
  document_date: string;
  outstanding_cents: number;
  raw_cells_json: string;
  mapping_version: number;
}

function toSummary(row: ProjectRow): ProjectSummary {
  return {
    projectId: row.id,
    path: '', // filled in by the caller which knows the file path
    schemaVersion: row.schema_version,
    setup: {
      projectName: row.project_name,
      supplierName: row.supplier_name,
      supplierId: row.supplier_id,
      cutoffDate: row.cutoff_date,
      currency: 'AUD',
      comparableBalancesConfirmed: true
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToCanonical(r: RowRecord): CanonicalRow {
  return {
    id: r.id,
    projectId: r.project_id,
    sourceId: r.source_id,
    side: r.side as Side,
    sheetName: r.sheet_name,
    sourceRow: r.source_row,
    supplierId: r.supplier_id,
    currency: 'AUD',
    asOfDate: r.as_of_date,
    documentType: r.document_type as CanonicalRow['documentType'],
    referenceRaw: r.reference_raw,
    referenceKey: r.reference_key,
    documentDate: r.document_date,
    outstandingCents: r.outstanding_cents,
    rawCells: JSON.parse(r.raw_cells_json) as string[],
    mappingVersion: r.mapping_version
  };
}

export class ProjectRepository {
  private constructor(
    private readonly db: Database.Database,
    public readonly path: string
  ) {}

  /** Opens a connection with WAL + foreign keys and steps the schema to latest. */
  private static connect(path: string): Database.Database {
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    return db;
  }

  /** Creates a new project file. Fails if a project already exists at `path`. */
  static create(path: string, setup: ProjectSummary['setup']): ProjectRepository {
    const db = ProjectRepository.connect(path);
    try {
      migrate(db);
      const existing = db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number };
      if (existing.n > 0) {
        throw new StorageError('PROJECT_EXISTS', 'A project already exists in this file');
      }
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO projects (id, schema_version, project_name, supplier_name, supplier_id,
           cutoff_date, currency, comparable_confirmed, created_at, updated_at)
         VALUES (@id, @schema_version, @project_name, @supplier_name, @supplier_id,
           @cutoff_date, @currency, @comparable_confirmed, @created_at, @updated_at)`
      ).run({
        id: randomUUID(),
        schema_version: LATEST_SCHEMA_VERSION,
        project_name: setup.projectName,
        supplier_name: setup.supplierName,
        supplier_id: setup.supplierId,
        cutoff_date: setup.cutoffDate,
        currency: 'AUD',
        comparable_confirmed: 1,
        created_at: now,
        updated_at: now
      });
    } catch (err) {
      db.close();
      throw err;
    }
    return new ProjectRepository(db, path);
  }

  /** Opens an existing project file, verifying integrity and migrating if needed. */
  static open(path: string): ProjectRepository {
    let db: Database.Database;
    try {
      db = ProjectRepository.connect(path);
    } catch (err) {
      throw new StorageError('UNREADABLE_PROJECT', `The project could not be opened: ${(err as Error).message}`);
    }
    try {
      const integrity = db.pragma('integrity_check', { simple: true }) as string;
      if (integrity !== 'ok') {
        throw new StorageError('CORRUPT_PROJECT', 'The project file failed an integrity check and may be corrupted');
      }
      const hasProjects = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'")
        .get();
      if (!hasProjects) {
        throw new StorageError('NOT_A_PROJECT', 'This file is not a StatementDesk project');
      }
      migrate(db);
      const count = (db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number }).n;
      if (count !== 1) throw new StorageError('NOT_A_PROJECT', 'This file is not a valid StatementDesk project');
    } catch (err) {
      db.close();
      if (err instanceof StorageError) throw err;
      throw new StorageError('CORRUPT_PROJECT', `The project file could not be read: ${(err as Error).message}`);
    }
    return new ProjectRepository(db, path);
  }

  private projectRow(): ProjectRow {
    const row = this.db.prepare('SELECT * FROM projects LIMIT 1').get() as ProjectRow | undefined;
    if (!row) throw new StorageError('NO_PROJECT', 'The project database has no project record');
    return row;
  }

  getProject(): ProjectSummary {
    return { ...toSummary(this.projectRow()), path: this.path };
  }

  get projectId(): string {
    return this.projectRow().id;
  }

  updateSettings(patch: ProjectSettingsPatch): ProjectSummary {
    const now = new Date().toISOString();
    const current = this.projectRow();
    this.db
      .prepare('UPDATE projects SET project_name = ?, supplier_name = ?, updated_at = ? WHERE id = ?')
      .run(patch.projectName ?? current.project_name, patch.supplierName ?? current.supplier_name, now, current.id);
    return this.getProject();
  }

  /** Persists one side's import in a single transaction (replacing any prior one). */
  saveImport(record: ImportRecord): string {
    const projectId = this.projectId;
    const sourceId = randomUUID();
    const now = new Date().toISOString();
    const side = record.config.side;

    const tx = this.db.transaction(() => {
      // Re-importing a side replaces its previous source; cascade clears old rows.
      const prior = this.db.prepare('SELECT id FROM sources WHERE project_id = ? AND side = ?').get(projectId, side) as
        | { id: string }
        | undefined;
      if (prior) this.db.prepare('DELETE FROM sources WHERE id = ?').run(prior.id);

      this.db
        .prepare(
          `INSERT INTO sources (id, project_id, side, file_name, kind, sha256, size_bytes, sheet_name,
             mapping_json, imported_cents, control_cents, control_status, counts_json, imported_at)
           VALUES (@id, @project_id, @side, @file_name, @kind, @sha256, @size_bytes, @sheet_name,
             @mapping_json, @imported_cents, @control_cents, @control_status, @counts_json, @imported_at)`
        )
        .run({
          id: sourceId,
          project_id: projectId,
          side,
          file_name: record.fileName,
          kind: record.kind,
          sha256: record.sha256,
          size_bytes: record.sizeBytes,
          sheet_name: record.sheetName,
          mapping_json: JSON.stringify({ mapping: record.config.mapping, options: record.config.options }),
          imported_cents: record.importedCents,
          control_cents: record.controlCents,
          control_status: record.controlStatus,
          counts_json: JSON.stringify(record.counts),
          imported_at: now
        });

      const insertRow = this.db.prepare(
        `INSERT INTO rows (id, source_id, project_id, side, sheet_name, source_row, supplier_id, currency,
           as_of_date, document_type, reference_raw, reference_key, document_date, outstanding_cents,
           raw_cells_json, mapping_version)
         VALUES (@id, @source_id, @project_id, @side, @sheet_name, @source_row, @supplier_id, @currency,
           @as_of_date, @document_type, @reference_raw, @reference_key, @document_date, @outstanding_cents,
           @raw_cells_json, @mapping_version)`
      );
      for (const row of record.canonicalRows) {
        insertRow.run({
          id: row.id,
          source_id: sourceId,
          project_id: projectId,
          side: row.side,
          sheet_name: row.sheetName,
          source_row: row.sourceRow,
          supplier_id: row.supplierId,
          currency: 'AUD',
          as_of_date: row.asOfDate,
          document_type: row.documentType,
          reference_raw: row.referenceRaw,
          reference_key: row.referenceKey,
          document_date: row.documentDate,
          outstanding_cents: row.outstandingCents,
          raw_cells_json: JSON.stringify(row.rawCells),
          mapping_version: row.mappingVersion
        });
      }
    });
    tx();
    return sourceId;
  }

  hasImport(side: Side): boolean {
    const row = this.db.prepare('SELECT 1 FROM sources WHERE project_id = ? AND side = ?').get(this.projectId, side);
    return row !== undefined;
  }

  private canonicalRows(): CanonicalRow[] {
    const rows = this.db.prepare('SELECT * FROM rows WHERE project_id = ?').all(this.projectId) as RowRecord[];
    return rows.map(rowToCanonical);
  }

  private controlCents(side: Side): number | null {
    const row = this.db.prepare('SELECT control_cents FROM sources WHERE project_id = ? AND side = ?').get(this.projectId, side) as
      | { control_cents: number | null }
      | undefined;
    return row?.control_cents ?? null;
  }

  private fileNameFor(side: Side): string {
    const row = this.db.prepare('SELECT file_name FROM sources WHERE project_id = ? AND side = ?').get(this.projectId, side) as
      | { file_name: string }
      | undefined;
    return row?.file_name ?? '';
  }

  /** Runs reconciliation and writes an immutable run snapshot. Prior runs are never touched. */
  createRun(): RunView {
    if (!this.hasImport('statement') || !this.hasImport('ledger')) {
      throw new StorageError('MISSING_IMPORT', 'Both a statement and a ledger must be imported before reconciling');
    }
    const projectId = this.projectId;
    const rows = this.canonicalRows();
    const controls = { statementCents: this.controlCents('statement'), ledgerCents: this.controlCents('ledger') };
    const controlValidation = validateControls(rows, controls);
    const result = compareOpenItems(rows, { completeness: controlValidation.completeness });

    const byId = new Map(rows.map((r) => [r.id, r]));
    const fileNames: Record<Side, string> = {
      statement: this.fileNameFor('statement'),
      ledger: this.fileNameFor('ledger')
    };

    const runId = randomUUID();
    const now = new Date().toISOString();
    const settings: RunSettings = { statementControlCents: controls.statementCents, ledgerControlCents: controls.ledgerCents };

    const outcomeViews: OutcomeView[] = result.outcomes.map((o) => {
      const outcomeKey = serialiseKey(o.key);
      const detail: OutcomeRowDetail[] = [...o.statementRowIds, ...o.ledgerRowIds].flatMap((rid) => {
        const row = byId.get(rid);
        if (!row) return [];
        return [
          {
            rowId: row.id,
            side: row.side,
            fileName: fileNames[row.side],
            sheetName: row.sheetName,
            sourceRow: row.sourceRow,
            referenceRaw: row.referenceRaw,
            documentDate: row.documentDate,
            outstandingCents: row.outstandingCents
          }
        ];
      });
      const statementDate = detail.find((d) => d.side === 'statement')?.documentDate ?? null;
      const ledgerDate = detail.find((d) => d.side === 'ledger')?.documentDate ?? null;
      return {
        id: `${runId}:${o.id}`,
        outcomeKey,
        category: o.category,
        referenceKey: o.referenceKey,
        documentType: o.documentType,
        statementCents: o.statementCents,
        ledgerCents: o.ledgerCents,
        differenceCents: o.differenceCents,
        reasonCodes: o.reasonCodes,
        statementDate,
        ledgerDate,
        rows: detail,
        review: null
      };
    });

    const tx = this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO runs (id, project_id, engine_version, created_at, settings_json, summary_json) VALUES (?,?,?,?,?,?)')
        .run(runId, projectId, ENGINE_VERSION, now, JSON.stringify(settings), JSON.stringify(result.summary));
      const insertOutcome = this.db.prepare(
        `INSERT INTO outcomes (id, run_id, outcome_key, category, reference_key, document_type,
           statement_cents, ledger_cents, difference_cents, reason_codes_json, detail_json)
         VALUES (@id, @run_id, @outcome_key, @category, @reference_key, @document_type,
           @statement_cents, @ledger_cents, @difference_cents, @reason_codes_json, @detail_json)`
      );
      for (const o of outcomeViews) {
        insertOutcome.run({
          id: o.id,
          run_id: runId,
          outcome_key: o.outcomeKey,
          category: o.category,
          reference_key: o.referenceKey,
          document_type: o.documentType,
          statement_cents: o.statementCents,
          ledger_cents: o.ledgerCents,
          difference_cents: o.differenceCents,
          reason_codes_json: JSON.stringify(o.reasonCodes),
          detail_json: JSON.stringify({ statementDate: o.statementDate, ledgerDate: o.ledgerDate, rows: o.rows })
        });
      }
    });
    tx();

    return this.getRun(runId);
  }

  getRun(runId: string): RunView {
    const run = this.db.prepare('SELECT * FROM runs WHERE id = ? AND project_id = ?').get(runId, this.projectId) as
      | { id: string; project_id: string; engine_version: string; created_at: string; settings_json: string; summary_json: string }
      | undefined;
    if (!run) throw new StorageError('RUN_NOT_FOUND', 'The requested reconciliation run was not found');

    const outcomeRows = this.db.prepare('SELECT * FROM outcomes WHERE run_id = ?').all(runId) as {
      id: string;
      outcome_key: string;
      category: string;
      reference_key: string;
      document_type: string;
      statement_cents: number;
      ledger_cents: number;
      difference_cents: number;
      reason_codes_json: string;
      detail_json: string;
    }[];

    const reviewByKey = this.latestReviewsByKey();

    const outcomes: OutcomeView[] = outcomeRows.map((row) => {
      const detail = JSON.parse(row.detail_json) as { statementDate: string | null; ledgerDate: string | null; rows: OutcomeRowDetail[] };
      return {
        id: row.id,
        outcomeKey: row.outcome_key,
        category: row.category as OutcomeView['category'],
        referenceKey: row.reference_key,
        documentType: row.document_type as OutcomeView['documentType'],
        statementCents: row.statement_cents,
        ledgerCents: row.ledger_cents,
        differenceCents: row.difference_cents,
        reasonCodes: JSON.parse(row.reason_codes_json) as OutcomeView['reasonCodes'],
        statementDate: detail.statementDate,
        ledgerDate: detail.ledgerDate,
        rows: detail.rows,
        review: reviewByKey.get(row.outcome_key) ?? null
      };
    });
    // Stable ordering: by reference key then category for a deterministic table.
    outcomes.sort((a, b) => a.referenceKey.localeCompare(b.referenceKey) || a.category.localeCompare(b.category));

    return {
      runId: run.id,
      projectId: run.project_id,
      engineVersion: run.engine_version,
      createdAt: run.created_at,
      settings: JSON.parse(run.settings_json) as RunSettings,
      summary: JSON.parse(run.summary_json) as ReconciliationSummaryView,
      outcomes
    };
  }

  listRuns(): RunMeta[] {
    const runs = this.db
      .prepare('SELECT id, engine_version, created_at, summary_json FROM runs WHERE project_id = ? ORDER BY created_at DESC')
      .all(this.projectId) as { id: string; engine_version: string; created_at: string; summary_json: string }[];
    return runs.map((r) => {
      const summary = JSON.parse(r.summary_json) as ReconciliationSummaryView;
      return {
        runId: r.id,
        createdAt: r.created_at,
        engineVersion: r.engine_version,
        exceptionCount: summary.exceptionCount,
        differenceCents: summary.differenceCents
      };
    });
  }

  latestRun(): RunView | null {
    const run = this.db.prepare('SELECT id FROM runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1').get(this.projectId) as
      | { id: string }
      | undefined;
    return run ? this.getRun(run.id) : null;
  }

  /** The most recent (active) decision per outcome key for this project. */
  private latestReviewsByKey(): Map<string, ReviewEvent> {
    const events = this.db
      .prepare('SELECT * FROM review_events WHERE project_id = ? ORDER BY created_at ASC')
      .all(this.projectId) as {
      id: string;
      outcome_key: string;
      run_id: string | null;
      decision: string;
      reviewer: string;
      note: string;
      created_at: string;
      supersedes_id: string | null;
    }[];
    const byKey = new Map<string, ReviewEvent>();
    for (const e of events) {
      byKey.set(e.outcome_key, {
        id: e.id,
        outcomeKey: e.outcome_key,
        runId: e.run_id,
        decision: e.decision as ReviewDecision,
        reviewer: e.reviewer,
        note: e.note,
        createdAt: e.created_at,
        supersedesId: e.supersedes_id
      });
    }
    return byKey;
  }

  recordReview(input: {
    outcomeKey: string;
    runId?: string | null;
    decision: ReviewDecision;
    reviewer?: string;
    note?: string;
    supersedesId?: string;
  }): ReviewEvent {
    const id = randomUUID();
    const now = new Date().toISOString();
    // Supersede the current active decision for this outcome key, if any.
    const supersedes =
      input.supersedesId ??
      (this.db.prepare('SELECT id FROM review_events WHERE project_id = ? AND outcome_key = ? ORDER BY created_at DESC LIMIT 1').get(
        this.projectId,
        input.outcomeKey
      ) as { id: string } | undefined)?.id ??
      null;
    const event: ReviewEvent = {
      id,
      outcomeKey: input.outcomeKey,
      runId: input.runId ?? null,
      decision: input.decision,
      reviewer: input.reviewer?.trim() ? input.reviewer.trim() : 'Unnamed reviewer',
      note: input.note ?? '',
      createdAt: now,
      supersedesId: supersedes
    };
    this.db
      .prepare(
        `INSERT INTO review_events (id, project_id, outcome_key, run_id, decision, reviewer, note, created_at, supersedes_id)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(event.id, this.projectId, event.outcomeKey, event.runId, event.decision, event.reviewer, event.note, event.createdAt, event.supersedesId);
    return event;
  }

  listReviews(): ReviewEvent[] {
    const events = this.db
      .prepare('SELECT * FROM review_events WHERE project_id = ? ORDER BY created_at DESC')
      .all(this.projectId) as {
      id: string;
      outcome_key: string;
      run_id: string | null;
      decision: string;
      reviewer: string;
      note: string;
      created_at: string;
      supersedes_id: string | null;
    }[];
    return events.map((e) => ({
      id: e.id,
      outcomeKey: e.outcome_key,
      runId: e.run_id,
      decision: e.decision as ReviewDecision,
      reviewer: e.reviewer,
      note: e.note,
      createdAt: e.created_at,
      supersedesId: e.supersedes_id
    }));
  }

  /** Writes a consistent backup using SQLite's online backup API. */
  async backup(destPath: string): Promise<void> {
    await this.db.backup(destPath);
  }

  close(): void {
    this.db.close();
  }
}
