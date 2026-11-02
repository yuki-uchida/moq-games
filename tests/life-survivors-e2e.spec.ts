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
  await expect(page.getByRole('heading', { name: /ジンセイガ・ツライデース/ })).toBeVisible()
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

test('蒸発済み starts with a free early talent pick and then plays on', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  const handle = await life(page)
  await handle.evaluate((l) => {
    const game = l.game as unknown as { removePlayer(id: string): void; addPlayer(id: string, parent: string): void }
    game.removePlayer(l.localId)
    game.addPlayer(l.localId, 'p_gone')
  })
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#cards .card')).toHaveCount(3)
  await expect(page.locator('#levelup-note')).toContainText('自分の力で生きていく')
  await page.keyboard.press('Digit1')
  await expect(page.locator('#levelup')).toBeHidden()
  await expect
    .poll(() => handle.evaluate((l) => (l.view as unknown as { kills: number }).kills), { timeout: 20000 })
    .toBeGreaterThan(0)
  await expect(page.locator('#weapons > *')).not.toHaveCount(0)
  expect(errors).toEqual([])
})

test('a broken heart: the death plays out before the result, which names the final blow', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByText('死や自死を暗示する表現があります')).toBeVisible()
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  const handle = await life(page)
  await handle.evaluate((l) => {
    const game = l.game as unknown as {
      state: { time: number; players: { x: number; y: number; hp: number; weapons: unknown[] }[] }
      spawnEnemy(kind: string, x: number, y: number): void
    }
    const p = game.state.players[0]
    game.state.time = 25 * 22.5
    p.weapons = []
    p.hp = 0.01
    game.spawnEnemy('boss', p.x, p.y)
  })
  await expect.poll(() => handle.evaluate((l) => l.view.phase)).toBe('lost')
  await page.waitForTimeout(1000)
  await expect(page.locator('#result')).toBeHidden()
  await expect(page.getByRole('heading', { name: /心が折れた — 享年25歳/ })).toBeVisible({ timeout: 6000 })
  await expect(page.locator('#result-text')).toContainText('とどめ：上司（人間関係）')
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

type Hook = {
  game: {
    state: {
      time: number
      eventIndex: number
      players: { x: number; y: number; choices: string[]; choiceSeq: number }[]
    }
    spawnEnemy(kind: string, x: number, y: number): void
  }
}

test('a boss announces itself: WARNING banner, then a boss bar under the xp bar', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('#boss-bar')).toBeHidden()
  const handle = await life(page)
  await handle.evaluate((l) => {
    const game = (l as unknown as Hook).game
    game.state.eventIndex = 99
    const p = game.state.players[0]
    game.spawnEnemy('b_hs', p.x + 260, p.y)
  })
  await expect(page.locator('#banner .banner-warning')).toBeVisible()
  await expect(page.locator('#banner .banner-warning')).toContainText('WARNING')
  await expect(page.locator('#banner .banner-warning')).toContainText('人生イベント：高校受験')
  await expect(page.locator('#boss-bar')).toBeVisible()
  await expect(page.locator('#boss-name')).toHaveText('高校受験')
  // banners never stack: the warning leaves before the next one shows
  await expect(page.locator('#banner .banner')).toHaveCount(1)
  await expect(page.locator('#banner .banner-warning')).toBeHidden({ timeout: 5000 })
  expect(errors).toEqual([])
})

test('the sound toggle is a pressed button, flips with M, and survives a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const title = page.locator('#mute-title')
  await expect(title).toHaveAttribute('aria-pressed', 'false')
  await title.click()
  await expect(title).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.locator('#mute-title')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  const mute = page.locator('#mute')
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('KeyM')
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: '遊び方を表示' }).click()
  await expect(page.locator('#volume')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator('#mute-title')).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})

test('a lucky four-card hand shows rarity frames and key 4 picks the last card', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  const handle = await life(page)
  await handle.evaluate((l) => {
    const p = (l as unknown as Hook).game.state.players[0]
    p.choices = ['w:w_sns', 'w:w_pet', 'p:p_hot', 'x:meal']
    p.choiceSeq++
  })
  await expect(page.locator('#cards .card')).toHaveCount(4)
  await expect(page.locator('#levelup-note')).toContainText('1〜4キー')
  await expect(page.locator('#cards .card.rarity-new')).toHaveCount(2)
  await expect(page.locator('#cards .card.rarity-passive')).toHaveCount(1)
  await expect(page.locator('#cards .card .ribbon').first()).toHaveText('NEW')
  await page.keyboard.press('Digit4')
  await expect(page.locator('#levelup')).toBeHidden()
  await expect.poll(() => handle.evaluate((l) => (l as unknown as Hook).game.state.players[0].choices.length)).toBe(0)
  expect(errors).toEqual([])
})
