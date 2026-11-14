import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { openGame, pageThroughStory, reloadGame } from './hoshi-no-hamham-helpers'

/**
 * What the HUD costs the browser while a stage is played: the DOM entry points that write, force style or layout, or
 * draw are counted while `hud.update` runs. A frame in which nothing on the HUD changed must make no such call, a
 * stage must be played without a forced style or layout from the HUD, and the boss bar flashes on a bite, not on the
 * chase's slow drain.
 */

interface CostWorld {
  time: number
  collected: number
  goalOpen: boolean
  enemies: { dead: boolean }[]
  player: { hp: number; maxHp: number; x: number; invuln: number; biteCooldown: number }
  boss: { active: boolean; dead: boolean; invuln: number; stamina: number; x: number } | null
  damageBoss(amount: number): void
}

interface CostHook {
  world: CostWorld
  autopilot(on: boolean): void
  app: {
    hud: { update(world: CostWorld, dt: number): void }
    session: { director: { current: string | null } } | null
  }
}

interface Call {
  name: string
  /** The element the call was made on, for a failure message. */
  on: string
  /**
   * True for a call on an element that shows a value that changes by itself (the run's clock, the cycling hint, the
   * star the clock sends across the deck's sky).
   */
  ticking: boolean
}

interface CostProbe {
  updates: number
  /** The updates in which the HUD made at least one DOM call. */
  busy: number
  calls: Call[]
}

const hook = () => (window as unknown as { __hamham: CostHook }).__hamham

/** Wraps the DOM entry points; calls made inside `hud.update` are recorded in `window.__cost`. */
function installProbe() {
  const cost: CostProbe & { inside: boolean } = { updates: 0, busy: 0, calls: [], inside: false }
  ;(window as unknown as { __cost: unknown }).__cost = cost
  const ticking = (target: unknown) =>
    target instanceof Element && Boolean(target.closest('.hudd-hint, .hudd-stat, .hudd-say, .hudd-shoot'))
  const record = (name: string, target?: unknown) => {
    if (cost.inside)
      cost.calls.push({
        name,
        on: target instanceof Element ? `${target.tagName}#${target.id}.${target.className}` : '',
        ticking: ticking(target)
      })
  }
  const method = (proto: object, name: string, label: string) => {
    const original = (proto as Record<string, (...args: unknown[]) => unknown>)[name]
    ;(proto as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
      record(label, this)
      return original.apply(this, args)
    }
  }
  const setter = (proto: object, name: string, label: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name)
    if (!descriptor?.set) return
    const set = descriptor.set
    Object.defineProperty(proto, name, {
      ...descriptor,
      set(this: unknown, value: unknown) {
        record(label, this)
        set.call(this, value)
      }
    })
  }
  const getter = (proto: object, name: string, label: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name)
    if (!descriptor?.get) return
    const get = descriptor.get
    Object.defineProperty(proto, name, {
      ...descriptor,
      get(this: unknown) {
        record(label, this)
        return get.call(this)
      }
    })
  }

  // Writes to the style: every property setter of the declaration (left, top, translate, transform, ...).
  const style = CSSStyleDeclaration.prototype
  for (const name of Object.getOwnPropertyNames(style)) setter(style, name, `style.${name}`)
  method(style, 'setProperty', 'style.setProperty')
  method(style, 'removeProperty', 'style.removeProperty')
  for (const name of ['textContent', 'innerHTML', 'outerHTML'] as const) setter(Node.prototype, name, name)
  setter(Element.prototype, 'innerHTML', 'innerHTML')
  setter(Element.prototype, 'className', 'className')
  setter(HTMLElement.prototype, 'hidden', 'hidden')
  setter(HTMLElement.prototype, 'innerText', 'innerText')
  setter(HTMLCanvasElement.prototype, 'width', 'canvas.width')
  setter(HTMLCanvasElement.prototype, 'height', 'canvas.height')
  for (const name of ['setAttribute', 'removeAttribute', 'toggleAttribute', 'append', 'prepend', 'replaceChildren']) {
    method(Element.prototype, name, name)
  }
  for (const name of ['appendChild', 'removeChild', 'insertBefore']) method(Node.prototype, name, name)
  for (const name of ['add', 'remove', 'toggle', 'replace']) method(DOMTokenList.prototype, name, `classList.${name}`)
  for (const name of ['drawImage', 'putImageData', 'fillRect', 'clearRect']) {
    method(CanvasRenderingContext2D.prototype, name, `ctx.${name}`)
  }

  // Reads that force a style recalculation or a layout.
  const globalStyle = window.getComputedStyle.bind(window)
  window.getComputedStyle = (...args: Parameters<typeof getComputedStyle>) => {
    record('getComputedStyle')
    return globalStyle(...args)
  }
  method(Element.prototype, 'getBoundingClientRect', 'getBoundingClientRect')
  method(Element.prototype, 'getClientRects', 'getClientRects')
  for (const name of ['clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight', 'clientTop', 'clientLeft']) {
    getter(Element.prototype, name, name)
  }
  for (const name of ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft']) {
    getter(HTMLElement.prototype, name, name)
  }

  const hud = (window as unknown as { __hamham: CostHook }).__hamham.app.hud
  const update = hud.update.bind(hud)
  hud.update = (world, dt) => {
    cost.updates++
    cost.inside = true
    const before = cost.calls.length
    try {
      update(world, dt)
    } finally {
      cost.inside = false
      if (cost.calls.length > before) cost.busy++
    }
  }
}

