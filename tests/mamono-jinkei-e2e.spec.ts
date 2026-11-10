/**
 * マモノ陣形 browser tests: title, solo play (move, attack, charge, formation technique, pushing), the pause menu,
 * and host + guests through a BroadcastChannel stand-in for CooperativeNetwork (prediction, spectators).
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

type Hook = {
  W: {
    t: number
    phase: string
    humans: { id: string; ctrl: number }[]
    heroes: {
      slot: number
      body: { x: number; y: number; vx: number; vy: number }
      state: string
      form: number
      chargeFull: boolean
      owner: string
    }[]
    props: { id: number; kind: string; part?: string; x: number; y: number; state: string }[]
    enemies: { hp: number; maxHp: number }[]
    techs: unknown[]
    party: { techs: number }
  }
  view?: {
    phase: string
    t: number
    heroes: {
      slot: number
      x: number
      y: number
      charge: number
      state: string
      ctrl: boolean
      owner: string
      form?: number
    }[]
    players: { id: string; name: string; ctrl: number; spectator?: boolean }[]
    formations: { slots: number[] }[]
  }
  myId?: string
  role?: string
  screen: string
  camera: { heroCss?: { x: number; y: number }; scale: number }
  warp(to: string): void
}

declare global {
  interface Window {
    __mamono: Hook
  }
}

const fakeNetwork = `
export const MAX_PAYLOAD_BYTES = 65536;
export class CooperativeNetwork {
  constructor(options) { this.options = options; this.playerId = options.playerId; }
  async start() {
    const o = this.options;
    this.channel = new BroadcastChannel(JSON.stringify(['anon', o.app ?? 'rabbiters-v1', o.room]));
    this.channel.onmessage = ({ data }) => {
      if (o.role === 'host' && data.type === 'hello') { this.players.add(data.id); o.onPresence([...this.players]); }
      if (o.role === 'host' && data.type === 'input') o.onInput(data.id, data.input);
      if (o.role === 'guest' && data.type === 'snapshot') o.onSnapshot(data.state);
      // A host that opens the room later still finds the guests already waiting in it.
      if (o.role === 'guest' && data.type === 'host-up') this.channel.postMessage({ type: 'hello', id: this.playerId });
      // The host left: like the real network, the cause comes first and then the failed cleanup of the closed session.
      if (o.role === 'guest' && data.type === 'bye') {
        o.onStatus('error', 'Error: Host left the room. Create a new connection to retry.');
        o.onStatus('error', 'Relay cleanup failed. Reload before reconnecting.');
      }
    };
    this.players = new Set([this.playerId]);
    if (o.role === 'guest') this.channel.postMessage({ type: 'hello', id: this.playerId });
    if (o.role === 'host') this.channel.postMessage({ type: 'host-up' });
    o.onStatus('ready', 'ok');
  }
  async sendInput(input) { this.channel.postMessage({ type: 'input', id: this.playerId, input }); }
  async broadcastSnapshot(state) { this.channel.postMessage({ type: 'snapshot', state }); }
  async stop() {
    if (this.options.role === 'host') this.channel?.postMessage({ type: 'bye' });
    this.channel?.close();
  }
}`

function watchErrors(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
}

async function startSolo(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'マモノ陣形' })).toBeVisible()
  await page.getByRole('button', { name: /ひとりで遊ぶ/ }).click()
  await expect(page.getByRole('button', { name: '出発！' })).toBeVisible()
  await page.getByRole('button', { name: '出発！' }).click()
  await expect(page.locator('.intro-card')).toBeVisible()
  await expect(page.locator('.intro-name')).toHaveText('ぷるぷる草原と古城跡')
  await expect.poll(() => page.evaluate(() => window.__mamono.view?.phase), { timeout: 6000 }).toBe('play')
  await expect(page.locator('.hud')).toBeVisible()
}

/** Moves the controlled hero (host/solo world) to a spot. */
async function place(page: Page, x: number, y: number, everyone = false) {
  await page.evaluate(
    ([x, y, everyone]) => {
      const W = window.__mamono.W
      const ctrl = W.humans[0].ctrl
      for (const h of W.heroes) {
        if (!everyone && h.slot !== ctrl) continue
        const k = h.slot === ctrl ? 0 : h.slot + 1
        h.body.x = x - k * 24
        h.body.y = y
        h.body.vx = h.body.vy = 0
      }
    },
    [x, y, everyone] as const
  )
}

const T = (n: number) => n * 64 + 32

