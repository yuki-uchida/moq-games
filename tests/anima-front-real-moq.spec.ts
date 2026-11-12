/**
 * アニマフロント over a REAL MoQ relay (opt-in, not in CI): a loopback moq-relay 0.17.2 (draft-14) with a
 * self-signed certificate, the unmodified game and CooperativeNetwork, one Chrome browser per player.
 *
 * - 防衛任務: a host and three guests fill the squad, reach the match, every guest's input reaches the host and the
 *   host's snapshots reach every guest; the host aborting and then closing the room is shown to the guests.
 * - 三つ巴演習: a host and two guests on three teams play a 12-seat match and exchange inputs and snapshots.
 *
 * Requires MOQ_RELAY_EXECUTABLE_PATH, OPENSSL_EXECUTABLE_PATH and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
 * Run: npx playwright test --config playwright.anima-front-real-moq.config.ts
 * (playwright.anima-front.config.ts also matches this file by name; there it skips itself.)
 */
import { chromium, expect, test, type Browser, type Page } from '@playwright/test'
import { startRealMoq } from './anima-front-real-moq-server.mjs'

type NetHook = {
  role?: 'host' | 'guest'
  me?: string
  view?: {
    phase: string
    players: { id: string; team: number; bot: boolean; p: [number, number, number] }[]
  }
}

declare global {
  interface Window {
    __animaNet?: NetHook
  }
}

type RealMoq = Awaited<ReturnType<typeof startRealMoq>>

// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.skip(
    !/anima-front-real-moq\.config/.test(info.config.configFile ?? ''),
    'opt-in: run with playwright.anima-front-real-moq.config.ts'
  )
})

const gpu =
  process.platform === 'win32' && !process.env.ANIMA_E2E_SOFTWARE_GL
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    : []

/** Opens the game in its own Chrome (one browser per player) and collects its errors. */
function opener(env: RealMoq, browsers: Browser[], errors: string[]) {
  return async (name: string): Promise<Page> => {
    const browser = await chromium.launch({
      executablePath: env.chrome,
      headless: true,
      args: [
        `--ignore-certificate-errors-spki-list=${env.spki}`,
        `--origin-to-force-quic-on=${new URL(env.relayURL).host}`,
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        ...gpu
      ]
    })
    browsers.push(browser)
    const page = await browser.newPage({ viewport: { width: 1024, height: 600 } })
    await page.addInitScript(() => localStorage.setItem('anima-front-v1:guide', JSON.stringify({ seen: true })))
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      if (/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) return
      errors.push(`${name}: ${m.text()}`)
    })
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`${name}: HTTP ${r.status()} ${r.url()}`)
    })
    await page.goto(`${env.baseURL}/?relayUrl=${encodeURIComponent(env.relayURL)}`)
    await expect(page.locator('.screen.title:not(.is-leaving)')).toBeVisible({ timeout: 120_000 })
    await page.locator('.title-press').click()
    await expect(page.locator('.screen.title.is-ready')).toBeVisible()
    return page
  }
}

const current = (page: Page, cls: string) => page.locator(`.screen.${cls}:not(.is-leaving)`)

async function toRoom(page: Page, mode: 'pve' | 'pvp') {
  await page.click('[data-menu="sortie"]')
  await page.click(`[data-mode="${mode}"]`)
  if (mode === 'pve') await page.click('[data-go]')
  await expect(current(page, 'room')).toBeVisible()
}

async function hostRoom(page: Page, mode: 'pve' | 'pvp', code: string) {
  await toRoom(page, mode)
  await page.click('[data-room="host"]')
  await page.locator('.room-code-input').fill(code)
  await page.click('[data-room-go="host"]')
  await expect(current(page, 'lobby')).toBeVisible({ timeout: 45_000 })
  await expect(page.locator('.lobby-conn')).toHaveText('オンライン')
}

async function joinRoom(page: Page, mode: 'pve' | 'pvp', code: string) {
  await toRoom(page, mode)
  await page.click('[data-room="join"]')
  await page.locator('.room-code-input').fill(code)
  await page.click('[data-room-go="join"]')
  await expect(current(page, 'lobby')).toBeVisible({ timeout: 45_000 })
}

