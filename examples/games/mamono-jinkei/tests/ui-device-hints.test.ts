/** Input-device tracking (pad vs keyboard/mouse) and the hint labels that follow it. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Controls } from '../src/input/controls'
import { deviceKey, splitPadKey } from '../src/input/device'
import { padActive, type PadSample } from '../src/input/padnav'
import { createWorld, stageInfo } from '../src/sim/api'
import type { View } from '../src/sim/types'
import { controlled, hintsFor } from '../src/ui/hints'

const sample = (pressed: number[] = [], axes: number[] = [0, 0, 0, 0]): PadSample => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => pressed.includes(i))
})

describe('pad activity', () => {
  test('a held button or a firm stick push counts; an idle pad or stick drift does not', () => {
    expect(padActive(sample())).toBe(false)
    expect(padActive(sample([], [0.1, -0.1, 0.05, 0]))).toBe(false)
    expect(padActive(sample([0]))).toBe(true)
    expect(padActive(sample([], [0.8, 0, 0, 0]))).toBe(true)
    expect(padActive(sample([], [0, 0, 0, -0.9]))).toBe(true)
  })
})

describe('Controls.inputDevice', () => {
  let pad: PadSample | undefined
  let winListeners: Record<string, (e: unknown) => void>
  let canvasListeners: Record<string, (e: unknown) => void>

  beforeEach(() => {
    pad = undefined
    winListeners = {}
    canvasListeners = {}
    vi.stubGlobal('window', { addEventListener: (n: string, f: (e: unknown) => void) => (winListeners[n] = f) })
    vi.stubGlobal('document', { addEventListener: () => undefined, hidden: false })
    vi.stubGlobal('navigator', {
      getGamepads: () =>
        pad
          ? [
              {
                connected: true,
                axes: pad.axes,
                buttons: pad.buttons.map((pressed) => ({ pressed }))
              }
            ]
          : []
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  const make = () => {
    const canvas = {
      addEventListener: (n: string, f: (e: unknown) => void) => (canvasListeners[n] = f),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      focus: () => undefined,
      setPointerCapture: () => undefined
    } as unknown as HTMLCanvasElement
    return new Controls(canvas, { onMenu: () => undefined, onGesture: () => undefined })
  }

  test('starts on the keyboard, switches to the pad on pad input and back on key or mouse input', () => {
    const c = make()
    expect(c.inputDevice).toBe('keyboard')
    c.update(undefined, 1)
    expect(c.inputDevice).toBe('keyboard')

    pad = sample([2])
    c.update(undefined, 1)
    expect(c.inputDevice).toBe('pad')

    winListeners.keydown({ code: 'KeyE', target: null, repeat: false, preventDefault: () => undefined })
    expect(c.inputDevice).toBe('keyboard')
    // The pad button is still held but the pad did not change anything: the next update would flip it again, so
    // release it first, then press again.
    pad = sample()
    c.update(undefined, 1)
    expect(c.inputDevice).toBe('keyboard')
    pad = sample([], [0, 0.9, 0, 0])
    c.update(undefined, 1)
    expect(c.inputDevice).toBe('pad')

    winListeners.pointermove({ clientX: 5, clientY: 5, pointerType: 'mouse' })
    expect(c.inputDevice).toBe('keyboard')
    pad = sample([0])
    c.update(undefined, 1)
    expect(c.inputDevice).toBe('pad')
    canvasListeners.pointerdown({ clientX: 5, clientY: 5, pointerType: 'mouse', button: 0, pointerId: 1 })
    expect(c.inputDevice).toBe('keyboard')
  })

  test('keys that are not game keys do not switch the device', () => {
    const c = make()
    pad = sample([2])
    c.update(undefined, 1)
    winListeners.keydown({ code: 'KeyP', target: null, repeat: false })
    expect(c.inputDevice).toBe('pad')
  })
})

describe('hint labels per device', () => {
  test('keyboard keys map to the pad buttons that do the same thing', () => {
    expect(deviceKey('E', 'pad')).toBe('X')
    expect(deviceKey('E長押し', 'pad')).toBe('X長押し')
    expect(deviceKey('クリック', 'pad')).toBe('Ⓐ')
    expect(deviceKey('長押し', 'pad')).toBe('Ⓐ長押し')
    expect(deviceKey('Space', 'pad')).toBe('B')
    expect(deviceKey('F', 'pad')).toBe('Y')
    expect(deviceKey('Q', 'pad')).toBe('Back')
    expect(deviceKey('Tab', 'pad')).toBe('LB/RB')
    expect(deviceKey('陣形', 'pad')).toBe('陣形')
    for (const k of ['E', 'Q', 'Tab', 'F', 'Space', 'クリック', '長押し']) expect(deviceKey(k, 'keyboard')).toBe(k)
    expect(splitPadKey('Ⓐ長押し')).toEqual({ glyph: 'Ⓐ', rest: '長押し' })
    expect(splitPadKey('LB/RB')).toEqual({ glyph: 'LB/RB', rest: '' })
    expect(splitPadKey('Back')).toEqual({ glyph: 'Back', rest: '' })
    expect(splitPadKey('B長押し')).toEqual({ glyph: 'B', rest: '長押し' })
    expect(splitPadKey('陣形')).toBeUndefined()
  })

  test('the HUD hints of a real view use Back / LB/RB on the pad and Q / Tab on the keyboard', () => {
    const world = createWorld({ seed: 5, progress: { cleared: [] }, stage: 'forest', skipIntro: true })
    world.setPlayers([{ id: 'host', name: 'host' }])
    const view: View = world.view()
    const info = stageInfo('forest')
    const hero = controlled(view, 'host')!
    const kb = hintsFor(view, info, 'host')
    expect(kb.map((h) => h.key)).toEqual(expect.arrayContaining(['Q', 'Tab']))
    const pad = hintsFor(view, info, 'host', 'pad')
    expect(pad.map((h) => h.key)).toEqual(expect.arrayContaining(['Back', 'LB/RB']))
    expect(pad.map((h) => h.key)).not.toContain('Q')
    expect(pad.map((h) => h.text)).toEqual(kb.map((h) => h.text))

    // A grippable next to the hero: 「E つかむ」 on the keyboard, 「X つかむ」 on the pad.
    view.props.push({ id: 9999, kind: 'acorn', x: hero.x, y: hero.y, state: 'idle', st: 0 })
    expect(hintsFor(view, info, 'host')[0]).toMatchObject({ key: 'E', text: 'つかむ' })
    expect(hintsFor(view, info, 'host', 'pad')[0]).toMatchObject({ key: 'X', text: 'つかむ' })
    // The valve is held: 「E長押し」 → 「X長押し」.
    view.props.pop()
    view.props.push({ id: 9999, kind: 'valve', x: hero.x, y: hero.y, state: 'off', st: 0 })
    expect(hintsFor(view, info, 'host')[0]).toMatchObject({ key: 'E長押し' })
    expect(hintsFor(view, info, 'host', 'pad')[0]).toMatchObject({ key: 'X長押し' })
  })
})
