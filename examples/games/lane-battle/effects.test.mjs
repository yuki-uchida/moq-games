import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POOPS, SPECIALS, ENEMIES, burst, card, createGame, summon, step } from './simulation.js'

function scene(key, distances = [30], enemyKey = 'cleaner') {
  const enemy = ENEMIES.find((type) => type.key === key)
  const game = createGame(0, [card({ uid: 1, key: enemy ? 'katachi' : key })], 42)
  Object.assign(game, { gold: 999, spawn: 999, opened: 2, rushes: 4, turret: 999 })
  if (enemy) summon(game, ENEMIES.indexOf(enemy), -1)
  else summon(game, 0)
  const source = game.units[0]
  source.x = 500
  for (const distance of distances) {
    game.cooldowns[0] = 0
    if (enemy) summon(game, 0, 1)
    else
      summon(
        game,
        ENEMIES.findIndex((type) => type.key === enemyKey),
        -1
      )
    const victim = game.units.at(-1)
    victim.x = 500 + (enemy ? distance : -distance)
    victim.attack = 999
    victim.speed = 0
    victim.hp = victim.maxHp = 10000
  }
  return { game, source, victims: game.units.slice(1) }
}

test('all units expose geometry and effect descriptions', () => {
  for (const type of [...POOPS, ...SPECIALS, ...ENEMIES]) {
    assert.ok(type.areaKind && type.area && type.effect && type.effectLine, type.key)
    if (type.cost) assert.equal(card({ uid: 1, key: type.key }).areaKind, type.areaKind)
  }
})
test('band hits nearest enemies with the documented multipliers and ambush', () => {
  const { game, source, victims } = scene('geri', [20, 30, 40])
  step(game, 0.01)
  assert.equal(victims[0].hp, 10000 - source.atk * 2)
  assert.equal(victims[1].hp, 10000 - source.atk * 0.6)
  assert.equal(victims[2].hp, 10000)
  assert.ok(victims[0].hitters.has(1))
})
test('bounce chooses the nearest further victim and waits for arrival', () => {
  const { game, source, victims } = scene('korokoro', [100, 130, 150])
  step(game, 0.01)
  step(game, 0.12)
  assert.equal(victims[0].hp, 10000 - source.atk)
  assert.equal(victims[1].hp, 10000)
  const effect = game.effects.find((entry) => entry.attackerKey === 'korokoro')
  assert.equal(effect.victims[1].id, victims[1].id)
  assert.equal(effect.victims[1].at, game.time + 0.15)
  step(game, 0.15)
  assert.equal(victims[1].hp, 10000 - source.atk * 0.6)
  assert.equal(victims[2].hp, 10000)
})
test('cone and pierce schedule distance-based arrivals', () => {
  for (const key of ['aircon', 'yoshiki']) {
    const { game, source, victims } = scene(key, [40, 80, 120])
    step(game, 0.001)
    assert.equal(game.projectiles.length, 3)
    for (let index = 0; index < 3; index++)
      assert.ok(Math.abs(game.projectiles[index].at - (0.001 + (0.12 * (index + 1) * 40) / source.range)) < 1e-9)
    victims[1].hp = 0
    step(game, 0.2)
    assert.equal(game.kills, source.side === 1 ? 1 : 0)
  }
})
test('impact circle hits all nearby victims and zones survive the source', () => {
  const { game, source, victims } = scene('bichi', [80, 100, 180])
  step(game, 0.01)
  source.hp = 0
  step(game, 0.12)
  assert.equal(game.zones.length, 1)
  assert.ok(victims[0].hp < 10000 && victims[1].hp < 10000)
  assert.equal(victims[2].hp, 10000)
  step(game, 3.1)
  assert.equal(game.zones.length, 0)
})
test('armor and vulnerability apply to damage and ticks do not flinch', () => {
  const { game, source, victims } = scene('yakiniku', [30])
  victims[0].armor = true
  victims[0].vuln = { end: 99 }
  step(game, 0.01)
  assert.equal(victims[0].hp, 10000 - source.atk * 1.2 * 0.7)
  victims[0].hurt = null
  source.attack = 999
  step(game, 0.5)
  assert.equal(victims[0].hurt, null)
  assert.equal(victims[0].tick.kind, 'burn')
})
test('control pauses attack and phase; heavy halves it and immunity prevents overlap', () => {
  const { game, victims } = scene('geridome', [30])
  const victim = victims[0]
  victim.heavy = true
  step(game, 0.01)
  assert.equal(victim.control.kind, 'stun')
  assert.ok(Math.abs(victim.control.end - 0.36) < 1e-9)
  const [timer, phase] = [victim.attack, victim.phase]
  step(game, 0.1)
  assert.deepEqual([victim.attack, victim.phase], [timer, phase])
  assert.ok(victim.controlImmuneUntil > victim.control.end + 1.19)
})
test('drain and healing never exceed maximum health', () => {
  const { game, source } = scene('ramen', [30])
  source.hp = source.maxHp - 1
  step(game, 0.01)
  assert.equal(source.hp, source.maxHp)
})
test('same seed gives identical state snapshots', () => {
  const first = scene('aircon', [40, 80])
  const second = scene('aircon', [40, 80])
  for (let index = 0; index < 100; index++) {
    step(first.game, 0.05)
    step(second.game, 0.05)
  }
  assert.equal(JSON.stringify(first.game), JSON.stringify(second.game))
})

