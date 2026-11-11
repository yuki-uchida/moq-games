import { expect, test, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

interface HamWorld {
  player: { x: number; y: number; hp: number; maxHp: number; w: number; h: number; vx: number; vy: number }
  boss: { x: number; y: number; w: number; h: number; hp: number; dead: boolean } | null
  enemies: { dead: boolean }[]
  props: { kind: string; state: string; x: number; y: number; w: number; h: number; data: number }[]
  biteProp(prop: { kind: string; state: string }, dir: 1 | -1): void
  solidAt(tx: number, ty: number): boolean
  state: string
  time: number
  goalX: number
  goalY: number
}

interface HamView {
  handled: number
  camera: { panTo(x: number, y: number, seconds: number): void }
  toCanvas(x: number, y: number): { x: number; y: number }
}

declare global {
  interface Window {
    __hamham?: {
      world: HamWorld
      view: HamView | null
      openEnding(): void
    }
    __bot?: { stop(): void }
  }
}

test('title, story, stage select and the first stage play through the keyboard', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openGame(page)
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
  await openGame(page)
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
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('the ending pages through to the credits', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openGame(page)
  await page.evaluate(() => {
    const raw = localStorage.getItem('hoshi-no-hamham-v1')
    const save = raw
      ? JSON.parse(raw)
      : { version: 1, cleared: [], unlocked: 10, best: {}, muted: true, seenOpening: false }
    save.cleared = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    save.unlocked = 10
    localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save))
  })
  await reloadGame(page)
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
  await openGame(page)
  await page.evaluate(() => {
    const raw = localStorage.getItem('hoshi-no-hamham-v1')
    const save = raw
      ? JSON.parse(raw)
      : { version: 1, cleared: [], unlocked: 10, best: {}, muted: true, seenOpening: false }
    save.cleared = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    save.unlocked = 10
    localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save))
  })
  await reloadGame(page)
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

  // The fight can end anywhere in the arena, with a rock or a straggler in the way: take the last steps to the
  // exit from right beside it, so this test stays about the clear -> ending flow.
  await page.evaluate(() => {
    const world = window.__hamham!.world
    world.player.x = world.goalX - world.player.w - 8
    world.player.y = world.goalY + 64 - world.player.h
    world.player.vx = 0
    world.player.vy = 0
  })
  await page.keyboard.down('ArrowRight')
  await expect(page.locator('#result-screen')).toBeVisible({ timeout: 10_000 })
  await page.keyboard.up('ArrowRight')
  await page.locator('#result-next').click()
  await expect(page.locator('#ending-screen')).toBeVisible()
  expect(errors).toEqual([])
})

// ---------------------------------------------------------------------------------------------- the view layer

/** Opens a stage through the stage select with every stage unlocked and the sound off. */
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
  await page.waitForFunction(() => Boolean(window.__hamham?.view))
}

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

type Rgb = [number, number, number]

/** 8×8 canvas samples inside each map cell (null when the cell is not fully in view). */
async function sampleCells(page: Page, cells: [number, number][]): Promise<(Rgb[] | null)[]> {
  return page.evaluate((list) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    const view = window.__hamham!.view!
    return list.map(([tx, ty]) => {
      const points: [number, number, number][] = []
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 8; i++) {
          const p = view.toCanvas(tx * 64 + 4 + i * 8, ty * 64 + 4 + j * 8)
          if (p.x < 0 || p.y < 0 || p.x >= canvas.width || p.y >= canvas.height) return null
          const o = (p.y * canvas.width + p.x) * 4
          points.push([data[o], data[o + 1], data[o + 2]])
        }
      return points
    })
  }, cells)
}

/** Share of sample points whose colour changed noticeably. */
const changed = (a: Rgb[], b: Rgb[]) =>
  a.filter((p, i) => Math.abs(p[0] - b[i][0]) + Math.abs(p[1] - b[i][1]) + Math.abs(p[2] - b[i][2]) > 40).length /
  a.length

/** Removes enemies and the boss so a still scene can be sampled. */
async function stillScene(page: Page) {
  await page.evaluate(() => {
    const world = window.__hamham!.world
    for (const enemy of world.enemies) enemy.dead = true
    world.boss = null
  })
}

