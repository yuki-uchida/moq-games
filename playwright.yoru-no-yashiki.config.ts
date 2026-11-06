import { defineConfig } from '@playwright/test'

const port = Number(process.env.E2E_PORT || 5195)
export default defineConfig({
  testDir: './tests',
  testMatch: 'yoru-no-yashiki-e2e.spec.ts',
  outputDir: '.generated/yoru-no-yashiki-test-results',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:' + port,
    headless: true,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--use-angle=swiftshader',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows'
      ]
    }
  },
  webServer: {
    command: 'node tests/yoru-no-yashiki-server.mjs',
    url: 'http://127.0.0.1:' + port,
    reuseExistingServer: false,
    timeout: 30_000
  }
})
