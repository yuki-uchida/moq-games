import { test, expect, type Page } from '@playwright/test'
import { towerPath, dragUnitToWorld, openOfflineCampaign } from './tower-defense-e2e-arrange'
import { getField, stageRules } from '../examples/games/tower_diffence_with_jev/src/game/model'

const diagnostics = (page: Page) => page.evaluate(() => (window as any).towerDefenseDiagnostics())
// Character bodies are procedural sprite stacks; no unit model, body sheet or portrait is fetched.
const characterAsset =
  /\/models\/|\/(?:soldier|archer|runner|tank|mage|healer|frost|ranger|cannon|paladin|slime|goblin|wolf|beetle|shaman|brute|bat|wraith|ogre|dragon|crystalSentinel|koboldLancer|clockworkPatchling|commander|title)\/[^/]+\.(?:glb|json|png)(?:\?|$)/

function watchCharacterAssets(page: Page): string[] {
  const requests: string[] = []
  page.on('request', (request) => {
    if (characterAsset.test(request.url())) requests.push(request.url())
  })
  return requests
}

async function restore(page: Page, raw: string) {
  await page.goto(towerPath)
  await page.evaluate((value) => localStorage.setItem('tower-jev-v3', value), raw)
  await page.reload()
  await expect(page.locator('#title-continue')).toBeEnabled()
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
}

test('normal game draws sprite-stacked figures without fetching any character asset and restores them', async ({
  page
}) => {
  const requests = watchCharacterAssets(page)
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await openOfflineCampaign(page)
  await expect.poll(async () => (await diagnostics(page)).assetStatus, { timeout: 90_000 }).toBe('ready')
  await dragUnitToWorld(page, 'soldier', getField('meadow', 2, 4).slots[0])
  await expect(page.locator('.unit-health[data-owner="player"]')).toHaveAttribute('data-art-source', 'sprite-stack')
  const placed = await diagnostics(page)
  expect(placed.modelRendering.renderer).toBe('sprite-stack')
  expect(
    placed.modelRendering.units.some((unit: any) => unit.type === 'soldier' && unit.visible && unit.slices > 0)
  ).toBe(true)
  expect(placed.campaignPreparation.ready).toBe(true)
  // Portraits are painted from the same figures.
  expect(await page.locator('#unit-soldier img').getAttribute('src')).toMatch(/^data:image\/png/)
  await page.goBack()
  await expect(page.locator('#title-screen')).toBeVisible()
  await page.reload()
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  await expect(page.locator('.unit-health[data-owner="player"]')).toHaveAttribute('data-art-source', 'sprite-stack', {
    timeout: 90_000
  })
  await page.locator('#assault').click()
  await expect(page.locator('#phase')).toContainText('襲撃')
  await expect.poll(async () => (await diagnostics(page)).simulationTime).toBeGreaterThan(1)
  const after = await diagnostics(page)
  expect(after.modelRendering.errors).toEqual({})
  expect(after.assetErrors).toEqual({})
  expect(requests).toEqual([])
  expect(failures).toEqual([])
  await page.screenshot({ path: test.info().outputPath('normal-game-sprite-stack.png') })
})

// One saved stage-4 encounter holds all three new enemies, so a single restore covers them.
test('normal game restores and renders a saved crystalSentinel, koboldLancer and clockworkPatchling encounter', async ({
  page
}) => {
  const roles = ['crystalSentinel', 'koboldLancer', 'clockworkPatchling'] as const
  const { GameEngine } = await import('../examples/games/tower_diffence_with_jev/src/game/GameEngine')
  const { freshSave } = await import('../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem')
  const { saveCampaignCheckpoint } = await import(
    '../examples/games/tower_diffence_with_jev/src/progression/CampaignStorage'
  )
  const { validateCampaignCheckpoint } = await import(
    '../examples/games/tower_diffence_with_jev/src/game/CampaignCheckpoint'
  )
  const save = freshSave()
  save.highestStage = 3
  const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0, undefined, 2, 4)
  engine.state.stage = engine.state.stageSummary.stage = 4
  engine.state.previousStageSummary = {
    ...engine.state.stageSummary,
    stage: 3,
    spawned: stageRules(3).enemyCount,
    resolved: stageRules(3).enemyCount
  }
  ;(engine as any).history.reset(engine.state)
  expect(engine.place('soldier', getField('meadow', 2, 4).slots.at(-1)!)).toBe(true)
  expect(engine.startAssault()).toBe(true)
  for (const role of roles)
    for (let tick = 0; !engine.applyAIAction({ type: 'spawn', unitType: role, routeId: 'left' }); tick++) {
      expect(tick, `spawn ${role}`).toBeLessThan(500)
      engine.update(0.02)
    }
  let stored = ''
  expect(
    saveCampaignCheckpoint(save, engine.exportCheckpoint(), validateCampaignCheckpoint, {
      setItem: (_key, value) => {
        stored = value
      }
    })
  ).toBe(true)
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  const requests = watchCharacterAssets(page)
  await restore(page, stored)
  for (const role of roles)
    await expect
      .poll(
        async () =>
          (await diagnostics(page)).modelRendering.units.some(
            (unit: any) => unit.type === role && unit.visible && unit.slices > 0
          ),
        { timeout: 90_000, message: role }
      )
      .toBe(true)
  await page.screenshot({ path: test.info().outputPath('new-enemies-sprite-stack.png') })
  expect(requests).toEqual([])
  expect(failures).toEqual([])
})

