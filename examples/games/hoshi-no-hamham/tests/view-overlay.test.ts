import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VIEW_H, VIEW_W } from '../src/art/contract'
import {
  forgetPopupPictures,
  hasPopupPicture,
  KNOWN_POPUPS,
  Overlay,
  overlayPictures,
  POPUP_COLORS,
  POPUP_PICTURES,
  POPUP_TEXTS,
  popupPictureCount,
  ROUNDED_FONT,
  STAGED_LINES,
  warmOverlayText,
  warmPopupPicture
} from '../src/view/overlay'

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

describe('the pictures of popup texts', () => {
  const globals = globalThis as Record<string, unknown>
  const saved = globals.document
  /** A page that makes canvases and counts them; every canvas hands out a context that records its texts. */
  function fakePage() {
    const canvases: { width: number; height: number; texts: string[] }[] = []
    globals.document = {
      createElement: () => {
        const canvas = { width: 0, height: 0, texts: [] as string[] }
        const fake = fakeContext()
        const ctx = new Proxy(fake.ctx as unknown as Record<string, unknown>, {
          get: (target, key: string) =>
            key === 'fillText' ? (text: string) => void canvas.texts.push(text) : Reflect.get(target, key)
        })
        canvases.push(canvas)
        return { ...canvas, getContext: () => ctx, canvas }
      }
    }
    return canvases
  }
  /** A context of the game's canvas that writes down the pictures drawn on it. */
  function screen() {
    const drawn: unknown[] = []
    const fake = fakeContext()
    const ctx = new Proxy(fake.ctx as unknown as Record<string, unknown>, {
      get: (target, key: string) =>
        key === 'drawImage' ? (image: unknown) => void drawn.push(image) : Reflect.get(target, key)
    }) as unknown as CanvasRenderingContext2D
    return { ctx, drawn }
  }
  beforeEach(() => forgetPopupPictures())
  afterEach(() => {
    globals.document = saved
    forgetPopupPictures()
  })

  it('makes one picture for all the popups of one text, colour and scale', () => {
    const canvases = fakePage()
    const overlay = new Overlay()
    const view = screen()
    for (let i = 0; i < 6; i++) {
      overlay.popup('+1', 10 * i, 0, POPUP_COLORS.fruit)
      overlay.update(0.05)
      overlay.drawPopups(view.ctx, 0, 0, 3)
    }
    expect(canvases).toHaveLength(1)
    expect(popupPictureCount()).toBe(1)
    // Every popup on screen drew that one picture, in every frame.
    expect(view.drawn.length).toBeGreaterThan(6)
    expect(new Set(view.drawn).size).toBe(1)
  })

  it('makes another picture for another text, colour, size or scale', () => {
    const canvases = fakePage()
    const overlay = new Overlay()
    const view = screen()
    overlay.popup('+1', 0, 0, POPUP_COLORS.fruit)
    overlay.popup('+2', 0, 0, POPUP_COLORS.fruit)
    overlay.popup('+1', 0, 0, POPUP_COLORS.gold)
    overlay.popup('+1', 0, 0, POPUP_COLORS.fruit, 15)
    overlay.drawPopups(view.ctx, 0, 0, 3)
    expect(canvases).toHaveLength(4)
    // The same four at another scale of the canvas (a smaller backing store) are four more.
    const smaller = new Overlay()
    smaller.popup('+1', 0, 0, POPUP_COLORS.fruit)
    smaller.drawPopups(view.ctx, 0, 0, 2)
    expect(canvases).toHaveLength(5)
    expect(popupPictureCount()).toBe(5)
  })

  it('finds a picture made ahead, and makes none where pictures are off', () => {
    const canvases = fakePage()
    for (const [text, color] of KNOWN_POPUPS) expect(warmPopupPicture(text, color, 3)).toBe(true)
    expect(canvases).toHaveLength(KNOWN_POPUPS.length)
    expect(canvases.map((c) => c.texts[0])).toEqual(KNOWN_POPUPS.map(([text]) => text))
    const overlay = new Overlay()
    const view = screen()
    for (const [text, color] of KNOWN_POPUPS) overlay.popup(text, 0, 0, color)
    overlay.drawPopups(view.ctx, 0, 0, 3)
    expect(canvases).toHaveLength(KNOWN_POPUPS.length)
    expect(view.drawn).toHaveLength(KNOWN_POPUPS.length)
    // Asked again, a picture is found, not made.
    expect(warmPopupPicture(KNOWN_POPUPS[0][0], KNOWN_POPUPS[0][1], 3)).toBe(true)
    expect(canvases).toHaveLength(KNOWN_POPUPS.length)
    // What is made can be asked without making anything: this text in this colour at this scale, and no other.
    expect(hasPopupPicture(KNOWN_POPUPS[0][0], KNOWN_POPUPS[0][1], 3)).toBe(true)
    expect(hasPopupPicture(KNOWN_POPUPS[0][0], KNOWN_POPUPS[0][1], 2)).toBe(false)
    expect(hasPopupPicture(KNOWN_POPUPS[0][0], POPUP_COLORS.count, 3)).toBe(false)
    expect(hasPopupPicture('9/9', POPUP_COLORS.count, 3)).toBe(false)
    expect(canvases).toHaveLength(KNOWN_POPUPS.length)
    overlayPictures.enabled = false
    try {
      expect(warmPopupPicture('+1', POPUP_COLORS.fruit, 4)).toBe(false)
      expect(canvases).toHaveLength(KNOWN_POPUPS.length)
    } finally {
      overlayPictures.enabled = true
    }
  })

  it('keeps the newest pictures only', () => {
    fakePage()
    for (let i = 0; i < POPUP_PICTURES + 5; i++) warmPopupPicture(`${i}/99`, POPUP_COLORS.count, 3)
    expect(popupPictureCount()).toBe(POPUP_PICTURES)
    // The first ones went; one used again stays the newest.
    const canvases = fakePage()
    warmPopupPicture('0/99', POPUP_COLORS.count, 3)
    expect(canvases).toHaveLength(1)
    warmPopupPicture(`${POPUP_PICTURES + 4}/99`, POPUP_COLORS.count, 3)
    expect(canvases).toHaveLength(1)
    warmPopupPicture('7/99', POPUP_COLORS.count, 3)
    for (let i = 0; i < POPUP_PICTURES - 2; i++) warmPopupPicture(`new ${i}`, POPUP_COLORS.count, 3)
    const before = canvases.length
    warmPopupPicture('7/99', POPUP_COLORS.count, 3)
    expect(canvases).toHaveLength(before)
  })

  it('has no picture without a page (the text is drawn as it was)', () => {
    globals.document = undefined
    expect(warmPopupPicture('+1', POPUP_COLORS.fruit, 3)).toBe(false)
    expect(popupPictureCount()).toBe(0)
  })

  /** The properties of the game's canvas that only a popup written as text needs. */
  const TEXT_PROPERTIES = ['textAlign', 'textBaseline', 'lineJoin', 'font', 'lineWidth', 'strokeStyle', 'fillStyle']
  /** A context of the game's canvas that writes down which properties are read and which are set, and the texts. */
  function watched(held: Record<string, unknown>) {
    const read = new Set<string>()
    const written = new Set<string>()
    const texts: string[] = []
    const fake = fakeContext()
    Object.assign(fake.ctx, held)
    const ctx = new Proxy(fake.ctx as unknown as Record<string, unknown>, {
      get: (target, key: string) => {
        if (key === 'fillText') return (text: string) => void texts.push(text)
        read.add(key)
        return Reflect.get(target, key)
      },
      set: (target, key: string, value) => {
        written.add(key)
        return Reflect.set(target, key, value)
      }
    }) as unknown as CanvasRenderingContext2D
    const now = () => Object.fromEntries(Object.keys(held).map((key) => [key, Reflect.get(fake.ctx, key)]))
    return { ctx, read, written, texts, now }
  }
  const HELD = {
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineJoin: 'miter',
    font: '10px sans-serif',
    lineWidth: 1,
    strokeStyle: '#000000',
    fillStyle: '#123456',
    globalAlpha: 1,
    imageSmoothingEnabled: false
  }

  it('neither reads nor sets a property of text on the canvas for a popup that is a picture', () => {
    fakePage()
    const overlay = new Overlay()
    const view = watched(HELD)
    overlay.popup('+1', 0, 0, POPUP_COLORS.fruit)
    overlay.popup('ナイス！', 0, 0, POPUP_COLORS.gold)
    for (let i = 0; i < 4; i++) {
      overlay.update(0.2)
      overlay.drawPopups(view.ctx, 0, 0, 3)
    }
    for (const key of TEXT_PROPERTIES) {
      expect(view.read.has(key), `${key} read`).toBe(false)
      expect(view.written.has(key), `${key} set`).toBe(false)
    }
    // What a picture does change (it fades with an alpha and is drawn smoothed) is put back.
    expect(view.written.has('globalAlpha')).toBe(true)
    expect(view.written.has('imageSmoothingEnabled')).toBe(true)
    expect(view.now()).toEqual(HELD)
    expect(view.texts).toEqual([])
  })

  it('writes a popup without a picture as text and puts every property back', () => {
    globals.document = undefined
    const overlay = new Overlay()
    const view = watched(HELD)
    overlay.popup('+1', 0, 0, POPUP_COLORS.fruit)
    overlay.popup('3/8', 0, 0, POPUP_COLORS.count)
    overlay.update(0.9)
    overlay.drawPopups(view.ctx, 0, 0, 3)
    expect(view.texts).toEqual(['+1', '3/8'])
    for (const key of TEXT_PROPERTIES) expect(view.written.has(key), `${key} set`).toBe(true)
    expect(view.now()).toEqual(HELD)
  })

  it('leaves the canvas alone when no popup is on', () => {
    const overlay = new Overlay()
    const view = watched(HELD)
    overlay.drawPopups(view.ctx, 0, 0, 3)
    expect(view.read.size).toBe(0)
    expect(view.written.size).toBe(0)
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
