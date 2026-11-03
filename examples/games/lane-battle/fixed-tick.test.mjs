import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ENEMIES, burst, card, createGame, reach, rng, step, summon } from './simulation.js'

const frames = [
  () => 1 / 60,
  () => 0.01,
  () => 0.05,
  (() => {
    const random = rng(123)
    return () => 0.004 + random() * 0.046
  })()
]

function reviewScene(keys) {
  const game = createGame(
    0,
    keys.map((key, index) => card({ uid: index + 1, key })),
    1
  )
  Object.assign(game, { time: 1, gold: 999, spawn: 999, opened: 2, rushes: 4, turret: 999 })
  for (let index = 0; index < keys.length; index++) assert.ok(summon(game, index))
  assert.ok(
    summon(
      game,
      ENEMIES.findIndex((unit) => unit.key === 'cleaner'),
      -1
    )
  )
  return game
}

test('a ready attacker retargets the fort when its blocker dies within the tick', () => {
  for (const homeImpact of [1.01, 1.02]) {
    const results = frames.map((frame) => {
      const game = reviewScene(['katachi', 'korokoro'])
      assert.ok(
        summon(
          game,
          ENEMIES.findIndex((unit) => unit.key === 'sayu'),
          -1
        )
      )
      const [attacker, shooter, blocker, enemyShooter] = game.units
      Object.assign(game, { home: 1, enemy: 1 })
      Object.assign(attacker, { x: 100, attack: 0 })
      Object.assign(shooter, { x: 200, attack: 1 })
      Object.assign(blocker, { x: 65, hp: 1, attack: 0.5 })
      Object.assign(enemyShooter, { x: 800, attack: 1 })
      assert.ok(reach(game, attacker).gap > 0)
      for (const [targetId, src, at] of [
        [blocker.id, shooter, 1.003],
        [null, enemyShooter, homeImpact]
      ])
        game.projectiles.push({ targetId, src, at, damage: src.atk, primary: true, effect: { victims: [] } })
      advance(game, 0.05, frame)
      return { result: game.result, time: game.time, home: game.home, enemy: game.enemy, strikes: attacker.strikes }
    })
    for (const result of results) assert.deepEqual(result, results[0])
    assert.deepEqual(results[0], { result: 'victory', time: 1.003, home: 1, enemy: 0, strikes: 1 })
  }
})

test('deaths before a decisive fort hit are rewarded but later projectiles do not land', () => {
  const results = frames.map((frame) => {
    const game = reviewScene(['korokoro', 'katachi'])
    const [shooter, attacker, victim] = game.units
    game.enemy = 1
    Object.assign(shooter, { x: 650, attack: 1 })
    Object.assign(attacker, { x: 100, attack: 0.005 })
    Object.assign(victim, { x: 500, hp: 1, attack: 0.5 })
    game.projectiles.push({
      targetId: victim.id,
      src: shooter,
      damage: shooter.atk,
      at: 1.003,
      primary: true,
      effect: { victims: [] }
    })
    game.projectiles.push({ targetId: null, src: { side: -1 }, damage: 9999, at: 1.01, effect: { victims: [] } })
    advance(game, 0.05, frame)
    return {
      result: game.result,
      time: game.time,
      kills: game.kills,
      exp: game.exp,
      retained: game.units.includes(victim),
      pending: game.projectiles.length
    }
  })
  for (const result of results) assert.deepEqual(result, results[0])
  assert.deepEqual(results[0], {
    result: 'victory',
    time: 1.005,
    kills: 1,
    exp: { 1: 10 },
    retained: false,
    pending: 1
  })
})

test('a zone displacement engages a ready attacker during the same tick', () => {
  const game = reviewScene(['katachi'])
  const [attacker, victim] = game.units
  Object.assign(attacker, { x: 200, attack: 0, speed: 0 })
  Object.assign(victim, { x: 150, attack: 1, speed: 0 })
  game.zones.push({ side: 1, kind: 'wash', x: 150, radius: 10, next: 1.003, end: 1.003, interval: 1, push: -20 })
  step(game, 1 / 60)
  assert.equal(attacker.strikes, 1)
  assert.equal(game.effects.find((effect) => effect.sourceId === attacker.id).releasedAt, 1.003)
})

test('an engaged ready attacker strikes as control ends within the tick', () => {
  const game = reviewScene(['katachi'])
  const [attacker, victim] = game.units
  Object.assign(attacker, { x: 200, attack: 0, speed: 0, control: { kind: 'stun', start: 0.99, end: 1.005 } })
  Object.assign(victim, { x: 180, attack: 1, speed: 0 })
  step(game, 1 / 60)
  assert.equal(attacker.strikes, 1)
  assert.equal(game.effects.find((effect) => effect.sourceId === attacker.id).releasedAt, 1.005)
})

