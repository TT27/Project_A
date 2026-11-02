import { useState, type FormEvent } from 'react';
import { SUPPORTED_CURRENCY, type ProjectSetup, type Side } from '@shared/contracts';
import { getApi } from '../hooks/useApi';
import type { ChosenFile, Workflow } from '../hooks/useWorkflow';

interface SetupPageProps {
  workflow: Workflow;
  onCreated: () => void;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function SetupPage({ workflow, onCreated }: SetupPageProps) {
  const [projectName, setProjectName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [cutoffDate, setCutoffDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [files, setFiles] = useState<Partial<Record<Side, ChosenFile>>>(workflow.files);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickFile(side: Side) {
    setError(null);
    const picked = await getApi().dialog.pickInputFile({ side });
    if (picked) setFiles((prev) => ({ ...prev, [side]: picked }));
  }

  const canSubmit =
    projectName.trim() !== '' &&
    supplierName.trim() !== '' &&
    supplierId.trim() !== '' &&
    ISO_DATE.test(cutoffDate) &&
    confirmed &&
    Boolean(files.statement) &&
    Boolean(files.ledger) &&
    !busy;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const picked = await getApi().dialog.pickProjectPath({ mode: 'save', suggestedName: projectName.trim() });
      if (!picked) {
        setBusy(false);
        return;
      }
      const setup: ProjectSetup = {
        projectName: projectName.trim(),
        supplierName: supplierName.trim(),
        supplierId: supplierId.trim(),
        cutoffDate,
        currency: SUPPORTED_CURRENCY,
        comparableBalancesConfirmed: true
      };
      const result = await getApi().project.create(picked.path, setup);
      if (!result.ok) {
        setError(result.error.message);
        setBusy(false);
        return;
      }
      workflow.setProject(result.value, files);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the project.');
      setBusy(false);
    }
  }

  return (
    <div className="content-inner">
      <div className="page-header">
        <h1>Set up reconciliation</h1>
        <p>One supplier, one statement cutoff. All details stay on this computer.</p>
      </div>

      <form className="form-stack" onSubmit={(e) => void onSubmit(e)}>
        <section className="card form-section" aria-labelledby="project-heading">
          <h2 id="project-heading">Project</h2>
          <div className="field">
            <label htmlFor="projectName">Project name</label>
            <input
              id="projectName"
              className="input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. SUP001 September close"
              maxLength={200}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="supplierName">Supplier name</label>
              <input id="supplierName" className="input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} maxLength={200} />
            </div>
            <div className="field">
              <label htmlFor="supplierId">Supplier ID</label>
              <input id="supplierId" className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} maxLength={64} placeholder="e.g. SUP001" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="cutoffDate">Statement cutoff date</label>
              <input id="cutoffDate" className="input" type="date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <input id="currency" className="input" value={SUPPORTED_CURRENCY} readOnly aria-readonly="true" />
              <span className="field-hint">AUD only in this release.</span>
            </div>
          </div>
        </section>

        <section className="card form-section" aria-labelledby="files-heading">
          <h2 id="files-heading">Input files</h2>
          <p className="field-hint">Choose the supplier statement and your AP ledger export. CSV or Excel .xlsx.</p>
          {(['statement', 'ledger'] as const).map((side) => (
            <div className="file-picker" key={side}>
              <div>
                <strong>{side === 'statement' ? 'Supplier statement' : 'AP ledger export'}</strong>
                {files[side] ? (
                  <div className="text-sm text-secondary selectable">
                    {files[side]?.name} · {files[side]?.kind.toUpperCase()} · {Math.max(1, Math.round((files[side]?.sizeBytes ?? 0) / 1024))} KB
                  </div>
                ) : (
                  <div className="text-sm text-tertiary">No file chosen.</div>
                )}
              </div>
              <button type="button" className="btn" onClick={() => void pickFile(side)}>
                {files[side] ? 'Change…' : 'Choose…'}
              </button>
            </div>
          ))}
        </section>

        <section className="card form-section" aria-labelledby="confirm-heading">
          <h2 id="confirm-heading">Confirmation</h2>
          <label className="checkbox-field">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>
              I confirm both files report <strong>outstanding open items at the same cutoff date</strong> and are directly
              comparable.
            </span>
          </label>
        </section>

        {error ? (
          <div className="banner banner-danger" role="alert">
            {error}
          </div>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-large" disabled={!canSubmit}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
          <span className="text-sm text-tertiary">You will choose where to save the .statementdesk file next.</span>
        </div>
      </form>
    </div>
  );
}
