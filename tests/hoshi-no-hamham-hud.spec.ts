import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

interface HudWorld {
  player: { hp: number; maxHp: number; x: number; y: number; w: number; h: number; invuln: number }
  boss: { x: number; y: number; w: number; h: number; hp: number; maxHp: number; dead: boolean } | null
}

interface HudHook {
  world: HudWorld
  app: {
    hud: {
      showCall(text: string, tone?: string): void
      showNameplate(name: string, title: string, face: string, seconds?: number): void
      showBoss(name: string, title: string): void
      showToast(text: string): void
      cinematic(on: boolean): void
      speak(text: string, who: string, face: string, seconds: number): boolean
    }
    input: { poll(): Record<string, boolean> }
  }
}

const hook = () => (window as unknown as { __hamham: HudHook }).__hamham

type TouchPoint = { x: number; y: number; id: number }

interface Session {
  context: BrowserContext
  page: Page
  errors: string[]
  touch(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: TouchPoint[]): Promise<void>
}

async function open(
  browser: Browser,
  width: number,
  height: number,
  stageNo: number,
  touch = false,
  settle = true
): Promise<Session> {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    baseURL: `http://127.0.0.1:${process.env.E2E_PORT || 5196}`
  })
  // The page callbacks below reach the test hook through this global.
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
  for (let i = 0; i < 8; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
  await expect(page.locator('#hud')).toBeVisible()
  const cdp = touch ? await context.newCDPSession(page) : null
  const session: Session = {
    context,
    page,
    errors,
    touch: async (type, points) => {
      await cdp!.send('Input.dispatchTouchEvent', { type, touchPoints: points })
    }
  }
  if (touch) {
    // A real touch is what reveals the controls.
    await session.touch('touchStart', [{ x: 4, y: 4, id: 9 }])
    await session.touch('touchEnd', [{ x: 4, y: 4, id: 9 }])
    await expect(page.locator('#touch-controls')).toBeVisible()
  }
  if (settle) await page.waitForTimeout(300)
  return session
}

const centre = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const keys = (page: Page) => page.evaluate(() => hook().app.input.poll())

const scaleOf = async (page: Page, selector: string) =>
  Number((await page.locator(selector).evaluate((node) => (node as HTMLElement).style.transform)).match(/[\d.]+/)![0])

test('hearts are sprites of the ui sheet, one per heart, and losing health changes them', async ({ browser }) => {
  const { page, context, errors } = await open(browser, 1280, 720, 1)
  const hearts = page.locator('#hearts .heart')
  // The chase starts with a bump: heal first so every heart is full.
  const max = await page.evaluate(() => {
    const player = hook().world.player
    player.invuln = 999
    player.hp = player.maxHp
    return player.maxHp
  })
  await page.waitForTimeout(600)
  await expect(hearts).toHaveCount(max)
  await expect(page.locator('#hearts .heart.is-full')).toHaveCount(max)
  // Each heart is a canvas holding a 16x16 art raster, shown at a whole-number scale (32 px at 1280x720).
  const sizes = await hearts.evaluateAll((nodes) =>
    nodes.map((node) => {
      const canvas = node as HTMLCanvasElement
      return {
        w: canvas.width,
        h: canvas.height,
        css: canvas.getBoundingClientRect().width,
        sprite: canvas.dataset.sprite
      }
    })
  )
  for (const size of sizes) {
    expect(size.w).toBe(16)
    expect(size.h).toBe(16)
    expect(size.sprite).toBe('heartFull')
    expect(size.css).toBeGreaterThanOrEqual(30)
    expect(size.css).toBeLessThanOrEqual(34)
  }
  const painted = await hearts.first().evaluate((node) => {
    const canvas = node as HTMLCanvasElement
    return canvas
      .getContext('2d')!
      .getImageData(0, 0, 16, 16)
      .data.some((v, i) => i % 4 === 3 && v > 0)
  })
  expect(painted).toBe(true)

  await page.evaluate(() => {
    hook().world.player.hp = hook().world.player.maxHp - 2
  })
  await page.waitForFunction(
    () => document.querySelectorAll('#hearts .heart[data-sprite="heartLose"]').length > 0,
    null,
    { polling: 'raf' }
  )
  await expect(page.locator('#hearts .heart.is-full')).toHaveCount(max - 2)
  await expect(page.locator('#hearts .heart[data-sprite="heartEmpty"]')).toHaveCount(2)
  await page.evaluate(() => {
    hook().world.player.hp = hook().world.player.maxHp
  })
  await page.waitForFunction(
    () => document.querySelectorAll('#hearts .heart[data-sprite="heartGain"]').length > 0,
    null,
    { polling: 'raf' }
  )
  await expect(page.locator('#hearts .heart.is-full')).toHaveCount(max)

  // At two hearts or fewer the remaining hearts pulse.
  await page.evaluate(() => {
    hook().world.player.hp = 2
  })
  await expect(page.locator('#hearts.is-low')).toHaveCount(1)
  expect(errors).toEqual([])
  await context.close()
})

test('the collect counter shows 0/8 in the nest stage', async ({ browser }) => {
  const { page, context, errors } = await open(browser, 1280, 720, 6)
  await expect(page.locator('.hudx-collect')).toBeVisible()
  await expect(page.locator('.hudx-collect b')).toHaveText('0/8')
  expect(errors).toEqual([])
  await context.close()
})

