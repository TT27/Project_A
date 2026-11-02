/**
 * Control-total validation against independently supplied source totals.
 * Totals are signed integer cents. A null control total means "not supplied".
 */
import type { CanonicalRow, CompletenessStatus, Side } from '../models';
import { sumCents } from '../money';

export interface ControlTotals {
  statementCents: number | null;
  ledgerCents: number | null;
}

export interface SideControlResult {
  side: Side;
  importedCents: number;
  controlCents: number | null;
  /** imported − control; null when no control total was supplied. */
  varianceCents: number | null;
  status: CompletenessStatus;
}

export interface ControlValidation {
  statement: SideControlResult;
  ledger: SideControlResult;
  /** Verified only when BOTH sides verify; Mismatch if either mismatches; else Unverified. */
  completeness: CompletenessStatus;
}

function validateSide(rows: readonly CanonicalRow[], side: Side, controlCents: number | null): SideControlResult {
  const importedCents = sumCents(rows.filter((r) => r.side === side).map((r) => r.outstandingCents));
  if (controlCents === null) {
    return { side, importedCents, controlCents: null, varianceCents: null, status: 'Unverified' };
  }
  if (!Number.isSafeInteger(controlCents)) throw new Error(`Control total for ${side} is not an integer number of cents`);
  const varianceCents = importedCents - controlCents;
  return { side, importedCents, controlCents, varianceCents, status: varianceCents === 0 ? 'Verified' : 'Mismatch' };
}

export function validateControls(rows: readonly CanonicalRow[], controls: ControlTotals): ControlValidation {
  const statement = validateSide(rows, 'statement', controls.statementCents);
  const ledger = validateSide(rows, 'ledger', controls.ledgerCents);
  let completeness: CompletenessStatus;
  if (statement.status === 'Mismatch' || ledger.status === 'Mismatch') completeness = 'Mismatch';
  else if (statement.status === 'Verified' && ledger.status === 'Verified') completeness = 'Verified';
  else completeness = 'Unverified';
  return { statement, ledger, completeness };
}