test('area attacks always hit the engaged foe, even one that has closed inside the area', () => {
  for (const key of ['daiou', 'geri', 'dodeka', 'aircon', 'jiro']) {
    const { game, source, victims } = scene(key, [8])
    step(game, 0.001)
    step(game, 0.2)
    assert.ok(victims[0].hp < 10000, key)
    assert.ok(victims[0].hitters.has(source.uid), key)
  }
})

test('shockwave starts under the engaged foe and runs 80 further; ring hits at most five', () => {
  const shock = scene('daiou', [40, 70, 90, 110, 114, 125])
  step(shock.game, 0.001)
  assert.ok(shock.victims[0].hp < 10000, 'the engaged foe is hit on contact')
  assert.equal(shock.game.projectiles.length, 3)
  assert.ok(Math.abs(shock.game.projectiles[0].at - (0.001 + 30 / 600)) < 1e-9)
  assert.ok(Math.abs(shock.game.projectiles[2].at - (0.001 + 70 / 600)) < 1e-9)
  const ring = scene('jiro', [20, 30, 40, 50, 60, 70])
  step(ring.game, 0.001)
  assert.equal(ring.victims.filter((victim) => victim.hp < 10000).length, 5)
})

test('cold slow and mud use the strongest factor rather than multiplying', () => {
  const { game, victims } = scene('aircon', [50])
  step(game, 0.01)
  step(game, 0.12)
  const victim = victims[0]
  assert.equal(victim.slow.factor, 0.5)
  game.zones.push({ sourceId: 100, side: 1, kind: 'mud', x: victim.x, end: 10 })
  victim.speed = 20
  victim.attack = 999
  game.units[0].hp = 0
  const start = victim.x
  step(game, 0.1)
  assert.ok(Math.abs(victim.x - start - 20 * 1.25 * 0.5 * 0.1) < 1e-9)
})

test('freeze and confusion use the seeded random stream; confusion requires a critical', () => {
  const freeze = scene('ice', [30])
  freeze.game.rng = () => 0
  step(freeze.game, 0.01)
  assert.equal(freeze.victims[0].control.kind, 'freeze')
  const sake = scene('sake', [100])
  sake.game.rng = () => 0.99
  step(sake.game, 0.01)
  step(sake.game, 0.12)
  assert.equal(sake.victims[0].control, undefined)
  sake.source.attack = 0
  sake.game.rng = () => 0
  step(sake.game, 0.01)
  step(sake.game, 0.12)
  assert.equal(sake.victims[0].control.kind, 'confuse')
})