test('the canvas backing store is an integer multiple of 640×360', async ({ page }) => {
  const errors = collectErrors(page)
  await openStage(page, 1)
  const read = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game')!
      return { w: canvas.width, h: canvas.height, css: canvas.clientWidth, dpr: window.devicePixelRatio }
    })
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 700, height: 420 },
    { width: 2400, height: 1350 }
  ]) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(250)
    const size = await read()
    const k = size.w / 640
    expect(Number.isInteger(k), `${viewport.width}px`).toBe(true)
    expect(size.h).toBe(360 * k)
    expect(k).toBe(Math.max(1, Math.min(4, Math.ceil((size.css * size.dpr) / 640))))
  }
  expect(errors).toEqual([])
})

test('a felled tree and every tile of a closed door are drawn where they are solid', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = collectErrors(page)
  // Reduced motion: no shake and no parallax drift, so only the log and the door change the picture.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openStage(page, 1)
  await stillScene(page)
  const tree = await page.evaluate(() => {
    const world = window.__hamham!.world
    const t = world.props.find((p) => p.kind === 'tree' && world.solidAt(p.x / 64, p.y / 64 + 1))!
    window.__hamham!.view!.camera.panTo(t.x + 2.5 * 64, t.y, 0)
    return { tx: t.x / 64, ty: t.y / 64 }
  })
  const logCells: [number, number][] = [0, 1, 2, 3].map((i) => [tree.tx + i, tree.ty])
  const farCells: [number, number][] = [0, 1, 2, 3].map((i) => [tree.tx + i, tree.ty - 2])
  await page.waitForTimeout(600)
  const before = await sampleCells(page, [...logCells, ...farCells])
  await page.evaluate(() => {
    const world = window.__hamham!.world
    const t = world.props.find((p) => p.kind === 'tree' && world.solidAt(p.x / 64, p.y / 64 + 1))!
    world.biteProp(t, 1)
    world.biteProp(t, 1)
  })
  await page.waitForFunction(() => window.__hamham!.world.props.some((p) => p.kind === 'tree' && p.state === 'fallen'))
  // Let the leaves and dust settle.
  await page.waitForTimeout(2600)
  const solid = await page.evaluate((cells) => cells.every(([x, y]) => window.__hamham!.world.solidAt(x, y)), logCells)
  expect(solid).toBe(true)
  const after = await sampleCells(page, [...logCells, ...farCells])
  for (let i = 0; i < 4; i++) {
    expect(before[i], `log cell ${i} in view`).not.toBeNull()
    expect(changed(before[i]!, after[i]!), `log cell ${i} shows the log`).toBeGreaterThan(0.2)
    expect(changed(before[4 + i]!, after[4 + i]!), `cell ${i} a few tiles away is unchanged`).toBeLessThan(0.05)
  }

  // Stage 4: a door taller than the view, sampled from two camera heights, closed and then open.
  await openStage(page, 4)
  await stillScene(page)
  const door = await page.evaluate(() => {
    const d = window.__hamham!.world.props.find((p) => p.kind === 'door')!
    return { tx: d.x / 64, ty: d.y / 64, w: d.w, h: d.h }
  })
  const doorCells: [number, number][] = []
  for (let i = 0; i < door.w; i++) for (let j = 0; j < door.h; j++) doorCells.push([door.tx + i, door.ty + j])
  const besideCells: [number, number][] = doorCells.map(([x, y]) => [x + 4, y])
  const shoot = async () => {
    const result: (Rgb[] | null)[] = new Array(doorCells.length * 2).fill(null)
    for (const y of [door.ty * 64 + 150, (door.ty + door.h) * 64 - 150]) {
      await page.evaluate(([x, py]) => window.__hamham!.view!.camera.panTo(x, py, 0), [door.tx * 64 + 64, y])
      await page.waitForTimeout(400)
      const samples = await sampleCells(page, [...doorCells, ...besideCells])
      samples.forEach((sample, i) => (result[i] ??= sample))
    }
    return result
  }
  const doorSolid = await page.evaluate(
    (cells) => cells.every(([x, y]) => window.__hamham!.world.solidAt(x, y)),
    doorCells
  )
  expect(doorSolid).toBe(true)
  const closed = await shoot()
  await page.evaluate(() => {
    const world = window.__hamham!.world
    const d = world.props.find((p) => p.kind === 'door')!
    world.biteProp(world.props.find((p) => p.kind === 'switch' && p.data === d.data)!, 1)
  })
  await page.waitForTimeout(1500)
  const open = await shoot()
  for (let i = 0; i < doorCells.length; i++) {
    expect(closed[i], `door tile ${i} sampled`).not.toBeNull()
    expect(changed(closed[i]!, open[i]!), `door tile ${i} is drawn while closed`).toBeGreaterThan(0.3)
    const beside = doorCells.length + i
    expect(changed(closed[beside]!, open[beside]!), `the cell beside door tile ${i} is unchanged`).toBeLessThan(0.05)
  }
  expect(errors).toEqual([])
})

