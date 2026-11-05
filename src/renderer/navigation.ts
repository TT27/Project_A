/** Workflow steps shown in the sidebar, in order. */
export const WORKFLOW_STEPS = [
  { id: 'home', label: 'Home', step: null },
  { id: 'setup', label: 'Setup', step: 1 },
  { id: 'import', label: 'Import & Mapping', step: 2 },
  { id: 'validation', label: 'Validation', step: 3 },
  { id: 'results', label: 'Results', step: 4 },
  { id: 'review', label: 'Review', step: 5 },
  { id: 'export', label: 'Export', step: 6 },
  { id: 'feedback', label: 'Feedback', step: null }
] as const;

export type PageId = (typeof WORKFLOW_STEPS)[number]['id'];

export function isPageId(value: string): value is PageId {
  return WORKFLOW_STEPS.some((s) => s.id === value);
}
