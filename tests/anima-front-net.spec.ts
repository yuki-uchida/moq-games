/**
 * アニマフロント online play in the browser: ルームを作る / ルームに参加 with a BroadcastChannel stand-in for
 * CooperativeNetwork (served in place of rabbiters/src/network.ts), several pages of one browser context as the
 * players. Covers a PvE host + 2 guests reaching the match and seeing each other move, a PvP room with three
 * humans on three teams, the PvP information boundary (a guest never receives a hidden enemy, raw messages
 * intercepted in the stand-in), a guest leaving (its seat becomes a bot) and the host leaving (the guests' card).
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

type NetHook = {
  role?: 'host' | 'guest'
  me?: string
  code?: string
  view?: {
    phase: string
    players: {
      id: string
      name: string
      team: number
      bot: boolean
      species?: string
      state: string
      p: [number, number, number]
    }[]
  }
  /** Team parts this guest opened (dev hook). */
  parts?: { p: { id: string }[] }[]
}

declare global {
  interface Window {
    __animaNet?: NetHook
    /** Every raw host message this page received (the stand-in network keeps the newest 600). */
    __raw?: unknown[]
  }
}

const fakeNetwork = `
export const MAX_PAYLOAD_BYTES = 65536;
export class CooperativeNetwork {
  constructor(options) { this.options = options; this.playerId = options.playerId; this.players = new Set([options.playerId]); }
  async start() {
    const o = this.options;
    this.channel = new BroadcastChannel(JSON.stringify(['anon', o.app, o.room]));
    this.channel.onmessage = ({ data }) => {
      if (this.stopped) return;
      if (o.role === 'host') {
        if (data.type === 'hello' && !this.players.has(data.id)) {
          this.players.add(data.id);
          o.onPresence([...this.players]);
          this.channel.postMessage({ type: 'presence', ids: [...this.players] });
        }
        if (data.type === 'leave' && this.players.delete(data.id)) {
          o.onPresence([...this.players]);
          this.channel.postMessage({ type: 'presence', ids: [...this.players] });
        }
        if (data.type === 'input' && this.players.has(data.id)) o.onInput(data.id, data.input);
      } else {
        if (data.type === 'presence') {
          const was = this.admitted;
          this.admitted = data.ids.includes(this.playerId);
          if (this.admitted && !was) o.onStatus('ready', 'Connected to host');
        }
        if (data.type === 'snapshot' && this.admitted) {
          const raw = (globalThis.__raw ??= []);
          raw.push(data.state);
          if (raw.length > 600) raw.shift();
          o.onSnapshot(data.state);
        }
        if (data.type === 'host-up') this.channel.postMessage({ type: 'hello', id: this.playerId });
        if (data.type === 'bye') o.onStatus('error', 'Error: Host left the room. Create a new connection to retry.');
      }
    };
    if (o.role === 'guest') this.channel.postMessage({ type: 'hello', id: this.playerId });
    else this.channel.postMessage({ type: 'host-up' });
    o.onStatus(o.role === 'host' ? 'ready' : 'waiting-for-host', 'ok');
  }
  async sendInput(input) { if (!this.stopped) this.channel.postMessage({ type: 'input', id: this.playerId, input }); }
  async broadcastSnapshot(state) { if (!this.stopped) this.channel.postMessage({ type: 'snapshot', state }); }
  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.channel?.postMessage(this.options.role === 'host' ? { type: 'bye' } : { type: 'leave', id: this.playerId });
    this.channel?.close();
  }
}`

function watchErrors(page: Page, name: string, errors: string[]) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (/Outdated Optimize Dep|Failed to fetch dynamically imported module/.test(text)) return
    errors.push(`${name}: ${text}`)
  })
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
}

const current = (page: Page, cls: string) => page.locator(`.screen.${cls}:not(.is-leaving)`)

async function openTitle(page: Page) {
  await page.goto('/')
  await expect(page.locator('.screen.title:not(.is-leaving)')).toBeVisible({ timeout: 90_000 })
  await page.locator('.title-press').click()
  await expect(page.locator('.screen.title.is-ready')).toBeVisible()
}

