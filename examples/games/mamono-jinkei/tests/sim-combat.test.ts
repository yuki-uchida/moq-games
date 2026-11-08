import { describe, expect, test } from 'vitest'
import { hitBoss, hitEnemy, hurtHero } from '../src/sim/combat'
import { spawnEnemy } from '../src/sim/enemies'
import type { LegendEntry } from '../src/sim/stage-data'
import { GARUD } from '../src/sim/tables'
import { BOSS_SPEC } from '../src/art/contract'
import { T, Pad, ctrlHero, customWorld, hero, meadowWorld, part, place, run, until } from './sim-helpers'

const legend: Record<string, LegendEntry> = {
  J: { tile: 'grass', ent: { type: 'boss', kind: 'garud' } },
  K: { tile: 'grass', ent: { type: 'checkpoint' } },
  L: { tile: 'grass', ent: { type: 'prop', kind: 'lever', id: 'lever' } }
}
const open = [
  '##################',
  '#................#',
  '#.@..............#',
  '#................#',
  '#................#',
  '#................#',
  '#................#',
  '##################'
]

describe('shield bearers', () => {
  test('the front 120° blocks, the back and techniques get through', () => {
    const { world, W } = customWorld(open, { legend })
    const pad = new Pad(world)
    pad.mode()
    run(world, 0.05)
    const e = spawnEnemy(W, 'shieldman', T(10), T(4))
    e.facing = 0
    const hp = e.hp
    const o = { slot: 0, dmg: 2, kb: 0 }
    expect(hitEnemy(W, e, { ...o, sx: e.x + 50, sy: e.y + 20 })).toBe('blocked')
    expect(e.hp).toBe(hp)
    expect(world.view().events.some((ev) => ev.k === 'clang')).toBe(true)
    expect(world.view().events.some((ev) => ev.k === 'sfx' && ev.s === 'guardClang')).toBe(true)
    expect(hitEnemy(W, e, { ...o, sx: e.x - 50, sy: e.y })).toBe('hit')
    expect(e.hp).toBe(hp - 2)
    // A technique hit breaks the guard for 3 s.
    expect(hitEnemy(W, e, { ...o, sx: e.x + 50, sy: e.y, tech: true })).toBe('hit')
    expect(e.guardOff).toBeCloseTo(W.t + 3)
    e.stun = 0
    expect(hitEnemy(W, e, { ...o, dmg: 0.5, sx: e.x + 50, sy: e.y })).toBe('hit')
    W.t += 3.1
    expect(hitEnemy(W, e, { ...o, dmg: 0.5, sx: e.x + 50, sy: e.y })).toBe('blocked')
  })

  test('a real slash from the front clangs; from behind it hurts', () => {
    const { world, W } = customWorld(open, { legend })
    const pad = new Pad(world)
    pad.mode()
    run(world, 0.05)
    const me = ctrlHero(W)
    W.heroes
      .filter((h) => h !== me)
      .forEach((h, i) => ((h.anchor = { x: T(1 + i), y: T(6) }), place(h, T(1 + i), T(6))))
    const e = spawnEnemy(W, 'shieldman', T(8), T(3))
    place(me, e.x + 48, e.y)
    run(world, 1)
    expect(Math.abs(e.facing)).toBeLessThan(0.3)
    const hp = e.hp
    place(me, e.x + 48, e.y)
    pad.aim(Math.PI).tap()
    run(world, 0.05)
    expect(e.hp).toBe(hp)
    // Behind it while it still faces the other way.
    e.facing = 0
    e.stun = 0
    place(me, e.x - 40, e.y)
    me.atkReady = 0
    pad.aim(0).tap()
    run(world, 1 / 60)
    expect(e.hp).toBeLessThan(hp)
  })
})

