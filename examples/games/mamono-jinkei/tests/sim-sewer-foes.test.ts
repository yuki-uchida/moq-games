import { describe, expect, test } from 'vitest'
import { CAT, MILDA, hitPet } from '../src/sim/boss2'
import { finishEnemyDeath, hitBoss, hitEnemy } from '../src/sim/combat'
import { hitSnares, spawnEnemy } from '../src/sim/enemies'
import type { LegendEntry } from '../src/sim/stage-data'
import { BOMB, SNARE } from '../src/sim/tables'
import { BOSS_EXTRA_SPEC, BOSS_SPEC } from '../src/art/contract'
import { T, Pad, ctrlHero, customSewer, hero, parkCompanions, place, run, until } from './sim-helpers'

const open = [
  '####################',
  '#..................#',
  '#.@................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################'
]

function arena() {
  const r = customSewer(open)
  const pad = new Pad(r.world)
  parkCompanions(r.world, r.W, pad, [
    [1, 7],
    [2, 7],
    [3, 7]
  ])
  const me = ctrlHero(r.W)
  place(me, T(4), T(4))
  return { ...r, pad, me }
}

describe('stage-2 enemies', () => {
  test('thief: telegraphed dash, steals gems, flees; a KO returns them', () => {
    const { world, W, me } = arena()
    W.party.gems = 10
    const e = spawnEnemy(W, 'thief', T(7), T(4))
    let tele = false
    let dashed = false
    expect(
      until(
        world,
        () => W.party.gems < 10,
        6,
        () => {
          if (e.tele?.kind === 'line') tele = true
          if (world.view().enemies.find((q) => q.id === e.id)?.state === 'dash') dashed = true
          place(me, T(4), T(4))
          me.inv = 0
        }
      )
    ).toBe(true)
    expect(tele && dashed).toBe(true)
    const stolen = 10 - W.party.gems
    expect(stolen).toBeGreaterThanOrEqual(1)
    expect(stolen).toBeLessThanOrEqual(3)
    expect(e.carry).toBe(stolen)
    const d0 = Math.hypot(e.x - me.body.x, e.y - me.body.y)
    run(world, 1)
    expect(Math.hypot(e.x - me.body.x, e.y - me.body.y)).toBeGreaterThan(d0)
    e.hp = 0.5
    hitEnemy(W, e, { slot: 0, dmg: 1, kb: 0, sx: e.x - 10, sy: e.y })
    run(world, 0.6)
    expect(W.pickups.filter((p) => p.kind === 'gem').length).toBeGreaterThanOrEqual(stolen)
    void finishEnemyDeath
  })

  test('alchemist: a circle telegraph, then the bomb bursts there for 2 after its 0.8 s flight', () => {
    const { world, W, me } = arena()
    const e = spawnEnemy(W, 'alchemist', T(9), T(4))
    e.alertAt = W.t
    e.cd = W.t
    run(world, 0.05)
    expect(e.tele?.kind).toBe('circle')
    const at = { x: e.tele!.x, y: e.tele!.y }
    const hp = me.hp
    run(world, 0.45)
    expect(world.view().shots.some((s) => s.kind === 'bomb')).toBe(true)
    run(world, BOMB.flight - 0.1)
    expect(me.hp).toBe(hp)
    me.inv = 0
    place(me, at.x, at.y)
    run(world, 0.2)
    expect(me.hp).toBeLessThanOrEqual(hp - 1)
    expect(world.view().events.some((ev) => ev.k === 'fx' && ev.s === 'bomb_burst')).toBe(true)
  })

  test('rat-catcher: snares hold a hero 1.5 s; an ally hit on the snare frees them', () => {
    const { world, W, me } = arena()
    const e = spawnEnemy(W, 'ratcatcher', T(10), T(4))
    e.alertAt = W.t
    e.cd = W.t
    expect(
      until(
        world,
        () => W.snares.length > 0,
        2,
        () => place(me, T(4), T(4))
      )
    ).toBe(true)
    const sn = W.snares[0]
    e.stun = 1e9
    place(me, sn.x - 40, sn.y)
    run(world, 0.4, () => {
      me.intent.mx = 1
    })
    const pad = new Pad(world)
    run(world, 0.3, () => pad.move(1, 0))
    expect(me.snared).toBeGreaterThan(W.t)
    expect(world.view().snares?.[0].slot).toBe(me.slot)
    // An ally's hit frees them.
    hitSnares(W, sn.x, sn.y, 30, hero(W, 1).slot)
    expect(me.snared).toBe(0)
    expect(W.snares.length).toBe(0)
    // Unhelped: 1.5 s.
    W.snares.push({ id: 5, x: me.body.x + 30, y: me.body.y, st: W.t, owner: e.id, until: W.t + 20 })
    run(world, 0.4, () => pad.move(1, 0))
    expect(me.snared).toBeGreaterThan(W.t)
    run(world, SNARE.hold)
    expect(me.snared).toBeLessThan(W.t)
  })

  test('spear guard: front guard; a long thrust after a line telegraph', () => {
    const { world, W, me } = arena()
    const e = spawnEnemy(W, 'spearguard', T(6), T(4))
    e.facing = Math.PI
    const o = { slot: 0, dmg: 2, kb: 0 }
    expect(hitEnemy(W, e, { ...o, sx: e.x - 60, sy: e.y })).toBe('blocked')
    expect(hitEnemy(W, e, { ...o, sx: e.x + 60, sy: e.y })).toBe('hit')
    e.state = 'idle'
    e.alertAt = W.t
    e.cd = 0
    place(me, e.x - 80, e.y)
    const hp = me.hp
    me.inv = 0
    run(world, 0.1)
    expect(e.tele?.kind).toBe('line')
    expect(e.tele!.len).toBeGreaterThanOrEqual(80)
    run(world, 0.6)
    expect(me.hp).toBeLessThan(hp)
  })
})

