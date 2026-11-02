import { useCallback, useId, useMemo, useState } from 'react';
import type { MenuAction } from '@shared/contracts';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { useAppInfo } from './hooks/useAppInfo';
import { useMenuActions } from './hooks/useMenuActions';
import { useNativeTheme } from './hooks/useNativeTheme';
import { getApi, hasApi } from './hooks/useApi';
import { useWorkflow } from './hooks/useWorkflow';
import { WORKFLOW_STEPS, type PageId } from './navigation';
import { HomePage } from './pages/HomePage';
import { PendingPage } from './pages/PendingPage';
import { SetupPage } from './pages/SetupPage';
import { ImportMappingPage } from './pages/ImportMappingPage';
import { ValidationPage } from './pages/ValidationPage';

const PAGE_DESCRIPTIONS: Record<Exclude<PageId, 'home' | 'setup' | 'import' | 'validation'>, string> = {
  results: 'Reconciliation results appear after the comparison has been run.',
  review: 'Exception review becomes available once results exist.',
  export: 'Exports become available once a reconciliation run exists.',
  feedback: 'The offline feedback form becomes available in a later step of this beta.'
};

export function App() {
  const { info, error: infoError } = useAppInfo();
  useNativeTheme(info?.theme);
  const [page, setPage] = useState<PageId>('home');
  const workflow = useWorkflow();
  const requestId = useId();

  const enabledPages = useMemo(() => {
    const set = new Set<PageId>(['home', 'setup']);
    if (workflow.project) set.add('import');
    if (workflow.project && workflow.bothImported) set.add('validation');
    return set;
  }, [workflow.project, workflow.bothImported]);

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

  const closeProject = useCallback(() => {
    if (hasApi()) void getApi().project.close();
    workflow.closeProject();
    setPage('home');
  }, [workflow]);

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
          closeProject();
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
    [navigate, pickProject, closeProject]
  );
  useMenuActions(onMenuAction);

  const platform = info?.platform ?? 'darwin';
  const projectName = workflow.project?.setup.projectName ?? null;

  function renderPage() {
    if (page === 'home') {
      return (
        <HomePage
          info={info}
          infoError={infoError}
          onNewReconciliation={() => onMenuAction('new-reconciliation')}
          onOpenProject={() => onMenuAction('open-project')}
          onTrySample={() => onMenuAction('try-sample')}
          onOpenRecent={() => onMenuAction('open-project')}
          onHelp={() => onMenuAction('help')}
        />
      );
    }
    if (page === 'setup') return <SetupPage workflow={workflow} onCreated={() => setPage('import')} />;
    if (page === 'import') return <ImportMappingPage workflow={workflow} requestId={requestId} onBothImported={() => undefined} />;
    if (page === 'validation') return <ValidationPage workflow={workflow} running={false} onRun={() => navigate('results')} />;
    return <PendingPage title={WORKFLOW_STEPS.find((s) => s.id === page)?.label ?? ''} description={PAGE_DESCRIPTIONS[page]} />;
  }

  return (
    <div className="app-shell" data-platform={platform}>
      <Toolbar info={info} projectName={projectName} />
      <Sidebar current={page} enabled={enabledPages} onNavigate={navigate} engineVersion={info?.engineVersion ?? null} platform={platform} />
      <main className="content" id="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
