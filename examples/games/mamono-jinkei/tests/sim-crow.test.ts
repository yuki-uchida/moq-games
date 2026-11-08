import { describe, expect, test } from 'vitest'
import { createPredictor } from '../src/sim/api'
import { VALK, hitValk, pullDown } from '../src/sim/boss3'
import { hitEnemy } from '../src/sim/combat'
import { spawnEnemy } from '../src/sim/enemies'
import { HAWK, hitMinion } from '../src/sim/minions'
import { CROW_FLIGHT } from '../src/sim/move'
import { BELL_WINDOW, hitProp } from '../src/sim/props'
import type { LegendEntry } from '../src/sim/stage-data'
import { DT, GUST, MONK, SNIPER, TORNADO } from '../src/sim/tables'
import { BOSS_SPEC } from '../src/art/contract'
import { T, Pad, ctrlHero, customTower, hero, parkCompanions, part, place, run, until } from './sim-helpers'

const legend: Record<string, LegendEntry> = {
  v: { tile: 'sky', ent: { type: 'prop', kind: 'vent' } },
  M: { tile: 'cliff', multi: true, ent: { type: 'prop', kind: 'windmill', id: 'mill' } },
  d: { tile: 'sky', ent: { type: 'prop', kind: 'drawbridge', cond: { on: 'mill' }, latch: true } },
  B: { tile: 'cliff', ent: { type: 'prop', kind: 'bell', group: 'G' } },
  L: { tile: 'cliff', ent: { type: 'prop', kind: 'lockdoor', id: 'lock' } },
  k: { tile: 'cliff', ent: { type: 'pickup', kind: 'key' } },
  g: { tile: 'cliff', ent: { type: 'prop', kind: 'goldbell', id: 'gold', weight: 4 } },
  H: { tile: 'cliff', multi: true, ent: { type: 'prop', kind: 'hook', id: 'hook', accepts: 'gold' } },
  J: { tile: 'cliff', ent: { type: 'boss', kind: 'valk' } }
}

