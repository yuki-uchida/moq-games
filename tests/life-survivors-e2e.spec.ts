import { expect, test, type Page } from '@playwright/test'

type Life = {
  game: { state: { time: number; players: { id: string; choices: string[]; x: number }[] }; gainXp(n: number): void }
  view: { time: number; phase: string; players: { id: string; x: number; choices: string[] }[] }
  localId: string
}
const life = (page: Page) => page.evaluateHandle(() => (window as unknown as { __life: Life }).__life)

test('a solo life: birth, a turning point, and the reaper at 30:00', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Life Survivors/ })).toBeVisible()
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('#feed')).toContainText('が生まれた。親は')
  await expect(page.locator('#stage')).toHaveText('乳児期')

  const handle = await life(page)
  await page.keyboard.down('KeyD')
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].x)).toBeGreaterThan(40)
  await page.keyboard.up('KeyD')

  await handle.evaluate((l) => l.game.gainXp(12))
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#cards .card')).toHaveCount(3)
  await page.screenshot({ path: testInfo.outputPath('levelup.png') })
  const paused = await handle.evaluate((l) => l.view.time)
  await page.waitForTimeout(300)
  expect(await handle.evaluate((l) => l.view.time)).toBe(paused)
  await page.keyboard.press('Digit1')
  await expect(page.locator('#levelup')).toBeHidden()
  await expect.poll(() => handle.evaluate((l) => l.view.time)).toBeGreaterThan(paused)

  await handle.evaluate((l) => (l.game.state.time = 60 * 14))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: testInfo.outputPath('midlife.png') })
  await handle.evaluate((l) => {
    l.game.state.time = 30 * 60 - 0.5
    for (const p of l.game.state.players) p.choices = []
  })
  await expect(page.locator('#feed')).toContainText('死神', { timeout: 5000 })
  await page.screenshot({ path: testInfo.outputPath('reaper.png') })
  await expect(page.getByRole('heading', { name: /大往生 — 享年80歳/ })).toBeVisible({ timeout: 8000 })
  await expect(page.locator('#result-build')).toContainText('才能：')
  await page.screenshot({ path: testInfo.outputPath('result.png') })
  await page.getByRole('button', { name: 'もう一度生まれる' }).click()
  await expect(page.getByRole('button', { name: 'ひとりで生まれる' })).toBeVisible()
  expect(errors).toEqual([])
})

// Replaces the relay with a BroadcastChannel so two real pages play a host/guest session.
const fakeNetwork = `
export const MAX_PAYLOAD_BYTES = 65536;
export class CooperativeNetwork {
  constructor(options) { this.options = options; this.playerId = options.playerId; }
  async start() {
    const o = this.options;
    this.channel = new BroadcastChannel('life-' + o.room);
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

test('two players share one life-world: the guest moves and gets their own hand', async ({ context }, testInfo) => {
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const host = await context.newPage()
  const guest = await context.newPage()
  const errors: string[] = []
  for (const page of [host, guest]) page.on('pageerror', (error) => errors.push(error.message))
  for (const page of [host, guest]) {
    await page.goto('/')
    await page.locator('#room').fill('e2e-room')
  }
  await host.getByRole('button', { name: 'ルームを作る' }).click()
  await expect(host.locator('#hud')).toBeVisible()
  await guest.getByRole('button', { name: 'ルームに参加' }).click()
  await expect(guest.locator('#hud')).toBeVisible()
  const hostLife = await life(host)
  await expect.poll(() => hostLife.evaluate((l) => l.game.state.players.length)).toBe(2)
  const guestLife = await life(guest)
  const guestId = await guestLife.evaluate((l) => l.localId)
  await expect.poll(() => guestLife.evaluate((l) => l.view?.players.length ?? 0)).toBe(2)
  await expect(guest.locator('#team li')).toHaveCount(2)

  const start = await hostLife.evaluate((l, id) => l.game.state.players.find((p) => p.id === id)!.x, guestId)
  await guest.bringToFront()
  await guest.keyboard.down('KeyD')
  await expect
    .poll(() => hostLife.evaluate((l, id) => l.game.state.players.find((p) => p.id === id)!.x, guestId))
    .toBeGreaterThan(start + 30)
  await guest.keyboard.up('KeyD')

  await hostLife.evaluate((l) => l.game.gainXp(12))
  await expect(guest.locator('#cards .card')).toHaveCount(3)
  await expect(guest.locator('#levelup-note')).toContainText('時間は流れ続けています')
  await guest.screenshot({ path: testInfo.outputPath('guest.png') })
  await guest.locator('#cards .card').first().click()
  await expect
    .poll(() => hostLife.evaluate((l, id) => l.game.state.players.find((p) => p.id === id)!.choices.length, guestId))
    .toBe(0)
  await expect(guest.locator('#levelup')).toBeHidden()
  expect(errors).toEqual([])
})