/** Drives the hero with synthetic key events: run right, jump at walls and pits, bite often, back out when stuck. */
async function botRun(page: Page, seconds: number) {
  await page.evaluate(() => {
    const held = new Set<string>()
    const key = (code: string, down: boolean) => {
      if (down === held.has(code)) return
      if (down) held.add(code)
      else held.delete(code)
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }))
    }
    let lastX = 0
    let stuck = 0
    let back = 0
    let tick = 0
    const timer = window.setInterval(() => {
      const world = window.__hamham?.world
      if (!world) return
      tick++
      const p = world.player
      // Survival is not what this run measures.
      p.hp = p.maxHp
      stuck = Math.abs(p.x - lastX) < 2 ? stuck + 1 : 0
      lastX = p.x
      if (stuck > 30) {
        back = 15
        stuck = 0
      }
      const dir = back > 0 ? -1 : 1
      if (back > 0) back--
      key('ArrowRight', dir > 0)
      key('ArrowLeft', dir < 0)
      const ahead = Math.floor((p.x + p.w / 2 + dir * (p.w / 2 + 10)) / 64)
      const foot = Math.floor((p.y + p.h - 4) / 64)
      const wall = world.solidAt(ahead, foot) || world.solidAt(ahead, foot - 1)
      const pit = !world.solidAt(ahead, Math.floor((p.y + p.h + 16) / 64))
      key('Space', (wall || pit || tick % 23 === 0) && tick % 2 === 0)
      key('KeyZ', tick % 3 === 0)
    }, 50)
    window.__bot = {
      stop: () => {
        window.clearInterval(timer)
        for (const code of [...held]) key(code, false)
      }
    }
  })
  await page.waitForTimeout(seconds * 1000)
  await page.evaluate(() => window.__bot!.stop())
}

for (const no of [1, 4])
  test(`a 20-second bot run of stage ${no} raises no console or page errors`, async ({ page }) => {
    test.setTimeout(60_000)
    const errors = collectErrors(page)
    await openStage(page, no)
    const start = await page.evaluate(() => window.__hamham!.world.player.x)
    await botRun(page, 20)
    const end = await page.evaluate(() => ({
      x: window.__hamham!.world?.player.x ?? 0,
      time: window.__hamham!.world?.time ?? 0,
      handled: window.__hamham!.view?.handled ?? 0
    }))
    expect(end.x).toBeGreaterThan(start + 300)
    expect(end.time).toBeGreaterThan(10)
    expect(end.handled).toBeGreaterThan(20)
    expect(errors).toEqual([])
  })

test('stage 1 keeps a steady frame rate', async ({ page }) => {
  const errors = collectErrors(page)
  await openStage(page, 1)
  await page.keyboard.down('ArrowRight')
  const median = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const times: number[] = []
        const frame = (t: number) => {
          times.push(t)
          if (t - times[0] < 5000) requestAnimationFrame(frame)
          else {
            const gaps = times.slice(1).map((v, i) => v - times[i])
            gaps.sort((a, b) => a - b)
            resolve(gaps[Math.floor(gaps.length / 2)])
          }
        }
        requestAnimationFrame(frame)
      })
  )
  await page.keyboard.up('ArrowRight')
  expect(median).toBeLessThan(25)
  expect(errors).toEqual([])
})
