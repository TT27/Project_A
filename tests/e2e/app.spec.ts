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
  expect(probe.bridgeKeys).toEqual(['app', 'dialog', 'imports', 'project']);
});
