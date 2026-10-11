import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch:
    /(tower-compact-field|tower-title-e2e|tower-standalone-e2e|tower-tank-health-e2e|tower-tank-roadblock-e2e|tower-road-placement-e2e|tower-combat-balance-v15-e2e|tower-motion-six-e2e|tower-layout-revision-e2e|tower-cluster-scoring-e2e|tower-enemy-outcome-e2e|tower-independent-healing-e2e|tower-battle-relocation-e2e|tower-flight-targets-e2e|tower-combat-followup-e2e|tower-defense-e2e|tower-ranged-art-e2e|tower-presentation-e2e|tower-save-e2e|tower-loading-e2e|tower-decision-e2e|tower-balance-e2e|tower-soldier-trial-e2e|tower-audio-e2e|tower-battlefield-e2e|tower-roster-e2e|tower-fortification-e2e|tower-fortification-render-e2e|tower-commander-support-e2e|tower-unit-trials-e2e|tower-mage-trial-e2e|tower-frost-trial-e2e|tower-healer-trial-e2e|tower-runner-trial-e2e|tower-ranger-trial-e2e|tower-environment-trial-e2e|tower-cannon-trial-e2e|tower-paladin-trial-e2e|tower-handcrafted-bow-e2e|tower-enemy-pair-trial-e2e|tower-wolf-beetle-trial-e2e|tower-shaman-brute-trial-e2e|tower-bat-wraith-trial-e2e|tower-ogre-trial-e2e|tower-dragon-trial-e2e|tower-scout-economy-e2e|tower-enemy-fade-e2e|tower-appearance-mode-e2e|tower-overlay-ui-e2e)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.TOWER_E2E_BASE_URL ?? 'http://127.0.0.1:5174',
    browserName: 'chromium',
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    video: 'on',
    screenshot: 'only-on-failure'
  }
})