test('rounding at a control start cannot repeatedly schedule a blocked attack', () => {
  const game = reviewScene(['katachi'])
  const [attacker, victim] = game.units
  game.time = 191.05
  Object.assign(attacker, { x: 200, attack: 0, speed: 0, control: { kind: 'stun', start: 191.05, end: 191.35 } })
  Object.assign(victim, { x: 180, attack: 1, speed: 0 })
  step(game, 1 / 60)
  assert.equal(attacker.strikes, 0)
})

function advance(game, duration, frame) {
  let remaining = duration
  while (remaining > 1e-10 && !game.result) {
    const dt = Math.min(frame(), remaining)
    step(game, dt)
    remaining -= dt
  }
}

function scene(key) {
  const game = createGame(0, [card({ uid: 1, key })], 42)
  Object.assign(game, { time: 1, gold: 999, spawn: 999, opened: 2, rushes: 4, turret: 999 })
  summon(game, 0)
  summon(
    game,
    ENEMIES.findIndex((unit) => unit.key === 'sayu'),
    -1
  )
  return game
}

test('accumulation snaps decimal residue without drifting', () => {
  const game = createGame()
  for (let index = 0; index < 10; index++) step(game, 0.005)
  assert.equal(game.ticks, 3)
  assert.equal(game.time, 3 / 60)
  step(game, 0.05)
  assert.equal(game.ticks, 6)
  assert.equal(game.time, 6 / 60)
})

test('the earlier fort impact ends the battle for every frame sequence', () => {
  const results = frames.map((frame) => {
    const game = scene('korokoro')
    Object.assign(game, { home: 10, enemy: 10 })
    Object.assign(game.units[0], { x: 180, attack: 0, speed: 0 })
    Object.assign(game.units[1], { x: 820, attack: 0.03, speed: 0 })
    advance(game, 1, frame)
    return { time: game.time, result: game.result, home: game.home, enemy: game.enemy }
  })
  for (const result of results) assert.deepEqual(result, results[0])
  assert.equal(results[0].result, 'victory')
  assert.equal(results[0].home, 10)
})

test('an attack before a lethal burn is frame independent', () => {
  const results = frames.map((frame) => {
    const game = scene('yakiniku')
    const [source, attacker] = game.units
    Object.assign(source, { x: 500, attack: 999, speed: 0 })
    Object.assign(attacker, {
      x: 450,
      attack: 0.01,
      speed: 0,
      hp: 1,
      burn: {
        next: 1.03,
        end: 1.03,
        interval: source.burnInterval,
        atk: source.atk,
        damage: source.burnDamage,
        src: source
      }
    })
    advance(game, 0.2, frame)
    return { hp: source.hp, weak: source.weak.end, strikes: attacker.strikes }
  })
  for (const result of results) assert.deepEqual(result, results[0])
  assert.equal(results[0].strikes, 1)
})

test('an attack earlier than a burn in the same tick still happens', () => {
  const game = scene('yakiniku')
  const [source, attacker] = game.units
  Object.assign(source, { x: 500, attack: 999, speed: 0 })
  Object.assign(attacker, {
    x: 450,
    attack: 0.005,
    speed: 0,
    hp: 1,
    burn: {
      next: 1.01,
      end: 1.01,
      interval: source.burnInterval,
      atk: source.atk,
      damage: source.burnDamage,
      src: source
    }
  })
  step(game, 1 / 60)
  assert.equal(attacker.strikes, 1)
  assert.equal(game.effects.find((effect) => effect.sourceId === attacker.id).releasedAt, 1.005)
})

test('attack phase and timer advance only after contact within a tick', () => {
  const game = scene('yakiniku')
  const [source, attacker] = game.units
  Object.assign(source, { x: 500, attack: 999, speed: 0 })
  Object.assign(attacker, { x: 450, attack: 0.005, speed: 0 })
  step(game, 1 / 60)
  const elapsed = 1 / 60 - 0.005
  assert.ok(Math.abs(attacker.phase - elapsed) < 1e-9)
  assert.ok(Math.abs(attacker.attack - (attacker.cycle - elapsed)) < 1e-9)
})

test('control arriving before contact delays the scheduled attack', () => {
  const game = scene('yakiniku')
  const [source, attacker] = game.units
  Object.assign(source, { x: 500, attack: 999, speed: 0 })
  Object.assign(attacker, { x: 450, attack: 0.005, speed: 0 })
  game.projectiles.push({
    targetId: attacker.id,
    src: { side: 1, stun: 0.01 },
    damage: 1,
    at: 1.003,
    effect: { victims: [] }
  })
  step(game, 1 / 60)
  assert.equal(attacker.strikes, 1)
  assert.ok(Math.abs(game.effects.find((effect) => effect.sourceId === attacker.id).releasedAt - 1.015) < 1e-9)
  assert.ok(Math.abs(attacker.phase - (1 / 60 - 0.015)) < 1e-9)
})

