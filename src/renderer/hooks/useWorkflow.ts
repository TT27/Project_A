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

/**
 * Central renderer state for the reconciliation workflow. Phase 3 tracks the open
 * project and the most recent import summary for each side; Phase 4 extends it with
 * reconciliation runs and review events.
 */
export function useWorkflow() {
  const [state, setState] = useState<WorkflowState>(EMPTY);

  const setProject = useCallback((project: ProjectSummary, files: Partial<Record<Side, ChosenFile>>) => {
    // A fresh project clears any imports carried over from a previous one.
    setState({ project, files, imports: {}, run: null });
  }, []);

  const closeProject = useCallback(() => setState(EMPTY), []);

  const setImport = useCallback((side: Side, summary: ImportSummary) => {
    // A new import invalidates any prior reconciliation run.
    setState((prev) => ({ ...prev, imports: { ...prev.imports, [side]: summary }, run: null }));
  }, []);

  const setRun = useCallback((run: RunView) => {
    setState((prev) => ({ ...prev, run }));
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
      setImport,
      setRun
    }),
    [state.project, state.files, state.imports, state.run, bothImported, setProject, closeProject, setImport, setRun]
  );
}

export type Workflow = ReturnType<typeof useWorkflow>;