const resetProbe = (page: Page) =>
  page.evaluate(() => {
    const cost = (window as unknown as { __cost: CostProbe }).__cost
    cost.updates = 0
    cost.busy = 0
    cost.calls = []
  })

/** Waits for `frames` calls of the HUD's update, then returns what was recorded meanwhile. */
async function recordFrames(page: Page, frames: number): Promise<CostProbe> {
  await resetProbe(page)
  await page.waitForFunction((n) => (window as unknown as { __cost: CostProbe }).__cost.updates >= n, frames, {
    timeout: 60_000,
    polling: 'raf'
  })
  return page.evaluate(() => {
    const cost = (window as unknown as { __cost: CostProbe }).__cost
    return { updates: cost.updates, calls: cost.calls.slice() }
  })
}

const tally = (calls: Call[]) => {
  const out: Record<string, number> = {}
  for (const call of calls) out[call.name] = (out[call.name] ?? 0) + 1
  return out
}

interface Session {
  context: BrowserContext
  page: Page
  errors: string[]
}

async function open(browser: Browser, width: number, height: number, stageNo: number): Promise<Session> {
  const context = await browser.newContext({
    viewport: { width, height },
    baseURL: `http://127.0.0.1:${process.env.E2E_PORT || 5196}`
  })
  // The callbacks run in the page, where `hook` is this global.
  await context.addInitScript(() => {
    ;(window as unknown as { hook: () => unknown }).hook = () => (window as unknown as { __hamham: unknown }).__hamham
  })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  await openGame(page)
  await page.evaluate(() =>
    localStorage.setItem(
      'hoshi-no-hamham-v1',
      JSON.stringify({
        version: 1,
        cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        unlocked: 10,
        best: {},
        muted: true,
        seenOpening: true
      })
    )
  )
  await reloadGame(page)
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page
    .locator('.stage-card')
    .nth(stageNo - 1)
    .click()
  await pageThroughStory(page, 8)
  await expect(page.locator('#hud')).toBeVisible()
  await page.evaluate(installProbe)
  // The stage's opening staging is over when the director has no moment on.
  await page.waitForFunction(() => hook().app.session?.director.current === null, null, { timeout: 30_000 })
  return { context, page, errors }
}

const PROFILES = [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 }
] as const

