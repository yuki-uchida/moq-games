import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'rabbiters-e2e.spec.ts',
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5193',
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run dev:rabbiters',
    url: 'http://127.0.0.1:5193',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
})