test('the boss bar appears with a portrait in a boss fight and drains on a hit', async ({ browser }) => {
  const { page, context, errors } = await open(browser, 1280, 720, 5)
  await expect(page.locator('#boss-bar')).toBeHidden()
  await page.evaluate(() => {
    const world = hook().world
    const boss = world.boss!
    world.player.invuln = 999
    world.player.x = boss.x - 300
    world.player.y = boss.y + boss.h - world.player.h
  })
  await expect(page.locator('#boss-bar')).toBeVisible({ timeout: 8000 })
  const face = page.locator('#boss-bar canvas.hudx-boss-face')
  await expect(face).toHaveCount(1)
  expect(
    await face.evaluate((node) => {
      const canvas = node as HTMLCanvasElement
      return (
        canvas.width === 32 &&
        canvas
          .getContext('2d')!
          .getImageData(0, 0, 32, 32)
          .data.some((v, i) => i % 4 === 3 && v > 0)
      )
    })
  ).toBe(true)
  await expect(page.locator('#boss-bar .hudx-boss-head b')).not.toHaveText('')
  await page.waitForTimeout(500)
  expect(await scaleOf(page, '#boss-bar .hudx-fill')).toBeGreaterThan(0.95)
  await page.evaluate(() => {
    const boss = hook().world.boss!
    boss.hp = Math.floor(boss.maxHp / 2)
  })
  await page.waitForTimeout(300)
  const fill = await scaleOf(page, '#boss-bar .hudx-fill')
  const trail = await scaleOf(page, '#boss-bar .hudx-trail')
  expect(fill).toBeLessThan(0.7)
  expect(trail).toBeGreaterThanOrEqual(fill)
  // The fallen boss's bar breaks away and hides.
  await page.evaluate(() => {
    hook().world.boss!.dead = true
  })
  await expect(page.locator('#boss-bar')).toBeHidden({ timeout: 4000 })
  expect(errors).toEqual([])
  await context.close()
})

test('the stage 1 chase shows the stamina bar from the start', async ({ browser }) => {
  const { page, context } = await open(browser, 1280, 720, 1)
  await expect(page.locator('#boss-bar')).toBeVisible()
  await expect(page.locator('#boss-bar.is-stamina')).toHaveCount(1)
  await context.close()
})

test('call, nameplate, toast and cinematic mode do what they say', async ({ browser }) => {
  const { page, context, errors } = await open(browser, 1280, 720, 5)
  // Let the stage's own opening finish, then keep staging from speaking over this test's calls.
  await page.waitForTimeout(2400)
  await page.evaluate(() => {
    const director = hook().app.session.director
    director.update = () => {}
    director.handle = () => {}
    const hud = hook().app.hud
    hud.showCall('スタート！', 'pink')
    hud.showNameplate('おおかみ檄', 'ぐんだんの かしら', 'face_wolfBoss', 4)
    hud.showToast('かじってみよう')
  })
  await page.waitForTimeout(600)
  const call = page.locator('.hudx-call')
  await expect(call).toHaveText('スタート！')
  await expect(call).toHaveAttribute('data-tone', 'pink')
  await expect(call).toHaveClass(/is-show/)
  await expect(page.locator('.hudx-plate')).toHaveClass(/is-show/)
  await expect(page.locator('.hudx-plate b')).toHaveText('おおかみ檄')
  await expect(page.locator('.hudx-plate span')).toHaveText('ぐんだんの かしら')
  expect(await page.locator('.hudx-plate canvas').evaluate((node) => (node as HTMLCanvasElement).width)).toBe(32)
  await expect(page.locator('.hudx-toast')).toHaveText('かじってみよう')
  const hearts = (await page.locator('#hearts').boundingBox())!
  expect(hearts.x).toBeGreaterThan(0)

  await page.evaluate(() => hook().app.hud.cinematic(true))
  await page.waitForTimeout(700)
  const away = (await page.locator('#hearts').boundingBox())!
  expect(away.x + away.width).toBeLessThanOrEqual(0)
  const buttons = (await page.locator('#pause').boundingBox())!
  expect(buttons.x).toBeGreaterThanOrEqual(1280)
  // Staging pieces stay visible in cinematic mode.
  await page.evaluate(() => hook().app.hud.showCall('クリア！', 'gold'))
  await page.waitForTimeout(400)
  expect(Number(await page.locator('.hudx-call').evaluate((node) => getComputedStyle(node).opacity))).toBeGreaterThan(
    0.5
  )
  await page.evaluate(() => hook().app.hud.cinematic(false))
  await page.waitForTimeout(700)
  const back = (await page.locator('#hearts').boundingBox())!
  expect(back.x).toBeGreaterThan(0)
  expect(errors).toEqual([])
  await context.close()
})

