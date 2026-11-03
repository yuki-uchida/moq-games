import { expect, test, type Page } from '@playwright/test'
import type { Game } from '../examples/games/life-survivors/src/game'
import type { View } from '../examples/games/life-survivors/src/view'

type Life = {
  game: {
    state: { time: number; xpNext: number; players: { id: string; choices: string[]; x: number }[] }
    gainXp(n: number): void
  }
  view: { time: number; phase: string; players: { id: string; x: number; choices: string[] }[] }
  localId: string
}
const life = (page: Page) => page.evaluateHandle(() => (window as unknown as { __life: Life }).__life)

test('reading effects render behind local and co-op players', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __life: Life }).__life.view))).toBe(true)
  const orders = await page.evaluate(async () => {
    const renderPath = '/src/render.ts'
    const dataPath = '/src/data.ts'
    const { Renderer } = await import(renderPath)
    const { WEAPONS } = await import(dataPath)
    const life = (window as unknown as { __life: Life }).__life
    const view = structuredClone(life.view) as unknown as View
    const player = view.players[0]
    view.players.push({ ...structuredClone(player), id: 'guest', x: player.x + 10 })
    view.enemies = []
    view.shots = [
      WEAPONS.findIndex((weapon: { id: string }) => weapon.id === 'w_reading'),
      player.x,
      player.y,
      100,
      0,
      50,
      0,
      0
    ]
    return [false, true].map((evolved) => {
      player.weapons = [['w_reading', evolved ? 8 : 1, 0]]
      player.passives = evolved ? [['p_curious', 1]] : []
      const renderer = new Renderer(document.createElement('canvas'))
      const events: string[] = []
      let layer = ''
      for (const method of ['groundShot', 'topShot']) {
        const original = renderer[method].bind(renderer)
        renderer[method] = (...args: unknown[]) => {
          layer = method
          original(...args)
          layer = ''
        }
      }
      for (const method of ['art', 'centred']) {
        const original = renderer[method].bind(renderer)
        renderer[method] = (...args: unknown[]) => {
          if (layer) events.push(`${layer}:${method}`)
          original(...args)
        }
      }
      const originalPlayer = renderer.player.bind(renderer)
      renderer.player = (...args: unknown[]) => {
        events.push('player')
        originalPlayer(...args)
      }
      renderer.draw(view, life.localId, 0.016, false)
      return events
    })
  })
  for (const events of orders) {
    expect(events).toEqual(['groundShot:art', 'groundShot:centred', 'groundShot:art', 'player', 'player'])
  }
})

