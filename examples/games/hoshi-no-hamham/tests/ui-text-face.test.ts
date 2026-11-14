import { describe, expect, it } from 'vitest'
import { TextFace, type FaceCanvas, type FaceContext, type FaceStyle } from '../src/ui/text-face'

/** A canvas that writes down what is drawn on it. `advance` gives the width of a character in CSS pixels. */
function fakeCanvas(advance: (char: string) => number = () => 8) {
  const calls: string[] = []
  let contexts = 0
  const ctx = {
    font: '',
    fillStyle: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    setTransform: (a: number, _b: number, _c: number, d: number) => void calls.push(`transform ${a} ${d}`),
    clearRect: (x: number, y: number, w: number, h: number) => void calls.push(`clear ${x} ${y} ${w} ${h}`),
    fillText(text: string, x: number, y: number) {
      const at = `${Number(x.toFixed(3))} ${Number(y.toFixed(3))}`
      calls.push(`text "${text}" ${at} ${this.textAlign} ${this.font} ${this.fillStyle}`)
    },
    measureText: (text: string) => ({ width: [...text].reduce((sum, char) => sum + advance(char), 0) })
  }
  const canvas = {
    width: 300,
    height: 150,
    getContext: () => {
      contexts += 1
      return ctx as unknown as FaceContext
    }
  }
  return {
    canvas: canvas as FaceCanvas,
    calls,
    texts: () => calls.filter((line) => line.startsWith('text')),
    contexts: () => contexts
  }
}

/** A line whose baseline is 12 px down, in a font the page sets as it comes. */
const STYLE: FaceStyle = { font: 'normal 800 14px Test', color: 'rgb(255, 246, 176)', baseline: 12, digit: null }
const DRAWN = 'left normal 800 14px Test rgb(255, 246, 176)'

