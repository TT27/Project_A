/**
 * Versioned schema migrations for a .statementdesk project database.
 *
 * Each migration is applied inside a transaction and bumps SQLite's
 * `user_version`. Migrations are append-only and never edited once shipped, so
 * an older project file can always be stepped up to the current schema while
 * preserving its data.
 */
import type Database from 'better-sqlite3';

export interface Migration {
  readonly version: number;
  readonly up: string;
}

/** The schema version a freshly created project is stamped with. */
export const LATEST_SCHEMA_VERSION = 2;

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE projects (
        id                   TEXT PRIMARY KEY,
        schema_version       INTEGER NOT NULL,
        project_name         TEXT NOT NULL,
        supplier_name        TEXT NOT NULL,
        supplier_id          TEXT NOT NULL,
        cutoff_date          TEXT NOT NULL,
        currency             TEXT NOT NULL,
        comparable_confirmed INTEGER NOT NULL,
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL
      );

      CREATE TABLE sources (
        id             TEXT PRIMARY KEY,
        project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        side           TEXT NOT NULL,
        file_name      TEXT NOT NULL,
        kind           TEXT NOT NULL,
        sha256         TEXT NOT NULL,
        size_bytes     INTEGER NOT NULL,
        sheet_name     TEXT,
        mapping_json   TEXT NOT NULL,
        imported_cents INTEGER NOT NULL,
        control_cents  INTEGER,
        control_status TEXT NOT NULL,
        counts_json    TEXT NOT NULL,
        imported_at    TEXT NOT NULL,
        UNIQUE(project_id, side)
      );

      CREATE TABLE rows (
        id                TEXT PRIMARY KEY,
        source_id         TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        project_id        TEXT NOT NULL,
        side              TEXT NOT NULL,
        sheet_name        TEXT,
        source_row        INTEGER NOT NULL,
        supplier_id       TEXT NOT NULL,
        currency          TEXT NOT NULL,
        as_of_date        TEXT NOT NULL,
        document_type     TEXT NOT NULL,
        reference_raw     TEXT NOT NULL,
        reference_key     TEXT NOT NULL,
        document_date     TEXT NOT NULL,
        outstanding_cents INTEGER NOT NULL,
        raw_cells_json    TEXT NOT NULL,
        mapping_version   INTEGER NOT NULL
      );
      CREATE INDEX idx_rows_source ON rows(source_id);
      CREATE INDEX idx_rows_project_side ON rows(project_id, side);

      CREATE TABLE runs (
        id             TEXT PRIMARY KEY,
        project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        engine_version TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        settings_json  TEXT NOT NULL,
        summary_json   TEXT NOT NULL
      );
      CREATE INDEX idx_runs_project ON runs(project_id, created_at);

      CREATE TABLE outcomes (
        id                TEXT PRIMARY KEY,
        run_id            TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        outcome_key       TEXT NOT NULL,
        category          TEXT NOT NULL,
        reference_key     TEXT NOT NULL,
        document_type     TEXT NOT NULL,
        statement_cents   INTEGER NOT NULL,
        ledger_cents      INTEGER NOT NULL,
        difference_cents  INTEGER NOT NULL,
        reason_codes_json TEXT NOT NULL,
        detail_json       TEXT NOT NULL
      );
      CREATE INDEX idx_outcomes_run ON outcomes(run_id);

      CREATE TABLE review_events (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        outcome_key   TEXT NOT NULL,
        run_id        TEXT,
        decision      TEXT NOT NULL,
        reviewer      TEXT NOT NULL,
        note          TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        supersedes_id TEXT
      );
      CREATE INDEX idx_review_outcome ON review_events(project_id, outcome_key, created_at);

      CREATE TABLE mapping_profiles (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        side        TEXT,
        version     INTEGER NOT NULL,
        config_json TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        UNIQUE(project_id, name)
      );
    `
  },
  {
    version: 2,
    up: `
      ALTER TABLE runs ADD COLUMN sources_json TEXT;
      UPDATE projects SET schema_version = 2;
    `
  }
];

/** Steps the database up from its current `user_version` to the latest schema. */
export function migrate(db: Database.Database): number {
  const current = db.pragma('user_version', { simple: true }) as number;
  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    const apply = db.transaction(() => {
      db.exec(migration.up);
      db.pragma(`user_version = ${migration.version}`);
    });
    apply();
  }
  return db.pragma('user_version', { simple: true }) as number;
}
