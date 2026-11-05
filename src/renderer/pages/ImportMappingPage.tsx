import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ColumnMapping,
  DateFormat,
  ImportConfig,
  InspectResult,
  MappingPreview,
  NormaliseOptions,
  SignMode,
  Side
} from '@shared/contracts';
import { getApi } from '../hooks/useApi';
import type { ChosenFile, Workflow } from '../hooks/useWorkflow';

interface ImportMappingPageProps {
  workflow: Workflow;
}

const MANDATORY_FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: 'reference', label: 'Reference / document no.' },
  { key: 'documentType', label: 'Document type' },
  { key: 'documentDate', label: 'Document date' },
  { key: 'outstanding', label: 'Outstanding amount' }
];

const OPTIONAL_FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: 'supplier', label: 'Supplier (optional)' },
  { key: 'currency', label: 'Currency (optional)' },
  { key: 'asOfDate', label: 'As-of / cutoff date (optional)' }
];

const KEYWORDS: Record<keyof ColumnMapping, RegExp> = {
  reference: /(ref|invoice\s*(no|num|#)|doc(ument)?\s*(no|num|#)?|number)/i,
  documentType: /(type|kind|class)/i,
  documentDate: /(doc.*date|invoice.*date|^date$|date)/i,
  outstanding: /(amount|balance|outstanding|value|total|open)/i,
  supplier: /(supplier|vendor|account)/i,
  currency: /(currency|ccy|curr)/i,
  asOfDate: /(as.?of|cutoff|statement.*date|period)/i
};

function columnLetter(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function deriveHeaderLabels(inspect: InspectResult, headerRow: number): string[] {
  const row = inspect.preview.rows.find((r) => r.index === headerRow);
  const count = inspect.preview.columnCount;
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = row?.cells[i]?.trim();
    labels.push(raw && raw !== '' ? raw : `Column ${columnLetter(i)}`);
  }
  return labels;
}

function autoMap(labels: string[]): ColumnMapping {
  const mapping: ColumnMapping = { reference: -1, documentType: -1, documentDate: -1, outstanding: -1, supplier: -1, currency: -1, asOfDate: -1 };
  (Object.keys(KEYWORDS) as (keyof ColumnMapping)[]).forEach((field) => {
    const idx = labels.findIndex((l) => KEYWORDS[field].test(l));
    if (idx >= 0) mapping[field] = idx;
  });
  return mapping;
}

function SideImporter({
  side,
  file,
  workflow,
  imported
}: {
  side: Side;
  file: ChosenFile;
  workflow: Workflow;
  imported: string | undefined;
}) {
  const project = workflow.project;
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [headerRow, setHeaderRow] = useState(1);
  const [dataStartRow, setDataStartRow] = useState(2);
  const [dataEndRow, setDataEndRow] = useState<number | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [signMode, setSignMode] = useState<SignMode>('by_document_type');
  const [dateFormat, setDateFormat] = useState<DateFormat>(side === 'ledger' ? 'YYYY-MM-DD' : 'DD/MM/YYYY');
  const [allowParentheses, setAllowParentheses] = useState(true);
  const [controlText, setControlText] = useState('');
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<MappingPreview | null>(null);
  const [status, setStatus] = useState<string | null>('Inspecting file…');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const labels = useMemo(() => (inspect ? deriveHeaderLabels(inspect, headerRow) : []), [inspect, headerRow]);

  // Inspect the file once on mount.
  useEffect(() => {
    let cancelled = false;
    getApi()
      .imports.inspect({ side, path: file.path, kind: file.kind })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error.message);
          setStatus(null);
          return;
        }
        const ins = res.value;
        setInspect(ins);
        setSheetName(ins.kind === 'xlsx' ? ins.defaultSheet : null);
        setHeaderRow(ins.headerRowGuess);
        setDataStartRow(ins.headerRowGuess + 1);
        setMapping(autoMap(deriveHeaderLabels(ins, ins.headerRowGuess)));
        setStatus(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not inspect the file.');
          setStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [side, file.path, file.kind]);

  const buildConfig = useCallback((): ImportConfig | null => {
    if (!project || !mapping) return null;
    const options: NormaliseOptions = { signMode, dateFormat, decimalSeparator: '.', allowParentheses, mappingVersion: 1 };
    return {
      side,
      path: file.path,
      kind: file.kind,
      sheetName,
      headerRow,
      dataStartRow,
      dataEndRow,
      excludedRows: [...excluded].sort((a, b) => a - b),
      mapping,
      scope: {
        projectId: project.projectId,
        sourceId: `${project.projectId}:${side}`,
        supplierId: project.setup.supplierId,
        currency: project.setup.currency,
        cutoffDate: project.setup.cutoffDate
      },
      options,
      controlTotalText: controlText.trim() === '' ? null : controlText.trim()
    };
  }, [project, mapping, signMode, dateFormat, allowParentheses, side, file, sheetName, headerRow, dataStartRow, dataEndRow, excluded, controlText]);

  const mandatoryMapped = mapping ? MANDATORY_FIELDS.every((f) => mapping[f.key] >= 0) : false;

  async function refreshPreview() {
    const config = buildConfig();
    if (!config) return;
    setBusy(true);
    setError(null);
    try {
      const res = await getApi().imports.preview({ config });
      if (!res.ok) setError(res.error.message);
      else setPreview(res.value);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    const config = buildConfig();
    if (!config) return;
    setBusy(true);
    setError(null);
    setStatus('Importing…');
    try {
      const res = await getApi().imports.run({ requestId: crypto.randomUUID(), config });
      if (!res.ok) {
        setError(res.error.message);
      } else {
        workflow.setImport(config.scope.projectId, side, res.value);
        setPreview(null);
        setStatus('Imported.');
      }
    } finally {
      setBusy(false);
      setStatus((s) => (s === 'Importing…' ? null : s));
    }
  }

  function setField(key: keyof ColumnMapping, value: number) {
    setMapping((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleExclude(row: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  }

  const title = side === 'statement' ? 'Supplier statement' : 'AP ledger export';

  return (
    <section className="card import-side" aria-label={title}>
      <header className="import-side-head">
        <div>
          <h2>{title}</h2>
          <div className="text-sm text-secondary selectable">{file.name}</div>
        </div>
        {imported ? <span className="badge badge-success">Saved import: {imported}</span> : null}
      </header>

      {status ? <div className="text-sm text-secondary">{status}</div> : null}
      {error ? (
        <div className="banner banner-danger" role="alert">
          {error}
        </div>
      ) : null}

      {inspect ? (
        <>
          <div className="field-grid">
            {inspect.kind === 'xlsx' ? (
              <div className="field">
                <label>Worksheet</label>
                <select className="select" value={sheetName ?? ''} onChange={(e) => setSheetName(e.target.value)}>
                  {inspect.sheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                      {s.hidden ? ' (hidden)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label>Header row</label>
              <input className="input" type="number" min={1} value={headerRow} onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="field">
              <label>First data row</label>
              <input className="input" type="number" min={1} value={dataStartRow} onChange={(e) => setDataStartRow(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="field">
              <label>Last data row (optional)</label>
              <input
                className="input"
                type="number"
                min={1}
                value={dataEndRow ?? ''}
                placeholder="to end"
                onChange={(e) => setDataEndRow(e.target.value === '' ? null : Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          <h3 className="subhead">Column mapping</h3>
          <div className="field-grid">
            {[...MANDATORY_FIELDS, ...OPTIONAL_FIELDS].map((f) => {
              const optional = OPTIONAL_FIELDS.some((o) => o.key === f.key);
              return (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  <select
                    className="select"
                    value={mapping ? mapping[f.key] : -1}
                    onChange={(e) => setField(f.key, Number(e.target.value))}
                  >
                    {optional ? <option value={-1}>— Not mapped —</option> : <option value={-1}>— Choose column —</option>}
                    {labels.map((l, i) => (
                      <option key={i} value={i}>
                        {columnLetter(i)} · {l}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <h3 className="subhead">Interpretation</h3>
          <div className="field-grid">
            <div className="field">
              <label>Sign convention</label>
              <select className="select" value={signMode} onChange={(e) => setSignMode(e.target.value as SignMode)}>
                <option value="by_document_type">By document type (credit notes negated)</option>
                <option value="signed_amount">Amounts already signed</option>
              </select>
            </div>
            <div className="field">
              <label>Date format</label>
              <select className="select" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <div className="field">
              <label>Control total (optional)</label>
              <input className="input" value={controlText} onChange={(e) => setControlText(e.target.value)} placeholder="e.g. 2860.00" />
            </div>
            <label className="checkbox-field" style={{ alignSelf: 'end' }}>
              <input type="checkbox" checked={allowParentheses} onChange={(e) => setAllowParentheses(e.target.checked)} />
              <span>Treat (1,234.00) as negative</span>
            </label>
          </div>

          <div className="form-actions">
            <button type="button" className="btn" onClick={() => void refreshPreview()} disabled={!mandatoryMapped || busy}>
              Preview mapping
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void runImport()} disabled={!mandatoryMapped || busy}>
              {imported ? 'Re-import' : 'Import this file'}
            </button>
            <button type="button" className="btn" disabled title="Saved mapping profiles arrive with persistence.">
              Save mapping profile
            </button>
          </div>
          {!mandatoryMapped ? <p className="field-hint">Map all four mandatory columns to preview or import.</p> : null}

          {preview ? (
            <div className="preview-block">
              <div className="counts-row" role="status">
                <span>{preview.counts.imported} rows</span>
                <span className="badge badge-success">{preview.counts.valid} valid</span>
                <span className="badge badge-danger">{preview.counts.invalid} invalid</span>
                <span className="badge badge-info">{preview.counts.excluded} excluded</span>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Keep</th>
                      <th>Row</th>
                      <th>Status</th>
                      <th>Reference</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.sourceRow} className={r.status === 'invalid' ? 'row-invalid' : r.status === 'excluded' ? 'row-excluded' : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!excluded.has(r.sourceRow)}
                            onChange={() => toggleExclude(r.sourceRow)}
                            aria-label={`Keep row ${r.sourceRow}`}
                          />
                        </td>
                        <td className="mono">{r.sourceRow}</td>
                        <td>
                          <span className={`badge ${r.status === 'valid' ? 'badge-success' : r.status === 'invalid' ? 'badge-danger' : 'badge-info'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="selectable">{r.interpreted.reference}</td>
                        <td className="selectable">{r.interpreted.documentType}</td>
                        <td className="mono selectable">{r.interpreted.documentDate}</td>
                        <td className="mono selectable" style={{ textAlign: 'right' }}>{r.interpreted.outstanding}</td>
                        <td className="issue-cell">
                          {r.errors.map((i, k) => (
                            <div key={`e${k}`} className="issue issue-error">{i.message}</div>
                          ))}
                          {r.warnings.map((i, k) => (
                            <div key={`w${k}`} className="issue issue-warning">{i.message}</div>
                          ))}
                          {r.excludedReason ? <div className="issue">{r.excludedReason}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="field-hint">Un-tick a row to exclude it, then Preview again or Import.</p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function ImportMappingPage({ workflow }: ImportMappingPageProps) {
  const { project, files, imports } = workflow;
  const [fileError, setFileError] = useState<string | null>(null);

  async function pickFile(side: Side) {
    if (!project) return;
    setFileError(null);
    try {
      const picked = await getApi().dialog.pickInputFile({ side });
      if (picked) workflow.setFile(project.projectId, side, picked);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not select a source file.');
    }
  }

  return (
    <div className="content-inner">
      <div className="page-header">
        <h1>Import &amp; mapping</h1>
        <p>Map each file&rsquo;s columns to the reconciliation fields, then import. Nothing leaves this computer.</p>
      </div>
      {fileError && <p className="banner banner-danger" role="alert">{fileError}</p>}
      {(['statement', 'ledger'] as const).map((side) => {
        const file = files[side];
        const imported = imports[side]?.fileName;
        return (
          <div key={side}>
            <button type="button" className="btn" onClick={() => void pickFile(side)}>
              {file || imported ? 'Change' : 'Choose'} {side === 'statement' ? 'supplier statement' : 'AP ledger export'}…
            </button>
            {file ? (
              <SideImporter key={`${project?.projectId}:${file.path}`} side={side} file={file} workflow={workflow} imported={imported} />
            ) : (
              <div className="placeholder-panel">{imported ? `Saved import: ${imported}` : `No ${side} file selected.`}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
