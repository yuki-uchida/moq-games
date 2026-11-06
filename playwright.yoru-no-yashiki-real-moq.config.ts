import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'yoru-no-yashiki-real-moq.spec.ts',
  outputDir: '.generated/yoru-no-yashiki-real-moq-results',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { headless: true }
})
