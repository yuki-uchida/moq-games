/** The bell chip stays complete once the puzzle group is solved, even when a bell is rung later. */
import { expect, test } from 'vitest'
import { hitProp } from '../src/sim/props'
import type { LegendEntry } from '../src/sim/stage-data'
import { BELL_WINDOW } from '../src/sim/tables'
import { bellProgress } from '../src/ui/moons'
import { Pad, customTower, run } from './sim-helpers'

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
