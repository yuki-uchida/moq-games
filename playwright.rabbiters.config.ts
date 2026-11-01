import { defineConfig } from '@playwright/test'

// Own server per run so parallel worktrees never test each other's code; E2E_PORT avoids clashes.
const port = Number(process.env.E2E_PORT || 5193)

export default defineConfig({
  testDir: './tests',
  testMatch: 'rabbiters-*.spec.ts',
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: `npm run dev:rabbiters -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
    timeout: 30_000
  }
})