test('the pause and mute buttons are pixel buttons with 44 px targets', async ({ browser }) => {
  const { page, context } = await open(browser, 844, 390, 1)
  for (const id of ['#pause', '#mute']) {
    const box = (await page.locator(id).boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  const icon = () => page.locator('#mute').evaluate((node) => getComputedStyle(node).getPropertyValue('--icon'))
  const before = await icon()
  await page.keyboard.press('KeyM')
  await page.waitForTimeout(100)
  expect(await icon()).not.toBe(before)
  // The emoji text the screens layer sets is not painted.
  expect(await page.locator('#mute').evaluate((node) => getComputedStyle(node).fontSize)).toBe('0px')
  await context.close()
})

test('touch controls: slide across the pad, hold it while biting and jumping, let go on cancel', async ({
  browser
}) => {
  const { page, context, errors, touch } = await open(browser, 844, 390, 1, true)
  const left = await centre(page, '[data-key="left"]')
  const right = await centre(page, '[data-key="right"]')
  const jump = await centre(page, '[data-key="jump"]')
  const bite = await centre(page, '[data-key="bite"]')
  for (const key of ['left', 'right', 'jump', 'bite']) {
    const box = (await page.locator(`[data-key="${key}"]`).boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(64)
    expect(box.height).toBeGreaterThanOrEqual(64)
  }
  // Controls sit inside the viewport.
  const pad = (await page.locator('.hudt-pad').boundingBox())!
  const actions = (await page.locator('.hudt-actions').boundingBox())!
  expect(pad.x + 12).toBeGreaterThanOrEqual(0)
  expect(actions.x + actions.width).toBeLessThanOrEqual(844)
  expect(pad.x + pad.width / 2).toBeLessThan(actions.x)

  await touch('touchStart', [{ ...left, id: 1 }])
  await page.waitForTimeout(80)
  expect(await keys(page)).toMatchObject({ left: true, right: false })
  await expect(page.locator('[data-key="left"]')).toHaveClass(/is-down/)
  // Slide to the right arrow without lifting the thumb.
  const mid = { x: (left.x + right.x) / 2, y: left.y }
  await touch('touchMove', [{ ...mid, id: 1 }])
  await touch('touchMove', [{ ...right, id: 1 }])
  await page.waitForTimeout(80)
  expect(await keys(page)).toMatchObject({ left: false, right: true })
  await expect(page.locator('[data-key="right"]')).toHaveClass(/is-down/)
  await expect(page.locator('[data-key="left"]')).not.toHaveClass(/is-down/)
  // Slide off the end of the pad: it still presses right.
  const off = { x: right.x + 200, y: right.y - 120, id: 1 }
  await touch('touchMove', [off])
  await page.waitForTimeout(60)
  expect(await keys(page)).toMatchObject({ right: true })

  // Hold the pad and press bite and jump with other fingers.
  await touch('touchStart', [off, { ...bite, id: 2 }])
  await touch('touchStart', [off, { ...bite, id: 2 }, { ...jump, id: 3 }])
  await page.waitForTimeout(80)
  expect(await keys(page)).toMatchObject({ right: true, bite: true, jump: true })
  // Lift jump (touchEnd lists the fingers that lift): the others stay.
  await touch('touchEnd', [{ ...jump, id: 3 }])
  await page.waitForTimeout(80)
  expect(await keys(page)).toMatchObject({ right: true, bite: true, jump: false })

  // A cancelled touch leaves nothing pressed.
  await touch('touchCancel', [])
  await page.waitForTimeout(100)
  expect(await keys(page)).toMatchObject({ left: false, right: false, bite: false, jump: false })
  await expect(page.locator('.hudt .is-down')).toHaveCount(0)

  // Pointer events too: a pointercancel releases a held pad.
  await touch('touchStart', [{ ...left, id: 4 }])
  await page.waitForTimeout(60)
  expect(await keys(page)).toMatchObject({ left: true })
  await page.evaluate(() => {
    const target = document.querySelector('.hudt-pad')!
    for (let id = 0; id < 40; id++)
      target.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, bubbles: true }))
  })
  await page.waitForTimeout(60)
  expect(await keys(page)).toMatchObject({ left: false })
  await touch('touchEnd', [{ ...left, id: 4 }])

  // No selection, no context menu, no zoom gestures on the controls.
  const styles = await page
    .locator('.hudt-key')
    .first()
    .evaluate((node) => {
      const style = getComputedStyle(node)
      return { touchAction: style.touchAction, select: style.userSelect }
    })
  expect(styles.touchAction).toBe('none')
  expect(styles.select).toBe('none')
  const prevented = await page.locator('.hudt-pad').evaluate((node) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    node.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(true)
  expect(errors).toEqual([])
  await context.close()
})

test('touch controls stay hidden without a touch', async ({ browser }) => {
  const { page, context } = await open(browser, 1280, 720, 1)
  await expect(page.locator('#touch-controls')).toBeHidden()
  await context.close()
})

test('in portrait the controls sit below the stage and are bigger', async ({ browser }) => {
  const { page, context, errors } = await open(browser, 390, 844, 5, true)
  const stage = (await page.locator('#stage-wrap').boundingBox())!
  const pad = (await page.locator('.hudt-pad').boundingBox())!
  const actions = (await page.locator('.hudt-actions').boundingBox())!
  expect(pad.y).toBeGreaterThanOrEqual(stage.y + stage.height)
  expect(actions.y).toBeGreaterThanOrEqual(stage.y + stage.height)
  expect(pad.x).toBeGreaterThanOrEqual(0)
  expect(actions.x + actions.width).toBeLessThanOrEqual(390)
  expect(pad.x + pad.width).toBeLessThanOrEqual(actions.x + 1)
  const key = (await page.locator('[data-key="left"]').boundingBox())!
  expect(key.width).toBeGreaterThanOrEqual(80)
  expect(errors).toEqual([])
  await context.close()
})

for (const [width, height] of [
  [1280, 720],
  [844, 390],
  [667, 375],
  [390, 844],
  [320, 568]
]) {
  test(`no HUD element overlaps another at ${width}x${height}`, async ({ browser }) => {
    const touch = width < 1000
    const { page, context, errors } = await open(browser, width, height, 6, touch)
    await page.evaluate(() => hook().app.hud.showBoss('いのしし番長', 'ばんちょう'))
    await page.waitForTimeout(700)
    const rects = await page.evaluate(() => {
      const out: { name: string; x: number; y: number; w: number; h: number }[] = []
      for (const node of Array.from(document.querySelectorAll<HTMLElement>('#hud [data-hudbox]'))) {
        const r = node.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        out.push({ name: node.className || node.id, x: r.left, y: r.top, w: r.width, h: r.height })
      }
      return out
    })
    expect(rects.length).toBeGreaterThanOrEqual(6)
    for (let i = 0; i < rects.length; i++) {
      const a = rects[i]
      expect(a.x).toBeGreaterThanOrEqual(-0.5)
      expect(a.x + a.w).toBeLessThanOrEqual(width + 0.5)
      for (const b of rects.slice(i + 1)) {
        const overlap = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5
        expect(overlap, `${a.name} overlaps ${b.name}`).toBe(false)
      }
    }
    expect(errors).toEqual([])
    await context.close()
  })
}

// ------------------------------------------------------------------------------------------------ layout of the staging pieces
// The stage card, the calls, the boss nameplate and the toast follow one set of zones (hud-model.ts, ZONES): the
// upper third holds one card or call at a time, the nameplate sits in the lower third above the letterbox bar and
// off the boss, the toast sits above the bottom edge. Sampled every frame while the real moments play.

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Frame {
  stage: Box
  /** The visible staging pieces. */
  pieces: Record<string, Box>
  /** Speech bubbles on screen (screen pixels). */
  bubbles: (Box & { text: string })[]
  /** The other HUD parts that are on screen. */
  hud: Record<string, Box>
  boss: Box | null
  popups: string[]
  moment: string | null
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

type LayoutHook = {
  view: {
    camera: { x: number; y: number }
    overlay: { bubbleRects: (Box & { text: string })[]; popupTexts: string[] }
  } | null
  app: { session: { director: { current?: string | null; skip?(): boolean } } | null }
  world: HudWorld & {
    state: string
    goalOpen: boolean
    goalX: number
    goalY: number
    enemies: { dead: boolean }[]
    boss: (NonNullable<HudWorld['boss']> & { arenaX: number }) | null
    player: HudWorld['player'] & { vx: number; vy: number }
  }
}

/** Records the layout on every animation frame for `ms`. */
function recordLayout(page: Page, ms: number): Promise<Frame[]> {
  return page.evaluate(
    (duration) =>
      new Promise<Frame[]>((resolve) => {
        const h = (window as unknown as { __hamham: LayoutHook }).__hamham
        const frames: Frame[] = []
        const box = (node: Element | null, minOpacity = 0): Box | null => {
          if (!node) return null
          const style = getComputedStyle(node)
          if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) <= minOpacity)
            return null
          const r = node.getBoundingClientRect()
          return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
        }
        const t0 = performance.now()
        const tick = () => {
          const stage = box(document.querySelector('#stage-wrap'))!
          const pieces: Record<string, Box> = {}
          for (const [name, sel] of [
            ['banner', '.hudx-banner'],
            ['call', '.hudx-call'],
            ['plate', '.hudx-plate'],
            ['toast', '.hudx-toast']
          ] as const) {
            const b = box(document.querySelector(sel), 0.05)
            if (b) pieces[name] = b
          }
          const hud: Record<string, Box> = {}
          for (const [name, sel] of [
            ['hearts', '#hearts'],
            ['tag', '.hudx-tag'],
            ['collect', '.hudx-collect'],
            ['bite', '.hudx-bite'],
            ['bossBar', '#boss-bar'],
            ['mute', '#mute'],
            ['pause', '#pause']
          ] as const) {
            const b = box(document.querySelector(sel))
            if (b) hud[name] = b
          }
          document.querySelectorAll('.hudt-key').forEach((node, i) => {
            const b = box(node)
            if (b) hud[`key${i}`] = b
          })
          const canvas = document.querySelector('#game')!.getBoundingClientRect()
          const k = canvas.width / 640
          const cam = h.view?.camera
          const boss = h.world.boss
          frames.push({
            stage: stage,
            pieces,
            hud,
            bubbles: (h.view?.overlay.bubbleRects ?? []).map((b) => ({
              text: b.text,
              x: canvas.x + b.x * k,
              y: canvas.y + b.y * k,
              w: b.w * k,
              h: b.h * k
            })),
            boss:
              boss && cam && !boss.dead
                ? {
                    x: canvas.x + (boss.x - cam.x) * k,
                    y: canvas.y + (boss.y - cam.y) * k,
                    w: boss.w * k,
                    h: boss.h * k
                  }
                : null,
            popups: h.view?.overlay.popupTexts ?? [],
            moment: h.app.session?.director.current ?? null
          })
          if (performance.now() - t0 < duration) requestAnimationFrame(tick)
          else resolve(frames)
        }
        tick()
      }),
    ms
  )
}

