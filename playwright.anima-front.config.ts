import { defineConfig } from '@playwright/test'

// Own server per run so parallel worktrees never test each other's code; E2E_PORT avoids clashes.
const port = Number(process.env.E2E_PORT || 5198)
// A 3D shooter needs a GPU to run at its real frame rate: locally on Windows use the hardware D3D11 backend
// (ANIMA_E2E_SOFTWARE_GL=1 forces the default software rasterizer, which is much slower).
const hardwareGl =
  process.platform === 'win32' && !process.env.CI && !process.env.ANIMA_E2E_SOFTWARE_GL
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    : []

export default defineConfig({
  testDir: './tests',
  testMatch: /anima-front-.*\.spec\.ts/,
  // The real-relay test needs a local moq-relay and runs only with playwright.anima-front-real-moq.config.ts.
  testIgnore: /real-moq/,
  fullyParallel: true,
  workers: 1,
  timeout: 90_000,
  outputDir: 'test-results/anima-front',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: hardwareGl,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {})
    },
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: `npm run dev:anima-front -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
    timeout: 60_000
  }
})