test('synergy details show activation and release from the local hand', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate((life) => {
    const game = life.game as unknown as Game
    const player = game.state.players[0]
    player.birthPick = false
    player.choices = []
    player.pending = 0
    player.weapons = ['w_reading', 'w_invest'].map((id) => ({ id, lv: 1, cd: 100, held: 0, damage: 0 }))
  })
  await expect(page.locator('#synergy-count')).toHaveText('人生の相乗効果 1/6')
  await page.locator('#synergy-count').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#synergies')).toHaveAttribute('open', '')
  await expect(page.locator('#synergy-list')).toContainText('発動中：知識で資産形成')
  await expect(page.locator('#synergy-list p')).toHaveCount(6)
  await handle.evaluate((life) => {
    const player = (life.game as unknown as Game).state.players[0]
    player.weapons = ['w_friend', 'w_love', 'w_sports', 'w_hobby', 'w_reading', 'w_invest'].map((id) => ({
      id,
      lv: 1,
      cd: 100,
      held: 0,
      damage: 0
    }))
  })
  await expect(page.locator('#synergy-count')).toHaveText('人生の相乗効果 6/6')
  for (const name of ['体験が育む表現', '遊びからのひらめき', 'ゆとりが広げる交流']) {
    await expect(page.locator('#synergy-list')).toContainText(`発動中：${name}`)
  }
  await page.screenshot({ path: testInfo.outputPath('synergies-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(() => {
      const panel = document.querySelector('#synergy-list')!
      const feed = document.querySelector('#feed p')
      if (!feed) return true
      const a = panel.getBoundingClientRect()
      const b = feed.getBoundingClientRect()
      const left = Math.max(a.left, b.left)
      const right = Math.min(a.right, b.right)
      const top = Math.max(a.top, b.top)
      const bottom = Math.min(a.bottom, b.bottom)
      return (
        right <= left ||
        bottom <= top ||
        panel.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2))
      )
    })
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('synergies-mobile.png') })
  const list = page.getByRole('region', { name: '人生の相乗効果の一覧' })
  await list.focus()
  await page.keyboard.press('End')
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect(list.getByText(/ゆとりが広げる交流/)).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('synergies-mobile-scrolled.png') })
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await handle.evaluate((life) => {
    const game = life.game as unknown as Game
    const player = game.state.players[0]
    player.weapons = ['w_reading', 'w_invest'].map((id) => ({ id, lv: 1, cd: 100, held: 0, damage: 0 }))
    player.choices = ['r:w_reading:w_hobby']
    game.choose(player, 0)
  })
  await expect(page.locator('#synergy-count')).toHaveText('人生の相乗効果 0/6')
  await expect(page.locator('#synergy-list')).toContainText('未発動：知識で資産形成')
  await page.locator('#synergy-count').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#synergies')).not.toHaveAttribute('open')
})