/** No two pieces of one frame touch; none touches a HUD part, the touch keys or a speech bubble; all stay on the stage. */
function expectClear(frames: Frame[], label: string) {
  for (const f of frames) {
    const names = Object.keys(f.pieces)
    for (let i = 0; i < names.length; i++) {
      const a = f.pieces[names[i]]
      for (const n of names.slice(i + 1))
        expect(
          overlaps(a, f.pieces[n]),
          `${label}: ${names[i]} overlaps ${n} (${JSON.stringify([a, f.pieces[n]])})`
        ).toBe(false)
      for (const [n, b] of Object.entries(f.hud))
        expect(overlaps(a, b), `${label}: ${names[i]} overlaps ${n} (${JSON.stringify([a, b])})`).toBe(false)
      if (names[i] !== 'toast')
        for (const bubble of f.bubbles)
          expect(overlaps(a, bubble), `${label}: ${names[i]} overlaps the bubble 「${bubble.text}」`).toBe(false)
      {
        expect(a.x, `${label}: ${names[i]} inside the stage`).toBeGreaterThanOrEqual(f.stage.x - 1)
        expect(a.x + a.w, `${label}: ${names[i]} inside the stage`).toBeLessThanOrEqual(f.stage.x + f.stage.w + 1)
      }
      expect(a.y, `${label}: ${names[i]} inside the stage`).toBeGreaterThanOrEqual(f.stage.y - 1)
      expect(a.y + a.h, `${label}: ${names[i]} inside the stage`).toBeLessThanOrEqual(f.stage.y + f.stage.h + 1)
    }
  }
}