test('title renders with the attract demo and no errors', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'マモノ陣形' })).toBeVisible()
  for (const name of ['ひとりで遊ぶ', 'ルームを作る', 'ルームに参加', '遊び方', '設定'])
    await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__mamono.screen)).toBe('title')
  // The canvas is painted (not a flat colour).
  const colours = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#world')!
    const probe = document.createElement('canvas')
    probe.width = 32
    probe.height = 32
    const g = probe.getContext('2d')!
    g.drawImage(c, 0, 0, 32, 32)
    const d = g.getImageData(0, 0, 32, 32).data
    return new Set(Array.from({ length: 1024 }, (_, i) => `${d[i * 4] >> 4},${d[i * 4 + 1] >> 4},${d[i * 4 + 2] >> 4}`))
      .size
  })
  expect(colours).toBeGreaterThan(8)
  // Keyboard navigation through the menu.
  await page.getByRole('button', { name: /ひとりで遊ぶ/ }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: /ルームを作る/ })).toBeFocused()
  await page.getByRole('button', { name: /遊び方/ }).click()
  await expect(page.getByRole('heading', { name: '陣形をくもう' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /ひとりで遊ぶ/ })).toBeVisible()
  // Esc also closes the settings while a volume slider has the focus.
  await page.getByRole('button', { name: /設定/ }).click()
  await expect(page.getByRole('heading', { name: '設定' })).toBeVisible()
  await page.locator('input[type=range]:visible').first().focus()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /ひとりで遊ぶ/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('Esc leaves the room-code fields of the create and join panels', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await page.goto('/')
  for (const name of [/ルームを作る/, /ルームに参加/]) {
    await page.getByRole('button', { name }).click()
    const field = page.locator('.room-input:visible')
    await field.click()
    await field.fill('abc')
    await expect(field).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /ひとりで遊ぶ/ })).toBeVisible()
    await expect(page.locator('.room-input:visible')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('solo: the せーの countdown shows 3, 2, 1 and GO!', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await startSolo(page)
  // Sample the countdown inside the page on every frame and keep the highest opacity each number reaches, so a
  // slow test process cannot miss a step. The animation must restart for every number (it used to stay at 0).
  await page.evaluate(() => {
    const seen: Record<string, number> = {}
    ;(window as unknown as { __countdownSeen: Record<string, number> }).__countdownSeen = seen
    const start = performance.now()
    const tick = () => {
      const e = document.querySelector<HTMLElement>('.countdown')
      const text = e?.textContent?.trim()
      if (e && text) seen[text] = Math.max(seen[text] ?? 0, Number(getComputedStyle(e).opacity))
      if (performance.now() - start < 10_000) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.keyboard.press('KeyF')
  const peak = (n: string) =>
    page.evaluate((k) => (window as unknown as { __countdownSeen: Record<string, number> }).__countdownSeen[k] ?? 0, n)
  for (const n of ['3', '2', '1']) await expect.poll(() => peak(n), { timeout: 8000 }).toBeGreaterThanOrEqual(0.5)
  expect(errors).toEqual([])
})

test('solo: move, attack, charge, formation technique', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await startSolo(page)
  const heroX = () =>
    page.evaluate(() => {
      const W = window.__mamono.W
      return W.heroes.find((h) => h.slot === W.humans[0].ctrl)!.body.x
    })
  // WASD moves the hero.
  const x0 = await heroX()
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(600)
  await page.keyboard.up('KeyD')
  expect(await heroX()).toBeGreaterThan(x0 + 40)

  // Click attacks: stand under a grass tuft and swing up at it.
  const grass = await page.evaluate(() => {
    const W = window.__mamono.W
    const me = W.heroes.find((h) => h.slot === W.humans[0].ctrl)!
    const list = W.props.filter((p) => p.kind === 'grass' && p.state === 'idle')
    list.sort((a, b) => Math.hypot(a.x - me.body.x, a.y - me.body.y) - Math.hypot(b.x - me.body.x, b.y - me.body.y))
    return { id: list[0].id, x: list[0].x, y: list[0].y }
  })
  await place(page, grass.x, grass.y + 44)
  await page.waitForTimeout(300)
  const at = (await page.evaluate(() => window.__mamono.camera.heroCss))!
  await page.mouse.move(at.x, at.y - 80)
  for (let i = 0; i < 3; i++) {
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(350)
  }
  await expect
    .poll(() => page.evaluate((id) => window.__mamono.W.props.find((p) => p.id === id)?.state ?? 'gone', grass.id))
    .not.toBe('idle')

  // Regroup, then hold to charge fully: the formation is ready and the co-op technique fires on release.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const W = window.__mamono.W
          return W.heroes.find((h) => h.slot === W.humans[0].ctrl)!.form >= 0
        }),
      { timeout: 8000 }
    )
    .toBe(true)
  const me = (await page.evaluate(() => window.__mamono.camera.heroCss))!
  await page.mouse.move(me.x + 120, me.y)
  await page.mouse.down()
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__mamono.view?.heroes.find((h) => h.ctrl && h.owner === window.__mamono.myId)?.charge
        ),
      { timeout: 3000 }
    )
    .toBe(1)
  await expect(page.locator('.formation-chip.ready')).toBeVisible()
  const before = await page.evaluate(() => window.__mamono.W.party.techs)
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.__mamono.W.party.techs), { timeout: 3000 }).toBeGreaterThan(before)
  await expect(page.locator('.banner.on')).toContainText('ジャンボ・プレス')
  expect(errors).toEqual([])
})

test('solo: heroes push the stone block together', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await startSolo(page)
  await page.evaluate(() => window.__mamono.warp('B'))
  await page.waitForTimeout(200)
  const block = await page.evaluate(() => {
    const p = window.__mamono.W.props.find((q) => q.part === 'blockB')!
    return { x: p.x, y: p.y }
  })
  expect(block.x).toBe(T(42))
  await place(page, T(42) - 52, T(57), true)
  await page.keyboard.down('KeyD')
  await expect
    .poll(() => page.evaluate(() => window.__mamono.W.props.find((q) => q.part === 'blockB')!.x), { timeout: 12000 })
    .toBeGreaterThan(block.x)
  await page.keyboard.up('KeyD')
  expect(errors).toEqual([])
})

test('solo: a wipe shows 全滅 exactly once', async ({ page }) => {
  await startSolo(page)
  // Let the opening banner finish so a wipe banner would show at once.
  await expect(page.locator('.banner.on')).toHaveCount(0, { timeout: 8000 })
  await page.evaluate(() => {
    for (const h of window.__mamono.W.heroes) (h as { hp?: number }).hp = 0
    for (const h of window.__mamono.W.heroes) h.state = 'down'
  })
  await expect.poll(() => page.evaluate(() => window.__mamono.view?.phase), { timeout: 6000 }).toBe('wipe')
  const visible = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>('body *')].filter(
          (e) =>
            e.children.length === 0 &&
            e.textContent?.includes('全滅') &&
            e.getClientRects().length > 0 &&
            getComputedStyle(e).visibility !== 'hidden'
        ).length
    )
  await expect(page.locator('.wipe-title')).toBeVisible()
  // Sample over the whole wipe: the banner would appear a frame or two after the phase change.
  for (let i = 0; i < 8; i++) {
    expect(await visible()).toBe(1)
    await page.waitForTimeout(150)
  }
  await page.screenshot({ path: process.env.WIPE_SHOT ?? 'test-results/mj-wipe.png' })
})

