import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: /tower-real3d-game\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  reporter: 'list',
  use: {
    baseURL: process.env.TOWER_E2E_BASE_URL ?? 'http://127.0.0.1:5174',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
})
