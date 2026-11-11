import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

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

async function open(browser: Browser, width: number, height: number, stageNo: number, touch = false): Promise<Session> {
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
  await page.goto('/')
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
  await page.reload()
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
  await page.waitForTimeout(300)
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