async function players(context: BrowserContext, count: number, errors: string[]) {
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  // The first-match controls card is covered by the UI tests; skip it here.
  await context.addInitScript(() => localStorage.setItem('anima-front-v1:guide', JSON.stringify({ seen: true })))
  const pages: Page[] = []
  for (let i = 0; i < count; i++) {
    const page = await context.newPage()
    watchErrors(page, i === 0 ? 'host' : `guest${i}`, errors)
    await openTitle(page)
    pages.push(page)
  }
  return pages
}

/** sortie → mode → (missions) → room screen. */
async function toRoom(page: Page, mode: 'pve' | 'pvp') {
  await page.click('[data-menu="sortie"]')
  await page.click(`[data-mode="${mode}"]`)
  if (mode === 'pve') {
    await expect(current(page, 'missions')).toBeVisible()
    await page.click('[data-go]')
  }
  await expect(current(page, 'room')).toBeVisible()
}

async function host(page: Page, mode: 'pve' | 'pvp', code: string) {
  await toRoom(page, mode)
  await page.click('[data-room="host"]')
  const input = page.locator('.room-code-input')
  await expect(input).toBeVisible()
  await expect(input).not.toHaveValue('')
  await input.fill(code)
  await page.click('[data-room-go="host"]')
  await expect(current(page, 'lobby')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.lobby-code')).toContainText(code)
}

async function join(page: Page, mode: 'pve' | 'pvp', code: string) {
  await toRoom(page, mode)
  await page.click('[data-room="join"]')
  await page.locator('.room-code-input').fill(code)
  await page.click('[data-room-go="join"]')
  await expect(current(page, 'lobby')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.lobby-code')).toContainText(code)
}

const hook = (page: Page) => page.evaluate(() => window.__animaNet ?? null)

const positionOf = async (page: Page, id: string) =>
  (await hook(page))?.view?.players.find((p) => p.id === id)?.p ?? null

const dist = (a: number[] | null, b: number[] | null) => (a && b ? Math.hypot(a[0] - b[0], a[2] - b[2]) : 0)

/** Holds W on a page for `ms`. */
async function walk(page: Page, ms: number) {
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(ms)
  await page.keyboard.up('KeyW')
}

test.describe.configure({ timeout: 420_000, retries: 1 })

test.describe('アニマフロント online (BroadcastChannel stand-in)', () => {
  test('PvE: host + 2 guests reach the match and see each other move', async ({ context }) => {
    const errors: string[] = []
    const [h, g1, g2] = await players(context, 3, errors)
    await host(h, 'pve', 'sakura-7001')
    await expect(h.locator('.lobby-conn')).toHaveText('オンライン')
    await join(g1, 'pve', 'sakura-7001')
    await join(g2, 'pve', 'sakura-7001')
    // three humans and one bot in every lobby
    for (const p of [h, g1, g2]) {
      await expect(p.locator('.seat')).toHaveCount(4)
      await expect(p.locator('.seat.is-bot')).toHaveCount(1)
    }
    await expect(g1.locator('.seat.is-me')).toHaveCount(1)
    // the host cannot start before the guests are ready
    await h.click('.lobby-go')
    await expect(h.locator('.toast.is-error')).toContainText('準備ができていない仲間')
    await g1.click('.lobby-go')
    await g2.click('.lobby-go')
    await expect(g1.locator('.lobby-go')).toHaveText('準備を取り消す')
    await expect(h.locator('.seat .seat-ready')).toHaveCount(4)
    await h.click('.lobby-go')
    // everyone goes to the briefing, then into the match
    for (const p of [h, g1, g2]) await expect(current(p, 'briefing')).toBeVisible({ timeout: 30_000 })
    for (const p of [g1, g2, h]) await p.click('.brief-go')
    for (const p of [h, g1, g2]) await expect(current(p, 'game')).toBeVisible()
    for (const p of [h, g1, g2])
      await expect.poll(async () => (await hook(p))?.view?.phase, { timeout: 120_000 }).toBe('play')
    const me1 = (await hook(g1))!.me!
    const me2 = (await hook(g2))!.me!
    expect(new Set(['h0', me1, me2]).size).toBe(3)
    // guest 1 walks: the host and guest 2 see it move; then guest 2 walks and guest 1 sees it
    const before = await positionOf(h, me1)
    await walk(g1, 1500)
    await expect.poll(async () => dist(await positionOf(h, me1), before), { timeout: 10_000 }).toBeGreaterThan(3)
    await expect.poll(async () => dist(await positionOf(g2, me1), before), { timeout: 10_000 }).toBeGreaterThan(3)
    // the walking guest's own view agrees with the host's within a short distance
    await g1.waitForTimeout(800)
    expect(dist(await positionOf(g1, me1), await positionOf(h, me1))).toBeLessThan(1.5)
    const before2 = await positionOf(g1, me2)
    await walk(g2, 1200)
    await expect.poll(async () => dist(await positionOf(g1, me2), before2), { timeout: 10_000 }).toBeGreaterThan(2)
    // the host moves too and the guests see it
    const hostBefore = await positionOf(g1, 'h0')
    await walk(h, 1200)
    await expect.poll(async () => dist(await positionOf(g1, 'h0'), hostBefore), { timeout: 10_000 }).toBeGreaterThan(2)
    expect(errors).toEqual([])
  })

  test('PvP: three humans on three teams', async ({ context }) => {
    const errors: string[] = []
    const [h, g1, g2] = await players(context, 3, errors)
    await host(h, 'pvp', 'arena-7002')
    await join(g1, 'pvp', 'arena-7002')
    await join(g2, 'pvp', 'arena-7002')
    await g1.click('[data-team="1"]')
    await g2.click('[data-team="2"]')
    await expect(h.locator('.team-col')).toHaveCount(3)
    await expect(h.locator('.seat')).toHaveCount(12)
    for (const [p, team] of [
      [h, 'アカネ隊'],
      [g1, 'アオイ隊'],
      [g2, 'キハダ隊']
    ] as const)
      await expect(p.locator('.team-col.is-mine .team-head')).toContainText(team)
    await g1.click('.lobby-go')
    await g2.click('.lobby-go')
    await expect(h.locator('.seat:not(.is-bot) .seat-ready')).toHaveCount(3)
    await h.click('.lobby-go')
    for (const p of [h, g1, g2]) await expect(current(p, 'briefing')).toBeVisible({ timeout: 30_000 })
    for (const p of [g1, g2, h]) await p.click('.brief-go')
    for (const p of [h, g1, g2]) await expect(current(p, 'game')).toBeVisible()
    await expect.poll(async () => (await hook(g2))?.view?.players.length, { timeout: 120_000 }).toBe(12)
    const v = (await hook(h))!.view!
    const ids = [(await hook(h))!.me!, (await hook(g1))!.me!, (await hook(g2))!.me!]
    expect(ids.map((id) => v.players.find((p) => p.id === id)?.team)).toEqual([0, 1, 2])
    expect(v.players.filter((p) => !p.bot)).toHaveLength(3)
    // online matches do not pause
    await expect(h.locator('.game-pause.is-on')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('PvP: a guest never receives an enemy its team cannot see, and sees it once in view', async ({ context }) => {
    const errors: string[] = []
    const [h, g1, g2] = await players(context, 3, errors)
    await host(h, 'pvp', 'arena-7004')
    await join(g1, 'pvp', 'arena-7004')
    await join(g2, 'pvp', 'arena-7004')
    await g1.click('[data-team="1"]')
    await g2.click('[data-team="2"]')
    await g1.click('.lobby-go')
    await g2.click('.lobby-go')
    await expect(h.locator('.seat:not(.is-bot) .seat-ready')).toHaveCount(3)
    await h.click('.lobby-go')
    for (const p of [h, g1, g2]) await expect(current(p, 'briefing')).toBeVisible({ timeout: 30_000 })
    for (const p of [g1, g2, h]) await p.click('.brief-go')
    for (const p of [g1, g2])
      await expect.poll(async () => (await hook(p))?.view?.phase, { timeout: 120_000 }).toBe('play')
    const yellow = (await hook(g2))!.me!
    // The yellow guest stands still in its base (out of the blue team's sight); look at what blue gets.
    const at = await positionOf(g2, yellow)
    await g1.evaluate(() => {
      window.__raw = []
      if (window.__animaNet) window.__animaNet.parts = []
    })
    await g1.waitForTimeout(4000)
    expect(dist(await positionOf(g2, yellow), at)).toBeLessThan(0.5)
    const report = await g1.evaluate(
      ({ id, at }) => {
        const triples = (v: unknown, out: number[][] = []): number[][] => {
          if (Array.isArray(v)) {
            if (v.length === 3 && v.every((n) => typeof n === 'number')) out.push(v as number[])
            for (const x of v) triples(x, out)
          } else if (v && typeof v === 'object') for (const x of Object.values(v)) triples(x, out)
          return out
        }
        const near = (v: unknown) =>
          triples(v).filter((t) => Math.hypot(t[0] - at[0], t[2] - at[2]) < 2 && Math.abs(t[1] - at[1]) < 3).length
        const raw = (window.__raw ?? []) as {
          k?: string
          view?: { props?: { kind: string }[]; events?: { type: string }[] }
        }[]
        const snaps = raw.filter((m) => m.k === 'snap')
        // Public parts, without the fixed map fixtures (bases, pads) and the kill feed.
        const pub = snaps.map((m) => ({
          ...m,
          view: {
            ...m.view,
            props: (m.view?.props ?? []).filter((x) => x.kind !== 'base' && x.kind !== 'pad'),
            events: (m.view?.events ?? []).filter((e) => e.type !== 'ko')
          }
        }))
        const parts = window.__animaNet?.parts ?? []
        return {
          snaps: snaps.length,
          parts: parts.length,
          rawMentions: pub.filter((m) => JSON.stringify(m).includes(`"${id}"`)).length,
          rawNear: near(pub),
          partMentions: parts.filter((p) => JSON.stringify(p).includes(`"${id}"`)).length,
          partNear: near(parts),
          shown: window.__animaNet?.view?.players.find((p) => p.id === id)?.state
        }
      },
      { id: yellow, at: at! }
    )
    expect(report.snaps).toBeGreaterThan(40)
    expect(report.parts).toBeGreaterThan(40)
    expect(report).toMatchObject({ rawMentions: 0, rawNear: 0, partMentions: 0, partNear: 0, shown: 'away' })
    // The yellow guest walks out toward the plaza until the blue team sees it; blue then draws it where it is.
    let seen = false
    for (let i = 0; i < 30 && !seen; i++) {
      await walk(g2, 1500)
      const mine = await positionOf(g2, yellow)
      const v = (await hook(g1))?.view
      const there = v?.players.find((p) => p.id === yellow)
      seen = there?.state === 'alive' && dist(there.p, mine) < 4
      if (!seen) await g1.waitForTimeout(300)
    }
    expect(seen).toBe(true)
    expect(
      await g1.evaluate((id) => (window.__animaNet?.parts ?? []).some((p) => p.p.some((x) => x.id === id)), yellow)
    ).toBe(true)
    expect(errors).toEqual([])
  })

  test('a guest leaving becomes a bot; the host leaving shows the card', async ({ context }) => {
    const errors: string[] = []
    const [h, g1, g2] = await players(context, 3, errors)
    await host(h, 'pve', 'kuma-7003')
    await join(g1, 'pve', 'kuma-7003')
    await join(g2, 'pve', 'kuma-7003')
    await g1.click('.lobby-go')
    await g2.click('.lobby-go')
    await expect(h.locator('.seat .seat-ready')).toHaveCount(4)
    await h.click('.lobby-go')
    for (const p of [h, g1, g2]) await expect(current(p, 'briefing')).toBeVisible({ timeout: 30_000 })
    for (const p of [g1, g2, h]) await p.click('.brief-go')
    await expect.poll(async () => (await hook(g2))?.view?.players.length, { timeout: 120_000 }).toBe(4)
    const leaver = (await hook(g2))!.me!
    await expect
      .poll(async () => (await hook(h))?.view?.players.find((p) => p.id === leaver)?.bot, { timeout: 30_000 })
      .toBe(false)
    // guest 2 closes its tab: the host hands the seat to a bot
    await g2.close()
    await expect
      .poll(async () => (await hook(h))?.view?.players.find((p) => p.id === leaver)?.bot, { timeout: 30_000 })
      .toBe(true)
    // the host leaves the room (title → closes the tab): guest 1 sees the card
    await h.close()
    await expect(g1.locator('.game-error.is-on')).toBeVisible({ timeout: 30_000 })
    await expect(g1.locator('.game-error')).toContainText('ホストがルームを閉じました')
    await g1.locator('.game-error .btn').first().click()
    await expect(current(g1, 'lobby')).toBeVisible()
    await expect(g1.locator('.lobby-closed')).toBeVisible()
    await expect(g1.locator('.lobby-closed')).toContainText('ホストがルームを閉じました')
    await g1.click('[data-closed-back]')
    await expect(current(g1, 'room')).toBeVisible()
    expect(errors.filter((e) => !e.startsWith('host') && !e.startsWith('guest2'))).toEqual([])
  })

  test('PvE: a guest joining a running mission drops into a bot seat with its own animal and plays it', async ({
    context
  }) => {
    const errors: string[] = []
    const [h, g] = await players(context, 2, errors)
    await host(h, 'pve', 'drop-7004')
    // the host starts alone: three bots fill the squad
    await h.click('.lobby-go')
    await expect(current(h, 'briefing')).toBeVisible({ timeout: 30_000 })
    await h.click('.brief-go')
    await expect(current(h, 'game')).toBeVisible()
    await expect.poll(async () => (await hook(h))?.view?.phase, { timeout: 120_000 }).toBe('play')
    const squad = (await hook(h))!.view!.players
    const bots = squad.filter((p) => p.bot).map((p) => p.id)
    expect(bots).toHaveLength(3)
    // both pages start from the same default animal; the bots are other animals
    const hostSpecies = squad.find((p) => p.id === 'h0')!.species
    const botSpecies = new Map(squad.map((p) => [p.id, p.species]))
    // the guest joins the running room and goes straight into the match on a bot's seat
    await toRoom(g, 'pve')
    await g.click('[data-room="join"]')
    await g.locator('.room-code-input').fill('drop-7004')
    await g.click('[data-room-go="join"]')
    await expect(current(g, 'game')).toBeVisible({ timeout: 60_000 })
    await expect.poll(async () => (await hook(g))?.view?.phase, { timeout: 120_000 }).toBe('play')
    const me = (await hook(g))!.me!
    expect(bots).toContain(me)
    const mine = (await hook(g))!.view!.players.find((p) => p.id === me)!
    await expect
      .poll(async () => (await hook(h))?.view?.players.find((p) => p.id === me)?.bot, { timeout: 30_000 })
      .toBe(false)
    const onHost = (await hook(h))!.view!.players.find((p) => p.id === me)!
    expect(onHost.species).toBe(mine.species)
    expect(onHost.species).toBe(hostSpecies)
    expect(onHost.species).not.toBe(botSpecies.get(me))
    expect(onHost.name).toBe(mine.name)
    // its keys move its own animal on the host
    const before = await positionOf(h, me)
    await walk(g, 1500)
    await expect.poll(async () => dist(await positionOf(h, me), before), { timeout: 10_000 }).toBeGreaterThan(3)
    // the host's menu lists everyone; removing the guest (after a confirmation) hands its seat back to a bot
    await h.keyboard.press('Escape')
    await expect(h.locator('.game-pause.is-on')).toBeVisible()
    await h.click('[data-pause="members"]')
    await expect(h.locator('.pause-member')).toHaveCount(2)
    await expect(h.locator('.pause-member [data-kick]')).toHaveCount(1)
    await h.screenshot({ path: test.info().outputPath('host-members.png') })
    await h.click('.pause-member [data-kick]')
    await h.locator('.modal-veil .btn-primary').click()
    await expect(h.locator('.pause-member')).toHaveCount(1)
    await expect(g.locator('.game-error.is-on')).toBeVisible({ timeout: 30_000 })
    await expect(g.locator('.game-error')).toContainText('ホストによってルームから外されました')
    await expect
      .poll(async () => (await hook(h))?.view?.players.find((p) => p.id === me)?.bot, { timeout: 30_000 })
      .toBe(true)
    expect(errors).toEqual([])
  })

  test('joining a room that does not exist says so', async ({ context }) => {
    const errors: string[] = []
    const [g] = await players(context, 1, errors)
    await toRoom(g, 'pve')
    await g.click('[data-room="join"]')
    await g.locator('.room-code-input').fill('Nobody Here 0')
    await g.click('[data-room-go="join"]')
    await expect(g.locator('.room-dialog-note')).toContainText('ルームが見つかりませんでした', { timeout: 30_000 })
    await expect(g.locator('.room-code-input')).toHaveValue('nobody-here-0')
    expect(errors).toEqual([])
  })
})
