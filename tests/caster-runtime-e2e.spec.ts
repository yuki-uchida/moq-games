import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { GameEngine } from '../examples/games/tower_diffence_with_jev/src/game/GameEngine'
import { freshSave } from '../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem'
import { saveCampaignCheckpoint } from '../examples/games/tower_diffence_with_jev/src/progression/CampaignStorage'
import { validateCampaignCheckpoint } from '../examples/games/tower_diffence_with_jev/src/game/CampaignCheckpoint'
import { getField } from '../examples/games/tower_diffence_with_jev/src/game/model'
const roles = ['mage', 'frost', 'healer'] as const
for (const role of roles)
  test(`EXTRA ${role} playback and eight directions`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/moq-games/examples/games/tower_diffence_with_jev/extra.html')
    await page.locator('#viewer-role').selectOption(role)
    for (const motion of ['idle', 'walk', role === 'healer' ? 'heal' : 'attack']) {
      await page.locator('#viewer-motion').selectOption(motion)
      await expect.poll(() => page.evaluate(() => (window as any).__extraViewerDiagnostics().state)).toBe('ready')
      await page.locator('#viewer-restart').click()
      if (await page.evaluate(() => (window as any).__extraViewerDiagnostics().paused))
        await page.locator('#viewer-play').click()
      const samples = []
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(160)
        samples.push(await page.evaluate(() => (window as any).__extraViewerDiagnostics()))
        await page.screenshot({ path: info.outputPath(`${motion}-play-${i}.png`) })
      }
      for (let direction = 0; direction < 8; direction++) {
        await page.locator('#viewer-timeline').evaluate((el: any) => {
          el.value = String(Number(el.max) * 0.55)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        })
        await page.locator('#viewer-canvas').focus()
        await page.keyboard.press('ArrowRight')
        await page.screenshot({ path: info.outputPath(`${motion}-direction-${direction}.png`) })
      }
      fs.writeFileSync(info.outputPath(`${motion}-playback.json`), JSON.stringify(samples, null, 2))
      expect(samples.every((s: any) => s.actor.meshes > 0)).toBe(true)
      expect(samples.some((s: any) => s.seconds > 0)).toBe(true)
    }
    expect(errors).toEqual([])
  })
test('live game restores and renders caster formation', async ({ page }, info) => {
  const save = freshSave()
  save.economyVersion = 2
  save.gold = 120
  save.purchased = [...save.purchased, ...roles.filter((r) => !save.purchased.includes(r))]
  const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0, undefined, 2, 4)
  for (const role of ['mage', 'healer', 'frost'] as const) {
    const point = getField('meadow', 2, 4).slots.find((p) => engine.previewPlacement(role, p).valid)
    expect(
      point,
      JSON.stringify(getField('meadow', 2, 4).slots.map((p) => engine.previewPlacement(role, p).reason))
    ).toBeTruthy()
    expect(engine.place(role, point!)).toBe(true)
  }
  engine.state.units[0].hp -= 20
  expect(engine.startAssault()).toBe(true)
  engine.update(1 / 60)
  expect(engine.applyAIAction({ type: 'spawn', unitType: 'goblin', routeId: 'left' })).toBe(true)
  let stored = ''
  expect(
    saveCampaignCheckpoint(save, engine.exportCheckpoint(), validateCampaignCheckpoint, {
      setItem: (_k, v) => {
        stored = v
      }
    })
  ).toBe(true)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/moq-games/examples/games/tower_diffence_with_jev/index.html')
  await page.evaluate((raw) => localStorage.setItem('tower-jev-v3', raw), stored)
  await page.reload()
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180000 })
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any)
            .towerDefenseDiagnostics()
            .modelRendering.units.filter(
              (u: any) => ['mage', 'frost', 'healer'].includes(u.type) && u.visible && u.meshes > 0
            ).length
      )
    )
    .toBe(3)
  const samples = []
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(150)
    samples.push(await page.evaluate(() => (window as any).towerDefenseDiagnostics()))
    await page.screenshot({ path: info.outputPath(`game-${i}.png`) })
  }
  fs.writeFileSync(info.outputPath('game-playback.json'), JSON.stringify(samples, null, 2))
  expect(
    samples.some((s: any) => s.modelRendering.units.some((u: any) => u.type === 'healer' && u.motion === 'heal'))
  ).toBe(true)
  expect(errors).toEqual([])
})
