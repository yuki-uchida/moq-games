import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STAGES, createGame, summon, step, upgrade, burst } from './simulation.js'
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
  assert.equal(s.gold, 47)
  assert.equal(createGame().level, 1)
})
test('unattended game loses and stops', () => {
  const s = createGame()
  for (let i = 0; i < 10000 && !s.result; i++) step(s, 0.05)
  assert.equal(s.result, 'defeat')
  const t = s.time
  step(s, 1)
  assert.equal(s.time, t)
})
test('combined army can win without changing rules', () => {
  const s = createGame()
  for (let i = 0; i < 16000 && !s.result; i++) {
    if (s.level < 3 && s.gold >= 135) upgrade(s)
    summon(s, 2)
    summon(s, 1)
    if (s.gold > 65) summon(s, 0)
    if (s.units.some((u) => u.side === -1 && u.x < 350)) burst(s)
    step(s, 0.05)
  }
  assert.equal(s.result, 'victory')
})

test('every stage supports victory and differs in economy and enemy roster', () => {
  for (let stage = 0; stage < 3; stage++) {
    const s = createGame(stage)
    for (let i = 0; i < 15000 && !s.result; i++) {
      if (s.level < 3 && s.gold >= 135) upgrade(s)
      summon(s, 2)
      summon(s, 1)
      if (s.gold > 65) summon(s, 0)
      if (s.units.some((u) => u.side === -1 && u.x < 350)) burst(s)
      step(s, 0.05)
    }
    assert.equal(s.result, 'victory', `stage ${stage + 1}`)
  }
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