/** A fake standard-mapping gamepad: `navigator.getGamepads()` returns `window.__pad`, which tests poke. */
async function fakePad(page: Page) {
  await page.addInitScript(() => {
    const pad = {
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    }
    Object.assign(window, { __pad: pad })
    navigator.getGamepads = () => [pad as unknown as Gamepad]
  })
}

/** Presses and releases one pad button (long enough for a frame to see it). */
async function tapPad(page: Page, button: number) {
  const set = (down: boolean) =>
    page.evaluate(
      ([b, d]) => {
        ;(window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[b].pressed = d
      },
      [button, down] as const
    )
  await set(true)
  await page.waitForTimeout(120)
  await set(false)
  await page.waitForTimeout(120)
}

const PAD_BUTTON = { a: 0, b: 1, start: 9, up: 12, down: 13 }

test('gamepad: d-pad, A, B and Start drive the menus; the left stick aims', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await fakePad(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'マモノ陣形' })).toBeVisible()
  await page.getByRole('button', { name: /ひとりで遊ぶ/ }).focus()
  // Title: d-pad moves the focus, A presses the button.
  await tapPad(page, PAD_BUTTON.down)
  await expect(page.getByRole('button', { name: /ルームを作る/ })).toBeFocused()
  await tapPad(page, PAD_BUTTON.up)
  await expect(page.getByRole('button', { name: /ひとりで遊ぶ/ })).toBeFocused()
  await tapPad(page, PAD_BUTTON.a)
  await expect(page.getByRole('button', { name: '出発！' })).toBeVisible()
  // Lobby: B asks to go back (a dialog), A on its first button returns to the title.
  await tapPad(page, PAD_BUTTON.b)
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await tapPad(page, PAD_BUTTON.b)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await tapPad(page, PAD_BUTTON.b)
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await tapPad(page, PAD_BUTTON.a)
  await expect(page.getByRole('heading', { name: 'マモノ陣形' })).toBeVisible()
  // Into the game with the pad only: the lobby's focus is on a job card, a stick press reaches the start button.
  await page.getByRole('button', { name: /ひとりで遊ぶ/ }).focus()
  await tapPad(page, PAD_BUTTON.a)
  await page.getByRole('button', { name: '出発！' }).focus()
  await tapPad(page, PAD_BUTTON.a)
  await expect.poll(() => page.evaluate(() => window.__mamono.view?.phase), { timeout: 8000 }).toBe('play')
  // Play: Start opens the pause menu and closes it again.
  await tapPad(page, PAD_BUTTON.start)
  await expect(page.getByRole('dialog', { name: 'メニュー' })).toBeVisible()
  await tapPad(page, PAD_BUTTON.start)
  await expect(page.getByRole('dialog', { name: 'メニュー' })).toBeHidden()
  // With the right stick idle the aim follows the left stick.
  const aim = () =>
    page.evaluate(
      () => (window.__mamono as unknown as { app: { controls: { state: { aim: number } } } }).app.controls.state.aim
    )
  const stickTo = (x: number, y: number) =>
    page.evaluate(
      ([x, y]) => {
        ;(window as unknown as { __pad: { axes: number[] } }).__pad.axes = [x, y, 0, 0]
      },
      [x, y] as const
    )
  await stickTo(0, 1)
  await expect.poll(aim).toBeCloseTo(Math.PI / 2, 1)
  await stickTo(-1, 0)
  await expect.poll(async () => Math.abs(await aim())).toBeCloseTo(Math.PI, 1)
  await stickTo(0, 0)
  expect(errors).toEqual([])
})

test('gamepad: how to play lists the pad, and the in-game hints follow the last-used device', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await fakePad(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'マモノ陣形' })).toBeVisible()
  await page.getByRole('button', { name: /遊び方/ }).click()
  await expect(page.getByRole('heading', { name: 'ゲームパッド' })).toBeVisible()
  const padBlock = page.locator('.howto-pad:visible')
  for (const glyph of ['A', 'B', 'X', 'Y', 'LB/RB', 'Back', 'Start'])
    await expect(
      padBlock.locator('kbd.pad-glyph', { hasText: new RegExp(`^${glyph.replace('/', '\/')}$`) })
    ).toBeVisible()
  await expect(padBlock).toContainText('「せーの！」の合図')
  if (process.env.HOWTO_SHOT) await page.screenshot({ path: process.env.HOWTO_SHOT })
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /ひとりで遊ぶ/ }).click()
  await page.getByRole('button', { name: '出発！' }).click()
  await expect.poll(() => page.evaluate(() => window.__mamono.view?.phase), { timeout: 8000 }).toBe('play')
  await expect(page.locator('.hud')).toBeVisible()
  const hintText = () => page.locator('.hints').innerText()
  // Keyboard first: Q / Tab.
  await page.keyboard.press('KeyD')
  await expect(page.locator('.hints kbd', { hasText: /^Tab$/ })).toBeVisible()
  if (process.env.HINT_KB_SHOT) await page.screenshot({ path: process.env.HINT_KB_SHOT })
  // Pad input: Back / LB/RB glyphs.
  await page.evaluate(() => {
    ;(window as unknown as { __pad: { axes: number[] } }).__pad.axes = [0.9, 0, 0, 0]
  })
  await expect(page.locator('.hints kbd.pad-glyph', { hasText: /^LB\/RB$/ })).toBeVisible()
  await expect(page.locator('.hints kbd.pad-glyph', { hasText: /^Back$/ })).toBeVisible()
  expect(await hintText()).toContain('操作キャラ交代')
  await expect(page.locator('.hints kbd:not(.pad-glyph)')).toHaveCount(0)
  if (process.env.HINT_PAD_SHOT) await page.screenshot({ path: process.env.HINT_PAD_SHOT })
  // Back to the keyboard.
  await page.evaluate(() => {
    ;(window as unknown as { __pad: { axes: number[] } }).__pad.axes = [0, 0, 0, 0]
  })
  await page.keyboard.press('KeyD')
  await expect(page.locator('.hints kbd', { hasText: /^Tab$/ })).toBeVisible()
  await expect(page.locator('.hints kbd.pad-glyph')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('lobby pre-selects the newest unlocked stage', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await page.addInitScript(() => {
    localStorage.setItem('mamono-jinkei-v1', JSON.stringify({ progress: { cleared: ['meadow'] } }))
  })
  await page.goto('/')
  await page.getByRole('button', { name: /ひとりで遊ぶ/ }).click()
  await expect(page.getByRole('button', { name: '出発！' })).toBeVisible()
  await expect(page.locator('.stage-card.selected .stage-no')).toHaveText('ステージ 2')
  // The host can still pick another stage; it stays picked.
  await page.locator('.stage-card').first().click()
  await expect(page.locator('.stage-card.selected .stage-no')).toHaveText('ステージ 1')
  await page.waitForTimeout(400)
  await expect(page.locator('.stage-card.selected .stage-no')).toHaveText('ステージ 1')
  expect(errors).toEqual([])
})

