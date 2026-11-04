import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'

const url = process.env.LANE_URL || 'http://127.0.0.1:5221/examples/games/lane-battle/'
const source = await readFile(new URL('./simulation.js', import.meta.url), 'utf8')
const simulation =
  source.replace('export function createGame(', 'function baseGame(') +
  `
export function createGame(stage, deck, seed) {
  const game = baseGame(stage, [card({uid: 1, key: 'korokoro'})], seed)
  Object.assign(game, {time: 1, gold: 999, spawn: 999, opened: 2, rushes: 4, turret: 999, enemy: 1})
  summon(game, 0); summon(game, 0, -1)
  const [shooter, victim] = game.units
  Object.assign(shooter, {x: 500, attack: 0})
  Object.assign(victim, {x: 400, attack: 99})
  const landedVictim = {id: victim.id, at: 1.01}
  const landed = {x: victim.x, primaryX: victim.x, from: shooter.x, side: 1, life: 0.7,
    ranged: true, releasedAt: 0.89, attackerKey: 'sake', targetId: victim.id, victims: [landedVictim]}
  game.effects.push(landed)
  game.projectiles.push({targetId: victim.id, src: shooter, damage: 1, at: 1.01, primary: true, effect: landed, victim: landedVictim})
  const delayedVictim = {id: victim.id, at: 1.12}
  landed.victims.push(delayedVictim)
  game.projectiles.push({targetId: victim.id, src: shooter, damage: 1, at: 1.12, primary: false, effect: landed, victim: delayedVictim})
  game.projectiles.push({targetId: null, src: {side: 1}, damage: 10, at: 1.03, primary: true, effect: {victims: []}})
  globalThis.reviewGame = game
  return game
}`
const main = (await readFile(new URL('./main.js', import.meta.url), 'utf8'))
  .replace('let resultVisual = null', 'let resultVisual = null; globalThis.reviewVisual = () => resultVisual')
  .replace(
    'function tone(kind) {',
    'globalThis.reviewSounds = []; globalThis.reviewDrawn = []; function tone(kind) { globalThis.reviewSounds.push(kind)'
  )
  .replace(
    '      drawArea(\n        ctx,',
    '      (globalThis.reviewDrawn.push(e.attackerKey), drawArea(\n        ctx,'
  )
  .replace('        laneY\n      )', '        laneY\n      ))')
  .replace(
    '    models.unit(visual,',
    '    globalThis.reviewHurtAge = state.time - (visual.hurt?.at ?? Infinity); models.unit(visual,'
  )

await mkdir('/tmp/lane-result-projectile', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.clock.install({ time: new Date(0) })
  await page.clock.pauseAt(new Date(0))
  await page.route('**/lane-battle/simulation.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: simulation })
  )
  await page.route('**/lane-battle/main.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: main })
  )
  await page.goto(url)
  await page.getByRole('button', { name: 'ステージ選択へ' }).click()
  await page.getByRole('button', { name: 'ブリッと出撃' }).click()
  await page.clock.runFor(60)
  const status = () =>
    page.evaluate(async () => {
      const { activeVictims } = await import('/examples/games/lane-battle/visual-effects.js')
      const landed = reviewGame.effects.find((effect) => effect.attackerKey === 'sake')
      const pending = reviewGame.effects.find((effect) => effect.attackerKey === 'korokoro')
      const time = reviewGame.time + reviewVisual().elapsed
      return {
        result: reviewGame.result,
        time: reviewGame.time,
        hp: reviewGame.units.find((unit) => unit.side === -1).hp,
        hurt: reviewGame.units.find((unit) => unit.side === -1).hurt,
        landed: activeVictims(landed, reviewGame.units, time).map((victim) => victim.id),
        pending: activeVictims(pending, reviewGame.units, time).map((victim) => victim.id),
        cancelled: pending.cancelled,
        sounds: [...reviewSounds],
        drawn: [...reviewDrawn]
      }
    })
  const before = await status()
  await page.screenshot({ path: '/tmp/lane-result-projectile/decision.png' })
  assert.equal(before.result, 'victory')
  assert.deepEqual(before.landed, [2], 'landed hit remains visible')
  assert.equal(before.cancelled, true)
  assert.deepEqual(before.pending, [])
  assert.equal(before.sounds.filter((sound) => sound === 'hit').length, 1)
  await page.evaluate(() => {
    reviewDrawn.length = 0
  })
  await page.clock.runFor(150)
  const after = await status()
  await page.screenshot({ path: '/tmp/lane-result-projectile/after.png' })
  assert.equal(after.time, before.time)
  assert.equal(after.hp, before.hp)
  assert.deepEqual(after.hurt, before.hurt)
  assert.deepEqual(after.pending, [])
  assert.deepEqual(after.landed, [2], 'delayed hit sharing a landed effect is cancelled')
  assert.ok(!after.drawn.includes('korokoro'), 'cut-off projectile is not drawn')
  assert.deepEqual(after.sounds, before.sounds, 'no new hit sound after result')
  await page.clock.runFor(480)
  assert.ok(
    await page.evaluate(
      async () => reviewHurtAge > (await import('/examples/games/lane-battle/models.js')).hurtSeconds('cleaner')
    ),
    'the real hit flash expires during the closing animation'
  )
  await page.screenshot({ path: '/tmp/lane-result-projectile/flash-expired.png' })
  console.log(
    'landed impact retained; pending projectile, flash and sound cut off PASS',
    JSON.stringify({ before, after })
  )
} finally {
  await browser.close()
}
