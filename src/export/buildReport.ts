/** Assembles a {@link ReportModel} from a repository + a run. Node layer (reads storage). */
import type { ProjectRepository } from '../storage';
import type { RunView } from '@shared/contracts';
import type { ReportModel } from './types';

export interface BuildReportInput {
  repo: ProjectRepository;
  run: RunView;
  appVersion: string;
  generatedAt?: string;
}

export function buildReport({ repo, run, appVersion, generatedAt }: BuildReportInput): ReportModel {
  return {
    generatedAt: generatedAt ?? new Date().toISOString(),
    engineVersion: run.engineVersion,
    appVersion,
    project: repo.getProject(),
    run,
    summary: run.summary,
    outcomes: run.outcomes,
    sources: repo.getSources(),
    imported: {
      statement: repo.getImportedRows('statement'),
      ledger: repo.getImportedRows('ledger')
    }
  };
}
