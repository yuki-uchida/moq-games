import { expect, test, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

// Staging (演出): the stage-1 yell, a boss intro that holds the simulation and can be skipped, a boss falling
// into an open goal, and the clear and death sequences ending on their screens. Driven through the test hook.

interface StagingProbe {
  current: string | null
  scale: number
  locked: boolean
  time: number
  hp: number
  maxHp: number
  bars: number
  bubbles: string[]
  state: string
  goalOpen: boolean
  bossDead: boolean
}

type Hook = {
  world: {
    player: {
      x: number
      y: number
      w: number
      h: number
      vx: number
      vy: number
      hp: number
      maxHp: number
      invuln: number
    }
    boss: {
      x: number
      y: number
      w: number
      h: number
      hp: number
      dead: boolean
      arenaX: number
      invuln: number
    } | null
    enemies: { dead: boolean }[]
    time: number
    state: string
    goalOpen: boolean
    goalX: number
    goalY: number
    hurtPlayer(amount: number, sourceX: number): void
  }
  view: { overlay: { barsAmount: number; bubbleTexts: string[] } } | null
  app: { session: { director: { current?: string | null; timeScale: number; inputLocked: boolean } } | null }
}

const hook = () => (window as unknown as { __hamham: Hook }).__hamham

async function openStage(page: Page, no: number) {
  await openGame(page)
  await page.evaluate(() => {
    const save = {
      version: 1,
      cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      unlocked: 10,
      best: {},
      muted: true,
      seenOpening: true
    }
    localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save))
  })
  await reloadGame(page)
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page
    .locator('.stage-card')
    .nth(no - 1)
    .click()
  for (let i = 0; i < 10; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
  await expect(page.locator('#hud')).toBeVisible()
  await page.waitForFunction(() => {
    const h = (window as unknown as { __hamham?: Hook }).__hamham
    return Boolean(h?.view && h.app.session)
  })
}

function probe(page: Page): Promise<StagingProbe> {
  return page.evaluate(() => {
    const h = (window as unknown as { __hamham: Hook }).__hamham
    const d = h.app.session?.director
    const w = h.world
    return {
      current: d?.current ?? null,
      scale: d?.timeScale ?? 1,
      locked: d?.inputLocked ?? false,
      time: w.time,
      hp: w.player.hp,
      maxHp: w.player.maxHp,
      bars: h.view?.overlay.barsAmount ?? 0,
      bubbles: h.view?.overlay.bubbleTexts ?? [],
      state: w.state,
      goalOpen: w.goalOpen,
      bossDead: Boolean(w.boss?.dead)
    }
  })
}

const waitForMoment = (page: Page, name: string | null, timeout = 5000) =>
  page.waitForFunction(
    (n) => ((window as unknown as { __hamham: Hook }).__hamham.app.session?.director.current ?? null) === n,
    name,
    { timeout }
  )

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

/** Clears the field and puts the hero just inside the boss arena so the fight begins. */
async function enterArena(page: Page) {
  await page.evaluate(() => {
    const w = (window as unknown as { __hamham: Hook }).__hamham.world
    for (const e of w.enemies) e.dead = true
    const b = w.boss!
    w.player.invuln = 999
    w.player.x = b.arenaX + 4
    w.player.y = b.y + b.h - w.player.h
    w.player.vx = 0
    w.player.vy = 0
  })
}

/** Leaves the boss one hit and bites him until he falls. */
async function defeatBoss(page: Page) {
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.evaluate(() => {
      const w = (window as unknown as { __hamham: Hook }).__hamham.world
      const b = w.boss!
      b.hp = 1
      w.player.invuln = 999
      w.player.x = b.x - w.player.w - 4
      w.player.y = b.y + b.h - w.player.h
      w.player.vx = 0
      w.player.vy = 0
    })
    await page.keyboard.down('KeyZ')
    await page.waitForTimeout(60)
    await page.keyboard.up('KeyZ')
    await page.waitForTimeout(240)
    if ((await probe(page)).bossDead) return
  }
  throw new Error('the boss did not fall')
}

