import { useState } from 'react';
import type { ExportKind } from '@shared/contracts';
import type { Workflow } from '../hooks/useWorkflow';
import { getApi, hasApi } from '../hooks/useApi';

interface Props {
  workflow: Workflow;
}

interface Status {
  kind: 'idle' | 'busy' | 'ok' | 'error';
  message: string;
}

const EXPORTS: { kind: ExportKind; title: string; description: string; ext: string }[] = [
  {
    kind: 'xlsx',
    title: 'Excel workbook (.xlsx)',
    description: 'Full workbook — Summary, Exceptions, Matched, imported rows, exclusions and import settings.',
    ext: 'xlsx'
  },
  {
    kind: 'csv',
    title: 'Exceptions CSV (.csv)',
    description: 'One row per exception, with the exact columns required for downstream tooling.',
    ext: 'csv'
  },
  {
    kind: 'html',
    title: 'Printable report (.html)',
    description: 'Self-contained report for printing or PDF export. No scripts, no external resources.',
    ext: 'html'
  }
];

export function ExportPage({ workflow }: Props) {
  const run = workflow.run;
  const [status, setStatus] = useState<Record<ExportKind, Status>>({
    xlsx: { kind: 'idle', message: '' },
    csv: { kind: 'idle', message: '' },
    html: { kind: 'idle', message: '' }
  });

  if (!run?.hasSourceSnapshot) {
    return (
      <section className="page">
        <h2>Export</h2>
        <p className="banner banner-info">{run ? 'This saved run predates source snapshots. Run a new reconciliation from Validation to export a report.' : 'Run a reconciliation first. Exports become available once a run exists.'}</p>
      </section>
    );
  }

  const supplier = workflow.project?.setup.supplierName ?? 'supplier';
  const cutoff = workflow.project?.setup.cutoffDate ?? '';
  const runId = run.runId;
  const isDraft = run.settings.invalidRowCount !== 0;

  async function doExport(kind: ExportKind, ext: string) {
    if (!hasApi()) return;
    setStatus((s) => ({ ...s, [kind]: { kind: 'busy', message: 'Choose a destination…' } }));
    try {
      const suggested = `StatementDesk-${(workflow.project?.setup.supplierId ?? 'export')}-${cutoff}`;
      const picked = await getApi().dialog.pickExportPath({ kind, suggestedName: suggested });
      if (!picked) {
        setStatus((s) => ({ ...s, [kind]: { kind: 'idle', message: '' } }));
        return;
      }
      setStatus((s) => ({ ...s, [kind]: { kind: 'busy', message: 'Writing file…' } }));
      const api = getApi().exports;
      const res =
        kind === 'xlsx' ? await api.writeXlsx(picked.path, runId) : kind === 'csv' ? await api.writeCsv(picked.path, runId) : await api.writeHtml(picked.path, runId);
      if (res.ok) {
        setStatus((s) => ({ ...s, [kind]: { kind: 'ok', message: `Saved ${res.value.bytes.toLocaleString()} bytes to ${res.value.path}` } }));
      } else {
        setStatus((s) => ({ ...s, [kind]: { kind: 'error', message: res.error.message } }));
      }
    } catch (err) {
      setStatus((s) => ({ ...s, [kind]: { kind: 'error', message: err instanceof Error ? err.message : 'Export failed' } }));
    }
    void ext;
  }

  return (
    <section className="page">
      <h2>Export</h2>
      <p className="muted">
        Reports for <strong>{supplier}</strong> as at {cutoff}. Financial values keep two decimals; identifiers are written as text and
        formula injection is neutralised in spreadsheet and CSV exports.
      </p>
      {isDraft && <p className="banner banner-warning">This is an incomplete draft. Use Excel or HTML to include the draft status in the report.</p>}
      <div className="export-list">
        {EXPORTS.map((e) => {
          const st = status[e.kind];
          return (
            <div className="export-card" key={e.kind}>
              <div className="export-card-main">
                <h3>{e.title}</h3>
                <p className="muted">{e.description}</p>
                {st.kind !== 'idle' && (
                  <p className={`export-status export-status-${st.kind}`} role="status">
                    {st.message}
                  </p>
                )}
              </div>
              <button className="btn btn-primary" disabled={st.kind === 'busy' || (isDraft && e.kind === 'csv')} onClick={() => void doExport(e.kind, e.ext)}>
                {st.kind === 'busy' ? 'Exporting…' : 'Export'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
