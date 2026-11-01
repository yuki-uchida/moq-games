// Chapter-1 progress bits in GameState.flags (snapshot-safe integers below 2^31).
import type { GameState } from '../../game'

export const FLAG = {
  pellets: 1 << 0, // ate the three morning pellets
  pisuke: 1 << 1, // heard Pisuke's 「モリ！」
  bye: 1 << 2, // Hinata said goodbye and set off for school
  latch: 1 << 3, // the cage latch is broken: the door can be pushed open again
  search: 1 << 4, // the family knows Mochi is out: 「モチ探し」
  hinataHome: 1 << 5,
  garden: 1 << 6,
  exiting: 1 << 7,
  gnawStart: 1 << 8,
  niboshiGot: 1 << 9,
  tagGot: 1 << 10,
  tamaMet: 1 << 13, // Tama is telling what she wants
  fed: 1 << 14, // Tama has her niboshi and is explaining the cat flap
  digStart: 1 << 15,
  morningCall: 1 << 30 // Mom hurries Hinata along
} as const

export const has = (state: Pick<GameState, 'flags'>, flag: number) => (state.flags & flag) !== 0

/** A small counter packed into `flags` at `shift`, `bits` wide. */
const counter = (shift: number, bits: number) => {
  const mask = (1 << bits) - 1
  return {
    get: (state: Pick<GameState, 'flags'>) => (state.flags >>> shift) & mask,
    set(state: Pick<GameState, 'flags'>, value: number) {
      const clamped = Math.max(0, Math.min(mask, Math.floor(value)))
      state.flags = (state.flags & ~(mask << shift)) | (clamped << shift)
    }
  }
}
const niboshiCount = counter(11, 2)
const gnawQuarters = counter(16, 8)
const digQuarters = counter(24, 6)

export const NIBOSHI_WANTED = 3
export const niboshiGiven = niboshiCount.get
export const setNiboshiGiven = niboshiCount.set

/** Seconds gnawed at the latch (persists through checkpoints). */
export const GNAW_SECONDS = 30
export const gnawed = (state: Pick<GameState, 'flags'>) => gnawQuarters.get(state) / 4
export const setGnawed = (state: Pick<GameState, 'flags'>, seconds: number) => gnawQuarters.set(state, seconds * 4)

/** Seconds dug under the fence board. */
export const DIG_SECONDS = 15
export const dug = (state: Pick<GameState, 'flags'>) => digQuarters.get(state) / 4
export const setDug = (state: Pick<GameState, 'flags'>, seconds: number) => digQuarters.set(state, seconds * 4)
