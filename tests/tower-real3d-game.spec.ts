import { test, expect } from '@playwright/test'
import { towerPath, dragUnitToWorld } from './tower-defense-e2e-arrange'
import { getField } from '../examples/games/tower_diffence_with_jev/src/game/model'

test('normal game uses lazy real meshes, ignores legacy art flags and restores a saved mesh formation', async ({
  page
}) => {
  const models: string[] = [],
    bodySheets: string[] = [],
    failures: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.endsWith('.glb')) models.push(url)
    // Jev's decorative commander is not one of the 20 simulated/model-catalog unit roles.
    // Allow only its exact presentation atlas; every gameplay body sheet remains forbidden.
    const commanderPresentation = /\/commander\/monster_commander-idle-e\.(json|png)(?:\?.*)?$/.test(url)
    if (!commanderPresentation && /-(idle|walk|attack|death)-(n|ne|e|se|s|sw|w|nw)\.(json|png)/.test(url))
      bodySheets.push(url)
  })
  page.on('pageerror', (error) => failures.push(error.message))
  await page.goto(`${towerPath}?soldier-art=2d&slime-art=2d`)
  await expect(page.locator('#title-screen')).toBeVisible()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  )
  expect(models).toEqual([])
  const titleGpu = await page.evaluate(() => (window as any).towerDefenseDiagnostics().gpu)
  expect(titleGpu.frames).toBe(0)
  expect(titleGpu.programs).toBe(0)
  expect(await page.evaluate(() => (window as any).towerDefenseDiagnostics().modelEnvironment.generations)).toBe(0)
  expect(await page.evaluate(() => (window as any).towerDefenseDiagnostics().frame)).toBe(0)
  await page.locator('#title-new').click()
  await page.locator('#launch-settings').click()
  await expect(page.locator('.trial-art-tools')).toBeHidden()
  await expect(page.locator('.enemy-trial-art-tools')).toBeHidden()
  await page.locator('#settings-close').click()
  await page.locator('[data-field="meadow"]').click()
  await page.locator('#offline-start').click()
  await expect
    .poll(() => page.evaluate(() => (window as any).towerDefenseDiagnostics().assetStatus), { timeout: 90000 })
    .toBe('ready')
  await dragUnitToWorld(page, 'soldier', getField('meadow', 2, 4).slots[0])
  await expect(page.locator('.unit-health[data-owner="player"]')).toHaveAttribute('data-art-source', 'gltf-mesh')
  await expect(page.locator('.defender-handle').first()).toBeVisible()
  const diagnostic = await page.evaluate(() => (window as any).towerDefenseDiagnostics())
  expect(
    diagnostic.modelRendering.units.some((unit: any) => unit.type === 'soldier' && unit.meshes > 0 && unit.visible)
  ).toBe(true)
  expect(models.length).toBeGreaterThan(0)
  expect(diagnostic.modelEnvironment).toEqual({ ready: true, intensity: 0.25, generations: 1 })
  expect(diagnostic.gpu.frames).toBeGreaterThan(0)
  expect(diagnostic.gpu.programs).toBeGreaterThan(0)
  expect(diagnostic.modelRendering.cache.entries.every((entry: any) => entry.loadMs >= 0)).toBe(true)
  expect(models.every((url) => /\/(soldier|slime|goblin|shaman)\//.test(url))).toBe(true)
  expect(bodySheets).toEqual([])
  await page.locator('#game-title-return').click()
  await expect(page.locator('#title-screen')).toBeVisible()
  await page.reload()
  await page.locator('#title-continue').click()
  await expect(page.locator('.unit-health[data-owner="player"]')).toHaveAttribute('data-art-source', 'gltf-mesh', {
    timeout: 90000
  })
  await page.locator('#assault').click()
  await expect(page.locator('#phase')).toContainText('襲撃')
  await expect
    .poll(() => page.evaluate(() => (window as any).towerDefenseDiagnostics().simulationTime))
    .toBeGreaterThan(1)
  const after = await page.evaluate(() => (window as any).towerDefenseDiagnostics())
  expect(after.modelEnvironment).toEqual({ ready: true, intensity: 0.25, generations: 1 })
  expect(after.modelRendering.errors).toEqual({})
  expect(after.assetErrors).toEqual({})
  expect(bodySheets).toEqual([])
  expect(failures).toEqual([])
  await page.screenshot({ path: test.info().outputPath('normal-game-real3d.png') })
})

test('EXTRA shares the weak model IBL once across model switches and releases it on pagehide', async ({ page }) => {
  const failures: string[] = []
  const environmentRequests: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('request', (request) => {
    if (/\.(hdr|exr)(\?|$)|RoomEnvironment/.test(request.url())) environmentRequests.push(request.url())
  })
  await page.goto('/moq-games/examples/games/tower_diffence_with_jev/extra.html')
  for (const role of ['tank', 'ogre', 'mage']) {
    await page.locator('#viewer-role').selectOption(role)
    await expect
      .poll(() => page.evaluate(() => (window as any).__extraViewerDiagnostics?.().state), { timeout: 90000 })
      .toBe('ready')
    expect(await page.evaluate(() => (window as any).__extraViewerDiagnostics().modelEnvironment)).toEqual({
      ready: true,
      intensity: 0.25,
      generations: 1
    })
  }
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  expect(await page.evaluate(() => (window as any).__extraViewerDiagnostics().modelEnvironment.ready)).toBe(false)
  expect(failures).toEqual([])
  expect(environmentRequests).toEqual([])
})
