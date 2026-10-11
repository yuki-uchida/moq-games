import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: /tower-compact-field\.spec\.ts/,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 20000 },
  reporter: 'list',
  use: {
    baseURL: process.env.TOWER_E2E_BASE_URL ?? 'http://127.0.0.1:5174',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
})