describe('crow flight (DESIGN §7)', () => {
  const gap = [
    '####################',
    '#....~~~~~~~~......#',
    '#.@..~~~~~~~~......#',
    '#....~~~v~~~~......#',
    '#....~~~~~~~~......#',
    '####################'
  ]

  test('hold to fly over sky on 1.5 s of stamina; landing on sky falls; stamina comes back on the ground', () => {
    const { world, W } = customTower(gap, { legend })
    const pad = new Pad(world)
    parkCompanions(world, W, pad, [
      [1, 4],
      [2, 4],
      [3, 4]
    ])
    const me = ctrlHero(W)
    place(me, T(4), T(1))
    pad.state.actionHeld = true
    pad.move(1, 0)
    run(world, 0.3)
    expect(me.body.flying).toBe(true)
    expect(me.body.z).toBeGreaterThan(20)
    expect(me.state).toBe('action')
    expect(Math.hypot(me.body.vx, me.body.vy)).toBeGreaterThan(CROW_FLIGHT.speed - 20)
    // Stamina runs out over the sky (row 1 has no vent): fall.
    expect(
      until(
        world,
        () => me.state === 'fall',
        3,
        () => pad.move(1, 0)
      )
    ).toBe(true)
    pad.state.actionHeld = false
    pad.move(0, 0)
    run(world, 1)
    expect(me.body.x).toBeLessThan(T(5))
    // Rested on the ground, stamina is back.
    run(world, 1.6)
    expect(me.body.stamina).toBeCloseTo(CROW_FLIGHT.stamina, 1)
  })

  test('a vent refills stamina and lifts you: the vent row crosses the 8-tile gap', () => {
    const { world, W } = customTower(gap, { legend })
    const pad = new Pad(world)
    parkCompanions(world, W, pad, [
      [1, 4],
      [2, 4],
      [3, 4]
    ])
    const me = ctrlHero(W)
    place(me, T(4) + 15, T(3))
    pad.state.actionHeld = true
    let maxZ = 0
    run(world, 2.4, () => {
      pad.move(1, 0)
      maxZ = Math.max(maxZ, me.body.z)
    })
    pad.state.actionHeld = false
    run(world, 0.6, () => pad.move(1, 0))
    expect(me.state).not.toBe('fall')
    expect(me.body.x).toBeGreaterThan(T(13))
    expect(maxZ).toBeGreaterThan(CROW_FLIGHT.z + 6)
  })

  test('wind pushes flyers hard and walkers gently; a formation of 3 resists', () => {
    const map = [
      '##############',
      '#............#',
      '#.@..........#',
      '#............#',
      '#............#',
      '##############'
    ]
    const { world, W } = customTower(map, { legend, winds: [{ x: 1, y: 1, w: 12, h: 4, dx: 1, dy: 0, strength: 150 }] })
    const pad = new Pad(world)
    parkCompanions(world, W, pad, [
      [1, 1],
      [1, 4],
      [12, 4]
    ])
    const me = ctrlHero(W)
    place(me, T(4), T(2))
    run(world, 1)
    const walk = me.body.x - T(4)
    expect(walk).toBeGreaterThan(30)
    expect(walk).toBeLessThan(60)
    place(me, T(4), T(2))
    pad.state.actionHeld = true
    pad.send()
    run(world, 1)
    pad.state.actionHeld = false
    pad.send()
    expect(me.body.x - T(4)).toBeGreaterThan(120)
    run(world, 0.5)
    // Three together: no drift.
    const mates = W.heroes.filter((h) => h !== me)
    place(me, T(4), T(3))
    mates
      .slice(0, 2)
      .forEach((m, i) => (place(m, T(4) - 30 * (i + 1), T(3) + 20), (m.anchor = { x: m.body.x, y: m.body.y })))
    run(world, 1)
    expect(Math.abs(me.body.x - T(4))).toBeLessThan(4)
  })

  test('the guest predictor flies, uses vents and falls exactly like the host', () => {
    const { world, W } = customTower(gap, { legend }, ['host', 'guest'])
    const host = new Pad(world)
    const guest = new Pad(world, 'guest')
    parkCompanions(world, W, host, [
      [1, 4],
      [2, 4]
    ])
    parkCompanions(world, W, guest, [[3, 4]])
    const h = ctrlHero(W, 'guest')
    place(h, T(4) + 15, T(3))
    const pred = createPredictor(W.parsed!.info, 'guest')
    guest.state.actionHeld = true
    const seq = h.forceSeq
    for (let i = 0; i < Math.round(3 / DT); i++) {
      if (i === Math.round(2.4 / DT)) guest.state.actionHeld = false
      guest.state.mx = 1
      guest.send({ hero: pred.update(world.view(), guest.state, DT) })
      world.step(DT)
    }
    expect(pred.current()!.x).toBeGreaterThan(T(13))
    expect(h.state).not.toBe('fall')
    expect(Math.abs(pred.current()!.x - h.body.x)).toBeLessThan(12)
    expect(h.forceSeq).toBe(seq)
  })

  test('companions follow across a gap by flying', () => {
    const map = [
      '###################',
      '#.....~~~~........#',
      '#.@...~~~~........#',
      '#.....~~~~........#',
      '###################'
    ]
    const { world, W } = customTower(map, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    place(me, T(5), T(2))
    run(world, 0.5)
    pad.state.actionHeld = true
    run(world, 1.4, () => pad.move(1, 0))
    pad.state.actionHeld = false
    run(world, 0.8, () => pad.move(1, 0))
    expect(me.body.x).toBeGreaterThan(T(10))
    pad.move(0, 0)
    const seq = W.heroes.map((h) => h.forceSeq)
    expect(until(world, () => W.heroes.every((h) => h.body.x > T(10) - 20 && h.body.z === 0), 10)).toBe(true)
    W.heroes.forEach((h, i) => h !== me && expect(h.forceSeq, `slot ${h.slot} flew`).toBe(seq[i]))
  })
})

describe('黒羽の大旋風 (tornado), windmills and drawbridges', () => {
  const map = [
    '####################',
    '#..................#',
    '#.@................#',
    '#..................#',
    '#.........MM.......#',
    '#..................#',
    '#..~ddd~...........#',
    '#..................#',
    '####################'
  ]

  test('rise → spin → end around the aim point: pulls and ticks enemies, spins the windmill, lowers the drawbridge', () => {
    const { world, W } = customTower(map, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    place(me, T(10), T(1))
    W.heroes.filter((h) => h !== me).forEach((h, i) => place(h, T(9 + i), T(2)))
    run(world, 0.3)
    const e = spawnEnemy(W, 'falconer', T(12), T(3))
    e.hp = e.maxHp = 100
    e.stun = 1e9
    pad.aim(Math.PI / 2, 2.5 * 64).attack()
    run(world, 1)
    pad.release()
    run(world, DT)
    const t = W.techs[0]
    expect(t?.kind).toBe('tornado')
    expect(t.tier).toBe(4)
    expect(world.view().techs[0].stage).toBe('rise')
    run(world, TORNADO.rise + DT)
    expect(world.view().techs[0].stage).toBe('spin')
    const d0 = Math.hypot(e.x - t.tx, e.y - t.ty)
    run(world, 1)
    expect(Math.hypot(e.x - t.tx, e.y - t.ty)).toBeLessThan(d0)
    expect(100 - e.hp).toBeGreaterThanOrEqual(4)
    expect(part(W, 'mill').state).toBe('spin')
    expect(until(world, () => !W.techs.length, 3)).toBe(true)
    expect(W.heroes.every((h) => h.state !== 'fall' && h.body.z === 0)).toBe(true)
    // The drawbridge lowers and becomes walkable.
    expect(until(world, () => W.props.filter((p) => p.kind === 'drawbridge').every((p) => p.state === 'down'), 1)).toBe(
      true
    )
    run(world, DT)
    expect(W.grid!.walkable(4, 6)).toBe(true)
    expect(W.grid!.walkable(3, 6)).toBe(false)
  })
})

describe('bells, keys and the gold bell', () => {
  test('bells: all rung within 1.2 s set the group flag; slower rings fade', () => {
    const map = [
      '##############',
      '#............#',
      '#.@..........#',
      '#.B..B..B..B.#',
      '#............#',
      '##############'
    ]
    const { world, W } = customTower(map, { legend })
    const pad = new Pad(world)
    parkCompanions(world, W, pad)
    const bells = W.props.filter((p) => p.kind === 'bell')
    for (const b of bells.slice(0, 3)) hitProp(W, b, 0, false)
    expect(bells[0].state).toBe('ring')
    run(world, BELL_WINDOW + 0.1)
    hitProp(W, bells[3], 0, false)
    expect(W.flags.has('bells:G')).toBe(false)
    run(world, 0.5)
    const me = ctrlHero(W)
    place(me, bells[0].x, bells[0].y + 50)
    pad.aim(-Math.PI / 2).tap()
    run(world, 0.1)
    for (const b of bells.slice(1)) hitProp(W, b, 1, false)
    expect(W.flags.has('bells:G')).toBe(true)
  })

  test('a key opens a lock door by touch; without one it stays shut', () => {
    const map = ['##########', '#........#', '#.@......#', '####L#####', '#........#', '#..k.....#', '##########']
    const { world, W } = customTower(map, { legend })
    const pad = new Pad(world)
    parkCompanions(world, W, pad)
    const me = ctrlHero(W)
    const lock = part(W, 'lock')
    place(me, T(4), T(2))
    run(world, 0.5, () => pad.move(0, 1))
    expect(lock.state).toBe('closed')
    expect(world.view().events.some((e) => e.k === 'pop' && e.s === 'カギがかかっている')).toBe(true)
    W.party.keys = 1
    run(world, 0.2, () => pad.move(0, 1))
    expect(lock.state).toBe('opening')
    expect(W.party.keys).toBe(0)
    expect(until(world, () => lock.state === 'open', 1)).toBe(true)
    expect(
      until(
        world,
        () => W.party.keys === 1,
        4,
        () => pad.move(0, 1)
      )
    ).toBe(true)
  })

  test('the gold bell needs four carriers and hangs on its hook', () => {
    const map = [
      '################',
      '#..............#',
      '#.@............#',
      '#...g......HH..#',
      '#..............#',
      '#..............#',
      '################'
    ]
    const { world, W } = customTower(map, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    const gold = part(W, 'gold')
    const hook = part(W, 'hook')
    place(me, gold.x - 60, gold.y)
    W.heroes.filter((h) => h !== me).forEach((h, i) => place(h, gold.x - 40, gold.y - 40 + i * 40))
    run(world, 0.2)
    me.body.facing = 0
    pad.interact()
    expect(until(world, () => gold.state === 'lifted', 5)).toBe(true)
    expect(gold.grips.length).toBe(4)
    expect(
      until(
        world,
        () => hook.on,
        10,
        () => pad.move(Math.sign(hook.x - gold.x), Math.sign(hook.y - gold.y) * 0.5)
      )
    ).toBe(true)
    expect(hook.state).toBe('on')
  })
})

describe('stage-3 enemies', () => {
  const open = [
    '####################',
    '#..................#',
    '#.@................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '####################'
  ]
  function arena() {
    const r = customTower(open, { legend })
    const pad = new Pad(r.world)
    parkCompanions(r.world, r.W, pad, [
      [1, 5],
      [2, 5],
      [3, 5]
    ])
    const me = ctrlHero(r.W)
    place(me, T(4), T(3))
    return { ...r, pad, me }
  }

  test('falconer: sends a hawk that swoops along a line telegraph; hawks die in two hits', () => {
    const { world, W, me } = arena()
    const e = spawnEnemy(W, 'falconer', T(10), T(3))
    e.alertAt = W.t
    e.cd = W.t
    expect(until(world, () => W.minions.length > 0, 2)).toBe(true)
    const hawk = W.minions[0]
    expect(world.view().minions?.[0].kind).toBe('hawk')
    let tele = false
    const hp = me.hp
    expect(
      until(
        world,
        () => me.hp < hp,
        8,
        () => {
          if (hawk.tele?.kind === 'line') tele = true
          me.inv = 0
          place(me, T(4), T(3))
        }
      )
    ).toBe(true)
    expect(tele).toBe(true)
    const states = new Set<string>()
    run(world, 0.5, () => world.view().minions?.forEach((m) => states.add(m.state)))
    expect([...states].every((s) => ['fly', 'swoop', 'hurt', 'death'].includes(s))).toBe(true)
    hawk.state = 'fly'
    const o = { slot: 0, dmg: 1, kb: 0, sx: hawk.x, sy: hawk.y }
    expect(hawk.hp).toBe(HAWK.hp)
    hitMinion(W, hawk, o)
    hitMinion(W, hawk, o)
    expect(hawk.state).toBe('death')
    run(world, 0.5)
    expect(W.minions.length).toBe(0)
  })

  test('crossbow: 0.8 s aim line, a bolt that pierces two heroes', () => {
    const { world, W, me } = arena()
    const other = hero(W, 1)
    place(me, T(6), T(3))
    place(other, T(8), T(3))
    other.anchor = { x: other.body.x, y: other.body.y }
    const e = spawnEnemy(W, 'crossbow', T(16), T(3))
    e.alertAt = W.t
    e.cd = W.t
    run(world, 0.05)
    expect(e.tele?.kind).toBe('line')
    expect(e.tele!.until - e.tele!.from).toBeCloseTo(SNIPER.aim)
    const a = me.hp
    const b = other.hp
    run(world, SNIPER.aim + 1.2, () => (place(me, T(6), T(3)), place(other, T(8), T(3))))
    expect(other.hp).toBeLessThan(b)
    expect(me.hp).toBeLessThan(a)
  })

  test('wind mage: the gust shoves a walker off the cliff edge', () => {
    const map = ['##########', '#........#', '#.@......#', '#.....~~~#', '#........#', '##########']
    const { world, W } = customTower(map, { legend })
    const pad = new Pad(world)
    parkCompanions(world, W, pad, [
      [8, 1],
      [8, 4],
      [7, 4]
    ])
    const me = ctrlHero(W)
    place(me, T(5), T(3))
    const e = spawnEnemy(W, 'windmage', T(2), T(3))
    e.alertAt = W.t
    e.cd = W.t
    run(world, 0.05)
    expect(e.tele?.r).toBe(GUST.width)
    expect(
      until(
        world,
        () => me.state === 'fall',
        3,
        () => (me.inv = 0)
      )
    ).toBe(true)
  })

  test('bell monk: heals the most hurt ally and wards allies (damage halved)', () => {
    const { world, W } = arena()
    const monk = spawnEnemy(W, 'bellmonk', T(12), T(3))
    const ally = spawnEnemy(W, 'falconer', T(13), T(3))
    monk.alertAt = ally.alertAt = W.t
    ally.hp = 1
    ally.stun = 1e9
    monk.healAt = W.t
    run(world, 0.1)
    expect(ally.hp).toBe(1 + MONK.heal)
    monk.ringAt = W.t
    run(world, 0.5)
    expect(ally.ward).toBeGreaterThan(W.t)
    expect(world.view().enemies.find((q) => q.id === ally.id)?.ward).toBeGreaterThan(W.t)
    const hp = ally.hp
    hitEnemy(W, ally, { slot: 0, dmg: 2, kb: 0, sx: ally.x - 10, sy: ally.y })
    expect(hp - ally.hp).toBeCloseTo(1)
  })
})

describe('boss 竜騎士ヴァルク', () => {
  const map = [
    '~~~~~~~~~~~~~~~~~~~~~~',
    '~~~................~~~',
    '~~~.@..............~~~',
    '~~~................~~~',
    '~~~.......J........~~~',
    '~~~................~~~',
    '~~~................~~~',
    '~~~................~~~',
    '~~~~~~~~~~~~~~~~~~~~~~'
  ]
  function fight() {
    const r = customTower(map, {
      legend,
      rooms: [{ id: 'H', name: 'H', x: 0, y: 0, w: 22, h: 9, objective: '', boss: true }]
    })
    run(r.world, 0.1)
    return { ...r, b: r.W.boss! }
  }

  test('flying: melee clangs off, shots hit at ×0.5; the tornado pulls him down (5 s) and he is wary after', () => {
    const { world, W, b } = fight()
    expect(b.active).toBe(true)
    expect(world.view().boss!.z).toBeGreaterThan(60)
    const o = { slot: 0, dmg: 4, kb: 0, sx: b.x - 40, sy: b.y }
    expect(hitValk(W, b, o)).toBe('blocked')
    expect(hitValk(W, b, { ...o, ranged: true })).toBe('hit')
    expect(VALK.hp - b.hp).toBeCloseTo(4 * VALK.flyMul * VALK.armorMul)
    pullDown(W, b.x, b.y, 100)
    expect(b.act).toBe('downed')
    expect(b.breaks).toBe(1)
    expect(world.view().boss!.anim).toBe('downed')
    expect(world.view().boss!.z).toBe(0)
    const hp = b.hp
    expect(hitValk(W, b, o)).toBe('hit')
    expect(hp - b.hp).toBeCloseTo(4 * VALK.armorMul * VALK.downMul)
    run(world, VALK.downTime + 0.1)
    expect(b.act).toBe('fly')
    pullDown(W, b.x, b.y, 100)
    expect(b.breaks).toBe(1)
  })

  test('dives and breath are telegraphed, breath shoots fire_breath puffs; phase 2 dives twice; anim keys exist', () => {
    const { world, W, b } = fight()
    for (const h of W.heroes) h.inv = 1e9
    b.hp = b.maxHp * 0.4
    const keys = new Set<string>()
    let dives = 0
    let last = ''
    let puffs = false
    run(world, 16, () => {
      const v = world.view()
      if (v.boss?.animKey) keys.add(v.boss.animKey)
      if (b.act === 'divewind' && last !== 'divewind') {
        dives++
        expect(b.tele[0]?.kind).toBe('line')
      }
      if (b.act === 'breathwind') expect(b.tele[0]?.kind).toBe('cone')
      if (v.shots.some((s) => s.kind === 'fire_breath')) puffs = true
      last = b.act
    })
    expect(dives).toBeGreaterThanOrEqual(2)
    expect(puffs).toBe(true)
    for (const k of keys) expect(BOSS_SPEC.valk[k], k).toBeDefined()
  })
})
