import { expect, test, type Page } from '@playwright/test'
import { openGame, pageThroughStory, reloadGame } from './hoshi-no-hamham-helpers'

// Drawing a frame makes no saved canvas states (each one is an object on the browser's own heap that only a full
// collection frees) and no per-call garbage, and the picture is the one the saving code drew.

const SAVE = {
  version: 1,
  cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  unlocked: 10,
  best: {},
  muted: true,
  seenOpening: true
}

interface Overlay {
  popup(text: string, x: number, y: number, color?: string): void
  pointer: { x: number; y: number; angle: number } | null
}

interface Hook {
  autopilot(on: boolean): void
  app: {
    paused: boolean
    renderer: { k: number; ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement }
    session: {
      view: {
        fx: { burst(name: string, x: number, y: number, count: number, o?: object): void }
        overlay: Overlay
        draw(): void
      }
      director: { current?: string | null; inputLocked: boolean }
    } | null
  }
  world: {
    player: { x: number; y: number; w: number; h: number; facing: number }
    enemies: { x: number; y: number; facing: number; dead: boolean }[]
  } | null
}

declare global {
  interface Window {
    __hamham: Hook
    __saves: number
    __draws: number
  }
}

async function openStage(page: Page, no: number) {
  await openGame(page)
  await page.evaluate((save) => localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save)), SAVE)
  await reloadGame(page)
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page
    .locator('.stage-card')
    .nth(no - 1)
    .click()
  await pageThroughStory(page)
  await expect(page.locator('#hud')).toBeVisible()
  await page.waitForFunction(
    () => {
      const session = window.__hamham.app.session
      return Boolean(session) && session!.director.current == null && !session!.director.inputLocked
    },
    null,
    { timeout: 20_000 }
  )
}

test('a flipped, scaled or rotated sprite is drawn as the saving code drew it and leaves the transform as it was', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openGame(page)
  const result = await page.evaluate(async () => {
    const bakeModule = (await import(
      '/src/view/bake.ts'
    )) as typeof import('../examples/games/hoshi-no-hamham/src/view/bake')
    const artModule = (await import('/src/art/index.ts')) as typeof import('../examples/games/hoshi-no-hamham/src/art')
    const { blitRaster, bake, clip, setBaseTransform } = bakeModule
    type Options = NonNullable<Parameters<typeof blitRaster>[5]>
    const anim = clip('hero', 'idle')!
    const raster = anim.frames[0]
    const anchor = artModule.anchorOf(anim)

    // The function as it was: the sprite's own transform is made by save, translate, rotate, scale and restore.
    function reference(ctx: CanvasRenderingContext2D, x: number, y: number, o: Options) {
      const image = bake(raster)
      const [ax, ay] = anchor
      x = Math.round(x)
      y = Math.round(y)
      const alpha = o.alpha ?? 1
      if (alpha <= 0) return
      if (alpha < 1) ctx.globalAlpha = alpha
      if (!o.flip && !o.angle && (o.sx ?? 1) === 1 && (o.sy ?? 1) === 1) ctx.drawImage(image, x - ax, y - ay)
      else {
        const pivot = o.flip ? (o.pivotX ?? ax) : ax
        ctx.save()
        ctx.translate(x - ax + pivot, y)
        if (o.angle) ctx.rotate(o.angle)
        ctx.scale((o.flip ? -1 : 1) * (o.sx ?? 1), o.sy ?? 1)
        ctx.drawImage(image, -pivot, -ay)
        ctx.restore()
      }
      if (alpha < 1) ctx.globalAlpha = 1
    }

    const cases: Record<string, Options> = {
      plain: {},
      flip: { flip: true },
      'flip with a pivot': { flip: true, pivotX: 20 },
      scaled: { sx: 1.3, sy: 0.7 },
      'rotated by 0.4': { angle: 0.4 },
      'rotated by -2.1': { angle: -2.1 },
      'rotated, scaled and flipped': { angle: 0.7, sx: 1.3, sy: 0.7, flip: true },
      'squashed and flipped with a pivot': { flip: true, pivotX: 17, sx: 1 / 1.18, sy: 1.18 }
    }
    const make = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })! }
    }
    const a = make()
    const b = make()
    const differences: string[] = []
    let drawn = 0
    // With the frame's transform declared the sprite puts it back exactly; without, by the inverse of its own.
    for (const declared of [true, false])
      for (const k of [1, 2, 3])
        for (const [name, base] of Object.entries(cases))
          for (const alpha of [1, 0.5])
            for (const [x, y] of [
              [100, 120],
              [100.4, 120.6],
              [101.5, 119.5]
            ]) {
              const o = { ...base, alpha }
              for (const { ctx } of [a, b]) {
                ctx.setTransform(1, 0, 0, 1, 0, 0)
                ctx.clearRect(0, 0, 640, 480)
                ctx.setTransform(k, 0, 0, k, -37 * k, -11 * k)
              }
              setBaseTransform(declared ? a.ctx : null, k, -37 * k, -11 * k)
              blitRaster(a.ctx, raster, anchor, x, y, o)
              setBaseTransform(null)
              reference(b.ctx, x, y, o)
              const before = b.ctx.getTransform()
              const after = a.ctx.getTransform()
              for (const key of ['a', 'b', 'c', 'd', 'e', 'f'] as const)
                if (Math.abs(before[key] - after[key]) > (declared ? 1e-9 : 1e-3))
                  differences.push(`${name} k=${k} declared=${declared} transform ${key}`)
              a.ctx.setTransform(1, 0, 0, 1, 0, 0)
              b.ctx.setTransform(1, 0, 0, 1, 0, 0)
              const da = a.ctx.getImageData(0, 0, 640, 480).data
              const db = b.ctx.getImageData(0, 0, 640, 480).data
              let same = true
              let ink = 0
              for (let i = 0; i < da.length; i++) {
                if (da[i] !== db[i]) same = false
                if (i % 4 === 3 && da[i] > 0) ink += 1
              }
              if (!same) differences.push(`${name} k=${k} alpha=${alpha} at ${x},${y}: pixels differ`)
              if (ink === 0) differences.push(`${name} k=${k} alpha=${alpha} at ${x},${y}: nothing drawn`)
              drawn += 1
            }
    return { differences, drawn }
  })
  expect(result.drawn).toBe(2 * 3 * 8 * 2 * 3)
  expect(result.differences).toEqual([])
  expect(errors).toEqual([])
})

