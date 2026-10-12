import { defineConfig } from '@playwright/test'

// Verify the actual Pages output, not Vite's development-only module routes.
export default defineConfig({
  testDir: './tests',
  testMatch:
    /(?:(?:landing|tower-title|tower-standalone|tower-music)-e2e|tower-model-review|tower-published-audio|tower-real3d-game|tower-compact-field|tower-road-placement)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/pages',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/pages', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
    headless: true,
    // Software WebGL makes the actual mesh review reproducible on hosted runners.
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] },
    viewport: { width: 1440, height: 1000 },
    screenshot: 'on',
    trace: 'on'
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/moq-games/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
})
