import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const url = process.env.LANE_URL || 'http://127.0.0.1:5216/examples/games/lane-battle/'
const source = await readFile(new URL('./simulation.js', import.meta.url), 'utf8')
const simulation =
  source.replace('export function createGame(', 'function baseGame(') +
  `
export function createGame(stage) {
  const game = baseGame(stage, [card({uid: 1, key: 'katachi'}), card({uid: 2, key: 'oyster'})], 1)
  Object.assign(game, {gold: 999, spawn: 999, opened: 2, rushes: 4, turret: 999, enemy: 1})
  summon(game, 0); summon(game, 1); summon(game, 0, -1)
  const [striker, victim, attacker] = game.units
  Object.assign(striker, {x: 100, attack: 0.012})
  Object.assign(victim, {x: 400, attack: 999, speed: 0})
  Object.assign(attacker, {x: 375, attack: 0.005})
  globalThis.__game = game
  return game
}`
const main = (await readFile(new URL('./main.js', import.meta.url), 'utf8'))
  .replace(
    'let resultVisual = null',
    'let resultVisual = null; globalThis.__visual = () => resultVisual; globalThis.__tick = tick; globalThis.__clock = clock'
  )
  .replace('const models = new LaneModels()', 'const models = new LaneModels(); globalThis.__models = models')
  .replace('const fallen = []', 'const fallen = []; globalThis.__fallen = fallen')
await mkdir('/tmp/lane-result-acting', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.clock.install({ time: new Date(0) })
  await page.clock.pauseAt(new Date(0))
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'unko-daisanji-campaign-v1') globalThis.__saveCount = (globalThis.__saveCount ?? 0) + 1
      return original.call(this, key, value)
    }
  })
  await page.route('**/lane-battle/main.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: main })
  )
  await page.route('**/lane-battle/simulation.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: simulation })
  )
  await page.goto(url)
  await page.getByRole('button', { name: 'ステージ選択へ' }).click()
  await page.getByRole('button', { name: 'ブリッと出撃' }).click()
  await page.clock.runFor(50)
  const snapshot = () =>
    page.evaluate(async () => {
      const { hurtSeconds } = await import('/examples/games/lane-battle/models.js')
      const victim = __game.units.find((unit) => unit.key === 'oyster')
      const striker = __game.units.find((unit) => unit.id === 1)
      const actor = __models.actors.get(striker.id)
      return {
        battle: JSON.stringify(__game),
        saved: localStorage.getItem('unko-daisanji-campaign-v1'),
        saves: globalThis.__saveCount,
        age: __game.time + __visual().elapsed - victim.hurt.at,
        length: hurtSeconds(victim.key),
        hit: actor.a.hit,
        shield: actor.bones.shield.position.x,
        open: document.querySelector('dialog').open
      }
    })
  const first = await snapshot()
  assert.ok(first.saved && !first.open && first.age < first.length)
  assert.equal(first.saves, 1, 'rewards are saved exactly once at the decision')
  await page.screenshot({ path: '/tmp/lane-result-acting/contact.png' })
  await page.clock.runFor(260)
  const recovery = await snapshot()
  assert.equal(recovery.battle, first.battle)
  assert.equal(recovery.saved, first.saved)
  assert.ok(
    !recovery.open && recovery.hit < first.hit && recovery.shield !== first.shield,
    'strike must recover before dialog'
  )
  await page.screenshot({ path: '/tmp/lane-result-acting/recovery.png' })
  let captured = false
  for (let frame = 0; frame < 100 && !(await snapshot()).open; frame++) {
    await page.clock.runFor(20)
    const current = await snapshot()
    if (!captured && current.age >= current.length && !current.open) {
      await page.screenshot({ path: '/tmp/lane-result-acting/hurt-complete.png' })
      captured = true
    }
  }
  const last = await snapshot()
  assert.ok(last.open, 'result dialog must eventually appear')
  assert.ok(captured, 'hurt completion must be visible before dialog')
  assert.ok(last.age >= last.length, 'hurt must complete before dialog')
  assert.equal(last.battle, first.battle)
  assert.equal(last.saved, first.saved)
  assert.equal(last.saves, 1, 'result dialog must not save rewards again')
  await page.screenshot({ path: '/tmp/lane-result-acting/result.png' })
  console.log('result attack, hurt, frozen battle and saved rewards PASS')
  await page.close()

  const deathPage = await browser.newPage()
  await deathPage.clock.install({ time: new Date(0) })
  await deathPage.clock.pauseAt(new Date(0))
  const deathSimulation =
    source.replace('export function createGame(', 'function baseGame(') +
    `
export function createGame(stage) {
  const game = baseGame(stage, [card({uid: 1, key: 'geri'})], 1)
  Object.assign(game, {gold: 999, spawn: 99999, opened: 2, rushes: 99, turret: 99999})
  summon(game, 0)
  globalThis.__game = game
  return game
}`
  await deathPage.route('**/lane-battle/main.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: main })
  )
  await deathPage.route('**/lane-battle/simulation.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: deathSimulation })
  )
  await deathPage.goto(url)
  await deathPage.getByRole('button', { name: 'ステージ選択へ' }).click()
  await deathPage.getByRole('button', { name: 'ブリッと出撃' }).click()
  const death = await deathPage.evaluate(() => {
    let now = 0
    Object.defineProperty(performance, 'now', { configurable: true, value: () => now })
    __clock.reset(now)
    __tick(now)
    __game.units[0].hp = 0
    for (now = 50; now <= 650; now += 50) __tick(now)
    now = 650
    const before = __fallen[0].visualAge
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    now = 61200
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    const resumed = __fallen[0]?.visualAge
    while (__clock.pending) __tick(now)
    const caughtUp = __fallen[0]?.visualAge
    now += 50
    __tick(now)
    now += 50
    __tick(now)
    const later = __fallen[0]?.visualAge
    let fade = later >= 0.6
    for (let frame = 0; frame < 10 && __fallen.length; frame++) {
      now += 50
      __tick(now)
      if (__fallen[0]?.visualAge >= 0.6) fade = true
    }
    return { before, resumed, caughtUp, later, fade, gone: !__fallen.length }
  })
  assert.equal(death.resumed, death.before, 'normal battle resume must not age a death by hidden time')
  assert.equal(death.caughtUp, death.before, 'catch-up batches must not age a death')
  assert.ok(death.before >= 0.55 && death.later > death.before && death.later < 0.8)
  assert.ok(death.fade && death.gone, 'short death must reach its fade and finish')
  console.log('normal battle hidden resume preserves short death PASS')
} finally {
  await browser.close()
}