test('Esc opens the menu, pauses solo and returns to the title', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await startSolo(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'メニュー' })).toBeVisible()
  const t0 = await page.evaluate(() => window.__mamono.W.t)
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.__mamono.W.t)).toBe(t0)
  await page.getByRole('button', { name: 'タイトルへ' }).click()
  await page.getByRole('button', { name: 'もどる', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'マモノ陣形' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__mamono.screen)).toBe('title')
  expect(errors).toEqual([])
})

test('host + guests: prediction, shared world and a spectator beyond four', async ({ context }) => {
  test.setTimeout(90_000)
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const errors: string[] = []
  const pages: Page[] = []
  for (let i = 0; i < 5; i++) {
    const p = await context.newPage()
    watchErrors(p, errors)
    await p.goto('/')
    pages.push(p)
  }
  const [host, guest, g3, g4, fifth] = pages
  await host.getByRole('button', { name: /ルームを作る/ }).click()
  await host.locator('.room-input:visible').fill('mamono-e2e')
  await host.locator('form:visible button[type=submit]').click()
  await expect(host.locator('.room-code')).toHaveText('mamono-e2e')
  for (const g of [guest, g3, g4, fifth]) {
    await g.getByRole('button', { name: /ルームに参加/ }).click()
    await g.locator('.room-input:visible').fill('mamono-e2e')
    await g.getByRole('button', { name: '参加する' }).click()
    await expect(g.locator('.lobby-screen')).toBeVisible()
  }
  await expect(host.locator('.player')).toHaveCount(5)
  await expect(fifth.locator('.lobby-screen .waiting')).toContainText('満員')
  await expect(guest.locator('.lobby-screen .waiting')).toContainText('ホストの開始を待っています')
  await host.getByRole('button', { name: '出発！' }).click()
  for (const p of pages)
    await expect.poll(() => p.evaluate(() => window.__mamono.view?.phase), { timeout: 10000 }).toBe('play')

  // Players without a chosen name get distinct defaults by join order.
  const names = await host.evaluate(() => window.__mamono.view!.players.map((p) => p.name))
  expect(new Set(names).size).toBe(names.length)
  expect(names[0]).toBe('プレイヤー1')

  // The guest sees the host's hero and controls its own.
  const hostId = await host.evaluate(() => window.__mamono.myId)
  const guestView = await guest.evaluate((hostId) => {
    const v = window.__mamono.view!
    const me = v.players.find((p) => p.id === window.__mamono.myId)!
    const hostPlayer = v.players.find((p) => p.id === hostId)!
    return { mine: me.ctrl, hostCtrl: hostPlayer.ctrl, heroes: v.heroes.map((h) => h.slot) }
  }, hostId)
  expect(guestView.mine).toBeGreaterThanOrEqual(0)
  expect(guestView.heroes).toContain(guestView.hostCtrl)
  await expect(fifth.locator('.spectator-note')).toHaveText('満員のため観戦中')

  const guestY = () =>
    guest.evaluate(() => {
      const v = window.__mamono.view!
      const slot = v.players.find((p) => p.id === window.__mamono.myId)!.ctrl
      return v.heroes.find((h) => h.slot === slot)!.y
    })
  const hostY = () =>
    host.evaluate((slot) => window.__mamono.W.heroes.find((h) => h.slot === slot)!.body.y, guestView.mine)
  const gy0 = await guestY()
  const hy0 = await hostY()
  await guest.bringToFront()
  await guest.keyboard.down('KeyS')
  await guest.waitForTimeout(700)
  await guest.keyboard.up('KeyS')
  // Predicted locally at once, then accepted by the host.
  expect(await guestY()).toBeGreaterThan(gy0 + 40)
  await expect.poll(hostY, { timeout: 4000 }).toBeGreaterThan(hy0 + 40)
  expect(errors).toEqual([])
})

/**
 * Makes a page able to act like a hidden tab: `__hide(true)` reports hidden, fires blur + visibilitychange and parks
 * requestAnimationFrame callbacks (hidden tabs get no frames); worker timers keep running as in a real hidden tab.
 * `__hide(false)` shows it again and replays the parked frames.
 */
async function hideable(page: Page) {
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window)
    const parked: FrameRequestCallback[] = []
    let hidden = false
    Object.assign(window, {
      __hide(on: boolean) {
        hidden = on
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => on })
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => (on ? 'hidden' : 'visible')
        })
        if (on) window.dispatchEvent(new Event('blur'))
        document.dispatchEvent(new Event('visibilitychange'))
        if (!on) while (parked.length) raf(parked.shift()!)
      }
    })
    window.requestAnimationFrame = (cb) => {
      if (hidden) {
        parked.push(cb)
        return 0
      }
      return raf(cb)
    }
  })
}

const hide = (page: Page, on: boolean) =>
  page.evaluate((on) => (window as unknown as { __hide(on: boolean): void }).__hide(on), on)