test('a fallen ally stays down at full opacity and is restored fallen by Continue', async ({ page }) => {
  const { GameEngine } = await import('../examples/games/tower_diffence_with_jev/src/game/GameEngine')
  const { freshSave } = await import('../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem')
  const save = freshSave()
  const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0, undefined, 2, 4)
  expect(engine.place('soldier', getField('meadow', 2, 4).slots[0])).toBe(true)
  engine.state.units[0].hp = 1
  expect(engine.startAssault()).toBe(true)
  expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime', routeId: 'left' })).toBe(true)
  engine.update(0.05)
  const checkpoint = engine.exportCheckpoint()!
  const raw = JSON.stringify({
    version: 3,
    profile: checkpoint.profile,
    run: { version: 1, progress: checkpoint.progress, engine: checkpoint }
  })
  await restore(page, raw)
  await expect(page.locator('.unit-health.player')).toBeVisible()
  let diedAt: number | undefined
  await expect
    .poll(
      async () => {
        const state = await diagnostics(page)
        const ally = state.modelRendering.units.find((unit: any) => unit.type === 'soldier')
        if (ally?.motion === 'death') diedAt ??= state.simulationTime
        return diedAt !== undefined && state.simulationTime - diedAt >= 2
      },
      { timeout: 150_000, intervals: [250] }
    )
    .toBe(true)
  const ally = (await diagnostics(page)).modelRendering.units.find((unit: any) => unit.type === 'soldier')
  expect(ally).toMatchObject({ visible: true, motion: 'death', opacity: 1 })
  await expect(page.locator('.defender-handle')).toBeHidden()
  await expect(page.locator('.unit-health.player')).toBeHidden()
  await page.screenshot({ path: test.info().outputPath('fallen-ally.png') })
  await page.goBack()
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  await expect
    .poll(
      async () =>
        (await diagnostics(page)).modelRendering.units.filter(
          (unit: any) => unit.type === 'soldier' && unit.motion === 'death'
        ).length
    )
    .toBe(1)
  await expect(page.locator('.unit-health.player')).toBeHidden()
})

test('a missing normal attack effect cannot finish preparation and retries without replacing the save', async ({
  page
}) => {
  let failed = true
  await page.route('**/effects/arrow.png', (route) =>
    failed ? route.fulfill({ status: 503, body: 'retry' }) : route.continue()
  )
  await page.goto(towerPath)
  await page.locator('#title-new').click()
  await page.locator('#start').click()
  await expect(page.locator('#campaign-loading-retry')).toBeVisible({ timeout: 180_000 })
  expect((await diagnostics(page)).campaignPreparation.ready).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('tower-jev-v3'))).toBeNull()
  await page.locator('#campaign-loading-cancel').click()
  await expect(page.locator('#title-screen')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('tower-jev-v3'))).toBeNull()
  await page.locator('#title-new').click()
  await page.locator('#start').click()
  await expect(page.locator('#campaign-loading-retry')).toBeVisible({ timeout: 180_000 })
  failed = false
  await page.locator('#campaign-loading-retry').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  expect((await diagnostics(page)).campaignPreparation.ready).toBe(true)
})

test('a restored WebGL context prepares the figures again', async ({ page }) => {
  await openOfflineCampaign(page)
  await page
    .locator('#field canvas')
    .first()
    .evaluate((canvas: HTMLCanvasElement) => {
      const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!
      extension.loseContext()
      setTimeout(() => extension.restoreContext(), 300)
    })
  await expect(page.locator('#campaign-loading')).toBeVisible()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  expect((await diagnostics(page)).campaignPreparation.ready).toBe(true)
  await dragUnitToWorld(page, 'soldier', getField('meadow', 2, 4).slots[0])
  await expect(page.locator('.unit-health[data-owner="player"]')).toHaveAttribute('data-art-source', 'sprite-stack')
})