test('immovable units ignore launch, knockback and pull', () => {
  for (const key of ['jiro', 'milk', 'cleaner']) {
    const { game, victims } = scene(key, [30])
    victims[0].immovable = true
    const before = victims[0].x
    step(game, 0.01)
    assert.equal(victims[0].x, before, key)
    assert.equal(victims[0].control, undefined, key)
  }
})

test('drowsiness, rally, attack down and defense down affect combat', () => {
  const sleepy = scene('yofukashi', [30])
  step(sleepy.game, 0.01)
  assert.equal(sleepy.victims[0].drowsy.end, 2.51)
  const rally = scene('daiou', [40])
  step(rally.game, 0.01)
  assert.ok(Math.abs(rally.source.cycle - rally.source.period * 0.8) < 1e-9)
  const weak = scene('sayu', [100])
  step(weak.game, 0.01)
  step(weak.game, 0.12)
  assert.ok(weak.victims[0].weak.end > weak.game.time)
  const vuln = scene('yogurt', [20])
  step(vuln.game, 0.01)
  assert.ok(vuln.victims[0].vuln.end > vuln.game.time)
})

test('poison stacks independently and curry refresh delays its explosion', () => {
  const poison = scene('oyster', [30])
  poison.game.rng = () => 0.99
  for (let count = 0; count < 4; count++) {
    poison.source.attack = 0
    step(poison.game, 0.01)
  }
  assert.equal(poison.victims[0].poison.length, 3)
  const curry = scene('curry', [30, 50])
  step(curry.game, 0.01)
  curry.source.attack = 0
  step(curry.game, 0.5)
  curry.source.attack = 999
  const hp = curry.victims[1].hp
  step(curry.game, 1.01)
  assert.equal(curry.victims[1].hp, hp)
  step(curry.game, 0.48)
  step(curry.game, 0.02)
  assert.equal(curry.victims[1].hp, hp - curry.source.atk * 0.5)
  const explosion = curry.game.effects.find((effect) => effect.explosion)
  assert.equal(explosion.x, curry.victims[0].x)
  assert.equal(explosion.primaryX, curry.victims[0].x)
})

test('execute uses a lower threshold for heavy victims', () => {
  for (const [heavy, shouldFlush] of [
    [false, true],
    [true, false]
  ]) {
    const { game, source, victims } = scene('washiki', [30])
    const victim = victims[0]
    victim.heavy = heavy
    victim.hp = 10000 * 0.15 + source.atk
    step(game, 0.01)
    assert.equal(!!victim.flushed, shouldFlush)
  }
})

test('caffeine ramps and resets after walking', () => {
  const { game, source, victims } = scene('energy', [100])
  for (let index = 0; index < 7; index++) {
    source.attack = 0
    step(game, 0.01)
  }
  assert.equal(source.ramp, 5)
  victims[0].x = 100
  step(game, 0.01)
  assert.equal(source.ramp, 0)
})

test('milk collision damages and pushes the next foe', () => {
  const { game, source, victims } = scene('milk', [30, 65])
  step(game, 0.01)
  assert.equal(victims[1].hp, 10000 - source.atk * 0.5)
  assert.equal(victims[1].x, 423)
  assert.deepEqual(game.effects.find((entry) => entry.attackerKey === 'milk').collisions, [
    { id: victims[1].id, x: 435, at: game.time }
  ])
})

test('fort receives primary damage only; an impact zone can still be created', () => {
  const { game, source, victims } = scene('bichi', [30])
  source.x = 100
  victims[0].x = 120
  const fort = game.enemy
  step(game, 0.01)
  step(game, 0.12)
  assert.equal(game.enemy, fort - source.atk)
  assert.equal(victims[0].hp, 10000)
  assert.equal(game.zones.length, 1)
})

