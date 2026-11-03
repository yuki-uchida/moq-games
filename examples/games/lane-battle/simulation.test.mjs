import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STAGES, HOME_X, ENEMY_X, createGame, summon, step, upgrade, burst, starterDeck, card } from './simulation.js'
import { playBattle, summonKeepingOne } from './bot.js'
test('keep-one policy deploys support before saving, then reserves for its missing unit', () => {
  const game = createGame(0, [card({ uid: 1, key: 'katachi' }), card({ uid: 2, key: 'jiro' })])
  game.gold = 100
  summonKeepingOne(game, 1, [0], () => 0)
  assert.deepEqual(game.summons, [1, 0])
  game.cooldowns[0] = 0
  game.gold = 150
  summonKeepingOne(game, 1, [0], () => 0)
  assert.deepEqual(game.summons, [1, 0])
  assert.equal(game.gold, 150)
  game.gold = 300
  summonKeepingOne(game, 1, [0], () => 0)
  assert.deepEqual(game.summons, [1, 1])
  game.cooldowns[1] = 0
  game.gold = 200
  summonKeepingOne(game, 1, [0], () => 0)
  assert.deepEqual(game.summons, [2, 1])
})
test('summoning charges once and cooldown blocks duplicates', () => {
  const s = createGame()
  assert.ok(summon(s, 0))
  assert.equal(s.gold, 65)
  assert.equal(summon(s, 0), false)
  assert.equal(s.gold, 65)
})
test('investment increases income and reset restores state', () => {
  const s = createGame()
  assert.ok(upgrade(s))
  assert.equal(s.level, 2)
  step(s, 1)
  assert.equal(s.gold, 17)
  assert.equal(createGame().level, 1)
})
test('朝の清掃 punishes 腸活 before the morning is held; investing after it pays', () => {
  const play = (cap, after) => {
    const s = createGame(0, starterDeck(), 1)
    while (!s.result && s.time < 900) {
      if (s.time >= after && s.level < cap) upgrade(s)
      if (s.time < after || s.level >= cap) for (const i of [2, 1, 0]) summon(s, i)
      if (s.units.some((u) => u.side === -1 && u.x > 650)) burst(s)
      step(s, 0.05)
    }
    return s
  }
  assert.equal(play(5, 0).result, 'defeat')
  assert.equal(play(3, 0).result, 'defeat')
  const [early, late] = [play(2, 0), play(2, 40)]
  assert.equal(late.result, 'victory')
  assert.ok(late.time < early.time, `after the morning ${late.time.toFixed(0)}s, before ${early.time.toFixed(0)}s`)
})
test('the poop tower is on the right: poops march left, the cleanup crew marches right', () => {
  const s = createGame()
  s.spawn = 0
  summon(s, 0)
  step(s, 0.05)
  const poop = s.units.find((u) => u.side === 1),
    enemy = s.units.find((u) => u.side === -1)
  assert.ok(poop.x > HOME_X - 40 && enemy.x < ENEMY_X + 40)
  const [px, ex] = [poop.x, enemy.x]
  step(s, 1)
  assert.ok(poop.x < px, 'poop walks left')
  assert.ok(enemy.x > ex, 'enemy walks right')
})
test('unattended game loses and stops', () => {
  const s = createGame()
  for (let i = 0; i < 10000 && !s.result; i++) step(s, 0.05)
  assert.equal(s.result, 'defeat')
  const t = s.time
  step(s, 1)
  assert.equal(s.time, t)
})
test('the starter army wins the first stage', () => {
  assert.equal(playBattle(starterDeck(), 0).result, 'victory')
})
test('thirty stages, five restrooms, each introducing tougher cleanup', () => {
  assert.equal(STAGES.length, 30)
  assert.equal(new Set(STAGES.map((s) => s.area)).size, 5)
  for (let i = 1; i < 30; i++) {
    assert.ok(STAGES[i].enemy > STAGES[i - 1].enemy)
    assert.ok(STAGES[i].power > STAGES[i - 1].power)
  }
})
test('burst hurts and pushes back enemies in the home half only', () => {
  const s = createGame()
  summon(s, 0, -1)
  summon(s, 0, -1)
  s.units[0].x = 800
  s.units[1].x = 300
  assert.ok(burst(s))
  assert.ok(s.units[0].x < 800 && s.units[0].hp < s.units[0].maxHp)
  assert.equal(s.units[1].x, 300)
  assert.equal(burst(s), false, 'cooldown')
})
test('kills credit EXP to every unit that hurt the enemy', () => {
  const s = createGame()
  s.spawn = 999
  summon(s, 0, -1)
  const enemy = s.units[0]
  enemy.x = 600
  enemy.speed = 0
  s.gold = 999
  summon(s, 0)
  summon(s, 1)
  for (const u of s.units.filter((u) => u.side === 1)) u.x = 630
  for (let i = 0; i < 400 && s.units.includes(enemy); i++) step(s, 0.05)
  assert.equal(s.kills, 1)
  assert.equal(s.exp[1], enemy.exp)
  assert.equal(s.exp[2], enemy.exp)
})
test('hundreds of repeated inputs never duplicate a summon or overspend', () => {
  const s = createGame()
  for (let i = 0; i < 300; i++) {
    summon(s, 2)
    summon(s, 0)
    summon(s, 1)
  }
  assert.equal(s.gold, 5)
  assert.equal(s.units.length, 1)
})