const LAYOUT_SIZES: [number, number][] = [
  [1280, 720],
  [844, 390],
  [667, 375]
]

async function waitForQuiet(page: Page) {
  await page.waitForFunction(() => {
    const h = (window as unknown as { __hamham?: LayoutHook }).__hamham
    return Boolean(h?.view && h.app.session && !h.app.session.director.current)
  })
}

async function enterArena(page: Page) {
  await page.evaluate(() => {
    const w = (window as unknown as { __hamham: LayoutHook }).__hamham.world
    for (const e of w.enemies) e.dead = true
    const b = w.boss!
    w.player.invuln = 999
    w.player.x = b.arenaX + 4
    w.player.y = b.y + b.h - w.player.h
    w.player.vx = 0
    w.player.vy = 0
  })
}

for (const [width, height] of LAYOUT_SIZES) {
  test(`stage 1 start: the card, the 「スタート！」 call, the yell and the toast keep apart at ${width}x${height}`, async ({
    browser
  }) => {
    const { page, context, errors } = await open(browser, width, height, 1, width < 1000, false)
    const frames = await recordLayout(page, 3200)
    expectClear(frames, `stage 1 start ${width}x${height}`)
    const seen = new Set(frames.flatMap((f) => Object.keys(f.pieces)))
    expect(seen.has('banner') && seen.has('call')).toBe(true)
    // The card is gone before the call comes, and both sit in the upper part of the stage.
    const firstCall = frames.findIndex((f) => f.pieces.call)
    expect(frames.slice(firstCall).some((f) => f.pieces.banner)).toBe(false)
    for (const f of frames) {
      for (const name of ['banner', 'call'] as const) {
        const p = f.pieces[name]
        if (p) expect(p.y + p.h).toBeLessThanOrEqual(f.stage.y + f.stage.h * 0.62)
      }
    }
    expect(frames.some((f) => f.bubbles.some((b) => b.text === 'こらーっ！まちなさーい！'))).toBe(true)
    expect(errors).toEqual([])
    await context.close()
  })

  test(`stage 5 boss intro: the nameplate sits low, off the boss, clear of every other piece at ${width}x${height}`, async ({
    browser
  }) => {
    const touch = width < 1000
    const { page, context, errors } = await open(browser, width, height, 5, touch)
    await waitForQuiet(page)
    await page.waitForTimeout(1800)
    await enterArena(page)
    await page.waitForFunction(
      () => (window as unknown as { __hamham: LayoutHook }).__hamham.app.session?.director.current === 'boss-intro'
    )
    const frames = await recordLayout(page, 3200)
    expectClear(frames, `boss intro ${width}x${height}`)
    const plates = frames.filter((f) => f.pieces.plate)
    expect(plates.length).toBeGreaterThan(20)
    for (const f of plates) {
      const plate = f.pieces.plate
      // The lower third, above the letterbox bar.
      expect(plate.y).toBeGreaterThanOrEqual(f.stage.y + f.stage.h * 0.5)
      expect(plate.y + plate.h).toBeLessThanOrEqual(f.stage.y + f.stage.h * (1 - 34 / 360))
      if (f.boss) expect(overlaps(plate, f.boss), 'the nameplate covers the boss').toBe(false)
    }
    expect(errors).toEqual([])
    await context.close()
  })

  test(`clear: 「クリア！」 sits in the upper third, the goal label is gone, bubbles stay clear at ${width}x${height}`, async ({
    browser
  }) => {
    test.setTimeout(60_000)
    const touch = width < 1000
    const { page, context, errors } = await open(browser, width, height, 5, touch)
    await waitForQuiet(page)
    await page.waitForTimeout(1800)
    await enterArena(page)
    await page.waitForFunction(
      () => (window as unknown as { __hamham: LayoutHook }).__hamham.app.session?.director.current === 'boss-intro'
    )
    await page.evaluate(() => (window as unknown as { __hamham: LayoutHook }).__hamham.app.session?.director.skip?.())
    await waitForQuiet(page)
    for (let attempt = 0; attempt < 12; attempt++) {
      await page.evaluate(() => {
        const w = (window as unknown as { __hamham: LayoutHook }).__hamham.world
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
      if (await page.evaluate(() => Boolean((window as unknown as { __hamham: LayoutHook }).__hamham.world.boss?.dead)))
        break
    }
    await waitForQuiet(page)
    await page.evaluate(() => {
      const w = (window as unknown as { __hamham: LayoutHook }).__hamham.world
      w.player.x = w.goalX - w.player.w - 8
      w.player.y = w.goalY + 64 - w.player.h
      w.player.vx = 0
      w.player.vy = 0
    })
    // Record right through the walk into the goal; the clear is the last part of the recording.
    await page.keyboard.down('ArrowRight')
    const frames = await recordLayout(page, 1900)
    await page.keyboard.up('ArrowRight')
    const cleared = frames.findIndex((f) => f.moment === 'clear')
    expect(cleared).toBeGreaterThanOrEqual(0)
    const clear = frames.slice(cleared)
    expectClear(clear, `clear ${width}x${height}`)
    expect(clear.some((f) => f.pieces.call)).toBe(true)
    for (const f of clear) {
      expect(f.popups, 'the goal label is gone once the stage is cleared').not.toContain('ゴール！')
      const call = f.pieces.call
      if (call) {
        expect(call.y).toBeGreaterThanOrEqual(f.stage.y)
        expect(call.y + call.h).toBeLessThanOrEqual(f.stage.y + f.stage.h * 0.5)
      }
    }
    expect(errors).toEqual([])
    await context.close()
  })
}

// ------------------------------------------------------------------------------------------------ the control deck
// In portrait the area under the stage is one designed body with the stage: information right under it, the
// controls (or, without touch, the key legend) in its lower part, reaching the bottom of the viewport.

const PORTRAIT_SIZES: [number, number][] = [
  [390, 844],
  [414, 896],
  [360, 640],
  [320, 568]
]

const rectOf = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).boundingBox())!
  return { x: box.x, y: box.y, w: box.width, h: box.height }
}

