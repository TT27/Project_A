import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@domain': resolve(__dirname, 'src/domain'),
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/property/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'out/**', 'release/**'],
    environment: 'node',
    testTimeout: 30_000,
    reporters: process.env['CI'] ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'test-results/vitest-junit.xml' }
  }
});