test('trained careers render together for local and co-op participants', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate((life) => {
    const game = life.game as unknown as {
      state: {
        time: number
        players: {
          x: number
          y: number
          birthPick: boolean
          pending: number
          choices: string[]
          weapons: { id: string; lv: number; cd: number; held: number; damage: number }[]
        }[]
      }
      addPlayer(id: string, parent: string): unknown
    }
    game.addPlayer('career-bureaucrat', 'p_gone')
    game.addPlayer('career-investor', 'p_gone')
    game.state.time = 350
    game.state.players.forEach((player, index) => {
      player.birthPick = false
      player.pending = 0
      player.choices = []
      player.x = 1000 + index * 45
      player.y = 1000
      player.weapons = [{ id: ['w_sports', 'w_study', 'w_invest'][index], lv: 5, cd: 100, held: 0, damage: 0 }]
    })
  })
  await expect.poll(() => handle.evaluate((life) => life.view.players.length)).toBe(3)
  await expect.poll(() => handle.evaluate((life) => life.view.time)).toBeGreaterThan(350)
  await page.screenshot({ path: testInfo.outputPath('careers-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('careers-mobile.png') })
})

test('turning point cards show their talent category without revealing talent values', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate((l) => {
    const player = l.game.state.players[0] as (typeof l.game.state.players)[number] & {
      choiceSeq: number
      birthPick: boolean
      pending: number
    }
    player.birthPick = false
    player.pending = 0
    player.choices = ['w:w_study', 'p:p_savvy']
    player.choiceSeq++
  })
  await expect(page.locator('#cards .card').nth(0)).toContainText('知性系')
  await expect(page.locator('#cards .card').nth(1)).toContainText('対人系')
  await expect(page.locator('#cards .card').nth(1)).toContainText('基準値')
  expect(await handle.evaluate((l) => l.view.players[0])).not.toHaveProperty('talents')
  await page
    .locator('#cards .card')
    .evaluateAll((cards) =>
      Promise.all(cards.flatMap((card) => card.getAnimations().map((animation) => animation.finished)))
    )
  await page.screenshot({ path: testInfo.outputPath('talent-cards-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('talent-cards-mobile.png') })
  await page.locator('#cards .card').first().click()
  await page.getByRole('button', { name: '遊び方を表示' }).click()
  await expect(page.getByRole('img', { name: '秘密の才能の六角形' })).toBeVisible()
  await expect(page.locator('#help-close')).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('talent-guide-mobile.png') })
})

test('a full build skips ordinary level-ups and offers an optional weapon swap', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate(async (l) => {
    const dataPath = '/src/data.ts'
    const { EVENTS } = await import(dataPath)
    const game = l.game as unknown as {
      state: {
        time: number
        eventIndex: number
        level: number
        xpNext: number
        players: { choices: string[]; pending: number; birthPick: boolean }[]
      }
      options(player: unknown): string[]
      choose(player: unknown, index: number): void
      gainXp(amount: number): void
    }
    game.state.time = 600
    game.state.eventIndex = EVENTS.findIndex((event: { at: number }) => event.at > game.state.time)
    const player = game.state.players[0]
    player.birthPick = false
    player.pending = 0
    for (let i = 0; i < 200; i++) {
      const option = game.options(player)[0]
      if (!option) break
      player.choices = [option]
      game.choose(player, 0)
    }
    game.state.level = 3
    game.gainXp(game.state.xpNext)
  })
  await expect(page.locator('#levelup')).toBeHidden()
  await handle.evaluate((l) => l.game.gainXp((l.game.state as unknown as { xpNext: number }).xpNext))
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#levelup-note')).toContainText('新しい武器')
  await page.locator('#cards .card').first().click()
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].choices[0])).toMatch(/^r:/)
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#levelup-note')).toContainText('手放す武器')
  await page.getByRole('button', { name: /交換しない/ }).click()
  await expect(page.locator('#levelup')).toBeHidden()
  await expect.poll(() => handle.evaluate((l) => l.game.state.players[0].choices)).toEqual([])
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].choices)).toEqual([])
  await handle.evaluate((l) => {
    const state = l.game.state as unknown as { level: number; xpNext: number }
    state.level = 9
    l.game.gainXp(state.xpNext)
  })
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].choices[0])).toMatch(/^s:/)
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#levelup-note')).toContainText('新しい武器')
  const newWeapon = await handle.evaluate((l) => l.view.players[0].choices[0].split(':')[1])
  await page.locator('#cards .card').first().click()
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].choices[0])).toMatch(/^r:/)
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#levelup-note')).toContainText('手放す武器')
  const oldWeapon = await handle.evaluate((l) => l.view.players[0].choices[0].split(':')[1])
  await page.locator('#cards .card').first().click()
  await expect(page.locator('#levelup')).toBeHidden()
  await expect
    .poll(() => handle.evaluate((l) => (l.view.players[0] as unknown as { weapons: [string, number][] }).weapons))
    .toEqual(expect.arrayContaining([[newWeapon, 1, expect.any(Number)]]))
  expect(
    await handle.evaluate(
      (l, oldId) =>
        (l.view.players[0] as unknown as { weapons: [string, number][] }).weapons.some(([id]) => id === oldId),
      oldWeapon
    )
  ).toBe(false)
})

