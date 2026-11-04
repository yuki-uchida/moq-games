import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { koSeconds } from './models.js'

const simulation = await readFile(new URL('./simulation.js', import.meta.url), 'utf8')
const scenario =
  simulation
    .replace('export const ENEMY_X = 55', 'export const ENEMY_X = 230')
    .replace('export function createGame(', 'function baseGame(') +
  `
export function createGame(stage, deck, seed) {
  const game = baseGame(0, [card({ uid: 1, key: 'garlic', level: 2, hp: 869, atk: 156 })], seed)
  Object.assign(game, {time: 30, gold: 999, spawn: 0, opened: 2, rushes: 4, turret: 999})
  summon(game, 0); summon(game, 0, -1)
  const [attacker, existing] = game.units
  Object.assign(attacker, {x: 420, attack: 999})
  Object.assign(existing, {x: 270, attack: 999, speed: 0})
  const effect = {x: existing.x, primaryX: existing.x, life: 0.22, side: 1, ranged: true,
    from: attacker.x, sourceId: attacker.id, targetId: existing.id, releasedAt: 29.905,
    attackerKey: attacker.key, areaKind: attacker.areaKind, victims: []}
  game.effects.push(effect)
  game.projectiles.push({targetId: existing.id, src: attacker, damage: attacker.atk, at: 30.025, primary: true, effect})
  globalThis.__game = game
  return game
}`
const main = (await readFile(new URL('./main.js', import.meta.url), 'utf8'))
  .replace('const fallen = []', 'const fallen = []; globalThis.__fallen = fallen')
  .replace('function tick(now) {', 'globalThis.__tick = tick; function tick(now) {')
await mkdir('/tmp/lane-long-frame', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.clock.install({ time: new Date(0) })
  await page.clock.pauseAt(new Date(0))
  await page.route('**/lane-battle/simulation.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: scenario })
  )
  await page.route('**/lane-battle/main.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: main })
  )
  await page.goto(process.env.LANE_URL || 'http://127.0.0.1:5216/examples/games/lane-battle/')
  await page.getByRole('button', { name: 'ステージ選択へ' }).click()
  await page.getByRole('button', { name: 'ブリッと出撃' }).click()
  const advance = (time) =>
    page.evaluate((time) => {
      __tick(time)
      return { kills: __game.kills, fallen: __fallen.map(({ id, key, visualAge }) => ({ id, key, age: visualAge })) }
    }, time)
  const first = await advance(1100)
  assert.equal(first.kills, 2)
  assert.equal(first.fallen.length, 2)
  assert.equal(new Set(first.fallen.map(({ id }) => id)).size, 2)
  assert.ok(first.fallen.every(({ age }) => age >= 0 && age <= 0.1))
  await page.screenshot({ path: '/tmp/lane-long-frame/start.png' })
  const catchup = await advance(62100)
  const nextBatch = await advance(62101)
  assert.ok(first.fallen.every(({ id }) => catchup.fallen.some((ghost) => ghost.id === id)))
  assert.ok(first.fallen.every(({ id }) => nextBatch.fallen.some((ghost) => ghost.id === id)))
  // Step 50 ms frames and follow each original ghost: it must stay visible until it has aged through its
  // whole death motion (the fade is the last quarter), then disappear.
  const seen = new Map(
    first.fallen.map(({ id }) => [
      id,
      { fade: false, gone: false, last: nextBatch.fallen.find((ghost) => ghost.id === id).age }
    ])
  )
  let shot = false
  for (let time = 62151; time <= 66000 && [...seen.values()].some((ghost) => !ghost.gone); time += 50) {
    const frame = await advance(time)
    for (const { id, key } of first.fallen) {
      const ghost = seen.get(id)
      if (ghost.gone) continue
      const current = frame.fallen.find((entry) => entry.id === id)
      if (!current) {
        assert.ok(ghost.last >= koSeconds(key) - 0.05, `${key} vanished at age ${ghost.last.toFixed(2)}`)
        ghost.gone = true
        continue
      }
      assert.ok(current.age - ghost.last <= 0.25 + 1e-9, `${key} aged too fast`)
      ghost.last = current.age
      if (current.age >= koSeconds(key) * 0.75) ghost.fade = true
    }
    if (!shot && [...seen.values()].every((ghost) => ghost.fade || ghost.gone)) {
      await page.screenshot({ path: '/tmp/lane-long-frame/fade.png' })
      shot = true
    }
  }
  assert.ok([...seen.values()].every((ghost) => ghost.fade && ghost.gone))
  console.log('long frame: both ghosts start, animate through fade and expire PASS')
} finally {
  await browser.close()
}
