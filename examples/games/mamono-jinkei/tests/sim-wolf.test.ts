import { describe, expect, test } from 'vitest'
import { createPredictor, createWorld } from '../src/sim/api'
import { LEON, hitLeon, packBoss } from '../src/sim/boss4'
import { hitEnemy } from '../src/sim/combat'
import { spawnEnemy } from '../src/sim/enemies'
import { ICE_ACCEL, WOLF } from '../src/sim/move'
import { MOON, hitProp } from '../src/sim/props'
import type { LegendEntry } from '../src/sim/stage-data'
import { DT, HEAVY, HOWL, ICESPIKE, PACK } from '../src/sim/tables'
import type { WorldImpl } from '../src/sim/world'
import { BOSS_SPEC } from '../src/art/contract'
import { T, Pad, ctrlHero, customForest, hero, parkCompanions, part, place, run, until } from './sim-helpers'

const legend: Record<string, LegendEntry> = {
  m: { tile: 'snow', ent: { type: 'prop', kind: 'moonstone', id: 'stone' } },
  M: { tile: 'snow', ent: { type: 'prop', kind: 'moonstone', group: 'S' } },
  N: { tile: 'snow', multi: true, ent: { type: 'prop', kind: 'bigmoon', id: 'big' } },
  k: { tile: 'ice', ent: { type: 'prop', kind: 'iceblock', id: 'block', weight: 2 } },
  I: { tile: 'snow', multi: true, ent: { type: 'prop', kind: 'icewall', id: 'wall' } },
  l: { tile: 'snow', ent: { type: 'prop', kind: 'log', id: 'log', weight: 4 } },
  R: { tile: 'snow', multi: true, ent: { type: 'prop', kind: 'ramslot', id: 'slot', accepts: 'log' } },
  P: { tile: 'snow', ent: { type: 'prop', kind: 'snowpile', id: 'pile', drop: ['key'] } },
  J: { tile: 'snow', ent: { type: 'boss', kind: 'leon' } }
}
const open = [
  '####################',
  '#..................#',
  '#.@................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################'
]

function solo(map = open) {
  const r = customForest(map, { legend })
  const pad = new Pad(r.world)
  parkCompanions(r.world, r.W, pad, [
    [1, 5],
    [2, 5],
    [3, 5]
  ])
  return { ...r, pad, me: ctrlHero(r.W) }
}

describe('wolf: howl, sprint, ice (DESIGN §7)', () => {
  test('howl: stuns enemies within 120 px, lights moonstones within 160 px for 6 s, 2.5 s cooldown', () => {
    const { world, W, pad, me } = solo([
      '####################',
      '#..................#',
      '#.@......m.........#',
      '#..................#',
      '####################'
    ])
    place(me, T(7), T(2))
    const near = spawnEnemy(W, 'hunter', T(8), T(3))
    const far = spawnEnemy(W, 'hunter', T(14), T(3))
    pad.jump()
    run(world, DT)
    expect(near.stun).toBeGreaterThan(W.t + HOWL.stun - 0.1)
    expect(far.stun).toBeLessThan(W.t)
    expect(me.state).toBe('action')
    const stone = part(W, 'stone')
    expect(stone.state).toBe('on')
    expect(world.view().events.some((e) => e.k === 'fx' && e.s === 'howl')).toBe(true)
    run(world, 0.5)
    pad.jump()
    run(world, DT)
    expect(me.body.howlCd).toBeGreaterThan(1.5)
    run(world, MOON.lit)
    expect(stone.state).toBe('off')
    expect(me.body.howlCd).toBe(0)
  })

  test('resonance: two howls within 0.6 s near a big moonstone wake it (a following companion answers)', () => {
    const map = [
      '####################',
      '#..................#',
      '#.@.......NN.......#',
      '#.........NN.......#',
      '#..................#',
      '####################'
    ]
    const r = customForest(map, { legend })
    const pad = new Pad(r.world)
    const me = ctrlHero(r.W)
    const big = part(r.W, 'big')
    // Alone (companions on stay, far away): one howl is not enough.
    pad.mode()
    run(r.world, DT)
    r.W.heroes
      .filter((h) => h !== me)
      .forEach((h, i) => (place(h, T(16 + i), T(4)), (h.anchor = { x: h.body.x, y: h.body.y })))
    place(me, T(8), T(3))
    pad.jump()
    run(r.world, 1)
    expect(big.on).toBe(false)
    // Following companions echo the howl.
    pad.mode()
    run(r.world, 3, () => pad.move(0, 0))
    place(me, T(8), T(3))
    r.W.heroes.filter((h) => h !== me).forEach((h, i) => place(h, T(8) - 40, T(3) - 30 + i * 30))
    pad.jump()
    run(r.world, 0.5)
    expect(big.on).toBe(true)
    expect(big.state).toBe('on')
  })

  test('sprint ×1.35 after 0.6 s; ice keeps your momentum; the predictor agrees', () => {
    const map = [
      '##############################',
      '#.@..........iiiiiiiiiiii....#',
      '#............iiiiiiiiiiii....#',
      '##############################'
    ]
    const { world, W } = customForest(map, { legend }, ['host', 'guest'])
    const host = new Pad(world)
    parkCompanions(world, W, host, [
      [1, 2],
      [2, 2]
    ])
    const guest = new Pad(world, 'guest')
    parkCompanions(world, W, guest, [[3, 2]])
    const h = ctrlHero(W, 'guest')
    place(h, T(2), T(1))
    const pred = createPredictor(W.parsed!.info, 'guest')
    let top = 0
    for (let i = 0; i < Math.round(4 / DT) && h.body.x < T(15); i++) {
      guest.state.mx = 1
      guest.send({ hero: pred.update(world.view(), guest.state, DT) })
      world.step(DT)
      top = Math.max(top, Math.hypot(h.body.vx, h.body.vy))
    }
    expect(top).toBeGreaterThan(180 * WOLF.sprint - 10)
    // On ice: let go and slide on.
    const x0 = pred.current()!.x
    for (let i = 0; i < Math.round(0.5 / DT); i++) {
      guest.state.mx = 0
      guest.send({ hero: pred.update(world.view(), guest.state, DT) })
      world.step(DT)
    }
    expect(W.grid!.ice[W.grid!.idx(Math.floor(h.body.x / 64), 1)]).toBe(1)
    expect(pred.current()!.x - x0).toBeGreaterThan(80)
    expect(Math.abs(pred.current()!.x - h.body.x)).toBeLessThan(12)
    expect(ICE_ACCEL).toBeLessThan(2)
  })
})