test('a solo life: birth, a turning point, and the reaper at 15:00', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /ジンセイガ・ツライデース/ })).toBeVisible()
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('#feed')).toContainText('が生まれた。親は')
  await expect(page.locator('#stage')).toHaveText('乳児期')

  const handle = await life(page)
  // A 蒸発済み parent opens with a birth pick, which stops time; this life starts empty-handed instead.
  await handle.evaluate((l) => {
    for (const p of l.game.state.players) p.choices = []
  })
  await page.keyboard.down('KeyD')
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].x)).toBeGreaterThan(40)
  await page.keyboard.up('KeyD')

  await handle.evaluate((l) => l.game.gainXp(l.game.state.xpNext))
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#cards .card')).toHaveCount(3)
  await page.screenshot({ path: testInfo.outputPath('levelup.png') })
  const paused = await handle.evaluate((l) => l.view.time)
  await page.waitForTimeout(300)
  expect(await handle.evaluate((l) => l.view.time)).toBe(paused)
  await page.keyboard.press('Digit1')
  await expect(page.locator('#levelup')).toBeHidden()
  await expect.poll(() => handle.evaluate((l) => l.view.time)).toBeGreaterThan(paused)

  await handle.evaluate((l) => (l.game.state.time = 60 * 8))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: testInfo.outputPath('midlife.png') })
  await handle.evaluate((l) => {
    l.game.state.time = 15 * 60 - 0.5
    for (const p of l.game.state.players) p.choices = []
    const player = (l.game as unknown as Game).state.players[0]
    player.weapons = [{ id: 'w_invest', lv: 8, cd: 100, held: 0, damage: 123 }]
    player.passives = [{ id: 'p_greedy', lv: 1 }]
    player.talents.friend = 1.7
  })
  await expect(page.locator('#feed')).toContainText('死神', { timeout: 5000 })
  await page.screenshot({ path: testInfo.outputPath('reaper.png') })
  await expect(page.getByRole('heading', { name: /大往生 — 享年80歳/ })).toBeVisible({ timeout: 8000 })
  await expect(page.locator('#result-talent-values')).toContainText('対人 ×1.70')
  await expect(page.locator('#result-radar')).toHaveAttribute('points', /^150\.0,30\.0 /)
  await expect(page.locator('#result-build')).toContainText('複利の魔法 Lv8')
  await expect(page.locator('#result-build')).toContainText('がめつい Lv1')
  await expect(page.locator('#result-talent-values')).toContainText('資産 ×')
  await expect(page.locator('#result-talent-values')).toContainText('武器1・性格1')
  const assetHeading = page.locator('#result-build h4', { hasText: '資産：武器 1・性格 1' })
  await expect(assetHeading).toBeVisible()
  await expect(assetHeading.locator('xpath=following-sibling::div[1]')).toContainText('複利の魔法 Lv8')
  await expect(assetHeading.locator('xpath=following-sibling::div[2]')).toContainText('がめつい Lv1')
  await expect(page.locator('#result-build h4', { hasText: '恋愛：武器 0・性格 0' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('result.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('#result').evaluate((result) => (result.scrollTop = 0))
  await expect(page.locator('#result')).toHaveJSProperty('scrollLeft', 0)
  await page.screenshot({ path: testInfo.outputPath('result-mobile.png') })
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
    ;(p as unknown as { choices: string[] }).choices = [] // no 蒸発済み birth pick holding time
    game.state.time = 900 * (25 / 80) ** (1 / 1.4)
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

test('current and legacy rooms remain separated while current guests receive snapshots', async ({ context }) => {
  await context.addInitScript(() => {
    const Channel = window.BroadcastChannel
    const channels: string[] = []
    ;(window as unknown as { lifeChannels: string[] }).lifeChannels = channels
    window.BroadcastChannel = class extends Channel {
      constructor(name: string) {
        super(name)
        channels.push(name)
      }
    }
  })
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const host = await context.newPage()
  const guest = await context.newPage()
  const legacy = await context.newPage()
  for (const page of [host, guest, legacy]) await page.goto('/')
  for (const page of [host, guest]) await page.locator('#room').fill('version-isolation')
  await host.getByRole('button', { name: 'ルームを作る' }).click()
  await expect(host.locator('#hud')).toBeVisible()
  await legacy.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const { CooperativeNetwork } = await import(url)
    const network = new CooperativeNetwork({
      app: 'life-survivors-v4',
      room: 'version-isolation',
      role: 'guest',
      playerId: 'legacy-player',
      onSnapshot() {},
      onStatus() {}
    })
    await network.start()
    ;(window as unknown as { legacyNetwork: unknown }).legacyNetwork = network
    URL.revokeObjectURL(url)
  }, fakeNetwork)
  await guest.getByRole('button', { name: 'ルームに参加' }).click()
  const hostLife = await life(host)
  const guestLife = await life(guest)
  await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
  expect(await hostLife.evaluate((hook) => hook.game.state.players.map((player) => player.id))).not.toContain(
    'legacy-player'
  )
  const channels = (page: Page) => page.evaluate(() => (window as unknown as { lifeChannels: string[] }).lifeChannels)
  expect(await channels(host)).toEqual([JSON.stringify(['anon', 'life-survivors-v5', 'version-isolation'])])
  expect(await channels(guest)).toEqual([JSON.stringify(['anon', 'life-survivors-v5', 'version-isolation'])])
  expect(await channels(legacy)).toEqual([JSON.stringify(['anon', 'life-survivors-v4', 'version-isolation'])])
})

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
  // No 蒸発済み birth pick in the way: its note would replace the co-op one.
  await hostLife.evaluate((l) => {
    for (const p of l.game.state.players as unknown as { parent: string; choices: string[] }[]) {
      if (p.parent === 'p_gone') p.parent = 'p_free'
      p.choices = []
    }
  })
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

  await hostLife.evaluate((l) => l.game.gainXp(l.game.state.xpNext))
  await expect(guest.locator('#cards .card')).toHaveCount(3)
  await expect(guest.locator('#levelup-note')).toContainText('時間は流れ続けています')
  await guest.screenshot({ path: testInfo.outputPath('guest.png') })
  await guest.locator('#cards .card').first().click()
  await expect
    .poll(() => hostLife.evaluate((l, id) => l.game.state.players.find((p) => p.id === id)!.choices.length, guestId))
    .toBe(0)
  await expect(guest.locator('#levelup')).toBeHidden()
  await hostLife.evaluate((hook, id) => {
    const game = hook.game as unknown as Game
    for (const player of game.state.players) {
      const ids = player.id === id ? ['w_invest', 'w_friend'] : ['w_hobby']
      player.weapons = ids.map((weapon) => ({ id: weapon, lv: 1, cd: 100, held: 0, damage: 0 }))
    }
  }, guestId)
  await expect(host.locator('#synergy-count')).toHaveText('人生の相乗効果 0/6')
  await expect(guest.locator('#synergy-count')).toHaveText('人生の相乗効果 1/6')
  await guest.locator('#synergy-count').click()
  await expect(guest.locator('#synergy-list')).toContainText('発動中：ゆとりが広げる交流')
  expect(
    await guestLife.evaluate((hook, id) => hook.view.players.find((player) => player.id === id), guestId)
  ).not.toHaveProperty('talents')
  await hostLife.evaluate((hook, id) => {
    const game = hook.game as unknown as Game
    const player = game.state.players.find((player) => player.id === id)!
    player.choices = ['r:w_invest:w_sports']
    game.choose(player, 0)
  }, guestId)
  await expect(guest.locator('#synergy-count')).toHaveText('人生の相乗効果 0/6')
  await expect(guest.locator('#synergy-list')).toContainText('未発動：ゆとりが広げる交流')
  await expect(host.locator('#synergy-count')).toHaveText('人生の相乗効果 0/6')
  expect(errors).toEqual([])
})

