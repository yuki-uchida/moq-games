import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __hamham?: {
      world: { player: { x: number; y: number; hp: number }; state: string; time: number }
    }
  }
}

test('title, story, stage select and the first stage play through the keyboard', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '星のハムハム' })).toBeVisible()
  await expect(page.locator('#game')).toBeVisible()

  await page.getByRole('button', { name: 'はじめから' }).click()
  await expect(page.locator('#story-screen')).toBeVisible()
  for (let i = 0; i < 8; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
  await expect(page.locator('#select-screen')).toBeVisible()
  await expect(page.locator('.stage-card')).toHaveCount(10)
  await expect(page.locator('.stage-card.is-locked')).toHaveCount(9)

  await page.locator('.stage-card').first().click()
  await expect(page.locator('#story-screen')).toBeVisible()
  for (let i = 0; i < 6; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }

  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('#boss-bar')).toBeVisible()
  await page.waitForTimeout(400)

  const before = await page.evaluate(() => window.__hamham!.world.player.x)
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(900)
  await page.keyboard.up('ArrowRight')
  const after = await page.evaluate(() => window.__hamham!.world.player.x)
  expect(after).toBeGreaterThan(before + 60)

  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  await page.keyboard.press('KeyZ')
  await page.waitForTimeout(300)
  const state = await page.evaluate(() => window.__hamham!.world.state)
  expect(state).toBe('play')
  await expect(page.locator('#hearts .heart.is-full').first()).toBeVisible()

  await page.screenshot({ path: testInfo.outputPath('stage-1.png') })
  expect(errors).toEqual([])
})

test('pause and mute controls respond', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'はじめから' }).click()
  for (let i = 0; i < 8; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
  await page.locator('.stage-card').first().click()
  for (let i = 0; i < 6; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
  await expect(page.locator('#hud')).toBeVisible()
  await page.locator('#pause').click()
  await expect(page.locator('#pause-screen')).toBeVisible()
  await page.getByRole('button', { name: 'つづける' }).click()
  await expect(page.locator('#pause-screen')).toBeHidden()
  await page.keyboard.press('KeyM')
  await expect(page.locator('#mute')).toHaveText('🔇')
  expect(errors).toEqual([])
})

test('the ending pages through to the credits', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(() => {
    const raw = localStorage.getItem('hoshi-no-hamham-v1')
    const save = raw
      ? JSON.parse(raw)
      : { version: 1, cleared: [], unlocked: 10, best: {}, muted: true, seenOpening: false }
    save.cleared = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    save.unlocked = 10
    localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save))
  })
  await page.reload()
  await page.waitForTimeout(400)
  await page.evaluate(() => (window as unknown as { __hamham: { openEnding(): void } }).__hamham.openEnding())
  await expect(page.locator('#ending-screen')).toBeVisible()
  const pages: string[] = []
  for (let i = 0; i < 10; i++) {
    await expect(page.locator('#ending-pages p')).toBeVisible()
    pages.push((await page.locator('#ending-pages p').textContent()) ?? '')
    const next = page.locator('#ending-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
  expect(pages.length).toBeGreaterThan(3)
  expect(pages.join('')).toContain('おしまい')
  await expect(page.locator('#ending-stats')).toBeVisible()
  await expect(page.locator('#ending-select')).toBeVisible()
  expect(errors).toEqual([])
})
