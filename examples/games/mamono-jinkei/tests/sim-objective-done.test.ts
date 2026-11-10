import { describe, expect, test } from 'vitest'
import { createWorld } from '../src/sim/api'
import { gnawAt, lightMoonstone, techImpact } from '../src/sim/props'
import { STAGE_DATA } from '../src/stages'
import type { WorldState } from '../src/sim/state'
import { DONE_OBJECTIVE } from '../src/sim/view'
import type { WorldImpl } from '../src/sim/world'
import { STAGES, TILE, type StageId } from '../src/vocab'
import { ctrlHero, part, place, run } from './sim-helpers'

/** Solves each puzzle through the simulation's own primitives (or the flags/parts they set). */
const SOLVE: Record<string, (W: WorldState) => void> = {
  'meadow:D': (W) => {
    const lever = part(W, 'leverD')
    lever.on = lever.latched = true
  },
  'meadow:E': (W) => (part(W, 'pedestalE').on = true),
  'meadow:F': (W) => {
    const p = part(W, 'crackF')
    techImpact(W, p.x, p.y, 200)
  },
  'meadow:G': (W) => W.flags.add('crystals:G'),
  'sewer:C': (W) => W.flags.add('valves:C'),
  'sewer:E': (W) => (part(W, 'scaleE').on = true),
  'sewer:G': (W) => {
    const p = part(W, 'barricadeG')
    gnawAt(W, p.x, p.y, 200)
  },
  'forest:A': (W) => lightMoonstone(W, part(W, 'moonA')),
  'forest:D': (W) => W.flags.add('moons:D'),
  'forest:F': (W) => (part(W, 'ramslotF').on = true),
  'forest:G': (W) => (part(W, 'bigmoonG').on = true),
  'tower:C': (W) => (part(W, 'windmillC').on = true),
  'tower:E': (W) => W.flags.add('bells:E'),
  'tower:F': (W) => (part(W, 'hookF').on = true)
}

const cases = STAGES.flatMap((stage) =>
  STAGE_DATA[stage]!.rooms.filter((r) => r.done).map((r) => [stage, r.id] as const)
)

describe('the objective follows a solved puzzle', () => {
  test('every puzzle room with a done condition has a scripted solve', () => {
    expect(cases.map(([s, r]) => `${s}:${r}`).sort()).toEqual(Object.keys(SOLVE).sort())
  })

  test.each(cases)('%s room %s: the objective changes once solved', (stage: StageId, id) => {
    const world = createWorld({ seed: 11, progress: { cleared: [...STAGES] }, stage, skipIntro: true }) as WorldImpl
    world.setPlayers([{ id: 'host', name: 'host' }])
    const W = world.W
    const room = STAGE_DATA[stage]!.rooms.find((r) => r.id === id)!
    const me = ctrlHero(W)
    place(me, (room.x + room.w / 2) * TILE, (room.y + room.h / 2) * TILE)
    run(world, 0.3)
    expect(W.leaderRoom).toBe(id)
    expect(world.view().objective).toBe(room.objective)
    SOLVE[`${stage}:${id}`](W)
    run(world, 1.5)
    const after = world.view().objective
    expect(after).not.toBe(room.objective)
    expect(after).toBe(room.objectiveDone ?? DONE_OBJECTIVE)
    expect(after).not.toBe('')
  })
})