for (const stage of [1, 2])
  test(`playing stage ${stage} saves no canvas state in an ordinary frame`, async ({ page }) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      window.__saves = 0
      window.__draws = 0
      const save = CanvasRenderingContext2D.prototype.save
      CanvasRenderingContext2D.prototype.save = function () {
        window.__saves += 1
        return save.call(this)
      }
    })
    await openStage(page, stage)
    await page.evaluate(() => {
      const view = window.__hamham.app.session!.view
      const proto = Object.getPrototypeOf(view) as { draw(): void }
      const draw = proto.draw
      proto.draw = function (this: unknown) {
        window.__draws += 1
        return draw.call(this)
      }
      window.__hamham.autopilot(true)
      window.__saves = 0
      window.__draws = 0
    })
    await page.waitForTimeout(10_000)
    const { saves, draws } = await page.evaluate(() => ({ saves: window.__saves, draws: window.__draws }))
    console.log(`[draw, stage ${stage}] ${saves} saves in ${draws} frames`)
    expect(draws).toBeGreaterThan(200)
    expect(saves / draws).toBeLessThanOrEqual(0.5)
    expect(errors).toEqual([])
  })

test('a whole frame is the same picture as the one the saving code draws', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // The page gets the drawing module with the previous `blitRaster` beside the new one and a switch between them,
  // so one frozen state can be drawn both ways.
  const previous = `
export const reference = { old: false }
function blitRasterOld(ctx, r, anchor, x, y, o = {}) {
  const image = bake(r)
  const [ax, ay] = anchor
  x = Math.round(x)
  y = Math.round(y)
  const alpha = o.alpha ?? 1
  if (alpha <= 0) return
  if (alpha < 1) ctx.globalAlpha = alpha
  if (!o.flip && !o.angle && (o.sx ?? 1) === 1 && (o.sy ?? 1) === 1) ctx.drawImage(image, x - ax, y - ay)
  else {
    const pivot = o.flip ? (o.pivotX ?? ax) : ax
    ctx.save()
    ctx.translate(x - ax + pivot, y)
    if (o.angle) ctx.rotate(o.angle)
    ctx.scale((o.flip ? -1 : 1) * (o.sx ?? 1), o.sy ?? 1)
    ctx.drawImage(image, -pivot, -ay)
    ctx.restore()
  }
  if (alpha < 1) ctx.globalAlpha = 1
}
export function blitRaster(ctx, r, anchor, x, y, o) {
  return reference.old ? blitRasterOld(ctx, r, anchor, x, y, o) : blitRasterNew(ctx, r, anchor, x, y, o)
}
`
  let patched = false
  await page.route('**/src/view/bake.ts*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    patched = source.includes('export function blitRaster(')
    await route.fulfill({
      response,
      body: source.replace('export function blitRaster(', 'function blitRasterNew(') + previous
    })
  })
  await openStage(page, 2)
  expect(patched).toBe(true)
  await page.evaluate(() => window.__hamham.autopilot(true))
  await page.waitForTimeout(4000)
  // Stop the loop and put the things the new code draws differently on the screen.
  await page.keyboard.press('Escape')
  await expect(page.locator('#pause-screen')).toBeVisible()
  const result = await page.evaluate(async () => {
    const { reference } = (await import('/src/view/bake.ts')) as unknown as { reference: { old: boolean } }
    const h = window.__hamham
    const world = h.world!
    const { view } = h.app.session!
    const { ctx, canvas } = h.app.renderer
    const hero = world.player
    hero.facing = -1
    // A flipped enemy, particles that face either way, a popup and the arrow that is drawn at an angle.
    const enemy = world.enemies.find((e) => !e.dead)
    if (enemy) {
      enemy.x = hero.x + 60
      enemy.y = hero.y + hero.h - 40
      enemy.facing = -1
    }
    view.fx.burst('star', hero.x + 20, hero.y, 14, { speed: [20, 60] })
    view.overlay.popup('ナイス！', hero.x, hero.y - 40, '#ffd45e')
    view.overlay.pointer = { x: hero.x + 30, y: hero.y - 70, angle: 0.8 }
    // Every sprite that is flipped, scaled or rotated scales the context once.
    let scales = 0
    const scale = ctx.scale
    ctx.scale = function (...args: Parameters<typeof scale>) {
      scales += 1
      return scale.apply(this, args)
    }
    const frame = (old: boolean) => {
      reference.old = old
      view.draw()
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const fresh = frame(false)
    const sprites = scales
    const saved = frame(true)
    reference.old = false
    ctx.scale = scale
    let differing = 0
    for (let i = 0; i < fresh.length; i++) if (fresh[i] !== saved[i]) differing += 1
    return { differing, sprites, pixels: fresh.length / 4 }
  })
  console.log(`[draw, whole frame] ${result.sprites} transformed sprites, ${result.differing} bytes differ`)
  expect(result.sprites).toBeGreaterThanOrEqual(5)
  expect(result.differing).toBe(0)
  expect(errors).toEqual([])
})
