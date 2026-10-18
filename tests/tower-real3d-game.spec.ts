import { test, expect } from '@playwright/test'
import {
  towerPath,
  dragUnitToWorld,
  beginUnitDragToWorld,
  openOfflineCampaign,
  selectFieldUnit,
  pointOnVisibleMap
} from './tower-defense-e2e-arrange'
import { getField, DEFINITIONS } from '../examples/games/tower_diffence_with_jev/src/game/model'

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
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
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
  expect(models.every((url) => /\/effects\/special\//.test(url) || Object.keys(DEFINITIONS).some((type) => url.includes(`/${type}/`)))).toBe(true)
  expect(diagnostic.campaignPreparation.ready).toBe(true)
  expect(diagnostic.campaignPreparation.completed).toBe(81)
  expect(bodySheets).toEqual([])
  await page.locator('#game-title-return').click()
  await expect(page.locator('#title-screen')).toBeVisible()
  await page.reload()
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
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
    await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
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
  await page.goto(towerPath)
  await page.locator('#title-new').click()
  await page.locator('#offline-start').click()
  await expect(page.locator('#campaign-loading')).toBeVisible()
  expect(await page.evaluate(() => (window as any).towerDefenseDiagnostics().campaignPreparation.ready)).toBe(false)
  const gold = await page.locator('#gold').textContent()
  await page.locator('#deck-toggle').evaluate((element: HTMLButtonElement) => element.click())
  await expect(page.locator('.unit-health[data-owner="player"]')).toHaveCount(0)
  expect(await page.locator('#gold').textContent()).toBe(gold)
  release()
  await expect(page.locator('#launch')).toBeHidden({ timeout: 180_000 })
  await page.locator('#deck-toggle').click()
  await expect(page.locator('#unit-archer')).toBeEnabled()
  const requested = requests.filter((url) => url.includes('/archer/'))
  expect(requested).toHaveLength(3)
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
  expect(requests.every((url) => /\/effects\/special\//.test(url) || Object.keys(DEFINITIONS).some((type) => url.includes(`/${type}/`)))).toBe(true)
  await page.screenshot({ path: test.info().outputPath('first-visible-placement.png') })
})

test('resumed assault prepares the first soldier death fade before its visible frame', async ({ page }) => {
  // Keep the real clock-worker protocol, but release one 20ms pulse per rendered
  // frame. A software GPU may otherwise catch up 2s and skip the entire .45s fade.
  await page.route('**/assets/worker-*.js', async (route) => {
    const response = await route.fetch()
    const clock = `(() => {
      let now = performance.timeOrigin + performance.now(), serial = 0;
      const timers = new Map();
      Object.defineProperty(performance, 'now', { value: () => now - performance.timeOrigin });
      self.setTimeout = (callback, delay = 0) => {
        const id = ++serial; timers.set(id, { callback, due: now + delay }); return id;
      };
      self.clearTimeout = id => timers.delete(id);
      self.addEventListener('message', event => {
        const message = event.data;
        if (message.__fadeClockStart !== undefined) now = message.__fadeClockStart;
        if (message.__fadeClockAdvance === undefined) return;
        event.stopImmediatePropagation();
        now += message.__fadeClockAdvance;
        for (const [id, timer] of [...timers]) if (timer.due <= now + 1e-6) {
          timers.delete(id); timer.callback();
        }
        self.postMessage({ __fadeClockAdvanced: message.token });
      });
    })();`
    await route.fulfill({ response, body: clock + '\n' + (await response.text()) })
  })

  await page.addInitScript(() => {
    const w = window as any
    w.__deathFadeProbe = { links: [], fades: [] }
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        if (/\/assets\/worker-[^/]+\.js$/.test(String(url))) w.__deathFadeClock = this
      }
      postMessage(message: any, transfer: Transferable[] = []) {
        if (message?.type === 'start') {
          w.__deathFadePlayback = true
          w.__deathFadeProbe.readyAt = performance.now()
          w.__deathFadeProbe.prepared = w.towerDefenseDiagnostics().campaignPreparation.ready
        }
        if (message?.type === 'start')
          message = { ...message, __fadeClockStart: performance.timeOrigin + performance.now() }
        super.postMessage(message, transfer)
      }
    }

    const sources = new WeakMap<WebGLShader, string>(),
      soldier = new WeakSet<WebGLProgram>()
    const uniforms = new WeakMap<WebGLUniformLocation, { program: WebGLProgram; name: string }>()
    const proto = WebGL2RenderingContext.prototype as any
    const source = proto.shaderSource,
      attach = proto.attachShader,
      link = proto.linkProgram
    const location = proto.getUniformLocation,
      scalar = proto.uniform1f
    proto.shaderSource = function (shader: WebGLShader, text: string) {
      sources.set(shader, text)
      return source.call(this, shader, text)
    }
    proto.attachShader = function (program: WebGLProgram, shader: WebGLShader) {
      if (sources.get(shader)?.includes('soldierRestPosition')) soldier.add(program)
      return attach.call(this, program, shader)
    }
    proto.linkProgram = function (program: WebGLProgram) {
      if (soldier.has(program)) w.__deathFadeProbe.links.push(performance.now())
      return link.call(this, program)
    }
    proto.getUniformLocation = function (program: WebGLProgram, name: string) {
      const result = location.call(this, program, name)
      if (result) uniforms.set(result, { program, name })
      return result
    }
    proto.uniform1f = function (location: WebGLUniformLocation, value: number) {
      const uniform = uniforms.get(location)
      if (w.__deathFadePlayback && uniform?.name === 'opacity' && soldier.has(uniform.program) && value > 0 && value < 1)
        w.__deathFadeProbe.fades.push({ time: performance.now(), opacity: value })
      return scalar.call(this, location, value)
    }
  })
  const { GameEngine } = await import('../examples/games/tower_diffence_with_jev/src/game/GameEngine')
  const { freshSave } = await import('../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem')
  const save = freshSave()
  const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0, undefined, 2, 4)
  expect(engine.place('soldier', getField('meadow', 2, 4).slots[0])).toBe(true)
  // Isolate the same cold held-pose fade with a small real assault checkpoint.
  // The ten-actor profiling scenario stays separate from this public regression.
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
  await page.goto(towerPath)
  await page.evaluate((raw) => localStorage.setItem('tower-jev-v3', raw), raw)
  await page.reload()
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  const deadline = Date.now() + 120000
  let frames = 0
  while (Date.now() < deadline) {
    await page.evaluate(async (token) => {
      const worker = (window as any).__deathFadeClock as Worker | undefined
      if (worker)
        await new Promise<void>((resolve) => {
          const completed = (event: MessageEvent) => {
            if (event.data.__fadeClockAdvanced !== token) return
            worker.removeEventListener('message', completed)
            resolve()
          }
          worker.addEventListener('message', completed)
          worker.postMessage({ __fadeClockAdvance: 20, token })
        })
      // The tick is acknowledged after the unchanged BattleClock consumed it.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    }, frames++)
    if (await page.evaluate(() => (window as any).__deathFadeProbe.fades.length > 2)) break
  }
  const probe = await page.evaluate(() => (window as any).__deathFadeProbe)
  const diagnostic = await page.evaluate(() => (window as any).towerDefenseDiagnostics())
  await test.info().attach('death-fade-probe.json', {
    body: JSON.stringify({ probe, frames, diagnostic }, null, 2),
    contentType: 'application/json'
  })
  expect(
    probe.fades.length,
    JSON.stringify({ frames, phase: diagnostic.phase, time: diagnostic.simulationTime, links: probe.links.length })
  ).toBeGreaterThan(2)
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')
  expect(probe.links.length).toBeGreaterThan(0)
  // Completion is causal: links finish before the resumed clock starts, then the real fade draws.
  expect(probe.prepared).toBe(true)
  expect(Math.max(...probe.links)).toBeLessThanOrEqual(probe.readyAt)
  expect(probe.readyAt).toBeLessThan(probe.fades[0].time)
  expect(probe.fades[0].opacity).toBeGreaterThan(0)
  expect(probe.fades[0].opacity).toBeLessThan(1)
  await page.screenshot({ path: test.info().outputPath('resumed-first-death-fade.png') })
})

test('campaign preparation gates interaction, recovers missing assets, and cancels without saving', async ({ page }) => {
  let fail = true
  await page.route('**/models/crystalSentinel/*.glb', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200))
    if (fail) await route.fulfill({ status: 503, body: 'retry' })
    else await route.continue()
  })
  await page.goto(towerPath)
  await page.locator('#title-new').click()
  await page.locator('#offline-start').click()
  await expect(page.locator('#campaign-loading')).toBeVisible()
  await expect(page.locator('#campaign-loading-retry')).toBeVisible({ timeout: 180_000 })
  expect(await page.evaluate(() => localStorage.getItem('tower-jev-v3'))).toBeNull()
  expect(await page.locator('#campaign-loading-progress').evaluate((bar: HTMLProgressElement) => bar.value < bar.max)).toBe(true)
  await page.locator('#campaign-loading-cancel').click()
  await expect(page.locator('#title-screen')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('tower-jev-v3'))).toBeNull()
  fail = false
  await page.locator('#title-new').click()
  await page.locator('#start').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  await expect(page.locator('#launch')).toBeHidden()
  expect(await page.evaluate(() => (window as any).towerDefenseDiagnostics().campaignPreparation.ready)).toBe(true)
})

