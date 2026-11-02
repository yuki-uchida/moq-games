import { describe, expect, it } from 'vitest'
import { nextTutorialStep } from '../src/tutorial'
import { memorialNames } from '../src/dialogue'
import { createGame } from '../src/game'

describe('tutorial progression', () => {
  it('advances only on the expected action', () => {
    expect(nextTutorialStep(0, 'move')).toBe(0)
    expect(nextTutorialStep(0, 'select')).toBe(1)
    expect(nextTutorialStep(2, 'target')).toBe(3)
    expect(nextTutorialStep(5, 'danger')).toBe(6)
  })
})

describe('expedition memorial', () => {
  it('includes earlier losses after resuming and excludes casual losses', () => {
    const game = createGame(5)
    game.units = game.units.filter((unit) => unit.id !== 'a')
    game.units.find((unit) => unit.id === 'i')!.hp = 0
    expect(memorialNames(game, 'classic')).toEqual(['燈守リオ', '癒し手ルカ'])
    expect(memorialNames(game, 'casual')).toEqual([])
  })
})
