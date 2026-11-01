import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: 'tower-proximal-game.spec.ts',
  workers: 1,
  timeout: 360000,
  expect: { timeout: 30000 },
  reporter: 'list',
  outputDir: process.env.PROXIMAL_E2E_OUTPUT ?? 'test-results/proximal-game',
  use: {
    baseURL: process.env.TOWER_E2E_BASE_URL ?? 'http://127.0.0.1:5281',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined
  }
})
