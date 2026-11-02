import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { join } from 'node:path';

/**
 * E2E scaffold: launches the built app (npm run build first) and checks the shell renders.
 * On headless Linux run under xvfb: `xvfb-run -a npm run test:e2e`.
 */
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    // Launch the project directory so Electron resolves package.json (name/version/main).
    args: [join(__dirname, '..', '..'), '--no-sandbox'],
    env: { ...(process.env as Record<string, string>), NODE_ENV: 'production' }
  });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app?.close();
});

test('launches and shows the Home page with version and local-processing statement', async () => {
  await expect(page.getByRole('heading', { name: 'Welcome to StatementDesk' })).toBeVisible();
  await expect(page.getByText('Everything is processed locally on this computer.')).toBeVisible();
  const versionCell = page.locator('dl.info-grid dd').first();
  await expect(versionCell).toHaveText('0.1.0');
  await expect(page.locator('.toolbar')).toContainText('v0.1.0');
});

test('renderer has no Node access and the bridge is narrow', async () => {
  const probe = await page.evaluate(() => {
    const g = globalThis as unknown as { require?: unknown; process?: unknown; statementdesk: object };
    return {
      hasRequire: typeof g.require,
      hasProcess: typeof g.process,
      bridgeKeys: Object.keys(g.statementdesk).sort()
    };
  });
  expect(probe.hasRequire).toBe('undefined');
  expect(probe.hasProcess).toBe('undefined');
  expect(probe.bridgeKeys).toEqual([
    'app',
    'diagnostics',
    'dialog',
    'exports',
    'feedback',
    'imports',
    'project',
    'reconcile',
    'review'
  ]);
});

test('opens the golden sample, reconciles, records a note and persists it across reopen', async () => {
  // Seed a temp project from the bundled golden samples via the real main process.
  const created = await page.evaluate(async () => {
    const g = globalThis as unknown as { statementdesk: { app: { openSample: () => Promise<{ ok: boolean; value?: { path: string } }> } } };
    return g.statementdesk.app.openSample();
  });
  expect(created.ok).toBe(true);
  const projectPath = created.value!.path;

  // Run reconciliation and assert the spec's golden summary.
  const run = await page.evaluate(async () => {
    const g = globalThis as unknown as { statementdesk: { reconcile: { run: () => Promise<{ ok: boolean; value?: { runId: string; summary: { statementTotalCents: number; ledgerTotalCents: number; differenceCents: number; exceptionCount: number }; outcomes: { outcomeKey: string; category: string }[] } }> } } };
    return g.statementdesk.reconcile.run();
  });
  expect(run.ok).toBe(true);
  expect(run.value!.summary.statementTotalCents).toBe(286000);
  expect(run.value!.summary.ledgerTotalCents).toBe(253300);
  expect(run.value!.summary.differenceCents).toBe(32700);
  expect(run.value!.summary.exceptionCount).toBe(4);

  // Record a review note on an exception outcome.
  const exceptionKey = run.value!.outcomes.find((o) => o.category !== 'EXACT_MATCH')?.outcomeKey ?? run.value!.outcomes[0]!.outcomeKey;
  const recorded = await page.evaluate(async (key: string) => {
    const g = globalThis as unknown as { statementdesk: { review: { record: (r: unknown) => Promise<{ ok: boolean }> } } };
    return g.statementdesk.review.record({ outcomeKey: key, decision: 'investigate', reviewer: 'E2E', note: 'Persisted note from e2e' });
  }, exceptionKey);
  expect(recorded.ok).toBe(true);

  // Close and reopen the project file; the note must survive.
  const reviews = await page.evaluate(async (path: string) => {
    const g = globalThis as unknown as {
      statementdesk: {
        project: { close: () => Promise<unknown>; open: (p: string) => Promise<{ ok: boolean }> };
        review: { list: () => Promise<{ ok: boolean; value?: { note: string; reviewer: string }[] }> };
      };
    };
    await g.statementdesk.project.close();
    const opened = await g.statementdesk.project.open(path);
    if (!opened.ok) return { ok: false as const, value: [] as { note: string; reviewer: string }[] };
    return g.statementdesk.review.list();
  }, projectPath);
  expect(reviews.ok).toBe(true);
  expect(reviews.value!.some((r) => r.note === 'Persisted note from e2e' && r.reviewer === 'E2E')).toBe(true);
});
