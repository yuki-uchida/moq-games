import { expect, test, type Page } from '@playwright/test'

/** The parts of the app these tests look inside (private at compile time, plain fields at run time). */
interface HamAudio {
  theme: string | null
  layer: number
  muted: boolean
  ctx: { state: string } | null
  engine: { sfx(...args: unknown[]): unknown } | null
}

interface HamWorld {
  player: { x: number; y: number; w: number; h: number; vx: number; vy: number; invuln: number }
  boss: { x: number; y: number; w: number; h: number; arenaX: number; active: boolean } | null
}

declare global {
  interface Window {
    __hamham?: { world: HamWorld | null; app: { audio: HamAudio } }
  }
}

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

const theme = (page: Page) => page.evaluate(() => window.__hamham!.app.audio.theme)
const layer = (page: Page) => page.evaluate(() => window.__hamham!.app.audio.layer)
const waitForTheme = (page: Page, name: string) =>
  page.waitForFunction((n) => window.__hamham?.app.audio.theme === n, name, { timeout: 10_000 })

/** Counts every effect the real engine is asked to play from now on (window.__sfx). */
async function countEffects(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __sfx: number }
    w.__sfx = 0
    const engine = window.__hamham!.app.audio.engine!
    const original = engine.sfx.bind(engine)
    engine.sfx = (...args: unknown[]) => {
      w.__sfx += 1
      return original(...args)
    }
  })
}
const effects = (page: Page) => page.evaluate(() => (window as unknown as { __sfx: number }).__sfx)

async function pageThroughStory(page: Page) {
  for (let i = 0; i < 10; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
}

/** Opens a stage through the stage select with every stage unlocked and the sound on. */
async function openStage(page: Page, no: number) {
  await page.goto('/')
  await page.evaluate(() => {
    const save = {
      version: 1,
      cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      unlocked: 10,
      best: {},
      muted: false,
      seenOpening: true
    }
    localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save))
  })
  await page.reload()
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page
    .locator('.stage-card')
    .nth(no - 1)
    .click()
  await pageThroughStory(page)
  await expect(page.locator('#hud')).toBeVisible()
  await page.waitForFunction(() => Boolean(window.__hamham?.world))
}

test('the first click unlocks the audio and the music follows the screens', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '星のハムハム' })).toBeVisible()
  expect(await theme(page)).toBe('title')

  await page.getByRole('button', { name: 'はじめから' }).click()
  await page.waitForFunction(() => window.__hamham?.app.audio.ctx?.state === 'running')
  await expect(page.locator('#story-screen')).toBeVisible()
  expect(await theme(page)).toBe('story')

  await pageThroughStory(page)
  await expect(page.locator('#select-screen')).toBeVisible()
  expect(await theme(page)).toBe('select')

  await page.locator('.stage-card').first().click()
  await expect(page.locator('#story-screen')).toBeVisible()
  expect(await theme(page)).toBe('story')
  await pageThroughStory(page)
  await expect(page.locator('#hud')).toBeVisible()
  await waitForTheme(page, 'meadow')
  expect(await layer(page)).toBe(0)
  expect(errors).toEqual([])
})

test('any key unlocks the audio, and the title demo stays silent', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '星のハムハム' })).toBeVisible()
  expect(await page.evaluate(() => window.__hamham!.app.audio.ctx?.state ?? 'none')).not.toBe('running')
  await page.keyboard.press('ArrowDown')
  await page.waitForFunction(() => window.__hamham?.app.audio.ctx?.state === 'running')
  await countEffects(page)
  await page.waitForTimeout(3500)
  expect(await theme(page)).toBe('title')
  expect(await effects(page)).toBe(0)
  expect(errors).toEqual([])
})

test('a boss fight plays the boss theme', async ({ page }) => {
  const errors = collectErrors(page)
  await openStage(page, 5)
  await waitForTheme(page, 'forest')
  await page.evaluate(() => {
    const world = window.__hamham!.world!
    const boss = world.boss!
    world.player.invuln = 999
    world.player.x = boss.x - world.player.w - 40
    world.player.y = boss.y + boss.h - world.player.h
    world.player.vx = 0
    world.player.vy = 0
  })
  await waitForTheme(page, 'boss')
  expect(await layer(page)).toBe(0)
  expect(errors).toEqual([])
})

test('muting silences the effects and survives a reload', async ({ page }) => {
  const errors = collectErrors(page)
  await openStage(page, 1)
  await page.waitForFunction(() => window.__hamham?.app.audio.ctx?.state === 'running')
  await countEffects(page)
  await page.keyboard.press('Space')
  await page.waitForTimeout(500)
  expect(await effects(page)).toBeGreaterThan(0)

  await page.keyboard.press('KeyM')
  await expect(page.locator('#mute')).toHaveText('🔇')
  expect(await page.evaluate(() => window.__hamham!.app.audio.muted)).toBe(true)
  await page.evaluate(() => ((window as unknown as { __sfx: number }).__sfx = 0))
  await page.keyboard.press('Space')
  await page.waitForTimeout(500)
  // The engine is never asked for an effect while muted.
  expect(await effects(page)).toBe(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: '星のハムハム' })).toBeVisible()
  expect(await page.evaluate(() => window.__hamham!.app.audio.muted)).toBe(true)
  expect(errors).toEqual([])
})
