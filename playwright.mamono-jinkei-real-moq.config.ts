import { defineConfig } from '@playwright/test'

// Opt-in: needs MOQ_RELAY_EXECUTABLE_PATH, OPENSSL_EXECUTABLE_PATH and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
export default defineConfig({
  testDir: './tests',
  testMatch: 'mamono-jinkei-real-moq.spec.ts',
  outputDir: '.generated/mamono-jinkei-real-moq-results',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: { headless: true }
})
