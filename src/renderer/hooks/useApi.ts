import type { StatementDeskApi } from '../../preload/api';

/**
 * Returns the typed preload bridge. Throws a clear error when the renderer is
 * loaded outside Electron (e.g. opened in a plain browser), which is unsupported.
 */
export function getApi(): StatementDeskApi {
  const api = window.statementdesk;
  if (!api) {
    throw new Error('StatementDesk must run inside its desktop shell. The secure bridge is unavailable.');
  }
  return api;
}

export function hasApi(): boolean {
  return typeof window !== 'undefined' && window.statementdesk !== undefined;
}