for (const [width, height] of PORTRAIT_SIZES) {
  test(`portrait ${width}x${height}: the deck joins the stage, holds the aim, the hints and the controls`, async ({
    browser
  }) => {
    test.setTimeout(60_000)
    const { page, context, errors } = await open(browser, width, height, 2, true)
    const stage = await rectOf(page, '#stage-wrap')
    const deck = await rectOf(page, '.hudd')
    const controls = await rectOf(page, '#touch-controls')
    const stageBottom = stage.y + stage.h
    // The deck starts where the stage ends and reaches the bottom of the viewport.
    expect(Math.abs(deck.y - stageBottom)).toBeLessThanOrEqual(1)
    expect(Math.abs(deck.y + deck.h - height)).toBeLessThanOrEqual(1)
    expect(deck.x).toBeLessThanOrEqual(0.5)
    expect(deck.x + deck.w).toBeGreaterThanOrEqual(width - 0.5)
    // The controls follow the information directly: no gap of more than 100 px under the stage.
    expect(controls.y - stageBottom).toBeGreaterThanOrEqual(-1)
    expect(controls.y - stageBottom).toBeLessThanOrEqual(100)
    expect(controls.y + controls.h).toBeLessThanOrEqual(height + 1)

    const parts: Record<string, Box> = {
      aim: await rectOf(page, '.hudd-aim'),
      hint: await rectOf(page, '.hudd-hint'),
      pad: await rectOf(page, '.hudt-pad'),
      jump: await rectOf(page, '[data-key="jump"]'),
      bite: await rectOf(page, '[data-key="bite"]')
    }
    const names = Object.keys(parts)
    for (let i = 0; i < names.length; i++) {
      const a = parts[names[i]]
      expect(a.y, `${names[i]} is under the stage`).toBeGreaterThanOrEqual(stageBottom - 1)
      expect(a.y + a.h, `${names[i]} is on screen`).toBeLessThanOrEqual(height + 1)
      for (const n of names.slice(i + 1)) {
        const b = parts[n]
        const hit = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5
        expect(hit, `${names[i]} overlaps ${n}`).toBe(false)
      }
    }
    for (const key of ['left', 'right', 'jump', 'bite']) {
      const box = await rectOf(page, `[data-key="${key}"]`)
      expect(box.w, `${key} width`).toBeGreaterThanOrEqual(64)
      expect(box.h, `${key} height`).toBeGreaterThanOrEqual(64)
    }
    await expect(page.locator('.hudd-aim')).not.toHaveText('')

    // The hint line cycles (after the stage's own opening toast has gone).
    await page.waitForFunction(() => !document.querySelector('.hudd-hint')!.classList.contains('is-toast'), null, {
      timeout: 10_000
    })
    const first = await page.locator('.hudd-hint').textContent()
    await page.waitForFunction((text) => document.querySelector('.hudd-hint')!.textContent !== text, first, {
      timeout: 10_000
    })
    // Touch players read button names, not keys.
    expect(await page.locator('.hudd-hint').textContent()).not.toMatch(/Z\s*\/\s*X/)

    // A toast appears in the hint line, not over the small stage.
    await page.evaluate(() => hook().app.hud.showToast('Z / X でかじってみよう'))
    await expect(page.locator('.hudd-hint')).toHaveText('「かじる」ボタンでかじってみよう')
    await expect(page.locator('.hudd-hint')).toHaveClass(/is-toast/)
    await expect(page.locator('.hudx-toast')).not.toHaveClass(/is-show/)
    expect(errors).toEqual([])
    await context.close()
  })
}