describe('boss 猫使いの魔女ミルダ and her cat', () => {
  const map = [
    '######################',
    '#....................#',
    '#.@..................#',
    '#....................#',
    '#.........J..........#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '######################'
  ]
  const legend: Record<string, LegendEntry> = { J: { tile: 'sewer', ent: { type: 'boss', kind: 'milda' } } }

  function fight() {
    const r = customSewer(map, {
      legend,
      rooms: [{ id: 'H', name: 'H', x: 0, y: 0, w: 22, h: 11, objective: '', boss: true }]
    })
    const pad = new Pad(r.world)
    run(r.world, 0.1)
    return { ...r, pad, b: r.W.boss!, c: r.W.pet! }
  }

  test('the witch hovers and is untouchable while the cat is awake; a technique on the cat grounds her', () => {
    const { world, W, b, c } = fight()
    expect(b.active).toBe(true)
    const v = world.view()
    expect(v.boss?.kind).toBe('milda')
    expect(v.boss!.z).toBeGreaterThan(20)
    expect(v.bossPet?.kind).toBe('cat')
    const o = { slot: 0, dmg: 4, kb: 0, sx: b.x - 50, sy: b.y }
    expect(hitBoss(W, b, o)).toBe('blocked')
    expect(hitBoss(W, b, { ...o, tech: true })).toBe('blocked')
    expect(hitPet(W, c, o)).toBe('blocked')
    expect(b.hp).toBe(MILDA.hp)
    // The stampede hits the cat.
    expect(hitPet(W, c, { ...o, tech: true })).toBe('hit')
    expect(c.stun).toBeCloseTo(W.t + CAT.stunTime)
    expect(b.broken).toBeCloseTo(W.t + MILDA.breakTime)
    expect(b.breaks).toBe(1)
    run(world, 0.05)
    expect(world.view().boss!.z).toBe(0)
    expect(world.view().boss!.anim).toBe('broken')
    expect(world.view().bossPet!.anim).toBe('stunned')
    expect(hitBoss(W, b, o)).toBe('hit')
    expect(MILDA.hp - b.hp).toBeCloseTo(4 * MILDA.armorMul * MILDA.brokenMul)
    // After she gets up, the cat is wary: no second break right away.
    run(world, MILDA.breakTime + 0.1)
    expect(b.broken).toBeLessThan(W.t)
    expect(hitPet(W, c, { ...o, tech: true })).toBe('blocked')
    expect(b.breaks).toBe(1)
  })

  test('attacks are telegraphed; phase 2 pounces twice; hexes home in; animation keys exist', () => {
    const { world, W, b, c } = fight()
    const me = ctrlHero(W)
    for (const h of W.heroes) h.inv = 1e9
    const keys = new Set<string>()
    const petKeys = new Set<string>()
    let crouches = 0
    let lastAct = ''
    b.hp = b.maxHp * 0.45
    b.calls = 3
    run(world, 14, () => {
      const v = world.view()
      if (v.boss?.animKey) keys.add(v.boss.animKey)
      if (v.bossPet?.animKey) petKeys.add(v.bossPet.animKey)
      if (c.act === 'crouch' && lastAct !== 'crouch') {
        crouches++
        expect(c.tele[0]?.kind).toBe('line')
      }
      if (c.act === 'swipewind') expect(c.tele[0]?.kind).toBe('cone')
      if (b.act === 'cast') expect(b.tele[0]?.kind).toBe('line')
      lastAct = c.act
      place(me, c.x + 220, c.y)
    })
    expect(crouches).toBeGreaterThanOrEqual(2)
    expect(
      W.shots.some((s) => s.kind === 'hex') || keys.has('cast_side') || keys.has('cast_down') || keys.has('cast_up')
    ).toBe(true)
    for (const k of keys) expect(BOSS_SPEC.milda[k], k).toBeDefined()
    for (const k of petKeys) expect(BOSS_EXTRA_SPEC.cat[k], k).toBeDefined()
  })

  test('summons thieves at 75%; defeat → orb', () => {
    const { world, W, b } = fight()
    b.hp = b.maxHp * 0.7
    expect(until(world, () => W.enemies.filter((e) => e.kind === 'thief').length >= 2, 3)).toBe(true)
    b.broken = W.t + 5
    b.act = 'broken'
    b.hp = 0.1
    hitBoss(W, b, { slot: 0, dmg: 10, kb: 0, sx: b.x, sy: b.y + 10 })
    expect(until(world, () => b.dead, 3)).toBe(true)
    expect(until(world, () => world.view().bossPet === undefined, 3)).toBe(true)
  })
})
