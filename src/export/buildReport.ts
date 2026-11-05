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
  const sources = repo.getRunSources(run.runId);
  const imported: ReportModel['imported'] = { statement: [], ledger: [] };
  for (const outcome of run.outcomes) {
    for (const row of outcome.rows) {
      imported[row.side].push({
        sourceRow: row.sourceRow,
        sheetName: row.sheetName,
        referenceRaw: row.referenceRaw,
        referenceKey: outcome.referenceKey,
        documentType: outcome.documentType,
        documentDate: row.documentDate,
        outstandingCents: row.outstandingCents
      });
    }
  }
  imported.statement.sort((a, b) => a.sourceRow - b.sourceRow);
  imported.ledger.sort((a, b) => a.sourceRow - b.sourceRow);
  return {
    generatedAt: generatedAt ?? new Date().toISOString(),
    engineVersion: run.engineVersion,
    appVersion,
    project: repo.getProject(),
    run,
    summary: run.summary,
    outcomes: run.outcomes,
    sources,
    imported
  };
}
