import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tools/tower-debug/tests',
  testMatch: 'tower-debug-foundations-e2e.spec.ts',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  use: {
    baseURL: process.env.TOWER_DEBUG_E2E_BASE_URL ?? 'http://127.0.0.1:5187',
    headless: true,
    launchOptions: process.env.TOWER_DEBUG_CHROME_EXECUTABLE
      ? { executablePath: process.env.TOWER_DEBUG_CHROME_EXECUTABLE }
      : {},
    screenshot: 'only-on-failure'
  }
})
