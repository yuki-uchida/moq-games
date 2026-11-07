import { expect, test, type Page } from '@playwright/test'

// Chapter 1 (house) end to end: start in the cage, walk, hear Pisuke, get spotted by Mom outside the cage
// ("?"/"!" cue and her bark), and fast-forward through the fence gap to chapter 2. Also measures draw calls.
async function withHooks(page: Page) {
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
import * as houseMap from '/src/map.ts';
import { HouseBot } from '/tests/house-bot.ts';
window.houseTest = {
  state: () => JSON.parse(JSON.stringify({ ...game.state, predators: game.state.predators.map(({ route, leash, ...rest }) => rest) })),
  place(x, z) { Object.assign(game.state.players[0], { x, z, y: houseMap.heightAt(x, z) }); },
  patch(values) { Object.assign(game.state, values); },
  keepOnly(ids) { game.state.predators = game.state.predators.filter((entry) => ids.includes(entry.id)); },
  move(id, values) { Object.assign(game.state.predators.find((entry) => entry.id === id), values); },
  npc: (id) => houseMap.NPCS.find((npc) => npc.id === id),
  openingUntil(talk) {
    const bot = new HouseBot(game, game.state.players[0].id);
    for (let frame = 0; frame < 90 * 60 && game.state.step === 0 && game.state.talk?.id !== talk; frame++) {
      game.setInput(bot.id, bot.input());
      game.step(1 / 60);
    }
  },
  zone(id) { const zone = houseMap.ZONES.find((entry) => entry.id === id); return { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }; },
  marker(id) {
    const symbol = scene.actors.get('predator:' + id)?.marker?.symbol;
    return symbol?.visible ? [...scene.textures].find(([, texture]) => texture === symbol.material.map)?.[0] ?? null : null;
  },
  info: () => ({ calls: scene.renderer.info.render.calls, triangles: scene.renderer.info.render.triangles })
};`
    })
  })
}

const hooks = <T>(page: Page, run: string) => page.evaluate<T>(`window.houseTest.${run}`)
type State = {
  time: number
  stage: number
  step: number
  flags: number
  open: number
  talk: { id: string } | null
  players: { x: number; z: number }[]
  predators: { id: string; state: string }[]
}
const state = (page: Page) => hooks<State>(page, 'state()')

test('house: breakfast and Pisuke lead straight into Hinata leaving and the latch objective', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await withHooks(page)
  await page.goto('/?chapter=1')
  await page.locator('#solo').click()

  await hooks(page, "openingUntil('morning_call')")
  await expect(page.locator('#subtitle-text')).toContainText('そろそろ出る時間')
  await expect(page.locator('#objective-title')).toContainText('ひなたが学校へ行くのを待とう')

  await hooks(page, "openingUntil('hinata_leaves')")
  await expect(page.locator('#subtitle-text')).toContainText('いってきまーす')
  await expect(page.locator('#hint')).toContainText('玄関へ向かっている')

  await hooks(page, "openingUntil('end')")
  await expect(page.locator('#objective-title')).toContainText('留め金をかじろう')
  const departed = await state(page)
  expect(departed.time).toBeLessThan(90)
  expect(departed.step).toBe(1)
  expect(departed.predators.some((person) => person.id === 'hinata')).toBe(false)
  expect(errors).toEqual([])
})

test('house: cage start, Pisuke, a family member spots Mochi, fence gap to chapter 2', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await withHooks(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?chapter=1')
  await page.locator('#solo').click()

  // Opening: title card, objective card, the narrator's first line.
  await expect(page.locator('#title-card-title')).toHaveText('ケージの外へ')
  await expect(page.locator('#objective-title')).toContainText('第1章｜ペレット')
  await expect(page.locator('#subtitle-text')).toContainText('ひなたの家')
  await page.waitForTimeout(800)
  const spawn = await hooks<{ calls: number; triangles: number }>(page, 'info()')
  console.log(`house spawn: ${spawn.calls} draw calls, ${spawn.triangles} triangles`)
  await page.screenshot({ path: testInfo.outputPath('house-cage.png') })
  expect(spawn.calls).toBeLessThan(260)
  expect(spawn.triangles).toBeLessThan(200_000)

  // A few steps inside the cage.
  const before = (await state(page)).players[0]
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(500)
  await page.keyboard.up('KeyW')
  await expect
    .poll(async () => {
      const now = (await state(page)).players[0]
      return Math.hypot(now.x - before.x, now.z - before.z)
    })
    .toBeGreaterThan(0.5)

  // Pisuke, from the corner of the cage next to the birdcage.
  await hooks(page, 'patch({ talk: null })')
  await hooks(page, 'place(-27.4, 18)')
  await expect(page.locator('#hint')).toContainText('E で話す')
  await page.keyboard.down('KeyE')
  await expect.poll(async () => (await state(page)).flags & 2).toBe(2)
  await page.keyboard.up('KeyE')
  await expect(page.locator('#subtitle-name')).toHaveText('インコのピーすけ', { timeout: 30_000 })
  await expect(page.locator('#subtitle-text')).toContainText('モリ', { timeout: 30_000 })

  // Out of the cage (latch gnawed), Mom notices Mochi in the dining room: "?"/"!" over her head and her bark.
  await hooks(page, `patch({ step: 2, flags: ${(1 << 0) | (1 << 1) | (1 << 2) | (1 << 3)}, open: 1, talk: null })`)
  await hooks(page, "keepOnly(['mom'])")
  await hooks(page, "move('mom', { x: 14, z: 3, angle: -Math.PI / 2, state: 'patrol', suspicion: 0 })")
  await hooks(page, 'place(9, 2.5)')
  await expect
    .poll(async () => (await state(page)).predators.find((entry) => entry.id === 'mom')?.state)
    .not.toBe('patrol')
  await expect.poll(async () => hooks<string | null>(page, "marker('mom')")).toMatch(/[?!]/)
  await page.screenshot({ path: testInfo.outputPath('house-spotted.png') })
  const busy = await hooks<{ calls: number; triangles: number }>(page, 'info()')
  console.log(`house dining (family in view): ${busy.calls} draw calls, ${busy.triangles} triangles`)

  // Fast-forward: the cat flap is open and the gap dug; through the fence to chapter 2.
  await hooks(page, `patch({ step: 5, open: ${1 | 2 | 8}, talk: null })`)
  await hooks(page, 'keepOnly([])')
  await hooks(page, 'place(-36, 40)')
  await page.waitForTimeout(500)
  await page.screenshot({ path: testInfo.outputPath('house-garden.png') })
  const exit = await hooks<{ x: number; z: number }>(page, "zone('exit')")
  await hooks(page, `place(-38.25, ${Math.min(exit.z, 58)})`)
  await expect(page.locator('#subtitle-text')).toContainText('外の世界は', { timeout: 20_000 })
  await expect.poll(async () => (await state(page)).stage, { timeout: 30_000 }).toBe(1)
  await expect(page.locator('#title-card-chapter')).toHaveText('第2章')
  await expect(page.locator('#title-card-title')).toHaveText('知らない町')
  expect(errors).toEqual([])
})
