/**
 * Holds the single project that is currently open in this process.
 *
 * Phase 3 keeps the project purely in memory so the Setup -> Import -> Validation
 * flow works end to end before persistence lands. Phase 4 backs the same surface
 * with the SQLite repository (create writes a .statementdesk file; open reads one).
 */
import type { ProjectSummary } from '@shared/contracts';

export const PROJECT_SCHEMA_VERSION = 1;

class ProjectStore {
  private current: ProjectSummary | null = null;

  set(summary: ProjectSummary): void {
    this.current = summary;
  }

  get(): ProjectSummary | null {
    return this.current;
  }

  requireOpen(): ProjectSummary {
    if (!this.current) throw new Error('No project is open');
    return this.current;
  }

  clear(): void {
    this.current = null;
  }
}

export const projectStore = new ProjectStore();
