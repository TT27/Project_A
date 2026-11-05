import { useEffect, useState } from 'react';
import type { AppInfo, RecentProject } from '@shared/contracts';
import { getApi, hasApi } from '../hooks/useApi';

interface HomePageProps {
  info: AppInfo | null;
  infoError: string | null;
  onNewReconciliation: () => void;
  onOpenProject: () => void;
  onTrySample: () => void;
  onOpenRecent: (path: string) => void;
  onHelp: () => void;
}

const PLATFORM_LABEL: Record<AppInfo['platform'], string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

export function HomePage(props: HomePageProps) {
  const { info, infoError } = props;
  const [recent, setRecent] = useState<RecentProject[]>([]);

  useEffect(() => {
    if (!hasApi()) return;
    let cancelled = false;
    getApi()
      .app.getRecentProjects()
      .then((list) => {
        if (!cancelled) setRecent(list);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="content-inner">
      <div className="page-header">
        <h1>Welcome to StatementDesk</h1>
        <p>Reconcile a supplier statement against your accounts payable ledger, then export a reviewable pack.</p>
      </div>

      <div className="local-notice" role="note">
        <span aria-hidden="true">🔒</span>
        <div>
          <strong>Everything is processed locally on this computer.</strong> StatementDesk never uploads your statements,
          ledgers, projects or notes. There are no accounts, no cloud sync and no network activity during import,
          comparison, review or export.
        </div>
      </div>

      <div className="home-actions">
        <button type="button" className="card home-action" onClick={props.onNewReconciliation}>
          <h3>New reconciliation</h3>
          <p>Start a project for one supplier at one statement cutoff.</p>
          <span className="text-xs text-tertiary">⌘N</span>
        </button>
        <button type="button" className="card home-action" onClick={props.onOpenProject}>
          <h3>Open existing project</h3>
          <p>Reopen a saved .statementdesk file with its history and notes.</p>
          <span className="text-xs text-tertiary">⌘O</span>
        </button>
        <button type="button" className="card home-action" onClick={props.onTrySample}>
          <h3>Try sample</h3>
          <p>Load the synthetic SUP001 statement and ledger to see a worked example.</p>
        </button>
      </div>

      <div className="home-columns">
        <section className="card" aria-labelledby="recent-heading">
          <h2 id="recent-heading">Recent local projects</h2>
          {recent.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 'var(--space-3)' }}>
              No recent projects yet. Projects you create or open will appear here.
            </div>
          ) : (
            <ul className="recent-list" style={{ marginTop: 'var(--space-3)' }}>
              {recent.map((r) => (
                <li key={r.path}>
                  <button type="button" className="recent-item" onClick={() => props.onOpenRecent(r.path)} title={r.path}>
                    <span>{r.name}</span>
                    <span className="mono text-xs">{r.lastOpenedAt.slice(0, 10)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="help-heading">
          <h2 id="help-heading">Help and supported formats</h2>
          <ul className="format-list" style={{ marginTop: 'var(--space-3)' }}>
            <li>CSV (UTF-8, optional BOM), up to 10,000 data rows</li>
            <li>Excel .xlsx using saved cell values, one worksheet per input</li>
            <li>Dates as DD/MM/YYYY or YYYY-MM-DD</li>
            <li>Currency: AUD only</li>
            <li>Invoices positive, credit notes negative</li>
          </ul>
          <p style={{ marginTop: 'var(--space-3)' }}>
            <button type="button" className="btn" onClick={props.onHelp}>
              Open user guide
            </button>
          </p>
          <dl className="info-grid" style={{ marginTop: 'var(--space-4)' }}>
            <dt>Version</dt>
            <dd className="selectable">{info ? info.version : infoError ? 'unavailable' : '…'}</dd>
            <dt>Engine</dt>
            <dd className="selectable">{info ? info.engineVersion : '…'}</dd>
            <dt>Platform</dt>
            <dd>{info ? PLATFORM_LABEL[info.platform] : '…'}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}