/** Host + one guest in a fresh room through the BroadcastChannel stand-in; one of the two pages can be hidden. */
async function hostAndGuest(context: BrowserContext, room: string, errors: string[], hideHost: boolean) {
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const host = await context.newPage()
  const guest = await context.newPage()
  await hideable(hideHost ? host : guest)
  for (const p of [host, guest]) {
    watchErrors(p, errors)
    await p.goto('/')
  }
  await host.getByRole('button', { name: /ルームを作る/ }).click()
  await host.locator('.room-input:visible').fill(room)
  await host.locator('form:visible button[type=submit]').click()
  await expect(host.locator('.room-code')).toHaveText(room)
  await guest.getByRole('button', { name: /ルームに参加/ }).click()
  await guest.locator('.room-input:visible').fill(room)
  await guest.getByRole('button', { name: '参加する' }).click()
  await expect(guest.locator('.lobby-screen')).toBeVisible()
  await expect(host.locator('.player')).toHaveCount(2)
  return { host, guest }
}

/** What the guest shows: its screen, any dialog, the waiting card and the newest snapshot time. */
const guestState = (guest: Page) =>
  guest.evaluate(() => ({
    screen: window.__mamono.screen,
    dialogs: document.querySelectorAll('[role=alertdialog]').length,
    waiting: !(document.querySelector('.host-wait') as HTMLElement | null)?.hidden,
    t: (window.__mamono as unknown as { latest?: { t: number } }).latest?.t ?? -1
  }))

/** Hides the host for 15 s: the guest stays in the room, the world keeps advancing and no fatal dialog appears. */
async function hideHostFor15s(host: Page, guest: Page) {
  const before = await guestState(guest)
  expect(before).toMatchObject({ screen: 'session', dialogs: 0, waiting: false })
  await hide(host, true)
  let lastT = before.t
  let advanced = 0
  for (let i = 0; i < 15; i++) {
    await guest.waitForTimeout(1000)
    const st = await guestState(guest)
    expect(st.screen).toBe('session')
    expect(st.dialogs).toBe(0)
    if (st.t > lastT) advanced++
    else expect(st.waiting).toBe(true)
    lastT = Math.max(lastT, st.t)
  }
  // The worker pulse keeps the hidden host stepping and broadcasting, so the world ran the whole time.
  expect(advanced).toBeGreaterThanOrEqual(14)
  expect(lastT - before.t).toBeGreaterThan(13)
  await hide(host, false)
  await expect.poll(async () => (await guestState(guest)).t, { timeout: 5000 }).toBeGreaterThan(lastT)
  expect(await guestState(guest)).toMatchObject({ screen: 'session', dialogs: 0, waiting: false })
}

const mySlot = (guest: Page) =>
  guest.evaluate(() => window.__mamono.view!.players.find((p) => p.id === window.__mamono.myId)!.ctrl)

const heroOnHost = (host: Page, slot: number) =>
  host.evaluate((slot) => {
    const b = window.__mamono.W.heroes.find((h) => h.slot === slot)!.body
    return { x: b.x, y: b.y }
  }, slot)

test('host hidden 15 s during play: guests keep playing and never get a fatal dialog', async ({ context }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  const { host, guest } = await hostAndGuest(context, 'mamono-hidden-play', errors, true)
  await host.getByRole('button', { name: '出発！' }).click()
  for (const p of [host, guest])
    await expect.poll(() => p.evaluate(() => window.__mamono.view?.phase), { timeout: 10000 }).toBe('play')
  await hideHostFor15s(host, guest)
  // Play continues: the guest's walk reaches the host.
  const slot = await mySlot(guest)
  const y0 = (await heroOnHost(host, slot)).y
  await guest.bringToFront()
  await guest.keyboard.down('KeyS')
  await guest.waitForTimeout(700)
  await guest.keyboard.up('KeyS')
  await expect.poll(async () => (await heroOnHost(host, slot)).y, { timeout: 4000 }).toBeGreaterThan(y0 + 40)
  expect(errors).toEqual([])
})

test('host hidden 15 s in the lobby: guests stay in the room and the start still works', async ({ context }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  const { host, guest } = await hostAndGuest(context, 'mamono-hidden-lobby', errors, true)
  await hideHostFor15s(host, guest)
  await expect(guest.locator('.lobby-screen')).toBeVisible()
  await expect(host.locator('.player')).toHaveCount(2)
  await host.getByRole('button', { name: '出発！' }).click()
  await expect.poll(() => guest.evaluate(() => window.__mamono.view?.phase), { timeout: 10000 }).toBe('play')
  expect(errors).toEqual([])
})

test('a silent host makes guests wait (no fatal dialog) and play resumes by itself', async ({ context }) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  const { host, guest } = await hostAndGuest(context, 'mamono-quiet-host', errors, true)
  await host.getByRole('button', { name: '出発！' }).click()
  await expect.poll(() => guest.evaluate(() => window.__mamono.view?.phase), { timeout: 10000 }).toBe('play')
  // Snapshots stop (a stalled network or a frozen tab) while the host itself carries on.
  await host.evaluate(() => {
    const net = (window.__mamono as unknown as { app: { session: { network: Record<string, unknown> } } }).app.session
      .network
    net.realBroadcast = net.broadcastSnapshot
    net.broadcastSnapshot = async () => undefined
  })
  await expect(guest.locator('.host-wait')).toBeVisible({ timeout: 6000 })
  await expect(guest.locator('.host-wait')).toContainText('ホストを待っています')
  await expect(guest.locator('.host-wait-leave')).toBeHidden()
  await expect(guest.locator('.net-status')).toHaveText('ホストを待っています…')
  await guest.waitForTimeout(2000)
  expect(await guestState(guest)).toMatchObject({ screen: 'session', dialogs: 0, waiting: true })
  await host.evaluate(() => {
    const net = (window.__mamono as unknown as { app: { session: { network: Record<string, unknown> } } }).app.session
      .network
    net.broadcastSnapshot = net.realBroadcast
  })
  await expect(guest.locator('.host-wait')).toBeHidden({ timeout: 5000 })
  await expect(guest.locator('.net-status')).toHaveText('オンライン')
  expect(await guestState(guest)).toMatchObject({ screen: 'session', dialogs: 0, waiting: false })
  expect(errors).toEqual([])
})