const hook = (page: Page) => page.evaluate(() => window.__animaNet ?? null)
const positionOf = async (page: Page, id: string) =>
  (await hook(page))?.view?.players.find((p) => p.id === id)?.p ?? null
const dist = (a: number[] | null, b: number[] | null) => (a && b ? Math.hypot(a[0] - b[0], a[2] - b[2]) : 0)

async function walk(page: Page, ms: number) {
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(ms)
  await page.keyboard.up('KeyW')
}

/** Everyone ready → host starts → everyone through the briefing into the running match. */
async function startMatch(host: Page, guests: Page[]) {
  for (const g of guests) {
    await expect(g.locator('.lobby-go')).toHaveText('準備完了', { timeout: 30_000 })
    await g.click('.lobby-go')
  }
  await expect(host.locator('.lobby-go')).not.toHaveClass(/is-disabled/, { timeout: 30_000 })
  await host.click('.lobby-go')
  for (const p of [host, ...guests]) await expect(current(p, 'briefing')).toBeVisible({ timeout: 30_000 })
  for (const p of [...guests, host]) await p.click('.brief-go')
  for (const p of [host, ...guests])
    await expect.poll(async () => (await hook(p))?.view?.phase, { timeout: 120_000 }).toBe('play')
}

/** Every guest's input reaches the host; the host's snapshots carry the host's own movement to every guest. */
async function exchange(host: Page, guests: Page[]) {
  for (const g of guests) {
    const me = (await hook(g))!.me!
    const before = await positionOf(host, me)
    await walk(g, 1200)
    await expect.poll(async () => dist(await positionOf(host, me), before), { timeout: 15_000 }).toBeGreaterThan(2)
    // the guest's own (predicted) body agrees with the host's
    await g.waitForTimeout(600)
    const gap = dist(await positionOf(g, me), await positionOf(host, me))
    if (gap >= 2) {
      const pick = async (p: Page) =>
        p.evaluate((id) => {
          const h = window.__animaNet as NetHook & { prediction?: unknown }
          const pl = h?.view?.players.find((q) => q.id === id) as unknown as Record<string, unknown>
          return {
            p: pl?.p,
            v: pl?.v,
            state: pl?.state,
            move: pl?.move,
            bot: pl?.bot,
            t: h?.view && (h.view as unknown as { time: number }).time,
            vis: document.visibilityState,
            err: document.querySelector('.game-error.is-on')?.textContent,
            scr: document.querySelector('.screen:not(.is-leaving)')?.className,
            prediction: h?.prediction
          }
        }, me)
      const steps = async () => (await host.evaluate(() => (window.__animaNet as { steps?: number })?.steps)) ?? 0
      const s0 = await steps()
      await host.waitForTimeout(2000)
      const rate = ((await steps()) - s0) / 2
      console.log(
        'own body gap',
        gap,
        JSON.stringify({ guest: await pick(g), host: await pick(host), rate, guest2: await pick(g) })
      )
    }
    expect(gap).toBeLessThan(2)
  }
  const seen = await Promise.all(guests.map((g) => positionOf(g, 'h0')))
  const own = await positionOf(host, 'h0')
  await walk(host, 1200)
  const moved = dist(await positionOf(host, 'h0'), own)
  if (moved <= 2)
    console.log(
      'host walk',
      moved,
      JSON.stringify(await host.evaluate(() => window.__animaNet?.view?.players.find((p) => p.id === 'h0')))
    )
  expect(moved).toBeGreaterThan(2)
  for (let i = 0; i < guests.length; i++)
    await expect
      .poll(async () => dist(await positionOf(guests[i], 'h0'), seen[i]), { timeout: 15_000 })
      .toBeGreaterThan(2)
}

const ROOM = `real-${Date.now().toString(36)}`

