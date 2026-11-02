import { useCallback, useMemo, useState } from 'react';
import type { ImportSummary, PickedFile, ProjectSummary, Side } from '@shared/contracts';

/** A file the user chose through the native dialog (never null once stored). */
export type ChosenFile = NonNullable<PickedFile>;

export interface WorkflowState {
  project: ProjectSummary | null;
  files: Partial<Record<Side, ChosenFile>>;
  imports: Partial<Record<Side, ImportSummary>>;
}

const EMPTY: WorkflowState = { project: null, files: {}, imports: {} };

/**
 * Central renderer state for the reconciliation workflow. Phase 3 tracks the open
 * project and the most recent import summary for each side; Phase 4 extends it with
 * reconciliation runs and review events.
 */
export function useWorkflow() {
  const [state, setState] = useState<WorkflowState>(EMPTY);

  const setProject = useCallback((project: ProjectSummary, files: Partial<Record<Side, ChosenFile>>) => {
    // A fresh project clears any imports carried over from a previous one.
    setState({ project, files, imports: {} });
  }, []);

  const closeProject = useCallback(() => setState(EMPTY), []);

  const setImport = useCallback((side: Side, summary: ImportSummary) => {
    setState((prev) => ({ ...prev, imports: { ...prev.imports, [side]: summary } }));
  }, []);

  const bothImported = Boolean(state.imports.statement && state.imports.ledger);

  return useMemo(
    () => ({
      project: state.project,
      files: state.files,
      imports: state.imports,
      bothImported,
      setProject,
      closeProject,
      setImport
    }),
    [state.project, state.files, state.imports, bothImported, setProject, closeProject, setImport]
  );
}

export type Workflow = ReturnType<typeof useWorkflow>;
