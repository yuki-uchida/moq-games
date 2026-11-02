import { describe, expect, it, vi } from 'vitest'
import { createGame, seeded } from '../src/game'
import { carryForDifficulty, freshSave, readSave, restoreGame, snapshotGame, unlocked, writeSave } from '../src/save'

describe('campaign saves', () => {
  it('keeps a snapshot independent from live and restored battles', () => {
    const game = createGame(3, 'guard', undefined, seeded(42))
    game.units[0].alerted = true
    game.units[0].moved = true
    game.units[0].done = true
    game.turn = 4
    game.potions = 1
    game.progress = { id: game.units[0].id, from: 1, to: 2, level: 1, gains: { max: 1, power: 2, def: 3 } }
    const saved = snapshotGame(game)
    const original = structuredClone(saved)
    game.units[0].hp = 1
    game.units[0].done = true
    game.units[0].alerted = false
    game.potions--
    game.progress.gains!.max = 9
    game.rng()
    expect(saved).toEqual(original)
    const restored = restoreGame(saved)
    expect(snapshotGame(restored)).toEqual(original)
    const second = restoreGame(saved)
    expect([restored.rng(), restored.rng()]).toEqual([second.rng(), second.rng()])
    restored.units[0].hp = 0
    expect(saved).toEqual(original)
  })
  it('reads a legacy v1 save without completion fields', () => {
    const legacy = freshSave('classic')
    legacy.suspend = snapshotGame(createGame())
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(legacy) })
    expect(
      readSave(() => {
        throw Error('read failed')
      })
    ).toEqual(legacy)
    vi.unstubAllGlobals()
  })
  it('round trips the battle, extensions and random stream', () => {
    const game = createGame(0, 'balanced', undefined, seeded(19))
    Object.assign(game.units[0], { futureAbility: 'heal' })
    game.rng()
    let stored = ''
    vi.stubGlobal('localStorage', {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value
      }
    })
    const save = freshSave('classic')
    save.suspend = snapshotGame(game)
    writeSave(save, () => {
      throw Error('write failed')
    })
    const restored = restoreGame(
      readSave(() => {
        throw Error('read failed')
      })!.suspend!
    )
    vi.unstubAllGlobals()
    expect(restored.units).toEqual(game.units)
    expect(restored.rocks).toEqual(game.rocks)
    expect(restored.rng()).toBe(game.rng())
  })
  it('ignores corrupt and unknown saves and tolerates unavailable storage', () => {
    const notice = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: () => '{',
      setItem: () => {
        throw Error('blocked')
      }
    })
    expect(readSave(notice)).toBeUndefined()
    writeSave(freshSave('classic'), notice)
    vi.stubGlobal('localStorage', { getItem: () => '{"version":2}' })
    expect(readSave(notice)).toBeUndefined()
    expect(notice).toHaveBeenCalledTimes(3)
    vi.unstubAllGlobals()
  })
  it('keeps fallen allies only in casual and locks unreached chapters', () => {
    const game = createGame()
    game.units[0].hp = 0
    game.units[0].level = 4
    expect(carryForDifficulty(game, 'casual')[game.units[0].id].level).toBe(4)
    expect(carryForDifficulty(game, 'classic')[game.units[0].id]).toBeUndefined()
    const save = freshSave('casual')
    expect(unlocked(save, 0)).toBe(true)
    expect(unlocked(save, 1)).toBe(false)
    save.furthest = 1
    expect(unlocked(save, 1)).toBe(true)
    expect(unlocked(save, -1)).toBe(false)
  })
})