test('a zone replaces its earlier instance from the same source', () => {
  const { game, source } = scene('garlic', [100])
  step(game, 0.01)
  step(game, 0.12)
  const old = game.zones[0]
  source.attack = 0
  step(game, 0.01)
  step(game, 0.12)
  assert.equal(game.zones.length, 1)
  assert.notEqual(game.zones[0], old)
})

test('stun cannot overlap or reapply until immunity expires', () => {
  const { game, source, victims } = scene('geridome', [30])
  step(game, 0.01)
  const first = victims[0].control
  source.attack = 0
  step(game, 0.1)
  assert.equal(victims[0].control, first)
  source.attack = 0
  step(game, 0.7)
  assert.equal(victims[0].control, first)
  source.attack = 0
  step(game, 1.3)
  assert.notEqual(victims[0].control, first)
})

test('healing circle caps allies, and wet floor slides heavy units half distance', () => {
  const heal = scene('seichou', [100])
  const wounded = scene('seichou', [100])
  wounded.source.hp = wounded.source.maxHp / 2
  wounded.source.x = 430
  wounded.victims[0].x = 450
  step(wounded.game, 0.01)
  step(wounded.game, 0.12)
  assert.equal(wounded.source.hp, wounded.source.maxHp * (0.5 + 0.0625))
  assert.deepEqual(wounded.game.effects.find((entry) => entry.attackerKey === 'seichou').healed, [
    { id: wounded.source.id, x: wounded.source.x, side: wounded.source.side, at: wounded.game.time }
  ])
  heal.source.hp = heal.source.maxHp - 1
  heal.source.x = 430
  heal.victims[0].x = 450
  step(heal.game, 0.01)
  step(heal.game, 0.12)
  assert.equal(heal.source.hp, heal.source.maxHp)
  const wet = scene('mop', [30])
  wet.victims[0].heavy = true
  step(wet.game, 0.01)
  const before = wet.victims[0].x
  step(wet.game, 0.5)
  assert.equal(wet.victims[0].x, before + 3)
})

test('ambush recharges only after forty units of walking', () => {
  const { game, source, victims } = scene('geri', [20])
  step(game, 0.01)
  assert.equal(source.charged, true)
  source.attack = 0
  victims[0].x = source.x - 20
  step(game, 0.01)
  assert.equal(source.charged, false)
  source.walkDistance += 40
  source.attack = 0
  victims[0].x = source.x - 20
  step(game, 0.01)
  assert.equal(source.charged, true)
})

test('animation contacts remain aligned at the shortest scheduled cycles', async () => {
  const { beats } = await import('./animation.js')
  for (const type of [...POOPS, ...SPECIALS, ...ENEMIES]) {
    const { game, source } = scene(type.key, [type.key === 'daiou' ? 40 : 20])
    source.rally = { end: 999 }
    source.ramp = type.caffeine ? 5 : 0
    source.rampTarget = game.units[1].id
    step(game, 0.001)
    assert.equal(beats('attack', source.phase, source.cycle).hit, 1, type.key)
    assert.ok(Math.abs(source.cycle - (source.period * 0.8) / (type.caffeine ? 1.4 : 1)) < 1e-9, type.key)
  }
})

test('area damage records credit each damaged victim', () => {
  const { game, victims } = scene('bichi', [80, 100])
  step(game, 0.01)
  step(game, 0.12)
  assert.ok(victims.every((victim) => victim.hitters.has(1)))
  assert.deepEqual(
    game.effects[0].victims.map((victim) => victim.id),
    victims.map((victim) => victim.id)
  )
})