/** The dialogs on a page, by their text. */
const dialogsOf = (page: Page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('[role=alertdialog]'), (d) => d.textContent ?? ''))

/** The host left: the guest shows exactly one dialog naming the host, and nothing after タイトルへ. */
async function expectOneHostLeftDialog(guest: Page) {
  await expect(guest.getByRole('alertdialog')).toBeVisible({ timeout: 5000 })
  // The closed session's failed cleanup is reported right after the cause: give a second dialog time to show.
  await guest.waitForTimeout(500)
  const dialogs = await dialogsOf(guest)
  expect(dialogs).toHaveLength(1)
  expect(dialogs[0]).toContain('ホストがルームを閉じました。')
  expect(dialogs[0]).not.toContain('リレー')
  await guest.getByRole('alertdialog').getByRole('button', { name: 'タイトルへ' }).click()
  await expect.poll(() => guest.evaluate(() => window.__mamono.screen)).toBe('title')
  await guest.waitForTimeout(300)
  expect(await dialogsOf(guest)).toEqual([])
}

test('host leaves the lobby: the guest gets one dialog naming the host, and none after タイトルへ', async ({
  context
}) => {
  const errors: string[] = []
  const { host, guest } = await hostAndGuest(context, 'mamono-host-left-lobby', errors, false)
  await host.locator('.lobby-foot .back').click()
  await host.getByRole('alertdialog').getByRole('button', { name: 'もどる' }).click()
  await expect.poll(() => host.evaluate(() => window.__mamono.screen)).toBe('title')
  await expectOneHostLeftDialog(guest)
  expect(await dialogsOf(host)).toEqual([])
  expect(errors).toEqual([])
})

test('host leaves during play: the guest gets one dialog naming the host, and none after タイトルへ', async ({
  context
}) => {
  const errors: string[] = []
  const { host, guest } = await hostAndGuest(context, 'mamono-host-left-play', errors, false)
  await host.getByRole('button', { name: '出発！' }).click()
  for (const p of [host, guest])
    await expect.poll(() => p.evaluate(() => window.__mamono.view?.phase), { timeout: 10000 }).toBe('play')
  await host.bringToFront()
  await host.keyboard.press('Escape')
  await host.getByRole('button', { name: 'タイトルへ' }).click()
  await host.getByRole('alertdialog').getByRole('button', { name: 'もどる' }).click()
  await expect.poll(() => host.evaluate(() => window.__mamono.screen)).toBe('title')
  await guest.bringToFront()
  await expectOneHostLeftDialog(guest)
  expect(errors).toEqual([])
})

test('joining a room nobody hosts: "not found" after a while, retry keeps waiting, a late host still joins', async ({
  context
}) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const room = 'mamono-no-such-room'
  const guest = await context.newPage()
  watchErrors(guest, errors)
  await guest.goto('/')
  await guest.getByRole('button', { name: /ルームに参加/ }).click()
  await guest.locator('.room-input:visible').fill(room)
  const joined = Date.now()
  await guest.getByRole('button', { name: '参加する' }).click()
  await expect(guest.locator('.lobby-screen')).toBeVisible()
  const notFound = guest.getByRole('alertdialog', { name: 'ルームが見つかりません' })
  await expect(notFound).toBeVisible({ timeout: 25_000 })
  expect(Date.now() - joined).toBeGreaterThan(11_000)
  await expect(notFound).toContainText(room)
  await expect(notFound).toContainText('ルームコード')
  expect(await dialogsOf(guest)).toHaveLength(1)
  // Retry: the dialog closes and the guest goes on waiting in the room.
  await notFound.getByRole('button', { name: 'もう一度さがす' }).click()
  await expect(notFound).toHaveCount(0)
  expect(await guest.evaluate(() => window.__mamono.screen)).toBe('session')
  // The host opens the room now: the guest joins as usual.
  const host = await context.newPage()
  watchErrors(host, errors)
  await host.goto('/')
  await host.getByRole('button', { name: /ルームを作る/ }).click()
  await host.locator('.room-input:visible').fill(room)
  await host.locator('form:visible button[type=submit]').click()
  await expect(host.locator('.player')).toHaveCount(2, { timeout: 10_000 })
  await expect.poll(() => guest.evaluate(() => window.__mamono.view?.players.length ?? 0)).toBe(2)
  await guest.waitForTimeout(500)
  expect(await dialogsOf(guest)).toEqual([])
  // Another search that finds nothing offers going back, which returns to the title.
  const lone = await context.newPage()
  watchErrors(lone, errors)
  await lone.goto('/')
  await lone.waitForFunction(() => !!window.__mamono)
  await lone.evaluate(() => {
    ;(window.__mamono as unknown as { app: { roomSearchAfter: number } }).app.roomSearchAfter = 2
  })
  await lone.getByRole('button', { name: /ルームに参加/ }).click()
  await lone.locator('.room-input:visible').fill('mamono-nobody-here')
  await lone.getByRole('button', { name: '参加する' }).click()
  const loneNotFound = lone.getByRole('alertdialog', { name: 'ルームが見つかりません' })
  await expect(loneNotFound).toBeVisible({ timeout: 8000 })
  await loneNotFound.getByRole('button', { name: 'タイトルへ' }).click()
  await expect.poll(() => lone.evaluate(() => window.__mamono.screen)).toBe('title')
  expect(await dialogsOf(lone)).toEqual([])
  expect(errors).toEqual([])
})

