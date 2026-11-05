import { useCallback, useMemo, useState } from 'react';
import type { ImportSummary, PickedFile, ProjectSummary, RunView, Side } from '@shared/contracts';

/** A file the user chose through the native dialog (never null once stored). */
export type ChosenFile = NonNullable<PickedFile>;

export interface WorkflowState {
  project: ProjectSummary | null;
  files: Partial<Record<Side, ChosenFile>>;
  imports: Partial<Record<Side, ImportSummary>>;
  run: RunView | null;
}

const EMPTY: WorkflowState = { project: null, files: {}, imports: {}, run: null };

export function useWorkflow() {
  const [state, setState] = useState<WorkflowState>(EMPTY);

  const setProject = useCallback((
    project: ProjectSummary,
    files: Partial<Record<Side, ChosenFile>>,
    savedImports: ImportSummary[] = [],
    run: RunView | null = null
  ) => {
    const imports: WorkflowState['imports'] = {};
    for (const summary of savedImports) imports[summary.side] = summary;
    setState({ project, files, imports, run });
  }, []);

  const closeProject = useCallback(() => setState(EMPTY), []);

  const setFile = useCallback((projectId: string, side: Side, file: ChosenFile) => {
    setState((prev) => prev.project?.projectId === projectId ? { ...prev, files: { ...prev.files, [side]: file } } : prev);
  }, []);

  const setImport = useCallback((projectId: string, side: Side, summary: ImportSummary) => {
    // A new import invalidates any prior reconciliation run.
    setState((prev) => prev.project?.projectId === projectId ? { ...prev, imports: { ...prev.imports, [side]: summary }, run: null } : prev);
  }, []);

  const setRun = useCallback((run: RunView) => {
    setState((prev) => prev.project?.projectId === run.projectId ? { ...prev, run } : prev);
  }, []);

  const bothImported = Boolean(state.imports.statement && state.imports.ledger);

  return useMemo(
    () => ({
      project: state.project,
      files: state.files,
      imports: state.imports,
      run: state.run,
      bothImported,
      setProject,
      closeProject,
      setFile,
      setImport,
      setRun
    }),
    [state.project, state.files, state.imports, state.run, bothImported, setProject, closeProject, setFile, setImport, setRun]
  );
}

export type Workflow = ReturnType<typeof useWorkflow>;
