import { describe, expect, test } from 'vitest'
import { createPredictor } from '../src/sim/api'
import { hurtHero } from '../src/sim/combat'
import { RAT_DASH } from '../src/sim/move'
import type { LegendEntry } from '../src/sim/stage-data'
import { DT } from '../src/sim/tables'
import { T, Pad, ctrlHero, customSewer, parkCompanions, place, run, until } from './sim-helpers'

const legend: Record<string, LegendEntry> = {
  a: { tile: 'hole', ent: { type: 'hole', pair: 'a' } },
  '>': { tile: 'current', ent: { type: 'current', channel: 'R', dx: 1, dy: 0 } },
  '{': { tile: 'current', ent: { type: 'current', channel: 'S', dx: 0, dy: 1, speed: 400, strong: true } },
  r: { tile: 'sewer', ent: { type: 'prop', kind: 'barrel' } },
  Z: { tile: 'sewer', ent: { type: 'prop', kind: 'sluice', cond: { flag: 'open' }, latch: true, stops: ['S'] } }
}

// Two rooms joined only by a mouse hole pair through a 3-thick wall.
const holes = [
  '##############',
  '#....###.....#',
  '#.@..###.....#',
  '#....a#a.....#',
  '#....###.....#',
  '##############'
]

describe('rat: チョロ走り and mouse holes (DESIGN §7)', () => {
  test('dash: ×3 speed for 0.22 s, invulnerable, 0.6 s cooldown, dash_trail', () => {
    const { world, W } = customSewer(['############', '#..........#', '#.@........#', '#..........#', '############'], {
      legend
    })
    const pad = new Pad(world)
    parkCompanions(world, W, pad)
    const me = ctrlHero(W)
    place(me, T(2), T(2))
    pad.move(1, 0).jump()
    run(world, DT)
    expect(Math.hypot(me.body.vx, me.body.vy)).toBeCloseTo(190 * RAT_DASH.mul, 0)
    expect(me.state).toBe('action')
    expect(hurtHero(W, me, 2, me.body.x + 10, me.body.y)).toBe(false)
    expect(world.view().events.some((e) => e.k === 'fx' && e.s === 'dash_trail')).toBe(true)
    run(world, 0.25)
    expect(me.state).not.toBe('action')
    // Pressing again during the cooldown does nothing.
    const x = me.body.x
    const dashT = me.body.dashT
    expect(dashT).toBeGreaterThan(RAT_DASH.time)
    pad.jump()
    run(world, DT)
    expect(me.body.dashT).toBeGreaterThan(dashT)
    expect(Math.hypot(me.body.vx, me.body.vy)).toBeLessThan(400)
    run(world, 0.5)
    pad.jump()
    run(world, DT)
    expect(Math.hypot(me.body.vx, me.body.vy)).toBeGreaterThan(400)
    expect(me.body.x).toBeGreaterThan(x)
  })

  test('dashing into a hole comes out of its partner; carrying something does not fit', () => {
    const { world, W } = customSewer(holes, {
      legend: { ...legend, r: { tile: 'sewer', ent: { type: 'prop', kind: 'barrel' } } }
    })
    const pad = new Pad(world)
    parkCompanions(world, W, pad)
    const me = ctrlHero(W)
    place(me, T(3), T(3))
    pad.move(1, 0)
    run(world, 0.3)
    pad.jump()
    run(world, 0.3)
    expect(Math.floor(me.body.x / 64)).toBeGreaterThanOrEqual(8)
    expect(world.view().events.some((e) => e.k === 'sfx' && e.s === 'ratSqueak')).toBe(true)
    // Back through, then try again with a barrel overhead.
    pad.move(-1, 0)
    run(world, 0.6)
    pad.jump()
    run(world, 0.4)
    expect(Math.floor(me.body.x / 64)).toBeLessThanOrEqual(4)
    pad.move(0, 0)
    run(world, 0.7)
    // A carried barrel: no dash at all, and no passage.
    W.props.push({
      ...W.props[0],
      id: 999,
      kind: 'barrel',
      x: me.body.x - 40,
      y: me.body.y,
      state: 'idle',
      part: undefined
    } as never)
    me.body.facing = Math.PI
    pad.interact()
    run(world, DT * 2)
    expect(me.hold).toBe(999)
    pad.move(1, 0)
    run(world, 0.4)
    pad.jump()
    run(world, 0.4)
    expect(Math.floor(me.body.x / 64)).toBeLessThanOrEqual(4)
  })

  test('companions in follow mode path through the holes after their owner', () => {
    const { world, W } = customSewer(holes, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    place(me, T(4), T(3))
    run(world, 0.5)
    pad.move(1, 0)
    run(world, 0.2)
    pad.jump()
    run(world, 0.3)
    expect(me.body.x).toBeGreaterThan(T(7))
    pad.move(1, 0)
    run(world, 0.4)
    pad.move(0, 0)
    const seq = W.heroes.map((h) => h.forceSeq)
    expect(until(world, () => W.heroes.every((h) => h.body.x > T(7)), 8)).toBe(true)
    // They used the hole (no catch-up puff warps).
    W.heroes.forEach((h, i) => h !== me && expect(h.forceSeq).toBe(seq[i]))
  })

  test('a guest predicts the hole jump and the host accepts it', () => {
    const { world, W } = customSewer(holes, { legend }, ['host', 'guest'])
    const guest = new Pad(world, 'guest')
    const host = new Pad(world)
    parkCompanions(world, W, host)
    parkCompanions(world, W, guest, [[12, 1]])
    const h = ctrlHero(W, 'guest')
    place(h, T(3), T(3))
    const pred = createPredictor(W.parsed!.info, 'guest')
    const tick = (s: number, mx: number, dash = false) => {
      for (let i = 0; i < Math.round(s / DT); i++) {
        guest.state.mx = mx
        if (dash && i === 0) guest.state.actionPresses++
        guest.send({ hero: pred.update(world.view(), guest.state, DT) })
        world.step(DT)
      }
    }
    tick(0.3, 1)
    const seq = h.forceSeq
    tick(0.4, 1, true)
    expect(Math.floor(pred.current()!.x / 64)).toBeGreaterThanOrEqual(8)
    expect(Math.floor(h.body.x / 64)).toBeGreaterThanOrEqual(8)
    expect(h.forceSeq).toBe(seq)
  })
})

describe('currents', () => {
  const map = [
    '##############',
    '#............#',
    '#.@..........#',
    '#.>>>>>>>>>>.#',
    '#.>>>>>>>>>>.#',
    '#............#',
    '#.{{{{{{{{{{Z#',
    '#............#',
    '##############'
  ]

  test('push walking heroes 120 px/s; a formation of 3+ resists; strong ones push everyone until stopped', () => {
    const { world, W } = customSewer(map, { legend })
    const pad = new Pad(world)
    parkCompanions(world, W, pad, [
      [12, 1],
      [12, 7],
      [1, 7]
    ])
    const me = ctrlHero(W)
    place(me, T(4), T(3))
    run(world, 1)
    expect(me.body.x - T(4)).toBeGreaterThan(110)
    expect(me.body.x - T(4)).toBeLessThan(130)
    // Three in formation: no drift.
    const mates = W.heroes.filter((h) => h !== me)
    place(me, T(4), T(3))
    mates
      .slice(0, 2)
      .forEach((m, i) => (place(m, T(4) + 30 * (i + 1), T(3) + 20), (m.anchor = { x: m.body.x, y: m.body.y })))
    run(world, 1)
    expect(Math.abs(me.body.x - T(4))).toBeLessThan(4)
    // The strong torrent pushes the formation too.
    place(me, T(6), T(6))
    mates
      .slice(0, 2)
      .forEach((m, i) => (place(m, T(6) + 30 * (i + 1), T(6) - 40), (m.anchor = { x: m.body.x, y: m.body.y })))
    run(world, 0.25)
    expect(me.body.y).toBeGreaterThan(T(6) + 25)
    // An open sluice stops the torrent.
    W.flags.add('open')
    expect(until(world, () => world.view().currentsOff?.includes('S') ?? false, 2)).toBe(true)
    expect(W.props.find((p) => p.kind === 'sluice')?.state).toBe('open')
    place(me, T(6), T(6))
    run(world, 0.5)
    expect(Math.abs(me.body.y - T(6))).toBeLessThan(2)
  })
})
