import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { towerPath } from './tower-defense-e2e-arrange'
import { GameEngine } from '../examples/games/tower_diffence_with_jev/src/game/GameEngine'
import { freshSave } from '../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem'
import { getField, stageRules } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { saveCampaignCheckpoint } from '../examples/games/tower_diffence_with_jev/src/progression/CampaignStorage'
import { validateCampaignCheckpoint } from '../examples/games/tower_diffence_with_jev/src/game/CampaignCheckpoint'

for (const role of ['wolf', 'brute', 'ogre'] as const) {
  test(`${role}: repaired model plays in a restored real game encounter`, async ({ page }, info) => {
    const save = freshSave()
    save.highestStage = (role === 'wolf' ? 2 : role === 'brute' ? 5 : 8) - 1
    const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0, undefined, 2, 4)
    const stage = role === 'wolf' ? 2 : role === 'brute' ? 5 : 8
    engine.state.stage = engine.state.stageSummary.stage = stage
    engine.state.previousStageSummary = {
      ...engine.state.stageSummary,
      stage: stage - 1,
      spawned: stageRules(stage - 1).enemyCount,
      resolved: stageRules(stage - 1).enemyCount
    }
    ;(engine as any).history.reset(engine.state)
    expect(engine.place('soldier', getField('meadow', 2, 4).slots[2])).toBe(true)
    expect(engine.startAssault()).toBe(true)
    expect(engine.applyAIAction({ type: 'spawn', unitType: role, routeId: 'left' })).toBe(true)
    // Advance real simulation until the requested unit walks, then save its real checkpoint.
    for (let i = 0; i < 20; i++) engine.update(0.02)
    let stored = ''
    expect(
      saveCampaignCheckpoint(save, engine.exportCheckpoint(), validateCampaignCheckpoint, {
        setItem: (_key, value) => {
          stored = value
        }
      })
    ).toBe(true)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(towerPath)
    await page.evaluate((raw) => localStorage.setItem('tower-jev-v3', raw), stored)
    await page.reload()
    // Observe completed render frames in the page, independently of slow driver
    // screenshots. Capture the canvas synchronously in that same attack frame.
    await page.evaluate((role) => {
      const w = window as any
      const review = (w.__proximalFrameReview = {
        motions: [] as string[],
        samples: [] as any[],
        captures: {} as any,
        errors: {}
      })
      let lastFrame = -1
      function observe() {
        const d = w.towerDefenseDiagnostics?.()
        const loading = document.querySelector<HTMLDialogElement>('#campaign-loading')?.open
        const title = document.querySelector<HTMLDialogElement>('#title-screen')?.open
        if (d?.gpu.frames > 0 && d.gpu.frames !== lastFrame && !loading && !title) {
          lastFrame = d.gpu.frames
          Object.assign(review.errors, d.modelRendering.errors)
          for (const u of d.modelRendering.units) {
            if (u.type !== role || !u.visible || u.meshes <= 0) continue
            if (!review.motions.includes(u.motion)) review.motions.push(u.motion)
            const sample = { frame: lastFrame, simulationTime: d.simulationTime, motion: u.motion, seconds: u.seconds }
            if (review.samples.length < 1200) review.samples.push(sample)
            const capturePhase = u.motion === 'walk' || (u.motion === 'attack' && u.seconds >= 0.2 && u.seconds <= 0.9)
            if (capturePhase && !review.captures[u.motion]) {
              const canvas = document.querySelector<HTMLCanvasElement>('#field canvas')
              if (canvas) review.captures[u.motion] = { ...sample, png: canvas.toDataURL('image/png') }
            }
          }
        }
        requestAnimationFrame(observe)
      }
      requestAnimationFrame(observe)
    }, role)
    await expect(page.locator('#title-continue')).toBeEnabled()
    await page.locator('#title-continue').click()
    await expect
      .poll(
        () =>
          page.evaluate(
            (role) =>
              (window as any)
                .towerDefenseDiagnostics()
                .modelRendering.units.some((u: any) => u.type === role && u.visible && u.meshes > 0),
            role
          ),
        { timeout: 300000 }
      )
      .toBe(true)
    await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 300000 })
    // Regression coverage: let the driver wait across an entire attack window.
    // The in-page observer must retain the actual rendered attack and its PNG.
    if (role !== 'wolf') await page.waitForTimeout(8000)
    await expect
      .poll(
        () =>
          page.evaluate((role) => {
            const r = (window as any).__proximalFrameReview
            return Boolean(r.captures.walk && (role === 'wolf' || r.captures.attack))
          }, role),
        { timeout: 60000, intervals: [100] }
      )
      .toBe(true)
    const review = await page.evaluate(() => (window as any).__proximalFrameReview)
    expect(review.errors).toEqual({})
    for (const motion of role === 'wolf' ? ['walk'] : ['walk', 'attack']) {
      const capture = review.captures[motion]
      expect(capture.frame).toBeGreaterThan(0)
      if (motion === 'attack') {
        expect(capture.seconds).toBeGreaterThanOrEqual(0.2)
        expect(capture.seconds).toBeLessThanOrEqual(0.9)
      }
      const bytes = Buffer.from(capture.png.split(',')[1], 'base64')
      expect(bytes.byteLength).toBeGreaterThan(10000)
      const path = info.outputPath(`${role}-${motion}-rendered.png`)
      await writeFile(path, bytes)
      await info.attach(`${role}-${motion}-rendered`, { path, contentType: 'image/png' })
    }
    await info.attach('rendered-motion-samples', {
      body: JSON.stringify(review.samples),
      contentType: 'application/json'
    })
    await info.attach('game-diagnostics', {
      body: JSON.stringify(await page.evaluate(() => (window as any).towerDefenseDiagnostics())),
      contentType: 'application/json'
    })
    expect(review.motions, `${role}: rendered walk`).toContain('walk')
    if (role !== 'wolf') expect(review.motions, `${role}: attack was actually rendered`).toContain('attack')
    expect(errors).toEqual([])
    await info.attach('observed-motions', { body: JSON.stringify(review.motions), contentType: 'application/json' })
    // Full-page evidence is useful, but must not block motion observation.
    await page.screenshot({ path: info.outputPath(`${role}-game-final.png`) })
  })
}

test.afterEach(async ({ page }, info) => {
  if (page.isClosed()) return
  const diagnostics = await page.evaluate(() => (window as any).towerDefenseDiagnostics?.()).catch(() => undefined)
  await writeFile(info.outputPath('game-diagnostics.json'), JSON.stringify(diagnostics ?? {}, null, 2))
})
