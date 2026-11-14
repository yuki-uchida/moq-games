/**
 * The view starts a boss's flinch or cast only when it plays out before he next walks or winds up, from state
 * lengths it mirrors from the simulation (view/clips.ts). Here they are measured in the real simulation: each boss
 * kind is left to run its cycle untouched, and every state it goes through in full is timed. A change of the
 * simulation's timing breaks this test instead of the picture.
 */
import { describe, expect, it } from 'vitest'
import {
  BRUTE_IDLE_SECONDS,
  BRUTE_RECOVER_SECONDS,
  BRUTE_STUN_SECONDS,
  FINAL_IDLE_SECONDS,
  FINAL_RECOVER_SECONDS,
  FLYER_IDLE_SECONDS,
  FLYER_RECOVER_SECONDS,
  SWARM_IDLE_SECONDS,
  SWARM_RECOVER_SECONDS,
  TANK_IDLE_SECONDS,
  TANK_RECOVER_SECONDS
} from '../src/view/clips'
import { STEP, hitSweep } from './play-audit'

/** The lengths (s) of every state the boss of stage `no` went through in full, by state. */
function stateLengths(no: number, options: { phase2?: boolean } = {}) {
  // No hits: the sweep's hit interval is longer than the run.
  const r = hitSweep(no, 5, { seconds: 30, every: 1e9, ...options })
  const rows = r.tracks.get('boss')!.rows.filter((row) => row.state !== null)
  const lengths = new Map<string, number[]>()
  let from = 0
  for (let i = 1; i <= rows.length; i++) {
    if (i < rows.length && rows[i].state === rows[from].state && rows[i].step === rows[i - 1].step + 1) continue
    // The first and the last stretch may be cut by the run.
    if (from > 0 && i < rows.length) {
      const state = rows[from].state!
      let list = lengths.get(state)
      if (!list) lengths.set(state, (list = []))
      // Simulated time: the display frames of a hit-stop hold the simulation.
      let seconds = 0
      for (let k = from; k < i; k++) if (!rows[k].held) seconds += rows[k].dt
      list.push(seconds)
    }
    from = i
  }
  return lengths
}

/**
 * Every measured length is the constant, give or take the step on which the simulation notices it is over (and the
 * step a hit-stop begins on, shown standing still).
 */
function expectLength(lengths: Map<string, number[]>, state: string, seconds: number) {
  const list = lengths.get(state)
  expect(list?.length, `${state} was gone through`).toBeGreaterThan(0)
  for (const length of list!) {
    expect(length, state).toBeGreaterThanOrEqual(seconds - STEP - 1e-9)
    expect(length, state).toBeLessThanOrEqual(seconds + 2 * STEP + 1e-9)
  }
}

describe('the boss state lengths the view mirrors are those of the simulation', () => {
  it('the brutes: idle, recover (and a stun, when a charge ends in a wall)', () => {
    for (const no of [3, 4, 5]) {
      const lengths = stateLengths(no)
      expectLength(lengths, 'idle', BRUTE_IDLE_SECONDS)
      expectLength(lengths, 'recover', BRUTE_RECOVER_SECONDS)
      if (lengths.has('stunned')) expectLength(lengths, 'stunned', BRUTE_STUN_SECONDS)
    }
    expect(BRUTE_STUN_SECONDS).toBe(1.1)
  })

  it('the crow: hover, recover', () => {
    const lengths = stateLengths(2)
    expectLength(lengths, 'idle', FLYER_IDLE_SECONDS)
    expectLength(lengths, 'recover', FLYER_RECOVER_SECONDS)
  })

  it('the bear and the ape: walk, recover', () => {
    for (const no of [6, 8]) {
      const lengths = stateLengths(no)
      expectLength(lengths, 'idle', TANK_IDLE_SECONDS)
      expectLength(lengths, 'recover', TANK_RECOVER_SECONDS)
    }
  })

  it('the fox and the bee: walk, recover', () => {
    for (const no of [7, 9]) {
      const lengths = stateLengths(no)
      expectLength(lengths, 'idle', SWARM_IDLE_SECONDS)
      expectLength(lengths, 'recover', SWARM_RECOVER_SECONDS)
    }
  })

  it('the king, in each phase: walk, recover', () => {
    const one = stateLengths(10)
    expectLength(one, 'idle', FINAL_IDLE_SECONDS[0])
    expectLength(one, 'recover', FINAL_RECOVER_SECONDS[0])
    const two = stateLengths(10, { phase2: true })
    expectLength(two, 'idle', FINAL_IDLE_SECONDS[1])
    expectLength(two, 'recover', FINAL_RECOVER_SECONDS[1])
  })
})
