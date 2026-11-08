import { expect, test, type Page } from '@playwright/test'

// Reads the title demo through the module's own variables (same pattern as the other rabbiters specs).
async function open(page: Page, url = '/') {
  await page.addInitScript(() => {
    const w = window as unknown as { audioContexts: number; AudioContext: typeof AudioContext }
    w.audioContexts = 0
    const Native = w.AudioContext
    if (Native)
      w.AudioContext = class extends Native {
        constructor(options?: AudioContextOptions) {
          super(options)
          w.audioContexts++
        }
      }
  })
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.attractProbe = {
  get demo() { return demo },
  get game() { return game },
  get started() { return started },
  pose() { const p = demo?.player; return p ? { x: p.x, z: p.z, time: demo.state.time, runs: demo.runs } : null }
};`
    })
  })
  const requests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol !== 'data:' && url.protocol !== 'blob:')
      requests.push(request.url())
  })
  await page.goto(url)
  return requests
}
const pose = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { attractProbe: { pose(): { x: number; z: number; time: number; runs: number } | null } }
    ).attractProbe.pose()
  )

test('the title plays a real game behind the panel without touching storage, audio or the network', async ({
  page
}) => {
  const requests = await open(page)
  await expect(page.locator('#start-panel')).toBeVisible()
  await expect.poll(() => pose(page)).not.toBeNull()
  const first = (await pose(page))!
  await page.waitForTimeout(3000)
  const later = (await pose(page))!
  expect(later.time).toBeGreaterThan(first.time + 0.3)
  expect(Math.hypot(later.x - first.x, later.z - first.z)).toBeGreaterThan(0.2)
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  // Only the shared UI-sound warm-up may open a context on the title; the demo adds none of its own.
  expect(await page.evaluate(() => (window as unknown as { audioContexts: number }).audioContexts)).toBeLessThanOrEqual(
    1
  )
  expect(requests).toEqual([])
  for (const id of ['#hud', '#subtitle', '#title-card', '#chapter-banner']) await expect(page.locator(id)).toBeHidden()
  await expect(page.locator('#announcements')).toHaveText('')
})

test('the title stays usable and the real game starts fresh, then the demo returns', async ({ page }) => {
  await open(page)
  await expect.poll(() => pose(page)).not.toBeNull()
  await page.waitForTimeout(1500)
  // The scene never sits on top of the title's controls.
  const onTop = await page.evaluate(() => {
    const box = document.querySelector('#solo')!.getBoundingClientRect()
    return !!document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('#start-panel')
  })
  expect(onTop).toBe(true)
  await page.locator('#solo').focus()
  await expect(page.locator('#solo')).toBeFocused()
  await page.locator('#solo').click()
  await expect(page.locator('#hud')).toBeVisible()
  const started = await page.evaluate(() => {
    const probe = (window as unknown as { attractProbe: { demo: unknown; game: any } }).attractProbe
    const state = probe.game.state
    return {
      demo: probe.demo ?? null,
      time: state.time,
      stage: state.stage,
      players: state.players.length,
      storage: localStorage.length
    }
  })
  expect(started.demo).toBeNull()
  expect(started.stage).toBe(0)
  expect(started.players).toBe(1)
  expect(started.time).toBeLessThan(2)
  expect(started.storage).toBe(0)
  await page.locator('#leave').click()
  await expect(page.locator('#start-panel')).toBeVisible()
  await expect.poll(() => pose(page)).not.toBeNull()
  await page.waitForTimeout(500)
  expect((await pose(page))!.time).toBeLessThan(5)
})

test('reduced motion keeps the demo still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await expect.poll(() => pose(page)).not.toBeNull()
  await page.waitForTimeout(1500)
  expect((await pose(page))!.time).toBe(0)
})

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 320, height: 568 }
]) {
  test(`title buttons are reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await open(page)
    await expect(page.locator('#solo')).toBeVisible()
    await page.locator('#together').click()
    await expect(page.locator('#room')).toBeFocused()
    await expect(page.locator('#host')).toBeVisible()
    await expect(page.locator('#join')).toBeVisible()
  })
}