describe('boss ガルド', () => {
  test('frontal guard, technique guard break (×1.5 for 5 s), wall-hit stun and animation names', () => {
    const map = [
      '##################',
      '#................#',
      '#.@..............#',
      '#................#',
      '#.........J......#',
      '#................#',
      '##################'
    ]
    const { world, W } = customWorld(map, {
      legend,
      rooms: [{ id: 'H', name: 'ボス', x: 0, y: 0, w: 18, h: 7, objective: '', boss: true }]
    })
    const pad = new Pad(world)
    pad.mode()
    run(world, 0.1)
    const b = W.boss!
    expect(b.active).toBe(true)
    expect(world.view().events.some((e) => e.k === 'banner' && e.s === '盾騎士団長ガルド')).toBe(true)
    b.facing = 0
    b.cd = 1e9
    const o = { slot: 0, dmg: 4, kb: 0 }
    const armor = GARUD.armorMul
    // Front 140°: blocked.
    expect(hitBoss(W, b, { ...o, sx: b.x + 80, sy: b.y + 30 })).toBe('blocked')
    expect(b.hp).toBe(GARUD.hp)
    // Back: full (armoured) damage; side: halved.
    expect(hitBoss(W, b, { ...o, sx: b.x - 80, sy: b.y })).toBe('hit')
    expect(b.hp).toBeCloseTo(GARUD.hp - 4 * armor)
    let hp = b.hp
    expect(hitBoss(W, b, { ...o, sx: b.x, sy: b.y + 80 })).toBe('hit')
    expect(hp - b.hp).toBeCloseTo(4 * armor * GARUD.sideMul)
    // A technique: full damage and a 4 s guard break.
    hp = b.hp
    expect(hitBoss(W, b, { ...o, dmg: 9, sx: b.x + 80, sy: b.y, tech: true })).toBe('hit')
    expect(hp - b.hp).toBeCloseTo(9)
    expect(b.breaks).toBe(1)
    expect(b.broken).toBeCloseTo(W.t + GARUD.breakTime)
    expect(world.view().events.some((e) => e.k === 'banner' && e.s === 'ガードブレイク！')).toBe(true)
    // Follow-up technique hits do not count or extend the break.
    hitBoss(W, b, { ...o, dmg: 3, sx: b.x + 80, sy: b.y, tech: true })
    expect(b.breaks).toBe(1)
    const v = world.view().boss!
    expect(v.guard).toBe(false)
    expect(v.anim).toBe('broken')
    expect(v.broken).toBeGreaterThan(v.st)
    hp = b.hp
    expect(hitBoss(W, b, { ...o, sx: b.x + 80, sy: b.y })).toBe('hit')
    expect(hp - b.hp).toBeCloseTo(4 * armor * GARUD.brokenMul)
    run(world, GARUD.breakTime + 0.2)
    expect(world.view().boss!.guard).toBe(true)
    // 鉄壁 afterwards: techniques do reduced damage and cannot break the guard.
    expect(world.view().boss!.steel).toBeGreaterThan(W.t + GARUD.steelTime - 1)
    hp = b.hp
    hitBoss(W, b, { ...o, dmg: 10, sx: b.x + 80, sy: b.y, tech: true })
    expect(hp - b.hp).toBeCloseTo(10 * GARUD.steelTechMul)
    expect(b.breaks).toBe(1)
    expect(b.broken).toBeLessThan(W.t)
    b.steel = 0
    // Charge into a wall: 2 s broken.
    b.act = 'charge'
    b.aimA = 0
    b.chargeLeft = 1000
    run(world, 1.5)
    expect(b.act).toBe('broken')
    expect(b.broken).toBeGreaterThan(W.t)
    // Every animation key the view uses exists in the art contract.
    const keys = new Set<string>()
    b.act = 'idle'
    b.cd = 0
    b.broken = 0
    run(world, 20, () => {
      const k = world.view().boss?.animKey
      if (k) keys.add(k)
    })
    for (const k of keys) expect(BOSS_SPEC.garud[k], k).toBeDefined()
    expect(keys.size).toBeGreaterThan(2)
  })

  test('calls reinforcements at 50% and the orb appears after the defeat', () => {
    const map = [
      '##################',
      '#................#',
      '#.@..............#',
      '#................#',
      '#.........J......#',
      '#................#',
      '##################'
    ]
    const { world, W } = customWorld(map, {
      legend: { ...legend, V: { tile: 'grass', multi: true, ent: { type: 'decor', kind: 'altar', solid: false } } },
      rooms: [{ id: 'H', name: 'ボス', x: 0, y: 0, w: 18, h: 7, objective: '', boss: true }]
    })
    run(world, 0.1)
    const b = W.boss!
    b.hp = b.maxHp * 0.5
    b.cd = 0
    expect(until(world, () => W.enemies.length >= 3, 3)).toBe(true)
    expect(W.enemies.filter((e) => e.kind === 'rookie').length).toBe(2)
    expect(W.enemies.filter((e) => e.kind === 'bowman').length).toBe(1)
    b.hp = 0
    expect(until(world, () => W.pickups.some((p) => p.kind === 'orb'), 3)).toBe(true)
  })
})