test('stench ticks without flinching and wet floors ignore immovable units', () => {
  const stench = scene('garlic', [100])
  step(stench.game, 0.01)
  step(stench.game, 0.12)
  stench.source.attack = 999
  stench.victims[0].hurt = null
  const hp = stench.victims[0].hp
  step(stench.game, 0.5)
  assert.ok(Math.abs(stench.victims[0].hp - (hp - stench.source.atk * 0.12)) < 1e-9)
  assert.equal(stench.victims[0].hurt, null)
  const wet = scene('mop', [30])
  wet.victims[0].immovable = true
  step(wet.game, 0.01)
  const x = wet.victims[0].x
  step(wet.game, 0.5)
  assert.equal(wet.victims[0].x, x)
})

test('pull, knockback and launch respect heavy resistance', () => {
  for (const [key, expected] of [
    ['cleaner', -7],
    ['milk', -15]
  ]) {
    const { game, victims } = scene(key, [30])
    victims[0].heavy = true
    const start = victims[0].x
    step(game, 0.01)
    assert.equal(victims[0].x - start, expected, key)
  }
  const launch = scene('jiro', [30])
  launch.victims[0].heavy = true
  step(launch.game, 0.01)
  assert.ok(Math.abs(launch.victims[0].control.end - 0.31) < 1e-9)
})

test('turret damage also respects armor', () => {
  const { game, source } = scene('katachi', [])
  source.x = 100
  game.turret = 0
  const hp = source.hp
  step(game, 0.01)
  step(game, 0.12)
  assert.ok(Math.abs(source.hp - (hp - 55 * 0.9 * 0.7)) < 1e-9)
})

test('burst respects heavy resistance and immovability', () => {
  const { game, victims } = scene('katachi', [30, 40])
  victims[0].x = victims[1].x = 800
  victims[0].heavy = true
  victims[1].immovable = true
  burst(game)
  assert.equal(victims[0].x, 757.5)
  assert.equal(victims[1].x, 800)
})

test('bounce does not create an extra projectile without a further foe', () => {
  const { game } = scene('korokoro', [100])
  step(game, 0.01)
  step(game, 0.12)
  assert.equal(game.projectiles.length, 0)
})

test('critical, weakness, area, vulnerability and armor compose in damage order', () => {
  const { game, source, victims } = scene('sake', [100])
  source.weak = { end: 5 }
  victims[0].vuln = { end: 5 }
  victims[0].armor = true
  game.rng = () => 0
  step(game, 0.01)
  step(game, 0.12)
  assert.ok(Math.abs(victims[0].hp - (10000 - source.atk * 2.5 * 0.7 * 1.2 * 0.7)) < 1e-9)
})

test('switching targets resets caffeine ramp', () => {
  const { game, source, victims } = scene('energy', [80, 100])
  for (let index = 0; index < 3; index++) {
    source.attack = 0
    step(game, 0.01)
  }
  assert.equal(source.ramp, 2)
  victims[0].hp = 0
  source.attack = 0
  step(game, 0.01)
  assert.equal(source.ramp, 0)
})

test('a heavy unit is executed at ten percent', () => {
  const { game, source, victims } = scene('washiki', [30])
  victims[0].heavy = true
  victims[0].hp = 10000 * 0.1 + source.atk * 0.7 - 0.001
  step(game, 0.01)
  assert.equal(victims[0].flushed, true)
})

test('attack down reduces damage from existing burn and zones', () => {
  for (const key of ['yakiniku', 'garlic']) {
    const { game, source, victims } = scene(key, [key === 'garlic' ? 100 : 30])
    step(game, 0.01)
    if (key === 'garlic') step(game, 0.12)
    source.attack = 999
    source.weak.end = game.time + 3
    const before = victims[0].hp
    step(game, 0.5)
    const factor = key === 'garlic' ? 0.12 : 0.1
    assert.ok(Math.abs(victims[0].hp - (before - source.atk * factor * 0.7)) < 1e-9, key)
  }
})

test('first fort shot has no caffeine ramp and ambush doubles primary damage', () => {
  const energy = scene('energy', [])
  energy.source.x = 100
  step(energy.game, 0.01)
  assert.equal(energy.source.ramp, 0)
  energy.source.attack = 0
  step(energy.game, 0.01)
  assert.equal(energy.source.ramp, 1)
  const ambush = scene('geri', [])
  ambush.source.x = 100
  const hp = ambush.game.enemy
  step(ambush.game, 0.01)
  assert.equal(ambush.game.enemy, hp - ambush.source.atk * 2)
})

