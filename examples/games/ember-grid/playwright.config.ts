import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: 'http://127.0.0.1:5187/moq-games/examples/games/ember-grid/',
    headless: true,
    hasTouch: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5187',
    cwd: process.cwd(),
    url: 'http://127.0.0.1:5187/moq-games/',
    reuseExistingServer: true
  }
})
