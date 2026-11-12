import { defineConfig } from '@playwright/test'

// Own server per run so parallel worktrees never test each other's code; E2E_PORT avoids clashes.
const port = Number(process.env.E2E_PORT || 5198)

export default defineConfig({
  testDir: './tests',
  testMatch: /anima-front-.*\.spec\.ts/,
  fullyParallel: true,
  workers: 1,
  timeout: 90_000,
  outputDir: 'test-results/anima-front',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: `npm run dev:anima-front -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
    timeout: 60_000
  }
})
