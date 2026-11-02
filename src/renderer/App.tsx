import { useCallback, useMemo, useState } from 'react';
import type { MenuAction } from '@shared/contracts';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { useAppInfo } from './hooks/useAppInfo';
import { useMenuActions } from './hooks/useMenuActions';
import { useNativeTheme } from './hooks/useNativeTheme';
import { getApi, hasApi } from './hooks/useApi';
import { WORKFLOW_STEPS, type PageId } from './navigation';
import { HomePage } from './pages/HomePage';
import { PendingPage } from './pages/PendingPage';

const PAGE_DESCRIPTIONS: Record<Exclude<PageId, 'home'>, string> = {
  setup: 'Create a new reconciliation (⌘N) to configure the supplier, cutoff date and input files.',
  import: 'Import and column mapping become available once a project has been set up.',
  validation: 'Validation results appear after both files have been imported.',
  results: 'Reconciliation results appear after the comparison has been run.',
  review: 'Exception review becomes available once results exist.',
  export: 'Exports become available once a reconciliation run exists.',
  feedback: 'The offline feedback form becomes available in a later step of this beta.'
};

export function App() {
  const { info, error: infoError } = useAppInfo();
  useNativeTheme(info?.theme);
  const [page, setPage] = useState<PageId>('home');
  const [projectName] = useState<string | null>(null);

  // Phase 1: only Home is reachable; later phases unlock steps as state progresses.
  const enabledPages = useMemo(() => new Set<PageId>(['home']), []);

  const navigate = useCallback(
    (target: PageId) => {
      if (enabledPages.has(target)) setPage(target);
    },
    [enabledPages]
  );

  const pickProject = useCallback(async () => {
    if (!hasApi()) return;
    const picked = await getApi().dialog.pickProjectPath({ mode: 'open' });
    if (!picked) return;
    const opened = await getApi().project.open(picked.path);
    if (!opened.ok) window.alert(opened.error.message);
  }, []);

  const onMenuAction = useCallback(
    (action: MenuAction) => {
      switch (action) {
        case 'new-reconciliation':
          navigate('setup');
          break;
        case 'open-project':
          void pickProject();
          break;
        case 'close-project':
          navigate('home');
          break;
        case 'export':
          navigate('export');
          break;
        case 'try-sample':
          navigate('setup');
          break;
        case 'help':
          navigate('home');
          break;
        case 'feedback':
          navigate('feedback');
          break;
      }
    },
    [navigate, pickProject]
  );
  useMenuActions(onMenuAction);

  const platform = info?.platform ?? 'darwin';

  return (
    <div className="app-shell" data-platform={platform}>
      <Toolbar info={info} projectName={projectName} />
      <Sidebar current={page} enabled={enabledPages} onNavigate={navigate} engineVersion={info?.engineVersion ?? null} platform={platform} />
      <main className="content" id="main-content">
        {page === 'home' ? (
          <HomePage
            info={info}
            infoError={infoError}
            onNewReconciliation={() => onMenuAction('new-reconciliation')}
            onOpenProject={() => onMenuAction('open-project')}
            onTrySample={() => onMenuAction('try-sample')}
            onOpenRecent={() => onMenuAction('open-project')}
            onHelp={() => onMenuAction('help')}
          />
        ) : (
          <PendingPage title={WORKFLOW_STEPS.find((s) => s.id === page)?.label ?? ''} description={PAGE_DESCRIPTIONS[page]} />
        )}
      </main>
    </div>
  );
}
