/**
 * Deterministic open-item comparison (Rules 1–6).
 * Pure function: output depends only on the row set, never on input order.
 */
import { ENGINE_VERSION } from '../version';
import { sumCents } from '../money';
import type {
  CanonicalRow,
  CompletenessStatus,
  Outcome,
  OutcomeCategory,
  ReasonCode,
  ReconciliationKey,
  ReconciliationResult,
  ReconciliationSummary
} from '../models';

export interface CompareOptions {
  /** Completeness from validateControls(); defaults to Unverified when not supplied. */
  completeness?: CompletenessStatus;
}

/** Key segments are joined with a separator that cannot appear in a trimmed reference. */
const KEY_SEPARATOR = '\u001f';

export function keyOf(row: Pick<CanonicalRow, 'supplierId' | 'currency' | 'documentType' | 'referenceKey'>): ReconciliationKey {
  return [row.supplierId, row.currency, row.documentType, row.referenceKey];
}

export function serialiseKey(key: ReconciliationKey): string {
  return key.join(KEY_SEPARATOR);
}

/** Deterministic outcome id: stable for the same key regardless of run or row ids. */
export function outcomeIdFor(key: ReconciliationKey): string {
  return `oc:${encodeURIComponent(key[0])}:${key[1]}:${key[2]}:${encodeURIComponent(key[3])}`;
}

function sortRows(rows: CanonicalRow[]): CanonicalRow[] {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function compareKeys(a: ReconciliationKey, b: ReconciliationKey): number {
  for (let i = 0; i < 4; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function classify(statement: CanonicalRow[], ledger: CanonicalRow[], key: ReconciliationKey): Outcome {
  const statementRows = sortRows(statement);
  const ledgerRows = sortRows(ledger);
  const statementCents = sumCents(statementRows.map((r) => r.outstandingCents));
  const ledgerCents = sumCents(ledgerRows.map((r) => r.outstandingCents));
  const differenceCents = statementCents - ledgerCents;

  let category: OutcomeCategory;
  const reasonCodes: ReasonCode[] = [];

  if (statementRows.length > 1 || ledgerRows.length > 1) {
    // Rule 6: duplicate ambiguity takes precedence over everything else.
    category = 'AMBIGUOUS_DUPLICATE_GROUP';
    if (statementRows.length > 1) reasonCodes.push('DUPLICATE_ON_STATEMENT');
    if (ledgerRows.length > 1) reasonCodes.push('DUPLICATE_ON_LEDGER');
  } else if (statementRows.length === 1 && ledgerRows.length === 0) {
    category = 'STATEMENT_ONLY'; // Rule 4
    reasonCodes.push('MISSING_IN_LEDGER');
  } else if (statementRows.length === 0 && ledgerRows.length === 1) {
    category = 'LEDGER_ONLY'; // Rule 5
    reasonCodes.push('MISSING_IN_STATEMENT');
  } else {
    const s = statementRows[0]!;
    const l = ledgerRows[0]!;
    const amountsDiffer = s.outstandingCents !== l.outstandingCents;
    const datesDiffer = s.documentDate !== l.documentDate;
    if (amountsDiffer) {
      category = 'AMOUNT_DIFFERENCE'; // Rule 2
      reasonCodes.push('AMOUNT_MISMATCH');
      if (datesDiffer) reasonCodes.push('DATE_MISMATCH');
    } else if (datesDiffer) {
      category = 'DATE_DIFFERENCE'; // Rule 3
      reasonCodes.push('DATE_MISMATCH');
    } else {
      category = 'EXACT_MATCH'; // Rule 1
      reasonCodes.push('EXACT');
    }
  }

  return {
    id: outcomeIdFor(key),
    category,
    key,
    supplierId: key[0],
    currency: key[1],
    documentType: key[2],
    referenceKey: key[3],
    statementRowIds: statementRows.map((r) => r.id),
    ledgerRowIds: ledgerRows.map((r) => r.id),
    statementCents,
    ledgerCents,
    differenceCents,
    reasonCodes
  };
}

const EMPTY_COUNTS: Record<OutcomeCategory, number> = {
  EXACT_MATCH: 0,
  AMOUNT_DIFFERENCE: 0,
  DATE_DIFFERENCE: 0,
  STATEMENT_ONLY: 0,
  LEDGER_ONLY: 0,
  AMBIGUOUS_DUPLICATE_GROUP: 0
};

export function summarise(rows: readonly CanonicalRow[], outcomes: readonly Outcome[], completeness: CompletenessStatus): ReconciliationSummary {
  const statementRows = rows.filter((r) => r.side === 'statement');
  const ledgerRows = rows.filter((r) => r.side === 'ledger');
  const statementTotalCents = sumCents(statementRows.map((r) => r.outstandingCents));
  const ledgerTotalCents = sumCents(ledgerRows.map((r) => r.outstandingCents));
  const countsByCategory = { ...EMPTY_COUNTS };
  for (const o of outcomes) countsByCategory[o.category] += 1;
  const exactMatchCount = countsByCategory.EXACT_MATCH;
  const exceptionCount = outcomes.length - exactMatchCount;
  return {
    statementRowCount: statementRows.length,
    ledgerRowCount: ledgerRows.length,
    statementTotalCents,
    ledgerTotalCents,
    differenceCents: statementTotalCents - ledgerTotalCents,
    exactMatchCount,
    exceptionCount,
    // Unresolved equals exceptions at engine level; review state is layered on separately.
    unresolvedCount: exceptionCount,
    countsByCategory,
    completeness
  };
}

/**
 * Compares all valid rows and returns outcomes sorted by key, plus a summary.
 * Throws if two rows share an id, if a row has an unsupported side, or if
 * supplier/currency mix within a side (engine precondition: one supplier, AUD).
 */
export function compareOpenItems(rows: readonly CanonicalRow[], options: CompareOptions = {}): ReconciliationResult {
  const seenIds = new Set<string>();
  const groups = new Map<string, { key: ReconciliationKey; statement: CanonicalRow[]; ledger: CanonicalRow[] }>();

  for (const row of rows) {
    if (seenIds.has(row.id)) throw new Error(`Duplicate row id "${row.id}" supplied to the engine`);
    seenIds.add(row.id);
    if (row.currency !== 'AUD') throw new Error(`Unsupported currency "${String(row.currency)}" on row ${row.id}`);
    if (!Number.isSafeInteger(row.outstandingCents)) throw new Error(`Row ${row.id} has a non-integer amount`);
    const key = keyOf(row);
    const serialised = serialiseKey(key);
    let group = groups.get(serialised);
    if (!group) {
      group = { key, statement: [], ledger: [] };
      groups.set(serialised, group);
    }
    if (row.side === 'statement') group.statement.push(row);
    else if (row.side === 'ledger') group.ledger.push(row);
    else throw new Error(`Unsupported side "${String(row.side)}" on row ${row.id}`);
  }

  const outcomes = [...groups.values()].map((g) => classify(g.statement, g.ledger, g.key)).sort((a, b) => compareKeys(a.key, b.key));

  const assigned = outcomes.reduce((n, o) => n + o.statementRowIds.length + o.ledgerRowIds.length, 0);
  if (assigned !== rows.length) throw new Error(`Engine invariant violated: ${assigned} rows assigned, ${rows.length} supplied`);

  const summary = summarise(rows, outcomes, options.completeness ?? 'Unverified');
  return { engineVersion: ENGINE_VERSION, outcomes, summary };
}
