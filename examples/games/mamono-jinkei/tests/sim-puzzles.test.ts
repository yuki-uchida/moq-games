import { describe, expect, test } from 'vitest'
import { hitProp } from '../src/sim/props'
import type { LegendEntry } from '../src/sim/stage-data'
import type { WorldState } from '../src/sim/state'
import { JUMBO } from '../src/sim/tables'
import { spawnEnemy } from '../src/sim/enemies'
import { T, Pad, ctrlHero, customWorld, hero, part, place, run, until, walkTo } from './sim-helpers'

const legend: Record<string, LegendEntry> = {
  '1': { tile: 'grass', ent: { type: 'prop', kind: 'plate', id: 'p1' } },
  '2': { tile: 'grass', ent: { type: 'prop', kind: 'plate', id: 'p2' } },
  L: { tile: 'grass', ent: { type: 'prop', kind: 'lever', id: 'lever' } },
  D: {
    tile: 'grass',
    ent: {
      type: 'prop',
      kind: 'gate',
      id: 'gate',
      cond: { any: [{ all: [{ on: 'p1' }, { on: 'p2' }] }, { on: 'lever' }] }
    }
  },
  c: { tile: 'grass', ent: { type: 'prop', kind: 'crystal', id: 'c', group: 'G' } },
  X: { tile: 'grass', multi: true, ent: { type: 'prop', kind: 'crackrock', id: 'rock' } },
  M: { tile: 'grass', multi: true, ent: { type: 'prop', kind: 'bigplate', id: 'big' } },
  C: { tile: 'grass', ent: { type: 'prop', kind: 'chest', id: 'chest', cond: { on: 'big' }, drop: ['bigheart'] } }
}

/** Stay mode for the host's companions, all parked in a far corner. */
function park(W: WorldState, pad: Pad, world: Parameters<typeof run>[0], keep: number[] = []): void {
  pad.mode()
  run(world, 0.05)
  const me = ctrlHero(W)
  W.heroes
    .filter((h) => h !== me && !keep.includes(h.slot))
    .forEach((h, i) => {
      place(h, T(1 + i), T(1))
      h.anchor = { x: T(1 + i), y: T(1) }
    })
}