describe('a text face', () => {
  it('draws nothing until it knows its box, then the text on show', () => {
    const f = fakeCanvas()
    const face = new TextFace(f.canvas)
    face.set('0:00.0')
    face.set('0:00.1')
    expect(f.calls).toEqual([])
    expect(f.contexts()).toBe(0)
    face.fit(48, 16, STYLE, 3)
    expect([f.canvas.width, f.canvas.height]).toEqual([144, 48])
    expect(f.texts()).toEqual([`text "0:00.1" 0 12 ${DRAWN}`])
    expect(face.shown).toBe('0:00.1')
  })

  it('sets the text from the left edge of the box on the baseline the page gives', () => {
    const f = fakeCanvas()
    const face = new TextFace(f.canvas)
    face.fit(50, 20, { ...STYLE, baseline: 14 }, 2)
    face.set('1:23.4')
    expect(f.texts().at(-1)).toBe(`text "1:23.4" 0 14 ${DRAWN}`)
    // Drawn in CSS pixels on a store of device pixels: cleared whole, then scaled.
    expect(f.calls.slice(-4, -1)).toEqual(['transform 1 1', 'clear 0 0 100 40', 'transform 2 2'])
  })

  it('puts the baseline on a whole device pixel', () => {
    const f = fakeCanvas()
    const face = new TextFace(f.canvas)
    // 12.4 CSS pixels are 32.55 device pixels at a ratio of 2.625: the line is drawn on the 33rd.
    face.fit(48, 16, { ...STYLE, baseline: 12.4 }, 2.625)
    face.set('0:00.2')
    const y = () => Number(/ (\S+) left /.exec(f.texts().at(-1)!)![1])
    expect(y() * (f.canvas.height / 16)).toBeCloseTo(33, 1)
    // Halfway between two device pixels (13.5 CSS pixels at a ratio of 3): the upper one.
    face.fit(48, 16, { ...STYLE, baseline: 13.5 }, 3)
    expect(y() * 3).toBeCloseTo(40, 2)
  })

  it('draws again only when the text changes', () => {
    const f = fakeCanvas()
    const face = new TextFace(f.canvas)
    face.fit(48, 16, STYLE, 1)
    face.set('0:01.0')
    const drawn = f.texts().length
    face.set('0:01.0')
    face.set('0:01.0')
    expect(f.texts().length).toBe(drawn)
    face.set('0:01.1')
    expect(f.texts().length).toBe(drawn + 1)
  })

  it('takes a new box and a new style, and shows the same text in them', () => {
    const f = fakeCanvas()
    const face = new TextFace(f.canvas)
    face.fit(48, 16, STYLE, 3)
    face.set('2:00.0')
    face.fit(60, 20, { font: 'normal 800 18px Test', color: 'rgb(1, 2, 3)', baseline: 15, digit: null }, 2)
    expect([f.canvas.width, f.canvas.height]).toEqual([120, 40])
    expect(f.texts().at(-1)).toBe('text "2:00.0" 0 15 left normal 800 18px Test rgb(1, 2, 3)')
  })

  it('a box that is not a whole number of device pixels is drawn to the pixels it gets', () => {
    const f = fakeCanvas()
    const face = new TextFace(f.canvas)
    face.fit(47.6, 16, STYLE, 2.625)
    // 124.95 device pixels are 125; the drawing is scaled so that the box's 47.6 fill them.
    expect(f.canvas.width).toBe(125)
    expect(f.canvas.height).toBe(42)
    expect(f.calls).toContain(`transform ${125 / 47.6} ${42 / 16}`)
  })

  it("takes the browser's count of device pixels when it fits the ratio, and its own when it does not", () => {
    const f = fakeCanvas()
    const face = new TextFace(f.canvas)
    // The box is painted on 143 device pixels, not on the 142.8 that its size times the ratio makes.
    face.fit(47.6, 16, STYLE, 3, { width: 143, height: 48 })
    expect([f.canvas.width, f.canvas.height]).toEqual([143, 48])
    // An emulated display: the browser counts the box at another scale. That count is not the canvas's.
    face.fit(47.6, 16, STYLE, 3, { width: 48, height: 16 })
    expect([f.canvas.width, f.canvas.height]).toEqual([143, 48])
  })

  it('goes blank when its box leaves the page, and comes back with the text it had', () => {
    const f = fakeCanvas()
    const face = new TextFace(f.canvas)
    face.fit(48, 16, STYLE, 3)
    face.set('0:30.0')
    face.fit(0, 0, null, 1)
    expect([f.canvas.width, f.canvas.height]).toEqual([0, 0])
    const drawn = f.texts().length
    face.set('0:30.1')
    expect(f.texts().length).toBe(drawn)
    face.fit(48, 16, STYLE, 3)
    expect(f.texts().at(-1)).toContain('"0:30.1"')
  })

  // A font whose 1 is narrow: 5 against 8 for the other digits; the colon and the point are 3.
  const narrowOne = (char: string) => (char === '1' ? 5 : char === ':' || char === '.' ? 3 : 8)

  it('draws the text as the font sets it where the page does the same', () => {
    const f = fakeCanvas(narrowOne)
    const face = new TextFace(f.canvas)
    face.fit(40, 16, STYLE, 1)
    face.set('1:10.1')
    expect(f.texts().at(-1)).toBe(`text "1:10.1" 0 12 ${DRAWN}`)
  })

  it('gives every digit the room the page gives it where the page sets the digits at one width', () => {
    const f = fakeCanvas(narrowOne)
    const face = new TextFace(f.canvas)
    // The page sets every digit 8.5 wide (tabular figures); the canvas would draw the 1 at 5.
    face.fit(44, 16, { ...STYLE, digit: 8.5 }, 1)
    face.set('1:10.1')
    const cell = 'center normal 800 14px Test rgb(255, 246, 176)'
    // From the left: each digit in the middle of 8.5, the colon and the point at their own 3.
    expect(f.texts().slice(-6)).toEqual([
      `text "1" 4.25 12 ${cell}`,
      `text ":" 10 12 ${cell}`,
      `text "1" 15.75 12 ${cell}`,
      `text "0" 24.25 12 ${cell}`,
      `text "." 30 12 ${cell}`,
      `text "1" 35.75 12 ${cell}`
    ])
    // The other characters stay where they are when a digit changes.
    face.set('1:10.2')
    expect(f.texts().at(-2)).toBe(`text "." 30 12 ${cell}`)
    expect(f.texts().at(-3)).toBe(`text "0" 24.25 12 ${cell}`)
  })

  it('draws the whole text in one piece when the font has its digits at one width anyway', () => {
    const f = fakeCanvas((char) => (char === ':' || char === '.' ? 3 : 8))
    const face = new TextFace(f.canvas)
    face.fit(40, 16, { ...STYLE, digit: 8 }, 1)
    face.set('12:34.5')
    expect(f.texts().length).toBe(2)
    expect(f.texts().at(-1)).toBe(`text "12:34.5" 0 12 ${DRAWN}`)
  })

  it('knows the digit its font draws widest', () => {
    const f = fakeCanvas((char) => (char === '4' ? 9 : char === '1' ? 5 : 8))
    const face = new TextFace(f.canvas)
    expect(face.wide).toBe('0')
    face.fit(40, 16, STYLE, 1)
    expect(face.wide).toBe('4')
    // All one width: the zero stands for them.
    const even = new TextFace(fakeCanvas().canvas)
    even.fit(40, 16, STYLE, 1)
    expect(even.wide).toBe('0')
  })
})