test('same-session Title, Continue and New game retain the completed campaign preparation', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => { if (/\.(glb|ultimate\.json)$/.test(request.url())) requests.push(request.url()) })
  await openOfflineCampaign(page)
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  const loaded = requests.length
  const before = await page.evaluate(() => (window as any).towerDefenseDiagnostics())
  await page.locator('#game-title-return').click()
  await expect(page.locator('#title-screen')).toBeVisible()
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  await expect(page.locator('#title-screen')).toBeHidden()
  await expect(page.locator('#field')).toHaveAttribute('data-layout-revision', '4')
  await page.locator('#game-title-return').click()
  await page.locator('#title-new').click()
  await page.locator('#start').click()
  await page.locator('#save-confirm-accept').click()
  await expect(page.locator('#launch')).toBeHidden()
  const after = await page.evaluate(() => (window as any).towerDefenseDiagnostics())
  expect(after.campaignPreparation).toEqual(before.campaignPreparation)
  expect(after.modelRendering.cache.residentBytes).toBe(before.modelRendering.cache.residentBytes)
  expect(requests.length).toBe(loaded)
})

test('restored WebGL context prepares GPU resources again without re-fetching model sources', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => { if (/\.(glb|ultimate\.json)$/.test(request.url())) requests.push(request.url()) })
  await openOfflineCampaign(page)
  const loaded = requests.length
  const generations = await page.evaluate(() => (window as any).towerDefenseDiagnostics().modelEnvironment.generations)
  await page.locator('#field canvas').first().evaluate((canvas: HTMLCanvasElement) => {
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!
    extension.loseContext()
    setTimeout(() => extension.restoreContext(), 300)
  })
  await expect(page.locator('#campaign-loading')).toBeVisible()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  const diagnostics = await page.evaluate(() => (window as any).towerDefenseDiagnostics())
  expect(diagnostics.campaignPreparation.ready).toBe(true)
  expect(diagnostics.modelEnvironment.generations).toBe(generations + 1)
  expect(requests.length).toBe(loaded)
})

test('a missing normal attack effect cannot finish preparation and retries without replacing the save', async ({ page }) => {
  let failed = true
  await page.route('**/effects/arrow.png', (route) => failed ? route.fulfill({ status: 503, body: 'retry' }) : route.continue())
  await page.goto(towerPath)
  await page.locator('#title-new').click()
  await page.locator('#offline-start').click()
  await expect(page.locator('#campaign-loading-retry')).toBeVisible({ timeout: 180_000 })
  expect(await page.evaluate(() => (window as any).towerDefenseDiagnostics().campaignPreparation.ready)).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('tower-jev-v3'))).toBeNull()
  failed = false
  await page.locator('#campaign-loading-retry').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  expect(await page.evaluate(() => (window as any).towerDefenseDiagnostics().campaignPreparation.ready)).toBe(true)
})
