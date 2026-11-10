/** The bell chip stays complete once the puzzle group is solved, even when a bell is rung later. */
import { describe, expect, test } from 'vitest'
import { hitProp } from '../src/sim/props'
import type { LegendEntry } from '../src/sim/stage-data'
import { BELL_WINDOW } from '../src/sim/tables'
import type { PropView } from '../src/sim/types'
import { BELL_DONE_SHOW, bellChip, bellProgress } from '../src/ui/moons'
import { Pad, T, customTower, run } from './sim-helpers'

const legend: Record<string, LegendEntry> = {
  B: { tile: 'cliff', ent: { type: 'prop', kind: 'bell', group: 'G' } }
}
const map = ['##############', '#............#', '#.@..........#', '#.B..B..B..B.#', '#............#', '##############']

test('after the solve the bells stay complete, and a later ring does not bring back n/4', () => {
  const { world, W } = customTower(map, { legend })
  new Pad(world)
  const bells = () => world.view().props.filter((p) => p.kind === 'bell')
  const lit = (rungAt: number[]) => bells().map((_, i) => rungAt.includes(i))
  expect(bellProgress(bells(), lit([0, 1]))).toMatchObject({ n: 2, complete: false })
  for (const b of W.props.filter((p) => p.kind === 'bell')) hitProp(W, b, 0, false)
  expect(bells().every((b) => b.solved)).toBe(true)
  expect(bellProgress(bells(), lit([]))).toMatchObject({ n: 4, complete: true })
  run(world, BELL_WINDOW + 3)
  expect(bellProgress(bells(), lit([]))).toMatchObject({ n: 4, complete: true })
  hitProp(W, W.props.find((p) => p.kind === 'bell')!, 0, false)
  expect(bellProgress(bells(), lit([0]))).toMatchObject({ n: 4, complete: true })
})

test('the view carries each bell group, so the chip finds the bells of a real world', () => {
  const { world } = customTower(map, { legend })
  new Pad(world)
  const v = world.view()
  const bells = v.props.filter((p) => p.kind === 'bell')
  expect(bells).toHaveLength(4)
  expect(bells.every((b) => b.group === 'G')).toBe(true)
  const chip = bellChip(
    bells,
    undefined,
    v.heroes[0],
    () => false,
    () => undefined,
    v.t
  )
  expect(chip).toMatchObject({ group: 'G', n: 0, total: 4, complete: false })
})

describe('bellChip: shown while the hero works on an unsolved group', () => {
  const rooms = [{ id: 'A', x: 0, y: 0, w: 10, h: 6 }]
  const bell = (id: number, tx: number, ty: number, group: string, solved = false): PropView =>
    ({ id, kind: 'bell', x: T(tx), y: T(ty), state: 'idle', st: 0, group, solved }) as PropView
  const open = [bell(1, 1, 2, 'A'), bell(2, 3, 2, 'A'), bell(3, 5, 2, 'A'), bell(4, 7, 2, 'A'), bell(5, 30, 2, 'Z')]
  const inRoom = { x: T(2), y: T(4) }
  const none = () => undefined

  test('stays visible with no ring at all, counting only the lit bells', () => {
    const chip = bellChip(open, rooms, inRoom, (b) => b.id === 2, none, 100)
    expect(chip).toMatchObject({ group: 'A', lit: [false, true, false, false], n: 1, total: 4, complete: false })
    expect(bellChip(open, rooms, inRoom, () => false, none, 500)).toMatchObject({ n: 0, total: 4 })
  })

  test('hidden for a hero outside the room and far from the bells, or without a hero', () => {
    expect(bellChip(open, rooms, { x: T(30), y: T(40) }, () => false, none, 0)).toBeUndefined()
    expect(bellChip(open, rooms, undefined, () => false, none, 0)).toBeUndefined()
  })

  test('outside every room the near bells count', () => {
    expect(bellChip(open, undefined, { x: T(4), y: T(5) }, () => false, none, 0)).toMatchObject({ group: 'A' })
  })

  test('a solved group shows the completed chip for a few seconds, then hides', () => {
    const solved = open.map((b) => ({ ...b, solved: b.group === 'A' }))
    const at = (t: number) =>
      bellChip(
        solved,
        rooms,
        inRoom,
        () => false,
        () => 10,
        t
      )
    expect(at(10.5)).toMatchObject({ complete: true, n: 4, solved: true })
    expect(at(10 + BELL_DONE_SHOW - 0.1)).toBeDefined()
    expect(at(10 + BELL_DONE_SHOW)).toBeUndefined()
  })

  test('a group that was already solved on sight is never shown', () => {
    const solved = open.map((b) => ({ ...b, solved: true }))
    expect(
      bellChip(
        solved,
        rooms,
        inRoom,
        () => false,
        () => -Infinity,
        0
      )
    ).toBeUndefined()
    expect(bellChip(solved, rooms, inRoom, () => false, none, 0)).toBeUndefined()
  })
})
