import { defineConfig } from '@playwright/test'

// Opt-in: needs MOQ_RELAY_EXECUTABLE_PATH, OPENSSL_EXECUTABLE_PATH and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
export default defineConfig({
  testDir: './tests',
  testMatch: 'anima-front-real-moq.spec.ts',
  outputDir: '.generated/anima-front-real-moq-results',
  workers: 1,
  retries: 0,
  timeout: 600_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: { headless: true }
})