describe('forest parts', () => {
  test('moonstone sets: all lit together set the flag', () => {
    const { world, W, pad, me } = solo([
      '####################',
      '#..M.......M.......#',
      '#.@................#',
      '#..M.......M.......#',
      '####################'
    ])
    const set = W.props.filter((p) => p.kind === 'moonstone')
    place(me, T(3), T(2))
    pad.jump()
    run(world, DT)
    expect(set.filter((p) => p.on).length).toBe(2)
    expect(W.flags.has('moons:S')).toBe(false)
    run(world, 2.6)
    place(me, T(11), T(2))
    pad.jump()
    run(world, DT)
    expect(W.flags.has('moons:S')).toBe(true)
    run(world, MOON.lit + 1)
    expect(set.every((p) => p.on)).toBe(true)
  })

  test('an ice block slides until blocked, and sinks into water to make a path', () => {
    const map = [
      '##################',
      '#................#',
      '#.@.iiiiiiiiii~..#',
      '#...kiiiiiiiii~..#',
      '#...iiiiiiiiii~..#',
      '#........#.......#',
      '##################'
    ]
    const { world, W, pad, me } = solo(map)
    const b = part(W, 'block')
    // Push it east: it slides all the way into the water at (14,3) and fills it.
    place(me, T(4) - 49, T(3))
    W.heroes.filter((h) => h !== me).forEach((h) => place(h, T(4) - 90, T(3)))
    W.heroes.filter((h) => h !== me).forEach((h) => (h.anchor = undefined))
    pad.mode()
    expect(
      until(
        world,
        () => b.gone,
        5,
        () => pad.move(1, 0)
      )
    ).toBe(true)
    expect(W.grid!.walk[W.grid!.idx(14, 3)]).toBe(1)
  })

  test('ice walls only break under the pack technique; snow piles dig out their items', () => {
    const map = [
      '####################',
      '#..................#',
      '#.@................#',
      '#.........II.......#',
      '#.........II.......#',
      '#....P.............#',
      '####################'
    ]
    const { world, W, me } = solo(map)
    const wall = part(W, 'wall')
    hitEnemy
    const pile = part(W, 'pile')
    hitProp(W, pile, 0, false)
    expect(pile.state).toBe('dig')
    run(world, 0.5)
    expect(pile.gone).toBe(true)
    expect(W.pickups.some((p) => p.kind === 'key')).toBe(true)
    // The pack technique: howl → (no targets) → wave → end; the wall shatters.
    const pad = new Pad(world)
    pad.mode()
    run(world, DT)
    place(me, wall.x, wall.y + 2 * 64)
    W.heroes
      .filter((h) => h !== me)
      .forEach(
        (h, i) => (place(h, wall.x - 40 + i * 40, wall.y + 2 * 64 + 30), (h.anchor = { x: h.body.x, y: h.body.y }))
      )
    pad.aim(-Math.PI / 2, 128).attack()
    run(world, 1)
    pad.release()
    run(world, DT)
    expect(W.techs[0]?.kind).toBe('pack')
    expect(world.view().techs[0].stage).toBe('howl')
    expect(until(world, () => !W.techs.length, 3)).toBe(true)
    expect(['break', 'idle']).toContain(wall.state)
    expect(wall.state === 'break' || wall.gone).toBe(true)
  })

  test('the log needs four and breaks the gate through its ram slot', () => {
    const map = [
      '####################',
      '#..................#',
      '#.@................#',
      '#...l........RR....#',
      '#..................#',
      '#..................#',
      '####################'
    ]
    const { world, W } = customForest(map, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    const log = part(W, 'log')
    const slot = part(W, 'slot')
    place(me, log.x - 60, log.y)
    W.heroes.filter((h) => h !== me).forEach((h, i) => place(h, log.x - 40, log.y - 40 + i * 40))
    run(world, 0.2)
    me.body.facing = 0
    pad.interact()
    expect(until(world, () => log.state === 'lifted', 5)).toBe(true)
    expect(
      until(
        world,
        () => slot.on,
        10,
        () => pad.move(1, 0)
      )
    ).toBe(true)
  })
})

describe('月下群狼陣 (pack)', () => {
  test('howl stuns everyone in 5 tiles, lunges hit up to n targets (points exposed), the crescent wave follows', () => {
    for (const n of [2, 3, 4]) {
      const { world, W, me } = solo()
      const pad = new Pad(world)
      place(me, T(5), T(3))
      W.heroes
        .filter((h) => h !== me)
        .slice(0, n - 1)
        .forEach((h, i) => (place(h, T(4), T(2) + i * 40), (h.anchor = { x: h.body.x, y: h.body.y })))
      const foes = [6, 7, 8, 9].map((tx) => {
        const e = spawnEnemy(W, 'hunter', T(tx), T(3))
        e.hp = e.maxHp = 100
        return e
      })
      pad.aim(0, 3 * 64).attack()
      run(world, 1)
      pad.release()
      run(world, DT)
      const t = W.techs[0]
      expect(t.tier).toBe(n)
      expect(foes.every((e) => e.stun > W.t + 1)).toBe(true)
      run(world, PACK.howl + DT)
      const v = world.view().techs[0]
      expect(v.stage).toBe('lunge')
      expect(v.points?.length).toBe(n)
      expect(until(world, () => !W.techs.length, 3)).toBe(true)
      const hit = foes.filter((e) => e.hp < 100)
      expect(hit.length).toBeGreaterThanOrEqual(n)
      expect(100 - foes[0].hp).toBeGreaterThanOrEqual(PACK.lungeDmg[n] * 1.2 - 0.01)
    }
  })
})

describe('stage-4 enemies', () => {
  test('notice first: no attack within 0.6 s of the "!"', () => {
    const { world, W, me } = solo()
    place(me, T(5), T(3))
    const e = spawnEnemy(W, 'heavy', T(6), T(3))
    e.cd = 0
    run(world, DT)
    expect(e.alertAt).toBeDefined()
    run(world, 0.5)
    expect(e.state).not.toBe('windup')
  })

  test('heavy: a long telegraphed smash for 3, then its guard is open', () => {
    const { world, W, me } = solo()
    place(me, T(5), T(3))
    const e = spawnEnemy(W, 'heavy', T(6), T(3))
    e.alertAt = W.t - 1
    e.facing = Math.PI
    e.cd = 0
    run(world, 0.1, () => place(me, T(5), T(3)))
    expect(e.tele?.kind).toBe('cone')
    expect(e.tele!.until - e.tele!.from).toBeCloseTo(HEAVY.windup)
    const hp = me.hp
    me.inv = 0
    run(world, HEAVY.windup, () => place(me, T(5), T(3)))
    expect(hp - me.hp).toBeGreaterThanOrEqual(2)
    expect(e.state).toBe('attack')
    expect(hitEnemy(W, e, { slot: 0, dmg: 1, kb: 0, sx: e.x - 40, sy: e.y })).toBe('hit')
    run(world, HEAVY.recover + 0.1)
    e.state = 'idle'
    e.cd = 1e9
    e.facing = Math.PI
    expect(hitEnemy(W, e, { slot: 0, dmg: 1, kb: 0, sx: e.x - 40, sy: e.y })).toBe('blocked')
  })

  test('paladin guards its front and heals allies; ice witch erupts spikes on a circle telegraph; hunter sets snares', () => {
    const { world, W, me } = solo()
    place(me, T(3), T(3))
    const p = spawnEnemy(W, 'paladin', T(12), T(3))
    p.facing = Math.PI
    expect(hitEnemy(W, p, { slot: 0, dmg: 1, kb: 0, sx: p.x - 40, sy: p.y })).toBe('blocked')
    const ally = spawnEnemy(W, 'hunter', T(13), T(4))
    ally.hp = 1
    p.alertAt = ally.alertAt = W.t - 1
    p.healAt = W.t
    ally.stun = 1e9
    run(world, 0.1, () => place(me, T(3), T(3)))
    expect(ally.hp).toBe(3)
    const w = spawnEnemy(W, 'icewitch', T(7), T(3))
    w.alertAt = W.t - 1
    w.cd = W.t
    run(world, DT)
    expect(w.tele?.kind).toBe('circle')
    expect(w.tele?.r).toBe(ICESPIKE.r)
    run(world, 1.1)
    expect(world.view().events.some((e) => e.k === 'fx' && e.s === 'icespike')).toBe(true)
    const hnt = spawnEnemy(W, 'hunter', T(5), T(5))
    hnt.alertAt = W.t - 1
    hnt.healAt = W.t
    expect(
      until(
        world,
        () => W.snares.some((s) => s.owner === hnt.id),
        2,
        () => (me.inv = 1e9)
      )
    ).toBe(true)
  })
})

describe('final boss 勇者レオン', () => {
  const map = [
    '######################',
    '#....................#',
    '#.@..................#',
    '#....................#',
    '#.........J..........#',
    '#....................#',
    '#....................#',
    '#....................#',
    '######################'
  ]
  function fight() {
    const r = customForest(map, {
      legend,
      rooms: [{ id: 'H', name: 'H', x: 0, y: 0, w: 22, h: 9, objective: '', boss: true }]
    })
    run(r.world, 0.1)
    return { ...r, b: r.W.boss! }
  }

  test('parry blocks and knocks back; normal hits use armour; awaken and the holy shield are immune; the pack breaks it', () => {
    const { world, W, b } = fight()
    expect(b.active).toBe(true)
    const me = ctrlHero(W)
    place(me, b.x - 60, b.y)
    b.act = 'parry'
    b.until = W.t + 1
    const o = { slot: me.slot, dmg: 4, kb: 0, sx: b.x - 60, sy: b.y }
    expect(hitLeon(W, b, o)).toBe('blocked')
    expect(me.body.kx).toBeLessThan(-100)
    expect(world.view().boss?.parry).toBeGreaterThan(W.t)
    b.act = 'idle'
    expect(hitLeon(W, b, o)).toBe('hit')
    expect(LEON.hp - b.hp).toBeCloseTo(4 * LEON.armorMul)
    // Phase 2.
    b.hp = b.maxHp * 0.49
    run(world, DT)
    expect(b.act).toBe('awaken')
    expect(hitLeon(W, b, { ...o, tech: true })).toBe('blocked')
    run(world, LEON.awakenTime + 0.1)
    expect(b.act).toBe('shield')
    expect(world.view().boss?.anim).toBe('shield')
    expect(W.enemies.filter((e) => e.kind === 'paladin').length).toBe(2)
    expect(hitLeon(W, b, { ...o, tech: true })).toBe('blocked')
    packBoss(W, b.x, b.y)
    expect(b.act).toBe('broken')
    expect(b.breaks).toBe(1)
    const hp = b.hp
    hitLeon(W, b, o)
    expect(hp - b.hp).toBeCloseTo(4 * LEON.armorMul * LEON.brokenMul)
  })

  test('combos and dashes are telegraphed, pillars land on circle telegraphs; animation keys exist', () => {
    const { world, W, b } = fight()
    for (const h of W.heroes) h.inv = 1e9
    const keys = new Set<string>()
    const kinds = new Set<string>()
    run(world, 14, () => {
      const v = world.view()
      if (v.boss?.animKey) keys.add(v.boss.animKey)
      for (const t of b.tele) kinds.add(t.kind)
      if (W.t > 7 && b.phase === 1) b.hp = b.maxHp * 0.45
    })
    expect(kinds.has('cone')).toBe(true)
    expect(kinds.has('circle')).toBe(true)
    for (const k of keys) expect(BOSS_SPEC.leon[k], k).toBeDefined()
    expect(world.view().events.some((e) => e.k === 'fx' && e.s === 'pillar')).toBe(true)
  })

  test('after the last stage: clear → next → ending, with all four stages recorded', () => {
    const world = createWorld({
      seed: 1,
      progress: { cleared: ['meadow', 'sewer', 'tower'] },
      stage: 'forest',
      skipIntro: true
    }) as WorldImpl
    world.setPlayers([{ id: 'h', name: 'h' }])
    world.W.orbTaken = true
    world.step(DT)
    expect(world.view().phase).toBe('clear')
    expect(world.view().results?.stage).toBe('forest')
    world.command('h', { type: 'next' })
    expect(world.view().phase).toBe('ending')
    expect(world.progress().cleared).toEqual(['meadow', 'sewer', 'tower', 'forest'])
    void hero
  })
})