describe('boss phase 2 and stage-1 enemies', () => {
  const map = [
    '##################',
    '#................#',
    '#.@..............#',
    '#................#',
    '#.........J......#',
    '#................#',
    '##################'
  ]

  test('below 50% HP: telegraphed faster charges and a double sweep', () => {
    const { world, W } = customWorld(map, {
      legend,
      rooms: [{ id: 'H', name: 'ボス', x: 0, y: 0, w: 18, h: 7, objective: '', boss: true }]
    })
    const pad = new Pad(world)
    pad.mode()
    run(world, 0.1)
    const b = W.boss!
    b.hp = b.maxHp * 0.45
    b.calls = 2
    const me = ctrlHero(W)
    W.heroes
      .filter((h) => h !== me)
      .forEach((h, i) => ((h.anchor = { x: T(1 + i), y: T(1) }), place(h, T(1 + i), T(1))))
    // Close: sweep, then a second telegraphed sweep.
    place(me, b.x + 100, b.y)
    me.inv = 1e9
    b.cd = 0
    b.act = 'idle'
    const windups: string[] = []
    run(world, 2.5, () => {
      if (b.act === 'windup' && b.tele.length && windups[windups.length - 1] !== b.tele[0].kind + b.tele[0].from)
        windups.push(b.tele[0].kind + b.tele[0].from)
      place(me, b.x + 100, b.y)
    })
    expect(b.phase).toBe(2)
    expect(windups.filter((w) => w.startsWith('cone')).length).toBeGreaterThanOrEqual(2)
    // Far: a shield charge with a shorter (still telegraphed) windup.
    for (let i = 0; i < 400 && !(b.act === 'windup' && b.next === 'charge'); i++) {
      place(me, T(16), T(1))
      if (b.act === 'idle' || b.act === 'walk') b.cd = Math.min(b.cd, W.t)
      if (b.act === 'slam' || b.act === 'sweep') b.cd = 0
      world.step(1 / 60)
    }
    expect(b.next).toBe('charge')
    expect(b.tele[0].kind).toBe('line')
    expect(b.tele[0].until - b.tele[0].from).toBeCloseTo(GARUD.p2ChargeWindup)
  })

  test('arena waves hurt a careless party, always after a telegraph', () => {
    const { world, W } = meadowWorld()
    const pad = new Pad(world)
    world.command('host', { type: 'warp', to: 'C' })
    pad.mode()
    run(world, 0.2)
    expect(W.arenas.get('C')?.state).toBe('active')
    const hp0 = W.heroes.reduce((n, h) => n + h.hp, 0)
    const teles = new Set<string>()
    let untelegraphed = 0
    const lastTele = new Map<number, number>()
    run(world, 12, () => {
      for (const e of W.enemies) if (e.tele) teles.add(e.tele.kind), lastTele.set(e.id, W.t)
      for (const ev of world.view().events)
        if (
          ev.k === 'hit' &&
          ev.s === 'hero' &&
          ev.t === Math.round(W.t * 100) / 100 &&
          ![...lastTele.values()].some((t) => W.t - t < 1.5)
        )
          untelegraphed++
    })
    const lost = hp0 - W.heroes.reduce((n, h) => n + h.hp, 0)
    expect(lost).toBeGreaterThanOrEqual(4)
    // Melee windups (cone), aim lines and caster circles all show before they land.
    expect(teles.size).toBeGreaterThanOrEqual(2)
    expect(teles.has('line')).toBe(true)
    expect(untelegraphed).toBe(0)
  })
})

