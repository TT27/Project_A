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
import { ResultsPage } from './pages/ResultsPage';
import { ReviewPage } from './pages/ReviewPage';
import { ExportPage } from './pages/ExportPage';
import { FeedbackPage } from './pages/FeedbackPage';

export function App() {
  const { info, error: infoError } = useAppInfo();
  useNativeTheme(info?.theme);
  const [page, setPage] = useState<PageId>('home');
  const workflow = useWorkflow();
  const requestId = useId();
  const [running, setRunning] = useState(false);
  const [reviewKey, setReviewKey] = useState<string | null>(null);

  const enabledPages = useMemo(() => {
    const set = new Set<PageId>(['home', 'setup', 'feedback']);
    if (workflow.project) set.add('import');
    if (workflow.project && workflow.bothImported) set.add('validation');
    if (workflow.run) {
      set.add('results');
      set.add('review');
      set.add('export');
    }
    return set;
  }, [workflow.project, workflow.bothImported, workflow.run]);

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

  const runReconcile = useCallback(async () => {
    if (!hasApi()) return;
    setRunning(true);
    try {
      const res = await getApi().reconcile.run();
      if (!res.ok) {
        window.alert(res.error.message);
        return;
      }
      workflow.setRun(res.value);
      setPage('results');
    } finally {
      setRunning(false);
    }
  }, [workflow]);

  const trySample = useCallback(async () => {
    if (!hasApi()) return;
    setRunning(true);
    try {
      const res = await getApi().app.openSample();
      if (!res.ok) {
        window.alert(res.error.message);
        return;
      }
      workflow.setProject(res.value, {});
      const runRes = await getApi().reconcile.run();
      if (runRes.ok) {
        workflow.setRun(runRes.value);
        setPage('results');
      } else {
        window.alert(runRes.error.message);
      }
    } finally {
      setRunning(false);
    }
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
          void trySample();
          break;
        case 'help':
          navigate('home');
          break;
        case 'feedback':
          navigate('feedback');
          break;
      }
    },
    [navigate, pickProject, closeProject, trySample]
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
    if (page === 'validation') return <ValidationPage workflow={workflow} running={running} onRun={() => void runReconcile()} />;
    if (page === 'results') return <ResultsPage workflow={workflow} onReview={(key) => { setReviewKey(key); setPage('review'); }} />;
    if (page === 'review') return <ReviewPage workflow={workflow} focusKey={reviewKey} />;
    if (page === 'export') return <ExportPage workflow={workflow} />;
    if (page === 'feedback') return <FeedbackPage />;
    return <PendingPage title={WORKFLOW_STEPS.find((s) => s.id === page)?.label ?? ''} description="This step is not available yet." />;
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
