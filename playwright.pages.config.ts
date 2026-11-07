import { defineConfig } from '@playwright/test'

const port = Number(process.env.PAGES_PORT || 4174)

// Verify the actual Pages output, not Vite's development-only module routes.
export default defineConfig({
  testDir: './tests',
  testMatch:
    /(?:(?:landing|ember-grid|life-survivors-published|tower-title|tower-standalone|tower-special-abilities|tower-skill-bar|tower-pause|tower-stage-intel|tower-all-out|tower-music)-e2e|tower-model-review|tower-sidecar-e2e|tower-meshopt-equivalence|tower-published-audio|tower-real3d-game|tower-compact-field|tower-road-placement|tower-proximal-game)\.spec\.ts/,
  // Shard independent page fixtures at test granularity; each runner still uses one worker.
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  // Include full cold GPU preparation and explicit save/reload scenarios.
  timeout: 360_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/pages',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/pages', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    headless: true,
    // Software WebGL makes the actual mesh review reproducible on hosted runners.
    launchOptions: {
      args: ['--use-gl=angle', process.platform === 'win32' ? '--use-angle=d3d11-warp' : '--use-angle=swiftshader']
    },
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    // Record the first attempt and retain failures, including with retries: 0.
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/moq-games/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
})
