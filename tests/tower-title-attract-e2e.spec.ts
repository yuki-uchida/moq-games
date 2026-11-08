import { expect, test, type Page } from '@playwright/test'
import { towerPath } from './tower-defense-e2e-arrange'

// Starting campaigns around the demo (New game / Continue / back to the title) is covered by
// tower-title-attract-flow-e2e.spec.ts in the local tower suite; these two stay light for the Pages CI shards.

const attract = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { towerTitleAttractDiagnostics: () => Record<string, any> }).towerTitleAttractDiagnostics()
  )
const browserState = (page: Page) =>
  page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
    href: location.href,
    history: history.length,
    historyState: JSON.stringify(history.state),
    saveStatus: document.querySelector('#title-save-status')!.textContent,
    feedback: document.querySelector('#feedback')!.textContent,
    phase: document.querySelector('#phase')!.textContent
  }))
/** Cold GPU preparation of the demo's roles takes a while on software WebGL runners. */
const waitForDemo = (page: Page) =>
  expect.poll(async () => (await attract(page)).state, { timeout: 240_000, intervals: [500] }).toBe('running')

test('the title plays a real, silent battle behind a usable title without touching game state', async ({ page }) => {
  const audio: string[] = [],
    remote: string[] = [],
    errors: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (/\.(wav|mp3|ogg|m4a)(\?|$)|tower-defense-(sfx|music)\//.test(url)) audio.push(url)
    if (!url.startsWith('http://127.0.0.1') && !url.startsWith('data:') && !url.startsWith('blob:')) remote.push(url)
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(towerPath)
  await expect(page.locator('#title-screen')).toBeVisible()
  await expect(page.locator('#title-new')).toBeFocused()
  const before = await browserState(page)
  expect(before.saveStatus).toBe('保存した遠征はありません。')

  await waitForDemo(page)
  const first = await attract(page)
  // It keeps drawing and its battle keeps running; busy software-WebGL runners draw only a few frames a second.
  await expect
    .poll(
      async () => {
        const now = await attract(page)
        return now.frames > first.frames + 10 && now.time > first.time + 0.5
      },
      { timeout: 30_000, intervals: [250] }
    )
    .toBe(true)
  const later = await attract(page)
  // The demo is the real engine, assaulting stage 1 with the starter formation.
  expect(first).toMatchObject({ loop: 0, stage: 1, failure: '' })
  expect(later.frames).toBeGreaterThan(first.frames + 10)
  expect(later.time).toBeGreaterThan(first.time + 0.5)
  expect(later.units).toBeGreaterThanOrEqual(4)
  await expect(page.locator('#title-screen')).toHaveAttribute('data-attract', 'running')

  // Decoration only: hidden from assistive technology, inert, and never on top of the menu.
  const demo = page.locator('.title-demo')
  await expect(demo).toHaveAttribute('aria-hidden', 'true')
  await expect(demo).toHaveAttribute('inert', '')
  expect(await demo.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none')
  await expect(demo.locator('canvas')).toHaveCount(1)
  for (const id of ['title-new', 'title-continue']) {
    const box = (await page.locator(`#${id}`).boundingBox())!
    expect(
      await page.evaluate(({ x, y, id }) => !!document.elementFromPoint(x, y)?.closest(`#${id}`), {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        id
      })
    ).toBe(true)
  }
  // Silent before any user gesture (a key or click unlocks and preloads the real game's sounds, as today).
  expect(audio).toEqual([])
  await expect(page.locator('#title-new')).toBeFocused()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !document.activeElement?.closest('.title-demo'))).toBe(true)
  await page.locator('#title-new').focus()

  expect(await browserState(page)).toEqual(before)
  expect(await page.locator('#title-save-status').textContent()).toBe('保存した遠征はありません。')
  expect(remote).toEqual([])
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/title-attract-running.png' })

  // Mouse input reaches the menu through the running demo.
  await page.locator('#title-new').click()
  await expect(page.locator('#launch')).toBeVisible()
  await expect(page.locator('.title-demo')).toHaveCount(0)
  expect((await attract(page)).state).toBe('idle')
})

test('reduced motion keeps the still title and downloads no battle models', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const models: string[] = []
  page.on('request', (request) => {
    if (/\.(glb|gltf)(\?|$|\.)/.test(request.url())) models.push(request.url())
  })
  await page.goto(towerPath)
  await expect(page.locator('#title-screen')).toBeVisible()
  await page.waitForTimeout(4000)
  expect(models).toEqual([])
  expect((await attract(page)).state).toBe('idle')
  await expect(page.locator('.title-demo')).toHaveCount(0)
  await expect(page.locator('#title-screen')).not.toHaveAttribute('data-attract', /.*/)
})
