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
    const observed = new Set<string>()
    let attackFrames = 0
    for (let i = 0; i < (role === 'wolf' ? 12 : 300); i++) {
      const d = await page.evaluate(() => (window as any).towerDefenseDiagnostics())
      for (const u of d.modelRendering.units) {
        if (u.type !== role || !u.visible || u.meshes <= 0) continue
        observed.add(u.motion)
        if (u.motion === 'attack' && attackFrames < 4) {
          await page.screenshot({ path: info.outputPath(`${role}-attack-${attackFrames++}.png`) })
        }
      }
      expect(d.modelRendering.errors).toEqual({})
      if (i === 0 || i === 4 || i === 11) await page.screenshot({ path: info.outputPath(`${role}-game-${i}.png`) })
      if (role !== 'wolf' && observed.has('walk') && attackFrames >= 1) break
      await page.waitForTimeout(100)
    }
    await info.attach('game-diagnostics', {
      body: JSON.stringify(await page.evaluate(() => (window as any).towerDefenseDiagnostics())),
      contentType: 'application/json'
    })
    expect(observed.has('walk'), `${role}: observed ${[...observed].join(',')}`).toBe(true)
    if (role !== 'wolf') expect(observed.has('attack'), `${role}: attack was actually played`).toBe(true)
    expect(errors).toEqual([])
    await info.attach('observed-motions', { body: JSON.stringify([...observed]), contentType: 'application/json' })
  })
}

test.afterEach(async ({ page }, info) => {
  if (page.isClosed()) return
  const diagnostics = await page.evaluate(() => (window as any).towerDefenseDiagnostics?.()).catch(() => undefined)
  await writeFile(info.outputPath('game-diagnostics.json'), JSON.stringify(diagnostics ?? {}, null, 2))
})
