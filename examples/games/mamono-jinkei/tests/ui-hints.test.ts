import { describe, expect, test } from 'vitest'
import { stageInfo } from '../src/sim/api'
import type { HeroView, PropView } from '../src/sim/types'
import { TILE } from '../src/vocab'
import { currentAt, currentNear, delivered } from '../src/ui/hints'

const prop = (id: number, kind: PropView['kind'], x: number, y: number, state: string): PropView => ({
  id,
  kind,
  x,
  y,
  state,
  st: 0
})

describe('delivered grippables (no 「E つかむ」 bubble once placed)', () => {
  test('an item resting on the centre of its filled acceptor is delivered', () => {
    for (const [item, acceptor] of [
      ['acorn', 'pedestal'],
      ['cheese', 'scale'],
      ['goldbell', 'hook'],
      ['log', 'ramslot']
    ] as const) {
      const p = prop(1, item, 320, 448, 'idle')
      expect(delivered([prop(2, acceptor, 320, 448, 'on'), p], p)).toBe(true)
    }
  })

  test('an item next to an empty acceptor or away from it can still be gripped', () => {
    const p = prop(1, 'acorn', 320, 448, 'idle')
    expect(delivered([prop(2, 'pedestal', 320, 448, 'off'), p], p)).toBe(false)
    expect(delivered([prop(2, 'pedestal', 340, 448, 'on'), p], p)).toBe(false)
    expect(delivered([p], p)).toBe(false)
  })
})

describe('current hint at the channel rim', () => {
  const info = stageInfo('sewer')
  const channel = info.currents!.find((c) => c.channel === 'B')!
  const rows = channel.tiles.map((t) => Math.floor(t / info.w))
  const bottom = Math.max(...rows)
  const x = (channel.tiles[0] % info.w) * TILE + TILE * 4
  const hero = (y: number) => ({ x, y }) as HeroView

  test('on the channel and just past its downstream edge the current is found', () => {
    expect(currentNear(info, hero(bottom * TILE + 10))).toBeDefined()
    // A lone hero swept to the rim rests right below the last current row.
    expect(currentAt(info, hero((bottom + 1) * TILE + 3))).toBeUndefined()
    expect(currentNear(info, hero((bottom + 1) * TILE + 3))).toBeDefined()
  })

  test('far from the channel nothing is found; a stopped channel does not count', () => {
    expect(currentNear(info, hero((bottom + 3) * TILE))).toBeUndefined()
    expect(currentNear(info, hero(bottom * TILE + 10), ['B'])).toBeUndefined()
  })
})
