import { describe, expect, test } from 'vitest'
import { createWorld } from '../src/sim/api'
import { inRoom } from '../src/sim/grid'
import type { WorldImpl } from '../src/sim/world'
import { STAGE_DATA } from '../src/stages'
import { TILE, type StageId } from '../src/vocab'
import { Pad, ctrlHero, place, run, until } from './sim-helpers'

const STAGES: StageId[] = ['meadow', 'sewer', 'tower', 'forest']

/** The stage with its boss fight just started in room H and the boss door forced open. */
function bossFight(stage: StageId) {
  const world = createWorld({ seed: 5, progress: { cleared: [] }, stage, skipIntro: true }) as WorldImpl
  world.setPlayers([{ id: 'host', name: 'host' }])
  const W = world.W
  const room = STAGE_DATA[stage]!.rooms.find((r) => r.boss)!
  const door = W.props.find((p) => p.kind === 'bossdoor')!
  door.latched = true
  world.command('host', { type: 'warp', to: room.id })
  expect(until(world, () => !!W.boss?.active, 2)).toBe(true)
  expect(until(world, () => door.state === 'open', 2)).toBe(true)
  const inside = (x: number, y: number) => inRoom(room, x, y)
  return { world, W, room, door, inside }
}

describe('a boss fight is contained in its room', () => {
  for (const stage of STAGES) {
    test(`${stage}: walking out of the open boss door keeps the party and the boss inside`, () => {
      const { world, W, room, door, inside } = bossFight(stage)
      expect(world.view().barrier).toEqual([room.id])
      const me = ctrlHero(W)
      place(me, door.x, door.y - 1.5 * TILE)
      const pad = new Pad(world)
      pad.move(0, 1)
      let bossOut = false
      run(world, 2.5, () => {
        if (!inside(W.boss!.x, W.boss!.y)) bossOut = true
      })
      pad.move(0, 0)
      run(world, 0.2)
      expect(inside(me.body.x, me.body.y), 'controlled hero').toBe(true)
      for (const h of W.heroes) expect(inside(h.body.x, h.body.y), `hero ${h.slot}`).toBe(true)
      expect(bossOut).toBe(false)
      expect(W.boss!.active).toBe(true)
    })

    test(`${stage}: the boss is put back if carried out; a party carried out is pulled back without a reset`, () => {
      const { world, W, door, inside } = bossFight(stage)
      const b = W.boss!
      const hp = (b.hp = b.maxHp - 1)
      b.x = door.x
      b.y = door.y + 2 * TILE
      run(world, 0.1)
      expect(inside(b.x, b.y)).toBe(true)
      // As if by a glitch: every hero ends up south of the door.
      W.heroes.forEach((h, i) => place(h, door.x + (i - 1.5) * TILE, door.y + 3 * TILE))
      expect(until(world, () => W.heroes.every((h) => h.state === 'down' || inside(h.body.x, h.body.y)), 1.6)).toBe(
        true
      )
      expect(b.active).toBe(true)
      expect(b.hp).toBeLessThanOrEqual(hp)
    })

    test(`${stage}: the barrier drops once the boss is dead, and on a wipe`, () => {
      const a = bossFight(stage)
      a.W.boss!.hp = 0
      expect(until(a.world, () => !!a.W.boss!.dead, 10)).toBe(true)
      run(a.world, 0.1)
      expect(a.world.view().barrier).toBeUndefined()
      expect(a.W.grid!.barrierKey).toBe('')

      const b = bossFight(stage)
      for (const h of b.W.heroes) h.state = 'down'
      expect(until(b.world, () => b.W.phase === 'wipe', 1)).toBe(true)
      expect(until(b.world, () => b.W.phase === 'play', 10)).toBe(true)
      expect(b.W.boss!.active).toBe(false)
      expect(b.world.view().barrier).toBeUndefined()
    })
  }

  test('tower: flying out over the boss door keeps the crows inside', () => {
    const { world, W, door, inside } = bossFight('tower')
    const me = ctrlHero(W)
    place(me, door.x, door.y - 1.5 * TILE)
    const pad = new Pad(world)
    pad.move(0, 1)
    pad.state.actionHeld = true
    pad.jump()
    let far = me.body.y
    run(world, 1.2, () => (far = Math.max(far, me.body.y)))
    pad.state.actionHeld = false
    pad.move(0, 0)
    run(world, 0.8)
    expect(far).toBeLessThan(door.y - TILE / 2)
    for (const h of W.heroes) expect(inside(h.body.x, h.body.y), `hero ${h.slot}`).toBe(true)
  })
})
