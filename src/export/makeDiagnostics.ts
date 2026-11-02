/**
 * Builds a diagnostics payload for the offline feedback page. By construction it
 * contains ONLY non-identifying technical facts — app/OS/engine versions, aggregate
 * row counts, and error codes. It never includes supplier names, references, amounts,
 * file names, or any other customer data.
 */
import type { Diagnostics } from '@shared/contracts';

export interface DiagnosticsInput {
  appVersion: string;
  platform: string;
  osVersion: string;
  electronVersion: string;
  engineVersion: string;
  statementRowCount: number | null;
  ledgerRowCount: number | null;
  exceptionCount: number | null;
  errorCodes: string[];
}

export function makeDiagnostics(input: DiagnosticsInput): Diagnostics {
  return {
    appVersion: input.appVersion,
    platform: input.platform,
    osVersion: input.osVersion,
    electronVersion: input.electronVersion,
    engineVersion: input.engineVersion,
    statementRowCount: input.statementRowCount,
    ledgerRowCount: input.ledgerRowCount,
    exceptionCount: input.exceptionCount,
    errorCodes: input.errorCodes.slice(0, 50)
  };
}
