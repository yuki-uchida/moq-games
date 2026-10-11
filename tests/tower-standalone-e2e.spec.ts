import { expect, test } from '@playwright/test'
import { towerPath, openOfflineCampaign, dragUnitToWorld } from './tower-defense-e2e-arrange'
import { getField } from '../examples/games/tower_diffence_with_jev/src/game/model'

test('keeps the SDK lazy and initializes packaged WASM before attempting transport', async ({ page }) => {
  // Arrange
  const wasmResponses: { status: number; type: string }[] = []
  const externalRequests: string[] = []
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('.wasm'))
      wasmResponses.push({ status: response.status(), type: response.headers()['content-type'] ?? '' })
  })
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
    externalRequests.push(url.origin)
    return route.abort()
  })
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'WebTransport', {
      configurable: true,
      value: class {
        constructor() {
          document.documentElement.dataset.transportAttempt = 'after-wasm-init'
          throw new Error('Standalone verification stops before network transport')
        }
      }
    })
  })
  await page.goto(towerPath)
  await expect(page.locator('#offline-start')).toBeVisible()
  // Act / Assert
  expect(wasmResponses).toEqual([])
  await page.locator('#launch-settings').click()
  await expect(page.locator('#settings')).toBeVisible()
  await page.locator('#connect').click()
  await expect(page.locator('html')).toHaveAttribute('data-transport-attempt', 'after-wasm-init')
  expect(wasmResponses).toEqual([{ status: 200, type: 'application/wasm' }])
  expect(externalRequests).toEqual([])
  await expect(page.locator('#notice')).toContainText('接続エラー')
})

test('plays the included 2D RuleAI game through a natural outcome without optional packs', async ({ page }) => {
  // Arrange
  const external: string[] = []
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
    external.push(url.origin)
    return route.abort()
  })
  await openOfflineCampaign(page)
  await dragUnitToWorld(page, 'soldier', getField('meadow', 2).slots[0])
  // Act
  await page.locator('#assault').click()
  // Assert
  await expect(page.locator('#phase')).toContainText('襲撃')
  await expect(page.locator('#time')).not.toHaveText('00:00')
  await expect(page.locator('#result')).toBeVisible({ timeout: 150000 })
  expect(external).toEqual([])
})
