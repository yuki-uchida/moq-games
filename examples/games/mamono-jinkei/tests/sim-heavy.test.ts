import { describe, expect, test } from 'vitest'
import type { LegendEntry } from '../src/sim/stage-data'
import { T, Pad, ctrlHero, customWorld, hero, part, place, run, until, walkTo } from './sim-helpers'

const legend: Record<string, LegendEntry> = {
  B: { tile: 'grass', ent: { type: 'prop', kind: 'block', id: 'block', weight: 2 } },
  O: { tile: 'grass', multi: true, ent: { type: 'prop', kind: 'boulder', id: 'boulder', weight: 4 } },
  A: { tile: 'grass', ent: { type: 'prop', kind: 'acorn', id: 'acorn', weight: 3 } },
  U: { tile: 'grass', multi: true, ent: { type: 'prop', kind: 'pedestal', id: 'ped', accepts: 'acorn' } },
  p: { tile: 'grass', ent: { type: 'prop', kind: 'pot', id: 'pot', drop: ['gem'] } }
}

describe('push (DESIGN §8)', () => {
  const map = [
    '############',
    '#..........#',
    '#.@........#',
    '#..........#',
    '#...B......#',
    '#..........#',
    '#...~......#',
    '#..........#',
    '#..........#',
    '############'
  ]

  test('one hero cannot push a weight-2 block; a formation can, and it sinks into water', () => {
    const { world, W } = customWorld(map, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    pad.mode() // companions stay
    run(world, 0.1)
    W.heroes
      .filter((h) => h !== me)
      .forEach((h, i) => (place(h, T(9), T(2 + i)), (h.anchor = { x: T(9), y: T(2 + i) })))
    place(me, T(4), T(4) - 32 - 17)
    const block = part(W, 'block')
    run(world, 2, () => pad.move(0, 1))
    expect(block.x).toBe(T(4))
    expect(block.y).toBe(T(4))
    expect(block.strength).toBe(1)
    expect(world.view().props.find((q) => q.id === block.id)?.strength).toBe(1)
    expect(me.state).toBe('push')
    // Companions follow again and push with the owner.
    pad.move(0, 0).mode()
    run(world, 0.1)
    W.heroes.filter((h) => h !== me).forEach((h, i) => place(h, T(4) + (i - 1) * 30, T(3) - 40))
    expect(
      until(
        world,
        () => block.y >= T(5),
        3,
        () => pad.move(0, 1)
      )
    ).toBe(true)
    expect(block.strength).toBeGreaterThanOrEqual(2)
    // Keep pushing into the water: it sinks and fills the tile.
    expect(
      until(
        world,
        () => block.gone,
        4,
        () => pad.move(0, 1)
      )
    ).toBe(true)
    const g = W.grid!
    expect(g.walk[g.idx(4, 6)]).toBe(1)
    expect(world.view().fills).toContain(g.idx(4, 6))
    expect(world.view().gone).toContain(block.id)
  })

  test('a weight-4 boulder needs a formation of four', () => {
    const boulderMap = [
      '############',
      '#..........#',
      '#.@........#',
      '#..........#',
      '#...OO.....#',
      '#...OO.....#',
      '#..........#',
      '#..........#',
      '############'
    ]
    const { world, W } = customWorld(boulderMap, { legend }, ['host', 'guest'])
    const pad = new Pad(world)
    const guest = new Pad(world, 'guest')
    const me = ctrlHero(W)
    const other = ctrlHero(W, 'guest')
    expect(other.slot).toBe(1)
    const b = part(W, 'boulder')
    const y0 = b.y
    // The host and its companion push; the guest's two heroes wait (stay) far away.
    const guestComp = hero(W, 3)
    expect(guestComp.owner).toBe('guest')
    guest.mode()
    run(world, 0.05)
    place(other, T(10), T(7))
    place(guestComp, T(10), T(6))
    guestComp.anchor = { x: T(10), y: T(6) }
    place(me, T(4) + 32, T(4) - 17 - 32)
    run(world, 2, () => pad.move(0, 1))
    expect(b.y).toBe(y0)
    expect(b.strength).toBe(2)
    // The guest joins: three is still not enough.
    place(other, T(4) + 32, T(3) - 40)
    run(world, 2, () => (pad.move(0, 1), guest.move(0, 1)))
    expect(b.y).toBe(y0)
    expect(b.strength).toBe(3)
    // The guest's companion follows again: four push it.
    guest.mode()
    place(guestComp, T(4) + 60, T(3) - 30)
    expect(
      until(
        world,
        () => b.y > y0,
        3,
        () => (pad.move(0, 1), guest.move(0, 1))
      )
    ).toBe(true)
    expect(b.strength).toBe(4)
  })
})

describe('grip, carry and pedestal', () => {
  const map = [
    '##############',
    '#............#',
    '#.@..........#',
    '#............#',
    '#...A........#',
    '#............#',
    '#............#',
    '#.........UU.#',
    '#............#',
    '##############'
  ]

  test('grips lift at weight 3, carriers slow down, release drops, delivery triggers the pedestal', () => {
    const { world, W } = customWorld(map, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    const acorn = part(W, 'acorn')
    place(me, T(4), T(3) + 10)
    W.heroes.filter((h) => h !== me).forEach((h, i) => place(h, T(3 + i), T(2)))
    run(world, 0.1)
    pad.interact()
    run(world, 0.1)
    expect(me.state).toBe('grip')
    expect(acorn.grips).toEqual([me.slot])
    expect(acorn.state).toBe('idle')
    expect(world.view().props.find((p) => p.id === acorn.id)?.state).toBe('gripped')
    // Follow companions grip too.
    expect(until(world, () => acorn.state === 'lifted', 4)).toBe(true)
    expect(acorn.grips.length).toBeGreaterThanOrEqual(3)
    expect(me.state).toBe('carry')
    expect(world.view().heroes.find((h) => h.slot === me.slot)?.speed).toBe(0.6)
    // Carry a little and release: it drops on a tile centre.
    run(world, 0.8, () => pad.move(1, 0))
    pad.move(0, 0)
    const xMoved = acorn.x
    expect(xMoved).toBeGreaterThan(T(4) + 40)
    pad.interact()
    run(world, 0.2)
    expect(acorn.state).toBe('idle')
    expect(acorn.grips.length).toBe(0)
    expect((acorn.x - 32) % 64).toBe(0)
    expect(W.heroes.every((h) => h.hold === undefined)).toBe(true)
    // Grip again and carry onto the pedestal.
    const ped = part(W, 'ped')
    walkTo(world, pad, me, acorn.x - 50, acorn.y, 4)
    pad.move(0, 0).interact()
    expect(until(world, () => acorn.state === 'lifted', 4)).toBe(true)
    expect(
      until(
        world,
        () => ped.on,
        12,
        () => {
          const dx = ped.x - acorn.x
          const dy = ped.y - acorn.y
          const d = Math.hypot(dx, dy)
          pad.move(dx / d, dy / d)
        }
      )
    ).toBe(true)
    expect(acorn.delivered).toBe(true)
    expect(ped.state).toBe('on')
  })

  test('pots: lift with E, throw with click, break and drop', () => {
    const { world, W } = customWorld(['#########', '#.......#', '#.@.p...#', '#.......#', '#########'], { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    pad.mode()
    const pot = part(W, 'pot')
    place(me, T(3), T(2))
    me.body.facing = 0
    run(world, 0.05)
    pad.interact()
    run(world, 0.1)
    expect(pot.state).toBe('lifted')
    expect(me.hold).toBe(pot.id)
    run(world, 0.3, () => pad.move(-1, 0))
    pad.move(0, 0)
    expect(pot.x).toBeCloseTo(me.body.x, 0)
    pad
      .aim(Math.PI / 2)
      .attack()
      .release()
    run(world, 0.05)
    expect(world.view().shots.some((s) => s.kind === 'pot' && s.prop === 'pot')).toBe(true)
    run(world, 1)
    expect(pot.gone).toBe(true)
    expect(W.pickups.some((p) => p.kind === 'gem') || W.party.gems > 0).toBe(true)
  })
})
