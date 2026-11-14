/**
 * A short line of text that changes many times a second (a clock), drawn on a canvas as the page would set it. A
 * change of text in the page costs the browser a style, layout and paint pass for the frame; a canvas that is drawn
 * again costs none of them.
 *
 * The canvas covers a box of the page that an unseen copy of the text keeps in shape (`hudd-clock-size` in
 * deck.css). The font, the colour, the baseline and the width of a digit are read from that copy when the box is
 * laid out, so the text lies where the page's own text lay: from the left edge of the box, on the line's baseline,
 * the digits at one width where the page sets them so (`font-variant-numeric: tabular-nums`, which a canvas cannot
 * ask for itself).
 */

/** What of a 2D context the face uses (the unit tests hand in a stand-in). */
export type FaceContext = Pick<
  CanvasRenderingContext2D,
  'clearRect' | 'fillText' | 'measureText' | 'setTransform' | 'font' | 'fillStyle' | 'textAlign' | 'textBaseline'
>

export interface FaceCanvas {
  width: number
  height: number
  getContext(kind: '2d'): FaceContext | null
}

/** How the page sets the text the face stands in for. */
export interface FaceStyle {
  /** The font as the CSS shorthand, and the colour. */
  font: string
  color: string
  /** The baseline of the line, in CSS pixels from the top of the box. */
  baseline: number
  /** The width the page gives every digit (CSS pixels), or null where it sets each digit at its own width. */
  digit: number | null
}

const DIGITS = '0123456789'

export class TextFace {
  private ctx: FaceContext | null = null
  private text = ''
  /** The box in CSS pixels; 0 until it is known (and while the box is not on the page). */
  private width = 0
  private height = 0
  private scaleX = 1
  private scaleY = 1
  private font = ''
  private color = ''
  private baseline = 0
  /** The room every digit gets when the page sets them at one width and the canvas would not (0: as they come). */
  private cell = 0
  private widths = new Map<string, number>()
  /** The digit the font draws widest ('0' until a font is known, and where they are all one width). */
  wide = '0'

  constructor(readonly canvas: FaceCanvas) {}

  /**
   * The box and the style have changed (or are known for the first time): `width` and `height` in CSS pixels,
   * `ratio` device pixels per CSS pixel. `device` is the box in device pixels where the browser tells it (the box
   * is painted on whole device pixels, which need not be `ratio` times its size). The text on show is drawn again.
   * Without a style (the box is not on the page) the face is blank.
   */
  fit(
    width: number,
    height: number,
    style: FaceStyle | null,
    ratio: number,
    device?: { width: number; height: number }
  ) {
    this.width = style ? Math.max(0, width) : 0
    this.height = style ? Math.max(0, height) : 0
    // The browser's own count of device pixels is taken when it agrees with the ratio to within a pixel (under a
    // zoom or an emulated display it can be the count of another scale).
    const near = (given: number | undefined, size: number) =>
      given !== undefined && Math.abs(given - size * ratio) <= 1 ? given : size * ratio
    const w = Math.round(near(device?.width, this.width))
    const h = Math.round(near(device?.height, this.height))
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
    this.widths.clear()
    this.cell = 0
    if (!style || !w || !h) return
    this.font = style.font
    this.color = style.color
    this.ctx ??= this.canvas.getContext('2d')
    const ctx = this.ctx
    if (!ctx) return
    // The backing store is a whole number of device pixels; the box need not be.
    this.scaleX = w / this.width
    this.scaleY = h / this.height
    // On a whole device pixel: text on a line between two pixels is soft. A baseline halfway between two goes to
    // the upper one, where Chromium and WebKit put the page's own text (Firefox puts it on the lower).
    this.baseline = Math.ceil(style.baseline * this.scaleY - 0.5) / this.scaleY
    ctx.font = this.font
    let narrow = Infinity
    let wide = 0
    this.wide = '0'
    for (const digit of DIGITS) {
      const advance = this.advance(digit)
      narrow = Math.min(narrow, advance)
      if (advance > wide + 0.01) {
        wide = advance
        this.wide = digit
      }
    }
    // The page sets the digits at one width and the canvas does not: each digit gets the page's room.
    if (style.digit !== null && wide - narrow > 0.01) this.cell = style.digit
    this.paint()
  }

  /** Shows `text`; the same text again draws nothing. */
  set(text: string) {
    if (text === this.text) return
    this.text = text
    this.paint()
  }

  /** The text on show. */
  get shown(): string {
    return this.text
  }

  private advance(char: string): number {
    let width = this.widths.get(char)
    if (width === undefined) {
      width = this.ctx!.measureText(char).width
      this.widths.set(char, width)
    }
    return width
  }

  private paint() {
    const ctx = this.ctx
    if (!ctx || !this.canvas.width || !this.canvas.height) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0)
    // Setting the size of a canvas clears its state, so the state is set with every drawing.
    ctx.font = this.font
    ctx.fillStyle = this.color
    ctx.textBaseline = 'alphabetic'
    if (!this.cell) {
      ctx.textAlign = 'left'
      ctx.fillText(this.text, 0, this.baseline)
      return
    }
    // Digits of different widths in a place where the page sets them at one: each in the middle of its room.
    ctx.textAlign = 'center'
    let x = 0
    for (let i = 0; i < this.text.length; i++) {
      const char = this.text[i]
      const room = DIGITS.includes(char) ? this.cell : this.advance(char)
      ctx.fillText(char, x + room / 2, this.baseline)
      x += room
    }
  }
}
