import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __hamham?: {
      world: {
        player: { x: number; y: number; hp: number; w: number; h: number; vx: number; vy: number }
        boss: { x: number; y: number; w: number; h: number; hp: number; dead: boolean } | null
        props: { kind: string; state: string }[]
        biteProp(prop: { kind: string; state: string }, dir: 1 | -1): void
        state: string
        time: number
      }
      openEnding(): void
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

test('clearing the last stage leads from the result screen to the ending', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.evaluate(() => {
    const raw = localStorage.getItem('hoshi-no-hamham-v1')
    const save = raw
      ? JSON.parse(raw)
      : { version: 1, cleared: [], unlocked: 10, best: {}, muted: true, seenOpening: false }
    save.cleared = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    save.unlocked = 10
    localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save))
  })
  await page.reload()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'つづきから' }).click()
  await expect(page.locator('#select-screen')).toBeVisible()
  await page.locator('.stage-card').nth(9).click()
  for (let i = 0; i < 8; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('#boss-bar')).toBeHidden()

  // Stand next to the sleeping king and leave it one bite: this test is about the clear -> ending
  // flow, not about the fight itself. The switches are pressed for the same reason: the doors on
  // the way to the exit would otherwise block the walk to the goal.
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const world = window.__hamham!.world
    for (const prop of world.props) {
      if (prop.kind === 'switch') world.biteProp(prop, 1)
    }
  })
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.evaluate(() => {
      const world = window.__hamham!.world
      const boss = world.boss!
      boss.hp = 1
      world.player.invuln = 999
      world.player.x = boss.x - world.player.w - 4
      world.player.y = boss.y + boss.h - world.player.h
      world.player.vx = 0
      world.player.vy = 0
    })
    // Hold the bite key for a few frames: a single key press can fall between two simulation steps.
    await page.keyboard.down('KeyZ')
    await page.waitForTimeout(60)
    await page.keyboard.up('KeyZ')
    await page.waitForTimeout(340)
    if (await page.evaluate(() => window.__hamham!.world.boss!.dead)) break
  }
  expect(await page.evaluate(() => window.__hamham!.world.boss!.dead)).toBe(true)

  await page.keyboard.down('ArrowRight')
  await expect(page.locator('#result-screen')).toBeVisible({ timeout: 10_000 })
  await page.keyboard.up('ArrowRight')
  await page.locator('#result-next').click()
  await expect(page.locator('#ending-screen')).toBeVisible()
  expect(errors).toEqual([])
})
