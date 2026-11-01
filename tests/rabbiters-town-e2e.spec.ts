import { expect, test, type Page } from '@playwright/test'

// Chapter 2 (知らない町) end to end: starts straight in the town, walks, meets an enemy, talks to Ponta, and a
// test hook fast-forwards to the open drain so the hand-over to chapter 3 is checked. Logs draw calls and
// triangles at the spawn and in the busiest spot (main road traffic in front of the shopping street).
async function withHooks(page: Page) {
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
import * as storyMap from '/src/map.ts';
window.townTest = {
  state: () => JSON.parse(JSON.stringify(game.state)),
  place(x, z, angle = 0) { Object.assign(game.state.players[0], { x, z, angle, y: storyMap.heightAt(x, z) }); },
  keep(ids) { game.state.predators = game.state.predators.filter((predator) => ids.includes(predator.id)); },
  skipTo(step, open) { Object.assign(game.state, { step, open }); },
  npc: (id) => storyMap.NPCS.find((npc) => npc.id === id),
  zone(id) { const zone = storyMap.ZONES.find((entry) => entry.id === id); return { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }; },
  info: () => ({ calls: scene.renderer.info.render.calls, triangles: scene.renderer.info.render.triangles })
};`
    })
  })
}
const hooks = <T>(page: Page, run: string) => page.evaluate<T>(`window.townTest.${run}`)
const frames = (page: Page, count: number) =>
  page.evaluate(
    (total) =>
      new Promise<void>((done) => {
        let left = total
        const tick = () => (--left <= 0 ? done() : requestAnimationFrame(tick))
        requestAnimationFrame(tick)
      }),
    count
  )
type Info = { calls: number; triangles: number }
type State = { stage: number; players: { x: number }[]; predators: { x: number; z: number }[] }

test('town: walk, a stray cat, Ponta, then on to the waterway', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await withHooks(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?chapter=2')
  await expect(page.locator('#chapter-select')).toHaveValue('1')
  await page.locator('#solo').click()

  // Arrival: title card, objective card, the opening narration.
  await expect(page.locator('#title-card-title')).toHaveText('知らない町')
  await expect(page.locator('#objective-title')).toHaveText('第2章｜路地を抜けよう')
  await expect(page.locator('#subtitle-text')).toContainText('フェンスの外')
  await frames(page, 30)
  const spawn = await hooks<Info>(page, 'info()')
  await page.screenshot({ path: testInfo.outputPath('town-spawn.png') })

  // Walk a few steps east across the yard.
  await hooks(page, "keep(['tora'])")
  const start = (await hooks<State>(page, 'state()')).players[0].x
  await page.keyboard.down('KeyD')
  await expect.poll(async () => (await hooks<State>(page, 'state()')).players[0].x).toBeGreaterThan(start + 2)
  await page.keyboard.up('KeyD')

  // Tora, the stray-cat boss, right in front: the screen flashes "spotted".
  const tora = (await hooks<State>(page, 'state()')).predators[0]
  await hooks(page, `place(${tora.x + 1.2}, ${tora.z})`)
  await expect(page.locator('#alert-overlay')).toHaveClass(/spotted|suspected/)
  await page.screenshot({ path: testInfo.outputPath('town-cat.png') })

  // Ponta at the garbage point: the talk shows his name and the objective waits for him.
  await hooks(page, 'keep([])')
  await hooks(page, 'skipTo(1, 0)')
  const ponta = await hooks<{ x: number; z: number }>(page, "npc('ponta')")
  await hooks(page, `place(${ponta.x + 1.4}, ${ponta.z})`)
  await expect(page.locator('#hint')).toContainText('E で話す', { timeout: 30_000 }) // once the current line ends
  await page.keyboard.press('KeyE')
  await expect(page.locator('#subtitle-name')).toHaveText('タヌキのポン太')
  await expect(page.locator('#objective-title')).toHaveText('第2章｜ポン太の話を聞こう')

  // The busiest view: two lanes of traffic, parked cars and the shopping street behind.
  await hooks(page, 'place(-36, -4, -1.57)')
  await frames(page, 30)
  const busy = await hooks<Info>(page, 'info()')
  await page.screenshot({ path: testInfo.outputPath('town-road.png') })
  console.info('town draw calls / triangles', JSON.stringify({ spawn, busy }))
  expect(spawn.calls).toBeLessThan(400)
  expect(busy.calls).toBeLessThan(400)

  // Night on the embankment; fast-forward past the gnawed-open grate into the drain.
  await hooks(page, 'skipTo(11, 1)')
  const exit = await hooks<{ x: number; z: number }>(page, "zone('exit')")
  await hooks(page, `place(${exit.x + 4}, ${exit.z}, -1.57)`)
  await frames(page, 20)
  await page.screenshot({ path: testInfo.outputPath('town-drain.png') })
  await hooks(page, `place(${exit.x}, ${exit.z})`)
  await expect.poll(async () => (await hooks<State>(page, 'state()')).stage).toBe(2)
  await expect(page.locator('#title-card-chapter')).toHaveText('第3章')
  await expect(page.locator('#title-card-title')).toHaveText('水の道')
  expect(errors).toEqual([])
})

test('town: the forest spawn, for a draw-call comparison', async ({ page }) => {
  await withHooks(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await expect(page.locator('#objective-title')).toContainText('春｜')
  await frames(page, 30)
  console.info('forest draw calls / triangles', JSON.stringify(await hooks<Info>(page, 'info()')))
})
