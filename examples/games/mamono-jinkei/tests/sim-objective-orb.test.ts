/** While the stage-end orb is pending, the objective comes from the stage data of the altar's room (generic fallback). */
import { expect, test } from 'vitest'
import { createWorld } from '../src/sim/api'
import { STAGE_DATA } from '../src/stages'
import { ORB_OBJECTIVE } from '../src/sim/view'
import type { WorldImpl } from '../src/sim/world'
import { STAGES, type StageId } from '../src/vocab'

function withOrb(stage: StageId) {
  const world = createWorld({ seed: 3, progress: { cleared: [...STAGES] }, stage, skipIntro: true }) as WorldImpl
  world.setPlayers([{ id: 'host', name: 'host' }])
  ;(world as unknown as { spawnOrb(): void }).spawnOrb()
  return world
}

const altarText = (stage: StageId) => STAGE_DATA[stage]!.rooms.find((r) => r.id === 'I')?.objective

test('forest shows its own altar text while the orb is pending', () => {
  const world = withOrb('forest')
  expect(world.W.orb).toBeDefined()
  expect(world.view().objective).toBe('最後の宝珠にふれよう')
})

test.each(STAGES)('%s: the orb objective is the altar room text', (stage) => {
  const world = withOrb(stage)
  expect(world.view().objective).toBe(altarText(stage) || ORB_OBJECTIVE)
})

test('a room without text falls back to the generic orb objective', () => {
  const world = withOrb('meadow')
  const rooms = world.W.parsed!.data.rooms
  const saved = rooms.map((r) => r.objective)
  try {
    for (const r of rooms) r.objective = ''
    expect(world.view().objective).toBe(ORB_OBJECTIVE)
  } finally {
    rooms.forEach((r, i) => (r.objective = saved[i]!))
  }
})

test('once the orb is taken the orb text is gone', () => {
  const world = withOrb('forest')
  world.W.orbTaken = true
  expect(world.view().objective).not.toBe('最後の宝珠にふれよう')
})
