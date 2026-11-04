import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { newCampaign, settle } from './campaign.js'

const url = process.env.LANE_URL || 'http://127.0.0.1:5220/examples/games/lane-battle/'
const source = await readFile(new URL('./simulation.js', import.meta.url), 'utf8')
const main = (await readFile(new URL('./main.js', import.meta.url), 'utf8'))
  .replace('const fallen = []', 'const fallen = []; globalThis.__fallen = fallen')
  .replace('let resultVisual = null', 'let resultVisual = null; globalThis.__visual = () => resultVisual')
await mkdir('/tmp/lane-final-death', { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  for (const result of ['victory', 'defeat']) {
    const simulation =
      source.replace('export function createGame(', 'function baseGame(') +
      `
export function createGame() {
  const game = baseGame(0, [card({ uid: 1, key: 'korokoro' }), card({ uid: 2, key: 'katachi' })], 1)
  Object.assign(game, {time: 1, gold: 999, spawn: 999, opened: 2, rushes: 4, turret: 999, ${result === 'victory' ? 'enemy' : 'home'}: 1})
  summon(game, 0); summon(game, 1); summon(game, 0, -1)
  const [shooter, attacker, victim] = game.units
  Object.assign(shooter, {x: 650, attack: 1})
  Object.assign(attacker, {x: 100, attack: 1})
  Object.assign(victim, {x: 500, hp: 1, attack: 1})
  game.projectiles.push({targetId: victim.id, src: shooter, damage: shooter.atk, at: 1.003, primary: true, effect: {victims: []}})
  game.projectiles.push({targetId: null, src: {side: ${result === 'victory' ? 1 : -1}}, damage: 10, at: 1.005, primary: true, effect: {victims: []}})
  game.effects.push({x: 760, life: 0.6, blast: true})
  globalThis.__game = game
  return game
}`
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      reducedMotion: result === 'defeat' ? 'reduce' : 'no-preference'
    })
    await page.clock.install({ time: new Date(0) })
    await page.clock.pauseAt(new Date(0))
    await page.addInitScript(() => {
      Math.random = () => 0.99
    })
    await page.route('**/lane-battle/simulation.js*', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: simulation })
    )
    await page.route('**/lane-battle/main.js*', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: main })
    )
    await page.goto(url)
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    await page.getByRole('button', { name: 'ブリッと出撃' }).click()
    await page.clock.runFor(100)
    const status = () =>
      page.evaluate(() => ({
        game: {
          result: __game.result,
          time: __game.time,
          home: __game.home,
          enemy: __game.enemy,
          gold: __game.gold,
          kills: __game.kills,
          exp: __game.exp,
          stage: __game.stage,
          deck: __game.deck,
          effects: __game.effects.map(({ life }) => life),
          units: __game.units.map(({ id, x, hp }) => ({ id, x, hp }))
        },
        age: __fallen.length ? __game.time + __visual().elapsed - __fallen[0].at : null,
        modal: document.querySelector('dialog').open
      }))
    const first = await status()
    assert.equal(first.game.result, result)
    assert.ok(first.age > 0 && !first.modal)
    const expectedCampaign = newCampaign()
    const expected = settle(expectedCampaign, first.game, () => 0.99)
    const storageKey = 'unko-daisanji-campaign-v1'
    const savedAtDecision = await page.evaluate((key) => localStorage.getItem(key), storageKey)
    assert.deepEqual(JSON.parse(savedAtDecision), expectedCampaign, 'settled before the closing animation')
    await page.screenshot({ path: `/tmp/lane-final-death/${result}-100ms.png` })
    await page.keyboard.press('Space')
    const paused = await status()
    await page.clock.runFor(500)
    assert.deepEqual(await status(), paused, 'pause freezes final visual and simulation')
    await page.keyboard.press('Space')
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const hidden = await status()
    await page.clock.runFor(500)
    assert.deepEqual(await status(), hidden, 'hidden tab freezes visual and simulation')
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), savedAtDecision)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.clock.runFor(650)
    const later = await status()
    assert.deepEqual(later.game, first.game)
    assert.ok(later.age > 0.6 && !later.modal)
    await page.screenshot({ path: `/tmp/lane-final-death/${result}-750ms.png` })
    await page.clock.runFor(1000)
    assert.equal((await status()).modal, true)
    const saved = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), storageKey))
    assert.deepEqual(saved, expectedCampaign)
    assert.equal(JSON.stringify(saved), savedAtDecision, 'dialog does not settle twice')
    assert.equal(expected.victory, result === 'victory')
    assert.match(
      await page.locator('#title').textContent(),
      result === 'victory' ? /大惨事！$/ : /^うんこ塔が流された…$/
    )
    console.log(result, 'visual age, pause, visibility, frozen battle, result and rewards PASS')
    await page.close()

    const reloadPage = await browser.newPage()
    await reloadPage.clock.install({ time: new Date(0) })
    await reloadPage.clock.pauseAt(new Date(0))
    await reloadPage.addInitScript(() => {
      Math.random = () => 0.99
    })
    await reloadPage.route('**/lane-battle/simulation.js*', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: simulation })
    )
    await reloadPage.goto(url)
    await reloadPage.getByRole('button', { name: 'ステージ選択へ' }).click()
    await reloadPage.getByRole('button', { name: 'ブリッと出撃' }).click()
    await reloadPage.clock.runFor(100)
    assert.equal(await reloadPage.locator('dialog').evaluate((dialog) => dialog.open), false)
    await reloadPage.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    assert.equal(await reloadPage.evaluate((key) => localStorage.getItem(key), storageKey), savedAtDecision)
    await reloadPage.reload()
    assert.equal(await reloadPage.evaluate((key) => localStorage.getItem(key), storageKey), savedAtDecision)
    await reloadPage.close()
    console.log(result, 'hidden immediately and reload preserves settled campaign PASS')
  }
} finally {
  await browser.close()
}
