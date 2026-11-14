import { describe, expect, it } from 'vitest'
import { revealedFor } from '../src/sim/actors'
import type { Player, Sim } from '../src/sim/state'

/** Sonar reveals are per side: bots and foes only use the pulses of their own side. */
describe('revealedFor', () => {
  const sim = { time: 5 } as Sim
  const player = (revealedUntil: number, revealedBy?: number[]) => ({ revealedUntil, revealedBy }) as Player

  it('a pulse by side 0 reveals the target to side 0 only', () => {
    const q = player(10, [10])
    expect(revealedFor(sim, q, 0)).toBe(true)
    expect(revealedFor(sim, q, 1)).toBe(false)
    expect(revealedFor(sim, q, 2)).toBe(false)
    expect(revealedFor(sim, q, 3)).toBe(false)
  })

  it('without a side it answers whether any side revealed the target', () => {
    expect(revealedFor(sim, player(10, [undefined as unknown as number, 10]))).toBe(true)
    expect(revealedFor(sim, player(4, [4]))).toBe(false)
  })

  it('expired and missing reveals are not reveals', () => {
    expect(revealedFor(sim, player(4, [4, 4, 4, 4]), 0)).toBe(false)
    expect(revealedFor(sim, player(0), 2)).toBe(false)
  })
})
