import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'

const url = process.env.LANE_URL || 'http://127.0.0.1:5222/examples/games/lane-battle/'
const source = await readFile(new URL('./simulation.js', import.meta.url), 'utf8')
const fixture =
  source
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
const sourceMain = await readFile(new URL('./main.js', import.meta.url), 'utf8')
const main = sourceMain
  .replace('const fallen = []', 'const fallen = []; globalThis.__fallen = fallen')
  .replace('function tick(now) {', 'globalThis.__tick = tick; function tick(now) {')
  .replace(
    'for (const ghost of fallen) models.fallen(ghost, drawX(ghost), laneY(ghost), depth.get(ghost), visualTime - ghost.at)',
    `for (const ghost of fallen) {
    models.fallen(ghost, drawX(ghost), laneY(ghost), depth.get(ghost), visualTime - ghost.at)
    const actor = models.actors.get(ghost.id)
    globalThis.__poses ??= {}
    globalThis.__poses[ghost.id] = { age: visualTime - ghost.at, rotation: actor.bones.hips.rotation.toArray().slice(0, 3) }
  }`
  )
await mkdir('/tmp/lane-pause', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.clock.install({ time: new Date(0) })
  await page.clock.pauseAt(new Date(0))
  await page.route('**/lane-battle/simulation.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: fixture })
  )
  await page.route('**/lane-battle/main.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: main })
  )
  await page.goto(url)
  await page.getByRole('button', { name: 'ステージ選択へ' }).click()
  await page.getByRole('button', { name: 'ブリッと出撃' }).click()
  const first = await page.evaluate(() => {
    const initial = __game.units.map(({ id }) => id)
    __tick(performance.now() + 50)
    return { initial, kills: __game.kills, fallen: __fallen.map(({ id }) => id), poses: structuredClone(__poses) }
  })
  assert.equal(first.kills, 2)
  assert.equal(first.fallen.length, 2)
  assert.equal(new Set(first.fallen).size, 2)
  assert.ok(first.fallen.includes(first.initial[1]))
  assert.ok(first.fallen.some((id) => !first.initial.includes(id)))
  await page.screenshot({ path: '/tmp/lane-pause/deaths-early.png' })
  const later = await page.evaluate(() => {
    __tick(performance.now() + 250)
    return { fallen: __fallen.map(({ id }) => id), poses: structuredClone(__poses) }
  })
  assert.deepEqual(later.fallen, first.fallen)
  for (const id of first.fallen) {
    assert.ok(later.poses[id].age > first.poses[id].age)
    assert.notDeepEqual(later.poses[id].rotation, first.poses[id].rotation, `death pose changes for ${id}`)
  }
  await page.screenshot({ path: '/tmp/lane-pause/deaths-later.png' })
  console.log('both deaths including spawn-and-death receive unique animated ghosts PASS')
} finally {
  await browser.close()
}
