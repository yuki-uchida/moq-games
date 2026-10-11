import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tools/tower-debug/tests',
  testMatch: 'tower-debug-viewer-e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: process.env.TOWER_DEBUG_E2E_BASE_URL ?? 'http://127.0.0.1:5176',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'on'
  }
})
