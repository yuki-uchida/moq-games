import { describe, expect, test } from 'vitest'
import {
  HOLD,
  arenaRemaining,
  createMusicState,
  partyInDanger,
  selectMusicLayer,
  type MusicHero,
  type MusicInput
} from '../src/client/music-select'

const ok: MusicHero = { hp: 6, maxHp: 6, down: false }
const base = (o: Partial<MusicInput>): MusicInput => ({ t: 0, alerted: false, heroes: [ok, ok], ...o })

describe('boss music layers', () => {
  test('layer 1 in phase 1, layer 2 in phase 2 and it stays', () => {
    const s = createMusicState()
    expect(selectMusicLayer(s, base({ boss: { phase: 1, hp: 90, maxHp: 100 } }))).toBe(1)
    expect(selectMusicLayer(s, base({ boss: { phase: 2, hp: 49, maxHp: 100 } }))).toBe(2)
    expect(selectMusicLayer(s, base({ boss: { phase: 2, hp: 30, maxHp: 100 } }))).toBe(2)
  })
  test('a boss without a phase switches at half HP', () => {
    const s = createMusicState()
    expect(selectMusicLayer(s, base({ boss: { phase: 1, hp: 60, maxHp: 100 } }))).toBe(1)
    expect(selectMusicLayer(s, base({ boss: { phase: 1, hp: 50, maxHp: 100 } }))).toBe(2)
  })
  test('a retry with a healed boss returns to layer 1', () => {
    const s = createMusicState()
    selectMusicLayer(s, base({ boss: { phase: 2, hp: 40, maxHp: 100 } }))
    expect(selectMusicLayer(s, base({ boss: { phase: 1, hp: 100, maxHp: 100 } }))).toBe(1)
  })
})

describe('stage music layers', () => {
  test('explore 0, alerted 1', () => {
    const s = createMusicState()
    expect(selectMusicLayer(s, base({}))).toBe(0)
    expect(selectMusicLayer(s, base({ alerted: true }))).toBe(1)
  })
  test('an arena reaches layer 2 on its last wave only', () => {
    const s = createMusicState()
    const arena = (remaining: number) => ({ id: 'a', remaining, waves: 2 })
    expect(selectMusicLayer(s, base({ t: 1, arena: arena(3) }))).toBe(1)
    expect(selectMusicLayer(s, base({ t: 2, arena: arena(1) }))).toBe(1)
    expect(selectMusicLayer(s, base({ t: 3, arena: arena(4) }))).toBe(2) // wave 2 spawned
    expect(selectMusicLayer(s, base({ t: 4, arena: arena(1) }))).toBe(2)
  })
  test('a single-wave arena stays on layer 1', () => {
    const s = createMusicState()
    expect(selectMusicLayer(s, base({ arena: { id: 'a', remaining: 3, waves: 1 } }))).toBe(1)
  })
  test('danger: two downed, or low hearts', () => {
    const down: MusicHero = { hp: 0, maxHp: 6, down: true }
    const low: MusicHero = { hp: 1, maxHp: 6, down: false }
    expect(partyInDanger([ok, ok, ok, ok])).toBe(false)
    expect(partyInDanger([down, ok, ok, ok])).toBe(false)
    expect(partyInDanger([down, down, ok, ok])).toBe(true)
    expect(partyInDanger([down, low, ok, ok])).toBe(true)
    expect(partyInDanger([low])).toBe(true)
    const s = createMusicState()
    expect(selectMusicLayer(s, base({ alerted: true, heroes: [down, down, ok] }))).toBe(2)
    // danger without any fight does not raise the music
    expect(selectMusicLayer(createMusicState(), base({ heroes: [down, down, ok] }))).toBe(0)
  })
  test('falling waits for the hold time (no flicker)', () => {
    const s = createMusicState()
    const hurt: MusicHero[] = [{ hp: 0, maxHp: 6, down: true }, { hp: 0, maxHp: 6, down: true }, ok]
    expect(selectMusicLayer(s, base({ t: 0, alerted: true, heroes: hurt }))).toBe(2)
    // danger ends: still 2 until the hold has passed
    expect(selectMusicLayer(s, base({ t: 1, alerted: true }))).toBe(2)
    expect(selectMusicLayer(s, base({ t: 1 + HOLD[2] - 0.1, alerted: true }))).toBe(2)
    // danger flickers back: the hold restarts
    expect(selectMusicLayer(s, base({ t: 5, alerted: true, heroes: hurt }))).toBe(2)
    expect(selectMusicLayer(s, base({ t: 6, alerted: true }))).toBe(2)
    expect(selectMusicLayer(s, base({ t: 6 + HOLD[2], alerted: true }))).toBe(1)
    // alert drops later: layer 1 holds too
    expect(selectMusicLayer(s, base({ t: 13 }))).toBe(1)
    expect(selectMusicLayer(s, base({ t: 13 + HOLD[1] }))).toBe(0)
  })
})

describe('arenaRemaining', () => {
  test('reads the count from the arena objective', () => {
    expect(arenaRemaining('敵をぜんぶたおせ！ のこり 3')).toBe(3)
    expect(arenaRemaining('敵をぜんぶたおせ！ のこり 12')).toBe(12)
    expect(arenaRemaining('4つの月石を同時に光らせよう')).toBe(0)
  })
})
