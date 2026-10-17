import { test, expect } from '@playwright/test'
import {
  towerPath,
  dragUnitToWorld,
  beginUnitDragToWorld,
  openOfflineCampaign,
  selectFieldUnit,
  pointOnVisibleMap
} from './tower-defense-e2e-arrange'
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
  // Preparation uses the placed actor's real motion rigs while its idle pose stays visible.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const unit = (window as any)
          .towerDefenseDiagnostics()
          .modelRendering.units.find((unit: any) => unit.type === 'soldier')
        return unit?.rigs
      })
    )
    .toBe(4)
  expect(
    await page.evaluate(() => {
      const unit = (window as any)
        .towerDefenseDiagnostics()
        .modelRendering.units.find((unit: any) => unit.type === 'soldier')
      return { visible: unit.visible, motion: unit.motion, seconds: unit.seconds }
    })
  ).toEqual({ visible: true, motion: 'idle', seconds: 0 })
  expect(models.length).toBeGreaterThan(0)
  expect(diagnostic.modelEnvironment).toEqual({ ready: true, intensity: 0.5, generations: 1 })
  expect(diagnostic.gpu.frames).toBeGreaterThan(0)
  expect(diagnostic.gpu.programs).toBeGreaterThan(0)
  const loadedEntries = diagnostic.modelRendering.cache.entries.filter((entry: any) => entry.state === 'ready')
  expect(loadedEntries.length).toBeGreaterThan(0)
  expect(loadedEntries.every((entry: any) => entry.loadMs >= 0)).toBe(true)
  expect(
    models.every(
      (url) =>
        /\/(soldier|archer|runner|tank|slime|goblin|shaman)\//.test(url) ||
        /\/effects\/special\/(soldier|archer|runner|tank|mage|healer|frost|ranger|cannon|paladin)\.glb$/.test(url)
    )
  ).toBe(true)
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
  expect(after.modelEnvironment).toEqual({ ready: true, intensity: 0.5, generations: 1 })
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
    if (/\.(hdr|exr)(\?|$)/.test(request.url())) environmentRequests.push(request.url())
  })
  await page.goto('/moq-games/examples/games/tower_diffence_with_jev/extra.html')
  const roles = await page
    .locator('#viewer-role option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
  expect(roles).toHaveLength(23)
  expect(roles).toEqual(expect.arrayContaining(['crystalSentinel', 'koboldLancer', 'clockworkPatchling']))
  for (const role of roles) {
    await page.locator('#viewer-role').selectOption(role)
    await expect
      .poll(() => page.evaluate(() => (window as any).__extraViewerDiagnostics?.().state), { timeout: 90000 })
      .toBe('ready')
    expect(await page.evaluate(() => (window as any).__extraViewerDiagnostics().modelEnvironment)).toEqual({
      ready: true,
      intensity: 0.25,
      generations: 1
    })
    const motions = await page
      .locator('#viewer-motion option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
    expect(motions).toEqual(expect.arrayContaining(['idle', 'walk', role === 'healer' ? 'heal' : 'attack']))
    for (const motion of motions) {
      await page.locator('#viewer-motion').selectOption(motion)
      await expect.poll(() => page.evaluate(() => (window as any).__extraViewerDiagnostics().state)).toBe('ready')
      await page.locator('#viewer-timeline').evaluate((element) => {
        const input = element as HTMLInputElement
        input.value = String(Number(input.max) / 2)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      const diagnostic = await page.evaluate(() => (window as any).__extraViewerDiagnostics())
      expect(diagnostic.role).toBe(role)
      expect(diagnostic.motion).toBe(motion)
      expect(diagnostic.actor.meshes).toBeGreaterThan(0)
      expect(diagnostic.actor.triangles).toBeGreaterThan(100)
      await page.locator('#viewer-canvas').focus()
      await page.keyboard.press('ArrowRight')
    }
  }
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  expect(await page.evaluate(() => (window as any).__extraViewerDiagnostics().modelEnvironment.ready)).toBe(false)
  expect(failures).toEqual([])
  expect(environmentRequests).toEqual([])
})

for (const role of ['crystalSentinel', 'koboldLancer', 'clockworkPatchling'] as const) {
  test(`normal game restores and renders a saved ${role} encounter`, async ({ page }) => {
    const { GameEngine } = await import('../examples/games/tower_diffence_with_jev/src/game/GameEngine')
    const { freshSave } = await import('../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem')
    const { stageRules } = await import('../examples/games/tower_diffence_with_jev/src/game/model')
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
    expect(engine.applyAIAction({ type: 'spawn', unitType: role, routeId: 'left' })).toBe(true)
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
    await page.goto(towerPath)
    await page.evaluate((raw) => localStorage.setItem('tower-jev-v3', raw), stored)
    await page.reload()
    await expect(page.locator('#title-continue')).toBeEnabled()
    await page.locator('#title-continue').click()
    await expect
      .poll(
        () =>
          page.evaluate((type) => {
            const units = (window as any).towerDefenseDiagnostics().modelRendering.units
            return units.some((unit: any) => unit.type === type && unit.visible && unit.meshes > 0)
          }, role),
        { timeout: 90000 }
      )
      .toBe(true)
    await page.screenshot({ path: test.info().outputPath(`${role}-normal-game.png`) })
    expect(failures).toEqual([])
  })
}

test('prepares summonable models before a drag and draws a committed unit on the first frame', async ({ page }) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('.glb')) requests.push(request.url())
  })
  await page.route('**/archer/*.glb', async (route) => {
    await held
    await route.continue()
  })
  await openOfflineCampaign(page)
  await page.locator('#deck-toggle').click()
  await expect(page.locator('#unit-archer')).toBeVisible()
  await expect(page.locator('#unit-archer')).toBeDisabled()
  const gold = await page.locator('#gold').textContent()
  const target = await pointOnVisibleMap(page, getField('meadow', 2, 4).slots[0])
  const card = await page.locator('#unit-archer').boundingBox()
  expect(card).not.toBeNull()
  await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 3 })
  await page.mouse.up()
  await expect(page.locator('.unit-health[data-owner="player"]')).toHaveCount(0)
  expect(await page.locator('#gold').textContent()).toBe(gold)
  release()
  await expect(page.locator('#unit-archer')).toBeEnabled({ timeout: 90000 })
  const requested = requests.filter((url) => url.includes('/archer/'))
  expect(requested).toHaveLength(1)
  await page.evaluate(() => {
    const probe = { frames: [] as boolean[], done: false }
    ;(window as any).__placementProbe = probe
    const sample = () => {
      const units = (window as any).towerDefenseDiagnostics().modelRendering.units
      if (units.length) {
        probe.frames.push(units.every((unit: any) => unit.visible && unit.meshes > 0))
        if (probe.frames.length >= 5) {
          probe.done = true
          return
        }
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  for (const type of ['soldier', 'archer', 'runner', 'tank']) await expect(page.locator(`#unit-${type}`)).toBeEnabled()
  const programs = await page.evaluate(() => (window as any).towerDefenseDiagnostics().gpu.programs)
  await beginUnitDragToWorld(page, 'archer', getField('meadow', 2, 4).slots[0])
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  )
  expect(await page.evaluate(() => (window as any).towerDefenseDiagnostics().gpu.programs)).toBe(programs)
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => (window as any).__placementProbe.done)).toBe(true)
  expect(await page.evaluate(() => (window as any).__placementProbe.frames)).toEqual([true, true, true, true, true])
  for (const url of requested) expect(requests.filter((value) => value === url)).toHaveLength(1)
  expect(new Set(requests).size).toBe(requests.length)
  await selectFieldUnit(page, 'archer')
  await page.locator('#unit-recall').click()
  await dragUnitToWorld(page, 'archer', getField('meadow', 2, 4).slots[1])
  expect(
    await page.evaluate(() =>
      (window as any)
        .towerDefenseDiagnostics()
        .modelRendering.units.every((unit: any) => unit.visible && unit.meshes > 0)
    )
  ).toBe(true)
  for (const url of requested) expect(requests.filter((value) => value === url)).toHaveLength(1)
  expect(new Set(requests).size).toBe(requests.length)
  expect(
    requests.every(
      (url) =>
        /\/(soldier|archer|runner|tank|slime|goblin|shaman)\//.test(url) ||
        /\/effects\/special\/(soldier|archer|runner|tank|mage|healer|frost|ranger|cannon|paladin)\.glb$/.test(url)
    )
  ).toBe(true)
  await page.screenshot({ path: test.info().outputPath('first-visible-placement.png') })
})
