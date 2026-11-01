import { defineConfig } from '@playwright/test'
// Own server per run so parallel worktrees never test each other's code; E2E_PORT avoids clashes.
const port = Number(process.env.E2E_PORT || 5187)
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: `http://127.0.0.1:${port}/moq-games/examples/games/ember-grid/`,
    headless: true,
    hasTouch: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: process.cwd(),
    url: `http://127.0.0.1:${port}/moq-games/`,
    reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER)
  }
})
