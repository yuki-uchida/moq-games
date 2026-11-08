/**
 * マモノ陣形 over a REAL MoQ relay (opt-in, not in CI): a loopback moq-relay 0.17.2 (draft-14) with a self-signed
 * certificate, the unmodified game and CooperativeNetwork, and five separate Chrome browsers — a host, three guests
 * and a fifth player who must end up spectating.
 *
 * Requires MOQ_RELAY_EXECUTABLE_PATH, OPENSSL_EXECUTABLE_PATH and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
 * Run: npx playwright test --config playwright.mamono-jinkei-real-moq.config.ts
 */
import { chromium, expect, test, type Browser, type Page } from '@playwright/test'
import { startRealMoq } from './mamono-jinkei-real-moq-server.mjs'

type Hook = {
  myId?: string
  role?: string
  screen?: string
  view?: {
    phase: string
    t: number
    heroes: { slot: number; x: number; y: number; state: string; form?: number }[]
    players: { id: string; ctrl: number; spectator?: boolean }[]
    formations: { slots: number[]; ready: boolean }[]
    techs: { kind: string; slots: number[] }[]
    party: { techs: number }
  }
  W?: { party: { techs: number }; techs: unknown[] }
  camera: { heroCss?: { x: number; y: number } }
  warp(to: string): void
}

declare global {
  interface Window {
    __mamono: Hook
  }
}

const ROOM = `real-${Date.now().toString(36)}`

test('host + 3 guests + a spectator play together through a real MoQ relay', async () => {
  const env = await startRealMoq()
  const browsers: Browser[] = []
  const errors: string[] = []
  try {
    const open = async (name: string): Promise<Page> => {
      const browser = await chromium.launch({
        executablePath: env.chrome,
        headless: true,
        args: [
          `--ignore-certificate-errors-spki-list=${env.spki}`,
          `--origin-to-force-quic-on=${new URL(env.relayURL).host}`,
          '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows'
        ]
      })
      browsers.push(browser)
      const page = await browser.newPage({ viewport: { width: 1024, height: 600 } })
      page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
      page.on('console', (m) => {
        // The browser's favicon request is the only expected 404.
        if (
          m.type() === 'error' &&
          !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())
        )
          errors.push(`${name}: ${m.text()}`)
      })
      page.on('response', (r) => {
        if (r.status() >= 400 && !r.url().endsWith('/favicon.ico'))
          errors.push(`${name}: HTTP ${r.status()} ${r.url()}`)
      })
      await page.goto(`${env.baseURL}/?relayUrl=${encodeURIComponent(env.relayURL)}`)
      await page.waitForFunction(() => !!window.__mamono)
      return page
    }

    // Host creates the room.
    const host = await open('host')
    await host.getByRole('button', { name: /ルームを作る/ }).click()
    await host.locator('.room-input:visible').fill(ROOM)
    await host.locator('form:visible button[type=submit]').click()
    await expect(host.locator('.room-code')).toHaveText(ROOM, { timeout: 30_000 })

    // Three guests and a fifth player join.
    const guests: Page[] = []
    for (const name of ['guest1', 'guest2', 'guest3', 'fifth']) {
      const page = await open(name)
      await page.getByRole('button', { name: /ルームに参加/ }).click()
      await page.locator('.room-input:visible').fill(ROOM)
      await page.getByRole('button', { name: '参加する' }).click()
      await expect(page.locator('.lobby-screen')).toBeVisible({ timeout: 30_000 })
      guests.push(page)
    }
    const fifth = guests.pop()!
    await expect(host.locator('.player')).toHaveCount(5, { timeout: 45_000 })
    // Every joiner receives the host's snapshots (the lobby list) before the start.
    for (const page of [...guests, fifth])
      await expect
        .poll(() => page.evaluate(() => window.__mamono.view?.players.length ?? 0), { timeout: 45_000 })
        .toBe(5)
    await expect(fifth.locator('.lobby-screen .waiting')).toContainText('満員')

    await host.getByRole('button', { name: '出発！' }).click()
    for (const page of [host, ...guests, fifth])
      await expect.poll(() => page.evaluate(() => window.__mamono.view?.phase), { timeout: 30_000 }).toBe('play')
    await expect(fifth.locator('.spectator-note')).toHaveText('満員のため観戦中')

    const slotOf = (page: Page) =>
      page.evaluate(() => window.__mamono.view!.players.find((p) => p.id === window.__mamono.myId)!.ctrl)
    const slots = await Promise.all([host, ...guests].map(slotOf))
    expect(new Set(slots).size).toBe(4)
    expect(slots.every((s) => s >= 0)).toBe(true)
    const xOn = (page: Page, slot: number) =>
      page.evaluate((s) => window.__mamono.view!.heroes.find((h) => h.slot === s)!.x, slot)

    // Each guest's movement reaches the host; the host's movement reaches every guest.
    for (let i = 0; i < guests.length; i++) {
      const before = await xOn(host, slots[i + 1])
      await guests[i].keyboard.down('KeyD')
      await guests[i].waitForTimeout(700)
      await guests[i].keyboard.up('KeyD')
      await expect.poll(() => xOn(host, slots[i + 1]), { timeout: 10_000 }).toBeGreaterThan(before + 40)
    }
    const seen = await Promise.all(guests.map((g) => xOn(g, slots[0])))
    await host.keyboard.down('KeyD')
    await host.waitForTimeout(700)
    await host.keyboard.up('KeyD')
    for (let i = 0; i < guests.length; i++)
      await expect.poll(() => xOn(guests[i], slots[0]), { timeout: 10_000 }).toBeGreaterThan(seen[i] + 40)

    // Gather the party (a host-side warp moves every hero), then guest 1 fires the co-op technique.
    await host.evaluate(() => window.__mamono.warp('B'))
    const g1 = guests[0]
    await expect
      .poll(
        () =>
          g1.evaluate(() => {
            const v = window.__mamono.view!
            const me = v.players.find((p) => p.id === window.__mamono.myId)!
            const hero = v.heroes.find((h) => h.slot === me.ctrl)!
            return hero.form !== undefined && v.formations[hero.form].slots.length >= 2
          }),
        { timeout: 20_000 }
      )
      .toBe(true)
    await g1.waitForTimeout(1200)
    const at = (await g1.evaluate(() => window.__mamono.camera.heroCss))!
    const techsBefore = await host.evaluate(() => window.__mamono.W!.party.techs)
    await g1.mouse.move(at.x + 120, at.y)
    await g1.mouse.down()
    await g1.waitForTimeout(1300)
    await g1.mouse.up()
    await expect
      .poll(() => host.evaluate(() => window.__mamono.W!.party.techs), { timeout: 10_000 })
      .toBeGreaterThan(techsBefore)
    // Every other screen shows it: the banner and the technique in its own view.
    for (const page of [host, guests[1], guests[2], fifth])
      await expect(page.locator('.banner.on')).toContainText('ジャンボ・プレス', { timeout: 10_000 })
    for (const page of [guests[1], guests[2], fifth])
      await expect
        .poll(() => page.evaluate(() => window.__mamono.view!.party.techs), { timeout: 10_000 })
        .toBeGreaterThan(techsBefore)

    expect(errors).toEqual([])
  } catch (error) {
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