test('portrait without touch: the deck shows the key legend where the buttons would be', async ({ browser }) => {
  const { page, context, errors } = await open(browser, 390, 844, 1)
  await expect(page.locator('#touch-controls')).toBeHidden()
  const legend = page.locator('.hudd-legend')
  await expect(legend).toBeVisible()
  await expect(legend.locator('.hudd-cap')).toHaveCount(5)
  await expect(legend).toContainText('あるく')
  await expect(legend).toContainText('ジャンプ')
  await expect(legend).toContainText('かじる')
  await expect(legend).toContainText('ポーズ')
  const deck = await rectOf(page, '.hudd')
  const box = await rectOf(page, '.hudd-legend')
  const hint = await rectOf(page, '.hudd-hint')
  expect(box.y).toBeGreaterThanOrEqual(hint.y + hint.h)
  expect(box.y + box.h).toBeLessThanOrEqual(deck.y + deck.h)
  // Keyboard players read the keys.
  await page.evaluate(() => hook().app.hud.showToast('Z / X でかじってみよう'))
  await expect(page.locator('.hudd-hint')).toHaveText('Z / X でかじってみよう')
  expect(errors).toEqual([])
  await context.close()
})

test('landscape has no deck: the controls stay in the lower corners of the stage', async ({ browser }) => {
  const { page, context, errors } = await open(browser, 844, 390, 1, true)
  expect(await page.locator('.hudd').evaluate((node) => getComputedStyle(node).display)).toBe('contents')
  await expect(page.locator('.hudd-info')).toBeHidden()
  await expect(page.locator('.hudd-legend')).toBeHidden()
  const pad = await rectOf(page, '.hudt-pad')
  const bite = await rectOf(page, '[data-key="bite"]')
  expect(pad.x).toBeLessThan(40)
  expect(pad.y + pad.h).toBeGreaterThan(390 - 40)
  expect(bite.x + bite.w).toBeGreaterThan(844 - 40)
  expect(bite.y + bite.h).toBeGreaterThan(390 - 40)
  // Toasts still show on the stage.
  await page.evaluate(() => hook().app.hud.showToast('かじってみよう'))
  await expect(page.locator('.hudx-toast')).toHaveClass(/is-show/)
  expect(errors).toEqual([])
  await context.close()
})

// ------------------------------------------------------------------------------------------------ portrait: buttons and speech on the deck
// On an upright phone the small stage carries only the game: the sound and pause buttons are pills on the deck,
// characters' lines appear on the deck with their face, and no text on the deck is under 12 px.

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5

/** The smallest font size of any visible text on the deck (own text nodes and `::before` labels). */
const smallestDeckText = (page: Page) =>
  page.evaluate(() => {
    let smallest = { size: 99, text: '' }
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('.hudd *'))) {
      const r = node.getBoundingClientRect()
      if (!r.width || !r.height || !node.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue
      const own = Array.from(node.childNodes).some((c) => c.nodeType === 3 && c.textContent!.trim())
      const before = getComputedStyle(node, '::before')
      const label = before.content !== 'none' && before.content !== 'normal' && /[^"' ]/.test(before.content)
      const sizes = [
        ...(own ? [parseFloat(getComputedStyle(node).fontSize)] : []),
        ...(label ? [parseFloat(before.fontSize)] : [])
      ]
      for (const size of sizes)
        if (size < smallest.size) smallest = { size, text: (node.textContent ?? '').trim().slice(0, 16) }
    }
    return smallest
  })