test('cone, pierce and shockwave apply each ordered damage multiplier', () => {
  for (const [key, multipliers, distances] of [
    ['aircon', [1, 0.8, 0.6], [40, 80, 120]],
    ['yoshiki', [1, 0.75, 0.5], [40, 80, 120]],
    ['daiou', [1, 0.8, 0.8, 0.8], [40, 60, 80, 100]]
  ]) {
    const { game, source, victims } = scene(key, distances)
    step(game, 0.001)
    step(game, 0.2)
    for (let index = 0; index < victims.length; index++) {
      const armor = key === 'yoshiki' ? 0.7 : 1
      assert.ok(Math.abs(victims[index].hp - (10000 - source.atk * multipliers[index] * armor)) < 1e-9, key)
    }
  }
})

test('burn reapplication refreshes its duration and tick schedule', () => {
  const { game, source, victims } = scene('yakiniku', [30])
  step(game, 0.01)
  source.attack = 999
  step(game, 0.4)
  source.attack = 0
  step(game, 0.01)
  source.attack = 999
  assert.ok(Math.abs(victims[0].burn.end - (game.time + 2)) < 1e-9)
  const hp = victims[0].hp
  step(game, 0.1)
  assert.equal(victims[0].hp, hp)
  step(game, 0.4)
  assert.ok(Math.abs(victims[0].hp - (hp - source.atk * 0.1)) < 1e-9)
})

test('rally refreshes allies and drowsiness changes the next scheduled cycle', () => {
  const rally = scene('daiou', [40])
  step(rally.game, 0.01)
  const firstEnd = rally.source.rally.end
  rally.source.attack = 0
  step(rally.game, 0.5)
  assert.ok(rally.source.rally.end > firstEnd)
  const sleepy = scene('yofukashi', [30])
  sleepy.victims[0].attack = 0
  step(sleepy.game, 0.01)
  assert.equal(sleepy.victims[0].cycle, sleepy.victims[0].period * 1.35)
})

test('poison deals four independent ticks without flinching', () => {
  const { game, source, victims } = scene('oyster', [30])
  game.rng = () => 0.99
  step(game, 0.01)
  source.attack = 999
  const hp = victims[0].hp
  victims[0].hurt = null
  step(game, 4)
  assert.ok(Math.abs(victims[0].hp - (hp - source.atk * 0.4)) < 1e-9)
  assert.equal(victims[0].hurt, null)
  assert.equal(victims[0].tick.kind, 'poison')
  assert.equal(victims[0].poison.length, 0)
})

test('rally includes allies through 140 units but not beyond', () => {
  const { game, source } = scene('daiou', [40])
  game.gold = 999
  game.cooldowns[0] = 0
  summon(game, 0)
  const inside = game.units.at(-1)
  inside.x = source.x + 140
  inside.attack = 999
  game.cooldowns[0] = 0
  summon(game, 0)
  const outside = game.units.at(-1)
  outside.x = source.x + 141
  outside.attack = 999
  step(game, 0.01)
  assert.ok(inside.rally.end > game.time)
  assert.equal(outside.rally, undefined)
})

test('dodeka and western toilet knock back every area victim', () => {
  for (const [key, distances, knock] of [
    ['dodeka', [20, 30, 40], 18],
    ['yoshiki', [40, 80, 120], 15]
  ]) {
    const { game, source, victims } = scene(key, distances)
    const starts = victims.map((victim) => victim.x)
    step(game, 0.01)
    if (key === 'yoshiki') step(game, 0.12)
    for (let index = 0; index < victims.length; index++)
      assert.equal(victims[index].x, starts[index] - source.side * knock, key)
  }
})
