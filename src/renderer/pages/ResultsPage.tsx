import { useMemo, useState } from 'react';
import type { OutcomeCategory, OutcomeView } from '@shared/contracts';
import type { Workflow } from '../hooks/useWorkflow';

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}AUD ${(abs / 100).toFixed(2)}`;
}

function signedMoney(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  return `${sign}AUD ${(Math.abs(cents) / 100).toFixed(2)}`;
}

const CATEGORY_LABELS: Record<OutcomeCategory, string> = {
  EXACT_MATCH: 'Exact match',
  AMOUNT_DIFFERENCE: 'Amount difference',
  DATE_DIFFERENCE: 'Date difference',
  STATEMENT_ONLY: 'Statement only',
  LEDGER_ONLY: 'Ledger only',
  AMBIGUOUS_DUPLICATE_GROUP: 'Ambiguous duplicates'
};

interface Props {
  workflow: Workflow;
  onReview: (outcomeKey: string) => void;
}

type Filter = 'all' | 'exceptions' | OutcomeCategory;

export function ResultsPage({ workflow, onReview }: Props) {
  const run = workflow.run;
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const outcomes = useMemo<OutcomeView[]>(() => {
    if (!run) return [];
    const term = search.trim().toLowerCase();
    return run.outcomes.filter((o) => {
      if (filter === 'exceptions' && o.category === 'EXACT_MATCH') return false;
      if (filter !== 'all' && filter !== 'exceptions' && o.category !== filter) return false;
      if (term && !o.referenceKey.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [run, filter, search]);

  if (!run) {
    return (
      <section className="page">
        <h2>Results</h2>
        <p className="banner info">Run a reconciliation from the Validation step to see results here.</p>
      </section>
    );
  }

  const s = run.summary;

  return (
    <section className="page">
      <header className="page-head">
        <h2>Results</h2>
        <p className="subhead">Engine {run.engineVersion} · {new Date(run.createdAt).toLocaleString()}</p>
      </header>

      <div className="card-grid">
        <div className="card metric">
          <span className="metric-label">Statement total</span>
          <span className="metric-value">{money(s.statementTotalCents)}</span>
          <span className="metric-sub">{s.statementRowCount} rows</span>
        </div>
        <div className="card metric">
          <span className="metric-label">Ledger total</span>
          <span className="metric-value">{money(s.ledgerTotalCents)}</span>
          <span className="metric-sub">{s.ledgerRowCount} rows</span>
        </div>
        <div className="card metric">
          <span className="metric-label">Difference</span>
          <span className={`metric-value ${s.differenceCents === 0 ? 'ok' : 'warn'}`}>{signedMoney(s.differenceCents)}</span>
          <span className="metric-sub">statement − ledger</span>
        </div>
        <div className="card metric">
          <span className="metric-label">Outcomes</span>
          <span className="metric-value">{s.exactMatchCount} / {s.exceptionCount}</span>
          <span className="metric-sub">exact / exceptions</span>
        </div>
        <div className="card metric">
          <span className="metric-label">Completeness</span>
          <span className={`metric-value ${s.completeness === 'Verified' ? 'ok' : s.completeness === 'Mismatch' ? 'warn' : ''}`}>{s.completeness}</span>
          <span className="metric-sub">control totals</span>
        </div>
      </div>

      <div className="filter-bar">
        <div className="chip-row">
          <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All ({run.outcomes.length})</button>
          <button className={`chip ${filter === 'exceptions' ? 'active' : ''}`} onClick={() => setFilter('exceptions')}>Exceptions ({s.exceptionCount})</button>
          {(Object.keys(CATEGORY_LABELS) as OutcomeCategory[]).map((cat) => (
            <button key={cat} className={`chip ${filter === cat ? 'active' : ''}`} onClick={() => setFilter(cat)}>
              {CATEGORY_LABELS[cat]} ({s.countsByCategory[cat]})
            </button>
          ))}
        </div>
        <input
          className="input"
          type="search"
          placeholder="Search reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search by reference"
        />
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Type</th>
              <th>Category</th>
              <th className="num">Statement</th>
              <th className="num">Ledger</th>
              <th className="num">Difference</th>
              <th>Decision</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => (
              <tr key={o.id}>
                <td>{o.referenceKey}</td>
                <td>{o.documentType === 'invoice' ? 'Invoice' : 'Credit note'}</td>
                <td><span className={`badge cat-${o.category}`}>{CATEGORY_LABELS[o.category]}</span></td>
                <td className="num">{money(o.statementCents)}</td>
                <td className="num">{money(o.ledgerCents)}</td>
                <td className={`num ${o.differenceCents === 0 ? '' : 'warn'}`}>{signedMoney(o.differenceCents)}</td>
                <td>{o.review ? o.review.decision.replace(/_/g, ' ') : <span className="muted">unreviewed</span>}</td>
                <td>
                  {o.category !== 'EXACT_MATCH' && (
                    <button className="btn btn-small" onClick={() => onReview(o.outcomeKey)}>Review</button>
                  )}
                </td>
              </tr>
            ))}
            {outcomes.length === 0 && (
              <tr><td colSpan={8} className="muted center">No outcomes match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