test('guest back after 12 s hidden: the effects and sounds of the hidden time are not replayed at once', async ({
  context
}) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  const { host, guest } = await hostAndGuest(context, 'mamono-hidden-backlog', errors, false)
  await host.getByRole('button', { name: '出発！' }).click()
  for (const p of [host, guest])
    await expect.poll(() => p.evaluate(() => window.__mamono.view?.phase), { timeout: 10000 }).toBe('play')
  // Count what the guest plays (sounds and drawn events) with the time they were played.
  await guest.evaluate(() => {
    const app = (window.__mamono as unknown as { app: Record<string, Record<string, unknown>> }).app
    const log: number[] = []
    Object.assign(window, { __played: log })
    for (const [owner, method] of [
      ['audio', 'sfx'],
      ['renderer', 'event']
    ] as const) {
      const target = app[owner]
      const real = (target[method] as (...a: unknown[]) => unknown).bind(target)
      target[method] = (...a: unknown[]) => {
        log.push(performance.now())
        return real(...a)
      }
    }
  })
  await hide(guest, true)
  // The host keeps swinging while the guest is away (each swing is a sound and an effect).
  await host.bringToFront()
  const at = (await host.evaluate(() => window.__mamono.camera.heroCss))!
  for (let i = 0; i < 24; i++) {
    await host.mouse.move(at.x + 80, at.y)
    await host.mouse.down()
    await host.waitForTimeout(80)
    await host.mouse.up()
    await host.waitForTimeout(420)
  }
  // The backlog is real: many events wait on the hidden guest.
  const pending = await guest.evaluate(
    () =>
      (window.__mamono as unknown as { app: { session: { queue: { pending: unknown[] } } } }).app.session.queue.pending
        .length
  )
  expect(pending).toBeGreaterThan(20)
  const shown = await guest.evaluate(() => performance.now())
  await hide(guest, false)
  await guest.waitForTimeout(400)
  const burst = await guest.evaluate(
    (from) => (window as unknown as { __played: number[] }).__played.filter((t) => t >= from && t < from + 300).length,
    shown
  )
  expect(burst).toBeLessThan(10)
  // The guest shows the host's current state.
  const [hostT, guestT] = await Promise.all([
    host.evaluate(() => window.__mamono.view!.t),
    guest.evaluate(() => (window.__mamono as unknown as { latest: { t: number } }).latest.t)
  ])
  expect(Math.abs(hostT - guestT)).toBeLessThan(1)
  expect(errors).toEqual([])
})

test('guest hidden while holding D: its hero stops on the host within a second', async ({ context }) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  const { host, guest } = await hostAndGuest(context, 'mamono-hidden-guest', errors, false)
  await host.getByRole('button', { name: '出発！' }).click()
  for (const p of [host, guest])
    await expect.poll(() => p.evaluate(() => window.__mamono.view?.phase), { timeout: 10000 }).toBe('play')
  const slot = await mySlot(guest)
  const x0 = (await heroOnHost(host, slot)).x
  await guest.bringToFront()
  await guest.keyboard.down('KeyD')
  await expect.poll(async () => (await heroOnHost(host, slot)).x, { timeout: 4000 }).toBeGreaterThan(x0 + 20)
  await hide(guest, true)
  await host.waitForTimeout(1000)
  const stopped = await heroOnHost(host, slot)
  await host.waitForTimeout(1000)
  const later = await heroOnHost(host, slot)
  expect(Math.hypot(later.x - stopped.x, later.y - stopped.y)).toBeLessThan(2)
  await guest.keyboard.up('KeyD')
  await hide(guest, false)
  expect(errors).toEqual([])
})

test('stage 2 (rat): dash through a mouse hole and gnaw a barricade with the stampede', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await page.goto('/')
  await page.waitForFunction(() => !!(window.__mamono as unknown as { startStage?: unknown }).startStage)
  await page.evaluate(() => (window.__mamono as unknown as { startStage(s: string): void }).startStage('sewer'))
  await expect(page.locator('.intro-name')).toHaveText('地下水路と穀物庫')
  await expect.poll(() => page.evaluate(() => window.__mamono.view?.phase), { timeout: 6000 }).toBe('play')
  const me = () =>
    page.evaluate(() => {
      const W = window.__mamono.W
      const h = W.heroes.find((q) => q.slot === W.humans[0].ctrl)!
      return { x: h.body.x / 64, y: h.body.y / 64 }
    })
  // The hole pair 'jj' (64,46)–(65,46): dash in from the left, come out on the right.
  await place(page, T(62), T(46))
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(250)
  await page.keyboard.press('Space')
  await expect.poll(async () => (await me()).x, { timeout: 3000 }).toBeGreaterThan(66)
  await page.keyboard.up('KeyD')
  await expect(page.locator('.hint').first()).toBeVisible()

  // チューチュー大行進 up the granary stairs through the barricade.
  await page.evaluate(() => window.__mamono.warp('G'))
  await page.waitForTimeout(300)
  await place(page, T(41) + 10, T(23), true)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const W = window.__mamono.W
          return W.heroes.find((h) => h.slot === W.humans[0].ctrl)!.form >= 0
        }),
      { timeout: 8000 }
    )
    .toBe(true)
  // Let the camera glide over from the warp before aiming at the screen.
  await page.waitForTimeout(1500)
  const at = (await page.evaluate(() => window.__mamono.camera.heroCss))!
  await page.mouse.move(at.x, Math.max(5, at.y - 300))
  await page.mouse.down()
  await expect
    .poll(() => page.evaluate(() => window.__mamono.view?.formations.some((f) => (f as { ready?: boolean }).ready)), {
      timeout: 3000
    })
    .toBe(true)
  await page.mouse.up()
  await expect(page.locator('.banner.on')).toContainText('チューチュー大行進！')
  await expect
    .poll(() => page.evaluate(() => window.__mamono.W.props.find((p) => p.part === 'barricadeG')!.state), {
      timeout: 4000
    })
    .toBe('break')
  expect(errors).toEqual([])
})