describe('downs, revives, wipes and checkpoints', () => {
  const map = [
    '####################',
    '#........#.........#',
    '#.@................#',
    '#........#....K..L.#',
    '####################'
  ]
  const rooms = [
    { id: 'A', name: 'A', x: 0, y: 0, w: 9, h: 5, objective: '' },
    { id: 'B', name: 'B', x: 9, y: 0, w: 11, h: 5, objective: '' }
  ]

  test('allies revive a downed hero; alone it revives after 12 s; everyone down wipes to the checkpoint', () => {
    const { world, W } = customWorld(map, { legend, rooms })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    pad.mode()
    run(world, 0.05)
    const a = hero(W, 1)
    place(a, T(3), T(1))
    a.anchor = { x: T(3), y: T(1) }
    hurtHero(W, a, 99, a.body.x + 10, a.body.y)
    expect(a.state).toBe('down')
    place(me, a.body.x + 20, a.body.y)
    run(world, 1.6)
    expect(a.state).not.toBe('down')
    expect(a.hp).toBe(4)
    // Alone: 12 s.
    place(me, T(7), T(3))
    a.inv = 0
    hurtHero(W, a, 99, a.body.x + 10, a.body.y)
    run(world, 11.5)
    expect(a.state).toBe('down')
    run(world, 0.7)
    expect(a.state).not.toBe('down')
    expect(a.hp).toBe(2)
    // Reach the checkpoint in room B and pull the lever (latched).
    place(me, T(14), T(2))
    run(world, 0.1)
    expect(W.checkpoint).toBe('B')
    place(me, T(17) - 50, T(3))
    pad.interact()
    run(world, 0.5)
    expect(part(W, 'lever').on).toBe(true)
    // Wipe.
    for (const h of W.heroes) (h.inv = 0), hurtHero(W, h, 99, h.body.x + 5, h.body.y)
    run(world, 0.05)
    expect(W.phase).toBe('wipe')
    run(world, 2.1)
    expect(W.phase).toBe('play')
    expect(W.party.wipes).toBe(1)
    for (const h of W.heroes) {
      expect(h.hp).toBe(h.maxHp)
      expect(Math.hypot(h.body.x - T(14), h.body.y - T(3))).toBeLessThan(100)
      expect(h.force?.kind).toBe('warp')
    }
    expect(part(W, 'lever').on).toBe(true)
  })

  test('falling into water: 0.6 s, back on the last safe tile, −2 HP', () => {
    const { world, W } = customWorld(['##########', '#........#', '#.@..~~~.#', '#........#', '##########'], { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    pad.mode()
    run(world, 0.05)
    place(me, T(4), T(2))
    const hp = me.hp
    pad.move(1, 0)
    run(world, 0.25)
    pad.jump()
    expect(
      until(
        world,
        () => me.state === 'fall',
        2,
        () => pad.move(1, 0)
      )
    ).toBe(true)
    pad.move(0, 0)
    run(world, 0.7)
    expect(me.state).not.toBe('fall')
    expect(me.hp).toBe(hp - 2)
    expect(Math.floor(me.body.x / 64)).toBe(4)
  })
})