for (const [width, height] of PORTRAIT_SIZES) {
  test(`portrait ${width}x${height}: mute and pause are pills on the deck, clear of the controls`, async ({
    browser
  }) => {
    test.setTimeout(60_000)
    const { page, context, errors } = await open(browser, width, height, 1, true)
    const stage = await rectOf(page, '#stage-wrap')
    const deck = await rectOf(page, '.hudd')
    const pause = await rectOf(page, '#pause')
    const mute = await rectOf(page, '#mute')
    const controls: Record<string, Box> = {
      pad: await rectOf(page, '.hudt-pad'),
      jump: await rectOf(page, '[data-key="jump"]'),
      bite: await rectOf(page, '[data-key="bite"]')
    }
    for (const [name, b] of [
      ['pause', pause],
      ['mute', mute]
    ] as const) {
      expect(b.y, `${name} is below the stage`).toBeGreaterThanOrEqual(stage.y + stage.h)
      expect(b.x, `${name} is inside the deck`).toBeGreaterThanOrEqual(deck.x)
      expect(b.x + b.w, `${name} is inside the deck`).toBeLessThanOrEqual(deck.x + deck.w)
      expect(b.y + b.h, `${name} is inside the deck`).toBeLessThanOrEqual(deck.y + deck.h)
      expect(b.w, `${name} width`).toBeGreaterThanOrEqual(44)
      expect(b.h, `${name} height`).toBeGreaterThanOrEqual(44)
      for (const [n, c] of Object.entries(controls)) expect(intersects(b, c), `${name} touches ${n}`).toBe(false)
    }
    expect(intersects(pause, mute), 'pause touches mute').toBe(false)
    await expect(page.locator('#pause .hudx-btn-text')).toHaveText('ポーズ')
    await expect(page.locator('#mute .hudx-btn-text')).toHaveText('おと')
    for (const id of ['#pause', '#mute'])
      expect(
        parseFloat(await page.locator(`${id} .hudx-btn-text`).evaluate((node) => getComputedStyle(node).fontSize))
      ).toBeGreaterThanOrEqual(12)

    // No text on the deck is under 12 px: with the hints, and with a speech line up.
    expect((await smallestDeckText(page)).size).toBeGreaterThanOrEqual(12)
    await page.evaluate(() => hook().app.hud.speak('ありがとう！', 'ハム姫', 'face_princess', 3))
    await expect(page.locator('.hudd-say')).toBeVisible()
    await page.waitForTimeout(400)
    const withSpeech = await smallestDeckText(page)
    expect(withSpeech.size, `smallest deck text 「${withSpeech.text}」`).toBeGreaterThanOrEqual(12)

    // A tap on the sound pill toggles it; a tap on the pause pill opens the pause screen.
    const pressed = await page.locator('#mute').getAttribute('aria-pressed')
    await page.locator('#mute').tap()
    await expect(page.locator('#mute')).not.toHaveAttribute('aria-pressed', pressed!)
    await page.locator('#pause').tap()
    await expect(page.locator('#pause-screen')).toBeVisible()
    expect(errors).toEqual([])
    await context.close()
  })
}

test('landscape 844x390: mute and pause stay in the top-right corner of the stage', async ({ browser }) => {
  const { page, context, errors } = await open(browser, 844, 390, 1, true)
  const stage = await rectOf(page, '#stage-wrap')
  const pause = await rectOf(page, '#pause')
  const mute = await rectOf(page, '#mute')
  expect(pause.x + pause.w / 2).toBeGreaterThanOrEqual(stage.x + stage.w * 0.75)
  expect(mute.x + mute.w / 2).toBeGreaterThanOrEqual(stage.x + stage.w * 0.65)
  expect(pause.y).toBeLessThanOrEqual(stage.y + 12)
  expect(pause.y + pause.h).toBeLessThanOrEqual(stage.y + stage.h * 0.25)
  expect(pause.x + pause.w).toBeLessThanOrEqual(stage.x + stage.w + 1)
  expect(mute.x + mute.w).toBeLessThanOrEqual(pause.x + 1)
  await expect(page.locator('#pause .hudx-btn-text')).toBeHidden()
  expect(errors).toEqual([])
  await context.close()
})

for (const [width, height] of [
  [390, 844],
  [320, 568]
]) {
  test(`portrait ${width}x${height}: stage 1 start puts ハム代's line on the deck and keeps the stage clear`, async ({
    browser
  }) => {
    test.setTimeout(60_000)
    const { page, context, errors } = await open(browser, width, height, 1, true, false)
    const watch = page.waitForFunction(
      () => {
        const say = document.querySelector<HTMLElement>('.hudd-say')
        const face = document.querySelector<HTMLCanvasElement>('.hudd-say-face canvas')
        return (
          say &&
          !say.hidden &&
          say.textContent!.includes('こらーっ！まちなさーい！') &&
          face &&
          face.width > 0 &&
          getComputedStyle(face).visibility === 'visible'
        )
      },
      null,
      { timeout: 4000 }
    )
    const frames = await recordLayout(page, 2600)
    await watch
    expect(
      parseFloat(await page.locator('.hudd-say b').evaluate((node) => getComputedStyle(node).fontSize))
    ).toBeGreaterThanOrEqual(13)
    for (const f of frames) {
      expect(f.bubbles, 'no text bubble on the stage').toEqual([])
      for (const name of ['banner', 'call'] as const) {
        const p = f.pieces[name]
        if (!p) continue
        for (const part of ['hearts', 'bite', 'bossBar'] as const) {
          const b = f.hud[part]
          if (b) expect(intersects(p, b), `${name} overlaps ${part} (${JSON.stringify([p, b])})`).toBe(false)
        }
        expect(p.y + p.h, `${name} inside the stage`).toBeLessThanOrEqual(f.stage.y + f.stage.h)
      }
    }
    const seen = new Set(frames.flatMap((f) => Object.keys(f.pieces)))
    expect(seen.has('call')).toBe(true)
    // The hints come back once the line is over.
    await expect(page.locator('.hudd-say')).toBeHidden({ timeout: 4000 })
    await expect(page.locator('.hudd-hint')).toBeVisible()
    expect(errors).toEqual([])
    await context.close()
  })
}