describe('plates and gates', () => {
  const map = [
    '##############',
    '#............#',
    '#.@..........#',
    '#1....2......#',
    '######D#######',
    '#.......L....#',
    '##############'
  ]

  test('the gate opens only while both plates are pressed; the lever latches it', () => {
    const { world, W } = customWorld(map, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    park(W, pad, world)
    const gate = part(W, 'gate')
    const p1 = part(W, 'p1')
    place(me, T(1), T(3))
    run(world, 0.2)
    expect(p1.state).toBe('on')
    expect(gate.state).toBe('closed')
    // A staying companion on the other plate.
    const c = hero(W, 1)
    place(c, T(6), T(3))
    c.anchor = { x: T(6), y: T(3) }
    run(world, 0.6)
    expect(part(W, 'p2').on).toBe(true)
    expect(gate.state).toBe('open')
    expect(world.view().events.some((e) => e.k === 'solve')).toBe(true)
    // Leaving a plate closes it again.
    place(me, T(3), T(2))
    run(world, 0.2)
    expect(p1.state).toBe('off')
    expect(gate.state).toBe('closed')
    // Hold both, walk a second hero through and pull the lever: latched.
    place(me, T(1), T(3))
    run(world, 0.6)
    expect(gate.state).toBe('open')
    pad.tab()
    run(world, 0.05)
    const runner = ctrlHero(W)
    expect(runner.slot).not.toBe(me.slot)
    place(runner, T(6), T(2))
    expect(walkTo(world, pad, runner, T(6), T(5), 5)).toBe(true)
    expect(walkTo(world, pad, runner, T(8) - 50, T(5), 5)).toBe(true)
    pad.move(0, 0).interact()
    run(world, 0.5)
    expect(part(W, 'lever').state).toBe('on')
    place(me, T(3), T(1))
    place(c, T(9), T(2))
    c.anchor = { x: T(9), y: T(2) }
    run(world, 0.5)
    expect(p1.on || part(W, 'p2').on).toBe(false)
    expect(gate.state).toBe('open')
  })
})

describe('crystals', () => {
  const map = [
    '##############',
    '#............#',
    '#.@..........#',
    '#.c..c..c..c.#',
    '#............#',
    '##############'
  ]

  test('all crystals hit within 1.5 s solve the group; slower hits time out', () => {
    const { world, W } = customWorld(map, { legend })
    const pad = new Pad(world)
    park(W, pad, world)
    const cr = W.props.filter((p) => p.kind === 'crystal')
    expect(cr.length).toBe(4)
    for (const p of cr.slice(0, 3)) hitProp(W, p, 0, false)
    expect(cr[0].state).toBe('hit')
    run(world, 0.3)
    expect(cr[0].state).toBe('on')
    run(world, 1.4)
    hitProp(W, cr[3], 0, false)
    expect(W.flags.has('crystals:G')).toBe(false)
    expect(cr[0].on).toBe(false)
    expect(cr[0].state).toBe('off')
    run(world, 2)
    // A real sword slash hits one; the rest within the window.
    const me = ctrlHero(W)
    expect(me.job).toBe('sword')
    place(me, cr[0].x, cr[0].y + 50)
    pad.aim(-Math.PI / 2).tap()
    run(world, 0.1)
    expect(cr[0].on).toBe(true)
    run(world, 0.5)
    for (const p of cr.slice(1)) hitProp(W, p, 1, false)
    expect(W.flags.has('crystals:G')).toBe(true)
    run(world, 3)
    expect(cr.every((p) => p.state === 'on')).toBe(true)
  })
})

describe('ジャンボ・プレス (jumbo)', () => {
  const map = [
    '##################',
    '#................#',
    '#.@..............#',
    '#................#',
    '#................#',
    '#................#',
    '#................#',
    '#................#',
    '#................#',
    '#................#',
    '##################'
  ]

  function pressWith(slots: number[]): { W: WorldState; dmgAt: (d: number) => number; tier: number } {
    const { world, W } = customWorld(map, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    park(W, pad, world, slots)
    const cx = T(8)
    const cy = T(3)
    place(me, cx, cy)
    slots
      .filter((s) => s !== me.slot)
      .forEach((s, i) => {
        const h = hero(W, s)
        place(h, cx + (i - 1) * 40, cy - 30)
        h.anchor = { x: h.body.x, y: h.body.y }
      })
    pad.aim(Math.PI / 2, 4 * 64).attack()
    run(world, 1.0)
    expect(me.charging).toBe(true)
    pad.release()
    run(world, 0.05)
    expect(W.techs.length).toBe(1)
    const tier = W.techs[0].tier
    // Dummies at increasing distances from the landing point (4 tiles south of the centroid).
    const land = { x: W.techs[0].tx, y: W.techs[0].ty }
    expect(land.y - W.techs[0].cy).toBeCloseTo(4 * 64, 0)
    const dummies = [40, 80, 100, 110, 130, 140, 160].map((d) => {
      const e = spawnEnemy(W, 'rookie', land.x + d, land.y)
      e.hp = e.maxHp = 100
      e.stun = 1e9
      return { d, e }
    })
    const tv = world.view().techs[0]
    expect(tv.kind).toBe('jumbo')
    expect(tv.stage).toBe('form')
    expect(W.heroes.filter((h) => slots.includes(h.slot)).every((h) => h.state === 'tech')).toBe(true)
    run(world, JUMBO.form + 0.05)
    expect(world.view().techs[0].stage).toBe('jump')
    run(world, JUMBO.jump)
    expect(world.view().techs[0].stage).toBe('land')
    expect(until(world, () => W.techs.length === 0, JUMBO.land + 0.1)).toBe(true)
    const dmg = new Map(dummies.map((q) => [q.d, 100 - q.e.hp]))
    for (const s of slots) {
      const h = hero(W, s)
      expect(h.state).not.toBe('tech')
      expect(h.chargeLock).toBeGreaterThan(W.t + 1.5)
      expect(h.force?.kind).toBe('warp')
    }
    return { W, tier, dmgAt: (d: number) => dmg.get(d)! }
  }

  test('tier 2: radius 90, dmg 6 (+20% with the sword)', () => {
    const r = pressWith([0, 3])
    expect(r.tier).toBe(2)
    expect(r.dmgAt(80)).toBeCloseTo(6 * 1.2, 5)
    expect(r.dmgAt(110)).toBe(0)
    expect(r.W.party.techs).toBe(1)
  })

  test('tier 3: radius 120, dmg 9, mage burst at the end', () => {
    const r = pressWith([0, 1, 3])
    expect(r.tier).toBe(3)
    expect(r.dmgAt(110)).toBeCloseTo(9 * 1.2, 5)
    expect(r.dmgAt(40)).toBeCloseTo(9 * 1.2 + 3, 5)
    expect(r.dmgAt(140)).toBe(0)
  })

  test('tier 4: radius 150, dmg 13, archer rain', () => {
    const r = pressWith([0, 1, 2, 3])
    expect(r.tier).toBe(4)
    expect(r.dmgAt(140)).toBeGreaterThan(13 * 1.2 - 0.01)
    expect(r.dmgAt(40)).toBeGreaterThan(13 * 1.2 + 3 + 2 - 0.01)
    expect(r.dmgAt(160)).toBeLessThan(13)
  })

  test('only the press breaks a crackrock and presses a big plate', () => {
    const m = [
      '##################',
      '#................#',
      '#.@..............#',
      '#.......XX.......#',
      '#.......XX.......#',
      '#................#',
      '#................#',
      '#...MM...........#',
      '#...MM.....C.....#',
      '#................#',
      '##################'
    ]
    const { world, W } = customWorld(m, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    const rock = part(W, 'rock')
    const big = part(W, 'big')
    const chest = part(W, 'chest')
    // Normal attacks do nothing to the rock.
    park(W, pad, world, [1])
    const mate = hero(W, 1)
    place(me, rock.x, rock.y + 64 + 20)
    place(mate, rock.x + 30, rock.y + 64 + 50)
    mate.anchor = { x: mate.body.x, y: mate.body.y }
    pad.aim(-Math.PI / 2).tap()
    run(world, 0.5)
    expect(rock.state).toBe('idle')
    // Press next to it.
    pad.attack()
    run(world, 1)
    pad.release()
    run(world, 1.4)
    expect(['break', 'idle']).toContain(rock.state)
    expect(rock.state === 'break' || rock.gone).toBe(true)
    run(world, 0.6)
    expect(rock.gone).toBe(true)
    expect(world.view().gone).toContain(rock.id)
    // Press onto the big plate (after the 2 s lockout).
    run(world, 2)
    place(me, big.x, big.y - 3 * 64)
    place(mate, big.x + 30, big.y - 3 * 64 - 30)
    mate.anchor = { x: mate.body.x, y: mate.body.y }
    expect(big.on).toBe(false)
    pad.aim(Math.PI / 2, 3 * 64).attack()
    run(world, 1)
    pad.release()
    expect(until(world, () => big.on, 2)).toBe(true)
    expect(big.state).toBe('on')
    expect(until(world, () => chest.state === 'open', 1)).toBe(true)
    // Standing on it no longer matters: it stays pressed.
    place(me, T(14), T(2))
    place(mate, T(14), T(3))
    mate.anchor = { x: mate.body.x, y: mate.body.y }
    run(world, 0.5)
    expect(big.on).toBe(true)
  })
})
