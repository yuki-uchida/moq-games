import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTutorial, tutorialStep } from '../src/tutorial'
import { memorialNames } from '../src/dialogue'
import { createGame } from '../src/game'

describe('tutorial progression', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('follows the selected ally, move, forecast, undo and turn', () => {
    const game = createGame(0)
    expect(tutorialStep({ game }, false)).toBe(0)
    for (const unit of game.units.filter((candidate) => candidate.side === 'ally')) {
      expect(tutorialStep({ game, selected: unit.id }, false)).toBe(1)
    }
    const rio = game.units.find((unit) => unit.id === 'a')!
    rio.x = 3
    rio.moved = true
    expect(tutorialStep({ game, selected: rio.id }, false)).toBe(4)
    expect(tutorialStep({ game, selected: rio.id, pending: 'enemy' }, false)).toBe(3)
    rio.x = 1
    rio.moved = false
    expect(tutorialStep({ game, selected: rio.id }, false)).toBe(1)
    expect(tutorialStep({ game, selected: rio.id }, true)).toBe(5)
  })

  it('restarts unfinished guidance and remembers skip', () => {
    const span = { textContent: '' }
    const button = { onclick: () => {} }
    const hint = {
      id: '',
      hidden: false,
      innerHTML: '',
      querySelector: (selector: string) => (selector === 'span' ? span : button)
    }
    const storage = new Map<string, string>()
    vi.stubGlobal('document', { createElement: () => hint, querySelectorAll: () => [] })
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value)
    })
    const game = createGame(0)
    const tutorial = createTutorial(
      { prepend: () => {} } as unknown as HTMLElement,
      () => {},
      () => ({ game })
    )
    tutorial.start(true)
    tutorial.advance('turn')
    expect(span.textContent).toContain('攻撃範囲')
    tutorial.start(true)
    expect(span.textContent).toContain('味方を選ぼう')
    button.onclick()
    expect(hint.hidden).toBe(true)
    tutorial.start(true)
    expect(hint.hidden).toBe(true)
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
