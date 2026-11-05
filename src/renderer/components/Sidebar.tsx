import { WORKFLOW_STEPS, type PageId } from '../navigation';

interface SidebarProps {
  current: PageId;
  enabled: ReadonlySet<PageId>;
  onNavigate: (page: PageId) => void;
  engineVersion: string | null;
  platform: 'darwin' | 'win32' | 'linux';
}

export function Sidebar({ current, enabled, onNavigate, engineVersion, platform }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Workflow">
      <div className="sidebar-heading">Reconciliation</div>
      <ul className="sidebar-nav">
        {WORKFLOW_STEPS.map((item) => {
          const isCurrent = item.id === current;
          const isEnabled = enabled.has(item.id);
          return (
            <li key={item.id}>
              <button
                type="button"
                className="sidebar-item"
                aria-current={isCurrent ? 'page' : undefined}
                disabled={!isEnabled}
                onClick={() => onNavigate(item.id)}
              >
                {item.step !== null ? <span className="sidebar-step" aria-hidden="true">{item.step}</span> : null}
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="sidebar-footer">
        Works offline. Data stays on this {platform === 'darwin' ? 'Mac' : 'computer'}.
        {engineVersion ? <div>Engine {engineVersion}</div> : null}
      </div>
    </nav>
  );
}
