/**
 * Holds the single SQLite-backed project repository open in this process.
 * The renderer sees one project at a time; create/open swap the repository.
 */
import type { ProjectSummary } from '@shared/contracts';
import type { ProjectRepository } from '../storage';
import { LATEST_SCHEMA_VERSION } from '../storage/migrations';

export const PROJECT_SCHEMA_VERSION = LATEST_SCHEMA_VERSION;

class ProjectStore {
  private repo: ProjectRepository | null = null;

  set(repo: ProjectRepository): void {
    if (this.repo) this.repo.close();
    this.repo = repo;
  }

  get(): ProjectSummary | null {
    return this.repo ? this.repo.getProject() : null;
  }

  repository(): ProjectRepository | null {
    return this.repo;
  }

  requireRepo(): ProjectRepository {
    if (!this.repo) throw new Error('No project is open');
    return this.repo;
  }

  clear(): void {
    if (this.repo) this.repo.close();
    this.repo = null;
  }
}

export const projectStore = new ProjectStore();