for (const profile of PROFILES) {
  test.describe(`HUD cost, ${profile.name} ${profile.width}x${profile.height}`, () => {
    test.setTimeout(120_000)

    test('a frame in which nothing changed makes no DOM call', async ({ browser }) => {
      const { page, context, errors } = await open(browser, profile.width, profile.height, 1)
      // The hero stands still, cannot be hurt, nothing else is on the field and the chaser sleeps.
      await page.evaluate(() => {
        const h = hook()
        h.autopilot(false)
        const w = h.world
        for (const enemy of w.enemies) enemy.dead = true
        w.player.invuln = 1e9
        w.player.biteCooldown = 0
        if (w.boss) w.boss.active = false
      })
      // A frame or two to show what changed, then 120 frames in which nothing does.
      await page.waitForTimeout(1500)
      const run = await recordFrames(page, 120)
      expect(run.updates).toBeGreaterThanOrEqual(120)
      // The clock, the cycling hint and the shooting star change by themselves; they are the only calls allowed.
      const unexpected = run.calls.filter((call) => !call.ticking)
      expect(unexpected.map((call) => `${call.name} ${call.on}`)).toEqual([])
      expect(errors).toEqual([])
      await context.close()
    })

    test('ten seconds of the bot playing: no forced style or layout, no left/top/width/height from the HUD', async ({
      browser
    }) => {
      const { page, context, errors } = await open(browser, profile.width, profile.height, 1)
      await page.evaluate(() => hook().autopilot(true))
      await page.waitForTimeout(500)
      await resetProbe(page)
      await page.waitForTimeout(10_000)
      const run = await page.evaluate(() => (window as unknown as { __cost: CostProbe }).__cost)
      expect(run.updates).toBeGreaterThan(300)
      const counts = tally(run.calls)
      expect(counts.getComputedStyle ?? 0).toBe(0)
      expect(counts.getBoundingClientRect ?? 0).toBe(0)
      expect(counts.getClientRects ?? 0).toBe(0)
      for (const name of [
        'clientWidth',
        'clientHeight',
        'offsetWidth',
        'offsetHeight',
        'scrollWidth',
        'scrollHeight'
      ]) {
        expect(counts[name] ?? 0).toBe(0)
      }
      for (const name of ['left', 'top', 'width', 'height', 'right', 'bottom']) {
        expect(counts[`style.${name}`] ?? 0).toBe(0)
      }
      expect(errors).toEqual([])
      await context.close()
    })

    test('ten seconds of the bot playing: the HUD writes in at most twenty frames a second', async ({ browser }) => {
      const { page, context, errors } = await open(browser, profile.width, profile.height, 1)
      await page.evaluate(() => hook().autopilot(true))
      await page.waitForTimeout(500)
      await resetProbe(page)
      const started = await page.evaluate(() => performance.now())
      await page.waitForTimeout(10_000)
      const run = await page.evaluate(() => (window as unknown as { __cost: CostProbe }).__cost)
      const seconds = ((await page.evaluate(() => performance.now())) - started) / 1000
      expect(run.updates).toBeGreaterThan(300)
      // The continuous meters are written together fifteen times a second; events add to that, never every frame.
      expect(run.busy / seconds).toBeLessThanOrEqual(20)
      expect(errors).toEqual([])
      await context.close()
    })

    test('the boss bar flashes when a bite lands, not while the chase drains it', async ({ browser }) => {
      const { page, context, errors } = await open(browser, profile.width, profile.height, 1)
      // Hits are counted as the class appearing on the bar.
      await page.evaluate(() => {
        const bar = document.querySelector('#boss-bar')!
        const seen = { hits: 0 }
        ;(window as unknown as { __hits: typeof seen }).__hits = seen
        new MutationObserver((records) => {
          for (const record of records) {
            const before = (record.oldValue ?? '').split(/\s+/)
            if (!before.includes('is-hit') && bar.classList.contains('is-hit')) seen.hits++
          }
        }).observe(bar, { attributes: true, attributeFilter: ['class'], attributeOldValue: true })
        const h = hook()
        h.autopilot(false)
        const w = h.world
        for (const enemy of w.enemies) enemy.dead = true
        w.player.invuln = 1e9
        w.boss!.invuln = 0
      })
      // The chaser comes at the standing hero and her stamina drains; the bar must be up and the chase on.
      await expect(page.locator('#boss-bar')).toBeVisible({ timeout: 30_000 })
      const stamina = () => page.evaluate(() => hook().world.boss!.stamina)
      const before = await stamina()
      await page.waitForTimeout(3000)
      expect(await stamina()).toBeLessThan(before)
      expect(await page.evaluate(() => (window as unknown as { __hits: { hits: number } }).__hits.hits)).toBe(0)
      await expect(page.locator('#boss-bar')).not.toHaveClass(/is-hit/)
      await expect(page.locator('#boss-bar')).toHaveClass(/is-stamina/)

      await page.evaluate(() => hook().world.damageBoss(1))
      await page.waitForTimeout(150)
      expect(await page.evaluate(() => (window as unknown as { __hits: { hits: number } }).__hits.hits)).toBe(1)
      // The shake ends and the bar goes back to quiet; the drain after it does not start it again.
      await expect(page.locator('#boss-bar')).not.toHaveClass(/is-hit/, { timeout: 3000 })
      await page.waitForTimeout(1500)
      expect(await page.evaluate(() => (window as unknown as { __hits: { hits: number } }).__hits.hits)).toBe(1)
      expect(errors).toEqual([])
      await context.close()
    })
  })
}

