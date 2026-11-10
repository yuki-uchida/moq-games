import { describe, expect, test } from 'vitest'
import { padAimDir, stick } from '../src/input/map'
import { DPAD, NAV_DELAY, NAV_REPEAT, PadNav, navDirection, type PadSample } from '../src/input/padnav'
import { defaultLobbyStage } from '../src/ui/lobby'

const pad = (pressed: number[] = [], axes: number[] = [0, 0, 0, 0]): PadSample => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => pressed.includes(i))
})

describe('gamepad menu navigation', () => {
  test('d-pad and left stick map to directions; the stick needs a firm push', () => {
    expect(navDirection(pad([DPAD.up]))).toBe('up')
    expect(navDirection(pad([DPAD.right]))).toBe('right')
    expect(navDirection(pad([], [0, 0.9, 0, 0]))).toBe('down')
    expect(navDirection(pad([], [-0.9, 0.3, 0, 0]))).toBe('left')
    expect(navDirection(pad([], [0.3, 0.2, 0, 0]))).toBeUndefined()
  })

  test('A activates, B goes back, Start toggles the pause menu (edges only)', () => {
    const nav = new PadNav()
    expect(nav.update(pad(), 0.016)).toEqual([])
    expect(nav.update(pad([0]), 0.016)).toEqual(['ok'])
    expect(nav.update(pad([0]), 0.016)).toEqual([])
    expect(nav.update(pad([1]), 0.016)).toEqual(['back'])
    expect(nav.update(pad([9]), 0.016)).toEqual(['start'])
    expect(nav.update(pad([9]), 0.016)).toEqual([])
  })

  test('a button held when the pad appears does nothing until it is released', () => {
    const nav = new PadNav()
    expect(nav.update(pad([0]), 0.016)).toEqual([])
    expect(nav.update(pad([0]), 0.016)).toEqual([])
    expect(nav.update(pad(), 0.016)).toEqual([])
    expect(nav.update(pad([0]), 0.016)).toEqual(['ok'])
  })

  test('a held direction moves once, waits, then repeats', () => {
    const nav = new PadNav()
    nav.update(pad(), 0.016)
    const down = pad([DPAD.down])
    expect(nav.update(down, 0.016)).toEqual(['down'])
    expect(nav.update(down, NAV_DELAY - 0.05)).toEqual([])
    expect(nav.update(down, 0.06)).toEqual(['down'])
    expect(nav.update(down, NAV_REPEAT / 2)).toEqual([])
    expect(nav.update(down, NAV_REPEAT)).toEqual(['down'])
    nav.update(pad(), 0.016)
    expect(nav.update(pad([DPAD.left]), 0.016)).toEqual(['left'])
  })

  test('changing direction while holding moves immediately', () => {
    const nav = new PadNav()
    nav.update(pad(), 0.016)
    expect(nav.update(pad([], [0, 1, 0, 0]), 0.016)).toEqual(['down'])
    expect(nav.update(pad([], [1, 0, 0, 0]), 0.016)).toEqual(['right'])
  })
})

describe('gamepad aim', () => {
  const idle = stick(0, 0)
  test('the right stick aims; with it idle the left stick direction aims', () => {
    const left = stick(1, 0)
    const right = stick(0, 1)
    expect(padAimDir(left, right)).toEqual({ x: right.x, y: right.y })
    expect(padAimDir(left, idle)).toEqual({ x: left.x, y: left.y })
    expect(padAimDir(idle, idle)).toBeUndefined()
  })
})

describe('lobby default stage', () => {
  test('the newest unlocked stage is pre-selected', () => {
    expect(defaultLobbyStage(['meadow'])).toBe('meadow')
    expect(defaultLobbyStage(['meadow', 'sewer'])).toBe('sewer')
    expect(defaultLobbyStage(['meadow', 'sewer', 'tower'])).toBe('tower')
    expect(defaultLobbyStage([])).toBe('meadow')
  })
})
