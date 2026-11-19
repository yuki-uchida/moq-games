import { expect, test, type Page } from '@playwright/test'
import { openGame, pageThroughStory, reloadGame } from './hoshi-no-hamham-helpers'

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
  await pageThroughStory(page)
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

/** What the light test reads through the hook (the view's own accessor for the gathering light of a boss's shot). */
type LightHook = {
  world: {
    player: { invuln: number }
    boss: { dead: boolean; active: boolean } | null
    shots: { hostile: boolean; dead: boolean }[]
  }
  app: {
    renderer: { k: number; ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement }
    session: {
      view: {
        draw(): void
        toCanvas(x: number, y: number): { x: number; y: number }
        actors: {
          shotCue(boss: unknown): { sheet: string; progress: number; x: number; y: number; side: number } | null
        }
      }
    } | null
  }
}

test("a boss's shot is announced on the canvas by its gathering light, which is gone when the shot leaves", async ({
  page
}) => {
  test.setTimeout(60_000)
  const errors = collectErrors(page)
  // The fox casts one orb every 2.1 s, whatever he is doing.
  await openStage(page, 7)
  await waitForMoment(page, null)
  await enterArena(page)
  await waitForMoment(page, 'boss-intro')
  await page.keyboard.press('KeyX')
  await waitForMoment(page, null, 1000)
  const result = await page.evaluate(
    () =>
      new Promise<{
        sheet: string
        progress: number
        inside: number
        outside: number
        k: number
        lightAtShot: boolean
        frames: number
      }>((resolve, reject) => {
        const h = (window as unknown as { __hamham: LightHook }).__hamham
        const view = h.app.session!.view
        const actors = view.actors
        const { canvas, ctx, k } = h.app.renderer
        const started = performance.now()
        let seen: { sheet: string; progress: number; inside: number; outside: number } | null = null
        let frames = 0
        const tick = () => {
          const boss = h.world.boss
          if (!boss || boss.dead) return reject(new Error('the boss is gone'))
          if (performance.now() - started > 20_000) return reject(new Error('no light and no shot within 20 s'))
          h.world.player.invuln = 999
          frames += 1
          const shots = h.world.shots.filter((s) => s.hostile && !s.dead).length
          const cue = actors.shotCue(boss)
          if (!seen && shots === 0 && cue && cue.progress >= 0.5) {
            // The same state drawn with the light and without it: only the light's place may differ.
            view.draw()
            const withLight = ctx.getImageData(0, 0, canvas.width, canvas.height).data
            const at = view.toCanvas(cue.x, cue.y)
            const own = actors as unknown as { shotCue?: unknown }
            own.shotCue = () => null
            view.draw()
            delete own.shotCue
            const without = ctx.getImageData(0, 0, canvas.width, canvas.height).data
            let inside = 0
            let outside = 0
            const reach = 20 * k
            for (let i = 0; i < withLight.length; i += 4) {
              if (
                withLight[i] === without[i] &&
                withLight[i + 1] === without[i + 1] &&
                withLight[i + 2] === without[i + 2]
              )
                continue
              const px = (i / 4) % canvas.width
              const py = Math.floor(i / 4 / canvas.width)
              if (Math.abs(px - at.x) <= reach && Math.abs(py - at.y) <= reach) inside += 1
              else outside += 1
            }
            view.draw()
            seen = { sheet: cue.sheet, progress: cue.progress, inside, outside }
          }
          // The frame on which his orb is in the world: the light has gone.
          if (seen && shots > 0) return resolve({ ...seen, k, lightAtShot: cue !== null, frames })
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
  )
  console.log(
    `[light] ${result.sheet} at ${result.progress.toFixed(2)}: ${result.inside} px differ at its place, ${result.outside} elsewhere (k ${result.k}, ${result.frames} frames)`
  )
  expect(result.sheet).toBe('prop:orb')
  // The light is on the canvas where the view says it is (at least a 6 x 6 px patch of the art at the canvas's scale)
  // and it is the only thing that differs.
  expect(result.inside).toBeGreaterThanOrEqual(36 * result.k * result.k)
  expect(result.outside).toBe(0)
  expect(result.lightAtShot).toBe(false)
  expect(errors).toEqual([])
})

test("a boss's gathering light never goes back when display frames drop: its last frame stays until the shot", async ({
  page
}) => {
  test.setTimeout(90_000)
  const errors = collectErrors(page)
  await openStage(page, 7)
  await waitForMoment(page, null)
  await enterArena(page)
  await waitForMoment(page, 'boss-intro')
  await page.keyboard.press('KeyX')
  await waitForMoment(page, null, 1000)
  // Six of the fox's lights, sampled on every display frame while the page itself drops frames: one frame of every
  // light is held up for 50 ms about two thirds of the way through it (where a light that grew by the length of the
  // last display frame would show its last frame for the long frame and fall back to the one before on the next),
  // and every 5th frame for 5 to 15 ms (the display's intervals are then uneven for the game's own loop).
  const result = await page.evaluate(
    () =>
      new Promise<{ lights: number[][]; longest: number; frames: number }>((resolve, reject) => {
        const h = (window as unknown as { __hamham: LightHook }).__hamham
        const actors = h.app.session!.view.actors
        const GATHER_FRAMES = 6
        const HOLD_AT = 0.63
        const started = performance.now()
        const lights: number[][] = []
        let current: number[] | null = null
        let held = false
        let last = started
        let longest = 0
        let frames = 0
        const tick = () => {
          const now = performance.now()
          if (frames > 0) longest = Math.max(longest, now - last)
          last = now
          const boss = h.world.boss
          if (!boss || boss.dead) return reject(new Error('the boss is gone'))
          if (now - started > 45_000) return reject(new Error(`only ${lights.length} lights within 45 s`))
          h.world.player.invuln = 999
          frames += 1
          const cue = actors.shotCue(boss)
          let hold = frames % 5 === 0 ? 5 + ((frames * 7919) % 11) : 0
          if (cue) {
            current ??= []
            current.push(Math.min(GATHER_FRAMES - 1, Math.floor(cue.progress * GATHER_FRAMES)))
            if (!held && cue.progress >= HOLD_AT) {
              held = true
              hold = 50
            }
          } else if (current) {
            lights.push(current)
            current = null
            held = false
            if (lights.length >= 6) return resolve({ lights, longest, frames })
          }
          if (hold > 0) {
            const until = performance.now() + hold
            while (performance.now() < until) {
              // (Holding the page's thread: the next display frame comes late.)
            }
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
  )
  console.log(
    `[light, dropped frames] ${result.lights.map((light) => light.join('')).join(' | ')} (longest frame ${result.longest.toFixed(0)} ms, ${result.frames} frames)`
  )
  // The display did drop frames.
  expect(result.longest).toBeGreaterThanOrEqual(45)
  for (const light of result.lights) {
    expect(light.length).toBeGreaterThanOrEqual(2)
    // Never back: so once its last frame has shown, nothing else shows until the shot.
    for (let i = 1; i < light.length; i++) expect(light[i]).toBeGreaterThanOrEqual(light[i - 1])
  }
  expect(errors).toEqual([])
})
