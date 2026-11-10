import { describe, expect, test } from 'vitest'
import { createWorld } from '../src/sim/api'
import type { WorldState } from '../src/sim/state'
import type { WorldImpl } from '../src/sim/world'
import type { StageId } from '../src/vocab'
import { Pad, T, ctrlHero, place, run, walkTo } from './sim-helpers'

function stageWorld(stage: StageId) {
  const world = createWorld({ seed: 7, progress: { cleared: [] }, stage, skipIntro: true }) as WorldImpl
  world.setPlayers([{ id: 'host', name: 'host' }])
  run(world, 0.1)
  return { world, W: world.W }
}

/** Runs `seconds` with no input; returns how far the controlled hero moved and the companions' final state. */
function idle(world: WorldImpl, W: WorldState, seconds = 5) {
  const me = ctrlHero(W)
  const pad = new Pad(world)
  pad.move(0, 0)
  const x0 = me.body.x
  const y0 = me.body.y
  let last: [number, number][] = []
  run(world, seconds - 1)
  last = W.heroes.map((h) => [h.body.x, h.body.y])
  run(world, 1)
  const others = W.heroes.filter((h) => h !== me)
  return {
    moved: Math.hypot(me.body.x - x0, me.body.y - y0),
    closest: Math.min(...others.map((h) => Math.hypot(h.body.x - me.body.x, h.body.y - me.body.y))),
    // Movement of each hero over the last second (settled: no jitter).
    drift: Math.max(...W.heroes.map((h, i) => Math.hypot(h.body.x - last[i][0], h.body.y - last[i][1])))
  }
}

// Corridors one tile wide where companions used to shove the idle controlled hero along (reviewer's scan):
// [stage, from tile, to tile] — the hero walks in with its companions in tow, then lets go.
const CASES: [StageId, [number, number], [number, number]][] = [
  ['meadow', [29, 45], [38, 45]],
  ['meadow', [46, 45], [36, 45]],
  ['meadow', [29, 48], [33, 48]],
  ['meadow', [37, 48], [32, 48]],
  ['meadow', [49, 57], [44, 57]],
  ['meadow', [37, 57], [45, 57]],
  ['tower', [53, 46], [53, 50]],
  ['tower', [53, 53], [53, 49]],
  ['forest', [17, 45], [30, 45]],
  ['forest', [38, 45], [24, 45]],
  ['forest', [20, 45], [20, 42]],
  ['forest', [20, 41], [20, 43]]
]

describe('following companions in narrow corridors', () => {
  test.each(CASES)('%s: walk %j → %j, then idle: the hero stays put', (stage, from, to) => {
    const { world, W } = stageWorld(stage)
    const pad = new Pad(world)
    const me = ctrlHero(W)
    for (const h of W.heroes) place(h, T(from[0]), T(from[1]))
    expect(walkTo(world, pad, me, T(to[0]), T(to[1]), 10)).toBe(true)
    // Let go and let the walk's own momentum die out first.
    pad.move(0, 0)
    run(world, 0.4)
    const r = idle(world, W)
    expect(r.moved).toBeLessThan(8)
    expect(r.closest).toBeGreaterThan(24)
    expect(r.drift).toBeLessThan(4)
  })

  test('companions placed past the hero in a corridor settle around it without pushing it', () => {
    for (const [stage, , to] of CASES) {
      const { world, W } = stageWorld(stage)
      const me = ctrlHero(W)
      place(me, T(to[0]), T(to[1]))
      // Companions start on top of the hero (as after a puff or a warp).
      for (const h of W.heroes) if (h !== me) place(h, T(to[0]) + 3, T(to[1]) - 2)
      const r = idle(world, W)
      expect(r.moved, `${stage} ${to}`).toBeLessThan(8)
      expect(r.closest, `${stage} ${to}`).toBeGreaterThan(24)
    }
  })

  test('stage 4 row 45: D for 1.5 s, S for 0.3 s, then nothing: the hero stays where it stopped', () => {
    const { world, W } = stageWorld('forest')
    const pad = new Pad(world)
    const me = ctrlHero(W)
    for (const h of W.heroes) place(h, T(5), T(45))
    run(world, 1.5, () => pad.move(1, 0))
    run(world, 0.3, () => pad.move(0, 1))
    pad.move(0, 0)
    run(world, 0.4)
    const r = idle(world, W, 3)
    expect(r.moved).toBeLessThan(8)
    expect(r.closest).toBeGreaterThan(24)
  })

  test('right after the forest warp to D the hero does not slide', () => {
    const world = createWorld({ seed: 7, progress: { cleared: [] }, stage: 'forest', skipIntro: true }) as WorldImpl
    world.setPlayers([{ id: 'host', name: 'host' }])
    world.command('host', { type: 'warp', to: 'D' })
    run(world, 1 / 60)
    const r = idle(world, world.W)
    expect(r.moved).toBeLessThan(8)
    expect(r.closest).toBeGreaterThan(24)
    expect(r.drift).toBeLessThan(4)
  })
})
