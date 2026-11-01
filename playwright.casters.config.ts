import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: 'caster-runtime-e2e.spec.ts',
  workers: 1,
  timeout: 180000,
  expect: { timeout: 30000 },
  reporter: 'list',
  use: {
    baseURL: process.env.TOWER_E2E_BASE_URL ?? 'http://127.0.0.1:5185',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure'
  },
  outputDir: 'test-results/caster-runtime'
})