test('career events give only the qualified guest a turning point', async ({ context }) => {
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const host = await context.newPage()
  const guest = await context.newPage()
  const errors: string[] = []
  for (const page of [host, guest]) {
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.locator('#room').fill('career-event')
  }
  await host.getByRole('button', { name: 'ルームを作る' }).click()
  await guest.getByRole('button', { name: 'ルームに参加' }).click()
  const hostLife = await life(host)
  const guestLife = await life(guest)
  await expect.poll(() => hostLife.evaluate((hook) => hook.game.state.players.length)).toBe(2)
  await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
  const guestId = await guestLife.evaluate((hook) => hook.localId)
  await hostLife.evaluate(async (hook, id) => {
    const dataPath = '/src/data.ts'
    const { EVENTS } = await import(dataPath)
    const game = hook.game as unknown as Game
    for (const player of game.state.players) {
      player.birthPick = false
      player.choices = []
      player.pending = 0
      player.weapons = [{ id: 'w_work', lv: player.id === id ? 2 : 1, cd: 100, held: 0, damage: 0 }]
    }
    const index = EVENTS.findIndex((event: { boss: string }) => event.boss === 'b_shukatsu')
    game.state.eventIndex = index
    game.state.time = EVENTS[index].at - 0.01
    game.tick(0.01)
  }, guestId)
  await expect(guest.locator('#feed')).toContainText('実務を磨き')
  await expect(host.locator('#feed')).toContainText('就職を急がず')
  await expect(host.locator('#feed')).not.toContainText('実務を磨き')
  await expect(guest.locator('#levelup')).toBeVisible()
  await expect(host.locator('#levelup')).toBeHidden()
  await guest.locator('#cards .card').first().press('Enter')
  await expect
    .poll(() =>
      hostLife.evaluate((hook, id) => hook.game.state.players.find((player) => player.id === id)!.choices, guestId)
    )
    .toEqual([])
  await expect(guest.locator('#levelup')).toBeHidden()
  expect(errors).toEqual([])
})

