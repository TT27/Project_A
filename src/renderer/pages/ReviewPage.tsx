import { useMemo, useState } from 'react';
import type { ReviewDecision } from '@shared/contracts';
import type { Workflow } from '../hooks/useWorkflow';
import { getApi, hasApi } from '../hooks/useApi';

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}AUD ${(Math.abs(cents) / 100).toFixed(2)}`;
}

const DECISIONS: { value: ReviewDecision; label: string }[] = [
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'investigate', label: 'Investigate' },
  { value: 'explained', label: 'Explained' },
  { value: 'needs_source_correction', label: 'Needs source correction' }
];

interface Props {
  workflow: Workflow;
  focusKey: string | null;
}

export function ReviewPage({ workflow, focusKey }: Props) {
  const run = workflow.run;
  const exceptions = useMemo(() => (run ? run.outcomes.filter((o) => o.category !== 'EXACT_MATCH') : []), [run]);
  const [selectedKey, setSelectedKey] = useState<string | null>(focusKey ?? exceptions[0]?.outcomeKey ?? null);
  const [decision, setDecision] = useState<ReviewDecision>('investigate');
  const [reviewer, setReviewer] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  if (!run) {
    return (
      <section className="page">
        <h2>Exception review</h2>
        <p className="banner info">Run a reconciliation to review its exceptions.</p>
      </section>
    );
  }

  const selected = exceptions.find((o) => o.outcomeKey === selectedKey) ?? exceptions[0] ?? null;

  async function save() {
    if (!hasApi() || !selected) return;
    setSaving(true);
    setSaved(null);
    try {
      const res = await getApi().review.record({
        outcomeKey: selected.outcomeKey,
        runId: run!.runId,
        decision,
        reviewer: reviewer.trim() || undefined,
        note: note.trim() || undefined
      });
      if (!res.ok) {
        window.alert(res.error.message);
        return;
      }
      // Refresh the run so the recorded decision shows on screen.
      const refreshed = await getApi().reconcile.getRun(run!.runId);
      if (refreshed.ok) workflow.setRun(refreshed.value);
      setSaved(`Recorded "${res.value.decision.replace(/_/g, ' ')}" for ${selected.referenceKey}.`);
      setNote('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <header className="page-head">
        <h2>Exception review</h2>
        <p className="subhead">{exceptions.length} exceptions to review</p>
      </header>

      <div className="two-col review-layout">
        <aside className="review-list">
          {exceptions.map((o) => (
            <button
              key={o.outcomeKey}
              className={`review-item ${selected?.outcomeKey === o.outcomeKey ? 'active' : ''}`}
              onClick={() => setSelectedKey(o.outcomeKey)}
            >
              <span className="review-item-ref">{o.referenceKey}</span>
              <span className="review-item-meta">{o.category.replace(/_/g, ' ').toLowerCase()}</span>
              {o.review && <span className="badge">{o.review.decision.replace(/_/g, ' ')}</span>}
            </button>
          ))}
          {exceptions.length === 0 && <p className="muted">No exceptions — everything reconciled exactly.</p>}
        </aside>

        {selected && (
          <div className="review-detail">
            <h3>{selected.referenceKey} · {selected.documentType === 'invoice' ? 'Invoice' : 'Credit note'}</h3>
            <table className="data-table compact">
              <thead>
                <tr><th>Side</th><th>File</th><th className="num">Row</th><th>Date</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {selected.rows.map((r) => (
                  <tr key={r.rowId}>
                    <td>{r.side}</td>
                    <td>{r.fileName}</td>
                    <td className="num">{r.sourceRow}</td>
                    <td>{r.documentDate}</td>
                    <td className="num">{money(r.outstandingCents)}</td>
                  </tr>
                ))}
                {selected.rows.length === 0 && <tr><td colSpan={5} className="muted">No contributing rows.</td></tr>}
              </tbody>
            </table>
            <dl className="kv">
              <div><dt>Statement</dt><dd>{money(selected.statementCents)}</dd></div>
              <div><dt>Ledger</dt><dd>{money(selected.ledgerCents)}</dd></div>
              <div><dt>Difference</dt><dd>{money(selected.differenceCents)}</dd></div>
              <div><dt>Reason codes</dt><dd>{selected.reasonCodes.join(', ') || '—'}</dd></div>
            </dl>

            <div className="form-section">
              <label className="field">
                <span>Decision</span>
                <select className="select" value={decision} onChange={(e) => setDecision(e.target.value as ReviewDecision)}>
                  {DECISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Reviewer</span>
                <input className="input" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Your name" />
              </label>
              <label className="field">
                <span>Note</span>
                <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you find?" />
              </label>
              <div className="form-actions">
                <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Record decision'}
                </button>
                {saved && <span className="banner success inline">{saved}</span>}
              </div>
              {selected.review && (
                <p className="field-hint">
                  Current decision: <strong>{selected.review.decision.replace(/_/g, ' ')}</strong>
                  {selected.review.reviewer ? ` by ${selected.review.reviewer}` : ''}
                  {selected.review.note ? ` — "${selected.review.note}"` : ''}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
