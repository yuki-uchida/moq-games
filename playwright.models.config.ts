import { defineConfig } from '@playwright/test'

// Start the existing game Vite dev server separately. This suite serves an
// isolated same-origin review document and loads the final runtime GLB tree.
export default defineConfig({
  testDir: './tests',
  testMatch: 'model-adapters-e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/model-adapters',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/models', open: 'never' }],
    ['json', { outputFile: 'test-results/model-adapters/results.json' }]
  ],
  use: {
    baseURL: process.env.TOWER_E2E_BASE_URL ?? 'http://127.0.0.1:5174',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1100, height: 900 },
    deviceScaleFactor: 1,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Tracing/video can perturb timing; use failure screenshots, browser logs,
    // pixel reports and explicit PNG/JSON attachments for this measurement suite.
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure'
  }
})