test('stage 1 opens with ハム代 yelling and the hero is unhurt when control returns', async ({ page }) => {
  const errors = collectErrors(page)
  await openStage(page, 1)
  const first = await probe(page)
  // The sequence may already be over on a slow machine; when caught, it holds the simulation.
  if (first.current === 'chase-start') {
    expect(first.scale).toBe(0)
    expect(first.locked).toBe(true)
  }
  await waitForMoment(page, null)
  const after = await probe(page)
  // The yell's bubble outlasts the held moment, so it is still on screen when control returns.
  expect(after.bubbles).toContain('こらーっ！まちなさーい！')
  expect(after.hp).toBe(after.maxHp)
  expect(after.time).toBeLessThan(1)
  expect(after.locked).toBe(false)
  const x0 = await page.evaluate(() => (window as unknown as { __hamham: Hook }).__hamham.world.player.x)
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(500)
  await page.keyboard.up('ArrowRight')
  const x1 = await page.evaluate(() => (window as unknown as { __hamham: Hook }).__hamham.world.player.x)
  expect(x1).toBeGreaterThan(x0 + 40)
  expect(errors).toEqual([])
})

test('walking into the stage-5 boss room plays the intro, which holds the simulation and can be skipped', async ({
  page
}) => {
  const errors = collectErrors(page)
  await openStage(page, 5)
  await waitForMoment(page, null)
  await enterArena(page)
  await waitForMoment(page, 'boss-intro')
  await page.waitForTimeout(500)
  const a = await probe(page)
  await page.waitForTimeout(400)
  const b = await probe(page)
  expect(b.current).toBe('boss-intro')
  expect(b.bars).toBeGreaterThan(0.5)
  expect(b.time).toBe(a.time)
  // Jump skips it: everything is released and the simulation runs again.
  await page.keyboard.press('Space')
  await waitForMoment(page, null, 1000)
  await page.waitForTimeout(400)
  const c = await probe(page)
  expect(c.time).toBeGreaterThan(b.time)
  expect(c.locked).toBe(false)
  expect(c.scale).toBe(1)
  expect(c.bars).toBe(0)
  expect(errors).toEqual([])
})

test('the boss intro plays to its end and releases the simulation by itself', async ({ page }) => {
  const errors = collectErrors(page)
  await openStage(page, 4)
  await waitForMoment(page, null)
  await enterArena(page)
  await waitForMoment(page, 'boss-intro')
  const held = await probe(page)
  await waitForMoment(page, null, 4000)
  await page.waitForTimeout(300)
  const after = await probe(page)
  expect(after.time).toBeGreaterThan(held.time)
  expect(after.bars).toBe(0)
  expect(errors).toEqual([])
})

test('a defeated boss leads to an open goal, and the clear reaches the result screen within 6 s', async ({ page }) => {
  test.setTimeout(45_000)
  const errors = collectErrors(page)
  await openStage(page, 5)
  await waitForMoment(page, null)
  await enterArena(page)
  await waitForMoment(page, 'boss-intro')
  await page.keyboard.press('KeyX')
  await waitForMoment(page, null, 1000)
  await defeatBoss(page)
  expect((await probe(page)).goalOpen).toBe(true)
  // The fall and the look at the goal finish, then play resumes.
  await waitForMoment(page, null, 6000)
  expect((await probe(page)).scale).toBe(1)

  await page.evaluate(() => {
    const w = (window as unknown as { __hamham: Hook }).__hamham.world
    w.player.x = w.goalX - w.player.w - 8
    w.player.y = w.goalY + 64 - w.player.h
    w.player.vx = 0
    w.player.vy = 0
  })
  await page.keyboard.down('ArrowRight')
  await page.waitForFunction(() => (window as unknown as { __hamham: Hook }).__hamham.world.state === 'clear')
  const cleared = Date.now()
  await page.keyboard.up('ArrowRight')
  expect((await probe(page)).current).toBe('clear')
  await expect(page.locator('#result-screen')).toBeVisible({ timeout: 6000 })
  expect(Date.now() - cleared).toBeLessThan(6000)
  expect(errors).toEqual([])
})

test('dying plays the death sequence and reaches the game-over screen within 6 s', async ({ page }) => {
  const errors = collectErrors(page)
  await openStage(page, 4)
  await waitForMoment(page, null)
  await page.evaluate(() => {
    const w = (window as unknown as { __hamham: Hook }).__hamham.world
    w.player.invuln = 0
    w.hurtPlayer(99, w.player.x + 100)
  })
  const died = Date.now()
  await expect.poll(async () => (await probe(page)).current, { timeout: 1000 }).toBe('death')
  await expect(page.locator('#dead-screen')).toBeVisible({ timeout: 6000 })
  expect(Date.now() - died).toBeLessThan(6000)
  expect(errors).toEqual([])
})
