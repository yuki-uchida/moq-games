import { afterEach, describe, expect, it } from 'vitest'
import { VIEW_H, VIEW_W } from '../src/art/contract'
import { Overlay, POPUP_TEXTS, ROUNDED_FONT, STAGED_LINES, warmOverlayText } from '../src/view/overlay'

interface Gradient {
  args: number[]
  stops: [number, string][]
}

/** A canvas context that records what the overlay asks of it. */
function fakeContext() {
  const gradients: Gradient[] = []
  const fills: { style: unknown; alpha: number }[] = []
  const measured: { font: string; text: string }[] = []
  const state = { fillStyle: '' as unknown, globalAlpha: 1, font: '' }
  const noop = () => {}
  const ctx = new Proxy(state as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key]
      if (key === 'createRadialGradient')
        return (...args: number[]) => {
          const g: Gradient = { args, stops: [] }
          gradients.push(g)
          return { addColorStop: (offset: number, color: string) => g.stops.push([offset, color]), g }
        }
      if (key === 'fillRect')
        return () => {
          fills.push({ style: state.fillStyle, alpha: state.globalAlpha })
        }
      if (key === 'measureText')
        return (text: string) => {
          measured.push({ font: state.font, text })
          return { width: text.length * 10 }
        }
      return noop
    },
    set(target, key: string, value) {
      target[key] = value
      return true
    }
  }) as unknown as CanvasRenderingContext2D
  return { ctx, gradients, fills, measured }
}

describe('Overlay.drawScreen', () => {
  it('creates the vignette and hurt gradients once and reuses them frame after frame', () => {
    const overlay = new Overlay()
    const fake = fakeContext()
    for (let i = 0; i < 20; i++) overlay.drawScreen(fake.ctx)
    expect(fake.gradients).toHaveLength(2)
    expect(fake.gradients[0].args).toEqual([
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.45,
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.98
    ])
    expect(fake.gradients[0].stops).toEqual([
      [0, 'rgba(20,8,40,0)'],
      [1, 'rgba(20,8,40,0.26)']
    ])
  })

  it('sets its strength through the alpha', () => {
    const overlay = new Overlay()
    const fake = fakeContext()
    const alphas: number[] = []
    for (let i = 0; i < 10; i++) {
      overlay.hurt()
      overlay.update(i * 0.02)
      overlay.drawScreen(fake.ctx)
      alphas.push(fake.fills[fake.fills.length - 1].alpha)
    }
    expect(fake.gradients).toHaveLength(2)
    expect(fake.gradients[1].args).toEqual([
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.32,
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.92
    ])
    expect(fake.gradients[1].stops).toEqual([
      [0, 'rgba(220,30,60,0)'],
      [1, 'rgba(220,30,60,1)']
    ])
    // The strength the old code put in the last stop (red × 0.6) is the alpha now; and the alpha is back to 1 after.
    const hurtFills = fake.fills.filter((f) => f.alpha !== 1)
    expect(hurtFills.length).toBeGreaterThan(5)
    for (const f of hurtFills) expect(f.alpha).toBeLessThanOrEqual(0.45 + 1e-9)
    expect(alphas.every((a) => a === 1 || a > 0)).toBe(true)
    overlay.update(1)
    const quiet = fakeContext()
    overlay.drawScreen(quiet.ctx)
    expect(quiet.gradients).toHaveLength(2)
    expect((quiet.ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(1)
  })

  it('makes new gradients for a different context', () => {
    const overlay = new Overlay()
    const a = fakeContext()
    const b = fakeContext()
    overlay.drawScreen(a.ctx)
    overlay.drawScreen(b.ctx)
    overlay.drawScreen(b.ctx)
    expect(a.gradients).toHaveLength(2)
    expect(b.gradients).toHaveLength(2)
  })
})

describe('Overlay bubbles and popups', () => {
  it('measures a bubble text once however many frames it is drawn', () => {
    const overlay = new Overlay()
    overlay.bubble('やったね！', { x: 100, y: 100 }, 2)
    overlay.bubble('ありがとう！', { x: 200, y: 100 }, 2, 'yell')
    const fake = fakeContext()
    for (let i = 0; i < 30; i++) {
      overlay.update(0.016)
      overlay.drawPopups(fake.ctx, 0, 0)
    }
    expect(fake.measured).toHaveLength(2)
    expect(overlay.bubbleRects).toHaveLength(2)
    expect(overlay.bubbleRects[0].w).toBe('やったね！'.length * 10 + 22)
  })

  it('drops finished popups and bubbles in place and keeps the rest in order', () => {
    const overlay = new Overlay()
    overlay.popup('+1', 0, 0)
    overlay.popup('+2', 0, 0)
    overlay.update(0.5)
    overlay.popup('3/8', 0, 0)
    overlay.bubble('a', { x: 0, y: 0 }, 0.4)
    overlay.bubble('b', { x: 0, y: 0 }, 2)
    overlay.update(0.5)
    expect(overlay.popupTexts).toEqual(['3/8'])
    expect(overlay.bubbleTexts).toEqual(['b'])
    overlay.update(1)
    expect(overlay.popupTexts).toEqual([])
    overlay.popup('ゴール！', 0, 0)
    overlay.popup('+1', 0, 0)
    overlay.clearPopups('ゴール！')
    expect(overlay.popupTexts).toEqual(['+1'])
  })
})

describe('warmOverlayText', () => {
  const globals = globalThis as Record<string, unknown>
  const saved = globals.OffscreenCanvas
  afterEach(() => {
    globals.OffscreenCanvas = saved
  })

  it('does nothing without a canvas to measure on', () => {
    globals.OffscreenCanvas = undefined
    expect(warmOverlayText()).toBe(0)
  })

  it('measures every popup text and staged line with the overlay font', () => {
    const fake = fakeContext()
    globals.OffscreenCanvas = class {
      getContext() {
        return fake.ctx
      }
    }
    const count = warmOverlayText(['extra'])
    expect(count).toBe(fake.measured.length)
    const texts = new Set(fake.measured.map((m) => m.text))
    for (const text of [...POPUP_TEXTS, ...STAGED_LINES, 'extra', '+1', '+2', 'ナイス！', 'ゴール！'])
      expect(texts.has(text)).toBe(true)
    for (const m of fake.measured) expect(m.font.endsWith(ROUNDED_FONT)).toBe(true)
    expect(fake.measured.every((m) => /^800 \d+px /.test(m.font))).toBe(true)
  })
})