test('sports and asset paths reach only their own terminal history over snapshots', async ({ context }) => {
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const host = await context.newPage()
  const guest = await context.newPage()
  const errors: string[] = []
  for (const page of [host, guest]) {
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.locator('#room').fill('alternative-careers')
  }
  await host.getByRole('button', { name: 'ルームを作る' }).click()
  await guest.getByRole('button', { name: 'ルームに参加' }).click()
  const hostLife = await life(host)
  const guestLife = await life(guest)
  await expect.poll(() => hostLife.evaluate((hook) => hook.game.state.players.length)).toBe(2)
  await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
  const guestId = await guestLife.evaluate((hook) => hook.localId)
  await hostLife.evaluate(async (hook, id) => {
    const dataPath = '/src/data.ts'
    const { EVENTS } = await import(dataPath)
    const game = hook.game as unknown as Game
    for (const player of game.state.players) {
      player.birthPick = false
      player.pending = 0
      player.choices = []
      player.weapons = [{ id: player.id === id ? 'w_savings' : 'w_muscle', lv: 4, cd: 100, held: 0, damage: 0 }]
    }
    for (const boss of ['b_shukatsu', 'b_layoff']) {
      const index = EVENTS.findIndex((event: { boss: string }) => event.boss === boss)
      game.state.enemies = []
      game.state.eventIndex = index
      game.state.time = EVENTS[index].at - 0.01
      game.tick(0.01)
    }
  }, guestId)
  await expect(guest.locator('#feed')).toContainText('資産を活かす道を広げる')
  await expect(host.locator('#feed')).toContainText('スポーツの道を広げる')
  expect(
    await guestLife.evaluate((hook) =>
      hook.view!.players.every((player) => player.history === undefined && player.talents === undefined)
    )
  ).toBe(true)
  await expect(guest.locator('#result-history')).toBeHidden()
  await hostLife.evaluate((hook) => {
    ;(hook.game as unknown as Game).state.phase = 'lost'
  })
  await expect(guest.locator('#result-history-list')).toContainText('資産を育て、資産を活かす道へ')
  await expect(guest.locator('#result-history-list')).toContainText('転機を2回獲得')
  await expect(guest.locator('#result-history-list')).not.toContainText('スポーツ')
  await expect(host.locator('#result-history-list')).toContainText('運動を磨き、スポーツの道へ')
  await expect(host.locator('#result-history-list')).not.toContainText('資産')
  expect(errors).toEqual([])
})

