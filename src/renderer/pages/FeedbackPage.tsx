import { useEffect, useState } from 'react';
import type { Diagnostics } from '@shared/contracts';
import { getApi, hasApi } from '../hooks/useApi';

type Rating = 1 | 2 | 3 | 4 | 5;

function RatingRow({ label, value, onChange }: { label: string; value: Rating; onChange: (v: Rating) => void }) {
  return (
    <fieldset className="rating">
      <legend>{label}</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="rating-option">
          <input type="radio" name={label} checked={value === n} onChange={() => onChange(n as Rating)} /> {n}
        </label>
      ))}
    </fieldset>
  );
}

export function FeedbackPage() {
  const [prep, setPrep] = useState('');
  const [review, setReview] = useState('');
  const [usefulness, setUsefulness] = useState<Rating>(3);
  const [likelihood, setLikelihood] = useState<Rating>(3);
  const [problems, setProblems] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'error'; message: string }>({ kind: 'idle', message: '' });

  useEffect(() => {
    if (!hasApi()) return;
    void getApi()
      .diagnostics.build()
      .then((res) => {
        if (res.ok) setDiagnostics(res.value);
      });
  }, []);

  async function save() {
    if (!hasApi()) return;
    const feedback = {
      preparationMinutes: Math.max(0, Math.round(Number(prep) || 0)),
      reviewMinutes: Math.max(0, Math.round(Number(review) || 0)),
      usefulness,
      likelihood,
      problems: problems.slice(0, 8000),
      includeDiagnostics,
      diagnostics: includeDiagnostics ? diagnostics : null
    };
    const picked = await getApi().dialog.pickExportPath({ kind: 'csv', suggestedName: 'StatementDesk-feedback' });
    // The feedback file is JSON; reuse the save dialog but name it .json via suggestedName path.
    if (!picked) return;
    const destPath = picked.path.replace(/\.csv$/i, '.json');
    const res = await getApi().feedback.save({ destPath, feedback });
    if (res.ok) setStatus({ kind: 'ok', message: `Feedback saved to ${res.value.path}. Send it to your StatementDesk contact when convenient.` });
    else setStatus({ kind: 'error', message: res.error.message });
  }

  return (
    <section className="page">
      <h2>Feedback &amp; diagnostics</h2>
      <p className="muted">
        This beta collects feedback entirely offline. Nothing is transmitted anywhere — the form is saved to a file you choose, and you can
        send it to your StatementDesk contact yourself.
      </p>

      <div className="form-grid">
        <label className="field">
          <span>Time spent preparing files (minutes)</span>
          <input type="number" min={0} value={prep} onChange={(e) => setPrep(e.target.value)} />
        </label>
        <label className="field">
          <span>Time spent reviewing results (minutes)</span>
          <input type="number" min={0} value={review} onChange={(e) => setReview(e.target.value)} />
        </label>
      </div>

      <RatingRow label="How useful was the result? (1–5)" value={usefulness} onChange={setUsefulness} />
      <RatingRow label="How likely are you to use it again? (1–5)" value={likelihood} onChange={setLikelihood} />

      <label className="field">
        <span>Problems or suggestions</span>
        <textarea rows={5} value={problems} onChange={(e) => setProblems(e.target.value)} />
      </label>

      <label className="checkbox">
        <input type="checkbox" checked={includeDiagnostics} onChange={(e) => setIncludeDiagnostics(e.target.checked)} /> Include technical
        diagnostics (no customer data)
      </label>

      <details className="diagnostics-preview" open>
        <summary>Preview exactly what diagnostics would be included</summary>
        {diagnostics ? (
          <pre>{JSON.stringify(diagnostics, null, 2)}</pre>
        ) : (
          <p className="muted">Diagnostics unavailable (running outside the desktop shell).</p>
        )}
        <p className="muted">
          Diagnostics are limited to app, OS and engine versions, aggregate row counts and error codes. No supplier names, references,
          amounts or file names are included.
        </p>
      </details>

      {status.kind !== 'idle' && (
        <p className={`banner ${status.kind === 'ok' ? 'banner-success' : 'banner-danger'}`} role="status">
          {status.message}
        </p>
      )}

      <div className="actions">
        <button className="btn btn-primary" onClick={() => void save()}>
          Save feedback to a file…
        </button>
      </div>
    </section>
  );
}
