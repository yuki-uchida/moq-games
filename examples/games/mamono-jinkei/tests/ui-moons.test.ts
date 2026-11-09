/** The HUD's moonstone counter covers the whole puzzle group of the real forest stage. */
import { expect, test } from 'vitest'
import { createWorld, stageInfo } from '../src/sim/api'
import { lightMoonstone } from '../src/sim/props'
import type { WorldImpl } from '../src/sim/world'
import { moonProgress } from '../src/ui/moons'
import { T } from './sim-helpers'

function forest() {
  const world = createWorld({ seed: 5, progress: { cleared: [] }, stage: 'forest', skipIntro: true }) as WorldImpl
  world.setPlayers([{ id: 'host', name: 'host' }])
  return { world, W: world.W, rooms: stageInfo('forest').rooms }
}

const stonesAt = (W: ReturnType<typeof forest>['W'], tiles: [number, number][]) =>
  tiles.map(([x, y]) => {
    const p = W.props.find((q) => q.kind === 'moonstone' && Math.abs(q.x - T(x)) < 40 && Math.abs(q.y - T(y)) < 40)
    expect(p, `moonstone near ${x},${y}`).toBeTruthy()
    return p!
  })

const ROOM_D: [number, number][] = [
  [6, 42],
  [17, 48],
  [27, 42],
  [35, 48]
]

test('room D counts all four stones of its group, even those far from the hero', () => {
  const { world, W, rooms } = forest()
  const d = stonesAt(W, ROOM_D)
  expect(d.every((p) => p.group === 'D')).toBe(true)
  const hero = { x: T(6), y: T(43) }
  const at = () => moonProgress(world.view().props, rooms, hero)!

  expect(at()).toMatchObject({ group: 'D', n: 0, total: 4, complete: false })
  lightMoonstone(W, d[0])
  lightMoonstone(W, d[1])
  expect(at()).toMatchObject({ n: 2, total: 4, complete: false })
  lightMoonstone(W, d[2])
  lightMoonstone(W, d[3])
  expect(at()).toMatchObject({ n: 4, total: 4, complete: true })
})

test('the sim and the counter agree when the group is solved', () => {
  const { world, W, rooms } = forest()
  for (const p of stonesAt(W, ROOM_D)) lightMoonstone(W, p)
  expect(W.flags.has('moons:D')).toBe(true)
  expect(moonProgress(world.view().props, rooms, { x: T(35), y: T(47) })?.complete).toBe(true)
})

test('the lone guide stone in room B has no counter', () => {
  const { world, W, rooms } = forest()
  const lone = W.props.filter((p) => p.kind === 'moonstone' && p.group === undefined)
  expect(lone.length).toBeGreaterThan(0)
  for (const p of lone) lightMoonstone(W, p)
  const props = world.view().props
  expect(props.filter((p) => p.kind === 'moonstone' && p.group === undefined).length).toBe(lone.length)
  // Standing by each guide stone (room B) shows nothing.
  for (const p of lone) expect(moonProgress(props, rooms, { x: p.x, y: p.y + 60 })).toBeUndefined()
})
