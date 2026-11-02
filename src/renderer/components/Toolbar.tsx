import type { AppInfo } from '@shared/contracts';

interface ToolbarProps {
  info: AppInfo | null;
  projectName: string | null;
}

export function Toolbar({ info, projectName }: ToolbarProps) {
  return (
    <header className="toolbar" role="banner">
      <span className="toolbar-title">StatementDesk</span>
      <span className="toolbar-subtitle" aria-live="polite">
        {projectName ?? 'No project open'}
      </span>
      <span className="toolbar-spacer" />
      <span className="toolbar-subtitle">{info ? `v${info.version}` : ''}</span>
    </header>
  );
}