test.describe('HUD animations restart without forcing style', () => {
  test.setTimeout(120_000)

  test('the hearts, the collect counter and the aim line start their animation again on every change', async ({
    browser
  }) => {
    // Stage 6 collects materials: its counter and its aim line change with `world.collected`.
    const { page, context, errors } = await open(browser, 390, 844, 6)
    await page.evaluate(() => {
      const starts: { name: string; target: string }[] = []
      ;(window as unknown as { __starts: typeof starts }).__starts = starts
      window.addEventListener(
        'animationstart',
        (event) => {
          const node = event.target as HTMLElement
          starts.push({ name: event.animationName, target: node.id || node.className })
        },
        true
      )
      const h = hook()
      h.autopilot(false)
      for (const enemy of h.world.enemies) enemy.dead = true
      h.world.player.invuln = 1e9
    })
    const starts = (target: string, name?: string) =>
      page.evaluate(
        ([t, n]) =>
          (window as unknown as { __starts: { name: string; target: string }[] }).__starts.filter(
            (s) => (!t || s.target.split(/\s+/).includes(t as string)) && (!n || s.name === n)
          ).length,
        [target, name ?? '']
      )
    await page.waitForTimeout(800)

    // Three changes of the counter, each a little after the one before: the pop and the aim line start three times.
    const popsBefore = await starts('', 'hudx-pop')
    const aimBefore = await starts('hudd-aim', 'hudd-pop')
    for (let i = 1; i <= 3; i++) {
      await page.evaluate((n) => {
        hook().world.collected = n
      }, i)
      await page.waitForTimeout(500)
    }
    expect((await starts('', 'hudx-pop')) - popsBefore).toBe(3)
    expect((await starts('hudd-aim', 'hudd-pop')) - aimBefore).toBe(3)

    // The hearts: each loss restarts the shake, though the class from the loss before is still on the element.
    const shakesBefore = await starts('hearts', 'hudx-shake')
    for (const hp of [2, 1]) {
      await page.evaluate((value) => {
        hook().world.player.hp = value
      }, hp)
      await page.waitForTimeout(700)
    }
    expect((await starts('hearts', 'hudx-shake')) - shakesBefore).toBe(2)

    // None of it forced a style recalculation or a layout from the HUD's update.
    const forced = await page.evaluate(() =>
      (window as unknown as { __cost: CostProbe }).__cost.calls.filter(
        (call) => call.name === 'getComputedStyle' || call.name === 'getBoundingClientRect'
      )
    )
    expect(forced).toEqual([])
    expect(errors).toEqual([])
    await context.close()
  })
})
