import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: /tower-real3d-game\.spec\.ts/,
  workers: 1,
  timeout: 240_000,
  reporter: [['list'], ['json', { outputFile: '.generated/refined-game-results.json' }]],
  outputDir: 'test-results/refined-motions',
  use: {
    baseURL: process.env.TOWER_E2E_BASE_URL ?? 'http://127.0.0.1:5183',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    video: 'off',
    screenshot: 'only-on-failure'
  }
})