test('防衛任務: host + 3 guests play through a real MoQ relay', async () => {
  const env = await startRealMoq()
  const browsers: Browser[] = []
  const errors: string[] = []
  try {
    const open = opener(env, browsers, errors)
    const host = await open('host')
    await hostRoom(host, 'pve', ROOM)
    const guests: Page[] = []
    for (const name of ['guest1', 'guest2', 'guest3']) {
      const page = await open(name)
      await joinRoom(page, 'pve', ROOM)
      guests.push(page)
    }
    for (const p of [host, ...guests]) {
      await expect(p.locator('.seat')).toHaveCount(4)
      await expect(p.locator('.seat.is-bot')).toHaveCount(0, { timeout: 45_000 })
    }
    await startMatch(host, guests)
    const ids = await Promise.all([host, ...guests].map(async (p) => (await hook(p))!.me!))
    expect(new Set(ids).size).toBe(4)
    for (const p of [host, ...guests]) {
      const v = (await hook(p))!.view!
      expect(v.players.filter((q) => !q.bot)).toHaveLength(4)
    }
    await exchange(host, guests)
    // The host aborts the mission: every guest is told and goes back to the lobby; then the host closes the room.
    await host.keyboard.press('Escape')
    await host.click('[data-pause="abort"]')
    await host.getByRole('button', { name: '中断する' }).click()
    await expect(current(host, 'lobby')).toBeVisible()
    for (const g of guests) {
      await expect(g.locator('.game-error.is-on')).toContainText('ホストが任務を中断しました', { timeout: 20_000 })
      await g.locator('.game-error .btn').first().click()
      await expect(current(g, 'lobby')).toBeVisible()
    }
    await host.keyboard.press('Escape')
    await host.getByRole('button', { name: '閉じる' }).click()
    await expect(current(host, 'room')).toBeVisible()
    for (const g of guests)
      await expect(g.locator('.lobby-closed')).toContainText('ホストがルームを閉じました', { timeout: 30_000 })
    expect(errors).toEqual([])
  } catch (error) {
    for (const b of browsers)
      for (const c of b.contexts())
        for (const p of c.pages())
          console.error(
            'net log',
            JSON.stringify(await p.evaluate(() => (window.__animaNet as { log?: string[] })?.log).catch(() => null))
          )
    console.error(
      'relay diagnostics',
      JSON.stringify({ ...env.diagnostics(), log: env.diagnostics().log.slice(-4000) })
    )
    throw error
  } finally {
    for (const b of browsers) await b.close().catch(() => {})
    await env.stop()
  }
})

test('三つ巴演習: host + 2 guests on three teams through a real MoQ relay', async () => {
  const env = await startRealMoq()
  const browsers: Browser[] = []
  const errors: string[] = []
  try {
    const open = opener(env, browsers, errors)
    const room = `${ROOM}-pvp`
    const host = await open('host')
    await hostRoom(host, 'pvp', room)
    const guests: Page[] = []
    for (const [name, team] of [
      ['guest1', 1],
      ['guest2', 2]
    ] as const) {
      const page = await open(name)
      await joinRoom(page, 'pvp', room)
      await page.click(`[data-team="${team}"]`)
      guests.push(page)
    }
    await expect(host.locator('.seat:not(.is-bot)')).toHaveCount(3, { timeout: 45_000 })
    await startMatch(host, guests)
    for (const p of [host, ...guests])
      await expect.poll(async () => (await hook(p))?.view?.players.length, { timeout: 30_000 }).toBe(12)
    const v = (await hook(host))!.view!
    const ids = await Promise.all([host, ...guests].map(async (p) => (await hook(p))!.me!))
    expect(ids.map((id) => v.players.find((p) => p.id === id)?.team)).toEqual([0, 1, 2])
    await exchange(host, guests)
    expect(errors).toEqual([])
  } catch (error) {
    for (const b of browsers)
      for (const c of b.contexts())
        for (const p of c.pages())
          console.error(
            'net log',
            JSON.stringify(await p.evaluate(() => (window.__animaNet as { log?: string[] })?.log).catch(() => null))
          )
    console.error(
      'relay diagnostics',
      JSON.stringify({ ...env.diagnostics(), log: env.diagnostics().log.slice(-4000) })
    )
    throw error
  } finally {
    for (const b of browsers) await b.close().catch(() => {})
    await env.stop()
  }
})
