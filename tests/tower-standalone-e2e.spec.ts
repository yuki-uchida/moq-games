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
  await page.locator('#title-new').click()
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

test('plays the included RuleAI game through a natural outcome without optional packs', async ({ page }) => {
  // Arrange
  const external: string[] = []
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
    external.push(url.origin)
    return route.abort()
  })
  await openOfflineCampaign(page)
  await dragUnitToWorld(page, 'soldier', getField('meadow', 2, 4).slots[0])
  // Act
  await page.locator('#assault').click()
  // Assert
  await expect(page.locator('#phase')).toContainText('襲撃')
  await expect(page.locator('#time')).not.toHaveText('00:00')
  await expect(page.locator('#result')).toBeVisible({ timeout: 150000 })
  expect(external).toEqual([])
})

test('does not offer or fetch omitted environment art, including a stale 3D URL', async ({ page }) => {
  const environmentRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/environment-3d-trial/')) environmentRequests.push(request.url())
  })
  await page.goto(`${towerPath}?environment-art=3d`)
  await page.locator('#title-new').click()
  await page.locator('#launch-settings').click()
  await expect(page.locator('#environment-art')).toBeDisabled()
  await expect(page.locator('#environment-art')).toHaveValue('2d')
  await expect(page.locator('#environment-art-status')).toContainText('3D環境素材を含めていない')
  await expect(page.locator('#art-mode option[value="3d"]')).toBeDisabled()
  // A programmatic/stale selection must be guarded as well as the visible option.
  await page.locator('#environment-art').evaluate((element: HTMLSelectElement) => {
    element.value = '3d'
    element.dispatchEvent(new Event('change'))
  })
  await expect(page.locator('#environment-art')).toHaveValue('2d')
  await page.locator('#art-mode').evaluate((element: HTMLSelectElement) => {
    element.value = '3d'
    element.dispatchEvent(new Event('change'))
  })
  await expect(page.locator('#art-mode-status')).not.toContainText('切り替えられませんでした')
  await page.locator('#settings-close').click()
  await page.locator('#launch-settings').click()
  await expect(page.locator('#environment-art')).toBeDisabled()
  // Periodic status updates must not re-enable omitted art after reopening settings.
  await page.waitForTimeout(1200)
  await expect(page.locator('#environment-art')).toBeDisabled()
  await expect(page.locator('#art-mode option[value="3d"]')).toBeDisabled()
  await expect(page.locator('#environment-art option[value="3d"]')).toBeDisabled()
  await expect(page.locator('#environment-art-status')).toHaveAttribute('data-status', 'unavailable')
  await expect(page.locator('#environment-art-status')).toContainText('3D環境素材を含めていない')
  expect(environmentRequests).toEqual([])
})
