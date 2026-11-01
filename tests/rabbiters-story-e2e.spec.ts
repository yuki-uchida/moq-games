import { expect, test, type Page } from '@playwright/test'

// Story mode end to end: a new solo game starts in chapter 1 and every chapter's objective chain hands over to
// the next (title card, map, subtitles), ending in the forest; the title then offers to continue from there.
async function withHooks(page: Page) {
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
import * as storyMap from '/src/map.ts';
window.storyTest = {
  state: () => JSON.parse(JSON.stringify(game.state)),
  place(x, z) { Object.assign(game.state.players[0], { x, z, y: storyMap.heightAt(x, z) }); },
  calm() { game.state.predators = []; },
  npc: (id) => storyMap.NPCS.find((npc) => npc.id === id),
  zone(id) { const zone = storyMap.ZONES.find((entry) => entry.id === id); return { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }; },
  calls: () => scene.renderer.info.render.calls,
  skipTo(step, open) { Object.assign(game.state, { step, open }); }
};`
    })
  })
}

const hooks = <T>(page: Page, run: string) => page.evaluate<T>(`window.storyTest.${run}`)

async function talkTo(page: Page, id: string, step: number) {
  const npc = await hooks<{ x: number; z: number }>(page, `npc(${JSON.stringify(id)})`)
  await hooks(page, `place(${npc.x - 1.2}, ${npc.z})`)
  await expect(page.locator('#hint')).toContainText('E で話す')
  await page.keyboard.down('KeyE')
  await expect.poll(async () => (await hooks<{ step: number }>(page, 'state()')).step).toBe(step)
  await page.keyboard.up('KeyE')
}

async function leaveBy(page: Page, stage: number, title: string) {
  const exit = await hooks<{ x: number; z: number }>(page, "zone('exit')")
  await hooks(page, `place(${exit.x}, ${exit.z})`)
  await expect.poll(async () => (await hooks<{ stage: number }>(page, 'state()')).stage).toBe(stage)
  await expect(page.locator('#title-card-chapter')).toHaveText(`第${stage + 1}章`)
  await expect(page.locator('#title-card-title')).toHaveText(title)
  await expect(page.locator('#title-card')).toBeVisible()
}

test('story: chapters 1 → 4 chain through objectives, dialogue and title cards', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await withHooks(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(page.locator('#chapter-pick')).toBeHidden()
  await page.locator('#solo').click()

  // Chapter 1 (placeholder house): talk to Pisuke, then out of the door.
  await expect(page.locator('#title-card-title')).toHaveText('ケージの外へ')
  await expect(page.locator('#objective-title')).toContainText('第1章｜')
  await expect(page.locator('#subtitle-text')).toContainText('ケージの外')
  await page.screenshot({ path: testInfo.outputPath('chapter-1.png') })
  expect(await hooks<number>(page, 'calls()')).toBeLessThan(400)
  await hooks(page, 'calm()')
  await talkTo(page, 'pisuke', 1)
  await expect(page.locator('#subtitle-name')).toHaveText('インコのピーすけ')
  await expect(page.locator('#subtitle-text')).toContainText('モリ')
  await leaveBy(page, 1, '知らない町')

  // Chapter 2 (town; rabbiters-town-e2e.spec.ts plays its goals): skip to the gnawed-open drain and go in.
  await hooks(page, 'calm()')
  await expect(page.locator('#objective-title')).toContainText('第2章｜')
  await page.screenshot({ path: testInfo.outputPath('chapter-2.png') })
  await hooks(page, 'skipTo(11, 1)')
  await leaveBy(page, 2, '水の道')

  // Chapter 3 (placeholder waterway): hold E at the valve to open the floodgate, talk to Genji, leave.
  await hooks(page, 'calm()')
  const valve = await hooks<{ x: number; z: number }>(page, "zone('valve')")
  await hooks(page, `place(${valve.x}, ${valve.z})`)
  await page.keyboard.down('KeyE')
  await expect.poll(async () => (await hooks<{ open: number }>(page, 'state()')).open, { timeout: 30_000 }).toBe(1)
  await page.keyboard.up('KeyE')
  await page.screenshot({ path: testInfo.outputPath('chapter-3.png') })
  await talkTo(page, 'genji', 2)
  await leaveBy(page, 3, '森へ')

  // Chapter 4: the forest seasons campaign, greeted by the elder rabbit.
  await expect(page.locator('#objective-title')).toContainText('春｜')
  await expect(page.locator('#chapter-banner')).toBeVisible()
  await expect(page.locator('#subtitle')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('chapter-4.png') })

  // The title offers to continue from the furthest chapter reached.
  await page.goto('/')
  await expect(page.locator('#chapter-pick')).toBeVisible()
  await expect(page.locator('#chapter-select option')).toHaveCount(4)
  await expect(page.locator('#chapter-select')).toHaveValue('3')
  expect(errors).toEqual([])
})

test('story: ?chapter=N starts a solo game directly in that chapter', async ({ page }) => {
  await page.goto('/?chapter=2')
  await expect(page.locator('#chapter-select')).toHaveValue('1')
  await page.locator('#solo').click()
  await expect(page.locator('#title-card-title')).toHaveText('知らない町')
  await expect(page.locator('#objective-title')).toContainText('第2章｜')
})
