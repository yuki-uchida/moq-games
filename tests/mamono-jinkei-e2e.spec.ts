/**
 * マモノ陣形 browser tests: title, solo play (move, attack, charge, formation technique, pushing), the pause menu,
 * and host + guests through a BroadcastChannel stand-in for CooperativeNetwork (prediction, spectators).
 */
import { expect, test, type Page } from '@playwright/test'

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
  camera: { heroCss?: { x: number; y: number } }
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
    };
    this.players = new Set([this.playerId]);
    if (o.role === 'guest') this.channel.postMessage({ type: 'hello', id: this.playerId });
    o.onStatus('ready', 'ok');
  }
  async sendInput(input) { this.channel.postMessage({ type: 'input', id: this.playerId, input }); }
  async broadcastSnapshot(state) { this.channel.postMessage({ type: 'snapshot', state }); }
  async stop() { this.channel?.close(); }
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
