/** Unplugging the pad while the scoreboard button is held closes the scoreboard. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ControlState } from '../src/input/controls'
import { GamePad, PAD } from '../src/input/gamepad'

const pad = (held: number[]) =>
  ({
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: held.includes(i),
      touched: false,
      value: held.includes(i) ? 1 : 0
    }))
  }) as unknown as Gamepad

afterEach(() => vi.unstubAllGlobals())

describe('gamepad disconnect', () => {
  it('emits scoreboardOff when the pad disappears while the view button is held', () => {
    const state = new ControlState()
    const gp = new GamePad()
    let current: (Gamepad | null)[] = [pad([PAD.VIEW])]
    vi.stubGlobal('navigator', { getGamepads: () => current })
    expect(gp.poll(state, 1 / 60, 1, false)).toEqual(['scoreboardOn'])
    expect(gp.poll(state, 1 / 60, 1, false)).toEqual([])
    current = [null]
    expect(gp.poll(state, 1 / 60, 1, false)).toEqual(['scoreboardOff'])
    expect(gp.poll(state, 1 / 60, 1, false)).toEqual([])
  })

  it('a released view button then a disconnect emits nothing extra', () => {
    const state = new ControlState()
    const gp = new GamePad()
    let current: (Gamepad | null)[] = [pad([PAD.VIEW])]
    vi.stubGlobal('navigator', { getGamepads: () => current })
    gp.poll(state, 1 / 60, 1, false)
    current = [pad([])]
    expect(gp.poll(state, 1 / 60, 1, false)).toEqual(['scoreboardOff'])
    current = [null]
    expect(gp.poll(state, 1 / 60, 1, false)).toEqual([])
  })
})
