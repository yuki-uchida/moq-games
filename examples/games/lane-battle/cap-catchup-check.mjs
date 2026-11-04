import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { koSeconds } from './models.js'

const source = await readFile(new URL('./main.js', import.meta.url), 'utf8')
const main = source.replace(
  'const fallen = []',
  `const fallen = []; globalThis.__fallen = fallen; globalThis.__state = () => state;
  globalThis.__tick = tick; globalThis.__install = (game) => { state = game; buildTray() }`
)
const url = process.env.LANE_URL || 'http://127.0.0.1:5216/examples/games/lane-battle/'
await mkdir('/tmp/lane-cap', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const [width, height] of [
    [390, 844],
    [1280, 800]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true })
    await page.clock.install({ time: new Date(0) })
    await page.clock.pauseAt(new Date(0))
    await page.route('**/lane-battle/main.js*', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: main })
    )
    await page.goto(url)
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    await page.getByRole('button', { name: 'ブリッと出撃' }).click()
    await page.evaluate(async () => {
      const { createGame, summon } = await import('/examples/games/lane-battle/simulation.js')
      const deck = Array.from({ length: 6 }, (_, index) => __state().deck[index % __state().deck.length])
      const game = createGame(0, deck, 1)
      Object.assign(game, { gold: 9999, spawn: 999, opened: 2, rushes: 4, turret: 999 })
      for (let index = 0; index < 24; index++) {
        game.cooldowns[0] = 0
        summon(game, 0)
      }
      game.cooldowns[0] = 0
      __install(game)
      __tick(0)
    })
    const card = page.locator('#tray button').first()
    const snapshot = () =>
      page.evaluate(() => ({
        gold: __state().gold,
        cooldown: __state().cooldowns[0],
        count: __state().units.filter((unit) => unit.side === 1).length
      }))
    const before = await snapshot()
    assert.equal(before.count, 24)
    assert.equal(await card.getAttribute('aria-disabled'), 'true')
    assert.match(await card.getAttribute('aria-label'), /満員/)
    assert.match(await page.locator('#rate').textContent(), /24\/24/)
    const rect = await card.boundingBox()
    await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2)
    assert.match(await page.locator('#notice').textContent(), /満員/)
    assert.deepEqual(await snapshot(), before)
    for (const key of ['1', '2', '3', '4', '5', '6']) await page.keyboard.press(key)
    assert.deepEqual(await snapshot(), before)
    await page.screenshot({ path: `/tmp/lane-cap/${width}-full.png` })
    await page.evaluate(() => {
      __state().units[0].hp = 0
      __tick(50)
    })
    assert.equal((await snapshot()).count, 23)
    assert.equal(await card.getAttribute('aria-disabled'), 'false')
    await page.screenshot({ path: `/tmp/lane-cap/${width}-available.png` })
    await card.tap()
    const after = await snapshot()
    assert.equal(after.count, 24)
    assert.ok(after.gold < before.gold && after.cooldown > 0)
    await page.evaluate(() => {
      __state().units[0].hp = 0
      __tick(100)
    })
    await page.keyboard.press('6')
    assert.equal((await snapshot()).count, 24)
    await page.close()
    console.log(`${width}x${height}: cap feedback, keyboard and reopened slot PASS`)
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.clock.install({ time: new Date(0) })
  await page.clock.pauseAt(new Date(0))
  await page.route('**/lane-battle/main.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: main })
  )
  await page.goto(url)
  await page.getByRole('button', { name: 'ステージ選択へ' }).click()
  await page.getByRole('button', { name: 'ブリッと出撃' }).click()
  await page.evaluate(() => __tick(0))
  await page.locator('#tray button').nth(0).click()
  await page.locator('#tray button').nth(1).click()
  const ghosts = () => page.evaluate(() => __fallen.map(({ id, key, visualAge }) => ({ id, key, visualAge })))
  await page.evaluate(() => __tick(61000))
  const first = await ghosts()
  assert.ok(first.length >= 2)
  assert.ok(first.every(({ visualAge }) => visualAge === 0))
  await page.screenshot({ path: '/tmp/lane-cap/catchup-start.png' })
  await page.evaluate(() => __tick(61001))
  const second = await ghosts()
  assert.ok(first.every(({ id }) => second.some((ghost) => ghost.id === id)))
  const tracked = [...new Map([...first, ...second].map((ghost) => [ghost.id, ghost])).values()]
  const faded = new Set()
  for (let time = 61051; time <= 63001; time += 50) {
    await page.evaluate((now) => __tick(now), time)
    for (const ghost of await ghosts()) if (ghost.visualAge >= koSeconds(ghost.key) * 0.75) faded.add(ghost.id)
    if (time === 61751) await page.screenshot({ path: '/tmp/lane-cap/catchup-fade.png' })
  }
  assert.ok(tracked.every(({ id }) => faded.has(id)))
  const end = await ghosts()
  assert.ok(tracked.every(({ id }) => !end.some((ghost) => ghost.id === id)))
  console.log(`${tracked.length} catch-up ghosts survive both batches and complete their visible fade PASS`)
} finally {
  await browser.close()
}