test('simultaneous lethal melee fort attacks favor the player', () => {
  const game = createGame(0, [card({ uid: 1, key: 'katachi' })], 42)
  Object.assign(game, { home: 1, enemy: 1, gold: 999, spawn: 999, opened: 2, rushes: 4, turret: 999 })
  summon(game, 0, -1)
  summon(game, 0)
  Object.assign(game.units[0], { x: 920, speed: 0 })
  Object.assign(game.units[1], { x: 80, speed: 0 })
  step(game, 1 / 60)
  assert.equal(game.result, 'victory')
  assert.equal(game.home, 0)
  assert.equal(game.enemy, 0)
})

test('simultaneous lethal fort projectiles favor the player and stop later events', () => {
  const game = createGame()
  Object.assign(game, { home: 1, enemy: 1, spawn: 999, opened: 2, rushes: 4, turret: 999 })
  for (const [side, at] of [
    [-1, 0.01],
    [1, 0.01],
    [-1, 0.011]
  ]) {
    game.projectiles.push({ targetId: null, src: { side }, at, damage: 1, effect: { victims: [] } })
  }
  step(game, 1 / 60)
  assert.equal(game.result, 'victory')
  assert.equal(game.home, 0)
  assert.equal(game.enemy, 0)
  assert.equal(game.time, 0.01)
  assert.equal(game.projectiles.length, 1)
})

test('a later fort projectile never changes a decisive result', () => {
  const game = createGame()
  Object.assign(game, { home: 1, enemy: 1, spawn: 999, opened: 2, rushes: 4, turret: 999 })
  for (const [side, at] of [
    [-1, 0.01],
    [1, 0.0100000005]
  ]) {
    game.projectiles.push({ targetId: null, src: { side }, at, damage: 1, effect: { victims: [] } })
  }
  step(game, 1 / 60)
  assert.equal(game.result, 'defeat')
  assert.equal(game.enemy, 1)
  assert.equal(game.time, 0.01)
})

test('burst and turret target units rather than forts', () => {
  const game = createGame()
  Object.assign(game, { home: 1, enemy: 1, spawn: 999, opened: 2, rushes: 4, turret: 0, gold: 999 })
  summon(game, 0)
  summon(game, 0, -1)
  Object.assign(game.units[0], { x: 100, speed: 0, attack: 999 })
  Object.assign(game.units[1], { x: 800, speed: 0, attack: 999, hp: 1 })
  assert.equal(burst(game), true)
  step(game, 0.2)
  assert.equal(game.result, null)
  assert.equal(game.home, 1)
  assert.equal(game.enemy, 1)
  assert.ok(game.units[0].hp < game.units[0].maxHp)
})

test('a scripted mixed battle produces the same state across frame sequences', () => {
  const results = frames.map((frame) => {
    const deck = ['yakiniku', 'korokoro', 'garlic', 'bichi'].map((key, index) => card({ uid: index + 1, key }))
    const game = createGame(8, deck, 123)
    game.gold = 999
    for (let index = 0; index < deck.length; index++) {
      summon(game, index)
      Object.assign(game.units.at(-1), { x: 530 + index * 10, hp: 1e6, maxHp: 1e6, speed: 0 })
    }
    for (const key of ['sayu', 'yoshiki', 'mop']) {
      summon(
        game,
        ENEMIES.findIndex((unit) => unit.key === key),
        -1
      )
      Object.assign(game.units.at(-1), { x: 490, hp: 1e6, maxHp: 1e6, speed: 0 })
    }
    const seen = { projectiles: false, zones: false, status: false }
    for (let slice = 0; slice < 200 && !game.result; slice++) {
      if (slice % 10 === 0) summon(game, (slice / 10) % deck.length)
      advance(game, 0.1, frame)
      seen.projectiles ||= game.projectiles.length > 0
      seen.zones ||= game.zones.length > 0
      seen.status ||= game.units.some((unit) => unit.burn || unit.weak.end > game.time)
    }
    assert.deepEqual(seen, { projectiles: true, zones: true, status: true })
    return {
      time: game.time,
      result: game.result,
      home: game.home,
      enemy: game.enemy,
      gold: game.gold,
      units: game.units.map(({ id, hp, x }) => ({ id, hp, x }))
    }
  })
  for (const result of results) assert.deepEqual(result, results[0])
})
