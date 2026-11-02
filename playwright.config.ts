import { defineConfig } from '@playwright/test';

// End-to-end tests drive the packaged renderer through Electron (see tests/e2e).
// On a headless Linux CI box run them under `xvfb-run -a npm run test:e2e`.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results/e2e',
  use: { trace: 'retain-on-failure' }
});
