/**
 * In-memory per-process import session: the most recent imported rows for each side
 * of the currently open project. Phase 4 also persists these to the project database;
 * this cache serves the active process between import and reconciliation.
 */
import type { Side } from '@domain/models';
import type { ImportConfig } from '@shared/contracts';
import type { ImportResult } from '../import/types';

interface SideImport {
  config: ImportConfig;
  result: ImportResult;
}

class ImportSession {
  private projectId: string | null = null;
  private readonly sides = new Map<Side, SideImport>();

  bindProject(projectId: string): void {
    if (this.projectId !== projectId) {
      this.sides.clear();
      this.projectId = projectId;
    }
  }

  set(side: Side, config: ImportConfig, result: ImportResult): void {
    this.sides.set(side, { config, result });
  }

  get(side: Side): SideImport | undefined {
    return this.sides.get(side);
  }

  clear(): void {
    this.sides.clear();
    this.projectId = null;
  }
}

export const importSession = new ImportSession();
