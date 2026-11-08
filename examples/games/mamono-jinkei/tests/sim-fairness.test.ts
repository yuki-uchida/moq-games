import { describe, expect, test } from 'vitest'
import { hitEnemy, hurtHero } from '../src/sim/combat'
import { spawnEnemy } from '../src/sim/enemies'
import { STUCK_RESET } from '../src/sim/props'
import type { LegendEntry } from '../src/sim/stage-data'
import {
  T,
  Pad,
  ctrlHero,
  customSewer,
  customTower,
  customWorld,
  meadowWorld,
  parkCompanions,
  part,
  place,
  run,
  until
} from './sim-helpers'

const legend: Record<string, LegendEntry> = {
  B: { tile: 'grass', ent: { type: 'prop', kind: 'block', id: 'block', weight: 1 } },
  c: { tile: 'sewer', ent: { type: 'prop', kind: 'crate', id: 'crate' } },
  '>': { tile: 'current', ent: { type: 'current', channel: 'R', dx: 1, dy: 0, speed: 200, strong: true } }
}

describe('no softlocks', () => {
  test('a block pushed into a corner returns to where it started', () => {
    const { world, W } = customWorld(['#########', '#.......#', '#.@..B..#', '#.......#', '#########'], { legend })
    const pad = new Pad(world)
    parkCompanions(world, W, pad, [
      [1, 1],
      [1, 3],
      [2, 3]
    ])
    const me = ctrlHero(W)
    const block = part(W, 'block')
    const home = { x: block.x, y: block.y }
    // East into the wall, then north into the corner.
    place(me, T(5) - 49, T(2))
    expect(
      until(
        world,
        () => block.x === T(7) && block.state === 'idle',
        4,
        () => pad.move(1, 0)
      )
    ).toBe(true)
    place(me, T(7), T(2) + 49)
    expect(
      until(
        world,
        () => block.y === T(1) && block.state === 'idle',
        3,
        () => pad.move(0, -1)
      )
    ).toBe(true)
    pad.move(0, 0)
    place(me, T(3), T(3))
    run(world, STUCK_RESET + 1)
    expect(block.x).toBe(home.x)
    expect(block.y).toBe(home.y)
    expect(world.view().events.some((e) => e.k === 'notice')).toBe(true)
  })

  test('a block that can still be pushed somewhere stays put', () => {
    const { world, W } = customWorld(['#########', '#.......#', '#.@..B..#', '#.......#', '#########'], { legend })
    const pad = new Pad(world)
    parkCompanions(world, W, pad)
    const me = ctrlHero(W)
    const block = part(W, 'block')
    place(me, T(5) - 49, T(2))
    expect(
      until(
        world,
        () => block.x === T(7) && block.state === 'idle',
        4,
        () => pad.move(1, 0)
      )
    ).toBe(true)
    pad.move(0, 0)
    place(me, T(3), T(3))
    run(world, STUCK_RESET + 1)
    expect(block.x).toBe(T(7))
  })

  test('after falling off a current the hero comes back on still ground, not onto the current', () => {
    const { world, W } = customSewer(
      ['##########', '#........#', '#.@......#', '#..>>>>~~#', '#........#', '##########'],
      { legend }
    )
    const pad = new Pad(world)
    parkCompanions(world, W, pad, [
      [1, 1],
      [1, 4],
      [2, 4]
    ])
    const me = ctrlHero(W)
    place(me, T(3), T(2))
    run(world, 0.45, () => pad.move(0, 1))
    expect(
      until(
        world,
        () => me.state === 'fall',
        4,
        () => pad.move(0, 0)
      )
    ).toBe(true)
    run(world, 0.8)
    const i = W.grid!.idx(Math.floor(me.body.x / 64), Math.floor(me.body.y / 64))
    expect(W.grid!.flowX[i]).toBe(0)
    run(world, 1)
    expect(me.state).not.toBe('fall')
  })
})

describe('client follow-ups', () => {
  test('a dev warp out of a running arena resets it and refreshes the objective', () => {
    const { world, W } = meadowWorld()
    world.command('host', { type: 'warp', to: 'C' })
    run(world, 0.2)
    expect(W.arenas.get('C')?.state).toBe('active')
    expect(world.view().objective).toContain('のこり')
    world.command('host', { type: 'warp', to: 'G' })
    expect(W.arenas.get('C')?.state).toBe('idle')
    expect(W.enemies.some((e) => e.room === 'C')).toBe(false)
    expect(world.view().objective).toContain('水晶')
  })

  test('damage numbers come only from hit events (no duplicate numeric pops)', () => {
    const { world, W } = customWorld(['##########', '#........#', '#.@......#', '#........#', '##########'])
    const me = ctrlHero(W)
    const e = spawnEnemy(W, 'rookie', T(5), T(2))
    hitEnemy(W, e, { slot: 0, dmg: 2, kb: 0, sx: e.x - 10, sy: e.y })
    me.inv = 0
    hurtHero(W, me, 2, me.body.x + 10, me.body.y)
    run(world, 0.05)
    const v = world.view()
    expect(v.events.filter((ev) => ev.k === 'hit').length).toBeGreaterThanOrEqual(2)
    expect(v.events.some((ev) => ev.k === 'pop' && /^[0-9.]+$/.test(ev.s ?? ''))).toBe(false)
  })

  test('crow heroes report flight stamina 0..1; other species omit it', () => {
    const { world, W } = customTower(['##########', '#........#', '#.@......#', '#........#', '##########'])
    const pad = new Pad(world)
    parkCompanions(world, W, pad)
    pad.state.actionHeld = true
    pad.send()
    run(world, 0.75)
    const v = world.view().heroes.find((h) => h.slot === ctrlHero(W).slot)!
    expect(v.stamina).toBeGreaterThan(0.4)
    expect(v.stamina).toBeLessThan(0.6)
    expect(meadowWorld().world.view().heroes[0].stamina).toBeUndefined()
  })
})