for (const width of [1280, 390]) {
  test(`family support reaches a moving guest and renders at ${width}px`, async ({ context }, testInfo) => {
    await context.route('**/rabbiters/src/network.ts*', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
    )
    const host = await context.newPage()
    const guest = await context.newPage()
    await guest.setViewportSize({ width, height: 844 })
    const errors: string[] = []
    for (const page of [host, guest]) {
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/')
      await page.locator('#room').fill(`family-${width}`)
    }
    await host.getByRole('button', { name: 'ルームを作る' }).click()
    await guest.getByRole('button', { name: 'ルームに参加' }).click()
    const hostLife = await life(host)
    const guestLife = await life(guest)
    await expect.poll(() => hostLife.evaluate((hook) => hook.game.state.players.length)).toBe(2)
    await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
    const guestId = await guestLife.evaluate((hook) => hook.localId)
    await hostLife.evaluate(async (hook, id) => {
      const dataPath = '/src/data.ts'
      const { EVENTS } = await import(dataPath)
      const game = hook.game as unknown as Game
      for (const player of game.state.players) {
        player.parent = 'p_free'
        player.choices = []
        player.pending = 0
        player.birthPick = false
        player.weapons = [{ id: 'w_love', lv: player.id === id ? 2 : 1, cd: 100, held: 0, damage: 0 }]
      }
      for (const index of [
        EVENTS.findIndex((event: { boss: string }) => event.boss === 'b_wedding'),
        EVENTS.findIndex((event: { swarm: string }) => event.swarm === 'nightcry')
      ]) {
        game.state.eventIndex = index
        game.state.time = EVENTS[index].at - 0.01
        game.tick(0.01)
      }
      game.state.enemies = []
      game.state.players.find((player) => player.id === id)!.hp = 20
    }, guestId)
    const personal = () =>
      guestLife.evaluate(
        (hook, id) => (hook.view as unknown as View | undefined)?.players.find((player) => player.id === id),
        guestId
      )
    await expect.poll(personal).toMatchObject({ married: true, hasChild: true })
    expect(
      (await guestLife.evaluate((hook) => (hook.view as unknown as View).players)).find(
        (player) => player.id !== guestId
      )
    ).toMatchObject({ married: false, hasChild: false })
    await expect.poll(async () => (await personal())!.hp).toBeGreaterThan(20)
    const start = (await personal())!.x
    await guest.bringToFront()
    await guest.keyboard.down('KeyD')
    await expect.poll(async () => (await personal())!.x).toBeGreaterThan(start + 30)
    await guest.keyboard.up('KeyD')
    await guest.screenshot({ path: testInfo.outputPath(`family-${width}.png`) })
    expect((await personal())!.history).toBeUndefined()
    await expect(guest.locator('#result-history')).toBeHidden()
    await hostLife.evaluate((hook) => {
      ;(hook.game as unknown as Game).state.phase = 'lost'
    })
    await expect(guest.locator('#result-history')).toBeVisible()
    await expect(guest.locator('#result-history-list')).toContainText('結婚した！')
    await expect(guest.locator('#result-history-list')).toContainText('子どもが生まれた！')
    await expect(guest.locator('#result-history-list')).not.toContainText('独身')
    await expect(host.locator('#result-history-list')).toContainText('独身')
    await expect(host.locator('#result-history-list')).not.toContainText('結婚した！')
    expect(await guest.locator('#result').evaluate((result) => result.scrollWidth <= result.clientWidth)).toBe(true)
    await guest.locator('#result-history').scrollIntoViewIfNeeded()
    await guest.screenshot({ path: testInfo.outputPath(`history-${width}.png`) })
    expect(errors).toEqual([])
    await host.close()
    await guest.close()
  })
}

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

