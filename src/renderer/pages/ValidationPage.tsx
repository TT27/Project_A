import { useState } from 'react';
import type { CompletenessStatus, ImportSummary, Side } from '@shared/contracts';
import type { Workflow } from '../hooks/useWorkflow';

interface ValidationPageProps {
  workflow: Workflow;
  onRun: () => void;
  running: boolean;
}

function money(cents: number | null): string {
  if (cents === null) return '—';
  const v = (cents / 100).toFixed(2);
  return `${cents < 0 ? '-' : ''}AUD ${v.replace('-', '')}`;
}

const STATUS_BADGE: Record<CompletenessStatus, string> = {
  Verified: 'badge-success',
  Mismatch: 'badge-danger',
  Unverified: 'badge-info'
};

function SideCard({ side, summary }: { side: Side; summary: ImportSummary }) {
  const title = side === 'statement' ? 'Supplier statement' : 'AP ledger';
  const c = summary.counts;
  return (
    <section className="card" aria-label={`${title} validation`}>
      <h2>{title}</h2>
      <div className="text-sm text-secondary selectable">{summary.fileName}</div>
      <div className="counts-row" style={{ marginTop: 'var(--space-3)' }}>
        <span>{c.imported} imported</span>
        <span className="badge badge-success">{c.valid} valid</span>
        <span className="badge badge-danger">{c.invalid} invalid</span>
        <span className="badge badge-info">{c.excluded} excluded</span>
      </div>
      <dl className="info-grid" style={{ marginTop: 'var(--space-4)' }}>
        <dt>Imported total</dt>
        <dd className="mono selectable">{money(summary.control.importedCents)}</dd>
        <dt>Source control total</dt>
        <dd className="mono selectable">{money(summary.control.controlCents)}</dd>
        <dt>Variance</dt>
        <dd className="mono selectable">{money(summary.control.varianceCents)}</dd>
        <dt>Control status</dt>
        <dd>
          <span className={`badge ${STATUS_BADGE[summary.control.status]}`}>{summary.control.status}</span>
        </dd>
      </dl>
    </section>
  );
}

function ErrorTable({ summary }: { summary: ImportSummary }) {
  const invalid = summary.rows.filter((r) => r.status === 'invalid');
  if (invalid.length === 0) return null;
  return (
    <div className="preview-block">
      <h3 className="subhead">{summary.side === 'statement' ? 'Statement' : 'Ledger'} rows needing attention ({invalid.length})</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Reference</th>
              <th>Problem</th>
            </tr>
          </thead>
          <tbody>
            {invalid.map((r) => (
              <tr key={r.sourceRow} className="row-invalid">
                <td className="mono">{r.sourceRow}</td>
                <td className="selectable">{r.interpreted.reference || '—'}</td>
                <td className="issue-cell">
                  {r.errors.map((i, k) => (
                    <div key={k} className="issue issue-error">{i.message}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ValidationPage({ workflow, onRun, running }: ValidationPageProps) {
  const statement = workflow.imports.statement;
  const ledger = workflow.imports.ledger;
  const [draftAck, setDraftAck] = useState(false);

  if (!statement || !ledger) {
    return (
      <div className="content-inner">
        <div className="page-header">
          <h1>Validation</h1>
        </div>
        <div className="placeholder-panel">Import both files on the previous step to see validation results.</div>
      </div>
    );
  }

  const invalidCount = statement.counts.invalid + ledger.counts.invalid;
  const hasCritical = invalidCount > 0;
  const canRun = !running && (!hasCritical || draftAck);

  return (
    <div className="content-inner">
      <div className="page-header">
        <h1>Validation</h1>
        <p>Review counts and control totals before running the comparison.</p>
      </div>

      <div className="two-col">
        <SideCard side="statement" summary={statement} />
        <SideCard side="ledger" summary={ledger} />
      </div>

      <ErrorTable summary={statement} />
      <ErrorTable summary={ledger} />

      <section className="card" style={{ marginTop: 'var(--space-5)' }} aria-labelledby="run-heading">
        <h2 id="run-heading">Run reconciliation</h2>
        {hasCritical ? (
          <>
            <div className="banner banner-warning" role="status">
              {invalidCount} row{invalidCount === 1 ? '' : 's'} could not be interpreted. You can fix the source files and
              re-import, or proceed with an incomplete draft that excludes these rows.
            </div>
            <label className="checkbox-field">
              <input type="checkbox" checked={draftAck} onChange={(e) => setDraftAck(e.target.checked)} />
              <span>Proceed with an incomplete draft (invalid rows will be left out of the comparison).</span>
            </label>
          </>
        ) : (
          <div className="banner banner-info" role="status">All rows interpreted cleanly. Ready to reconcile.</div>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-primary btn-large" onClick={onRun} disabled={!canRun}>
            {running ? 'Reconciling…' : 'Run reconciliation'}
          </button>
        </div>
      </section>
    </div>
  );
}
