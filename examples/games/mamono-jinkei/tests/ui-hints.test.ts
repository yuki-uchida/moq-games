import { describe, expect, test } from 'vitest'
import type { PropView } from '../src/sim/types'
import { delivered } from '../src/ui/hints'

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