test('on a phone, a slide anywhere shows a stick and steers; a stray tap on a fresh hand is ignored', async ({
  browser
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).tap()
  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('#move-hint')).toBeVisible()
  const handle = await life(page)
  await handle.evaluate((l) => {
    for (const p of l.game.state.players) p.choices = []
  })

  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 600 }] })
  // Far past the stick's rim: the base follows the finger, so speed stays capped at full.
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200 + i * 20, y: 600 }] })
  await expect(page.locator('#stick')).toHaveJSProperty('hidden', false)
  await expect(page.locator('#move-hint')).toBeHidden()
  const x0 = await handle.evaluate((l) => l.view.players[0].x)
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].x)).toBeGreaterThan(x0 + 20)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.locator('#stick')).toHaveJSProperty('hidden', true)

  await handle.evaluate((l) => {
    const p = l.game.state.players[0] as unknown as { choices: string[]; choiceSeq: number }
    p.choices = ['w:w_sns', 'w:w_pet', 'p:p_hot']
    p.choiceSeq++
  })
  const card = page.locator('#cards .card').first()
  await expect(card).toBeAttached()
  // A finger still lifting from steering lands on the hand the moment it opens.
  await card.dispatchEvent('click', { detail: 1 })
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#levelup-note')).toContainText('タップで決定')
  await page.waitForTimeout(400)
  await card.tap()
  await expect(page.locator('#levelup')).toBeHidden()
  expect(errors).toEqual([])
  await context.close()
})

test('the music follows a life: title, stages, a boss, the reaper, the ending and the BGM slider', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  type Music = { theme: string | null; layer: number; live: number; enabled: boolean }
  const music = () => page.evaluate(() => (window as unknown as { __life: { music: Music } }).__life.music)
  const theme = async () => (await music()).theme
  await page.goto('/')
  // Any press unlocks audio and the title theme starts.
  await page.locator('#start-title').click()
  await expect.poll(theme).toBe('title')
  await expect.poll(async () => (await music()).live).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  await expect.poll(music).toMatchObject({ theme: 'cradle', layer: 0, enabled: true })
  const handle = await life(page)
  // This life only listens: no birth pick, no scheduled life events, and nothing can break the mind.
  await handle.evaluate((l) => {
    const game = (l as unknown as Hook).game
    game.state.eventIndex = 99
    Object.assign(game, { spawn: () => {} })
    game.state.enemies = []
    for (const p of game.state.players) Object.assign(p, { choices: [], invuln: 1e9, hp: 1e9, maxHp: 1e9 })
  })
  await expect.poll(async () => (await music()).live).toBeGreaterThan(0)

  await handle.evaluate((l) => (l.game.state.time = 60 * 8 + 40)) // age 37: 働き盛り
  await expect.poll(music).toMatchObject({ theme: 'office', layer: 1 })

  await handle.evaluate((l) => {
    const game = (l as unknown as Hook).game
    game.state.eventIndex = 99
    const p = game.state.players[0]
    game.spawnEnemy('b_hs', p.x + 400, p.y)
  })
  await expect.poll(theme).toBe('boss')
  await expect.poll(async () => (await music()).live, { timeout: 5000 }).toBeGreaterThan(0)
  await handle.evaluate((l) => ((l as unknown as { game: { state: { enemies: unknown[] } } }).game.state.enemies = []))
  await expect.poll(theme).toBe('office')

  await page.getByRole('button', { name: '遊び方を表示' }).click()
  await page.locator('#music-volume').fill('0')
  await expect.poll(music).toMatchObject({ enabled: false })
  await page.locator('#music-volume').fill('40')
  await expect.poll(music).toMatchObject({ enabled: true })
  await page.keyboard.press('Escape')

  await handle.evaluate((l) => {
    l.game.state.time = 15 * 60 - 0.5
    for (const p of l.game.state.players) p.choices = []
  })
  await expect.poll(theme).toBe('reaper')
  // The reaper's 4 s and the 3 s farewell run on game time, which slows down with the frame rate.
  await expect(page.getByRole('heading', { name: /大往生/ })).toBeVisible({ timeout: 15000 })
  await expect.poll(theme).toBe('won')
  await page.getByRole('button', { name: 'もう一度生まれる' }).click()
  await expect.poll(theme).toBe('title')
  await expect.poll(async () => (await music()).live).toBeGreaterThan(0)

  await page.reload()
  await expect(page.locator('#music-volume')).toHaveValue('40')
  expect(errors).toEqual([])
})