test('stage 3 (crow): fly over a gap; the tornado spins the windmill and the drawbridges lower', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await page.goto('/')
  await page.waitForFunction(() => !!(window.__mamono as unknown as { startStage?: unknown }).startStage)
  await page.evaluate(() => (window.__mamono as unknown as { startStage(s: string): void }).startStage('tower'))
  await expect(page.locator('.intro-name')).toHaveText('風鳴りの崖と時計塔')
  await expect.poll(() => page.evaluate(() => window.__mamono.view?.phase), { timeout: 6000 }).toBe('play')
  const meX = () =>
    page.evaluate(() => {
      const W = window.__mamono.W
      return W.heroes.find((h) => h.slot === W.humans[0].ctrl)!.body.x / 64
    })
  // Gap A→B1: sky tiles 25..27 on row 57.
  await place(page, T(23), T(57), true)
  await page.waitForTimeout(800)
  await page.keyboard.down('KeyD')
  await page.keyboard.down('Space')
  await expect.poll(meX, { timeout: 3000 }).toBeGreaterThan(28.2)
  await page.keyboard.up('Space')
  await page.keyboard.up('KeyD')
  await expect.poll(() => page.evaluate(() => window.__mamono.view?.heroes.find((h) => h.ctrl)?.state)).not.toBe('fall')

  // 黒羽の大旋風 on the windmill.
  await page.evaluate(() => window.__mamono.warp('C'))
  await page.waitForTimeout(300)
  await place(page, T(60) + 32, T(43), true)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const W = window.__mamono.W
          return W.heroes.find((h) => h.slot === W.humans[0].ctrl)!.form >= 0
        }),
      { timeout: 8000 }
    )
    .toBe(true)
  await page.waitForTimeout(1500)
  const aim = await page.evaluate(() => {
    const m = window.__mamono
    const W = m.W
    const mill = W.props.find((p) => p.part === 'windmillC')!
    const me = W.heroes.find((h) => h.slot === W.humans[0].ctrl)!
    const k = m.camera.scale / devicePixelRatio
    return { x: m.camera.heroCss!.x + (mill.x - me.body.x) * k, y: m.camera.heroCss!.y + (mill.y - me.body.y + 14) * k }
  })
  await page.mouse.move(aim.x, Math.max(5, aim.y))
  await page.mouse.down()
  await page.waitForTimeout(1150)
  await page.mouse.up()
  await expect(page.locator('.banner.on')).toContainText('黒羽の大旋風！')
  await expect
    .poll(() => page.evaluate(() => window.__mamono.W.props.find((p) => p.part === 'windmillC')!.state), {
      timeout: 4000
    })
    .toBe('spin')
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__mamono.W.props.filter((p) => p.kind === 'drawbridge').every((p) => p.state === 'down')
        ),
      { timeout: 4000 }
    )
    .toBe(true)
  expect(errors).toEqual([])
})

async function startStage(page: Page, stage: string, name: string) {
  await page.goto('/')
  await page.waitForFunction(() => !!(window.__mamono as unknown as { startStage?: unknown }).startStage)
  await page.evaluate((s) => (window.__mamono as unknown as { startStage(s: string): void }).startStage(s), stage)
  await expect(page.locator('.intro-name')).toHaveText(name)
  await expect.poll(() => page.evaluate(() => window.__mamono.view?.phase), { timeout: 6000 }).toBe('play')
}

/** CSS position of a world point, relative to the controlled hero's on-screen position. */
const screenOf = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => {
      const m = window.__mamono
      const W = m.W
      const me = W.heroes.find((h) => h.slot === W.humans[0].ctrl)!
      const k = m.camera.scale / devicePixelRatio
      return {
        x: m.camera.heroCss!.x + (x - me.body.x) * k,
        y: Math.max(4, m.camera.heroCss!.y + (y - me.body.y + 14) * k)
      }
    },
    [x, y] as const
  )

test('stage 4 (wolf): a howl lights a moonstone; 月下群狼陣 shatters the ice wall', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await startStage(page, 'forest', '月影の森と白銀の砦')
  const part = (id: string) =>
    page.evaluate((id) => {
      const p = window.__mamono.W.props.find((q) => q.part === id)!
      return { x: p.x, y: p.y, state: p.state }
    }, id)
  const moon = await part('moonA')
  await place(page, moon.x, moon.y + 70, true)
  await page.waitForTimeout(600)
  await page.keyboard.press('Space')
  await expect.poll(async () => (await part('moonA')).state, { timeout: 3000 }).toBe('on')

  await page.evaluate(() => window.__mamono.warp('G'))
  await page.waitForTimeout(300)
  const wall = await part('icewallG')
  await place(page, wall.x, wall.y + 170, true)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const W = window.__mamono.W
          return W.heroes.find((h) => h.slot === W.humans[0].ctrl)!.form >= 0
        }),
      { timeout: 8000 }
    )
    .toBe(true)
  await page.waitForTimeout(1500)
  const aim = await screenOf(page, wall.x, wall.y)
  await page.mouse.move(aim.x, aim.y)
  await page.mouse.down()
  await page.waitForTimeout(1150)
  await page.mouse.up()
  await expect(page.locator('.banner.on')).toContainText('月下群狼陣！')
  await expect.poll(async () => (await part('icewallG')).state, { timeout: 5000 }).toBe('break')
  expect(errors).toEqual([])
})

test('finale: stage 4 results → ending scene and staff roll → title', async ({ page }) => {
  const errors: string[] = []
  watchErrors(page, errors)
  await startStage(page, 'forest', '月影の森と白銀の砦')
  await page.evaluate(() => {
    const W = window.__mamono.W as unknown as Record<string, unknown> & { t: number }
    W.results = { stage: 'forest', time: 640, gems: 40, techs: 7, kos: 50, wipes: 0, rank: 'S', badges: [] }
    W.phase = 'clear'
    W.phaseAt = W.t
  })
  await page.getByRole('button', { name: 'エンディングへ' }).click()
  await expect.poll(() => page.evaluate(() => window.__mamono.view?.phase)).toBe('ending')
  await expect(page.locator('.epi-orbs')).toContainText('陣の宝珠')
  await expect(page.locator('.form-card')).toHaveCount(4)
  await expect(page.locator('.roll')).toContainText('スペシャルサンクス')
  expect(await page.locator('.marcher').count()).toBeGreaterThan(15)
  await page.getByRole('button', { name: 'タイトルへ' }).click()
  await expect.poll(() => page.evaluate(() => window.__mamono.screen)).toBe('title')
  await expect(page.getByRole('heading', { name: 'マモノ陣形' })).toBeVisible()
  expect(errors).toEqual([])
})
