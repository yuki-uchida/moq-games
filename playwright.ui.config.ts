import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'tower-ui-layout-e2e.spec.ts',
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: process.env.TOWER_E2E_BASE_URL ?? 'http://127.0.0.1:5174',
    browserName: 'chromium',
    headless: true,
    launchOptions: process.env.TOWER_CHROMIUM_PATH ? { executablePath: process.env.TOWER_CHROMIUM_PATH } : {}
  }
})
