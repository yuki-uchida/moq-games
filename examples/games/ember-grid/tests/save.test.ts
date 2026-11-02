import { describe, expect, it, vi } from 'vitest'
import { createGame, seeded } from '../src/game'
import { carryForDifficulty, freshSave, readSave, restoreGame, snapshotGame, unlocked, writeSave } from '../src/save'

describe('campaign saves', () => {
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
