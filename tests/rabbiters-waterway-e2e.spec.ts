import { expect, test, type Page } from '@playwright/test'

// Chapter 3 (the waterway) end to end, started directly with ?chapter=3: the sewer opens with its objective and
// subtitles, the rabbit walks, Gama talks, the worker's torch spots a rabbit (alert overlay), the river and park
// creatures take over as the rabbit moves on, and finishing the chapter hands over to the forest.
async function withHooks(page: Page) {
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
import * as storyMap from '/src/map.ts';
window.waterwayTest = {
  state: () => JSON.parse(JSON.stringify(game.state)),
  place(x, z) { Object.assign(game.state.players[0], { x, z, y: storyMap.heightAt(x, z) }); },
  step(n) { game.state.step = n; },
  keep(...ids) { game.state.predators = game.state.predators.filter((predator) => ids.includes(predator.id)); },
  aim(id, x, z, angle) { const predator = game.state.predators.find((entry) => entry.id === id); delete predator.route; Object.assign(predator, { x, z, angle, y: storyMap.heightAt(x, z) }); },
  npc: (id) => storyMap.NPCS.find((npc) => npc.id === id),
  zone(id) { const zone = storyMap.ZONES.find((entry) => entry.id === id); return { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }; },
  info: () => ({ calls: scene.renderer.info.render.calls, triangles: scene.renderer.info.render.triangles })
};`
    })
  })
}

const hooks = <T>(page: Page, run: string) => page.evaluate<T>(`window.waterwayTest.${run}`)
const state = (page: Page) =>
  hooks<{ stage: number; step: number; players: { x: number; z: number }[]; predators: { id: string }[] }>(
    page,
    'state()'
  )
/** Renderer counters after a few frames at the current view. */
async function measure(page: Page) {
  await page.waitForTimeout(600)
  return hooks<{ calls: number; triangles: number }>(page, 'info()')
}
async function enter(page: Page, zone: string, step: number) {
  const at = await hooks<{ x: number; z: number }>(page, `zone(${JSON.stringify(zone)})`)
  await hooks(page, `place(${at.x}, ${at.z})`)
  await expect.poll(async () => (await state(page)).step).toBe(step)
}

test('waterway: sewer → river → park, with dialogue, an enemy cue and the hand-over to the forest', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await withHooks(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?chapter=3')
  await expect(page.locator('#chapter-select')).toHaveValue('2')
  await page.locator('#solo').click()

  // The sewer: title card, objective card, opening narration.
  await expect(page.locator('#title-card-title')).toHaveText('水の道')
  await expect(page.locator('#objective-title')).toContainText('第3章｜ガマ先生と話そう')
  await expect(page.locator('#subtitle-text')).toContainText('下水道は')
  await expect(page.locator('#area-name')).toHaveText('下水道')
  const spawn = await measure(page)
  await page.screenshot({ path: testInfo.outputPath('waterway-sewer.png') })

  // Walk a few steps out of the inlet pipe.
  const before = (await state(page)).players[0]
  await page.locator('#world').click({ position: { x: 640, y: 400 } })
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(900)
  await page.keyboard.up('KeyW')
  const after = (await state(page)).players[0]
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1.5)

  // Gama explains the sluice.
  const gama = await hooks<{ x: number; z: number }>(page, "npc('gama')")
  await hooks(page, `place(${gama.x}, ${gama.z - 1.4})`)
  await expect(page.locator('#subtitle')).toBeHidden({ timeout: 15_000 }) // the hint waits for the narration
  await expect(page.locator('#hint')).toContainText('E で話す（ヒキガエルのガマ先生）')
  await page.keyboard.down('KeyE')
  await expect(page.locator('#subtitle-name')).toHaveText('ヒキガエルのガマ先生', { timeout: 15_000 })
  await page.keyboard.up('KeyE')

  // The worker's torch: a rabbit lit up in front of him is spotted (the alert overlay fires).
  await hooks(page, "keep('worker')")
  await hooks(page, "aim('worker', -100, 2, -Math.PI / 2)")
  await hooks(page, 'place(-106, 2)')
  await expect(page.locator('#alert-overlay')).toHaveClass(/spotted|suspected/)

  // Out of the outfall at dawn: the river's creatures replace the sewer's.
  await hooks(page, 'keep()')
  await hooks(page, `step(4)`)
  await enter(page, 'outfall', 5)
  expect((await state(page)).predators.map((predator) => predator.id)).toContain('stray-0')
  await expect(page.locator('#objective-title')).toContainText('飛び石で川を渡ろう')
  await expect(page.locator('#area-name')).toHaveText('排水口')
  await enter(page, 'eastbank', 6)
  await enter(page, 'parkgate', 7)
  await expect(page.locator('#objective-title')).toContainText('ゲンじい')
  await page.waitForTimeout(1500) // let the park's people spread out from their starts
  const park = await measure(page)
  await page.screenshot({ path: testInfo.outputPath('waterway-park.png') })
  console.info(`waterway renderer: spawn ${JSON.stringify(spawn)}, park ${JSON.stringify(park)}`)
  expect(spawn.calls).toBeLessThan(200)
  expect(park.calls).toBeLessThan(260)

  // Fast-forward past the net: through the hole onto the back hill, into the forest.
  await hooks(page, 'keep()')
  await hooks(page, 'step(10)')
  const exit = await hooks<{ x: number; z: number }>(page, "zone('exit')")
  await hooks(page, `place(${exit.x}, ${exit.z})`)
  await expect.poll(async () => (await state(page)).stage).toBe(3)
  await expect(page.locator('#title-card-chapter')).toHaveText('第4章')
  await expect(page.locator('#title-card-title')).toHaveText('森へ')
  expect(errors).toEqual([])
})
